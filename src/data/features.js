/**
 * Объекты карты.
 *
 * Полный реестр — сотни тысяч записей, поэтому геометрия объектов строится
 * по требованию для конкретного района и кэшируется. Для массовых типов
 * (потребители, оборудование, участки сетей) отдаётся выборка: на экране
 * объектов ровно столько, сколько читается глазом, а счётчики берутся
 * из реестра.
 */

import { ORGANIZATIONS, ORG_BY_ID, STATUSES, TYPE_BY_ID } from './catalog.js';
import { bounds, pointInPolygon, polygonAreaKm2, project } from './geo.js';
import { makeRng, rngInt, rngPick, rngRange, rngWeighted } from '../utils/rng.js';

/** Сколько объектов каждого типа показывать на карте максимум (на район). */
const SAMPLE_CAP = {
  source: 12,
  heatpoint: 46,
  substation: 24,
  pump: 12,
  consumer: 130,
  equipment: 54,
  network: 34,
};

/** Пул наименований улиц: в демо адреса собираются из него и номера дома. */
const STREETS = [
  'Зелёный просп.', 'Электродная ул.', 'Мартеновская ул.', 'Плеханова ул.',
  '1-я Владимирская ул.', '2-я Владимирская ул.', 'Кусковская ул.', 'Перовская ул.',
  'Шоссе Энтузиастов', 'Свободный просп.', 'Молостовых ул.', 'Саянская ул.',
  'Реутовская ул.', 'Косинская ул.', 'Вешняковская ул.', 'Академика Королёва ул.',
  'Профсоюзная ул.', 'Ленинский просп.', 'Нахимовский просп.', 'Севастопольский просп.',
  'Каширское ш.', 'Варшавское ш.', 'Волгоградский просп.', 'Рязанский просп.',
  'Ярославское ш.', 'Дмитровское ш.', 'Ленинградский просп.', 'Хорошёвское ш.',
  'Кутузовский просп.', 'Мичуринский просп.', 'Вернадского просп.', 'Мира просп.',
  'Сущёвский вал', 'Бутырская ул.', 'Складочная ул.', 'Полярная ул.',
  'Летниковская ул.', 'Дербенёвская наб.', 'Автозаводская ул.', 'Люблинская ул.',
];

const SOURCE_KINDS = [
  { prefix: 'ТЭЦ', resource: 'heat' },
  { prefix: 'РТС', resource: 'heat' },
  { prefix: 'КТС', resource: 'heat' },
  { prefix: 'ПС 220 кВ', resource: 'power' },
  { prefix: 'ГЭС', resource: 'power' },
  { prefix: 'ВЗУ', resource: 'water' },
  { prefix: 'ГРС', resource: 'gas' },
];

const NETWORK_KIND = {
  heat: 'Тепловая сеть',
  power: 'Кабельная линия',
  water: 'Водопроводная сеть',
  gas: 'Газопровод',
  storm: 'Водосток',
  collector: 'Коллектор',
};

const cache = new Map();
const sourceCache = new Map();

/**
 * Крупные источники района — отдаются целиком (их единицы) и кэшируются
 * отдельно, чтобы глобальный поиск и карта показывали одни и те же объекты.
 */
export function sourceFeatures(district, cellsOfDistrict) {
  if (sourceCache.has(district.id)) return sourceCache.get(district.id);
  const cells = cellsOfDistrict.filter((c) => c.typeId === 'source');
  const out = [];
  if (cells.length) {
    const rng = makeRng(`sources:${district.id}`);
    ringWeights(district);
    const total = cells.reduce((acc, c) => acc + c.count, 0);
    for (let i = 0; i < total; i += 1) {
      const cell = rngWeighted(rng, cells, (c) => c.count);
      out.push(makePoint(rng, district, cell, pickStatus(rng, cell), i));
    }
  }
  sourceCache.set(district.id, out);
  return out;
}

/**
 * Объекты района. Возвращает { points, lines, sampled } — sampled показывает,
 * какая доля реестра фактически отрисована.
 */
export function districtFeatures(district, cellsOfDistrict) {
  if (cache.has(district.id)) return cache.get(district.id);

  const rng = makeRng(`features:${district.id}`);
  ringWeights(district);
  const points = [];
  const lines = [];

  const byType = new Map();
  for (const cell of cellsOfDistrict) {
    let list = byType.get(cell.typeId);
    if (!list) byType.set(cell.typeId, (list = []));
    list.push(cell);
  }

  let registryTotal = 0;
  let drawnTotal = 0;

  for (const [typeId, cells] of byType) {
    const total = cells.reduce((acc, c) => acc + c.count, 0);
    registryTotal += total;
    if (typeId === 'source') {
      // Источники уже построены отдельно — берём их целиком.
      const list = sourceFeatures(district, cellsOfDistrict);
      points.push(...list);
      drawnTotal += list.length;
      continue;
    }
    const cap = SAMPLE_CAP[typeId] ?? 30;
    const drawn = Math.min(total, cap);
    drawnTotal += drawn;

    for (let i = 0; i < drawn; i += 1) {
      const cell = rngWeighted(rng, cells, (c) => c.count);
      const statusId = pickStatus(rng, cell);
      if (typeId === 'network') {
        lines.push(makeLine(rng, district, cell, statusId, i));
      } else {
        points.push(makePoint(rng, district, cell, statusId, i));
      }
    }
  }

  const result = {
    points,
    lines,
    registryTotal,
    drawnTotal,
    sampled: registryTotal ? drawnTotal / registryTotal : 1,
  };
  cache.set(district.id, result);
  return result;
}

export function clearFeatureCache() {
  cache.clear();
  sourceCache.clear();
}

function pickStatus(rng, cell) {
  const weights = STATUSES.map((s) => cell.status[s.id] || 0);
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return 'ok';
  let roll = rng() * sum;
  for (let i = 0; i < STATUSES.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return STATUSES[i].id;
  }
  return 'ok';
}

/**
 * Случайная точка внутри района. Кольцо выбирается пропорционально площади —
 * так объекты попадают и в анклавы (Восточный, Внуково, Кунцево), — а внутри
 * кольца точка подбирается отбраковкой по его габаритам.
 */
function randomInside(rng, district) {
  const rings = district.polygon;
  const weights = district.ringWeights;
  let roll = rng() * weights[weights.length - 1];
  let index = weights.findIndex((w) => roll <= w);
  if (index < 0) index = rings.length - 1;
  const ring = rings[index];

  const [[minLat, minLon], [maxLat, maxLon]] = bounds([ring]);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const p = [rngRange(rng, minLat, maxLat), rngRange(rng, minLon, maxLon)];
    if (pointInPolygon(p, [ring])) return p;
  }
  return district.center;
}

/** Накопленные площади колец — считаются один раз на район. */
function ringWeights(district) {
  if (district.ringWeights) return district.ringWeights;
  let sum = 0;
  district.ringWeights = district.polygon.map((ring) => {
    sum += polygonAreaKm2([ring]);
    return sum;
  });
  return district.ringWeights;
}

function makeAddress(rng, district, index) {
  const street = STREETS[(Math.floor(rng() * STREETS.length) + index) % STREETS.length];
  const house = rngInt(rng, 1, 84);
  const building = rng() < 0.35 ? `, к. ${rngInt(rng, 1, 6)}` : '';
  return `${street}, д. ${house}${building}`;
}

let uid = 0;

function makePoint(rng, district, cell, statusId, index) {
  const latlng = randomInside(rng, district);
  const type = TYPE_BY_ID[cell.typeId];
  const address = makeAddress(rng, district, index);
  uid += 1;

  return {
    id: `obj-${district.id}-${uid}`,
    kind: 'point',
    typeId: cell.typeId,
    typeName: type.name,
    resourceId: cell.resourceId,
    orgId: cell.orgId,
    orgName: ORG_BY_ID[cell.orgId]?.name || '',
    statusId,
    districtId: district.id,
    districtName: district.name,
    okrugId: district.okrugId,
    okrugCode: district.okrugCode,
    latlng,
    address,
    name: makeName(rng, cell, district, index, address),
    regNumber: `${String(rngInt(rng, 1, 99)).padStart(2, '0')}-${String(rngInt(rng, 1, 99)).padStart(2, '0')}-${rngInt(rng, 1000, 9999)}`,
    unom: rngInt(rng, 1000000, 9999999),
    commissioned: rngInt(rng, 1958, 2025),
    capacityMw: round(cell.powerMw / Math.max(1, cell.count), 2),
    wear: rngInt(rng, 4, 78),
    updatedAt: `2026-08-0${rngInt(rng, 1, 7)}`,
  };
}

function makeName(rng, cell, district, index, address) {
  switch (cell.typeId) {
    case 'source': {
      const kinds = SOURCE_KINDS.filter((k) => k.resource === cell.resourceId);
      const kind = kinds.length ? rngPick(rng, kinds) : SOURCE_KINDS[0];
      return `${kind.prefix}-${rngInt(rng, 1, 27)} «${district.name}»`;
    }
    case 'heatpoint':
      return `ЦТП № ${String(rngInt(rng, 1, 12)).padStart(2, '0')}-${String(rngInt(rng, 1, 40)).padStart(2, '0')}-${rngInt(rng, 100, 999)}`;
    case 'substation':
      return `ПС ${rngPick(rng, [6, 10, 20, 35, 110])} кВ «${district.name}-${rngInt(rng, 1, 9)}»`;
    case 'pump':
      return `${cell.resourceId === 'water' ? 'КНС' : 'ПНС'} № ${rngInt(rng, 1, 48)}`;
    case 'consumer':
      return address;
    case 'equipment':
      return `${rngPick(rng, ['Насосный агрегат', 'Теплообменник', 'Запорная арматура', 'Узел учёта', 'Трансформатор'])} № ${rngInt(rng, 1, 60)}`;
    default:
      return `Объект № ${rngInt(rng, 1000, 9999)}`;
  }
}

function makeLine(rng, district, cell, statusId, index) {
  const start = randomInside(rng, district);
  const segments = rngInt(rng, 2, 4);
  const path = [start];
  let bearing = rngRange(rng, 0, 360);
  for (let i = 0; i < segments; i += 1) {
    bearing += rngRange(rng, -55, 55);
    const step = rngRange(rng, 0.18, 0.62);
    const next = project(bearing, step, path[path.length - 1]);
    path.push(next);
  }
  uid += 1;
  const lengthKm = round(cell.networkKm / Math.max(1, cell.count), 3);

  return {
    id: `net-${district.id}-${uid}`,
    kind: 'line',
    typeId: 'network',
    typeName: 'Сеть',
    resourceId: cell.resourceId,
    orgId: cell.orgId,
    orgName: ORG_BY_ID[cell.orgId]?.name || '',
    statusId,
    districtId: district.id,
    districtName: district.name,
    okrugId: district.okrugId,
    okrugCode: district.okrugCode,
    path,
    latlng: path[Math.floor(path.length / 2)],
    name: `${NETWORK_KIND[cell.resourceId] || 'Сеть'}, участок ${rngInt(rng, 1, 40)}`,
    diameter: rngPick(rng, [100, 150, 200, 250, 300, 400, 500, 600, 800]),
    lengthKm,
    address: makeAddress(rng, district, index),
    regNumber: `С-${rngInt(rng, 10, 99)}-${rngInt(rng, 1000, 9999)}`,
    commissioned: rngInt(rng, 1962, 2024),
    wear: rngInt(rng, 6, 84),
    updatedAt: `2026-08-0${rngInt(rng, 1, 7)}`,
  };
}

function round(value, digits) {
  const k = 10 ** digits;
  return Math.round(value * k) / k;
}
