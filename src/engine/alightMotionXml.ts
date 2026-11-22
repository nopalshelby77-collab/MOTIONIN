import JSZip from 'jszip';
import type {LayerType, StudioLayer, StudioProject} from '../types/studio';
import {normalizeColor, toAlightMotionArgb} from './colorUtils';
import {
  transformAndNormalizePath,
  translateLocalPath,
} from './svgPathTransform';

function uid(prefix = 'am'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parseVec(val: string | null | undefined, fallback: number[]): number[] {
  if (!val) return fallback;
  const parts = val
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n))) {
    return fallback;
  }
  return parts;
}

function readPropertyValue(
  parent: Element,
  propName: string
): {value: string | null; hasKeyframes: boolean} {
  // Direct child tag e.g. <location value="..."/> or <property name="size" value="..."/>
  const direct = Array.from(parent.children).find(
    (c) =>
      c.tagName.toLowerCase() === propName.toLowerCase() ||
      (c.tagName.toLowerCase() === 'property' &&
        (c.getAttribute('name') || '').toLowerCase() === propName.toLowerCase())
  );

  if (direct) {
    const valAttr = direct.getAttribute('value');
    const kfs = direct.querySelectorAll('kf');
    if (kfs.length > 0) {
      const firstKfVal = kfs[0].getAttribute('v') || kfs[0].getAttribute('value');
      return {value: valAttr ?? firstKfVal ?? null, hasKeyframes: true};
    }
    if (valAttr !== null) {
      return {value: valAttr, hasKeyframes: false};
    }
    if (direct.textContent && direct.textContent.trim()) {
      return {value: direct.textContent.trim(), hasKeyframes: false};
    }
  }

  const attrVal = parent.getAttribute(propName);
  if (attrVal !== null) {
    return {value: attrVal, hasKeyframes: false};
  }

  return {value: null, hasKeyframes: false};
}

function presetToNormalizedPath(
  preset: string,
  w: number,
  h: number
): {pathData: string; type: LayerType} {
  const clean = preset.toLowerCase().replace(/^\./, '');
  if (clean === 'circle' || clean === 'oval' || clean === 'ellipse') {
    const rx = w / 2;
    const ry = h / 2;
    const kx = 0.5522847498 * rx;
    const ky = 0.5522847498 * ry;
    return {
      type: Math.abs(w - h) < 0.5 ? 'circle' : 'ellipse',
      pathData: [
        `M${rx} 0`,
        `C${rx + kx} 0 ${w} ${ry - ky} ${w} ${ry}`,
        `C${w} ${ry + ky} ${rx + kx} ${h} ${rx} ${h}`,
        `C${rx - kx} ${h} 0 ${ry + ky} 0 ${ry}`,
        `C0 ${ry - ky} ${rx - kx} 0 ${rx} 0`,
        'Z',
      ].join(' '),
    };
  }
  if (clean === 'triangle') {
    return {
      type: 'polygon',
      pathData: `M${w / 2} 0 L${w} ${h} L0 ${h} Z`,
    };
  }
  if (clean === 'star') {
    const cx = w / 2;
    const cy = h / 2;
    const outerR = Math.min(w, h) / 2;
    const innerR = outerR * 0.42;
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (Math.PI / 5) * i - Math.PI / 2;
      const px = cx + r * Math.cos(angle);
      const py = cy + r * Math.sin(angle);
      pts.push(`${i === 0 ? 'M' : 'L'}${px.toFixed(2)} ${py.toFixed(2)}`);
    }
    pts.push('Z');
    return {type: 'polygon', pathData: pts.join(' ')};
  }
  if (clean === 'polygon' || clean === 'pentagon' || clean === 'hexagon') {
    const sides = clean === 'pentagon' ? 5 : 6;
    const cx = w / 2;
    const cy = h / 2;
    const rx = w / 2;
    const ry = h / 2;
    const pts: string[] = [];
    for (let i = 0; i < sides; i++) {
      const angle = ((2 * Math.PI) / sides) * i - Math.PI / 2;
      pts.push(
        `${i === 0 ? 'M' : 'L'}${(cx + rx * Math.cos(angle)).toFixed(2)} ${(
          cy +
          ry * Math.sin(angle)
        ).toFixed(2)}`
      );
    }
    pts.push('Z');
    return {type: 'polygon', pathData: pts.join(' ')};
  }
  if (clean === 'roundrect') {
    const r = Math.min(w, h) * 0.16;
    return {
      type: 'rect',
      pathData: `M${r} 0 L${w - r} 0 Q${w} 0 ${w} ${r} L${w} ${h - r} Q${w} ${h} ${w - r} ${h} L${r} ${h} Q0 ${h} 0 ${h - r} L0 ${r} Q0 0 ${r} 0 Z`,
    };
  }
  return {
    type: 'rect',
    pathData: `M0 0 L${w} 0 L${w} ${h} L0 ${h} Z`,
  };
}

function parseTransformBlock(
  el: Element,
  sceneW: number,
  sceneH: number
): {
  cx: number;
  cy: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  hasKeyframes: boolean;
} {
  const tf = Array.from(el.children).find(
    (c) => c.tagName.toLowerCase() === 'transform'
  );
  const scope = tf || el;

  const loc = readPropertyValue(scope, 'location');
  const scaleProp = readPropertyValue(scope, 'scale');
  const rotProp = readPropertyValue(scope, 'rotation');
  const opProp = readPropertyValue(scope, 'opacity');

  const locVec = parseVec(loc.value, [sceneW / 2, sceneH / 2, 0]);
  const scaleVec = parseVec(scaleProp.value, [1, 1]);
  const rotVal = parseFloat(rotProp.value || '0');
  let opVal = parseFloat(opProp.value || '1');
  if (!Number.isFinite(opVal)) opVal = 1;
  if (opVal > 1 && opVal <= 100) opVal = opVal / 100;

  return {
    cx: locVec[0],
    cy: locVec[1],
    scaleX: Number.isFinite(scaleVec[0]) ? Math.abs(scaleVec[0]) || 1 : 1,
    scaleY: Number.isFinite(scaleVec[1] ?? scaleVec[0])
      ? Math.abs(scaleVec[1] ?? scaleVec[0]) || 1
      : 1,
    rotation: Number.isFinite(rotVal) ? rotVal : 0,
    opacity: Math.max(0, Math.min(1, opVal)),
    hasKeyframes:
      loc.hasKeyframes ||
      scaleProp.hasKeyframes ||
      rotProp.hasKeyframes ||
      opProp.hasKeyframes,
  };
}

function parseSceneLayers(
  sceneEl: Element,
  sceneW: number,
  sceneH: number,
  assetMap: Record<string, string>,
  warnings: string[]
): StudioLayer[] {
  const layers: StudioLayer[] = [];
  const counters: Record<string, number> = {};
  const nextNum = (key: string) => {
    counters[key] = (counters[key] || 0) + 1;
    return String(counters[key]).padStart(2, '0');
  };

  for (const child of Array.from(sceneEl.children)) {
    const tag = child.tagName.toLowerCase();
    if (
      tag === 'transform' ||
      tag === 'property' ||
      tag === 'effect' ||
      tag === 'bookmark' ||
      tag === 'settings'
    ) {
      continue;
    }

    const amId = child.getAttribute('id') || undefined;
    const labelAttr =
      child.getAttribute('label') || child.getAttribute('name') || '';
    const startTime = parseFloat(child.getAttribute('startTime') || '0') || 0;
    const endTime = parseFloat(child.getAttribute('endTime') || '5000') || 5000;
    const locked = child.getAttribute('locked') === 'true';
    const hidden = child.getAttribute('hidden') === 'true';
    const blending = child.getAttribute('blending') || undefined;
    const tf = parseTransformBlock(child, sceneW, sceneH);

    if (tag === 'shape' || tag === 'rect' || tag === 'circle' || tag === 'path') {
      const sizeProp = readPropertyValue(child, 'size');
      const sizeVec = parseVec(sizeProp.value, [
        parseFloat(child.getAttribute('width') || '160') || 160,
        parseFloat(child.getAttribute('height') || '160') || 160,
      ]);

      const rawFillType = (child.getAttribute('fillType') || 'color').toLowerCase();
      const fillProp = readPropertyValue(child, 'fillColor');
      const rawFill =
        fillProp.value ||
        child.getAttribute('fill') ||
        child.getAttribute('color') ||
        '#3B82F6';
      const parsedFill =
        rawFillType === 'none'
          ? {hex: 'none', alpha: 1}
          : normalizeColor(rawFill, '#3B82F6', true);

      const strokeColorProp = readPropertyValue(child, 'strokeColor');
      const strokeTag = Array.from(child.children).find(
        (c) => c.tagName.toLowerCase() === 'stroke'
      );
      const rawStroke =
        strokeColorProp.value ||
        strokeTag?.getAttribute('color') ||
        strokeTag?.querySelector('color')?.getAttribute('value') ||
        child.getAttribute('stroke') ||
        'none';
      const parsedStroke = normalizeColor(rawStroke, 'none', true);

      const strokeWProp = readPropertyValue(child, 'strokeWidth');
      const strokeWidth =
        parsedStroke.hex !== 'none'
          ? parseFloat(
              strokeWProp.value ||
                strokeTag?.getAttribute('size') ||
                child.getAttribute('strokeWidth') ||
                '2'
            ) || 2
          : 0;

      const pathProp = readPropertyValue(child, 'path');
      const pathDataNode = child.querySelector('pathData, path');
      const rawPathD =
        pathProp.value ||
        pathDataNode?.getAttribute('d') ||
        pathDataNode?.getAttribute('value') ||
        pathDataNode?.textContent?.trim() ||
        child.getAttribute('d') ||
        null;

      const preset = child.getAttribute('s') || (tag === 'shape' ? '.rect' : `.${tag}`);

      let finalWidth = Math.max(4, sizeVec[0] * tf.scaleX);
      let finalHeight = Math.max(4, (sizeVec[1] ?? sizeVec[0]) * tf.scaleY);
      let finalX = tf.cx - finalWidth / 2;
      let finalY = tf.cy - finalHeight / 2;
      let finalPath = '';
      let layerType: LayerType = 'shape';

      if (rawPathD && /[mMlLcCqQaA]/.test(rawPathD)) {
        const norm = transformAndNormalizePath(rawPathD, [
          tf.scaleX,
          0,
          0,
          tf.scaleY,
          0,
          0,
        ]);
        finalWidth = Math.max(4, norm.width);
        finalHeight = Math.max(4, norm.height);
        // If path came centered around (0,0) like AM custom paths, center aligns with (cx, cy)
        finalX = tf.cx - finalWidth / 2;
        finalY = tf.cy - finalHeight / 2;
        finalPath = norm.pathData;
        layerType = 'path';
      } else {
        const built = presetToNormalizedPath(preset, finalWidth, finalHeight);
        finalPath = built.pathData;
        layerType = built.type;
      }

      const name =
        labelAttr || `AM Shape ${nextNum('Shape')}`;

      layers.push({
        id: uid('amshp'),
        name,
        type: layerType,
        sourceTag: tag,
        isVector: true,
        visible: !hidden,
        locked,
        x: Math.round(finalX * 100) / 100,
        y: Math.round(finalY * 100) / 100,
        width: Math.round(finalWidth * 100) / 100,
        height: Math.round(finalHeight * 100) / 100,
        origWidth: Math.round(finalWidth * 100) / 100,
        origHeight: Math.round(finalHeight * 100) / 100,
        rotation: Math.round(tf.rotation * 100) / 100,
        opacity: Math.round(tf.opacity * parsedFill.alpha * 1000) / 1000,
        fill: parsedFill.hex,
        stroke: parsedStroke.hex,
        strokeWidth,
        pathData: finalPath,
        amMeta: {
          amId,
          startTime,
          endTime,
          shapePreset: preset,
          fillType: rawFillType,
          blending,
          hasKeyframes: tf.hasKeyframes,
        },
      });
      continue;
    }

    if (tag === 'text') {
      const contentNode = child.querySelector('content');
      const textContent =
        (contentNode?.textContent || child.getAttribute('text') || 'Text').trim();
      const fontSizeAttr =
        parseFloat(child.getAttribute('size') || readPropertyValue(child, 'size').value || '48') ||
        48;
      const fontSize = Math.max(8, fontSizeAttr * tf.scaleY);
      const fontFamily =
        child.getAttribute('font') || 'Plus Jakarta Sans';
      const alignRaw = (child.getAttribute('align') || 'center').toLowerCase();
      const textAlign: 'left' | 'center' | 'right' =
        alignRaw === 'left' || alignRaw === 'right' ? alignRaw : 'center';

      const colorProp = readPropertyValue(child, 'fillColor');
      const rawColor =
        colorProp.value ||
        child.getAttribute('color') ||
        readPropertyValue(child, 'color').value ||
        '#FFFFFF';
      const parsedColor = normalizeColor(rawColor, '#FFFFFF', true);

      const estW = Math.max(60, textContent.length * fontSize * 0.62);
      const estH = Math.max(24, fontSize * 1.25);

      layers.push({
        id: uid('amtxt'),
        name: labelAttr || `AM Text — ${textContent.slice(0, 18)}`,
        type: 'text',
        sourceTag: 'text',
        isVector: true,
        visible: !hidden,
        locked,
        x: Math.round((tf.cx - estW / 2) * 100) / 100,
        y: Math.round((tf.cy - estH / 2) * 100) / 100,
        width: Math.round(estW * 100) / 100,
        height: Math.round(estH * 100) / 100,
        origWidth: Math.round(estW * 100) / 100,
        origHeight: Math.round(estH * 100) / 100,
        rotation: Math.round(tf.rotation * 100) / 100,
        opacity: Math.round(tf.opacity * parsedColor.alpha * 1000) / 1000,
        fill: parsedColor.hex === 'none' ? '#FFFFFF' : parsedColor.hex,
        stroke: 'none',
        strokeWidth: 0,
        textContent,
        fontSize: Math.round(fontSize * 100) / 100,
        fontFamily,
        textAlign,
        amMeta: {
          amId,
          startTime,
          endTime,
          blending,
          hasKeyframes: tf.hasKeyframes,
        },
      });
      continue;
    }

    if (tag === 'media' || tag === 'image') {
      const sizeProp = readPropertyValue(child, 'size');
      const sizeVec = parseVec(sizeProp.value, [240, 240]);
      const w = Math.max(16, sizeVec[0] * tf.scaleX);
      const h = Math.max(16, (sizeVec[1] ?? sizeVec[0]) * tf.scaleY);
      const uri =
        child.getAttribute('uri') ||
        child.getAttribute('src') ||
        child.getAttribute('mediaUri') ||
        '';
      const resolvedDataUrl =
        assetMap[uri] ||
        assetMap[uri.split('/').pop() || ''] ||
        (uri.startsWith('data:image/') ? uri : undefined);

      layers.push({
        id: uid('amimg'),
        name: labelAttr || `AM Media ${nextNum('Media')}`,
        type: 'raster',
        sourceTag: tag,
        isVector: false,
        visible: !hidden,
        locked,
        x: Math.round((tf.cx - w / 2) * 100) / 100,
        y: Math.round((tf.cy - h / 2) * 100) / 100,
        width: Math.round(w * 100) / 100,
        height: Math.round(h * 100) / 100,
        origWidth: Math.round(w * 100) / 100,
        origHeight: Math.round(h * 100) / 100,
        rotation: Math.round(tf.rotation * 100) / 100,
        opacity: Math.round(tf.opacity * 1000) / 1000,
        fill: '#64748B',
        stroke: 'none',
        strokeWidth: 0,
        rasterDataUrl: resolvedDataUrl,
        amMeta: {
          amId,
          startTime,
          endTime,
          mediaUri: uri || 'embedded-media.png',
          blending,
          hasKeyframes: tf.hasKeyframes,
        },
      });
      continue;
    }

    if (tag === 'embedscene' || tag === 'group') {
      const nestedScene =
        Array.from(child.children).find(
          (c) => c.tagName.toLowerCase() === 'scene'
        ) || child;
      const nestedW =
        parseFloat(nestedScene.getAttribute('width') || String(sceneW)) || sceneW;
      const nestedH =
        parseFloat(nestedScene.getAttribute('height') || String(sceneH)) || sceneH;
      const childLayers = parseSceneLayers(
        nestedScene,
        nestedW,
        nestedH,
        assetMap,
        warnings
      );

      if (childLayers.length > 0) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const cl of childLayers) {
          minX = Math.min(minX, cl.x);
          minY = Math.min(minY, cl.y);
          maxX = Math.max(maxX, cl.x + cl.width);
          maxY = Math.max(maxY, cl.y + cl.height);
        }
        const gw = Math.max(16, maxX - minX);
        const gh = Math.max(16, maxY - minY);
        const relChildren = childLayers.map((cl) => ({
          ...cl,
          x: Math.round((cl.x - minX) * 100) / 100,
          y: Math.round((cl.y - minY) * 100) / 100,
        }));

        layers.push({
          id: uid('amgrp'),
          name: labelAttr || `AM Group ${nextNum('Group')}`,
          type: 'group',
          sourceTag: tag,
          isVector: true,
          visible: !hidden,
          locked,
          x: Math.round((tf.cx - sceneW / 2 + minX) * 100) / 100,
          y: Math.round((tf.cy - sceneH / 2 + minY) * 100) / 100,
          width: Math.round(gw * 100) / 100,
          height: Math.round(gh * 100) / 100,
          origWidth: Math.round(gw * 100) / 100,
          origHeight: Math.round(gh * 100) / 100,
          rotation: Math.round(tf.rotation * 100) / 100,
          opacity: Math.round(tf.opacity * 1000) / 1000,
          fill: relChildren[0]?.fill || '#3B82F6',
          stroke: 'none',
          strokeWidth: 0,
          children: relChildren,
          amMeta: {
            amId,
            startTime,
            endTime,
            blending,
            hasKeyframes: tf.hasKeyframes,
          },
        });
      }
      continue;
    }

    warnings.push(
      `Elemen <${child.tagName}> tidak memiliki representasi visual langsung di editor dan dilewati.`
    );
  }

  return layers;
}

export function parseAlightMotionXml(
  xmlString: string,
  fileName = 'Alight Motion Project',
  assetMap: Record<string, string> = {}
): StudioProject {
  const cleanXml = xmlString.replace(/^\uFEFF/, '').trim();
  const parser = new DOMParser();
  const doc = parser.parseFromString(cleanXml, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error(
      `Struktur XML tidak valid: ${parserError.textContent?.slice(0, 140) || 'Syntax Error'}`
    );
  }

  const root = doc.documentElement;
  if (!root) {
    throw new Error('Dokumen XML kosong.');
  }

  const rootTag = root.tagName.toLowerCase();
  let sceneEl: Element | null = null;

  if (rootTag === 'scene') {
    sceneEl = root;
  } else if (rootTag === 'alightmotion' || rootTag === 'project') {
    sceneEl = root.querySelector('scene');
  }

  if (!sceneEl) {
    throw new Error(
      `Format XML tidak dikenali sebagai project Alight Motion (root ditemukan: <${root.tagName}>). Pastikan file menggunakan struktur <scene> dari Alight Motion.`
    );
  }

  const title =
    sceneEl.getAttribute('title') ||
    fileName.replace(/\.[^.]+$/, '') ||
    'Alight Motion Project';
  const width = Math.max(
    64,
    parseFloat(
      sceneEl.getAttribute('width') ||
        sceneEl.getAttribute('exportWidth') ||
        '1080'
    ) || 1080
  );
  const height = Math.max(
    64,
    parseFloat(
      sceneEl.getAttribute('height') ||
        sceneEl.getAttribute('exportHeight') ||
        '1080'
    ) || 1080
  );
  const fps = parseFloat(sceneEl.getAttribute('fps') || '60') || 60;
  const totalTime = parseFloat(sceneEl.getAttribute('totalTime') || '5000') || 5000;
  const bgcolor = sceneEl.getAttribute('bgcolor') || '#00000000';

  const warnings: string[] = [];
  const layers = parseSceneLayers(sceneEl, width, height, assetMap, warnings);

  if (layers.length === 0) {
    warnings.push(
      'File XML Alight Motion terbaca, tetapi tidak ada layer <shape>, <text>, <media>, atau <embedScene> yang ditemukan.'
    );
  }

  return {
    title,
    width,
    height,
    fps,
    totalTime,
    bgcolor,
    sourceFormat: 'am-xml',
    originalXml: cleanXml,
    layers,
    warnings: Array.from(new Set(warnings)),
  };
}

export async function parseAmprojArchive(
  file: File
): Promise<StudioProject> {
  const zip = await JSZip.loadAsync(file);
  const xmlEntries: JSZip.JSZipObject[] = [];
  const assetMap: Record<string, string> = {};

  for (const [entryPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const lower = entryPath.toLowerCase();
    if (lower.endsWith('.xml')) {
      xmlEntries.push(entry);
    } else if (
      lower.endsWith('.png') ||
      lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.webp')
    ) {
      const base64 = await entry.async('base64');
      const mime = lower.endsWith('.png')
        ? 'image/png'
        : lower.endsWith('.webp')
          ? 'image/webp'
          : 'image/jpeg';
      const dataUrl = `data:${mime};base64,${base64}`;
      assetMap[entryPath] = dataUrl;
      assetMap[entryPath.split('/').pop() || entryPath] = dataUrl;
    }
  }

  if (xmlEntries.length === 0) {
    throw new Error(
      'Arsip .amproj tidak berisi file XML scene yang dapat dibaca.'
    );
  }

  // Prefer project.xml or scene.xml if present
  xmlEntries.sort((a, b) => {
    const aPref = /project|scene/i.test(a.name) ? 0 : 1;
    const bPref = /project|scene/i.test(b.name) ? 0 : 1;
    return aPref - bPref;
  });

  const xmlText = await xmlEntries[0].async('text');
  const project = parseAlightMotionXml(xmlText, file.name, assetMap);
  return {
    ...project,
    sourceFormat: 'amproj',
  };
}

function serializeLayerToAmXml(
  layer: StudioLayer,
  indent: string,
  index: number
): string {
  const pad = indent;
  const childPad = `${indent}  `;
  const deepPad = `${indent}    `;

  const cx = (layer.x + layer.width / 2).toFixed(2);
  const cy = (layer.y + layer.height / 2).toFixed(2);
  const startTime = layer.amMeta?.startTime ?? 0;
  const endTime = layer.amMeta?.endTime ?? 5000;
  const amId = layer.amMeta?.amId || `layer_${index + 1}_${layer.id.slice(-4)}`;
  const hiddenAttr = layer.visible ? 'false' : 'true';
  const lockedAttr = layer.locked ? 'true' : 'false';

  const transformXml = [
    `${childPad}<transform>`,
    `${deepPad}<location value="${cx},${cy},0.00" />`,
    `${deepPad}<pivot value="0.00,0.00" />`,
    `${deepPad}<rotation value="${layer.rotation.toFixed(2)}" />`,
    `${deepPad}<scale value="1.00,1.00" />`,
    `${deepPad}<opacity value="${layer.opacity.toFixed(3)}" />`,
    `${childPad}</transform>`,
  ].join('\n');

  if (layer.type === 'group' && layer.children && layer.children.length > 0) {
    const innerLayers = layer.children
      .map((ch, idx) => serializeLayerToAmXml(ch, `${indent}    `, idx))
      .join('\n');
    return [
      `${pad}<embedScene id="${escapeXml(amId)}" label="${escapeXml(layer.name)}" startTime="${startTime}" endTime="${endTime}" hidden="${hiddenAttr}" locked="${lockedAttr}">`,
      transformXml,
      `${childPad}<scene title="${escapeXml(layer.name)}" width="${Math.round(layer.width)}" height="${Math.round(layer.height)}" fps="60" totalTime="${endTime}" bgcolor="#00000000">`,
      innerLayers,
      `${childPad}</scene>`,
      `${pad}</embedScene>`,
    ].join('\n');
  }

  if (layer.type === 'text') {
    const colorHex = toAlightMotionArgb(layer.fill, 1);
    const fontSize = (layer.fontSize || 32).toFixed(2);
    return [
      `${pad}<text id="${escapeXml(amId)}" label="${escapeXml(layer.name)}" startTime="${startTime}" endTime="${endTime}" size="${fontSize}" font="${escapeXml(layer.fontFamily || 'Plus Jakarta Sans')}" align="${layer.textAlign || 'left'}" hidden="${hiddenAttr}" locked="${lockedAttr}">`,
      `${childPad}<content>${escapeXml(layer.textContent || layer.name)}</content>`,
      transformXml,
      `${childPad}<fillColor value="${colorHex}" />`,
      `${pad}</text>`,
    ].join('\n');
  }

  if (layer.type === 'raster') {
    const uri = layer.amMeta?.mediaUri || `${layer.name.replace(/\s+/g, '_')}.png`;
    return [
      `${pad}<media id="${escapeXml(amId)}" label="${escapeXml(layer.name)}" startTime="${startTime}" endTime="${endTime}" uri="${escapeXml(uri)}" fillType="media" hidden="${hiddenAttr}" locked="${lockedAttr}">`,
      transformXml,
      `${childPad}<property name="size" type="vec2" value="${layer.width.toFixed(2)},${layer.height.toFixed(2)}" />`,
      `${pad}</media>`,
    ].join('\n');
  }

  // Vector shape layer
  const fillType = layer.fill === 'none' ? 'none' : 'color';
  const fillHex = toAlightMotionArgb(layer.fill, 1);
  let shapePreset = '.custom';
  if (layer.type === 'rect') shapePreset = '.rect';
  if (layer.type === 'circle') shapePreset = '.circle';

  // Center pathData around (0, 0) in Alight Motion local shape space (-w/2..w/2, -h/2..h/2)
  const scaleX = layer.origWidth > 0 ? layer.width / layer.origWidth : 1;
  const scaleY = layer.origHeight > 0 ? layer.height / layer.origHeight : 1;
  const centeredPath = layer.pathData
    ? translateLocalPath(
        layer.pathData,
        -layer.width / 2,
        -layer.height / 2,
        scaleX,
        scaleY
      )
    : `M${(-layer.width / 2).toFixed(2)} ${(-layer.height / 2).toFixed(2)} L${(layer.width / 2).toFixed(2)} ${(-layer.height / 2).toFixed(2)} L${(layer.width / 2).toFixed(2)} ${(layer.height / 2).toFixed(2)} L${(-layer.width / 2).toFixed(2)} ${(layer.height / 2).toFixed(2)} Z`;

  const strokeLines: string[] = [];
  if (layer.stroke !== 'none' && layer.strokeWidth > 0) {
    strokeLines.push(
      `${childPad}<stroke color="${toAlightMotionArgb(layer.stroke, 1)}" size="${layer.strokeWidth.toFixed(2)}" />`
    );
  }

  return [
    `${pad}<shape id="${escapeXml(amId)}" label="${escapeXml(layer.name)}" startTime="${startTime}" endTime="${endTime}" s="${shapePreset}" fillType="${fillType}" hidden="${hiddenAttr}" locked="${lockedAttr}">`,
    transformXml,
    `${childPad}<property name="size" type="vec2" value="${layer.width.toFixed(2)},${layer.height.toFixed(2)}" />`,
    `${childPad}<property name="path" type="path" value="${escapeXml(centeredPath)}" />`,
    `${childPad}<fillColor value="${fillHex}" />`,
    ...strokeLines,
    `${pad}</shape>`,
  ].join('\n');
}

export function exportAlightMotionXml(project: StudioProject): string {
  const layerXml = project.layers
    .map((layer, index) => serializeLayerToAmXml(layer, '  ', index))
    .join('\n');

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<scene title="${escapeXml(project.title)}" width="${Math.round(project.width)}" height="${Math.round(project.height)}" exportWidth="${Math.round(project.width)}" exportHeight="${Math.round(project.height)}" fps="${Math.round(project.fps)}" totalTime="${Math.round(project.totalTime)}" bgcolor="${escapeXml(project.bgcolor || '#00000000')}" amver="4020000">`,
    layerXml,
    '</scene>',
    '',
  ].join('\n');
}

function serializeLayerToSvg(layer: StudioLayer, indent = '  '): string {
  if (!layer.visible) return '';
  const cx = (layer.width / 2).toFixed(2);
  const cy = (layer.height / 2).toFixed(2);
  const tf = `translate(${layer.x.toFixed(2)}, ${layer.y.toFixed(2)}) rotate(${layer.rotation.toFixed(2)}, ${cx}, ${cy})`;

  if (layer.type === 'group' && layer.children) {
    const sx = layer.origWidth > 0 ? layer.width / layer.origWidth : 1;
    const sy = layer.origHeight > 0 ? layer.height / layer.origHeight : 1;
    const inner = layer.children
      .map((ch) => serializeLayerToSvg(ch, `${indent}  `))
      .filter(Boolean)
      .join('\n');
    return `${indent}<g id="${escapeXml(layer.name)}" transform="${tf} scale(${sx.toFixed(4)}, ${sy.toFixed(4)})" opacity="${layer.opacity.toFixed(3)}">\n${inner}\n${indent}</g>`;
  }

  if (layer.type === 'text') {
    const fs = layer.fontSize || 24;
    return `${indent}<text id="${escapeXml(layer.name)}" x="${layer.x.toFixed(2)}" y="${(layer.y + fs * 0.85).toFixed(2)}" font-family="${escapeXml(layer.fontFamily || 'Plus Jakarta Sans')}" font-size="${fs.toFixed(2)}" fill="${escapeXml(layer.fill)}" opacity="${layer.opacity.toFixed(3)}" transform="rotate(${layer.rotation.toFixed(2)}, ${(layer.x + layer.width / 2).toFixed(2)}, ${(layer.y + layer.height / 2).toFixed(2)})">${escapeXml(layer.textContent || '')}</text>`;
  }

  if (layer.type === 'raster' && layer.rasterDataUrl) {
    return `${indent}<image id="${escapeXml(layer.name)}" href="${layer.rasterDataUrl}" x="0" y="0" width="${layer.width.toFixed(2)}" height="${layer.height.toFixed(2)}" opacity="${layer.opacity.toFixed(3)}" transform="${tf}" />`;
  }

  const sx = layer.origWidth > 0 ? layer.width / layer.origWidth : 1;
  const sy = layer.origHeight > 0 ? layer.height / layer.origHeight : 1;
  return `${indent}<path id="${escapeXml(layer.name)}" d="${escapeXml(layer.pathData || '')}" fill="${escapeXml(layer.fill)}" stroke="${escapeXml(layer.stroke)}" stroke-width="${layer.strokeWidth.toFixed(2)}" opacity="${layer.opacity.toFixed(3)}" transform="${tf} scale(${sx.toFixed(4)}, ${sy.toFixed(4)})" />`;
}

export function exportProjectAsSvg(project: StudioProject): string {
  const body = project.layers
    .map((l) => serializeLayerToSvg(l, '  '))
    .filter(Boolean)
    .join('\n');

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(project.width)} ${Math.round(project.height)}" width="${Math.round(project.width)}" height="${Math.round(project.height)}">`,
    body,
    '</svg>',
    '',
  ].join('\n');
}
