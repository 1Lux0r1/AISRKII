/**
 * Модуль «Анализ территории» (terra analysis).
 *
 * Моделирует подключение полигонов перспективной застройки (ППЗ) к
 * коммунальной инженерной инфраструктуре: панель слоёв проекта слева,
 * собственная панель инструментов внизу поля карты, список объектов и
 * карточка ППЗ справа.
 *
 * Термины: ППЗ — полигон перспективной застройки, МТС — магистральные
 * тепловые сети, КИИ — коммунальная инженерная инфраструктура,
 * ОКС — объект капитального строительства.
 */

import { el, mount, onDismiss } from '../utils/dom.js';
import { icon, iconSvg, RESOURCE_ICONS } from './icons.js';
import { toast } from './toast.js';
import { promptDialog } from './dialog.js';
import { formatInt } from '../utils/format.js';
import { RESOURCES } from '../data/catalog.js';
import { DISTRICT_RINGS } from '../data/territories.js';
import {
  TERRA_BOUNDS,
  TERRA_BUILT,
  TERRA_DISTRIB,
  TERRA_HOUSE_COUNT,
  TERRA_MTS,
  TERRA_OBSTACLES,
  TERRA_OPTIONS,
  TERRA_PPZ,
  TERRA_PROJECT,
  TERRA_SOURCE,
  TERRA_SOURCE_LATLNG,
  TERRA_TAPS,
  TERRA_TP,
} from '../data/terra.js';

const HEAT = '#0fa37c';
const ACCENT = '#2f63e2';
const ALERT = '#e11d48';

const PROJECTS = [
  { id: 'nekrasovka-south', name: 'Некрасовка — южный участок', note: 'расчёт от 05.08.2026' },
  { id: 'nekrasovka-north', name: 'Некрасовка — северный участок', note: 'черновик' },
  { id: 'kapotnya', name: 'Капотня — реновация', note: 'расчёт от 22.07.2026' },
];

/** Дерево слоёв проекта. Порядок групп повторяет постановку. */
const LAYER_TREE = [
  {
    id: 'project',
    name: 'Проект «Некрасовка»',
    editable: true,
    subs: [
      {
        title: 'Исходные данные',
        icon: 'download',
        rows: [
          { id: 'ocs', name: 'Перспективные ОКС', meta: String(TERRA_HOUSE_COUNT), swatch: { background: 'rgba(47,99,226,.2)', border: `1.5px solid ${ACCENT}` } },
          { id: 'obstacles', name: 'Препятствия', meta: String(TERRA_OBSTACLES.length), swatch: { background: `repeating-linear-gradient(45deg, rgba(225,29,72,.55) 0 2px, transparent 2px 5px), rgba(225,29,72,.1)` } },
        ],
      },
      {
        title: 'Результаты расчёта',
        icon: 'chart',
        badge: 'новые',
        rows: [
          { id: 'ppz', name: 'ППЗ', meta: String(TERRA_PPZ.length), swatch: { background: 'rgba(47,99,226,.22)', border: `1.5px solid ${ACCENT}` } },
          { id: 'traces', name: 'Трассы подключения', meta: String(TERRA_PPZ.length), line: { color: HEAT, style: 'dashed' } },
          { id: 'taps', name: 'Точки подключения к МТС', meta: String(TERRA_TAPS.length), swatch: { background: '#fff', border: `2px solid ${HEAT}`, borderRadius: '50%' } },
          { id: 'zones', name: 'Зоны обеспеченности', swatch: { background: 'rgba(15,163,124,.18)', border: `1.5px solid ${HEAT}` }, off: true },
          { id: 'model3d', name: '3D-модель застройки', meta: String(TERRA_HOUSE_COUNT), swatch: { background: 'var(--seq-load-3)', border: `1.5px solid ${ACCENT}` }, off: true },
        ],
      },
    ],
  },
  {
    id: 'kii',
    name: 'Инфраструктура (КИИ)',
    icon: 'network',
    subs: [
      {
        rows: [
          { id: 'sources', name: 'Источники теплоснабжения', meta: '1', swatch: { background: HEAT, borderRadius: '50%' } },
          { id: 'mts', name: 'Магистральные сети (МТС)', meta: '8,4 км', line: { color: HEAT, style: 'solid' } },
          { id: 'distrib', name: 'Распределительные сети', meta: '19 км', line: { color: HEAT, style: 'dotted' } },
          { id: 'tp', name: 'Тепловые пункты', meta: String(TERRA_TP.length), swatch: { background: 'var(--res-heat-soft)', border: `1.5px solid ${HEAT}` }, off: true },
        ],
      },
    ],
  },
  {
    id: 'territory',
    name: 'Территория',
    icon: 'map',
    subs: [
      {
        rows: [
          { id: 'bounds', name: 'Границы районов', line: { color: 'var(--n-400)', style: 'solid' } },
          { id: 'built', name: 'Существующая застройка', meta: String(TERRA_BUILT.length), swatch: { background: 'var(--n-200)' } },
          { id: 'cadastre', name: 'Кадастровые кварталы', line: { color: 'var(--n-300)', style: 'solid' }, off: true },
        ],
      },
    ],
  },
];

/** Контур района проекта и соседей — территориальный контекст расчёта. */
const HOME_RING = DISTRICT_RINGS[TERRA_PROJECT.districtId][0];
const NEIGHBOURS = Object.entries(DISTRICT_RINGS)
  .filter(([id]) => id !== TERRA_PROJECT.districtId && id.startsWith('uvao-'))
  .map(([, rings]) => rings[0]);

/**
 * Кадастровая сетка — условная: настоящих кадастровых кварталов в наборе
 * нет, слой показывает шаг сетки, по которой ведётся учёт.
 */
const CADASTRE = (() => {
  const lats = HOME_RING.map((p) => p[0]);
  const lons = HOME_RING.map((p) => p[1]);
  const [y0, y1] = [Math.min(...lats), Math.max(...lats)];
  const [x0, x1] = [Math.min(...lons), Math.max(...lons)];
  const stepY = (y1 - y0) / 9;
  const stepX = (x1 - x0) / 7;
  const out = [];
  for (let y = y0; y < y1 - stepY / 2; y += stepY) {
    for (let x = x0; x < x1 - stepX / 2; x += stepX) {
      out.push([[y, x], [y, x + stepX], [y + stepY, x + stepX], [y + stepY, x]]);
    }
  }
  return out;
})();

const ALL_ROWS = LAYER_TREE.flatMap((g) => g.subs.flatMap((s) => s.rows.map((r) => ({ ...r, group: g.id }))));
const PAGE_SIZES = [10, 25, 50, 100];

export function createTerra({ onExit }) {
  const L = window.L;

  /* ------------------------------ состояние ------------------------------ */
  const ui = {
    projectId: PROJECTS[0].id,
    projectName: PROJECTS[0].name,
    resourceId: 'heat',
    layers: new Set(ALL_ROWS.filter((r) => !r.off).map((r) => r.id)),
    collapsed: new Set(),
    panelCollapsed: false,
    autoCollapsed: false,
    listOpen: true,
    sourceOpen: false,
    selected: null,
    subset: null, // выборка после выделения области
    page: 1,
    pageSize: 25,
    mode: 'view', // view | select
    edit: false,
    dirty: false,
    calc: 'done', // idle | running | done
    progress: 0,
    tool: null, // rect | lasso
  };

  /* -------------------------------- каркас ------------------------------- */
  const mapHost = el('div.mapwrap');
  const mapNode = el('div.map');
  mapHost.append(mapNode);

  const panelHost = el('div.terra__panel');
  const listHost = el('div.terra__list');
  const cardHost = el('div.terra__card');
  const toolbarHost = el('div.terra__toolbar');
  const legendHost = el('div.terra__legend');
  const chipHost = el('div.terra__chips');

  const stage = el('div.stage.stage--terra', null, [
    mapHost,
    panelHost,
    chipHost,
    legendHost,
    toolbarHost,
    listHost,
    cardHost,
  ]);

  /* -------------------------------- карта -------------------------------- */
  const map = L.map(mapNode, {
    center: [(TERRA_BOUNDS[0][0] + TERRA_BOUNDS[1][0]) / 2, (TERRA_BOUNDS[0][1] + TERRA_BOUNDS[1][1]) / 2],
    zoom: 13,
    minZoom: 11,
    maxZoom: 19,
    zoomControl: false,
    zoomSnap: 0.5,
  });
  map.attributionControl.setPrefix('');
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  const panes = {};
  for (const [name, z] of [['terraBase', 402], ['terraNet', 404], ['terraPpz', 406], ['terra3d', 408], ['terraTop', 410]]) {
    map.createPane(name);
    map.getPane(name).style.zIndex = String(z);
    panes[name] = name;
  }

  const groups = {
    built: L.layerGroup().addTo(map),
    bounds: L.layerGroup().addTo(map),
    cadastre: L.layerGroup().addTo(map),
    obstacles: L.layerGroup().addTo(map),
    ocs: L.layerGroup().addTo(map),
    zones: L.layerGroup().addTo(map),
    mts: L.layerGroup().addTo(map),
    distrib: L.layerGroup().addTo(map),
    taps: L.layerGroup().addTo(map),
    traces: L.layerGroup().addTo(map),
    ppz: L.layerGroup().addTo(map),
    model3d: L.layerGroup().addTo(map),
    sources: L.layerGroup().addTo(map),
    tp: L.layerGroup().addTo(map),
    draw: L.layerGroup().addTo(map),
  };

  const labelLayer = el('div.terra__labels');
  mapHost.append(labelLayer);

  /* ----------------------------- слои на карте ---------------------------- */

  function buildLayers() {
    for (const g of Object.values(groups)) g.clearLayers();

    for (const ring of TERRA_BUILT) {
      groups.built.addLayer(L.polygon(ring, { pane: 'terraBase', color: '#9aa7b8', weight: 0.6, fillColor: '#c7d0dc', fillOpacity: 0.75, interactive: false }));
    }
    groups.bounds.addLayer(
      L.polygon(HOME_RING, { pane: 'terraBase', color: '#475569', weight: 2.4, fill: false, interactive: false }),
    );
    for (const ring of NEIGHBOURS) {
      groups.bounds.addLayer(
        L.polygon(ring, { pane: 'terraBase', color: '#94a3b8', weight: 1, dashArray: '5 4', fill: false, interactive: false }),
      );
    }
    for (const ring of CADASTRE) {
      groups.cadastre.addLayer(L.polygon(ring, { pane: 'terraBase', color: '#c0c9d6', weight: 0.8, fill: false, interactive: false }));
    }
    for (const ring of TERRA_OBSTACLES) {
      groups.obstacles.addLayer(
        L.polygon(ring, { pane: 'terraBase', color: ALERT, weight: 1.2, fillColor: ALERT, fillOpacity: 0.16, dashArray: '3 3', interactive: false }),
      );
    }
    for (const p of TERRA_PPZ) {
      for (const house of p.houses) {
        groups.ocs.addLayer(
          L.polygon(house.ring, { pane: 'terraBase', color: ACCENT, weight: 0.7, fillColor: ACCENT, fillOpacity: 0.22, interactive: false }),
        );
      }
    }
    // Зона обеспеченности: коридор вдоль магистрали, где подключение
    // укладывается в нормативную длину ввода.
    groups.zones.addLayer(
      L.polyline(TERRA_MTS, { pane: 'terraBase', color: HEAT, weight: 46, opacity: 0.16, lineCap: 'round', lineJoin: 'round', interactive: false }),
    );
    groups.mts.addLayer(L.polyline(TERRA_MTS, { pane: 'terraNet', color: HEAT, weight: 5, interactive: false }));
    for (const line of TERRA_DISTRIB) {
      groups.distrib.addLayer(L.polyline(line, { pane: 'terraNet', color: HEAT, weight: 2, dashArray: '1 4', opacity: 0.8, interactive: false }));
    }
    for (const tap of TERRA_TAPS) {
      groups.taps.addLayer(
        L.circleMarker(tap.latlng, { pane: 'terraTop', radius: 5, color: HEAT, weight: 2.5, fillColor: '#fff', fillOpacity: 1 })
          .bindTooltip(`${tap.id} · трасс: ${tap.count}`, { direction: 'top' }),
      );
    }
    for (const tp of TERRA_TP) {
      groups.tp.addLayer(
        L.circleMarker(tp.latlng, { pane: 'terraNet', radius: 3.5, color: HEAT, weight: 1.5, fillColor: '#e3f5ef', fillOpacity: 1 }).bindTooltip(tp.id, { direction: 'top' }),
      );
    }
    groups.sources.addLayer(
      L.marker(TERRA_SOURCE_LATLNG, {
        pane: 'terraTop',
        icon: L.divIcon({
          className: 'terra-src',
          html: `<span class="terra-src__pin">${iconSvg('factory', { size: 16, cls: '', stroke: 2 })}</span><span class="terra-src__name">${TERRA_SOURCE.name}</span>`,
          iconSize: null,
        }),
      }).on('click', () => {
        ui.sourceOpen = true;
        renderAll();
      }),
    );

    rebuildPpz();
  }

  const ppzShapes = new Map();

  function rebuildPpz() {
    groups.ppz.clearLayers();
    groups.traces.clearLayers();
    groups.model3d.clearLayers();
    ppzShapes.clear();

    for (const p of visiblePpz()) {
      const shape = L.polygon(p.ring, {
        pane: 'terraPpz',
        color: ACCENT,
        weight: 1.6,
        fillColor: ACCENT,
        fillOpacity: 0.2,
      })
        .on('click', () => select(p.id))
        .bindTooltip(`ППЗ-${p.id} · ${p.name}`, { direction: 'top', sticky: true });
      groups.ppz.addLayer(shape);
      ppzShapes.set(p.id, shape);

      groups.traces.addLayer(
        L.polyline(p.trace, { pane: 'terraNet', color: HEAT, weight: 2, dashArray: '5 4', interactive: false }),
      );

      for (const house of p.houses) groups.model3d.addLayer(...box(house));
    }
    applySelection();
    syncLabels();
  }

  /**
   * Объёмная коробка дома в аксонометрии. Смещение крыши задаётся в
   * градусах: Leaflet сам пересчитает его при смене масштаба, поэтому
   * дома «растут» вместе с картой, а не прыгают.
   */
  function box(house) {
    const h = house.floors * 3;
    const dLat = h / 111320;
    const dLon = (h * 0.45) / (111320 * Math.cos((house.ring[0][0] * Math.PI) / 180));
    const roof = house.ring.map(([lat, lon]) => [lat + dLat, lon + dLon]);
    const tone = Math.min(4, Math.floor((house.floors - 8) / 4));
    const roofColor = ['#e7effc', '#bed4f7', '#7fa9ee', '#3f79dd', '#1c4aa0'][tone];
    const out = [];
    for (let i = 0; i < house.ring.length; i += 1) {
      const j = (i + 1) % house.ring.length;
      out.push(
        L.polygon([house.ring[i], house.ring[j], roof[j], roof[i]], {
          pane: 'terra3d',
          color: '#5b6b81',
          weight: 0.4,
          fillColor: '#8fa3bd',
          fillOpacity: 0.82,
          interactive: false,
        }),
      );
    }
    out.push(
      L.polygon(roof, { pane: 'terra3d', color: '#3f4a5c', weight: 0.5, fillColor: roofColor, fillOpacity: 0.95, interactive: false }),
    );
    return out;
  }

  function syncVisibility() {
    for (const [id, group] of Object.entries(groups)) {
      if (id === 'draw') continue;
      const on = ui.layers.has(id);
      if (on && !map.hasLayer(group)) group.addTo(map);
      if (!on && map.hasLayer(group)) map.removeLayer(group);
    }
    labelLayer.hidden = !ui.layers.has('ppz');
    syncLabels();
  }

  /* ------------------------------- подписи ------------------------------- */

  /**
   * Подписи ППЗ. Полигоны стоят кварталами вплотную, поэтому подписи
   * расставляются с проверкой перекрытия: лучше показать часть номеров,
   * чем нечитаемую кашу. Выбранный ППЗ подписан всегда.
   */
  function syncLabels() {
    if (!ui.layers.has('ppz')) return mount(labelLayer, []);
    if (map.getZoom() < 13) return mount(labelLayer, []);

    const list = visiblePpz();
    const ordered = ui.selected ? [...list].sort((a, b) => (b.id === ui.selected) - (a.id === ui.selected)) : list;
    const placed = [];
    const nodes = [];

    for (const p of ordered) {
      const pt = map.latLngToContainerPoint(p.centre);
      const box = { x0: pt.x - 40, x1: pt.x + 40, y0: pt.y - 13, y1: pt.y + 13 };
      const clash = placed.some((o) => box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0);
      if (clash && p.id !== ui.selected) continue;
      placed.push(box);
      nodes.push(
        el('button.ppzlabel', {
          type: 'button',
          class: ui.selected === p.id ? 'is-selected' : '',
          text: `ППЗ-${p.id}`,
          style: { left: `${Math.round(pt.x)}px`, top: `${Math.round(pt.y)}px` },
          onclick: () => select(p.id),
        }),
      );
    }
    mount(labelLayer, nodes);
  }

  map.on('move zoom viewreset', syncLabels);

  /* ------------------------------ выборка ППЗ ----------------------------- */

  function visiblePpz() {
    return ui.subset ? TERRA_PPZ.filter((p) => ui.subset.has(p.id)) : TERRA_PPZ;
  }

  function select(id) {
    ui.selected = ui.selected === id ? null : id;
    ui.sourceOpen = false;
    applySelection();
    renderAll();
  }

  function applySelection() {
    for (const [id, shape] of ppzShapes) {
      const on = id === ui.selected;
      shape.setStyle({
        weight: on ? 3 : 1.6,
        color: on ? '#1f4bc4' : ACCENT,
        fillOpacity: on ? 0.34 : 0.2,
      });
      if (on) shape.bringToFront();
    }
    syncLabels();
  }

  /* ---------------------------- выделение области -------------------------- */

  let drawPoints = [];
  let drawShape = null;

  function startTool(kind) {
    if (ui.tool === kind) return stopTool();
    ui.tool = kind;
    ui.mode = 'select';
    drawPoints = [];
    groups.draw.clearLayers();
    drawShape = null;
    mapNode.classList.add('is-drawing');
    map.getContainer().style.cursor = 'crosshair';
    toast(
      kind === 'rect'
        ? 'Отметьте два угла прямоугольника'
        : 'Отмечайте вершины области, двойной щелчок — завершить',
      { kind: 'ok' },
    );
    renderToolbar();
  }

  function stopTool() {
    ui.tool = null;
    drawPoints = [];
    groups.draw.clearLayers();
    drawShape = null;
    mapNode.classList.remove('is-drawing');
    map.getContainer().style.cursor = '';
    renderToolbar();
  }

  map.on('click', (event) => {
    if (!ui.tool) return;
    drawPoints.push([event.latlng.lat, event.latlng.lng]);
    if (ui.tool === 'rect' && drawPoints.length === 2) return finishSelection();
    redrawDraft();
  });

  map.on('mousemove', (event) => {
    if (!ui.tool || !drawPoints.length) return;
    redrawDraft([event.latlng.lat, event.latlng.lng]);
  });

  map.on('dblclick', (event) => {
    if (ui.tool !== 'lasso') return;
    L.DomEvent.stop(event);
    finishSelection();
  });

  function redrawDraft(hover = null) {
    groups.draw.clearLayers();
    const pts = hover ? [...drawPoints, hover] : drawPoints;
    if (ui.tool === 'rect' && pts.length === 2) {
      drawShape = L.rectangle(pts, { pane: 'terraTop', color: ACCENT, weight: 2, dashArray: '6 4', fillOpacity: 0.06 });
      groups.draw.addLayer(drawShape);
    } else if (pts.length >= 2) {
      drawShape = L.polygon(pts, { pane: 'terraTop', color: ACCENT, weight: 2, dashArray: '6 4', fillOpacity: 0.06 });
      groups.draw.addLayer(drawShape);
    }
    for (const p of drawPoints) {
      groups.draw.addLayer(L.circleMarker(p, { pane: 'terraTop', radius: 3.5, color: ACCENT, fillColor: '#fff', fillOpacity: 1, weight: 2 }));
    }
  }

  function finishSelection() {
    const polygon =
      ui.tool === 'rect'
        ? rectRing(drawPoints[0], drawPoints[1])
        : drawPoints.slice();
    stopTool();
    if (polygon.length < 3) {
      toast('Область не задана: нужно не меньше трёх вершин', { kind: 'warn' });
      return;
    }
    const hit = TERRA_PPZ.filter((p) => pointInRing(p.centre, polygon));
    if (!hit.length) {
      ui.subset = null;
      toast('В границы выделения не попал ни один ППЗ', { kind: 'warn' });
    } else {
      ui.subset = new Set(hit.map((p) => p.id));
      ui.page = 1;
      ui.listOpen = true;
      if (ui.selected && !ui.subset.has(ui.selected)) ui.selected = null;
      toast(`Выделено ППЗ: ${hit.length}`, { kind: 'ok' });
    }
    rebuildPpz();
    renderAll();
  }

  function rectRing(a, b) {
    return [
      [a[0], a[1]],
      [a[0], b[1]],
      [b[0], b[1]],
      [b[0], a[1]],
    ];
  }

  function pointInRing([lat, lon], ring) {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [yi, xi] = ring[i];
      const [yj, xj] = ring[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }

  /* ------------------------------- панель слоёв ---------------------------- */

  function renderPanel() {
    if (ui.panelCollapsed) {
      mount(panelHost, [
        el('aside.rail.mapctl', null, [
          el('button.panel__collapse', {
            type: 'button',
            title: 'Развернуть панель слоёв',
            onclick: () => {
              ui.panelCollapsed = false;
              renderAll();
            },
          }, icon('chevronRight')),
          el('span.rail__name', { text: 'Слои' }),
          el('span.rail__count', { text: String(ui.layers.size) }),
        ]),
      ]);
      return;
    }

    const tree = el('div.tree');
    for (const group of LAYER_TREE) {
      const ids = group.subs.flatMap((s) => s.rows.map((r) => r.id));
      const on = ids.filter((id) => ui.layers.has(id)).length;
      const head = el('div.tree__head', null, [
        el('span.checkbox', {
          class: on === ids.length ? 'checkbox--on' : on ? 'checkbox--mixed' : '',
          role: 'button',
          onclick: (event) => {
            event.stopPropagation();
            const next = on !== ids.length;
            for (const id of ids) {
              if (next) ui.layers.add(id);
              else ui.layers.delete(id);
            }
            syncVisibility();
            renderPanel();
          },
        }, on === ids.length ? icon('check', { size: 12, cls: '', stroke: 3 }) : null),
        group.icon ? icon(group.icon, { size: 15, cls: 'icon icon--sm' }) : null,
        el('span.tree__name', { text: group.name }),
        group.editable
          ? el('button.tree__edit', {
              type: 'button',
              title: 'Переименовать, переместить или удалить',
              onclick: (event) => {
                event.stopPropagation();
                openFolderMenu(event.currentTarget);
              },
            }, icon('ruler', { size: 14, cls: 'icon icon--sm' }))
          : null,
        el('span.chev', null, icon(ui.collapsed.has(group.id) ? 'chevronRight' : 'chevronDown', { size: 14, cls: 'icon icon--sm' })),
      ].filter(Boolean));
      head.addEventListener('click', () => {
        if (ui.collapsed.has(group.id)) ui.collapsed.delete(group.id);
        else ui.collapsed.add(group.id);
        renderPanel();
      });

      const body = el('div.tree__sub');
      for (const sub of group.subs) {
        if (sub.title) {
          body.append(
            el('div.tree__subhead', null, [
              sub.icon ? icon(sub.icon, { size: 13, cls: 'icon icon--sm' }) : null,
              el('span', { text: sub.title }),
              sub.badge ? el('span.tree__badge', { text: sub.badge }) : null,
            ].filter(Boolean)),
          );
        }
        for (const row of sub.rows) {
          const active = ui.layers.has(row.id);
          body.append(
            el('label.tree__row', {
              onclick: () => {
                if (active) ui.layers.delete(row.id);
                else ui.layers.add(row.id);
                // Объёмная модель различима только вблизи: высота дома в
                // 25 этажей на обзорном масштабе — три пикселя.
                if (row.id === 'model3d' && !active && map.getZoom() < 15) {
                  map.flyTo(TERRA_PPZ[Math.floor(TERRA_PPZ.length / 2)].centre, 16, { duration: 0.8 });
                  toast('Масштаб переведён к застройке — объёмная модель видна вблизи', { kind: 'ok' });
                }
                syncVisibility();
                renderPanel();
              },
            }, [
              el('span.checkbox', { class: active ? 'checkbox--on' : '' }, active ? icon('check', { size: 12, cls: '', stroke: 3 }) : null),
              row.line
                ? el('span.tree__swatch.tree__swatch--line', { style: { borderTopColor: row.line.color, borderTopStyle: row.line.style } })
                : el('span.tree__swatch', { style: row.swatch }),
              el('span.tree__label', { text: row.name }),
              row.meta ? el('span.tree__meta', { text: row.meta }) : null,
            ].filter(Boolean)),
          );
        }
      }

      tree.append(
        el('div.tree__group', { style: group.id === 'project' ? null : { borderTop: '1px solid var(--border)', paddingTop: '8px' } },
          ui.collapsed.has(group.id) ? [head] : [head, body]),
      );
    }

    mount(panelHost, [
      el('aside.panel.panel--left', null, [
        el('div.panel__head', null, [
          el('div', { style: { flex: '1', minWidth: '0' } }, [
            el('div.panel__title', { text: 'Слои' }),
            el('div.panel__sub', { text: 'Что отображать на карте' }),
          ]),
          el('button.panel__collapse', {
            type: 'button',
            title: 'Свернуть панель',
            onclick: () => {
              ui.panelCollapsed = true;
              renderAll();
            },
          }, icon('chevronLeft')),
        ]),
        el('div.panel__body', null, tree),
        el('div.panel__foot', null, [
          el('span', null, [document.createTextNode('Слоёв в проекте '), el('strong', { style: { color: 'var(--ink)' }, text: String(ALL_ROWS.length) })]),
          el('span.u-spacer'),
          el('button.btn.btn--link', {
            type: 'button',
            onclick: openUpload,
          }, [icon('download', { size: 14, cls: 'icon icon--sm' }), el('span', { text: 'Загрузить слой' })]),
        ]),
      ]),
    ]);
  }

  function openFolderMenu(anchor) {
    const items = [
      { id: 'rename', name: 'Переименовать', icon: 'doc' },
      { id: 'move', name: 'Переместить выше', icon: 'swap' },
      { id: 'copy', name: 'Дублировать проект', icon: 'save' },
      { id: 'delete', name: 'Удалить проект', icon: 'close', danger: true },
    ];
    const menu = el('div.dropdown', { style: { width: '222px', zIndex: '95' } },
      items.flatMap((item, i) => [
        i === items.length - 1 ? el('div.dropdown__sep') : null,
        el('div.dropdown__item', {
          style: item.danger ? { color: 'var(--st-alert)' } : null,
          onclick: () => {
            dismiss?.();
            menu.remove();
            runFolderAction(item.id);
          },
        }, [icon(item.icon, { size: 14, cls: 'icon icon--sm' }), el('span', { text: item.name })]),
      ].filter(Boolean)));

    const rect = anchor.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 6}px`;
    document.body.append(menu);
    const dismiss = onDismiss(menu, () => {
      dismiss();
      menu.remove();
    });
  }

  function runFolderAction(id) {
    if (id === 'rename') {
      promptDialog({
        title: 'Переименовать проект',
        label: 'Название проекта',
        value: ui.projectName,
        onConfirm: (value) => {
          ui.projectName = value;
          LAYER_TREE[0].name = `Проект «${value}»`;
          toast('Проект переименован', { kind: 'ok' });
          renderAll();
        },
      });
      return;
    }
    if (id === 'delete') {
      toast('Удаление проекта доступно владельцу расчёта', { kind: 'warn' });
      return;
    }
    toast(id === 'copy' ? 'Проект продублирован' : 'Порядок проектов изменён', { kind: 'ok' });
  }

  function openUpload() {
    const input = el('input', { type: 'file', accept: '.geojson,.json', hidden: true });
    document.body.append(input);
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      toast(`Слой «${file.name}» принят в обработку`, { kind: 'ok', timeout: 4200 });
    });
    input.click();
  }

  /* ---------------------------- панель инструментов ------------------------ */

  function toolButton(id, iconName, title, active = false, onclick = null) {
    return el('button.toolbar__btn', {
      type: 'button',
      class: active ? 'is-active' : '',
      title,
      onclick: onclick || (() => toast(`${title} — в разработке`, { kind: 'warn' })),
    }, icon(iconName));
  }

  function renderToolbar() {
    const resource = RESOURCES.find((r) => r.id === ui.resourceId) || RESOURCES[0];

    const runNode =
      ui.calc === 'running'
        ? el('div.progress', null, [
            el('span.progress__head', null, [
              el('span', { text: 'Расчёт анализа территории' }),
              el('span.progress__pct', { text: `${ui.progress} %` }),
            ]),
            el('span.progress__track', null, el('span.progress__fill', { style: { width: `${ui.progress}%` } })),
            el('span.progress__note', { text: 'Идёт 4 мин · не прервётся при выходе' }),
          ])
        : el('button.btn.btn--primary.toolbar__run', { type: 'button', onclick: runCalc }, [
            icon('chart', { size: 14, cls: 'icon icon--sm' }),
            el('span', { text: 'Запуск расчёта' }),
          ]);

    mount(toolbarHost, [
      el('div.mapctl.toolbar', null, [
        el('div.toolbar__group', null, [
          el('button.toolbar__select', {
            type: 'button',
            title: `Проект: ${ui.projectName}`,
            onclick: (event) => openProjects(event.currentTarget),
          }, [
            icon('layers', { size: 14, cls: 'icon icon--sm' }),
            el('span.tname', { text: ui.projectName }),
            icon('chevronDown', { size: 14, cls: 'icon icon--sm' }),
          ]),
          toolButton('new', 'plus', 'Создать новый проект', false, () =>
            promptDialog({
              title: 'Создать проект',
              subtitle: 'Расчёт запускается после загрузки исходных слоёв',
              label: 'Название проекта',
              value: '',
              placeholder: 'Например: Некрасовка — восточный участок',
              confirmText: 'Создать',
              onConfirm: (value) => {
                ui.projectName = value;
                ui.calc = 'idle';
                LAYER_TREE[0].name = `Проект «${value}»`;
                toast('Проект создан — загрузите исходные слои', { kind: 'ok' });
                renderAll();
              },
            })),
        ]),
        el('span.toolbar__sep'),
        el('button.toolbar__select', {
          type: 'button',
          title: 'Вид ресурса для моделирования',
          style: { maxWidth: '150px' },
          onclick: (event) => openResources(event.currentTarget),
        }, [
          el(`span.res.res--sm.res--${resource.id}`, { html: iconSvg(RESOURCE_ICONS[resource.id] || 'dot', { size: 11, cls: '', stroke: 2 }) }),
          el('span.tname', { text: resource.short }),
          icon('chevronDown', { size: 14, cls: 'icon icon--sm' }),
        ]),
        el('span.toolbar__sep'),
        el('div.toolbar__group', null, [
          toolButton('load', 'download', 'Загрузка данных в формате GeoJSON', false, openUpload),
          toolButton('rect', 'square', 'Прямоугольное выделение', ui.tool === 'rect', () => startTool('rect')),
          toolButton('lasso', 'polygon', 'Произвольное выделение', ui.tool === 'lasso', () => startTool('lasso')),
        ]),
        el('span.toolbar__sep'),
        el('div.toolbar__group', null, [
          toolButton('edit', 'ruler', 'Включить режим ручной корректировки', ui.edit, toggleEdit),
          toolButton('list', 'list', 'Скрыть/Показать список объектов', ui.listOpen, () => {
            ui.listOpen = !ui.listOpen;
            renderAll();
          }),
        ]),
        ui.edit
          ? el('button.btn.btn--soft.btn--sm', {
              type: 'button',
              style: { height: '34px', marginLeft: '4px' },
              onclick: saveEdits,
            }, [icon('save', { size: 14, cls: 'icon icon--sm' }), el('span', { text: 'Сохранить' })])
          : null,
        el('span.toolbar__sep'),
        el('div.segmented', null, [
          el('button.segmented__item', {
            type: 'button',
            class: ui.mode === 'view' ? 'is-active' : '',
            title: 'Режим просмотра',
            onclick: () => {
              ui.mode = 'view';
              stopTool();
            },
          }, icon('eye', { size: 14, cls: 'icon icon--sm' })),
          el('button.segmented__item', {
            type: 'button',
            class: ui.mode === 'select' ? 'is-active' : '',
            title: 'Режим выделения',
            onclick: () => {
              ui.mode = 'select';
              startTool('rect');
            },
          }, icon('pinSearch', { size: 14, cls: 'icon icon--sm' })),
        ]),
        el('span.toolbar__sep'),
        runNode,
      ]),
    ]);
  }

  function openProjects(anchor) {
    openMenu(anchor, PROJECTS.map((p) => ({
      id: p.id,
      name: p.name,
      meta: p.note,
      current: p.id === ui.projectId,
      run: () => {
        ui.projectId = p.id;
        ui.projectName = p.name;
        LAYER_TREE[0].name = `Проект «${p.name}»`;
        ui.calc = p.note === 'черновик' ? 'idle' : 'done';
        ui.subset = null;
        ui.selected = null;
        toast(`Проект: ${p.name}`, { kind: 'ok' });
        renderAll();
      },
    })), 250);
  }

  function openResources(anchor) {
    openMenu(anchor, RESOURCES.map((r) => ({
      id: r.id,
      name: r.name,
      meta: r.id === 'heat' ? 'расчёт доступен' : 'модель в разработке',
      current: r.id === ui.resourceId,
      run: () => {
        ui.resourceId = r.id;
        if (r.id !== 'heat') {
          toast(`${r.name}: модель подключения в разработке, показатели остаются тепловыми`, { kind: 'warn', timeout: 5200 });
        }
        renderAll();
      },
    })), 230);
  }

  function openMenu(anchor, items, width) {
    const menu = el('div.dropdown', { style: { width: `${width}px`, zIndex: '95' } },
      items.map((item) =>
        el('div.dropdown__item', {
          class: item.current ? 'is-selected' : '',
          onclick: () => {
            dismiss();
            menu.remove();
            item.run();
          },
        }, [
          el('span', { text: item.name }),
          el('span.dropdown__meta', { text: item.meta }),
        ])));
    const rect = anchor.getBoundingClientRect();
    menu.style.left = `${Math.max(8, rect.left)}px`;
    menu.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    document.body.append(menu);
    const dismiss = onDismiss(menu, () => {
      dismiss();
      menu.remove();
    });
  }

  function toggleEdit() {
    if (ui.edit && ui.dirty) {
      confirmSave(() => {
        ui.edit = false;
        renderAll();
      });
      return;
    }
    ui.edit = !ui.edit;
    if (ui.edit) {
      ui.mode = 'select';
      stopTool();
      toast('Режим ручной корректировки: тяните точки контура ППЗ', { kind: 'ok', timeout: 4200 });
    }
    applyEditHandles();
    renderAll();
  }

  /** Точки-манипуляторы контура выбранного ППЗ. */
  const handles = L.layerGroup().addTo(map);

  function applyEditHandles() {
    handles.clearLayers();
    if (!ui.edit || !ui.selected) return;
    const shape = ppzShapes.get(ui.selected);
    if (!shape) return;
    const ring = shape.getLatLngs()[0];
    ring.forEach((ll, i) => {
      const marker = L.circleMarker(ll, {
        pane: 'terraTop',
        radius: 5,
        color: '#1f4bc4',
        weight: 2,
        fillColor: '#fff',
        fillOpacity: 1,
        className: 'terra-handle',
      }).addTo(handles);
      marker.on('mousedown', () => {
        map.dragging.disable();
        const move = (event) => {
          marker.setLatLng(event.latlng);
          const next = shape.getLatLngs()[0].slice();
          next[i] = event.latlng;
          shape.setLatLngs([next]);
          ui.dirty = true;
        };
        const up = () => {
          map.off('mousemove', move);
          map.off('mouseup', up);
          map.dragging.enable();
          renderToolbar();
        };
        map.on('mousemove', move);
        map.on('mouseup', up);
      });
    });
  }

  function saveEdits() {
    if (!ui.dirty) {
      toast('Изменений нет', { kind: 'warn' });
      return;
    }
    confirmSave(() => {
      ui.dirty = false;
      ui.edit = false;
      toast('Корректировка сохранена', { kind: 'ok' });
      renderAll();
    });
  }

  function confirmSave(onDone) {
    const overlay = el('div.modal-overlay');
    const close = () => overlay.remove();
    const dialog = el('div.modal.dialog', { role: 'dialog', 'aria-modal': 'true' }, [
      el('div.modal__head', null, [
        el('div', { style: { flex: '1', minWidth: '0' } }, [
          el('div.modal__title', { text: 'Сохранить изменения?' }),
          el('div.modal__sub', { text: 'Контуры ППЗ изменены вручную. Расчёт подключения будет пересчитан.' }),
        ]),
      ]),
      el('div.dialog__foot', null, [
        el('button.btn.btn--ghost', {
          type: 'button',
          text: 'Отмена',
          onclick: () => {
            close();
            rebuildPpz();
            applyEditHandles();
            ui.dirty = false;
          },
        }),
        el('button.btn.btn--primary', {
          type: 'button',
          text: 'Сохранить',
          onclick: () => {
            close();
            handles.clearLayers();
            onDone();
          },
        }),
      ]),
    ]);
    overlay.append(dialog);
    overlay.addEventListener('pointerdown', (event) => {
      if (event.target === overlay) close();
    });
    document.body.append(overlay);
  }

  let calcTimer = null;

  function runCalc() {
    if (ui.calc === 'running') return;
    ui.calc = 'running';
    ui.progress = 0;
    renderToolbar();
    calcTimer = setInterval(() => {
      ui.progress = Math.min(100, ui.progress + 7);
      if (ui.progress >= 100) {
        clearInterval(calcTimer);
        calcTimer = null;
        ui.calc = 'done';
        toast(`Расчёт завершён: ${TERRA_PPZ.length} ППЗ, ${fmt(TERRA_PROJECT.demand)} Гкал/ч`, { kind: 'ok', timeout: 5200 });
        renderAll();
        return;
      }
      renderToolbar();
      renderChips();
    }, 260);
  }

  /* --------------------------- список объектов ---------------------------- */

  function renderList() {
    if (!ui.listOpen) return mount(listHost, []);
    const all = visiblePpz();
    const pages = Math.max(1, Math.ceil(all.length / ui.pageSize));
    ui.page = Math.min(ui.page, pages);
    const from = (ui.page - 1) * ui.pageSize;
    const rows = all.slice(from, from + ui.pageSize);

    const body = el('div.panel__body', { style: { paddingTop: '2px' } },
      rows.length
        ? rows.map((p) => {
            const node = el('button.ppz', {
              type: 'button',
              class: ui.selected === p.id ? 'is-selected' : '',
              title: 'Двойной щелчок — показать на карте',
              onclick: () => select(p.id),
              ondblclick: () => {
                ui.selected = p.id;
                map.flyToBounds(p.ring, { maxZoom: 16, duration: 0.6 });
                applySelection();
                renderAll();
              },
            }, [
              el('span.ppz__mark', { text: p.id }),
              el('span.ppz__main', null, [
                el('span.ppz__name', { text: `ППЗ-${p.id} · ${p.name}` }),
                el('span.ppz__id', { text: `rki_id ${p.rki}` }),
              ]),
              el('span.ppz__load', null, [
                el('span.ppz__value', { text: fmt(p.load) }),
                el('br'),
                el('span.ppz__unit', { text: 'Гкал' }),
              ]),
            ]);
            return node;
          })
        : el('div.search__empty', { text: 'В выделении нет ППЗ' }));

    mount(listHost, [
      el('aside.panel.panel--right', { style: { width: '344px' } }, [
        el('div.panel__head', null, [
          el('div', { style: { flex: '1', minWidth: '0' } }, [
            el('div.panel__title', { text: 'Список объектов' }),
            el('div.panel__sub', { text: ui.subset ? 'ППЗ в выделенной области' : 'Полигоны перспективной застройки' }),
          ]),
          el('span.badge.badge--accent', { text: String(all.length) }),
          ui.subset
            ? el('button.panel__collapse', {
                type: 'button',
                title: 'Снять выделение области',
                onclick: () => {
                  ui.subset = null;
                  ui.page = 1;
                  rebuildPpz();
                  renderAll();
                },
              }, icon('refresh'))
            : null,
          el('button.panel__collapse', {
            type: 'button',
            title: 'Закрыть',
            onclick: () => {
              ui.listOpen = false;
              renderAll();
            },
          }, icon('close')),
        ].filter(Boolean)),
        body,
        el('div.panel__foot', { style: { gap: '6px' } }, [
          pager(pages),
          el('span.u-spacer'),
          el('button.select', {
            type: 'button',
            style: { width: '76px', height: '30px', padding: '0 8px' },
            title: 'Объектов на странице',
            onclick: (event) =>
              openMenu(event.currentTarget, PAGE_SIZES.map((n) => ({
                id: String(n),
                name: String(n),
                meta: 'на странице',
                current: n === ui.pageSize,
                run: () => {
                  ui.pageSize = n;
                  ui.page = 1;
                  renderList();
                },
              })), 150),
          }, [
            el('span.select__value', { style: { fontSize: 'var(--t-sm)' }, text: String(ui.pageSize) }),
            icon('chevronDown', { size: 14, cls: 'icon icon--sm' }),
          ]),
        ]),
      ]),
    ]);
  }

  function pager(pages) {
    const go = (n) => {
      ui.page = Math.min(pages, Math.max(1, n));
      renderList();
    };
    const nums = [];
    for (let n = 1; n <= Math.min(3, pages); n += 1) {
      nums.push(el('button.pager__btn', { type: 'button', class: n === ui.page ? 'is-active' : '', text: String(n), onclick: () => go(n) }));
    }
    if (pages > 3) {
      nums.push(el('button.pager__btn', { type: 'button', title: 'Вперёд на 5 страниц', text: '…', onclick: () => go(ui.page + 5) }));
    }
    return el('div.pager', null, [
      el('button.pager__btn', { type: 'button', title: 'Назад', onclick: () => go(ui.page - 1) }, icon('chevronLeft', { size: 14, cls: 'icon icon--sm' })),
      ...nums,
      el('button.pager__btn', { type: 'button', title: 'Вперёд', onclick: () => go(ui.page + 1) }, icon('chevronRight', { size: 14, cls: 'icon icon--sm' })),
    ]);
  }

  /* ------------------------------ карточка ППЗ ---------------------------- */

  function renderCard() {
    if (ui.sourceOpen) return renderSourceCard();
    const p = TERRA_PPZ.find((x) => x.id === ui.selected);
    if (!p) {
      syncField(0);
      return mount(cardHost, []);
    }
    syncField(330);

    const right = ui.listOpen ? 'calc(var(--panel-gap) * 2 + 344px)' : 'var(--panel-gap)';
    mount(cardHost, [
      el('aside.panel', { style: { right, top: 'var(--panel-gap)', bottom: 'var(--panel-gap)', width: '330px' } }, [
        el('div.mapcard__head.mapcard__head--hero', {
          style: { background: 'linear-gradient(140deg, var(--a-500), var(--a-700))', padding: '14px var(--s-4) var(--s-3)' },
        }, [
          el('span.res', { style: { background: 'rgba(255,255,255,.2)', width: '38px', height: '38px', borderRadius: '11px' }, html: iconSvg('polygon', { size: 20, cls: '', stroke: 2 }) }),
          el('div', { style: { flex: '1', minWidth: '0' } }, [
            el('div.mapcard__title', { text: `ППЗ-${p.id}` }),
            el('div.mapcard__sub', { text: `${p.name} · ${TERRA_PROJECT.okrugName}` }),
          ]),
          el('button.mapcard__close', { type: 'button', title: 'Закрыть', onclick: () => select(p.id) }, icon('close')),
        ]),
        el('div', { style: { padding: '10px var(--s-4) 0', display: 'flex', alignItems: 'center', gap: 'var(--s-2)' } }, [
          el('span.badge.badge--accent', null, [icon('check', { size: 12, cls: 'icon icon--sm' }), el('span', { text: 'Подключение смоделировано' })]),
          el('span.u-spacer'),
          el('span', { style: { fontSize: 'var(--t-xs)', color: 'var(--ink-4)', whiteSpace: 'nowrap' }, text: `rki_id ${p.rki}` }),
        ]),
        el('div.panel__body', { style: { paddingTop: 'var(--s-3)' } }, [
          el('div.eyebrow', { style: { marginBottom: '2px' }, text: 'Общая информация' }),
          factgrid([
            ['Количество новых ОКС', String(p.ocs), 'шт.'],
            ['Суммарная расчётная тепловая нагрузка новых ОКС', fmt(p.load), 'Гкал/ч'],
          ], 'var(--s-4)'),
          el('div.eyebrow', { style: { marginBottom: '2px' }, text: 'Строительство тепловых сетей' }),
          factgrid([
            ['Диаметр теплового ввода', String(p.diameter), 'мм'],
            ['Протяжённость строительства тепловых сетей', formatInt(p.length), 'м'],
            ['Капитальные вложения в строительство', fmt(p.capex), 'млн ₽'],
          ], 'var(--s-3)'),
          el('div.callout', null, [
            icon('info', { size: 14, cls: 'icon icon--sm' }),
            el('span', { html: `Подключение к <b>МТС Ду 500</b> от ${TERRA_SOURCE.name}, точка врезки ${nearestTap(p)}. Свободный резерв источника — ${TERRA_SOURCE.reserve} Гкал/ч при потребности застройки ${fmt(TERRA_SOURCE.demand)}: <b>требуется модернизация</b>.` }),
          ]),
        ]),
        el('div.panel__foot', null, [
          el('button.btn.btn--ghost.btn--sm', {
            type: 'button',
            style: { flex: '1' },
            onclick: () => map.flyToBounds(p.ring, { maxZoom: 16, duration: 0.6 }),
          }, [icon('pinSearch', { size: 14, cls: 'icon icon--sm' }), el('span', { text: 'На карте' })]),
          el('button.btn.btn--ghost.btn--sm', {
            type: 'button',
            style: { flex: '1' },
            onclick: () => toast('Выгрузка карточки ППЗ будет доступна после согласования формы', { kind: 'warn' }),
          }, [icon('download', { size: 14, cls: 'icon icon--sm' }), el('span', { text: 'Выгрузить' })]),
        ]),
      ]),
    ]);
  }

  function nearestTap(p) {
    let best = TERRA_TAPS[0];
    let bd = Infinity;
    for (const t of TERRA_TAPS) {
      const d = Math.hypot(t.latlng[0] - p.tap[0], t.latlng[1] - p.tap[1]);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best?.id || 'ТК-118';
  }

  /* ---------------------------- карточка источника ------------------------- */

  function renderSourceCard() {
    const s = TERRA_SOURCE;
    syncField(376);
    const covered = Math.round((s.reserve / s.demand) * 100);
    const right = ui.listOpen ? 'calc(var(--panel-gap) * 2 + 344px)' : 'var(--panel-gap)';

    mount(cardHost, [
      el('aside.panel', { style: { right, top: 'var(--panel-gap)', bottom: 'var(--panel-gap)', width: '376px' } }, [
        el('div.mapcard__head.mapcard__head--hero', {
          style: { background: 'linear-gradient(140deg, var(--res-heat), var(--res-heat-deep))', padding: '14px var(--s-4) var(--s-3)' },
        }, [
          el('span.res', { style: { background: 'rgba(255,255,255,.2)', width: '38px', height: '38px', borderRadius: '11px' }, html: iconSvg('factory', { size: 20, cls: '', stroke: 2 }) }),
          el('div', { style: { flex: '1', minWidth: '0' } }, [
            el('div.mapcard__title', { text: s.name }),
            el('div.mapcard__sub', { text: `Источник теплоснабжения · ${s.org}` }),
          ]),
          el('button.mapcard__close', {
            type: 'button',
            title: 'Закрыть',
            onclick: () => {
              ui.sourceOpen = false;
              renderAll();
            },
          }, icon('close')),
        ]),
        el('div', { style: { padding: '11px var(--s-4) 0', display: 'flex', alignItems: 'center', gap: 'var(--s-2)' } }, [
          el('span.badge.badge--alert', null, [icon('warning', { size: 12, cls: 'icon icon--sm' }), el('span', { text: 'Требуется модернизация' })]),
        ]),
        el('div.panel__body', { style: { paddingTop: 'var(--s-3)' } }, [
          el('div.eyebrow', { style: { marginBottom: '2px' }, text: 'Баланс мощности' }),
          el('div.field__hint', { style: { margin: '0 0 8px' }, text: `установленная мощность ${s.capacity} Гкал/ч` }),
          balance(s),
          el('div.group', { style: { borderTop: '1px solid var(--border)', marginTop: 'var(--s-3)' } }, [
            el('div.group__head', null, [
              el('span', { text: 'Потребность новой застройки' }),
              el('span.u-spacer'),
              el('span.group__count', { text: `${fmt(s.demand)} Гкал/ч` }),
            ]),
            el('div.stack', { style: { height: '12px', borderRadius: '6px', margin: '2px 0 9px' } }, [
              el('span.stack__seg', { style: { flexGrow: String(s.reserve), background: 'var(--a-400)' } }),
              el('span.stack__seg', { style: { flexGrow: String(s.deficit), background: 'var(--st-alert)' } }),
            ]),
            donutRow('var(--a-400)', 'Покрывается резервом', `${s.reserve},0`, `${covered} %`),
            donutRow('var(--st-alert)', 'Дефицит мощности', fmt(s.deficit), `${100 - covered} %`, true),
          ]),
          el('div.group', null, [
            el('div.group__head', { text: 'Что делать' }),
            el('div.list', null, TERRA_OPTIONS.map((o, i) =>
              el('button.ppz', {
                type: 'button',
                class: o.solves ? 'is-selected' : '',
                style: { textAlign: 'left', marginTop: i ? '6px' : '0' },
                onclick: () => toast(`${o.name}: ${o.note}`, { kind: 'ok', timeout: 5200 }),
              }, [
                el('span.ppz__mark', { style: o.solves ? { background: 'var(--st-alert-soft)', color: 'var(--st-alert-ink)' } : null, text: String(i + 1) }),
                el('span.ppz__main', null, [
                  el('span.ppz__name', { text: o.name }),
                  el('span.ppz__id', { text: o.note }),
                ]),
                el('span.ppz__load', null, [
                  el('span.ppz__value', { text: o.value }),
                  el('br'),
                  el('span.ppz__unit', { text: o.unit }),
                ]),
              ]))),
          ]),
          el('div.group', null, [
            el('div.group__head', { text: 'Характеристики источника' }),
            factgrid([
              ['Год ввода', String(s.year), ''],
              ['Износ оборудования', String(s.wear), '%'],
              ['Зона действия', String(s.zoneDistricts), 'района'],
              ['Подключено ППЗ проекта', String(TERRA_PPZ.length), 'шт.'],
            ]),
          ]),
        ]),
        el('div.panel__foot', null, [
          el('button.btn.btn--ghost.btn--sm', { type: 'button', style: { flex: '1' }, onclick: () => toast('Паспорт источника открывается в разделе «Сведения об объектах»', { kind: 'warn' }) },
            [icon('doc', { size: 14, cls: 'icon icon--sm' }), el('span', { text: 'Паспорт источника' })]),
          el('button.btn.btn--primary.btn--sm', { type: 'button', style: { flex: '1' }, onclick: () => toast('Баланс мощности выгружается в отчёт по проекту', { kind: 'ok' }) },
            [icon('download', { size: 14, cls: 'icon icon--sm' }), el('span', { text: 'Выгрузить баланс' })]),
        ]),
      ]),
    ]);
  }

  function balance(s) {
    const size = 96;
    const th = 14;
    const r = (size - th) / 2;
    const c = 2 * Math.PI * r;
    const share = s.connected / s.capacity;
    const svg = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--a-300)" stroke-width="${th}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--res-heat)" stroke-width="${th}"
        stroke-dasharray="${(c * share).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>`;
    return el('div.donut', null, [
      el('div', { style: { position: 'relative' } }, [
        el('div', { html: svg }),
        el('div.donut__hole', null, [
          el('div.donut__value', { text: String(s.capacity) }),
          el('div.donut__label', { text: 'ГКАЛ/Ч' }),
        ]),
      ]),
      el('div.donut__legend', null, [
        donutRow('var(--res-heat)', 'Присоединённая нагрузка', String(s.connected), `${Math.round(share * 100)} %`),
        donutRow('var(--a-300)', 'Свободный резерв', String(s.reserve), `${100 - Math.round(share * 100)} %`),
      ]),
    ]);
  }

  function donutRow(color, name, num, pct, alert = false) {
    return el('div.donut__row', { style: { padding: '3px 0', margin: '0' } }, [
      el('span.legend__swatch.legend__swatch--dot', { style: { background: color } }),
      el('span.donut__name', { style: alert ? { color: 'var(--st-alert-ink)', fontWeight: '600' } : null, text: name }),
      el('span.donut__num', { style: alert ? { color: 'var(--st-alert-ink)' } : null, text: num }),
      el('span.donut__pct', { text: pct }),
    ]);
  }

  function factgrid(rows, marginBottom = null) {
    return el('div.factgrid', { style: marginBottom ? { marginBottom } : null },
      rows.map(([label, value, unit]) =>
        el('div.factgrid__row', null, [
          el('span.factgrid__label', { text: label }),
          el('span.factgrid__value', null, [
            document.createTextNode(value),
            unit ? el('span.factgrid__unit', { text: unit }) : null,
          ].filter(Boolean)),
        ])));
  }

  /* -------------------------------- легенда ------------------------------- */

  function renderLegend() {
    const rows = [
      ['Полигон перспективной застройки', { background: 'rgba(47,99,226,.22)', border: `2px solid ${ACCENT}` }, String(visiblePpz().length), 'ppz'],
      ['Магистральные тепловые сети', null, '', 'mts', { borderTop: `4px solid ${HEAT}` }],
      ['Трасса подключения', null, String(visiblePpz().length), 'traces', { borderTop: `2.5px dashed ${HEAT}` }],
      ['Точка подключения к МТС', { background: '#fff', border: `2px solid ${HEAT}`, borderRadius: '50%' }, String(TERRA_TAPS.length), 'taps'],
      ['Препятствия', { background: 'repeating-linear-gradient(45deg, rgba(225,29,72,.5) 0 2px, transparent 2px 5px), rgba(225,29,72,.08)' }, String(TERRA_OBSTACLES.length), 'obstacles'],
    ].filter(([, , , id]) => ui.layers.has(id));

    if (!rows.length) return mount(legendHost, []);

    mount(legendHost, [
      el('div.mapctl.legend', null, [
        el('div.legend__title', { text: 'Условные обозначения' }),
        el('div.legend__sub', { text: `Проект «${ui.projectName}»` }),
        ...rows.map(([name, swatch, count, , line]) =>
          el('div.legend__row', null, [
            line ? el('span.legend__line', { style: line }) : el('span.legend__swatch', { style: swatch }),
            el('span', { text: name }),
            count ? el('span.legend__count', { text: count }) : null,
          ].filter(Boolean))),
      ]),
    ]);
  }

  /* -------------------------------- чипы --------------------------------- */

  function renderChips() {
    const status =
      ui.calc === 'running'
        ? { text: `Расчёт идёт · ${ui.progress} %`, dot: 'var(--st-warn)' }
        : ui.calc === 'done'
          ? { text: `Расчёт завершён ${TERRA_PROJECT.calculatedOn.slice(11)}`, dot: 'var(--st-ok)' }
          : { text: 'Расчёт не запускался', dot: 'var(--st-nodata)' };

    mount(chipHost, [
      el('div.chipbar', null, [
        el('span.chip', null, [
          icon('polygon', { size: 13, cls: 'icon icon--sm' }),
          el('span', { text: 'Анализ территории' }),
          el('button.chip__x', { type: 'button', title: 'Вернуться к карте объектов', onclick: () => onExit?.() }, icon('close', { size: 12, cls: 'icon icon--sm' })),
        ]),
        el('span.chip.chip--plain', null, [
          el('span.chip__dot', { style: { background: status.dot } }),
          el('span', { text: status.text }),
        ]),
        ui.subset
          ? el('span.chip', null, [
              el('span', { text: `Выделение: ${ui.subset.size} ППЗ` }),
              el('button.chip__x', {
                type: 'button',
                title: 'Снять выделение',
                onclick: () => {
                  ui.subset = null;
                  ui.page = 1;
                  rebuildPpz();
                  renderAll();
                },
              }, icon('close', { size: 12, cls: 'icon icon--sm' })),
            ])
          : null,
      ].filter(Boolean)),
    ]);
  }

  /* ------------------------------- отрисовка ------------------------------ */

  /**
   * Карточка и список вместе занимают почти половину экрана: на ноутбучном
   * кадре панель слоёв в это время сворачивается в полосу, иначе панели
   * инструментов не остаётся места. Свой выбор пользователя это не затирает —
   * при закрытии карточки панель возвращается.
   */
  function syncPanelRoom() {
    const cardOpen = Boolean(ui.selected) || ui.sourceOpen;
    const tight = window.innerWidth < 1800;
    if (cardOpen && tight && ui.listOpen && !ui.panelCollapsed) {
      ui.panelCollapsed = true;
      ui.autoCollapsed = true;
    } else if (!cardOpen && ui.autoCollapsed) {
      ui.panelCollapsed = false;
      ui.autoCollapsed = false;
    }
  }

  function renderPanels() {
    renderList();
    renderCard();
    renderLegend();
    applyEditHandles();
  }

  function renderAll() {
    syncPanelRoom();
    renderPanel();
    renderToolbar();
    renderChips();
    renderPanels();
    stage.classList.toggle('is-panel-collapsed', ui.panelCollapsed);
  }

  /**
   * Свободное поле карты считается по фактической ширине правых панелей:
   * их две, и обе появляются по ходу работы, поэтому ширины отдаются в CSS
   * переменными, а не зашиваются в стилях.
   */
  function syncField(cardWidth) {
    stage.style.setProperty('--terra-list-w', ui.listOpen ? `calc(344px + var(--panel-gap))` : '0px');
    stage.style.setProperty('--terra-card-w', cardWidth ? `calc(${cardWidth}px + var(--panel-gap))` : '0px');
  }

  function fmt(value) {
    return String(Math.round(value * 10) / 10).replace('.', ',');
  }

  /* ------------------------------ кнопки карты ---------------------------- */

  const zoombox = el('div.mapctl.zoombox', null, [
    el('button.zoombox__btn', { type: 'button', title: 'Приблизить', onclick: () => map.zoomIn() }, icon('plus', { size: 16 })),
    el('button.zoombox__btn', { type: 'button', title: 'Отдалить', onclick: () => map.zoomOut() }, icon('minus', { size: 16 })),
    el('button.zoombox__btn', {
      type: 'button',
      title: 'Показать проект целиком',
      onclick: () => map.flyToBounds(TERRA_BOUNDS, { padding: [30, 30], duration: 0.6 }),
    }, icon('target', { size: 16 })),
    el('button.zoombox__btn', { type: 'button', title: 'Вернуться к карте объектов', onclick: () => onExit?.() }, icon('logout', { size: 16 })),
  ]);
  mapHost.append(zoombox);

  /* -------------------------------- запуск -------------------------------- */

  buildLayers();
  syncVisibility();
  renderAll();

  let fitted = false;

  return {
    node: stage,
    activate() {
      requestAnimationFrame(() => {
        map.invalidateSize();
        if (!fitted) {
          map.fitBounds(TERRA_BOUNDS, { padding: [30, 30] });
          fitted = true;
        }
        syncLabels();
      });
    },
    update() {},
    invalidate() {
      map.invalidateSize();
      syncLabels();
    },
  };
}
