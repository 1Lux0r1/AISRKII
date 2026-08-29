/**
 * Генерация геометрии административного деления.
 *
 * В демо нет доступа к боевому геосервису, поэтому контуры округов и районов
 * строятся аналитически: радиальная развёртка вокруг центра города с
 * детерминированными искажениями. Соседние полигоны строятся по одним и тем же
 * функциям границ, поэтому стыкуются без зазоров и перекрытий.
 */

import { CITY, OKRUGS, DISTRICTS } from './catalog.js';
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

/** Обратное преобразование: азимут и удаление точки от центра города. */
export function unproject([lat, lon], center = CITY.center) {
  const dy = (lat - center[0]) * KM_PER_DEG_LAT;
  const dx = (lon - center[1]) * KM_PER_DEG_LON;
  return { bearing: (Math.atan2(dx, dy) / DEG + 360) % 360, km: Math.hypot(dx, dy) };
}

/** Расстояние между двумя точками в километрах (локальная плоская аппроксимация). */
export function distanceKm(a, b) {
  const dy = (a[0] - b[0]) * KM_PER_DEG_LAT;
  const dx = (a[1] - b[1]) * KM_PER_DEG_LON;
  return Math.hypot(dx, dy);
}

/** Выступы застройки за МКАД: Митино, Куркино, Солнцево, Бутово, Косино и др. */
const BULGES = [
  { at: 350, width: 6, height: 3.4 },   // Молжаниновский
  { at: 100, width: 11, height: 3.4 },  // Косино — Новокосино
  { at: 84, width: 6, height: 2.2 },    // Восточный, Кожухово
  { at: 140, width: 8, height: 2.6 },   // Некрасовка
  { at: 190, width: 11, height: 4.0 },  // Южное Бутово
  { at: 246, width: 13, height: 5.2 },  // Солнцево, Ново-Переделкино
  { at: 297, width: 9, height: 3.8 },   // Митино
  { at: 322, width: 7, height: 2.6 },   // Куркино
];

function bulgeAt(bearingDeg) {
  let extra = 0;
  for (const b of BULGES) {
    let d = ((bearingDeg - b.at + 540) % 360) - 180;
    extra += b.height * Math.exp(-(d * d) / (2 * b.width * b.width));
  }
  return extra;
}

/**
 * Детерминированная «зубчатость»: административные рубежи идут по улицам,
 * железным дорогам и рекам, поэтому гладкие дуги выглядят неправдоподобно.
 * Частоты подобраны так, чтобы шаг дискретизации дуг (1°) их разрешал.
 */
function ridge(x) {
  return (
    0.46 * Math.sin(7.3 * x + 1.73) +
    0.3 * Math.sin(13.1 * x + 0.41) +
    0.19 * Math.sin(19.7 * x + 2.92)
  );
}

/** Радиус внешней границы города (МКАД + присоединённая застройка), км. */
export function outerRadius(bearingDeg) {
  const a = bearingDeg * DEG;
  const base =
    17.4 +
    1.35 * Math.sin(2 * a + 0.6) +
    0.95 * Math.cos(3 * a - 0.4) +
    0.5 * Math.sin(5 * a + 1.1) +
    0.62 * ridge(a);
  return base + bulgeAt(bearingDeg);
}

/** Радиус границы Центрального округа, км. */
export function coreRadius(bearingDeg) {
  const a = bearingDeg * DEG;
  return 4.35 + 0.45 * Math.sin(3 * a + 0.5) + 0.3 * Math.cos(2 * a - 1.1) + 0.26 * ridge(a + 2.1);
}

/**
 * Смещение радиальной границы: делает межрайонные рубежи «живыми», оставаясь
 * чистой функцией от азимута, поэтому соседние полигоны совпадают вершина
 * в вершину. Амплитуда мала относительно ширины сектора, порядок секторов
 * сохраняется.
 */
function boundaryOffset(bearingDeg, t) {
  const a = bearingDeg * DEG;
  const bow = 2.4 * Math.sin(2 * a + 0.9) + 1.4 * Math.cos(3 * a - 0.2);
  // Ломаная составляющая зависит и от азимута, и от доли радиуса, поэтому
  // одинакова для обоих соседних полигонов и не создаёт зазоров.
  const jag = 1.15 * ridge(a * 1.7 + t * 4.3) + 0.7 * ridge(a * 0.9 - t * 7.1);
  return (bow + jag) * Math.sin(Math.PI * t);
}

/** Радиус на доле t между границей ЦАО и внешней границей. */
function radiusAt(bearingDeg, t) {
  const inner = coreRadius(bearingDeg);
  const outer = outerRadius(bearingDeg);
  return inner + (outer - inner) * t;
}

/** Точка кольцевой зоны в «секторных» координатах (азимут, доля радиуса). */
function ringPoint(bearingDeg, t) {
  const shifted = bearingDeg + boundaryOffset(bearingDeg, t);
  return project(shifted, radiusAt(shifted, t));
}

function arcAngles(from, to, step = 1) {
  const span = ((to - from + 360) % 360) || 360;
  const n = Math.max(2, Math.ceil(span / step));
  const out = [];
  for (let i = 0; i <= n; i += 1) out.push(from + (span * i) / n);
  return out;
}

/**
 * Кольцевой полигон между азимутами [a0, a1] и долями радиуса [t0, t1].
 * Обход: внешняя дуга → правая граница → внутренняя дуга → левая граница.
 */
function ringPolygon(a0, a1, t0, t1) {
  const angles = arcAngles(a0, a1);
  const steps = 22;
  const pts = [];
  for (const a of angles) pts.push(ringPoint(a, t1));
  for (let i = steps - 1; i >= 0; i -= 1) pts.push(ringPoint(a1, t0 + ((t1 - t0) * i) / steps));
  for (let i = angles.length - 1; i >= 0; i -= 1) pts.push(ringPoint(angles[i], t0));
  for (let i = 1; i <= steps; i += 1) pts.push(ringPoint(a0, t0 + ((t1 - t0) * i) / steps));
  return dedupe(pts);
}

/** Сектор внутри ЦАО между долями радиуса t0 и t1 (t = 0 — центр города). */
function corePolygon(a0, a1, t0, t1) {
  const angles = arcAngles(a0, a1, 1);
  const r = (a, t) => project(a, coreRadius(a) * t);
  if (t0 <= 0) {
    const pts = [CITY.center];
    for (const a of angles) pts.push(r(a, t1));
    return dedupe(pts);
  }
  const pts = [];
  for (const a of angles) pts.push(r(a, t1));
  for (let i = angles.length - 1; i >= 0; i -= 1) pts.push(r(angles[i], t0));
  return dedupe(pts);
}

/** Отдельный округ вне обзорного экстента (Зеленоград, ТиНАО). */
function blobPolygon(center, radiusKm, seed) {
  const rng = makeRng(seed);
  const k = [0.22 + rng() * 0.2, 0.16 + rng() * 0.2, 0.1 + rng() * 0.14];
  const phase = [rng() * 6.28, rng() * 6.28, rng() * 6.28];
  const pts = [];
  for (let i = 0; i < 72; i += 1) {
    const a = (i / 72) * 360;
    const r = radiusKm * (1 + k[0] * Math.sin(2 * a * DEG + phase[0]) + k[1] * Math.cos(3 * a * DEG + phase[1]) + k[2] * Math.sin(5 * a * DEG + phase[2]));
    pts.push(project(a, r, center));
  }
  return pts;
}

function dedupe(points) {
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > 1e-9 || Math.abs(last[1] - p[1]) > 1e-9) out.push(p);
  }
  return out;
}

/** Центроид полигона (для подписей и посадки маркеров). */
export function centroid(points) {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [y1, x1] = points[i];
    const [y2, x2] = points[(i + 1) % points.length];
    const cross = x1 * y2 - x2 * y1;
    area += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(area) < 1e-12) {
    const s = points.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
    return [s[0] / points.length, s[1] / points.length];
  }
  area *= 0.5;
  return [cy / (6 * area), cx / (6 * area)];
}

/** Площадь полигона в км². */
export function polygonAreaKm2(points) {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [y1, x1] = points[i];
    const [y2, x2] = points[(i + 1) % points.length];
    area += (x1 * KM_PER_DEG_LON) * (y2 * KM_PER_DEG_LAT) - (x2 * KM_PER_DEG_LON) * (y1 * KM_PER_DEG_LAT);
  }
  return Math.abs(area / 2);
}

/** Принадлежность точки полигону (ray casting). */
export function pointInPolygon([lat, lon], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function bounds(points) {
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  for (const [lat, lon] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }
  return [[minLat, minLon], [maxLat, maxLon]];
}

/**
 * Раскладка районов внутри округа: число поясов и количество ячеек в каждом.
 * Радиусы разделов подобраны по равенству площадей поясов (площадь кольца
 * растёт как квадрат радиуса), иначе внутренние районы вырождаются в клинья.
 */
function ringLayout(count) {
  if (count <= 4) return [{ cols: count, t0: 0, t1: 1 }];
  if (count <= 8) {
    return [
      { cols: Math.floor(count / 2), t0: 0, t1: 0.58 },
      { cols: Math.ceil(count / 2), t0: 0.58, t1: 1 },
    ];
  }
  const inner = Math.max(2, Math.round(count * 0.25));
  const rest = count - inner;
  const middle = Math.floor(rest / 2);
  const outer = rest - middle;
  return [
    { cols: inner, t0: 0, t1: 0.48 },
    { cols: middle, t0: 0.48, t1: 0.77 },
    { cols: outer, t0: 0.77, t1: 1 },
  ];
}

/**
 * Разбиение сектора округа на районы. Каждый пояс делится по азимуту на своё
 * число ячеек, поэтому любое количество районов покрывает сектор без зазоров.
 */
function splitRing(a0, a1, count) {
  const span = ((a1 - a0 + 360) % 360) || 360;
  const cells = [];
  for (const row of ringLayout(count)) {
    for (let c = 0; c < row.cols; c += 1) {
      cells.push({
        a0: a0 + (span * c) / row.cols,
        a1: a0 + (span * (c + 1)) / row.cols,
        t0: row.t0,
        t1: row.t1,
      });
    }
  }
  return cells;
}

/** Полная модель территории: округа с вложенными районами. */
export function buildTerritories() {
  const okrugs = [];

  for (const okrug of OKRUGS) {
    const names = DISTRICTS[okrug.id] || [];
    let polygon;
    let districts = [];

    if (okrug.kind === 'core') {
      polygon = [];
      for (const a of arcAngles(0, 360, 1)) polygon.push(project(a, coreRadius(a)));
      polygon = dedupe(polygon);
      // Внутренний «кремлёвский» пояс и внешнее кольцо районов.
      const innerCount = Math.max(2, Math.round(names.length * 0.3));
      const rows = [
        { cols: innerCount, t0: 0, t1: 0.5 },
        { cols: names.length - innerCount, t0: 0.5, t1: 1 },
      ];
      let cursor = 0;
      districts = [];
      for (const row of rows) {
        for (let c = 0; c < row.cols; c += 1) {
          const a0 = (360 * c) / row.cols;
          const a1 = (360 * (c + 1)) / row.cols;
          districts.push(makeDistrict(okrug, names[cursor++], corePolygon(a0, a1, row.t0, row.t1)));
        }
      }
    } else if (okrug.kind === 'ring') {
      const [a0, a1] = okrug.sector;
      polygon = ringPolygon(a0, a1, 0, 1);
      districts = splitRing(a0, a1, names.length).map((cell, i) =>
        makeDistrict(okrug, names[i], ringPolygon(cell.a0, cell.a1, cell.t0, cell.t1)),
      );
    } else {
      polygon = blobPolygon(okrug.center, okrug.radiusKm, `okrug:${okrug.id}`);
      districts = names.map((name, i) => {
        const a0 = (360 * i) / names.length;
        const a1 = (360 * (i + 1)) / names.length;
        const pts = [okrug.center];
        for (const a of arcAngles(a0, a1, 2)) {
          const r = okrug.radiusKm * (0.9 + 0.25 * Math.sin(2 * a * DEG + i));
          pts.push(project(a, r, okrug.center));
        }
        return makeDistrict(okrug, name, dedupe(pts));
      });
    }

    okrugs.push({
      ...okrug,
      polygon,
      districts,
      center: centroid(polygon),
      areaKm2: polygonAreaKm2(polygon),
      bounds: bounds(polygon),
    });
  }

  return okrugs;
}

function makeDistrict(okrug, name, polygon) {
  const id = `${okrug.id}-${slug(name)}`;
  return {
    id,
    name,
    okrugId: okrug.id,
    okrugCode: okrug.code,
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
