/**
 * Геометрия административного деления.
 *
 * Контуры районов и округов берутся из подготовленного набора
 * (src/data/territories.js, см. tools/build-geo.js) — это реальные границы
 * Москвы из OpenStreetMap. Для округов, по которым геометрии в наборе нет
 * (Новомосковский и Троицкий), строится приблизительный контур: он помечен
 * флагом approximate и на карте показывается пунктиром.
 *
 * Полигон территории — массив колец: у части районов есть анклавы
 * (Восточный, Молжаниновский, Некрасовка). Вспомогательные функции принимают
 * и массив колец, и одиночное кольцо — последнее нужно для области,
 * нарисованной пользователем.
 */

import { CITY, OKRUGS, DISTRICTS } from './catalog.js';
import { DISTRICT_RINGS, OKRUG_RINGS } from './territories.js';
import { makeRng } from '../utils/rng.js';

const DEG = Math.PI / 180;
const KM_PER_DEG_LAT = 111.32;
const [CENTER_LAT, CENTER_LON] = CITY.center;
const KM_PER_DEG_LON = KM_PER_DEG_LAT * Math.cos(CENTER_LAT * DEG);

/** Точка на азимуте bearing (град. от севера по часовой стрелке) и удалении km. */
export function project(bearingDeg, km, center = CITY.center) {
  const a = bearingDeg * DEG;
  const lat = center[0] + (km * Math.cos(a)) / KM_PER_DEG_LAT;
  const lon = center[1] + (km * Math.sin(a)) / KM_PER_DEG_LON;
  return [lat, lon];
}

/** Расстояние между двумя точками в километрах (локальная плоская аппроксимация). */
export function distanceKm(a, b) {
  const dy = (a[0] - b[0]) * KM_PER_DEG_LAT;
  const dx = (a[1] - b[1]) * KM_PER_DEG_LON;
  return Math.hypot(dx, dy);
}

/** Одиночное кольцо приводится к списку колец. */
function asRings(polygon) {
  if (!polygon || !polygon.length) return [];
  return typeof polygon[0][0] === 'number' ? [polygon] : polygon;
}

/** Форма для Leaflet: массив полигонов, иначе второе кольцо станет дыркой. */
export function toMultiPolygon(polygon) {
  return asRings(polygon).map((ring) => [ring]);
}

/** Принадлежность точки территории (хотя бы одному кольцу). */
export function pointInPolygon(point, polygon) {
  for (const ring of asRings(polygon)) {
    if (pointInRing(point, ring)) return true;
  }
  return false;
}

function pointInRing([lat, lon], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Площадь территории в км². */
export function polygonAreaKm2(polygon) {
  let total = 0;
  for (const ring of asRings(polygon)) total += ringAreaKm2(ring);
  return total;
}

function ringAreaKm2(ring) {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [y1, x1] = ring[i];
    const [y2, x2] = ring[(i + 1) % ring.length];
    area += x1 * KM_PER_DEG_LON * (y2 * KM_PER_DEG_LAT) - x2 * KM_PER_DEG_LON * (y1 * KM_PER_DEG_LAT);
  }
  return Math.abs(area / 2);
}

export function bounds(polygon) {
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  for (const ring of asRings(polygon)) {
    for (const [lat, lon] of ring) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }
  }
  return [[minLat, minLon], [maxLat, maxLon]];
}

function ringCentroid(ring) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [y1, x1] = ring[i];
    const [y2, x2] = ring[(i + 1) % ring.length];
    const cross = x1 * y2 - x2 * y1;
    area += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(area) < 1e-12) {
    const sum = ring.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
    return [sum[0] / ring.length, sum[1] / ring.length];
  }
  area *= 0.5;
  return [cy / (6 * area), cx / (6 * area)];
}

function largestRing(polygon) {
  const rings = asRings(polygon);
  let best = rings[0];
  let bestArea = -1;
  for (const ring of rings) {
    const area = ringAreaKm2(ring);
    if (area > bestArea) {
      bestArea = area;
      best = ring;
    }
  }
  return best;
}

/**
 * Точка для подписи и посадки маркера. У вытянутых и вогнутых районов
 * центроид может оказаться снаружи — тогда подбираем ближайшую к нему
 * внутреннюю точку по сетке.
 */
export function centroid(polygon) {
  const ring = largestRing(polygon);
  if (!ring) return CITY.center;
  const c = ringCentroid(ring);
  if (pointInRing(c, ring)) return c;

  const [[minLat, minLon], [maxLat, maxLon]] = bounds([ring]);
  const steps = 16;
  let best = c;
  let bestDist = Infinity;
  for (let i = 1; i < steps; i += 1) {
    for (let j = 1; j < steps; j += 1) {
      const p = [minLat + ((maxLat - minLat) * i) / steps, minLon + ((maxLon - minLon) * j) / steps];
      if (!pointInRing(p, ring)) continue;
      const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
  }
  return best;
}

/** Приблизительный контур округа, для которого нет данных (ТиНАО). */
function blobPolygon(center, radiusKm, seed) {
  const rng = makeRng(seed);
  const k = [0.22 + rng() * 0.2, 0.16 + rng() * 0.2, 0.1 + rng() * 0.14];
  const phase = [rng() * 6.28, rng() * 6.28, rng() * 6.28];
  const ring = [];
  for (let i = 0; i < 72; i += 1) {
    const a = (i / 72) * 360;
    const r =
      radiusKm *
      (1 +
        k[0] * Math.sin(2 * a * DEG + phase[0]) +
        k[1] * Math.cos(3 * a * DEG + phase[1]) +
        k[2] * Math.sin(5 * a * DEG + phase[2]));
    ring.push(project(a, r, center));
  }
  return [ring];
}

/** Сектор приблизительного округа — заглушка для поселений ТиНАО. */
function blobSector(center, radiusKm, index, count) {
  const a0 = (360 * index) / count;
  const a1 = (360 * (index + 1)) / count;
  const ring = [center];
  for (let a = a0; a <= a1; a += 2) {
    ring.push(project(a, radiusKm * (0.9 + 0.25 * Math.sin(2 * a * DEG + index)), center));
  }
  return [ring];
}

/** Полная модель территории: округа с вложенными районами. */
export function buildTerritories() {
  const okrugs = [];

  for (const okrug of OKRUGS) {
    const names = DISTRICTS[okrug.id] || [];
    const real = OKRUG_RINGS[okrug.id];
    const approximate = !real;

    const polygon = real || blobPolygon(okrug.center, okrug.radiusKm, `okrug:${okrug.id}`);
    const districts = names.map((name, index) => {
      const id = `${okrug.id}-${slug(name)}`;
      const rings = DISTRICT_RINGS[id] || blobSector(okrug.center, okrug.radiusKm, index, names.length);
      return makeDistrict(okrug, name, id, rings, !DISTRICT_RINGS[id]);
    });

    okrugs.push({
      ...okrug,
      approximate,
      polygon,
      districts,
      center: centroid(polygon),
      areaKm2: polygonAreaKm2(polygon),
      bounds: bounds(polygon),
    });
  }

  return okrugs;
}

function makeDistrict(okrug, name, id, polygon, approximate) {
  return {
    id,
    name,
    okrugId: okrug.id,
    okrugCode: okrug.code,
    approximate,
    polygon,
    center: centroid(polygon),
    areaKm2: polygonAreaKm2(polygon),
    bounds: bounds(polygon),
  };
}

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function slug(text) {
  return String(text)
    .toLowerCase()
    .split('')
    .map((ch) => (TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
