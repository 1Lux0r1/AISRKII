/**
 * Тематические слои карты.
 *
 * Кроме административного деления карта умеет окрашивать территории по
 * показателю: износу сетей, интенсивности потребления и зоне действия
 * источника. Показатели считаются по районам — это наименьшая территория,
 * по которой в реестре есть сводные данные.
 */

import { RESOURCES } from './catalog.js';
import { distanceKm } from './geo.js';
import { makeRng, rngRange } from '../utils/rng.js';
import { adjust } from '../utils/color.js';

export const THEMATIC_LAYERS = [
  {
    id: 'admin',
    name: 'Административное деление',
    hint: 'округа и районы',
    kind: 'admin',
  },
  {
    id: 'wear',
    name: 'Износ сетей и оборудования',
    hint: 'где хозяйство старше',
    kind: 'scale',
    unit: '%',
    // От зелёного к красному: износ — это шкала риска, а не просто величина.
    ramp: ['#17a673', '#8cc63f', '#f5c518', '#f5842a', '#e5484d'],
    legend: ['новое', 'предельный износ'],
  },
  {
    id: 'consumption',
    name: 'Интенсивность потребления',
    hint: 'где нагрузка выше',
    kind: 'scale',
    unit: '×',
    ramp: ['#e8f0fb', '#a9c8f0', '#5f96e0', '#2b6cc4', '#123f80'],
    legend: ['низкое', 'высокое'],
  },
  {
    id: 'sources',
    name: 'Зоны действия источников',
    hint: 'какой источник питает район',
    kind: 'category',
  },
];

export const THEMATIC_BY_ID = Object.fromEntries(THEMATIC_LAYERS.map((l) => [l.id, l]));

/** Палитра для зон действия: цвета должны различаться у соседних зон. */
const ZONE_COLORS = [
  '#1668dc', '#17a673', '#e5484d', '#f5842a', '#8b5cf6', '#0ea5b7',
  '#c026d3', '#65a30d', '#d97706', '#0369a1', '#be123c', '#4d7c0f',
];

/**
 * Износ по району. Значение задаётся здесь и используется генератором
 * объектов как центр разброса, поэтому агрегат и отдельные объекты
 * не расходятся между собой.
 */
export function districtWear(districtId) {
  const rng = makeRng(`wear:${districtId}`);
  return rngRange(rng, 18, 74);
}

/**
 * Метрики районов для тематических слоёв.
 * consumption — безразмерный индекс: объёмы разных ресурсов несопоставимы,
 * поэтому каждый нормируется на свою медиану по городу и они складываются.
 */
export function buildThematicMetrics(districts, consumptionByDistrict) {
  const wear = new Map();
  const volumes = new Map();

  for (const district of districts) {
    wear.set(district.id, districtWear(district.id));
    const entry = consumptionByDistrict.get(district.id);
    if (!entry) continue;
    for (const [resourceId, value] of Object.entries(entry.resources)) {
      if (!volumes.has(resourceId)) volumes.set(resourceId, new Map());
      volumes.get(resourceId).set(district.id, value.volume);
    }
  }

  // Медиана по каждому ресурсу — база нормировки.
  const medians = new Map();
  for (const [resourceId, byDistrict] of volumes) {
    const sorted = [...byDistrict.values()].sort((a, b) => a - b);
    medians.set(resourceId, sorted[sorted.length >> 1] || 1);
  }

  return { wear, volumes, medians };
}

/** Индекс потребления района по выбранным ресурсам. */
export function consumptionIndex(metrics, districtId, resourceIds) {
  const list = resourceIds.length ? resourceIds : RESOURCES.map((r) => r.id);
  let index = 0;
  let counted = 0;
  for (const resourceId of list) {
    const byDistrict = metrics.volumes.get(resourceId);
    if (!byDistrict) continue;
    const value = byDistrict.get(districtId);
    if (value == null) continue;
    index += value / (metrics.medians.get(resourceId) || 1);
    counted += 1;
  }
  return counted ? index / counted : 0;
}

/**
 * Зоны действия источников: район относится к ближайшему источнику ресурса.
 * Это упрощение — в действительности зона определяется схемой сетей, — но
 * оно даёт корректную по смыслу картину при отсутствии модели сети.
 */
export function buildSourceZones(districts, sources) {
  const byResource = new Map();

  for (const resource of RESOURCES) {
    const list = sources.filter((source) => source.resourceId === resource.id);
    if (!list.length) continue;

    const assignment = new Map();
    for (const district of districts) {
      let best = list[0];
      let bestDistance = Infinity;
      for (const source of list) {
        const distance = distanceKm(district.center, source.latlng);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = source;
        }
      }
      assignment.set(district.id, best);
    }
    byResource.set(resource.id, assignment);
  }

  return byResource;
}

/**
 * Цвет зоны по идентификатору источника — устойчив между перерисовками.
 *
 * Источников заметно больше, чем цветов в палитре, поэтому каждый следующий
 * круг сдвигается по светлоте: иначе в легенде рядом оказывались бы две зоны
 * одного цвета и по карте их было бы не различить.
 */
export function zoneColor(sourceId, order) {
  const base = ZONE_COLORS[order % ZONE_COLORS.length];
  const round = Math.floor(order / ZONE_COLORS.length);
  if (!round) return base;
  const steps = [0, 0.16, -0.13, 0.28, -0.22, 0.09];
  return adjust(base, { lightness: steps[round % steps.length], saturation: round > 3 ? -0.12 : 0 });
}

/** Цвет на шкале слоя по нормированному значению 0…1. */
export function rampColor(layer, t) {
  const ramp = layer.ramp;
  const clamped = Math.min(1, Math.max(0, t));
  const position = clamped * (ramp.length - 1);
  const index = Math.min(ramp.length - 2, Math.floor(position));
  return mix(ramp[index], ramp[index + 1], position - index);
}

function mix(from, to, k) {
  const parse = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [r1, g1, b1] = parse(from);
  const [r2, g2, b2] = parse(to);
  const channel = (a, b) => Math.round(a + (b - a) * k).toString(16).padStart(2, '0');
  return `#${channel(r1, r2)}${channel(g1, g2)}${channel(b1, b2)}`;
}
