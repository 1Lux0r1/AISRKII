/**
 * Данные модуля «Анализ территории».
 *
 * Микросервис terra analysis моделирует подключение полигонов перспективной
 * застройки (ППЗ) к коммунальной инженерной инфраструктуре. Демонстрационный
 * проект построен на настоящем контуре района Некрасовка: свободная южная
 * часть («Люберецкие поля») застраивается, северная уже застроена.
 *
 * Геометрия детерминирована: одно и то же демо при каждой загрузке.
 */

import { DISTRICT_RINGS } from './territories.js';
import { makeRng, distribute } from '../utils/rng.js';

const HOME = 'uvao-nekrasovka';

/** Контрольные числа проекта — совпадают с макетами и между экранами. */
export const TERRA_PROJECT = {
  id: 'nekrasovka-south',
  name: 'Некрасовка — южный участок',
  districtId: HOME,
  districtName: 'Некрасовка',
  okrugName: 'ЮВАО',
  resourceId: 'heat',
  ppzCount: 34,
  /** Суммарная расчётная тепловая нагрузка новых ОКС, Гкал/ч. */
  demand: 128.4,
  obstacles: 42,
  calculatedOn: '2026-08-05T11:42',
};

/** Источник теплоснабжения, к которому моделируется подключение. */
export const TERRA_SOURCE = {
  id: 'terra-rts-nekrasovka',
  name: 'РТС «Некрасовка»',
  org: 'ПАО «МОЭК»',
  year: 1998,
  wear: 62,
  /** Установленная мощность, Гкал/ч. */
  capacity: 320,
  connected: 246,
  reserve: 74,
  demand: 128.4,
  deficit: 54.4,
  zoneDistricts: 4,
};

/** Варианты закрытия дефицита мощности. */
export const TERRA_OPTIONS = [
  {
    id: 'rebuild',
    name: 'Реконструкция РТС',
    note: '+60 Гкал/ч · 24 мес · закрывает дефицит',
    value: '1,2',
    unit: 'млрд ₽',
    solves: true,
  },
  {
    id: 'switch',
    name: 'Переключение на ТЭЦ-22',
    note: '−38 Гкал/ч нагрузки · 8 мес · дефицит 16,4',
    value: '240',
    unit: 'млн ₽',
    solves: false,
  },
];

/* --------------------------- метрическая рамка ---------------------------
   Работать в градусах неудобно: шаг планировочной сетки задаётся в метрах.
   Локальная рамка с началом в центре района искажений на 4 км не даёт. */

const ring = DISTRICT_RINGS[HOME][0];
const lat0 = ring.reduce((a, p) => a + p[0], 0) / ring.length;
const lon0 = ring.reduce((a, p) => a + p[1], 0) / ring.length;
const M_LAT = 111320;
const M_LON = 111320 * Math.cos((lat0 * Math.PI) / 180);

const toXY = ([lat, lon]) => [(lon - lon0) * M_LON, (lat - lat0) * M_LAT];
const toLL = ([x, y]) => [y / M_LAT + lat0, x / M_LON + lon0];

const poly = ring.map(toXY);

function inside([px, py]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/* Район вытянут с северо-запада на юго-восток: кварталы разворачиваются
   вдоль главной оси, иначе сетка ложится поперёк улиц. */
const ANG = (-14 * Math.PI) / 180;
const COS = Math.cos(ANG);
const SIN = Math.sin(ANG);
const grid = ([u, v]) => [u * COS - v * SIN, u * SIN + v * COS];
const rect = (u, v, w, h) =>
  [
    [u, v],
    [u + w, v],
    [u + w, v + h],
    [u, v + h],
  ].map(grid);

/**
 * Квартал считается вписанным, если внутри контура лежат его углы, поджатые
 * внутрь: у извилистой границы строгая проверка отсеивает годные места.
 */
function fits(pts, inset = 60) {
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return pts.every(([x, y]) => {
    const d = Math.hypot(x - mx, y - my) || 1;
    return inside([x + ((mx - x) / d) * inset, y + ((my - y) / d) * inset]);
  });
}

const ll = (pts) => pts.map(toLL);

/* ----------------------- магистральные тепловые сети ---------------------- */

/** Магистраль идёт с северо-запада на юго-восток вдоль главной оси района. */
const MTS_XY = [
  [-620, 1900],
  [-430, 1180],
  [-250, 560],
  [-60, -120],
  [180, -820],
  [420, -1500],
  [610, -2050],
].map(grid);

export const TERRA_MTS = ll(MTS_XY);
export const TERRA_SOURCE_LATLNG = toLL(grid([-690, 2130]));

/** Ближайшая точка магистрали — к ней строится трасса подключения. */
function nearestOnMts([x, y]) {
  let best = MTS_XY[0];
  let bd = Infinity;
  for (let i = 0; i < MTS_XY.length - 1; i += 1) {
    const [x1, y1] = MTS_XY[i];
    const [x2, y2] = MTS_XY[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
    const px = x1 + dx * t;
    const py = y1 + dy * t;
    const d = Math.hypot(px - x, py - y);
    if (d < bd) {
      bd = d;
      best = [px, py];
    }
  }
  return { point: best, distance: bd };
}

/* ------------------- полигоны перспективной застройки --------------------- */

const QUARTERS = [
  'Некрасовка, кв. 8', 'Некрасовка, кв. 9', 'Люберецкие поля, уч. 3',
  'Некрасовка, кв. 12', 'Некрасовка, кв. 14', 'Некрасовка, кв. 15',
  'Люберецкие поля, уч. 5', 'Некрасовка, кв. 17', 'Люберецкие поля, уч. 6',
  'Некрасовка, кв. 19', 'Некрасовка, кв. 21', 'Люберецкие поля, уч. 8',
];

/** Ду теплового ввода подбирается по нагрузке — как в типовых решениях. */
function diameterFor(load) {
  if (load >= 6) return 325;
  if (load >= 4.2) return 273;
  if (load >= 2.6) return 219;
  if (load >= 1.5) return 159;
  return 133;
}

function buildPpz() {
  const rng = makeRng('terra:ppz:nekrasovka');
  const cells = [];

  // Свободная южная часть района: сетка кварталов 260 × 210 м.
  for (let v = 900; v > -2400; v -= 210) {
    for (let u = -900; u < 900; u += 260) {
      const pts = rect(u + 14, v - 186, 232, 172);
      if (!fits(pts, 70)) continue;
      cells.push({ u, v, pts });
    }
  }

  // Кварталов помещается больше, чем нужно проекту: берём равномерную
  // выборку по всей свободной части, а не первые попавшиеся подряд.
  const step = cells.length / TERRA_PROJECT.ppzCount;
  const picked = [];
  for (let i = 0; i < TERRA_PROJECT.ppzCount && picked.length < cells.length; i += 1) {
    picked.push(cells[Math.min(cells.length - 1, Math.round(i * step))]);
  }

  // Дома раскладываются до расчёта нагрузок: объект капитального
  // строительства — это дом, и нагрузка квартала должна идти за их числом,
  // иначе маленький квартал получит нагрузку большого.
  const blocks = picked.map((cell) => {
    const houses = [];
    for (let a = 0; a < 3; a += 1) {
      for (let b = 0; b < 3; b += 1) {
        if (rng() < 0.3) continue;
        const w = 58 + rng() * 18;
        const h = 34 + rng() * 12;
        houses.push({
          ring: ll(rect(cell.u + 30 + a * 72, cell.v - 176 + b * 58, w, h)),
          floors: [9, 12, 14, 17, 22, 25][Math.floor(rng() * 6)],
        });
      }
    }
    return { cell, houses };
  });

  // Нагрузки распределяются так, чтобы сумма в точности равнялась
  // контрольной потребности застройки: иначе экраны разойдутся в числах.
  const weights = blocks.map((b) => b.houses.reduce((a, h) => a + h.floors, 0) || 1);
  const loads = distribute(Math.round(TERRA_PROJECT.demand * 10), weights).map((v) => v / 10);

  return blocks.map(({ cell, houses }, i) => {
    const cx = cell.pts.reduce((a, p) => a + p[0], 0) / cell.pts.length;
    const cy = cell.pts.reduce((a, p) => a + p[1], 0) / cell.pts.length;
    const tap = nearestOnMts([cx, cy]);
    const load = loads[i];
    // Протяжённость строительства = трасса до магистрали плюс разводка
    // внутри квартала; округляем до десятков метров, как в проектах.
    const length = Math.round((tap.distance + 180 + rng() * 220) / 10) * 10;
    const diameter = diameterFor(load);
    const capex = Math.round(((length * (diameter / 219) * 0.142) + load * 3.4) * 10) / 10;

    return {
      id: String(11 + i).padStart(3, '0'),
      name: QUARTERS[i % QUARTERS.length],
      rki: String(4417804 + i * 5),
      load,
      ocs: houses.length,
      ring: ll(cell.pts),
      centre: toLL([cx, cy]),
      tap: toLL(tap.point),
      trace: [toLL([cx, cy]), toLL(tap.point)],
      length,
      diameter,
      capex,
      houses,
    };
  });
}

export const TERRA_PPZ = buildPpz();

/**
 * Точки врезки в магистраль. Трассы, выходящие на магистраль рядом, сводятся
 * в один узел: на 34 ППЗ камер получается заметно меньше, чем трасс.
 */
export const TERRA_TAPS = (() => {
  const nodes = [];
  for (const p of TERRA_PPZ) {
    const xy = toXY(p.tap);
    const near = nodes.find((n) => Math.hypot(n.xy[0] - xy[0], n.xy[1] - xy[1]) < 170);
    if (near) {
      near.count += 1;
      continue;
    }
    nodes.push({ id: `ТК-${118 + nodes.length}`, latlng: p.tap, xy, count: 1 });
  }
  return nodes.map(({ id, latlng, count }) => ({ id, latlng, count }));
})();

/** Препятствия: участки, где прокладка невозможна или требует согласования. */
export const TERRA_OBSTACLES = (() => {
  const rng = makeRng('terra:obstacles:nekrasovka');
  const out = [];
  for (let v = 1600; v > -2400 && out.length < TERRA_PROJECT.obstacles; v -= 168) {
    for (let u = -1000; u < 1000 && out.length < TERRA_PROJECT.obstacles; u += 214) {
      if (rng() < 0.55) continue;
      const pts = rect(u, v - 96, 60 + rng() * 60, 46 + rng() * 40);
      if (!fits(pts, 24)) continue;
      out.push(ll(pts));
    }
  }
  return out;
})();

/**
 * Распределительные сети существующей застройки и тепловые пункты.
 * Это контекст расчёта: новая трасса врезается в магистраль, но проходит
 * по кварталам, где распределительная сеть уже есть.
 */
export const TERRA_DISTRIB = (() => {
  const rng = makeRng('terra:distrib:nekrasovka');
  const out = [];
  for (let v = 2250; v > 950; v -= 236) {
    const line = [];
    for (let u = -880; u <= 880; u += 176) {
      const jitter = (rng() - 0.5) * 60;
      line.push(grid([u, v + jitter]));
    }
    const kept = line.filter(inside);
    if (kept.length >= 2) out.push(ll(kept));
  }
  for (let u = -760; u <= 760; u += 304) {
    const line = [];
    for (let v = 2300; v > 900; v -= 200) line.push(grid([u, v]));
    const kept = line.filter(inside);
    if (kept.length >= 2) out.push(ll(kept));
  }
  return out;
})();

export const TERRA_TP = (() => {
  const rng = makeRng('terra:tp:nekrasovka');
  const out = [];
  let n = 1;
  for (let v = 2200; v > 950; v -= 168) {
    for (let u = -820; u <= 820; u += 246) {
      if (rng() < 0.42) continue;
      const pt = grid([u, v]);
      if (!inside(pt)) continue;
      out.push({ id: `ЦТП-${String(n).padStart(2, '0')}`, latlng: toLL(pt) });
      n += 1;
    }
  }
  return out;
})();

/** Существующая застройка в северной части района — контекст, не результат. */
export const TERRA_BUILT = (() => {
  const out = [];
  for (let v = 2300; v > 950; v -= 118) {
    for (let u = -900; u < 900; u += 152) {
      const pts = rect(u + 16, v - 100, 118, 78);
      if (fits(pts, 34)) out.push(ll(pts));
    }
  }
  return out;
})();

export const TERRA_HOUSE_COUNT = TERRA_PPZ.reduce((a, p) => a + p.houses.length, 0);

/** Границы проекта — к ним карта модуля приводится при открытии. */
export const TERRA_BOUNDS = (() => {
  const lats = ring.map((p) => p[0]);
  const lons = ring.map((p) => p[1]);
  return [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ];
})();
