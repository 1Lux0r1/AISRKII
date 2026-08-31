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
import { createObjectList } from './ui/objectlist.js';
import { createSections } from './ui/sections.js';
import { createFooter } from './ui/footer.js';
import { toast } from './ui/toast.js';
import {
  districtById,
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

const mapView = createMap({ host: mapHost, onAction: handleAction });
const objectList = createObjectList({ onSelect: (feature) => handleAction({ type: 'selectFeature', feature }) });
mapHost.append(objectList.node);

/* ----------------------------- действия ----------------------------- */

function handleFilterChange(options = {}) {
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
      openObjectList();
      break;

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

function openObjectList() {
  const state = getState();
  const filter = filterFromState(state);
  const scope = scopeFromState(state);

  let districtIds = [];
  if (scope.districtIds) districtIds = [...scope.districtIds];
  else if (scope.okrugIds) {
    districtIds = (okrugById.get([...scope.okrugIds][0])?.districts || []).map((d) => d.id);
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

  const stats = statsFor(filter);
  objectList.open(
    items,
    `Объекты · ${scope.label}`,
    `Показано ${formatInt(items.length)} из ${formatInt(stats.total)} — на карте отображается выборка реестра`,
  );
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
    if (objectList.isOpen) objectList.close();
    else mapView.closeCard();
  }
});

window.addEventListener('resize', () => mapView.map.invalidateSize());
