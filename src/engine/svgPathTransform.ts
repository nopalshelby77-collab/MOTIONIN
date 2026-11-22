export type Matrix2D = [number, number, number, number, number, number];

interface CubicSegment {
  type: 'M' | 'L' | 'C' | 'Q' | 'Z';
  nums: number[];
}

function tokenizeSvgPath(d: string): string[] {
  const tokens: string[] = [];
  const regex = /([a-zA-Z])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(d)) !== null) {
    tokens.push(match[0]);
  }
  return tokens;
}

function isCommandToken(token: string): boolean {
  return /^[a-zA-Z]$/.test(token);
}

// Converts an SVG elliptical arc (x1,y1 -> x2,y2) to cubic Bezier curves
function arcToCubicBeziers(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  phiDeg: number,
  largeArcFlag: number,
  sweepFlag: number,
  x2: number,
  y2: number
): number[][] {
  if (x1 === x2 && y1 === y2) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) {
    return [[x2, y2]];
  }

  const phi = (phiDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  const rxSq = rx * rx;
  const rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;

  const lambda = x1pSq / rxSq + y1pSq / rySq;
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }

  const rx2 = rx * rx;
  const ry2 = ry * ry;
  let num = rx2 * ry2 - rx2 * y1pSq - ry2 * x1pSq;
  if (num < 0) num = 0;
  const den = rx2 * y1pSq + ry2 * x1pSq;
  const factor = den === 0 ? 0 : Math.sqrt(num / den) * (largeArcFlag === sweepFlag ? -1 : 1);

  const cxp = (factor * rx * y1p) / ry;
  const cyp = (factor * -ry * x1p) / rx;

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const vecAngle = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
    let ratio = len === 0 ? 1 : dot / len;
    ratio = Math.max(-1, Math.min(1, ratio));
    const sign = ux * vy - uy * vx < 0 ? -1 : 1;
    return sign * Math.acos(ratio);
  };

  const ux = (x1p - cxp) / rx;
  const uy = (y1p - cyp) / ry;
  const vx = (-x1p - cxp) / rx;
  const vy = (-y1p - cyp) / ry;

  const theta1 = vecAngle(1, 0, ux, uy);
  let dTheta = vecAngle(ux, uy, vx, vy);
  if (sweepFlag === 0 && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweepFlag === 1 && dTheta < 0) dTheta += 2 * Math.PI;

  const segments = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const delta = dTheta / segments;
  const curves: number[][] = [];

  for (let i = 0; i < segments; i++) {
    const t1 = theta1 + i * delta;
    const t2 = theta1 + (i + 1) * delta;
    const alpha = (4 / 3) * Math.tan((t2 - t1) / 4);

    const cosT1 = Math.cos(t1);
    const sinT1 = Math.sin(t1);
    const cosT2 = Math.cos(t2);
    const sinT2 = Math.sin(t2);

    const ep1x = cosT1 - alpha * sinT1;
    const ep1y = sinT1 + alpha * cosT1;
    const ep2x = cosT2 + alpha * sinT2;
    const ep2y = sinT2 - alpha * cosT2;

    const mapPt = (px: number, py: number): [number, number] => [
      cx + cosPhi * rx * px - sinPhi * ry * py,
      cy + sinPhi * rx * px + cosPhi * ry * py,
    ];

    const [c1x, c1y] = mapPt(ep1x, ep1y);
    const [c2x, c2y] = mapPt(ep2x, ep2y);
    const [ex, ey] = i === segments - 1 ? [x2, y2] : mapPt(cosT2, sinT2);
    curves.push([c1x, c1y, c2x, c2y, ex, ey]);
  }

  return curves;
}

// Parses SVG path `d` into normalized absolute M, L, C, Q, Z segments
export function parseSvgPathToAbsolute(d: string): CubicSegment[] {
  const tokens = tokenizeSvgPath(d);
  const result: CubicSegment[] = [];
  let idx = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let lastControlX = 0;
  let lastControlY = 0;
  let lastCmd = '';

  const nextNum = (): number => {
    if (idx >= tokens.length || isCommandToken(tokens[idx])) return 0;
    return parseFloat(tokens[idx++]);
  };

  // Special handling for packed arc flags like "01"
  const readArcFlag = (): number => {
    if (idx >= tokens.length || isCommandToken(tokens[idx])) return 0;
    const tok = tokens[idx];
    if (tok.length > 1 && (tok[0] === '0' || tok[0] === '1')) {
      const flag = Number(tok[0]);
      tokens[idx] = tok.slice(1);
      return flag;
    }
    idx++;
    return Number(tok) ? 1 : 0;
  };

  while (idx < tokens.length) {
    if (isCommandToken(tokens[idx])) {
      cmd = tokens[idx++];
    } else if (!cmd) {
      break;
    }

    if (cmd === 'Z' || cmd === 'z') {
      result.push({type: 'Z', nums: []});
      cx = sx;
      cy = sy;
      lastCmd = cmd;
      continue;
    }

    if (cmd === 'M' || cmd === 'm') {
      let first = true;
      while (idx < tokens.length && !isCommandToken(tokens[idx])) {
        const nx = nextNum() + (cmd === 'm' ? cx : 0);
        const ny = nextNum() + (cmd === 'm' ? cy : 0);
        cx = nx;
        cy = ny;
        if (first) {
          sx = cx;
          sy = cy;
          result.push({type: 'M', nums: [cx, cy]});
          first = false;
        } else {
          result.push({type: 'L', nums: [cx, cy]});
        }
        lastCmd = first ? cmd : cmd === 'm' ? 'l' : 'L';
      }
      continue;
    }

    while (idx < tokens.length && !isCommandToken(tokens[idx])) {
      const isRel = cmd === cmd.toLowerCase();
      const upper = cmd.toUpperCase();

      if (upper === 'L') {
        const nx = nextNum() + (isRel ? cx : 0);
        const ny = nextNum() + (isRel ? cy : 0);
        cx = nx;
        cy = ny;
        result.push({type: 'L', nums: [cx, cy]});
      } else if (upper === 'H') {
        const nx = nextNum() + (isRel ? cx : 0);
        cx = nx;
        result.push({type: 'L', nums: [cx, cy]});
      } else if (upper === 'V') {
        const ny = nextNum() + (isRel ? cy : 0);
        cy = ny;
        result.push({type: 'L', nums: [cx, cy]});
      } else if (upper === 'C') {
        const x1 = nextNum() + (isRel ? cx : 0);
        const y1 = nextNum() + (isRel ? cy : 0);
        const x2 = nextNum() + (isRel ? cx : 0);
        const y2 = nextNum() + (isRel ? cy : 0);
        const x = nextNum() + (isRel ? cx : 0);
        const y = nextNum() + (isRel ? cy : 0);
        result.push({type: 'C', nums: [x1, y1, x2, y2, x, y]});
        lastControlX = x2;
        lastControlY = y2;
        cx = x;
        cy = y;
      } else if (upper === 'S') {
        const prevUpper = lastCmd.toUpperCase();
        const x1 =
          prevUpper === 'C' || prevUpper === 'S' ? 2 * cx - lastControlX : cx;
        const y1 =
          prevUpper === 'C' || prevUpper === 'S' ? 2 * cy - lastControlY : cy;
        const x2 = nextNum() + (isRel ? cx : 0);
        const y2 = nextNum() + (isRel ? cy : 0);
        const x = nextNum() + (isRel ? cx : 0);
        const y = nextNum() + (isRel ? cy : 0);
        result.push({type: 'C', nums: [x1, y1, x2, y2, x, y]});
        lastControlX = x2;
        lastControlY = y2;
        cx = x;
        cy = y;
      } else if (upper === 'Q') {
        const x1 = nextNum() + (isRel ? cx : 0);
        const y1 = nextNum() + (isRel ? cy : 0);
        const x = nextNum() + (isRel ? cx : 0);
        const y = nextNum() + (isRel ? cy : 0);
        result.push({type: 'Q', nums: [x1, y1, x, y]});
        lastControlX = x1;
        lastControlY = y1;
        cx = x;
        cy = y;
      } else if (upper === 'T') {
        const prevUpper = lastCmd.toUpperCase();
        const x1 =
          prevUpper === 'Q' || prevUpper === 'T' ? 2 * cx - lastControlX : cx;
        const y1 =
          prevUpper === 'Q' || prevUpper === 'T' ? 2 * cy - lastControlY : cy;
        const x = nextNum() + (isRel ? cx : 0);
        const y = nextNum() + (isRel ? cy : 0);
        result.push({type: 'Q', nums: [x1, y1, x, y]});
        lastControlX = x1;
        lastControlY = y1;
        cx = x;
        cy = y;
      } else if (upper === 'A') {
        const rx = nextNum();
        const ry = nextNum();
        const rot = nextNum();
        const largeArc = readArcFlag();
        const sweep = readArcFlag();
        const x = nextNum() + (isRel ? cx : 0);
        const y = nextNum() + (isRel ? cy : 0);
        const curves = arcToCubicBeziers(cx, cy, rx, ry, rot, largeArc, sweep, x, y);
        for (const c of curves) {
          if (c.length === 2) {
            result.push({type: 'L', nums: [c[0], c[1]]});
          } else {
            result.push({type: 'C', nums: c});
          }
        }
        cx = x;
        cy = y;
      } else {
        idx++;
      }

      lastCmd = cmd;
    }
  }

  return result;
}

function applyMatrix(m: Matrix2D, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function roundCoord(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return Number.isFinite(r) ? String(r) : '0';
}

export function serializeSegments(segments: CubicSegment[]): string {
  return segments
    .map((seg) => {
      if (seg.type === 'Z') return 'Z';
      return `${seg.type}${seg.nums.map(roundCoord).join(' ')}`;
    })
    .join(' ');
}

export function transformAndNormalizePath(
  d: string,
  matrix: Matrix2D
): {
  pathData: string;
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const segments = parseSvgPathToAbsolute(d);
  const transformed: CubicSegment[] = segments.map((seg) => {
    if (seg.type === 'Z') return {type: 'Z', nums: []};
    const pts: number[] = [];
    for (let i = 0; i < seg.nums.length; i += 2) {
      const [tx, ty] = applyMatrix(matrix, seg.nums[i], seg.nums[i + 1]);
      pts.push(tx, ty);
    }
    return {type: seg.type, nums: pts};
  });

  // Compute tight bounding box by sampling curves
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const includePt = (px: number, py: number) => {
    if (!Number.isFinite(px) || !Number.isFinite(py)) return;
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  };

  let curX = 0;
  let curY = 0;
  let startX = 0;
  let startY = 0;

  for (const seg of transformed) {
    if (seg.type === 'M') {
      curX = seg.nums[0];
      curY = seg.nums[1];
      startX = curX;
      startY = curY;
      includePt(curX, curY);
    } else if (seg.type === 'L') {
      curX = seg.nums[0];
      curY = seg.nums[1];
      includePt(curX, curY);
    } else if (seg.type === 'C') {
      const [x1, y1, x2, y2, x3, y3] = seg.nums;
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const mt = 1 - t;
        const bx =
          mt * mt * mt * curX +
          3 * mt * mt * t * x1 +
          3 * mt * t * t * x2 +
          t * t * t * x3;
        const by =
          mt * mt * mt * curY +
          3 * mt * mt * t * y1 +
          3 * mt * t * t * y2 +
          t * t * t * y3;
        includePt(bx, by);
      }
      curX = x3;
      curY = y3;
    } else if (seg.type === 'Q') {
      const [x1, y1, x2, y2] = seg.nums;
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const mt = 1 - t;
        const bx = mt * mt * curX + 2 * mt * t * x1 + t * t * x2;
        const by = mt * mt * curY + 2 * mt * t * y1 + t * t * y2;
        includePt(bx, by);
      }
      curX = x2;
      curY = y2;
    } else if (seg.type === 'Z') {
      curX = startX;
      curY = startY;
    }
  }

  if (!Number.isFinite(minX)) {
    return {pathData: d, x: 0, y: 0, width: 100, height: 100};
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);

  const normalized = transformed.map((seg) => {
    if (seg.type === 'Z') return seg;
    const shifted: number[] = [];
    for (let i = 0; i < seg.nums.length; i += 2) {
      shifted.push(seg.nums[i] - minX, seg.nums[i + 1] - minY);
    }
    return {type: seg.type, nums: shifted};
  });

  return {
    pathData: serializeSegments(normalized),
    x: minX,
    y: minY,
    width,
    height,
  };
}

export function translateLocalPath(
  d: string,
  dx: number,
  dy: number,
  scaleX = 1,
  scaleY = 1
): string {
  const segments = parseSvgPathToAbsolute(d);
  const mapped = segments.map((seg) => {
    if (seg.type === 'Z') return seg;
    const nums: number[] = [];
    for (let i = 0; i < seg.nums.length; i += 2) {
      nums.push(seg.nums[i] * scaleX + dx, seg.nums[i + 1] * scaleY + dy);
    }
    return {type: seg.type, nums};
  });
  return serializeSegments(mapped);
}

export function primitiveToSvgPath(el: Element): string | null {
  const tag = el.tagName.toLowerCase();
  const num = (attr: string, fallback = 0) => {
    const val = el.getAttribute(attr);
    if (!val) return fallback;
    const parsed = parseFloat(val);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  if (tag === 'path') {
    return el.getAttribute('d') || null;
  }

  if (tag === 'rect') {
    const x = num('x', 0);
    const y = num('y', 0);
    const w = num('width', 0);
    const h = num('height', 0);
    if (w <= 0 || h <= 0) return null;
    let rx = num('rx', 0);
    let ry = num('ry', 0);
    if (rx > 0 && ry === 0) ry = rx;
    if (ry > 0 && rx === 0) rx = ry;
    rx = Math.min(rx, w / 2);
    ry = Math.min(ry, h / 2);

    if (rx <= 0 || ry <= 0) {
      return `M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} Z`;
    }
    return [
      `M${x + rx} ${y}`,
      `L${x + w - rx} ${y}`,
      `A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}`,
      `L${x + w} ${y + h - ry}`,
      `A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}`,
      `L${x + rx} ${y + h}`,
      `A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}`,
      `L${x} ${y + ry}`,
      `A${rx} ${ry} 0 0 1 ${x + rx} ${y}`,
      'Z',
    ].join(' ');
  }

  if (tag === 'circle') {
    const cx = num('cx', 0);
    const cy = num('cy', 0);
    const r = num('r', 0);
    if (r <= 0) return null;
    const k = 0.5522847498 * r;
    return [
      `M${cx} ${cy - r}`,
      `C${cx + k} ${cy - r} ${cx + r} ${cy - k} ${cx + r} ${cy}`,
      `C${cx + r} ${cy + k} ${cx + k} ${cy + r} ${cx} ${cy + r}`,
      `C${cx - k} ${cy + r} ${cx - r} ${cy + k} ${cx - r} ${cy}`,
      `C${cx - r} ${cy - k} ${cx - k} ${cy - r} ${cx} ${cy - r}`,
      'Z',
    ].join(' ');
  }

  if (tag === 'ellipse') {
    const cx = num('cx', 0);
    const cy = num('cy', 0);
    const rx = num('rx', 0);
    const ry = num('ry', 0);
    if (rx <= 0 || ry <= 0) return null;
    const kx = 0.5522847498 * rx;
    const ky = 0.5522847498 * ry;
    return [
      `M${cx} ${cy - ry}`,
      `C${cx + kx} ${cy - ry} ${cx + rx} ${cy - ky} ${cx + rx} ${cy}`,
      `C${cx + rx} ${cy + ky} ${cx + kx} ${cy + ry} ${cx} ${cy + ry}`,
      `C${cx - kx} ${cy + ry} ${cx - rx} ${cy + ky} ${cx - rx} ${cy}`,
      `C${cx - rx} ${cy - ky} ${cx - kx} ${cy - ry} ${cx} ${cy - ry}`,
      'Z',
    ].join(' ');
  }

  if (tag === 'line') {
    const x1 = num('x1', 0);
    const y1 = num('y1', 0);
    const x2 = num('x2', 0);
    const y2 = num('y2', 0);
    return `M${x1} ${y1} L${x2} ${y2}`;
  }

  if (tag === 'polygon' || tag === 'polyline') {
    const ptsAttr = el.getAttribute('points') || '';
    const coords = ptsAttr
      .trim()
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => Number.isFinite(n));
    if (coords.length < 4) return null;
    const cmds: string[] = [];
    for (let i = 0; i + 1 < coords.length; i += 2) {
      cmds.push(`${i === 0 ? 'M' : 'L'}${coords[i]} ${coords[i + 1]}`);
    }
    if (tag === 'polygon') cmds.push('Z');
    return cmds.join(' ');
  }

  return null;
}
