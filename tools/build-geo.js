#!/usr/bin/env node
/**
 * Подготовка геометрии территорий.
 *
 * На вход — границы районов Москвы из открытых данных OpenStreetMap
 * (data/moscow-districts.source.geojson). На выход — модуль
 * src/data/territories.js: упрощённые контуры районов и объединённые
 * из них контуры округов. Соответствие «район → округ» берётся из
 * справочника DISTRICTS по наименованию.
 *
 *   node tools/build-geo.js
 */

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as clipping from 'polygon-clipping';

import { DISTRICTS, OKRUGS } from '../src/data/catalog.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SOURCE = resolve(ROOT, 'data/moscow-districts.source.geojson');
const OUT = resolve(ROOT, 'src/data/territories.js');

/** Допуск упрощения в градусах: ~11 м по широте. */
const TOLERANCE_DISTRICT = 0.0001;
const TOLERANCE_OKRUG = 0.00015;
/** Кольца мельче этого (в квадратных градусах) отбрасываются как артефакты. */
const MIN_RING_AREA = 2e-7;
const PRECISION = 5;

const union = clipping.union || clipping.default?.union;

/** Наименования в источнике и в справочнике различаются формой записи. */
function normalizeName(name) {
  return String(name)
    .replace(/^район\s+/i, '')
    .replace(/\s+район$/i, '')
    .replace(/^поселение\s+/i, '')
    .replace(/ё/g, 'е')
    .trim()
    .toLowerCase();
}

/** Упрощение полилинии по алгоритму Рамера — Дугласа — Пекера. */
function simplify(ring, tolerance) {
  if (ring.length <= 4) return ring;
  const sqTolerance = tolerance * tolerance;

  const sqSegmentDistance = ([px, py], [ax, ay], [bx, by]) => {
    let x = ax;
    let y = ay;
    let dx = bx - x;
    let dy = by - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = bx;
        y = by;
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    dx = px - x;
    dy = py - y;
    return dx * dx + dy * dy;
  };

  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];

  while (stack.length) {
    const [first, last] = stack.pop();
    let maxSq = sqTolerance;
    let index = -1;
    for (let i = first + 1; i < last; i += 1) {
      const sq = sqSegmentDistance(ring[i], ring[first], ring[last]);
      if (sq > maxSq) {
        maxSq = sq;
        index = i;
      }
    }
    if (index !== -1) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  const out = [];
  for (let i = 0; i < ring.length; i += 1) if (keep[i]) out.push(ring[i]);
  return out;
}

function ringAreaDeg(ring) {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area / 2);
}

/** GeoJSON-геометрия → массив внешних колец в координатах [lon, lat]. */
function outerRings(geometry) {
  const polygons = geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
  // Внутренние кольца (дырки) в административном делении Москвы не встречаются,
  // поэтому берём только внешнее кольцо каждого полигона.
  return polygons.map((polygon) => polygon[0]).filter((ring) => ring && ring.length >= 4);
}

function prepare(rings, tolerance) {
  return rings
    .filter((ring) => ringAreaDeg(ring) >= MIN_RING_AREA)
    .map((ring) => simplify(ring, tolerance))
    .filter((ring) => ring.length >= 4);
}

/** [lon, lat] → [lat, lon] с округлением. */
function toLatLng(rings) {
  const round = (v) => Number(v.toFixed(PRECISION));
  return rings.map((ring) => ring.map(([lon, lat]) => [round(lat), round(lon)]));
}

const geojson = JSON.parse(await readFile(SOURCE, 'utf8'));

// Индекс источника по нормализованному наименованию.
const byName = new Map();
for (const feature of geojson.features) {
  byName.set(normalizeName(feature.properties.name), feature.geometry);
}

const districts = {};
const okrugRings = {};
const missing = [];

for (const okrug of OKRUGS) {
  const names = DISTRICTS[okrug.id] || [];
  const collected = [];

  for (const name of names) {
    const geometry = byName.get(normalizeName(name));
    if (!geometry) {
      missing.push(`${okrug.code}: ${name}`);
      continue;
    }
    const rings = outerRings(geometry);
    collected.push(...rings);
    districts[`${okrug.id}-${slug(name)}`] = toLatLng(prepare(rings, TOLERANCE_DISTRICT));
  }

  if (!collected.length) continue;

  // Контур округа — объединение его районов: границы районов внутри округа
  // при этом исчезают, остаётся только внешний контур.
  const merged = union(...collected.map((ring) => [[...ring]]));
  const rings = merged.flatMap((polygon) => [polygon[0]]);
  okrugRings[okrug.id] = toLatLng(prepare(rings, TOLERANCE_OKRUG));
}

const body = `/**
 * Геометрия административного деления Москвы.
 *
 * СГЕНЕРИРОВАННЫЙ ФАЙЛ — не редактировать вручную, см. tools/build-geo.js.
 *
 * Источник: границы районов Москвы из OpenStreetMap
 * (набор click_that_hood, ODbL, © участники OpenStreetMap).
 * Контуры округов получены объединением районов, геометрия упрощена
 * с допуском ~11 м. Координаты — [широта, долгота], полигон задан
 * массивом колец: у части районов есть анклавы.
 */

export const OKRUG_RINGS = ${JSON.stringify(okrugRings)};

export const DISTRICT_RINGS = ${JSON.stringify(districts)};
`;

await writeFile(OUT, body, 'utf8');

const points = (obj) =>
  Object.values(obj).reduce((acc, rings) => acc + rings.reduce((a, r) => a + r.length, 0), 0);

console.log(`районов: ${Object.keys(districts).length}, точек: ${points(districts)}`);
console.log(`округов: ${Object.keys(okrugRings).length}, точек: ${points(okrugRings)}`);
console.log(`без геометрии: ${missing.length}${missing.length ? ` (${missing.slice(0, 4).join(', ')}…)` : ''}`);
console.log(`${OUT} — ${(Buffer.byteLength(body) / 1024).toFixed(0)} КБ`);

// slug дублируется из geo.js, чтобы сборка не зависела от модуля с геометрией.
function slug(text) {
  const map = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
    к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
    х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  return String(text)
    .toLowerCase()
    .split('')
    .map((ch) => (map[ch] !== undefined ? map[ch] : ch))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
