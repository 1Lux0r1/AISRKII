/** Операции с цветом: оттенки зон строятся из базового цвета округа. */

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

export function hexToHsl(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

export function hslToHex(h, s, l) {
  const hue = (t) => {
    let v = t;
    if (v < 0) v += 1;
    if (v > 1) v -= 1;
    if (v < 1 / 6) return p + (q - p) * 6 * v;
    if (v < 1 / 2) return q;
    if (v < 2 / 3) return p + (q - p) * (2 / 3 - v) * 6;
    return p;
  };
  if (s === 0) {
    const v = Math.round(l * 255);
    return `#${[v, v, v].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const rgb = [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)].map((v) => Math.round(v * 255));
  return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));

/** Сдвиг светлоты и насыщенности базового цвета. */
export function adjust(hex, { lightness = 0, saturation = 0 } = {}) {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, clamp(s + saturation), clamp(l + lightness));
}
