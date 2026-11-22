const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#FFFFFF',
  red: '#EF4444',
  green: '#22C55E',
  blue: '#3B82F6',
  yellow: '#EAB308',
  cyan: '#06B6D4',
  aqua: '#06B6D4',
  magenta: '#D946EF',
  fuchsia: '#D946EF',
  gray: '#64748B',
  grey: '#64748B',
  silver: '#CBD5E1',
  maroon: '#7F1D1D',
  navy: '#1E3A8A',
  olive: '#84CC16',
  purple: '#9333EA',
  teal: '#14B8A6',
  lime: '#84CC16',
  orange: '#F97316',
  pink: '#EC4899',
  indigo: '#6366F1',
  violet: '#8B5CF6',
  gold: '#F59E0B',
  coral: '#FB7185',
  crimson: '#DC2626',
  slate: '#475569',
};

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function byteToHex(n: number): string {
  return clampByte(n).toString(16).padStart(2, '0').toUpperCase();
}

export function normalizeColor(
  input: string | null | undefined,
  fallback = '#3B82F6',
  isAlightMotionArgb = false
): {hex: string; alpha: number} {
  if (!input) {
    return {hex: fallback, alpha: 1};
  }
  const raw = input.trim().toLowerCase();
  if (!raw || raw === 'none' || raw === 'transparent') {
    return {hex: 'none', alpha: raw === 'transparent' ? 0 : 1};
  }

  if (NAMED_COLORS[raw]) {
    return {hex: NAMED_COLORS[raw], alpha: 1};
  }

  if (raw.startsWith('url(')) {
    return {hex: fallback, alpha: 1};
  }

  if (raw.startsWith('#')) {
    const clean = raw.slice(1);
    if (clean.length === 3) {
      const r = clean[0] + clean[0];
      const g = clean[1] + clean[1];
      const b = clean[2] + clean[2];
      return {hex: `#${r}${g}${b}`.toUpperCase(), alpha: 1};
    }
    if (clean.length === 4) {
      const r = clean[0] + clean[0];
      const g = clean[1] + clean[1];
      const b = clean[2] + clean[2];
      const a = parseInt(clean[3] + clean[3], 16) / 255;
      return {hex: `#${r}${g}${b}`.toUpperCase(), alpha: Number.isFinite(a) ? a : 1};
    }
    if (clean.length === 6 && /^[0-9a-f]{6}$/i.test(clean)) {
      return {hex: `#${clean}`.toUpperCase(), alpha: 1};
    }
    if (clean.length === 8 && /^[0-9a-f]{8}$/i.test(clean)) {
      if (isAlightMotionArgb) {
        const a = parseInt(clean.slice(0, 2), 16) / 255;
        const rgb = clean.slice(2, 8);
        return {hex: `#${rgb}`.toUpperCase(), alpha: Number.isFinite(a) ? a : 1};
      }
      const rgb = clean.slice(0, 6);
      const a = parseInt(clean.slice(6, 8), 16) / 255;
      return {hex: `#${rgb}`.toUpperCase(), alpha: Number.isFinite(a) ? a : 1};
    }
  }

  const rgbMatch = raw.match(
    /^rgba?\(\s*([\d.]+)%?\s*[,\s]\s*([\d.]+)%?\s*[,\s]\s*([\d.]+)%?(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/
  );
  if (rgbMatch) {
    const r = Number(rgbMatch[1]);
    const g = Number(rgbMatch[2]);
    const b = Number(rgbMatch[3]);
    let a = 1;
    if (rgbMatch[4] !== undefined) {
      a = rgbMatch[4].endsWith('%')
        ? parseFloat(rgbMatch[4]) / 100
        : parseFloat(rgbMatch[4]);
    }
    if ([r, g, b].every(Number.isFinite)) {
      return {
        hex: `#${byteToHex(r)}${byteToHex(g)}${byteToHex(b)}`,
        alpha: Number.isFinite(a) ? Math.max(0, Math.min(1, a)) : 1,
      };
    }
  }

  return {hex: fallback, alpha: 1};
}

export function toAlightMotionArgb(hex: string, opacity = 1): string {
  if (!hex || hex === 'none') {
    return '#00000000';
  }
  const normalized = normalizeColor(hex, '#000000');
  if (normalized.hex === 'none') {
    return '#00000000';
  }
  const clean = normalized.hex.replace('#', '').slice(0, 6);
  const alphaByte = byteToHex(Math.max(0, Math.min(1, opacity * normalized.alpha)) * 255);
  return `#${alphaByte}${clean}`.toLowerCase();
}

export function isValidHexInput(value: string): boolean {
  return /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(value.trim());
}
