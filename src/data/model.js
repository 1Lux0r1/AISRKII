/**
 * Модель предметной области: единая точка доступа к территориям, реестру
 * показателей, объектам карты и событиям мониторинга.
 */

import {
  CITY,
  OKRUG_BY_ID,
  ORGANIZATIONS,
  ORG_BY_ID,
  RESOURCE_BY_ID,
} from './catalog.js';
import { bounds, buildTerritories, pointInPolygon, polygonAreaKm2, slug } from './geo.js';
import { aggregate, buildRegistry, indexByDistrict, indexByOkrug } from './registry.js';
import { districtFeatures, sourceFeatures } from './features.js';
import { buildIncidents, countByDistrict, countByOkrug } from './incidents.js';
import { aggregateConsumption, aggregateCritical, buildConsumption } from './consumption.js';
import { buildSourceZones, buildThematicMetrics, consumptionIndex } from './thematic.js';

export const territories = buildTerritories();
export const okrugById = new Map(territories.map((o) => [o.id, o]));
export const districts = territories.flatMap((o) => o.districts);
export const districtById = new Map(districts.map((d) => [d.id, d]));

const registry = buildRegistry(territories);
export const cells = registry.cells;
export const cellsByDistrict = indexByDistrict(cells);
export const cellsByOkrug = indexByOkrug(cells);

export const consumptionByDistrict = buildConsumption(districts, cellsByDistrict);

/** Свод потребления по районам с учётом фильтра по ресурсам. */
export function consumptionFor(districtIds, resourceIds = []) {
  return aggregateConsumption(consumptionByDistrict, districtIds, resourceIds);
}

/** Районы, попадающие в территориальный охват, — основа для сводки потребления. */
export function districtIdsOfScope(scope) {
  if (scope.districtIds) return [...scope.districtIds];
  if (scope.okrugIds) {
    return [...scope.okrugIds].flatMap((id) => (okrugById.get(id)?.districts || []).map((d) => d.id));
  }
  return districts.map((d) => d.id);
}

/** Свод по критической инфраструктуре набора районов. */
export function criticalFor(districtIds) {
  return aggregateCritical(consumptionByDistrict, districtIds);
}

export const incidents = buildIncidents(territories);
export const incidentsByOkrug = countByOkrug(incidents);
export const incidentsByDistrict = countByDistrict(incidents);

/** Все крупные источники — используются в глобальном поиске. */
export const allSources = districts.flatMap((d) => sourceFeatures(d, cellsByDistrict.get(d.id) || []));

export const thematicMetrics = buildThematicMetrics(districts, consumptionByDistrict);
export const sourceZones = buildSourceZones(districts, allSources);

/** Показатель района для тематического слоя. */
export function districtMetric(layerId, districtId, resourceIds = []) {
  if (layerId === 'wear') return thematicMetrics.wear.get(districtId) ?? 0;
  if (layerId === 'consumption') return consumptionIndex(thematicMetrics, districtId, resourceIds);
  return 0;
}

/** Источник, обслуживающий район по выбранному ресурсу. */
export function districtSource(districtId, resourceIds = []) {
  const resourceId = resourceIds.length === 1 ? resourceIds[0] : 'heat';
  return sourceZones.get(resourceId)?.get(districtId) || null;
}

/**
 * Диапазон показателя для нормировки шкалы. По умолчанию — по районам, но на
 * городском масштабе закрашиваются округа: их средние лежат в узкой полосе,
 * и по районной шкале карта стала бы одноцветной. Поэтому диапазон считается
 * по тем же группам, которые и раскрашиваются.
 */
export function metricRange(layerId, resourceIds = [], groups = null) {
  const list = groups && groups.length ? groups : districts.map((d) => [d.id]);
  let min = Infinity;
  let max = -Infinity;
  for (const ids of list) {
    if (!ids.length) continue;
    let sum = 0;
    for (const id of ids) sum += districtMetric(layerId, id, resourceIds);
    const value = sum / ids.length;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!Number.isFinite(min)) return { min: 0, max: 1 };
  return { min, max: max > min ? max : min + 1 };
}

/** Районы каждого округа — группы для окружной шкалы. */
export const okrugGroups = territories
  .filter((okrug) => !okrug.approximate)
  .map((okrug) => okrug.districts.map((d) => d.id));


/** Границы «старой» Москвы — начальный экстент карты, как в макете. */
export const CITY_BOUNDS = (() => {
  let minLat = Infinity, minLon = Infinity, maxLat = -Infinity, maxLon = -Infinity;
  for (const okrug of territories) {
    if (okrug.kind === 'detached') continue;
    const [[a, b], [c, d]] = okrug.bounds;
    minLat = Math.min(minLat, a); minLon = Math.min(minLon, b);
    maxLat = Math.max(maxLat, c); maxLon = Math.max(maxLon, d);
  }
  return [[minLat, minLon], [maxLat, maxLon]];
})();

/** Улицы, встречающиеся в адресах объектов округа (для фильтра «Улица / квартал»). */
const STREET_POOL = [
  'Зелёный просп.', 'Электродная ул.', 'Мартеновская ул.', 'Плеханова ул.',
  '1-я Владимирская ул.', 'Кусковская ул.', 'Перовская ул.', 'Шоссе Энтузиастов',
  'Свободный просп.', 'Профсоюзная ул.', 'Ленинский просп.', 'Каширское ш.',
  'Варшавское ш.', 'Волгоградский просп.', 'Рязанский просп.', 'Ярославское ш.',
  'Дмитровское ш.', 'Ленинградский просп.', 'Кутузовский просп.', 'Мира просп.',
];

export const streets = STREET_POOL.map((name) => ({ id: slug(name), name }));

/** Собрать фильтр реестра из состояния приложения. */
export function filterFromState(state) {
  const f = state.filters;
  const scope = scopeFromState(state);
  return {
    resources: f.resources,
    typesByResource: f.typesByResource,
    orgs: f.orgs,
    statuses: f.statuses,
    districtIds: scope.districtIds,
    okrugIds: scope.okrugIds,
  };
}

/** Территориальный охват: что именно попадает в сводку. */
export function scopeFromState(state) {
  const f = state.filters;
  if (state.customArea) {
    const ids = new Set(districtsInPolygon(state.customArea).map((d) => d.id));
    return { kind: 'area', districtIds: ids, okrugIds: null, label: 'Произвольная область' };
  }
  if (f.districtId) {
    return {
      kind: 'district',
      districtIds: new Set([f.districtId]),
      okrugIds: null,
      label: districtById.get(f.districtId)?.name || '',
    };
  }
  if (f.okrugId) {
    return {
      kind: 'okrug',
      districtIds: null,
      okrugIds: new Set([f.okrugId]),
      label: OKRUG_BY_ID[f.okrugId]?.name || '',
    };
  }
  return { kind: 'city', districtIds: null, okrugIds: null, label: CITY.name };
}

/** Сводка для произвольного охвата с учётом фильтров. */
export function statsFor(filter) {
  let source = cells;
  if (filter.districtIds && filter.districtIds.size === 1) {
    source = cellsByDistrict.get([...filter.districtIds][0]) || [];
  } else if (filter.okrugIds && filter.okrugIds.size === 1) {
    source = cellsByOkrug.get([...filter.okrugIds][0]) || [];
  }
  return aggregate(source, filter);
}

/** Сводка по району без территориального фильтра, но с учётом остальных. */
export function districtStats(districtId, filter = {}) {
  return aggregate(cellsByDistrict.get(districtId) || [], {
    resources: filter.resources,
    typesByResource: filter.typesByResource,
    orgs: filter.orgs,
    statuses: filter.statuses,
  });
}

export function okrugStats(okrugId, filter = {}) {
  return aggregate(cellsByOkrug.get(okrugId) || [], {
    resources: filter.resources,
    typesByResource: filter.typesByResource,
    orgs: filter.orgs,
    statuses: filter.statuses,
  });
}

/**
 * Районы, пересекающиеся с произвольной областью.
 *
 * Одной проверки центроида мало: область, нарисованная целиком внутри
 * крупного района, не содержала бы ни одного центроида и считалась пустой.
 * Поэтому дополнительно проверяется, попала ли хоть одна вершина области
 * в район и хоть одна вершина района — в область. Это не полноценное
 * пересечение полигонов, но покрывает все практические случаи выделения.
 */
export function districtsInPolygon(polygon) {
  if (!polygon || polygon.length < 3) return [];
  const areaBox = bounds(polygon);

  return districts.filter((district) => {
    if (!boxesOverlap(areaBox, district.bounds)) return false;
    if (pointInPolygon(district.center, polygon)) return true;
    // Область внутри района.
    if (polygon.some((point) => pointInPolygon(point, district.polygon))) return true;
    // Частичное перекрытие: часть района попала в область.
    return district.polygon.some((ring) => ring.some((point) => pointInPolygon(point, polygon)));
  });
}

function boxesOverlap([[aMinLat, aMinLon], [aMaxLat, aMaxLon]], [[bMinLat, bMinLon], [bMaxLat, bMaxLon]]) {
  return !(aMaxLat < bMinLat || aMinLat > bMaxLat || aMaxLon < bMinLon || aMinLon > bMaxLon);
}

export function areaOfPolygon(polygon) {
  return polygon && polygon.length >= 3 ? polygonAreaKm2(polygon) : 0;
}

/** Районы, пересекающиеся с текущим экстентом карты. */
export function districtsInBounds(box, limit = 24) {
  const [[minLat, minLon], [maxLat, maxLon]] = box;
  const out = [];
  for (const d of districts) {
    const [[dMinLat, dMinLon], [dMaxLat, dMaxLon]] = d.bounds;
    if (dMaxLat < minLat || dMinLat > maxLat || dMaxLon < minLon || dMinLon > maxLon) continue;
    out.push(d);
    if (out.length >= limit) break;
  }
  return out;
}

/** Объекты района с учётом фильтров. */
export function featuresOfDistrict(districtId, filter = {}) {
  const district = districtById.get(districtId);
  if (!district) return { points: [], lines: [], sampled: 1, registryTotal: 0, drawnTotal: 0 };
  const raw = districtFeatures(district, cellsByDistrict.get(districtId) || []);
  const match = (f) =>
    (!filter.resources?.length || filter.resources.includes(f.resourceId)) &&
    typeAllowed(filter, f) &&
    (!filter.orgs?.length || filter.orgs.includes(f.orgId)) &&
    (!filter.statuses?.length || filter.statuses.includes(f.statusId));

  return {
    points: raw.points.filter(match),
    lines: raw.lines.filter(match),
    sampled: raw.sampled,
    registryTotal: raw.registryTotal,
    drawnTotal: raw.drawnTotal,
  };
}

/** Разрешён ли тип объекта в рамках его ресурса. */
function typeAllowed(filter, feature) {
  const allowed = filter.typesByResource?.[feature.resourceId];
  return !allowed || !allowed.length || allowed.includes(feature.typeId);
}

export function findFeature(id) {
  const match = /^(?:obj|net)-([a-z0-9-]+?)-\d+$/.exec(id);
  if (!match) return null;
  const districtId = match[1];
  const bundle = featuresOfDistrict(districtId);
  return [...bundle.points, ...bundle.lines].find((f) => f.id === id) || null;
}

/** Организации, представленные в охвате, отсортированные по числу объектов. */
export function organizationBreakdown(stats) {
  return ORGANIZATIONS.map((org) => ({ org, count: stats.byOrg[org.id] || 0 }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
}

/** Глобальный поиск: округа, районы, организации, крупные источники. */
export function search(query, limit = 18) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const results = [];

  for (const okrug of territories) {
    if (matches(okrug.name, q) || matches(okrug.code, q)) {
      results.push({ kind: 'okrug', id: okrug.id, title: okrug.name, sub: `Административный округ · ${okrug.code}` });
    }
  }
  for (const d of districts) {
    if (matches(d.name, q)) {
      results.push({ kind: 'district', id: d.id, title: d.name, sub: `Район · ${OKRUG_BY_ID[d.okrugId]?.code || ''}` });
    }
  }
  for (const org of ORGANIZATIONS) {
    if (matches(org.name, q)) {
      results.push({
        kind: 'org',
        id: org.id,
        title: org.name,
        sub: `Организация · ${org.resources.map((r) => RESOURCE_BY_ID[r].short).join(', ')}`,
      });
    }
  }
  for (const src of allSources) {
    if (matches(src.name, q) || matches(src.address, q)) {
      results.push({
        kind: 'object',
        id: src.id,
        title: src.name,
        sub: `${src.typeName} · ${src.districtName}`,
        feature: src,
      });
    }
  }
  for (const inc of incidents) {
    if (matches(inc.id, q) || matches(inc.title, q)) {
      results.push({ kind: 'incident', id: inc.id, title: inc.id, sub: inc.title });
    }
  }

  return results.slice(0, limit);
}

function matches(text, q) {
  return String(text).toLowerCase().includes(q);
}

export { ORG_BY_ID, OKRUG_BY_ID, RESOURCE_BY_ID };
