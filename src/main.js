/**
 * РКИИЭ 2.0 — демонстрационный стенд мониторинга объектов ресурсоснабжения.
 * Точка сборки: связывает состояние, карту и панели интерфейса.
 */

import { el, mount } from './utils/dom.js';
import { getState, setState, subscribe } from './state.js';
import { createHeader, restoreTheme, applyTheme, SECTIONS, TOOLS } from './ui/header.js';
import { createPalette } from './ui/palette.js';
import { createChips } from './ui/chips.js';
import { createFilters } from './ui/filters.js';
import { createMap } from './ui/map.js';
import { createInspector } from './ui/inspector.js';
import { createObjectModal } from './ui/objectmodal.js';
import { createLayerModal } from './ui/layermodal.js';
import { createReportModal } from './ui/reportmodal.js';
import { createIncidentModal } from './ui/incidentmodal.js';
import { createSections } from './ui/sections.js';
import { createTerra } from './ui/terra.js';
import { createFooter } from './ui/footer.js';
import { toast } from './ui/toast.js';
import {
  districtById,
  districtsOfSource,
  districtsInPolygon,
  areaOfPolygon,
  incidentsByDistrict,
  featuresOfDistrict,
  filterFromState,
  okrugById,
  scopeFromState,
  statsFor,
} from './data/model.js';
import { formatInt, pluralRu } from './utils/format.js';
import { centroid } from './data/geo.js';

const root = document.getElementById('app');
// Карта занимает всё поле, панели лежат над ней на «стекле»: план города
// перестал резаться колонками — раньше карта теряла около 580 px по ширине.
const main = el('main.app__body');
const stage = el('div.stage');
const mapHost = el('div.mapwrap');

/* --------------------------- компоненты --------------------------- */

// Тема восстанавливается до первой отрисовки: иначе экран мигает светлым.
restoreTheme();

const header = createHeader({
  onNavigate: (section) => {
    setState({ section }, ['section']);
  },
  onTool: handleTool,
  onCommand: () => palette.open(),
});

const palette = createPalette({
  onPick: handleSearchPick,
  onCommand: (item) => item.run(),
  commands: buildCommands,
});

const chips = createChips({ onChange: handleFilterChange });
const filters = createFilters({ onChange: handleFilterChange });
const inspector = createInspector({ onAction: handleAction });
const sections = createSections({ onAction: handleAction });
const footer = createFooter({ onRefresh: refreshData });

// Каркас монтируется до инициализации карты: Leaflet измеряет контейнер
// в момент создания, и на открепленном узле получил бы нулевую высоту.
mount(root, [header.node, main, footer.node]);
mount(main, stage);
mount(stage, [mapHost, chips.node, filters.node, inspector.node]);

const mapView = createMap({ host: mapHost, onAction: handleAction });
const objectModal = createObjectModal({
  onSelect: (feature) => handleAction({ type: 'selectFeature', feature }),
});
const reportModal = createReportModal();
const incidentModal = createIncidentModal({
  onFocus: (incident) => handleAction({ type: 'focusIncident', incident }),
});
const layerModal = createLayerModal({
  onOpenList: (row) =>
    openObjectList({ districtIds: [row.id], label: row.name, note: `${row.layerName}: ${row.valueText}` }),
  onFocus: (row) => handleAction({ type: 'focus', target: { kind: 'district', id: row.id } }),
});

/* ----------------------------- действия ----------------------------- */

function handleFilterChange(options = {}) {
  if (options.action) return handleAction(options.action);
  if (options.flyTo) flyToTarget(options.flyTo);
  syncSelectionWithFilters();
  render(['filters', 'selection']);
}

/**
 * Подсветка на карте следует за территориальным фильтром. Выбранный объект
 * из неё выпадает: сменили охват — подсвечивать объект прежней территории
 * не за чем, а его паспорт остаётся открытой карточкой.
 */
function syncSelectionWithFilters() {
  const state = getState();
  const f = state.filters;
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

/**
 * Перелёт к территории. У поселений ТиНАО в наборе границ нет контуров:
 * лететь туда нельзя — пользователь оказался бы над пустым местом, не понимая,
 * почему карта пуста, хотя сводка справа заполнена.
 */
function flyToTarget(target) {
  if (!target) return;
  // Произвольная область задаётся контуром, а не справочником: переводим её
  // в границы прямо здесь, чтобы кнопка «Показать на карте» была одна на все
  // виды охвата.
  if (target.kind === 'area') {
    const area = getState().customArea;
    if (!area) return;
    mapView.flyTo({ kind: 'bounds', bounds: boundsOf(area), maxZoom: 14 });
    return;
  }
  const territory =
    target.kind === 'okrug'
      ? okrugById.get(target.id)
      : target.kind === 'district'
        ? districtById.get(target.id)
        : null;
  if (territory?.approximate) {
    toast(`${territory.name}: контуров в наборе границ нет — сводка в панели справа`, {
      kind: 'warn',
      timeout: 5200,
    });
    return;
  }
  mapView.flyTo(target);
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
      flyToTarget(target);
      render(['filters', 'selection', 'ui']);
      break;
    }

    case 'selectFeature': {
      // Выбор объекта подсвечивает его на карте и открывает паспорт карточкой.
      // Панель сведений остаётся на территории — она отвечает за сводку.
      setState({ selection: { kind: 'object', id: action.feature.id } }, ['selection']);
      render(['selection']);
      mapView.openObjectCard(action.feature);
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

    case 'resetScope': {
      // Сбрасываем только территориальный охват: отбор по ресурсам,
      // организациям и состоянию задаётся слева и живёт своей жизнью.
      setState(
        {
          customArea: null,
          filters: { customArea: false, okrugId: null, districtId: null, streetId: null },
          selection: { kind: 'city', id: 'moscow' },
          ui: { tool: null, sourceZone: null },
        },
        ['filters', 'selection', 'ui'],
      );
      drawCustomArea(null);
      mapView.closeCard();
      render(['filters', 'selection', 'ui']);
      flyToTarget({ kind: 'city' });
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

    case 'setScope': {
      // Охват меняется из строки охвата в панели сведений. Карту это не
      // двигает: экран переводится отдельной кнопкой «На карте».
      setState({ filters: action.filters }, ['filters']);
      handleFilterChange();
      break;
    }

    case 'showScope': {
      // Перевод карты к заданному охвату. Сама настройка охвата экран не
      // двигает: иначе разбор сводки сбивался бы перелётом при каждом
      // уточнении фильтра.
      const f = state.filters;
      flyToTarget(
        state.customArea && f.customArea
          ? { kind: 'area' }
          : f.districtId
            ? { kind: 'district', id: f.districtId }
            : f.okrugId
              ? { kind: 'okrug', id: f.okrugId }
              : { kind: 'city' },
      );
      break;
    }

    case 'showObjects': {
      const target = state.filters.districtId
        ? { kind: 'district', id: state.filters.districtId, minZoom: 14.5 }
        : state.customArea
          ? { kind: 'bounds', bounds: boundsOf(state.customArea), maxZoom: 15 }
          : null;
      if (!target) {
        toast('Выберите район или область — масштаб переводится по территории', { kind: 'warn' });
        break;
      }
      const district = target.kind === 'district' ? districtById.get(target.id) : null;
      if (district?.approximate) {
        toast(`${district.name}: контуров в наборе границ нет — объекты на карту не выводятся`, { kind: 'warn' });
        break;
      }
      mapView.flyTo(target);
      toast('Масштаб карты переведён на уровень объектов', { kind: 'ok' });
      break;
    }

    case 'openList':
      openObjectList(action);
      break;

    case 'openIncidents':
      incidentModal.open(action.scope || {});
      break;

    case 'zoomIncidents': {
      // Приближение к районам округа, где есть открытые события. Районы без
      // контуров (поселения ТиНАО) в охват не берём: границ для них в наборе
      // нет, и рамка ушла бы в пустое место.
      const okrug = okrugById.get(action.okrugId);
      const hot = (okrug?.districts || []).filter(
        (d) => !d.approximate && (incidentsByDistrict.get(d.id) || 0) > 0,
      );
      if (!hot.length) {
        toast(`${okrug?.name || 'Округ'}: открытых событий с привязкой к контурам нет`, { kind: 'warn' });
        break;
      }
      const total = hot.reduce((acc, d) => acc + (incidentsByDistrict.get(d.id) || 0), 0);
      setState(
        {
          filters: { okrugId: action.okrugId, districtId: null, streetId: null },
          selection: { kind: 'okrug', id: action.okrugId },
          ui: { incidents: true, inspectorOpen: true },
        },
        ['filters', 'selection', 'ui'],
      );
      render(['filters', 'selection', 'ui', 'map']);
      mapView.flyTo({ kind: 'bounds', bounds: unionBounds(hot.map((d) => d.bounds)), maxZoom: 13 });
      toast(
        `${okrug.name}: ${total} ${pluralRu(total, 'событие', 'события', 'событий')} в ${hot.length} ${pluralRu(hot.length, 'районе', 'районах', 'районах')}`,
        { kind: 'warn', timeout: 5200 },
      );
      break;
    }

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
      reportModal.open({
        scope,
        stats: statsFor(filterFromState(state)),
        filters: state.filters,
        areaKm2: state.customArea ? areaOfPolygon(state.customArea) : null,
      });
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

/* --------------------- инструменты раздела и команды --------------------- */

/**
 * Переключение инструмента раздела «Сведения об объектах». Модуль «Анализ
 * территории» живёт на собственной карте: у него другой масштаб, другой
 * набор слоёв и своя панель инструментов, поэтому общий вид не переиспользуется.
 */
function handleTool(id) {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool || tool.soon) {
    toast(`${tool ? tool.name : 'Инструмент'} — в разработке`, { kind: 'warn' });
    return;
  }
  setState({ section: 'map', tool: id }, ['section', 'tool']);
  render(['section', 'tool']);
}

/**
 * Команды палитры (⌘K). Здесь собрано то, что иначе требует мыши и знания,
 * где лежит кнопка: охват, слои, панели, разделы и инструменты.
 */
function buildCommands() {
  const state = getState();
  const list = [
    {
      id: 'reset',
      title: 'Сбросить территорию и область',
      sub: 'Сводка вернётся к городу',
      icon: 'refresh',
      run: () => handleAction({ type: 'resetScope' }),
    },
    {
      id: 'list',
      title: 'Список объектов',
      sub: 'Таблица объектов выбранной территории',
      icon: 'list',
      run: () => handleAction({ type: 'openList' }),
    },
    {
      id: 'report',
      title: 'Отчёт по территории',
      sub: 'Сводка выбранного охвата',
      icon: 'doc',
      run: () => handleAction({ type: 'report' }),
    },
    {
      id: 'sidebar',
      title: state.ui.sidebarCollapsed ? 'Развернуть панель отбора' : 'Свернуть панель отбора',
      sub: 'Левая панель',
      icon: 'filter',
      run: () => {
        setState({ ui: { sidebarCollapsed: !getState().ui.sidebarCollapsed } }, ['ui']);
        render(['ui']);
      },
    },
    {
      id: 'inspector',
      title: state.ui.inspectorOpen ? 'Скрыть панель сведений' : 'Показать панель сведений',
      sub: 'Правая панель',
      icon: 'info',
      run: () => {
        setState({ ui: { inspectorOpen: !getState().ui.inspectorOpen } }, ['ui']);
        render(['ui']);
      },
    },
    {
      id: 'incidents',
      title: state.ui.incidents ? 'Снять подсветку инцидентов' : 'Подсветить инциденты на карте',
      sub: 'Технологические нарушения в округах и районах',
      icon: 'warning',
      run: () => {
        setState({ ui: { incidents: !getState().ui.incidents } }, ['ui', 'map']);
        render(['ui', 'map']);
      },
    },
    {
      id: 'incidentList',
      title: 'Открытые события списком',
      sub: 'Перечень технологических нарушений и замечаний',
      icon: 'list',
      run: () => handleAction({ type: 'openIncidents', scope: { title: 'Открытые события · Москва' } }),
    },
    {
      id: 'theme',
      title: document.documentElement.dataset.theme === 'dark' ? 'Светлая тема' : 'Диспетчерский режим (тёмная тема)',
      sub: 'Оформление интерфейса',
      icon: 'moon',
      run: () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        try {
          localStorage.setItem('rkiie.theme', next);
        } catch {
          /* приватное окно — тема просто не запомнится */
        }
      },
    },
  ];

  for (const tool of TOOLS) {
    if (tool.soon) continue;
    list.push({
      id: `tool:${tool.id}`,
      title: tool.name,
      sub: tool.hint,
      icon: tool.icon,
      run: () => handleTool(tool.id),
    });
  }

  for (const section of SECTIONS) {
    if (section.tools) continue;
    list.push({
      id: `section:${section.id}`,
      title: section.name,
      sub: 'Раздел системы',
      icon: 'layers',
      run: () => {
        setState({ section: section.id }, ['section']);
        render(['section']);
      },
    });
  }

  return list;
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

/** Общая рамка нескольких районов. */
function unionBounds(list) {
  return [
    [Math.min(...list.map((b) => b[0][0])), Math.min(...list.map((b) => b[0][1]))],
    [Math.max(...list.map((b) => b[1][0])), Math.max(...list.map((b) => b[1][1]))],
  ];
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
let terra = null;

function render(topics = []) {
  const state = getState();

  const layout =
    state.section !== 'map' ? 'section' : state.tool === 'terra' ? 'terra' : 'map';
  if (layout !== currentLayout) {
    currentLayout = layout;
    if (layout === 'map') {
      mount(main, stage);
      mount(stage, [mapView.node, chips.node, filters.node, inspector.node]);
      requestAnimationFrame(() => mapView.map.invalidateSize());
    } else if (layout === 'terra') {
      // Модуль поднимается при первом входе: он создаёт собственную карту,
      // и держать её живой на экране реестра не за чем.
      if (!terra) terra = createTerra({ onExit: () => handleTool('map') });
      mount(main, [terra.node]);
      terra.activate();
    } else {
      mount(main, [sections.node]);
    }
  }

  stage.classList.toggle('is-sidebar-collapsed', state.ui.sidebarCollapsed);
  stage.classList.toggle('is-inspector-hidden', !state.ui.inspectorOpen);

  header.update();
  if (layout === 'map') {
    chips.update();
    filters.update();
    inspector.update();
    mapView.update(topics);
  } else if (layout === 'terra') {
    terra.update();
  } else {
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
    if (!objectModal.isOpen && !incidentModal.isOpen) mapView.closeCard();
  }
});

window.addEventListener('resize', () => {
  mapView.map.invalidateSize();
  terra?.invalidate();
});
