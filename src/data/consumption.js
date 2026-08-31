/**
 * Потребление ресурсов по территориям.
 *
 * Объёмы выводятся из числа потребителей в реестре, поэтому согласованы с
 * составом объектов: где потребителей больше, там и потребление выше.
 * Единицы — отраслевые (см. поле unit в справочнике ресурсов).
 */

import { RESOURCES, RESOURCE_BY_ID } from './catalog.js';
import { makeRng, rngRange } from '../utils/rng.js';

/** Среднемесячное потребление на одного потребителя. */
const PER_CONSUMER = {
  heat: 28,      // Гкал
  power: 17.5,   // тыс. кВт·ч
  water: 1.75,   // тыс. м³
  gas: 11.5,     // тыс. м³
  storm: 0.85,   // тыс. м³
};

/** Пересчёт месячного объёма в нагрузку в отраслевых единицах. */
const LOAD = {
  heat: (volume, peak) => (volume / 720) * peak,
  power: (volume, peak) => (volume / 720) * peak,
  water: (volume, peak) => ((volume * 1000) / 30) * peak,
  gas: (volume, peak) => ((volume * 1000) / 720) * peak,
  storm: (volume, peak) => ((volume * 1000) / (30 * 86400)) * 1000 * peak,
};

/** Категории потребителей — из них складывается структура потребления. */
export const CONSUMER_GROUPS = [
  { id: 'residential', name: 'Жилой фонд', color: '#1668dc' },
  { id: 'budget', name: 'Бюджетные учреждения', color: '#17a673' },
  { id: 'other', name: 'Прочие потребители', color: '#8593a6' },
];

/**
 * Показатели потребления по каждому району и ресурсу.
 * cellsByDistrict — индекс ячеек реестра, из него берётся число потребителей.
 */
export function buildConsumption(districts, cellsByDistrict) {
  const byDistrict = new Map();

  for (const district of districts) {
    const cells = cellsByDistrict.get(district.id) || [];
    const consumers = {};
    for (const cell of cells) {
      if (cell.typeId !== 'consumer') continue;
      consumers[cell.resourceId] = (consumers[cell.resourceId] || 0) + cell.count;
    }

    const rng = makeRng(`consumption:${district.id}`);
    const entry = {};

    for (const resource of RESOURCES) {
      const norm = PER_CONSUMER[resource.id];
      const count = consumers[resource.id] || 0;
      if (!norm || !count) continue;

      // Разброс по районам: застройка, этажность и износ сетей различаются.
      const factor = rngRange(rng, 0.78, 1.28);
      const volume = count * norm * factor;
      const peak = rngRange(rng, 1.6, 2.4);

      entry[resource.id] = {
        resourceId: resource.id,
        consumers: count,
        volume,
        load: LOAD[resource.id](volume, peak),
        perConsumer: volume / count,
        deltaPct: rngRange(rng, -11, 14),
        structure: splitStructure(rng),
      };
    }

    byDistrict.set(district.id, entry);
  }

  return byDistrict;
}

/** Доли категорий потребителей, в сумме 100 %. */
function splitStructure(rng) {
  const residential = rngRange(rng, 54, 76);
  const budget = rngRange(rng, 8, 22);
  const other = 100 - residential - budget;
  return { residential, budget, other: Math.max(2, other) };
}

/**
 * Свод потребления по набору районов.
 * resourceIds — если пусто, берутся все ресурсы.
 */
export function aggregateConsumption(byDistrict, districtIds, resourceIds = []) {
  const rows = new Map();
  let totalConsumers = 0;
  const structure = { residential: 0, budget: 0, other: 0 };
  let structureWeight = 0;

  for (const districtId of districtIds) {
    const entry = byDistrict.get(districtId);
    if (!entry) continue;

    for (const [resourceId, value] of Object.entries(entry)) {
      if (resourceIds.length && !resourceIds.includes(resourceId)) continue;

      let row = rows.get(resourceId);
      if (!row) {
        row = { resourceId, volume: 0, load: 0, consumers: 0, deltaWeighted: 0 };
        rows.set(resourceId, row);
      }
      row.volume += value.volume;
      row.load += value.load;
      row.consumers += value.consumers;
      row.deltaWeighted += value.deltaPct * value.volume;

      totalConsumers += value.consumers;
      structureWeight += value.volume;
      structure.residential += value.structure.residential * value.volume;
      structure.budget += value.structure.budget * value.volume;
      structure.other += value.structure.other * value.volume;
    }
  }

  const list = [...rows.values()]
    .map((row) => ({
      ...row,
      resource: RESOURCE_BY_ID[row.resourceId],
      deltaPct: row.volume ? row.deltaWeighted / row.volume : 0,
      perConsumer: row.consumers ? row.volume / row.consumers : 0,
    }))
    .sort((a, b) => RESOURCES.indexOf(a.resource) - RESOURCES.indexOf(b.resource));

  const shares = structureWeight
    ? CONSUMER_GROUPS.map((group) => ({ group, share: structure[group.id] / structureWeight }))
    : [];

  return { rows: list, totalConsumers, structure: shares };
}

/**
 * Формат объёма: крупные значения переводятся на ступень выше.
 * Единицы вроде «тыс. м³» уже содержат множитель, поэтому следующая
 * ступень для них — миллионы, а не «тыс. тыс.».
 */
export function formatVolume(value, unit) {
  if (value < 1000) return { value, unit, digits: value >= 100 ? 0 : 1 };
  const scaled = value / 1000;
  if (unit.startsWith('тыс. ')) return { value: scaled, unit: `млн ${unit.slice(5)}`, digits: 1 };
  return { value: scaled, unit: `тыс. ${unit}`, digits: 1 };
}
