import type {
  LayerType,
  SeparationMode,
  StudioLayer,
  StudioProject,
} from '../types/studio';
import {normalizeColor} from './colorUtils';
import {
  type Matrix2D,
  primitiveToSvgPath,
  transformAndNormalizePath,
} from './svgPathTransform';

const SHAPE_TAGS = new Set([
  'path',
  'rect',
  'circle',
  'ellipse',
  'polygon',
  'polyline',
  'line',
]);

const SKIP_TAGS = new Set([
  'defs',
  'style',
  'title',
  'desc',
  'metadata',
  'clippath',
  'mask',
  'lineargradient',
  'radialgradient',
  'pattern',
  'filter',
  'symbol',
  'script',
]);

function uid(prefix = 'layer'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function sanitizeSvgDoc(doc: Document): void {
  doc.querySelectorAll('script, foreignObject').forEach((node) => node.remove());
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.toLowerCase().startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    }
  });
}

function cleanLabelName(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  const cleaned = raw
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || /^(path|rect|circle|g|layer|svg)\d+$/i.test(cleaned)) {
    return fallback;
  }
  return cleaned.slice(0, 40);
}

function mapTagToLayerType(tag: string): LayerType {
  switch (tag) {
    case 'rect':
      return 'rect';
    case 'circle':
      return 'circle';
    case 'ellipse':
      return 'ellipse';
    case 'polygon':
    case 'polyline':
      return 'polygon';
    case 'text':
      return 'text';
    case 'g':
      return 'group';
    default:
      return 'path';
  }
}

function getRelativeMatrix(el: SVGGraphicsElement, rootSvg: SVGSVGElement): Matrix2D {
  try {
    const elCtm = el.getCTM();
    const rootCtm = rootSvg.getCTM();
    if (elCtm && rootCtm) {
      const m = rootCtm.inverse().multiply(elCtm);
      return [m.a, m.b, m.c, m.d, m.e, m.f];
    }
    if (elCtm) {
      return [elCtm.a, elCtm.b, elCtm.c, elCtm.d, elCtm.e, elCtm.f];
    }
  } catch {
    // Fallback to identity
  }
  return [1, 0, 0, 1, 0, 0];
}

function resolveStyle(el: Element, inheritedOpacity: number) {
  const computed = window.getComputedStyle(el);
  const rawFill = el.getAttribute('fill') ?? computed.fill ?? '#000000';
  const rawStroke = el.getAttribute('stroke') ?? computed.stroke ?? 'none';

  const fillParsed = normalizeColor(rawFill, '#000000');
  const strokeParsed = normalizeColor(rawStroke, 'none');

  const attrOpacity = parseFloat(el.getAttribute('opacity') || computed.opacity || '1');
  const fillOpacity = parseFloat(
    el.getAttribute('fill-opacity') || computed.fillOpacity || '1'
  );
  const strokeOpacity = parseFloat(
    el.getAttribute('stroke-opacity') || computed.strokeOpacity || '1'
  );

  const localOpacity = Number.isFinite(attrOpacity) ? attrOpacity : 1;
  const fOp = Number.isFinite(fillOpacity) ? fillOpacity : 1;
  const sOp = Number.isFinite(strokeOpacity) ? strokeOpacity : 1;

  const combinedOpacity = Math.max(
    0,
    Math.min(1, inheritedOpacity * localOpacity * (fillParsed.hex !== 'none' ? fOp * fillParsed.alpha : sOp * strokeParsed.alpha))
  );

  const strokeWidthRaw = parseFloat(
    el.getAttribute('stroke-width') || computed.strokeWidth || '0'
  );
  const strokeWidth =
    strokeParsed.hex !== 'none' && Number.isFinite(strokeWidthRaw)
      ? Math.max(0, strokeWidthRaw)
      : 0;

  const display = computed.display === 'none' || computed.visibility === 'hidden';

  return {
    fill: fillParsed.hex,
    stroke: strokeParsed.hex,
    strokeWidth,
    opacity: combinedOpacity,
    hidden: display,
  };
}

export function separateSvgToProject(
  svgString: string,
  fileName = 'Vector Logo',
  mode: SeparationMode = 'deep'
): StudioProject {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('File SVG tidak valid atau korup (XML parser error).');
  }

  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== 'svg') {
    throw new Error('Dokumen tidak memiliki elemen root <svg> yang valid.');
  }

  sanitizeSvgDoc(doc);

  // Determine viewBox / canvas size
  const vbAttr = root.getAttribute('viewBox');
  let vbX = 0;
  let vbY = 0;
  let vbW = 0;
  let vbH = 0;
  if (vbAttr) {
    const nums = vbAttr.trim().split(/[\s,]+/).map(Number);
    if (nums.length === 4 && nums.every(Number.isFinite)) {
      [vbX, vbY, vbW, vbH] = nums;
    }
  }

  const attrW = parseFloat(root.getAttribute('width') || '0');
  const attrH = parseFloat(root.getAttribute('height') || '0');
  let canvasW = vbW > 0 ? vbW : attrW > 0 ? attrW : 512;
  let canvasH = vbH > 0 ? vbH : attrH > 0 ? attrH : 512;

  // Mount hidden SVG offscreen so browser computes CTM, getBBox, and CSS styles accurately
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top = '-99999px';
  container.style.width = `${canvasW}px`;
  container.style.height = `${canvasH}px`;
  container.style.visibility = 'hidden';
  container.style.pointerEvents = 'none';

  const mountedSvg = document.importNode(root, true) as unknown as SVGSVGElement;
  mountedSvg.setAttribute('width', String(canvasW));
  mountedSvg.setAttribute('height', String(canvasH));
  if (!mountedSvg.getAttribute('viewBox')) {
    mountedSvg.setAttribute('viewBox', `${vbX} ${vbY} ${canvasW} ${canvasH}`);
  }
  container.appendChild(mountedSvg);
  document.body.appendChild(container);

  const warnings: string[] = [];
  const counters: Record<string, number> = {};
  const nextIndex = (label: string) => {
    counters[label] = (counters[label] || 0) + 1;
    return String(counters[label]).padStart(2, '0');
  };

  try {
    // Expand <use> tags gently if no viewBox fallback needed
    if (vbW <= 0 && attrW <= 0) {
      try {
        const bbox = mountedSvg.getBBox();
        if (bbox.width > 0 && bbox.height > 0) {
          vbX = bbox.x;
          vbY = bbox.y;
          canvasW = Math.ceil(bbox.width);
          canvasH = Math.ceil(bbox.height);
          mountedSvg.setAttribute('viewBox', `${vbX} ${vbY} ${canvasW} ${canvasH}`);
        }
      } catch {
        // Keep defaults
      }
    }

    const extractNode = (
      el: Element,
      inheritedOpacity: number
    ): StudioLayer[] => {
      const tag = el.tagName.toLowerCase();
      if (SKIP_TAGS.has(tag)) return [];

      // Handle <use> referencing #id
      if (tag === 'use') {
        const href =
          el.getAttribute('href') || el.getAttribute('xlink:href') || '';
        if (href.startsWith('#')) {
          const target = mountedSvg.querySelector(
            `#${CSS.escape(href.slice(1))}`
          );
          if (target) {
            const clone = target.cloneNode(true) as Element;
            const ux = el.getAttribute('x') || '0';
            const uy = el.getAttribute('y') || '0';
            const existingTf = el.getAttribute('transform') || '';
            clone.setAttribute(
              'transform',
              `${existingTf} translate(${ux},${uy}) ${clone.getAttribute('transform') || ''}`.trim()
            );
            el.parentElement?.insertBefore(clone, el);
            const extracted = extractNode(clone, inheritedOpacity);
            clone.remove();
            return extracted;
          }
        }
        return [];
      }

      const style = resolveStyle(el, inheritedOpacity);

      if (tag === 'g') {
        const gOpacity = parseFloat(
          el.getAttribute('opacity') || window.getComputedStyle(el).opacity || '1'
        );
        const nextOpacity =
          inheritedOpacity * (Number.isFinite(gOpacity) ? gOpacity : 1);
        const childLayers: StudioLayer[] = [];
        for (const child of Array.from(el.children)) {
          childLayers.push(...extractNode(child, nextOpacity));
        }

        if (childLayers.length === 0) return [];
        if (mode === 'deep') {
          return childLayers;
        }

        // Group mode: wrap children inside a StudioLayer group
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const ch of childLayers) {
          minX = Math.min(minX, ch.x);
          minY = Math.min(minY, ch.y);
          maxX = Math.max(maxX, ch.x + ch.width);
          maxY = Math.max(maxY, ch.y + ch.height);
        }

        const gw = Math.max(1, maxX - minX);
        const gh = Math.max(1, maxY - minY);
        const relChildren = childLayers.map((ch) => ({
          ...ch,
          x: ch.x - minX,
          y: ch.y - minY,
        }));

        const groupLabel = cleanLabelName(
          el.getAttribute('id') || el.getAttribute('inkscape:label') || el.getAttribute('data-name'),
          `Group ${nextIndex('Group')}`
        );

        return [
          {
            id: uid('grp'),
            name: groupLabel,
            type: 'group',
            sourceTag: 'g',
            isVector: true,
            visible: !style.hidden,
            locked: false,
            x: Math.round(minX * 100) / 100,
            y: Math.round(minY * 100) / 100,
            width: Math.round(gw * 100) / 100,
            height: Math.round(gh * 100) / 100,
            origWidth: Math.round(gw * 100) / 100,
            origHeight: Math.round(gh * 100) / 100,
            rotation: 0,
            opacity: 1,
            fill: childLayers[0]?.fill || '#3B82F6',
            stroke: 'none',
            strokeWidth: 0,
            children: relChildren,
          },
        ];
      }

      if (tag === 'text') {
        const textContent = (el.textContent || '').trim();
        if (!textContent) return [];
        const gfx = el as unknown as SVGGraphicsElement;
        let bbox = {x: 0, y: 0, width: 100, height: 32};
        try {
          bbox = gfx.getBBox();
        } catch {
          // fallback
        }
        const matrix = getRelativeMatrix(gfx, mountedSvg);
        const tx = matrix[0] * bbox.x + matrix[2] * bbox.y + matrix[4] - vbX;
        const ty = matrix[1] * bbox.x + matrix[3] * bbox.y + matrix[5] - vbY;
        const scaleX = Math.hypot(matrix[0], matrix[1]) || 1;
        const scaleY = Math.hypot(matrix[2], matrix[3]) || 1;
        const computed = window.getComputedStyle(el);
        const fontSize =
          (parseFloat(el.getAttribute('font-size') || computed.fontSize || '24') || 24) *
          scaleY;
        const fontFamily =
          (el.getAttribute('font-family') || computed.fontFamily || 'Plus Jakarta Sans')
            .replace(/['"]/g, '')
            .split(',')[0]
            .trim() || 'Plus Jakarta Sans';

        const defaultName = `Text — ${textContent.slice(0, 18)}`;
        const name = cleanLabelName(
          el.getAttribute('id') || el.getAttribute('data-name'),
          defaultName
        );

        const w = Math.max(8, bbox.width * scaleX);
        const h = Math.max(8, bbox.height * scaleY);

        return [
          {
            id: uid('txt'),
            name,
            type: 'text',
            sourceTag: 'text',
            isVector: true,
            visible: !style.hidden,
            locked: false,
            x: Math.round(tx * 100) / 100,
            y: Math.round(ty * 100) / 100,
            width: Math.round(w * 100) / 100,
            height: Math.round(h * 100) / 100,
            origWidth: Math.round(w * 100) / 100,
            origHeight: Math.round(h * 100) / 100,
            rotation: 0,
            opacity: Math.round(style.opacity * 1000) / 1000,
            fill: style.fill === 'none' ? '#FFFFFF' : style.fill,
            stroke: style.stroke,
            strokeWidth: style.strokeWidth,
            textContent,
            fontSize: Math.round(fontSize * 100) / 100,
            fontFamily,
            textAlign: 'left',
          },
        ];
      }

      if (SHAPE_TAGS.has(tag)) {
        const rawPath = primitiveToSvgPath(el);
        if (!rawPath) return [];
        if (style.fill === 'none' && (style.stroke === 'none' || style.strokeWidth <= 0)) {
          return [];
        }

        const gfx = el as unknown as SVGGraphicsElement;
        const matrix = getRelativeMatrix(gfx, mountedSvg);
        // Shift by -vbX, -vbY to align with 0,0 canvas origin
        const shiftedMatrix: Matrix2D = [
          matrix[0],
          matrix[1],
          matrix[2],
          matrix[3],
          matrix[4] - vbX,
          matrix[5] - vbY,
        ];

        const normalized = transformAndNormalizePath(rawPath, shiftedMatrix);
        const scaleApprox = Math.max(
          Math.hypot(matrix[0], matrix[1]),
          Math.hypot(matrix[2], matrix[3]),
          1
        );

        const layerType = mapTagToLayerType(tag);
        const typeLabelMap: Record<string, string> = {
          path: 'Path',
          rect: 'Rectangle',
          circle: 'Circle',
          ellipse: 'Ellipse',
          polygon: 'Polygon',
        };
        const typeTitle = typeLabelMap[layerType] || 'Vector';
        const fallbackName = `${typeTitle} ${nextIndex(typeTitle)}`;
        const name = cleanLabelName(
          el.getAttribute('id') || el.getAttribute('data-name'),
          fallbackName
        );

        return [
          {
            id: uid('vec'),
            name,
            type: layerType,
            sourceTag: tag,
            isVector: true,
            visible: !style.hidden,
            locked: false,
            x: Math.round(normalized.x * 100) / 100,
            y: Math.round(normalized.y * 100) / 100,
            width: Math.round(normalized.width * 100) / 100,
            height: Math.round(normalized.height * 100) / 100,
            origWidth: Math.round(normalized.width * 100) / 100,
            origHeight: Math.round(normalized.height * 100) / 100,
            rotation: 0,
            opacity: Math.round(style.opacity * 1000) / 1000,
            fill: style.fill,
            stroke: style.stroke,
            strokeWidth: Math.round(style.strokeWidth * scaleApprox * 100) / 100,
            pathData: normalized.pathData,
          },
        ];
      }

      return [];
    };

    const layers: StudioLayer[] = [];
    for (const child of Array.from(mountedSvg.children)) {
      layers.push(...extractNode(child, 1));
    }

    if (layers.length === 0) {
      warnings.push(
        'Tidak ditemukan objek vector yang terlihat di dalam SVG. Pastikan SVG memiliki elemen path, circle, rect, polygon, atau text.'
      );
    }

    const baseTitle = fileName.replace(/\.[^.]+$/, '') || 'Vector Logo';

    return {
      title: baseTitle,
      width: Math.max(64, Math.round(canvasW)),
      height: Math.max(64, Math.round(canvasH)),
      fps: 60,
      totalTime: 5000,
      bgcolor: '#00000000',
      sourceFormat: 'svg',
      originalSvg: svgString,
      layers,
      warnings,
    };
  } finally {
    container.remove();
  }
}
