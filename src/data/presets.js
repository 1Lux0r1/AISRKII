/**
 * Шаблоны поиска объектов.
 *
 * Шаблон — это именованный набор фильтров. Встроенные закрывают частые задачи
 * оператора, пользовательские сохраняются в браузере: серверного профиля у
 * демо нет, поэтому используется localStorage. Доступ к нему обёрнут в try:
 * в приватном окне и при запрете хранения данных он бросает исключение.
 */

const STORAGE_KEY = 'rkiie.search-presets.v1';

/** Пустой набор фильтров — основа для любого шаблона. */
export const EMPTY_FILTERS = {
  okrugId: null,
  districtId: null,
  streetId: null,
  customArea: false,
  resources: [],
  orgs: [],
  typesByResource: {},
  statuses: [],
};

/** Встроенные шаблоны под типовые задачи мониторинга. */
export const BUILTIN_PRESETS = [
  {
    id: 'builtin:heat-sources',
    name: 'Теплоснабжение: источники и ЦТП',
    hint: 'Схема теплоснабжения города',
    builtin: true,
    filters: { resources: ['heat'], typesByResource: { heat: ['source', 'heatpoint'] } },
  },
  {
    id: 'builtin:incidents',
    name: 'Технологические нарушения',
    hint: 'Объекты в аварийном состоянии',
    builtin: true,
    filters: { resources: ['heat', 'power', 'water', 'gas', 'storm', 'collector'], statuses: ['alert'] },
  },
  {
    id: 'builtin:attention',
    name: 'Требуют внимания',
    hint: 'Нарушения и замечания вместе',
    builtin: true,
    filters: { resources: ['heat', 'power', 'water', 'gas', 'storm', 'collector'], statuses: ['alert', 'warn'] },
  },
  {
    id: 'builtin:no-data',
    name: 'Сети без данных',
    hint: 'Участки, по которым нет выгрузки',
    builtin: true,
    filters: {
      resources: ['heat', 'power', 'water', 'gas'],
      typesByResource: { heat: ['network'], power: ['network'], water: ['network'], gas: ['network'] },
      statuses: ['nodata'],
    },
  },
  {
    id: 'builtin:substations',
    name: 'Электроснабжение: подстанции',
    hint: 'Питающие центры и распределение',
    builtin: true,
    filters: { resources: ['power'], typesByResource: { power: ['substation'] } },
  },
  {
    id: 'builtin:water-pumps',
    name: 'Водоснабжение: насосные станции',
    hint: 'Подкачка и канализационные станции',
    builtin: true,
    filters: { resources: ['water'], typesByResource: { water: ['pump'] } },
  },
];

/** Приведение произвольного объекта к полному набору фильтров. */
export function normalizeFilters(filters = {}) {
  return {
    ...EMPTY_FILTERS,
    ...filters,
    resources: [...(filters.resources || [])],
    orgs: [...(filters.orgs || [])],
    typesByResource: Object.fromEntries(
      Object.entries(filters.typesByResource || {}).map(([resourceId, list]) => [resourceId, [...list]]),
    ),
    statuses: [...(filters.statuses || [])],
  };
}

function readStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStorage(list) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function userPresets() {
  return readStorage().map((preset) => ({ ...preset, filters: normalizeFilters(preset.filters) }));
}

export function allPresets() {
  // Встроенные шаблоны задают только значимые поля, остальные добираются
  // из пустого набора — иначе потребителям пришлось бы проверять undefined.
  const builtin = BUILTIN_PRESETS.map((preset) => ({
    ...preset,
    filters: normalizeFilters(preset.filters),
  }));
  return [...builtin, ...userPresets()];
}

export function findPreset(id) {
  return allPresets().find((preset) => preset.id === id) || null;
}

/** Сохранение шаблона. Имя уникально: одноимённый перезаписывается. */
export function savePreset(name, filters) {
  const title = String(name).trim();
  if (!title) return null;

  const list = readStorage().filter((preset) => preset.name !== title);
  const preset = {
    id: `user:${Date.now().toString(36)}`,
    name: title,
    filters: normalizeFilters(filters),
    createdAt: new Date().toISOString(),
  };
  list.push(preset);
  return writeStorage(list) ? preset : null;
}

export function deletePreset(id) {
  const list = readStorage().filter((preset) => preset.id !== id);
  return writeStorage(list);
}

/** Краткое описание фильтров шаблона для подсказки в списке. */
export function describeFilters(filters, dictionaries) {
  const { resourceName, typeName, statusName, orgName } = dictionaries;
  const parts = [];
  if (filters.resources.length) parts.push(filters.resources.map(resourceName).join(', '));
  const typeIds = [...new Set(Object.values(filters.typesByResource).flat())];
  if (typeIds.length) parts.push(typeIds.map(typeName).join(', '));
  if (filters.statuses.length) parts.push(filters.statuses.map(statusName).join(', '));
  if (filters.orgs.length) parts.push(filters.orgs.map(orgName).join(', '));
  return parts.join(' · ') || 'Без ограничений';
}
