/**
 * Реестр показателей.
 *
 * Система агрегирует данные, поступающие от РСО, поэтому в демо хранится не
 * список из сотен тысяч объектов, а разреженная таблица ячеек агрегации
 * (район × тип × ресурс × организация). Городские итоги калибруются по
 * контрольным значениям CITY_TARGETS, а суммы по округам и районам получаются
 * из тех же ячеек — расхождений между уровнями нет по построению.
 */

import {
  CITY_TARGETS,
  OBJECT_TYPES,
  ORGANIZATIONS,
  RESOURCES,
  STATUSES,
  TYPE_RESOURCE_MIX,
} from './catalog.js';
import { distribute, makeRng } from '../utils/rng.js';

/** Доли организаций внутри ресурса. */
const ORG_MIX = {
  heat: { moek: 0.56, mosenergo: 0.29, mtk: 0.15 },
  power: { rosseti: 0.48, oek: 0.31, 'mos-sbyt': 0.13, mosenergo: 0.08 },
  water: { mvk: 0.78, mosvodostok: 0.22 },
  gas: { mosgaz: 0.86, mosoblgaz: 0.14 },
  storm: { mosvodostok: 1 },
  collector: { moskollektor: 1 },
};

/** Удельная мощность объекта, МВт. */
const UNIT_POWER = { source: 220, heatpoint: 3.4, substation: 12.5, pump: 1.8 };

/** Средняя протяжённость участка сети, км (для распределения общей длины). */
const NETWORK_TYPES = new Set(['network']);

export function buildRegistry(territories) {
  const districts = [];
  for (const okrug of territories) {
    for (const district of okrug.districts) {
      districts.push({ ...district, okrugKind: okrug.kind, okrugName: okrug.name });
    }
  }

  // Вес района: площадь с поправкой на плотность застройки (центр плотнее).
  const weights = districts.map((d) => {
    const rng = makeRng(`weight:${d.id}`);
    const densityByKind = d.okrugKind === 'core' ? 2.2 : d.okrugKind === 'detached' ? 0.1 : 1;
    return d.areaKm2 * densityByKind * (0.62 + rng() * 0.86);
  });

  const cells = [];
  const districtIndex = new Map();
  districts.forEach((d, i) => districtIndex.set(d.id, i));

  // 1. Контрольные городские значения раскладываются по районам.
  const perDistrictByType = {};
  for (const type of OBJECT_TYPES) {
    perDistrictByType[type.id] = distribute(CITY_TARGETS[type.id], weights);
  }
  // Крупных источников на весь город десятки: при прямой раскладке по районам
  // целые округа остаются пустыми. Сначала делим по округам, затем внутри округа.
  perDistrictByType.source = distributeByOkrug(CITY_TARGETS.source, districts, weights);
  const perDistrictKm = distribute(Math.round(CITY_TARGETS.networkKm * 10), weights).map((v) => v / 10);

  // 2. Внутри района — по ресурсам и организациям.
  districts.forEach((district, i) => {
    const rng = makeRng(`cells:${district.id}`);
    const statusProfile = makeStatusProfile(district.id);
    let districtNetworkCount = 0;
    const networkCells = [];

    for (const type of OBJECT_TYPES) {
      const typeTotal = perDistrictByType[type.id][i];
      if (!typeTotal) continue;

      const mix = TYPE_RESOURCE_MIX[type.id];
      const resIds = Object.keys(mix);
      // Небольшая вариация профиля района, чтобы карта не выглядела однородной.
      const resWeights = resIds.map((r) => mix[r] * (0.75 + rng() * 0.5));
      const perResource = distribute(typeTotal, resWeights);

      resIds.forEach((resourceId, ri) => {
        const resTotal = perResource[ri];
        if (!resTotal) return;
        const orgMix = ORG_MIX[resourceId];
        const orgIds = Object.keys(orgMix);
        const orgWeights = orgIds.map((o) => orgMix[o] * (0.8 + rng() * 0.4));
        const perOrg = distribute(resTotal, orgWeights);

        orgIds.forEach((orgId, oi) => {
          const count = perOrg[oi];
          if (!count) return;
          const cell = {
            districtId: district.id,
            okrugId: district.okrugId,
            typeId: type.id,
            resourceId,
            orgId,
            count,
            status: splitStatus(count, statusProfile, `${district.id}:${type.id}:${resourceId}:${orgId}`),
            powerMw: (UNIT_POWER[type.id] || 0) * count * (0.8 + rng() * 0.4),
            networkKm: 0,
          };
          cells.push(cell);
          if (NETWORK_TYPES.has(type.id)) {
            networkCells.push(cell);
            districtNetworkCount += count;
          }
        });
      });
    }

    // Протяжённость сетей района раскладывается по участкам пропорционально их числу.
    if (districtNetworkCount > 0) {
      for (const cell of networkCells) {
        cell.networkKm = (perDistrictKm[i] * cell.count) / districtNetworkCount;
      }
    }
  });

  return {
    cells,
    districts,
    districtIndex,
    weights,
  };
}

/** Раскладка редкого типа: сначала по округам, затем по районам внутри округа. */
function distributeByOkrug(total, districts, weights) {
  const okrugIds = [...new Set(districts.map((d) => d.okrugId))];
  const okrugWeights = okrugIds.map((id) =>
    districts.reduce((acc, d, i) => (d.okrugId === id ? acc + weights[i] : acc), 0),
  );
  const perOkrug = distribute(total, okrugWeights);
  const result = new Array(districts.length).fill(0);

  okrugIds.forEach((id, oi) => {
    const indexes = districts.map((d, i) => (d.okrugId === id ? i : -1)).filter((i) => i >= 0);
    const parts = distribute(perOkrug[oi], indexes.map((i) => weights[i]));
    indexes.forEach((i, k) => {
      result[i] = parts[k];
    });
  });
  return result;
}

function makeStatusProfile(seed) {
  const rng = makeRng(`status:${seed}`);
  const alert = 0.004 + rng() * 0.016;
  const warn = 0.04 + rng() * 0.09;
  const nodata = 0.01 + rng() * 0.05;
  return { alert, warn, nodata, ok: 1 - alert - warn - nodata };
}

function splitStatus(count, profile, seed) {
  const rng = makeRng(seed);
  const weights = STATUSES.map((s) => Math.max(0.0001, profile[s.id] * (0.7 + rng() * 0.6)));
  const parts = distribute(count, weights);
  const out = {};
  STATUSES.forEach((s, i) => {
    out[s.id] = parts[i];
  });
  return out;
}

/** Пустая сводка нужного вида. */
export function emptyStats() {
  const stats = {
    total: 0,
    networkKm: 0,
    powerMw: 0,
    byType: {},
    byResource: {},
    byGroup: {},
    byOrg: {},
    byStatus: {},
  };
  for (const t of OBJECT_TYPES) stats.byType[t.id] = 0;
  for (const r of RESOURCES) stats.byResource[r.id] = 0;
  for (const o of ORGANIZATIONS) stats.byOrg[o.id] = 0;
  for (const s of STATUSES) stats.byStatus[s.id] = 0;
  return stats;
}

/**
 * Свод по набору ячеек с учётом фильтра.
 * filter: { resources: [], typesByResource: {}, orgs: [], statuses: [],
 *           districtIds: Set|null, okrugIds: Set|null }
 *
 * typesByResource ограничивает типы отдельно для каждого ресурса: «Сеть»
 * может быть нужна в теплоснабжении и не нужна в электроснабжении.
 */
export function aggregate(cells, filter = {}) {
  const stats = emptyStats();
  const {
    resources = null,
    typesByResource = null,
    orgs = null,
    statuses = null,
    districtIds = null,
    okrugIds = null,
  } = filter;

  for (const cell of cells) {
    if (districtIds && !districtIds.has(cell.districtId)) continue;
    if (okrugIds && !okrugIds.has(cell.okrugId)) continue;
    if (resources && resources.length && !resources.includes(cell.resourceId)) continue;
    if (typesByResource) {
      const allowed = typesByResource[cell.resourceId];
      if (allowed && allowed.length && !allowed.includes(cell.typeId)) continue;
    }
    if (orgs && orgs.length && !orgs.includes(cell.orgId)) continue;

    let count = cell.count;
    let share = 1;
    if (statuses && statuses.length) {
      count = statuses.reduce((acc, s) => acc + (cell.status[s] || 0), 0);
      if (!count) continue;
      share = count / cell.count;
    }

    stats.total += count;
    stats.byType[cell.typeId] += count;
    stats.byResource[cell.resourceId] += count;
    stats.byOrg[cell.orgId] += count;
    stats.networkKm += cell.networkKm * share;
    stats.powerMw += cell.powerMw * share;
    for (const s of STATUSES) {
      stats.byStatus[s.id] += statuses && statuses.length && !statuses.includes(s.id) ? 0 : cell.status[s.id];
    }
  }

  for (const type of OBJECT_TYPES) {
    stats.byGroup[type.group] = (stats.byGroup[type.group] || 0) + stats.byType[type.id];
  }
  return stats;
}

/** Индекс «район → ячейки» для быстрых повторных сводок. */
export function indexByDistrict(cells) {
  const map = new Map();
  for (const cell of cells) {
    let list = map.get(cell.districtId);
    if (!list) map.set(cell.districtId, (list = []));
    list.push(cell);
  }
  return map;
}

export function indexByOkrug(cells) {
  const map = new Map();
  for (const cell of cells) {
    let list = map.get(cell.okrugId);
    if (!list) map.set(cell.okrugId, (list = []));
    list.push(cell);
  }
  return map;
}
