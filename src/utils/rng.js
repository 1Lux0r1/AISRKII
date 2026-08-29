/**
 * Детерминированный генератор псевдослучайных чисел.
 * Демо должно выглядеть одинаково при каждой загрузке, поэтому вся
 * «случайность» в данных выводится из строкового ключа.
 */

/** FNV-1a — строка в 32-битное целое. */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — быстрый PRNG с равномерным распределением. */
export function makeRng(seed) {
  let a = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Случайное вещественное в диапазоне [min, max). */
export function rngRange(rng, min, max) {
  return min + rng() * (max - min);
}

/** Случайное целое в диапазоне [min, max]. */
export function rngInt(rng, min, max) {
  return Math.floor(min + rng() * (max - min + 1));
}

/** Случайный элемент массива. */
export function rngPick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}

/**
 * Выбор по весам: items — массив, weightOf — функция веса.
 */
export function rngWeighted(rng, items, weightOf) {
  let total = 0;
  for (const item of items) total += weightOf(item);
  let roll = rng() * total;
  for (const item of items) {
    roll -= weightOf(item);
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

/**
 * Распределение целого total по весам методом наибольших остатков:
 * сумма результата строго равна total.
 */
export function distribute(total, weights) {
  const sum = weights.reduce((acc, w) => acc + w, 0);
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (w / sum) * total);
  const base = exact.map(Math.floor);
  let rest = total - base.reduce((acc, v) => acc + v, 0);
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; rest > 0; k += 1, rest -= 1) {
    base[order[k % order.length].i] += 1;
  }
  return base;
}
