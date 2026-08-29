/** Форматирование значений в русской локали (неразрывные пробелы в разрядах). */

const NBSP = ' ';

export function formatInt(value) {
  if (value == null || Number.isNaN(value)) return '—';
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

export function formatNumber(value, digits = 1) {
  if (value == null || Number.isNaN(value)) return '—';
  const fixed = Number(value).toFixed(digits);
  const [int, frac] = fixed.split('.');
  const head = int.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return frac ? `${head},${frac}` : head;
}

export function formatKm(value) {
  return `${formatInt(value)}${NBSP}км.`;
}

export function formatArea(value) {
  return `${formatNumber(value, 2)}${NBSP}км²`;
}

export function formatPower(value) {
  return `${formatNumber(value, 1)}${NBSP}МВт`;
}

export function formatPercent(value) {
  if (value == null) return '—';
  return `${Math.round(value)}%`;
}

export function formatDate(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function pluralRu(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
