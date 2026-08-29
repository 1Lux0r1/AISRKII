/**
 * Хранилище состояния приложения.
 *
 * Никаких зависимостей: подписка на изменения + иммутабельный патч.
 * Каждое изменение помечается набором «тем» (topics), чтобы подписчики
 * перерисовывали только нужные части интерфейса.
 */

import { CITY } from './data/catalog.js';

const initial = {
  /** Активный раздел верхней навигации. */
  section: 'map',

  /** Фильтры. */
  filters: {
    okrugId: null,
    districtId: null,
    streetId: null,
    customArea: false,
    resources: [],
    orgs: [],
    types: [],
    statuses: [],
  },

  /** Что показывает панель сведений: город, округ, район, область или объект. */
  selection: { kind: 'city', id: CITY.id },

  /** Карточка территории поверх карты. */
  card: null,

  /** Карта. */
  map: { center: CITY.center, zoom: 10, scale: 'city' },

  /** Интерфейс. */
  ui: {
    sidebarCollapsed: false,
    inspectorOpen: true,
    inspectorTab: 'overview',
    viewMode: true,
    tool: null,
    legend: true,
    collapsedSections: {},
    search: '',
    loading: false,
  },

  /** Пользовательская область на карте. */
  customArea: null,

  /** Дата актуальности данных. */
  actualOn: CITY.actualOn,
};

let state = structuredClone(initial);
const listeners = new Set();

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Обновление состояния. patch — частичный объект (мержится на два уровня),
 * topics — список тем для подписчиков.
 */
export function setState(patch, topics = []) {
  const next = { ...state };
  for (const [key, value] of Object.entries(patch)) {
    const prev = state[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && prev && typeof prev === 'object' && !Array.isArray(prev)) {
      next[key] = { ...prev, ...value };
    } else {
      next[key] = value;
    }
  }
  state = next;
  const list = Array.isArray(topics) ? topics : [topics];
  for (const fn of listeners) fn(state, list);
}

export function resetFilters() {
  setState(
    {
      filters: structuredClone(initial.filters),
      customArea: null,
      selection: { kind: 'city', id: CITY.id },
      card: null,
    },
    ['filters', 'selection', 'map', 'card'],
  );
}

/** Переключение значения в массиве-фильтре. */
export function toggleInFilter(key, value) {
  const list = state.filters[key] || [];
  const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  setState({ filters: { [key]: next } }, ['filters', 'map', 'selection']);
}

export function isFilterActive(filters) {
  return Boolean(
    filters.okrugId ||
      filters.districtId ||
      filters.streetId ||
      filters.customArea ||
      filters.resources.length ||
      filters.orgs.length ||
      filters.types.length ||
      filters.statuses.length,
  );
}
