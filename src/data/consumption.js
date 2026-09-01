/**
 * Потребление ресурсов по территориям.
 *
 * Объёмы выводятся из числа потребителей в реестре, поэтому согласованы с
 * составом объектов: где потребителей больше, там и потребление выше.
 * Единицы — отраслевые (см. поле unit в справочнике ресурсов).
 */

import { RESOURCES, RESOURCE_BY_ID } from './catalog.js';
import { distribute, makeRng, rngRange } from '../utils/rng.js';

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

/**
 * Критическая инфраструктура — объекты, перерыв в снабжении которых
 * недопустим. Категория надёжности определяет требования к резервированию:
 * «I особая» — три независимых источника, «I» — два, «II» — резерв по
 * решению эксплуатирующей организации.
 *
 * share — доля категории в общем числе объектов КИ на территории.
 */
export const CRITICAL_CATEGORIES = [
  { id: 'emergency', name: 'Экстренные службы', reliability: 'I особая', share: 0.05, intensity: 0.8 },
  { id: 'telecom', name: 'Связь и центры обработки данных', reliability: 'I особая', share: 0.07, intensity: 2.4 },
  { id: 'health', name: 'Медицинские учреждения', reliability: 'I', share: 0.16, intensity: 2.1 },
  { id: 'water', name: 'Водоснабжение и водоотведение', reliability: 'I', share: 0.12, intensity: 1.7 },
  { id: 'heatsrc', name: 'Источники теплоснабжения', reliability: 'I', share: 0.13, intensity: 1.9 },
  { id: 'transport', name: 'Транспорт и тоннели', reliability: 'I', share: 0.1, intensity: 1.4 },
  { id: 'education', name: 'Образовательные учреждения', reliability: 'II', share: 0.37, intensity: 1 },
];

/**
 * Категории потребителей — из них складывается структура потребления.
 * Критическая инфраструктура выделена в отдельную долю: это не подмножество
 * бюджетных учреждений, а объекты с особыми требованиями к надёжности,
 * и их вклад в нагрузку нужно видеть отдельно.
 */
export const CONSUMER_GROUPS = [
  { id: 'residential', name: 'Жилой фонд', color: '#1668dc' },
  { id: 'critical', name: 'Критическая инфраструктура', color: '#e5484d', detail: true },
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
    // Критическая инфраструктура считается первой: её доля входит в структуру
    // потребления, поэтому остальные категории делят уже остаток.
    const critical = buildCritical(district.id, consumers);
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
        structure: splitStructure(rng, critical.volumeShare * 100),
      };
    }

    byDistrict.set(district.id, { resources: entry, critical });
  }

  return byDistrict;
}

/**
 * Учёт критической инфраструктуры района. Число объектов выводится из числа
 * потребителей, доля в потреблении — из их удельной нагрузки: больница или
 * ЦОД потребляют кратно больше жилого дома той же площади.
 */
function buildCritical(districtId, consumers) {
  const rng = makeRng(`critical:${districtId}`);
  const totalConsumers = Object.values(consumers).reduce((acc, n) => acc + n, 0);
  const total = Math.max(3, Math.round(totalConsumers * rngRange(rng, 0.012, 0.024)));

  const counts = distribute(total, CRITICAL_CATEGORIES.map((c) => c.share));
  const categories = CRITICAL_CATEGORIES.map((category, i) => ({
    category,
    count: counts[i],
    weight: counts[i] * category.intensity,
  }));
  const weightSum = categories.reduce((acc, c) => acc + c.weight, 0) || 1;

  // Доля КИ в потреблении территории — она заметно выше доли в числе объектов.
  const volumeShare = rngRange(rng, 0.11, 0.23);

  return {
    total,
    volumeShare,
    // share — доля категории внутри КИ. Абсолютная доля в потреблении
    // территории получается умножением на долю КИ из структуры, поэтому
    // числа в детализации всегда складываются в показатель верхнего уровня.
    categories: categories.map((row) => ({ ...row, share: row.weight / weightSum })),
    // Резервирование: второй независимый ввод и собственный источник питания.
    dualFeed: Math.round(total * rngRange(rng, 0.78, 0.97)),
    generator: Math.round(total * rngRange(rng, 0.34, 0.68)),
    autonomyHours: Math.round(rngRange(rng, 8, 72)),
    attention: Math.round(total * rngRange(rng, 0, 0.07)),
  };
}

/** Доли категорий потребителей, в сумме 100 %. Доля КИ задана извне. */
function splitStructure(rng, criticalPct) {
  const residential = rngRange(rng, 52, 68);
  const budget = rngRange(rng, 6, 14);
  const other = Math.max(3, 100 - criticalPct - residential - budget);
  const sum = residential + criticalPct + budget + other;
  const k = 100 / sum;
  return {
    residential: residential * k,
    critical: criticalPct * k,
    budget: budget * k,
    other: other * k,
  };
}

/**
 * Свод потребления по набору районов.
 * resourceIds — если пусто, берутся все ресурсы.
 */
export function aggregateConsumption(byDistrict, districtIds, resourceIds = []) {
  const rows = new Map();
  let totalConsumers = 0;
  // Аккумулятор строится из справочника: при добавлении категории её
  // забыли бы здесь, и доля молча превращалась бы в NaN.
  const structure = Object.fromEntries(CONSUMER_GROUPS.map((group) => [group.id, 0]));
  let structureWeight = 0;

  for (const districtId of districtIds) {
    const entry = byDistrict.get(districtId);
    if (!entry) continue;

    for (const [resourceId, value] of Object.entries(entry.resources)) {
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
      for (const group of CONSUMER_GROUPS) {
        structure[group.id] += (value.structure[group.id] || 0) * value.volume;
      }
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
 * Свод по критической инфраструктуре для набора районов.
 * Доля в потреблении усредняется по числу объектов: складывать проценты
 * разных территорий напрямую нельзя.
 */
export function aggregateCritical(byDistrict, districtIds) {
  let total = 0;
  let dualFeed = 0;
  let generator = 0;
  let attention = 0;
  let autonomyWeighted = 0;
  let volumeShareWeighted = 0;
  const perCategory = new Map();

  for (const districtId of districtIds) {
    const critical = byDistrict.get(districtId)?.critical;
    if (!critical) continue;

    total += critical.total;
    dualFeed += critical.dualFeed;
    generator += critical.generator;
    attention += critical.attention;
    autonomyWeighted += critical.autonomyHours * critical.total;
    volumeShareWeighted += critical.volumeShare * critical.total;

    for (const row of critical.categories) {
      const acc = perCategory.get(row.category.id) || { category: row.category, count: 0, weighted: 0 };
      acc.count += row.count;
      acc.weighted += row.share * critical.total;
      perCategory.set(row.category.id, acc);
    }
  }

  if (!total) return null;

  return {
    total,
    dualFeed,
    generator,
    attention,
    autonomyHours: Math.round(autonomyWeighted / total),
    volumeShare: volumeShareWeighted / total,
    categories: CRITICAL_CATEGORIES.map((category) => {
      const row = perCategory.get(category.id);
      return { category, count: row?.count || 0, share: row ? row.weighted / total : 0 };
    }).filter((row) => row.count > 0),
  };
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
