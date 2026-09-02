/**
 * РКИИЭ 2.0 — демонстрационный стенд мониторинга объектов ресурсоснабжения.
 * Точка сборки: связывает состояние, карту и панели интерфейса.
 */

import { el, mount } from './utils/dom.js';
import { getState, setState, subscribe } from './state.js';
import { createHeader } from './ui/header.js';
import { createChips } from './ui/chips.js';
import { createFilters } from './ui/filters.js';
import { createMap } from './ui/map.js';
import { createInspector } from './ui/inspector.js';
import { createObjectModal } from './ui/objectmodal.js';
import { createLayerModal } from './ui/layermodal.js';
import { createSections } from './ui/sections.js';
import { createFooter } from './ui/footer.js';
import { toast } from './ui/toast.js';
import {
  districtById,
  districtsOfSource,
  districtsInPolygon,
  featuresOfDistrict,
  filterFromState,
  okrugById,
  scopeFromState,
  statsFor,
} from './data/model.js';
import { formatInt } from './utils/format.js';
import { centroid } from './data/geo.js';

const root = document.getElementById('app');
const main = el('main.main');
const mapHost = el('div.mapwrap');

/* --------------------------- компоненты --------------------------- */

const header = createHeader({
  onNavigate: (section) => {
    setState({ section }, ['section']);
  },
  onPick: handleSearchPick,
});

const chips = createChips({ onChange: handleFilterChange });
const filters = createFilters({ onChange: handleFilterChange });
const inspector = createInspector({ onAction: handleAction });
const sections = createSections({ onAction: handleAction });
const footer = createFooter({ onRefresh: refreshData });

// Каркас монтируется до инициализации карты: Leaflet измеряет контейнер
// в момент создания, и на открепленном узле получил бы нулевую высоту.
mount(root, [header.node, chips.node, main, footer.node]);
mount(main, [filters.node, mapHost, inspector.node]);
inspector.setTerritory(filters.territory);

const mapView = createMap({ host: mapHost, onAction: handleAction });
const objectModal = createObjectModal({
  onSelect: (feature) => handleAction({ type: 'selectFeature', feature }),
});
const layerModal = createLayerModal({
  onOpenList: (row) =>
    openObjectList({ districtIds: [row.id], label: row.name, note: `${row.layerName}: ${row.valueText}` }),
  onFocus: (row) => handleAction({ type: 'focus', target: { kind: 'district', id: row.id } }),
});

/* ----------------------------- действия ----------------------------- */

function handleFilterChange(options = {}) {
  if (options.action) return handleAction(options.action);
  if (options.flyTo) mapView.flyTo(options.flyTo);
  syncSelectionWithFilters();
  render(['filters', 'selection']);
}

/** Панель сведений следует за территориальным фильтром. */
function syncSelectionWithFilters() {
  const state = getState();
  const f = state.filters;
  if (state.selection.kind === 'object') return;
  if (state.customArea && f.customArea) {
    setState({ selection: { kind: 'area', id: 'custom' } }, []);
  } else if (f.districtId) {
    setState({ selection: { kind: 'district', id: f.districtId } }, []);
  } else if (f.okrugId) {
    setState({ selection: { kind: 'okrug', id: f.okrugId } }, []);
  } else {
    setState({ selection: { kind: 'city', id: 'moscow' } }, []);
  }
}

function handleAction(action) {
  const state = getState();

  switch (action.type) {
    case 'focus': {
      const { target } = action;
      if (target.kind === 'okrug') {
        setState(
          { filters: { okrugId: target.id, districtId: null }, selection: { kind: 'okrug', id: target.id }, ui: { inspectorOpen: true, inspectorTab: 'overview' } },
          ['filters', 'selection', 'ui'],
        );
      } else if (target.kind === 'district') {
        const district = districtById.get(target.id);
        setState(
          {
            filters: { okrugId: district?.okrugId || null, districtId: target.id },
            selection: { kind: 'district', id: target.id },
            ui: { inspectorOpen: true, inspectorTab: 'overview' },
          },
          ['filters', 'selection', 'ui'],
        );
      }
      mapView.flyTo(target);
      render(['filters', 'selection', 'ui']);
      break;
    }

    case 'selectFeature': {
      setState(
        { selection: { kind: 'object', id: action.feature.id }, ui: { inspectorOpen: true, inspectorTab: 'overview' } },
        ['selection', 'ui'],
      );
      render(['selection', 'ui']);
      // Зону рисовать не по чему, если все её районы — поселения ТиНАО:
      // контуров для них в наборе границ нет, и подсветка не появится.
      if (action.feature.typeId === 'source') {
        const zone = districtsOfSource(action.feature).filter((id) => !districtById.get(id)?.approximate);
        if (!zone.length) {
          toast('Зона действия этого источника — поселения ТиНАО, контуров для них нет', { kind: 'warn' });
        }
      }
      break;
    }

    case 'zoomFeature':
      mapView.flyTo({ kind: 'feature', latlng: action.feature.latlng });
      break;

    case 'applyArea': {
      const inside = districtsInPolygon(action.polygon);
      setState(
        {
          customArea: action.polygon,
          filters: { customArea: true, okrugId: null, districtId: null },
          selection: { kind: 'area', id: 'custom' },
          ui: { tool: null, inspectorOpen: true, inspectorTab: 'overview' },
        },
        ['filters', 'selection', 'ui'],
      );
      drawCustomArea(action.polygon);
      render(['filters', 'selection', 'ui']);

      // Сводка открывается прямо на карте, там же, где пользователь рисовал.
      if (inside.length) {
        mapView.openAreaCard(action.polygon, inside, centroid(action.polygon));
      } else {
        toast('В границы области не попал ни один район', { kind: 'warn' });
      }
      break;
    }

    case 'clearArea': {
      // Область снимается целиком: контур, фильтр и сводка по ней. Иначе на
      // карте остаётся пунктир от разбора, который ни на что уже не влияет.
      setState(
        {
          customArea: null,
          filters: { customArea: false },
          selection: { kind: 'city', id: 'moscow' },
          ui: { tool: null },
        },
        ['filters', 'selection', 'ui'],
      );
      drawCustomArea(null);
      mapView.closeCard();
      render(['filters', 'selection', 'ui']);
      toast('Выделенная область сброшена', { kind: 'ok' });
      break;
    }

    case 'showObjects': {
      const target = state.filters.districtId
        ? { kind: 'district', id: state.filters.districtId, minZoom: 14.5 }
        : state.customArea
          ? { kind: 'bounds', bounds: boundsOf(state.customArea), maxZoom: 15 }
          : null;
      if (target) mapView.flyTo(target);
      toast('Масштаб карты переведён на уровень объектов', { kind: 'ok' });
      break;
    }

    case 'openList':
      openObjectList(action);
      break;

    case 'openLayerList': {
      // Рейтинг районов по действующей тематической раскраске: с карты видно,
      // где показатель выше, а из списка — какие это районы и что в них.
      const ctx = mapView.thematicContext();
      if (!ctx || ctx.layerId === 'admin' || ctx.layerId === 'none') {
        toast('Выберите тематический слой — рейтинг строится по нему', { kind: 'warn' });
        break;
      }
      layerModal.open({ ...ctx, filter: filterFromState(state) });
      break;
    }

    case 'saveArea': {
      const scope = scopeFromState(state);
      toast(`Область «${scope.label}» сохранена в избранное`, { kind: 'ok' });
      break;
    }

    case 'report': {
      const scope = scopeFromState(state);
      const name = action.template?.name || 'Сводный отчёт';
      toast(`${name} по территории «${scope.label}» поставлен в очередь на формирование`, { kind: 'ok' });
      break;
    }

    case 'focusIncident': {
      const district = districtById.get(action.incident.districtId);
      setState({ section: 'map' }, ['section']);
      if (district) {
        handleAction({ type: 'focus', target: { kind: 'district', id: district.id } });
      }
      toast(`${action.incident.id}: ${action.incident.title}`, { kind: 'warn', timeout: 5200 });
      break;
    }

    case 'openSection':
      setState({ section: action.id }, ['section']);
      render(['section']);
      break;

    default:
      break;
  }
}

function handleSearchPick(item) {
  setState({ section: 'map' }, ['section']);
  switch (item.kind) {
    case 'okrug':
      handleAction({ type: 'focus', target: { kind: 'okrug', id: item.id } });
      break;
    case 'district':
      handleAction({ type: 'focus', target: { kind: 'district', id: item.id } });
      break;
    case 'org':
      setState({ filters: { orgs: [item.id] } }, ['filters']);
      handleFilterChange();
      toast(`Фильтр по организации: ${item.title}`, { kind: 'ok' });
      break;
    case 'object': {
      const district = districtById.get(item.feature.districtId);
      if (district) {
        setState(
          { filters: { okrugId: district.okrugId, districtId: district.id } },
          ['filters'],
        );
      }
      mapView.flyTo({ kind: 'feature', latlng: item.feature.latlng });
      handleAction({ type: 'selectFeature', feature: item.feature });
      break;
    }
    case 'incident': {
      setState({ section: 'validation' }, ['section']);
      render(['section']);
      break;
    }
    default:
      break;
  }
}

/* ------------------------- список объектов ------------------------- */

/**
 * Список объектов в модальном окне.
 *
 * По умолчанию охват берётся из фильтров карты, но вызов может задать свой —
 * так открывается список конкретного района из карточки и из рейтинга
 * тематического слоя, не меняя настроек карты.
 */
function openObjectList({ districtIds: forced = null, label = null, note = null } = {}) {
  const state = getState();
  const filter = filterFromState(state);
  const scope = scopeFromState(state);

  let districtIds = forced ? [...forced] : [];
  if (!districtIds.length) {
    if (scope.districtIds) districtIds = [...scope.districtIds];
    else if (scope.okrugIds) {
      districtIds = (okrugById.get([...scope.okrugIds][0])?.districts || []).map((d) => d.id);
    }
  }

  if (!districtIds.length) {
    toast('Выберите округ, район или область — список формируется по территории', { kind: 'warn' });
    return;
  }

  const items = [];
  for (const id of districtIds.slice(0, 12)) {
    const bundle = featuresOfDistrict(id, filter);
    items.push(...bundle.points, ...bundle.lines);
    if (items.length > 600) break;
  }
  items.sort((a, b) => a.typeId.localeCompare(b.typeId) || a.name.localeCompare(b.name, 'ru'));

  // Когда охват задан вызовом, реестровое число считается по нему же, иначе
  // подпись обещала бы больше объектов, чем в списке.
  const total = forced
    ? statsFor({ ...filter, districtIds: new Set(districtIds), okrugIds: null }).total
    : statsFor(filter).total;

  objectModal.open(items, {
    title: `Объекты · ${label || scope.label}`,
    subtitle: [
      `Загружено ${formatInt(items.length)} из ${formatInt(total)} по реестру — на карте отображается выборка`,
      note,
    ]
      .filter(Boolean)
      .join(' · '),
  });
}

/* --------------------------- произвольная область --------------------------- */

let areaLayer = null;

function drawCustomArea(polygon) {
  const L = window.L;
  if (areaLayer) {
    areaLayer.remove();
    areaLayer = null;
  }
  if (!polygon) return;
  areaLayer = L.polygon(polygon, {
    color: '#1668dc',
    weight: 2,
    dashArray: '7 5',
    fillColor: '#1668dc',
    fillOpacity: 0.08,
    interactive: false,
  }).addTo(mapView.map);
}

function boundsOf(polygon) {
  const lats = polygon.map((p) => p[0]);
  const lons = polygon.map((p) => p[1]);
  return [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ];
}

/* ------------------------------ обновление ------------------------------ */

async function refreshData() {
  setState({ ui: { loading: true } }, ['ui']);
  await new Promise((resolve) => setTimeout(resolve, 900));
  setState({ ui: { loading: false } }, ['ui']);
  toast('Выгрузки от РСО проверены — новых данных нет', { kind: 'ok' });
}

/* -------------------------------- отрисовка -------------------------------- */

let currentLayout = null;

function render(topics = []) {
  const state = getState();

  const layout = state.section === 'map' ? 'map' : 'section';
  if (layout !== currentLayout) {
    currentLayout = layout;
    if (layout === 'map') {
      mount(main, [filters.node, mapView.node, inspector.node]);
      requestAnimationFrame(() => mapView.map.invalidateSize());
    } else {
      mount(main, [sections.node]);
    }
  }

  main.classList.toggle('is-sidebar-collapsed', state.ui.sidebarCollapsed);
  main.classList.toggle('is-inspector-hidden', !state.ui.inspectorOpen);

  header.update();
  if (layout === 'map') {
    chips.update();
    filters.update();
    inspector.update();
    mapView.update(topics);
  } else {
    mount(chips.node, []);
    sections.update();
  }
  footer.update();
}

subscribe((state, topics) => {
  if (topics.length) render(topics);
});

render();

// Панель сведений можно вернуть клавишей Escape → I, а также кликом по карте.
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    // Окно закрывается собственным обработчиком, здесь остаётся карточка.
    if (!objectModal.isOpen) mapView.closeCard();
  }
});

window.addEventListener('resize', () => mapView.map.invalidateSize());
