/**
 * Карта: территориальные слои, кластеры, объекты и инструменты.
 *
 * Уровень детализации переключается по масштабу: город → округа,
 * округ → районы, район → кластеры, объект → отдельные объекты.
 */

import { el, mount, onDismiss } from '../utils/dom.js';
import { icon, iconSvg, resourceBadge } from './icons.js';
import { getState, setState } from '../state.js';
import {
  CITY,
  OBJECT_TYPES,
  RESOURCES,
  RESOURCE_BY_ID,
  STATUSES,
  STATUS_BY_ID,
  TYPE_GROUPS,
  scaleForZoom,
} from '../data/catalog.js';
import {
  CITY_BOUNDS,
  districtById,
  districtStats,
  districtsInBounds,
  featuresOfDistrict,
  filterFromState,
  incidentsByOkrug,
  okrugById,
  okrugStats,
  territories,
} from '../data/model.js';
import { distanceKm, polygonAreaKm2, toMultiPolygon } from '../data/geo.js';
import { adjust } from '../utils/color.js';
import { formatArea, formatInt, formatKm, formatNumber } from '../utils/format.js';
import { hashString } from '../utils/rng.js';

const L = window.L;

/**
 * Картографические подложки. Дома, дороги и их подписи приходят именно отсюда:
 * это тайловые сервисы, а не векторный слой приложения. Полная застройка
 * Москвы — больше миллиона контуров — в клиентское приложение не встраивается,
 * поэтому в рабочем контуре её отдаёт тайловый сервер.
 *
 * Источники подобраны так, чтобы работать без ключа доступа: CARTO
 * переведён на платную модель и печатает поверх своих тайлов водяной знак
 * «API KEY REQUIRED», поэтому здесь не используется.
 */
const BASE_LAYERS = [
  {
    id: 'scheme',
    name: 'Схема',
    hint: 'дома, дороги и адреса',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  {
    id: 'light',
    name: 'Контрастная',
    hint: 'приглушённый фон',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    // Подложка отрисована до z16, дальше Leaflet растягивает последний уровень.
    maxNativeZoom: 16,
    attribution: 'Esri, HERE, Garmin, &copy; OpenStreetMap',
  },
  {
    id: 'satellite',
    name: 'Космоснимок',
    hint: 'реальная застройка',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 19,
    dark: true,
    attribution: 'Esri, Maxar, Earthstar Geographics',
  },
  {
    id: 'none',
    name: 'Без подложки',
    hint: 'только контуры и объекты',
    url: null,
    attribution: '',
  },
];

const BASE_BY_ID = Object.fromEntries(BASE_LAYERS.map((layer) => [layer.id, layer]));

export function createMap({ host, onAction }) {
  const node = host || el('div.mapwrap');
  const mapNode = el('div.map');
  node.append(mapNode);

  const map = L.map(mapNode, {
    center: CITY.center,
    zoom: 10,
    minZoom: 9,
    maxZoom: 19,
    zoomControl: false,
    attributionControl: true,
    preferCanvas: false,
    zoomSnap: 0.5,
    wheelPxPerZoomLevel: 110,
  });
  map.attributionControl.setPrefix('');

  let baseKey = 'scheme';
  let baseLayer = addBase(baseKey);

  function addBase(key) {
    const cfg = BASE_BY_ID[key];
    node.classList.toggle('is-dark-base', Boolean(cfg.dark));
    if (!cfg.url) return null;
    return L.tileLayer(cfg.url, {
      // Явный undefined перетёр бы значение по умолчанию, и Leaflet упал бы
      // на подложке без поддоменов.
      subdomains: cfg.subdomains || 'abc',
      maxZoom: cfg.maxZoom,
      maxNativeZoom: cfg.maxNativeZoom || cfg.maxZoom,
      attribution: cfg.attribution,
      crossOrigin: true,
    }).addTo(map);
  }

  // Подложка может быть недоступна (закрытый контур) — сообщаем один раз.
  let tileWarned = false;
  baseLayer?.on('tileerror', () => {
    if (tileWarned) return;
    tileWarned = true;
    node.append(
      el('div.maploader', null, [
        icon('warning'),
        el('span', {
          text: 'Тайлы подложки не загружаются — дома и дороги не будут показаны. Доступны только контуры территорий.',
        }),
      ]),
    );
    setTimeout(() => node.querySelector('.maploader')?.remove(), 6000);
  });

  L.control.scale({ metric: true, imperial: false, position: 'bottomleft', maxWidth: 120 }).addTo(map);

  const layers = {
    territory: L.layerGroup().addTo(map),
    labels: L.layerGroup().addTo(map),
    clusters: L.layerGroup().addTo(map),
    objects: L.layerGroup().addTo(map),
    tools: L.layerGroup().addTo(map),
    area: L.layerGroup().addTo(map),
  };

  const controls = buildControls({ map, node, onAction, onBaseSwitch: switchBase, getBase: () => baseKey });
  node.append(controls.zoombox, controls.toolbar, controls.legend);

  function switchBase(key) {
    if (key === baseKey) return;
    baseKey = key;
    if (baseLayer) map.removeLayer(baseLayer);
    baseLayer = addBase(baseKey);
    baseLayer?.bringToBack();
    controls.updateBase(baseKey);
    scheduleRender();
  }

  /* ------------------------------ отрисовка ------------------------------ */

  let popup = null;
  let renderScheduled = false;
  // Во время рисования слои карты не должны перехватывать клики,
  // иначе события не доходят до инструмента.
  let drawing = false;
  let fillScale = 1;

  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
      renderScheduled = false;
      render();
    });
  }

  function render() {
    const state = getState();
    const zoom = map.getZoom();
    const scale = scaleForZoom(zoom).id;
    const filter = filterFromState(state);
    drawing = !state.ui.viewMode && Boolean(state.ui.tool);
    // На космоснимке заливка приглушается, иначе застройка под ней не видна.
    fillScale = node.classList.contains('is-dark-base') ? 0.4 : 1;

    layers.territory.clearLayers();
    layers.labels.clearLayers();
    layers.clusters.clearLayers();
    layers.objects.clearLayers();

    const focusOkrug = state.filters.okrugId;
    const focusDistrict = state.filters.districtId;

    if (scale === 'city') {
      drawOkrugs({ state, filter, dim: false });
    } else if (scale === 'okrug') {
      drawOkrugs({ state, filter, dim: true });
      drawDistricts({ state, filter, outlineOnly: true });
    } else if (scale === 'district') {
      drawDistricts({ state, filter, outlineOnly: false, labelsAbove: true });
      drawClusters({ state, filter });
    } else {
      drawDistricts({ state, filter, outlineOnly: true, labels: true });
      drawObjects({ state, filter });
    }

    controls.updateZoom(zoom);
    controls.updateLegend(state, scale);

    if (state.map.scale !== scale) {
      setState({ map: { scale, zoom, center: toArray(map.getCenter()) } }, ['scale']);
    }
    void focusOkrug;
    void focusDistrict;
  }

  function isDimmed(state, okrugId, districtId) {
    const f = state.filters;
    if (f.districtId) return districtId !== f.districtId;
    if (f.okrugId) return okrugId !== f.okrugId;
    return false;
  }

  function drawOkrugs({ state, filter, dim }) {
    for (const okrug of territories) {
      // Округа, для которых в наборе границ нет геометрии, на карту не выводим:
      // выдуманный контур рядом с реальными границами вводит в заблуждение.
      if (okrug.approximate) continue;
      const dimmed = isDimmed(state, okrug.id, null);
      const selected = state.selection.kind === 'okrug' && state.selection.id === okrug.id;
      const poly = L.polygon(toMultiPolygon(okrug.polygon), {
        className: 'terr',
        color: selected ? '#1668dc' : '#ffffff',
        weight: selected ? 2.5 : 1.6,
        opacity: dimmed ? 0.5 : 0.95,
        fillColor: okrug.color,
        fillOpacity: (dimmed ? 0.16 : dim ? 0.24 : 0.46) * fillScale,
        interactive: !drawing,
      });
      poly.on('click', (event) => {
        L.DomEvent.stop(event);
        openOkrugCard(okrug, event.latlng);
      });
      poly.on('mouseover', () => poly.setStyle({ fillOpacity: (dimmed ? 0.26 : 0.6) * fillScale }));
      poly.on('mouseout', () => poly.setStyle({ fillOpacity: (dimmed ? 0.16 : dim ? 0.24 : 0.46) * fillScale }));
      poly.bindTooltip(okrug.name, { className: 'map-tip', sticky: true });
      layers.territory.addLayer(poly);

      layers.labels.addLayer(okrugPill(okrug, dimmed));
    }
    void filter;
  }

  function okrugPill(okrug, dimmed) {
    const count = incidentsByOkrug.get(okrug.id) || 0;
    const state = getState();
    const active = state.filters.okrugId === okrug.id;
    const html = `<div class="okrug-pill ${active ? 'is-active' : ''} ${dimmed ? 'okrug-pill--muted' : ''}">
      <span>${okrug.code}</span>
      <span class="okrug-pill__count">${count}</span>
    </div>`;
    const marker = L.marker(okrug.center, {
      icon: L.divIcon({ className: '', html, iconSize: null }),
      interactive: !drawing,
      keyboard: false,
      title: `${okrug.name}: ${count} открытых событий`,
    });
    marker.on('click', () => focusOn({ kind: 'okrug', id: okrug.id }));
    return marker;
  }

  function drawDistricts({ state, filter, outlineOnly, labels = false, labelsAbove = false }) {
    const box = boundsArray(map.getBounds());
    const visible = districtsInBounds(box, 60);
    for (const district of visible) {
      if (district.approximate) continue;
      const dimmed = isDimmed(state, district.okrugId, district.id);
      const selected = state.selection.kind === 'district' && state.selection.id === district.id;
      const okrug = okrugById.get(district.okrugId);
      const base = okrug?.color || '#cbd5e1';
      const fill = outlineOnly ? base : districtColor(district, base);
      const idle = (dimmed ? 0.12 : outlineOnly ? 0.16 : 0.55) * fillScale;
      const hover = (dimmed ? 0.2 : outlineOnly ? 0.28 : 0.75) * fillScale;
      const poly = L.polygon(toMultiPolygon(district.polygon), {
        className: 'terr',
        color: selected ? '#1668dc' : outlineOnly ? '#8c9bb4' : '#ffffff',
        weight: selected ? 3 : outlineOnly ? 1 : 1.8,
        opacity: dimmed ? 0.4 : 1,
        fillColor: selected ? '#1668dc' : fill,
        fillOpacity: (selected ? 0.32 : idle) * (selected ? fillScale : 1),
        interactive: !drawing,
      });
      poly.on('click', (event) => {
        L.DomEvent.stop(event);
        openDistrictCard(district, event.latlng);
      });
      poly.on('mouseover', () => poly.setStyle({ fillOpacity: selected ? 0.45 : hover, weight: selected ? 3 : 2.4 }));
      poly.on('mouseout', () => poly.setStyle({ fillOpacity: selected ? 0.32 : idle, weight: selected ? 3 : outlineOnly ? 1 : 1.8 }));
      poly.bindTooltip(`${district.name} · ${okrug?.code || ''}`, { className: 'map-tip', sticky: true });
      layers.territory.addLayer(poly);

      if ((labels || !outlineOnly) && !dimmed) {
        layers.labels.addLayer(
          L.marker(district.center, {
            icon: L.divIcon({
              className: '',
              html: `<div class="district-label${labelsAbove ? ' district-label--above' : ''}">${district.name}</div>`,
              iconSize: null,
            }),
            interactive: false,
            keyboard: false,
          }),
        );
      }
    }
    void filter;
  }

  function drawClusters({ state, filter }) {
    const box = boundsArray(map.getBounds());
    const visible = districtsInBounds(box, 40);
    for (const district of visible) {
      if (district.approximate || isDimmed(state, district.okrugId, district.id)) continue;
      const stats = districtStats(district.id, filter);
      if (!stats.total) continue;

      const dominant = dominantResource(stats);
      const size = clusterSize(stats.total);
      const selected = state.selection.kind === 'district' && state.selection.id === district.id;
      const html = `<div class="cluster ${selected ? 'is-active' : ''}" style="width:${size}px;height:${size}px;background:${dominant.color};font-size:${size > 44 ? 13 : 12}px">${compact(stats.total)}</div>`;
      const marker = L.marker(district.center, {
        icon: L.divIcon({ className: '', html, iconSize: null }),
        interactive: !drawing,
        title: `${district.name}: ${formatInt(stats.total)} объектов`,
      });
      marker.on('click', () => focusOn({ kind: 'district', id: district.id }));
      layers.clusters.addLayer(marker);
    }
  }

  function drawObjects({ state, filter }) {
    const box = boundsArray(map.getBounds());
    const visible = districtsInBounds(box, 8);
    let drawn = 0;

    for (const district of visible) {
      if (district.approximate || isDimmed(state, district.okrugId, district.id)) continue;
      const bundle = featuresOfDistrict(district.id, filter);

      for (const line of bundle.lines) {
        const resource = RESOURCE_BY_ID[line.resourceId];
        const poly = L.polyline(line.path, {
          color: resource.color,
          weight: line.diameter > 400 ? 3.4 : line.diameter > 200 ? 2.4 : 1.8,
          opacity: 0.78,
          lineCap: 'round',
          interactive: !drawing,
        });
        poly.on('click', (event) => {
          L.DomEvent.stop(event);
          selectFeature(line);
        });
        poly.bindTooltip(`${line.name} · Ду${line.diameter}`, { className: 'map-tip', sticky: true });
        layers.objects.addLayer(poly);
        drawn += 1;
      }

      for (const point of bundle.points) {
        const resource = RESOURCE_BY_ID[point.resourceId];
        const selected = state.selection.kind === 'object' && state.selection.id === point.id;
        const cls = [
          'objdot',
          point.typeId === 'source' ? 'objdot--source' : '',
          point.statusId === 'alert' ? 'objdot--alert' : '',
          selected ? 'is-selected' : '',
        ].join(' ');
        const color = point.statusId === 'alert' ? STATUS_BY_ID.alert.color : resource.color;
        const marker = L.marker(point.latlng, {
          icon: L.divIcon({
            className: '',
            html: `<div class="${cls}" style="background:${color};position:relative"></div>`,
            iconSize: null,
          }),
          interactive: !drawing,
          title: point.name,
        });
        marker.on('click', () => selectFeature(point));
        marker.bindTooltip(`${point.name}<br>${point.typeName}`, { className: 'map-tip', sticky: true });
        layers.objects.addLayer(marker);
        drawn += 1;
      }
    }

    controls.setObjectCount(drawn);
  }

  /* ------------------------------ карточки ------------------------------ */

  function closeCard() {
    if (popup) {
      map.closePopup(popup);
      popup = null;
    }
  }

  function openOkrugCard(okrug, latlng) {
    const filter = filterFromState(getState());
    const stats = okrugStats(okrug.id, filter);
    const content = territoryCard({
      title: okrug.name,
      subtitle: 'Административный округ Москвы',
      rows: [
        ['Количество объектов', formatInt(stats.total)],
        ['Протяжённость сетей', formatKm(stats.networkKm)],
        ['Районов', String(okrug.districts.length)],
        ['Организаций', String(Object.values(stats.byOrg).filter((v) => v > 0).length)],
      ],
      typeRows: OBJECT_TYPES.map((t) => [t.plural, formatInt(stats.byType[t.id] || 0)]),
      districts: okrug.districts.slice(0, 5).map((d) => ({
        id: d.id,
        name: d.name,
        count: districtStats(d.id, filter).total,
      })),
      onDistrict: (id) => focusOn({ kind: 'district', id }),
      onMore: () => focusOn({ kind: 'okrug', id: okrug.id }),
      onClose: closeCard,
    });
    showCard(content, latlng || okrug.center);
  }

  function openDistrictCard(district, latlng) {
    const filter = filterFromState(getState());
    const stats = districtStats(district.id, filter);
    const content = territoryCard({
      title: district.name,
      subtitle: `Район · ${okrugById.get(district.okrugId)?.name || ''}`,
      rows: [
        ['Количество объектов', formatInt(stats.total)],
        ['Протяжённость сетей', formatKm(stats.networkKm)],
        ['Площадь', formatArea(district.areaKm2)],
        ['Организаций', String(Object.values(stats.byOrg).filter((v) => v > 0).length)],
      ],
      typeRows: TYPE_GROUPS.map((g) => [g.name, formatInt(stats.byGroup[g.id] || 0)]),
      resources: RESOURCES.map((r) => ({ resource: r, count: stats.byResource[r.id] || 0 })).filter((r) => r.count),
      onMore: () => focusOn({ kind: 'district', id: district.id }),
      onClose: closeCard,
    });
    showCard(content, latlng || district.center);
  }

  function showCard(content, latlng) {
    closeCard();
    popup = L.popup({
      className: 'mapcard-popup',
      closeButton: false,
      autoPan: true,
      autoPanPadding: [24, 24],
      maxWidth: 320,
      offset: [0, -6],
    })
      .setLatLng(latlng)
      .setContent(content)
      .openOn(map);
  }

  /* ------------------------------ навигация ------------------------------ */

  function focusOn(target) {
    closeCard();
    onAction({ type: 'focus', target });
  }

  function selectFeature(feature) {
    closeCard();
    onAction({ type: 'selectFeature', feature });
  }

  function flyTo(target) {
    if (!target) return;
    if (target.kind === 'city') {
      map.flyToBounds(CITY_BOUNDS, { duration: 0.7, padding: [18, 18] });
    } else if (target.kind === 'okrug') {
      const okrug = okrugById.get(target.id);
      if (okrug) map.flyToBounds(okrug.bounds, { duration: 0.7, padding: [30, 30] });
    } else if (target.kind === 'district') {
      const district = districtById.get(target.id);
      if (!district) return;
      // minZoom используется кнопкой «Показать объекты»: границы района
      // помещаются в экран на масштабе района, а объекты видны только крупнее.
      if (target.minZoom) map.flyTo(district.center, target.minZoom, { duration: 0.7 });
      else map.flyToBounds(district.bounds, { duration: 0.7, padding: [40, 40], maxZoom: 13 });
    } else if (target.kind === 'feature' && target.latlng) {
      map.flyTo(target.latlng, Math.max(map.getZoom(), 16), { duration: 0.7 });
    } else if (target.kind === 'bounds' && target.bounds) {
      map.flyToBounds(target.bounds, { duration: 0.7, padding: [40, 40], maxZoom: target.maxZoom });
    }
  }

  /* ------------------------------ инструменты ------------------------------ */

  const tools = createTools({ map, node, layers, onAction, onDone: () => setState({ ui: { tool: null } }, ['ui']) });

  map.on('zoomend moveend', scheduleRender);
  map.on('click', () => {
    if (!getState().ui.tool) closeCard();
  });

  function update(topics = []) {
    const state = getState();
    controls.updateToolbar(state);
    tools.sync(state);
    if (!topics.length || topics.some((t) => ['filters', 'selection', 'map', 'ui', 'scale'].includes(t))) {
      scheduleRender();
    }
  }

  requestAnimationFrame(() => {
    map.invalidateSize();
    map.fitBounds(CITY_BOUNDS, { padding: [18, 18], animate: false });
    controls.updateBase(baseKey);
    render();
  });

  return { node, map, update, flyTo, closeCard, render: scheduleRender };
}

/* ============================ вспомогательные ============================ */

function toArray(latlng) {
  return [latlng.lat, latlng.lng];
}

function boundsArray(bounds) {
  return [
    [bounds.getSouth(), bounds.getWest()],
    [bounds.getNorth(), bounds.getEast()],
  ];
}

/**
 * Цвет зоны района: базовый цвет округа делается насыщеннее, а светлота
 * сдвигается детерминированно по идентификатору района. Соседние районы
 * внутри округа перестают сливаться в общее пятно.
 */
const districtColors = new Map();

function districtColor(district, okrugColor) {
  let color = districtColors.get(district.id);
  if (!color) {
    const hash = hashString(district.id);
    const step = (hash % 5) - 2;
    const tone = ((hash >> 3) % 3) - 1;
    color = adjust(okrugColor, {
      saturation: 0.3 + tone * 0.07,
      lightness: -0.06 + step * 0.055,
    });
    districtColors.set(district.id, color);
  }
  return color;
}

function dominantResource(stats) {
  let best = RESOURCES[0];
  let bestCount = -1;
  for (const resource of RESOURCES) {
    const count = stats.byResource[resource.id] || 0;
    if (count > bestCount) {
      bestCount = count;
      best = resource;
    }
  }
  return best;
}

function clusterSize(total) {
  if (total > 5000) return 52;
  if (total > 2000) return 46;
  if (total > 800) return 40;
  if (total > 200) return 36;
  return 32;
}

function compact(value) {
  if (value >= 100000) return `${Math.round(value / 1000)}к`;
  if (value >= 10000) return `${(value / 1000).toFixed(1).replace('.', ',')}к`;
  return formatInt(value);
}

/** Карточка территории поверх карты (как в макете). */
function territoryCard({ title, subtitle, rows, typeRows, districts, resources, onDistrict, onMore, onClose }) {
  const body = el('div.mapcard__body');
  const nodes = [el('div.subhead', { text: 'Общая информация' })];
  for (const [label, value] of rows) {
    nodes.push(
      el('div.row', null, [el('span.row__label', { text: label }), el('span.row__value', { text: value })]),
    );
  }

  if (resources?.length) {
    nodes.push(el('div.subhead', { text: 'По ресурсам' }));
    for (const { resource, count } of resources) {
      nodes.push(
        el('div.row', null, [
          resourceBadge(resource, 14),
          el('span.row__label', { text: resource.name, title: resource.name }),
          el('span.row__value', { text: formatInt(count) }),
        ]),
      );
    }
  }

  if (typeRows?.length) {
    nodes.push(el('div.subhead', { text: 'Состав по типам' }));
    for (const [label, value] of typeRows) {
      nodes.push(
        el('div.row', null, [el('span.row__label', { text: label }), el('span.row__value', { text: value })]),
      );
    }
  }

  if (districts?.length) {
    nodes.push(el('div.subhead', { text: 'Районы' }));
    for (const d of districts) {
      nodes.push(
        el('div.row.row--link', { onclick: () => onDistrict(d.id) }, [
          el('span.row__label', { text: d.name, style: { color: 'var(--brand)' } }),
          el('span.row__value.row__value--muted', { text: formatInt(d.count) }),
        ]),
      );
    }
  }

  mount(body, nodes);

  return el('div.mapcard', null, [
    el('div.mapcard__head', null, [
      el('div', { style: { flex: '1', minWidth: '0' } }, [
        el('div.mapcard__title', { text: title }),
        el('div.mapcard__sub', { text: subtitle }),
      ]),
      el('button.mapcard__close', { type: 'button', onclick: onClose }, icon('close')),
    ]),
    body,
    el('div.mapcard__foot', null, [
      el('button.btn.btn--primary', { type: 'button', text: 'Подробнее', onclick: onMore, style: { marginTop: '0' } }),
    ]),
  ]);
}

/* ============================ элементы управления ============================ */

function buildControls({ map, node, onAction, onBaseSwitch, getBase }) {
  const zoomIn = el('button.zoombox__btn', { type: 'button', title: 'Приблизить' }, icon('plus'));
  const zoomOut = el('button.zoombox__btn', { type: 'button', title: 'Отдалить' }, icon('minus'));
  zoomIn.addEventListener('click', () => map.zoomIn());
  zoomOut.addEventListener('click', () => map.zoomOut());
  const zoombox = el('div.zoombox', null, [zoomIn, zoomOut]);

  const TOOL_BUTTONS = [
    { id: 'ruler', icon: 'ruler', title: 'Измерить расстояние' },
    { id: 'marker', icon: 'pin', title: 'Поставить метку' },
    { id: 'area', icon: 'square', title: 'Выделить область' },
    { id: 'fullscreen', icon: 'arrowsDiag', title: 'Развернуть карту' },
    { id: 'base', icon: 'layers', title: 'Подложка карты' },
    { id: 'legend', icon: 'eye', title: 'Легенда' },
    { id: 'list', icon: 'list', title: 'Список объектов' },
  ];

  const toolButtons = new Map();
  const toolbar = el('div.toolbar');
  for (const def of TOOL_BUTTONS) {
    const btn = el('button.toolbar__btn', { type: 'button', title: def.title }, icon(def.icon));
    btn.addEventListener('click', () => {
      if (def.id === 'base') return openBaseMenu(btn);
      if (def.id === 'fullscreen') return toggleFullscreen(node);
      if (def.id === 'legend') {
        return setState({ ui: { legend: !getState().ui.legend } }, ['ui']);
      }
      if (def.id === 'list') return onAction({ type: 'openList' });
      const current = getState().ui.tool;
      setState({ ui: { tool: current === def.id ? null : def.id } }, ['ui']);
    });
    toolButtons.set(def.id, btn);
    toolbar.append(btn);
  }

  const switchTrack = el('span.switch__track', null, el('span.switch__knob'));
  const viewSwitch = el('label.switch', null, [switchTrack, el('span', { text: 'Режим просмотра' })]);
  viewSwitch.addEventListener('click', () => {
    const next = !getState().ui.viewMode;
    setState({ ui: { viewMode: next, tool: next ? null : getState().ui.tool } }, ['ui']);
  });
  toolbar.append(el('span.toolbar__sep'), viewSwitch);

  /** Список подложек — раскрывается над кнопкой панели инструментов. */
  let baseMenu = null;
  let closeBaseMenu = null;

  function openBaseMenu(anchor) {
    if (baseMenu) {
      hideBaseMenu();
      return;
    }
    baseMenu = el(
      'div.basemenu',
      null,
      BASE_LAYERS.map((layer) =>
        el(
          'button.basemenu__item',
          {
            type: 'button',
            class: layer.id === getBase() ? 'is-active' : '',
            onclick: () => {
              onBaseSwitch(layer.id);
              hideBaseMenu();
            },
          },
          [
            icon(layer.id === getBase() ? 'check' : 'dot', { size: 13 }),
            el('span', null, [
              el('span.basemenu__name', { text: layer.name }),
              el('span.basemenu__hint', { text: layer.hint }),
            ]),
          ],
        ),
      ),
    );
    node.append(baseMenu);
    const rect = anchor.getBoundingClientRect();
    const host = node.getBoundingClientRect();
    baseMenu.style.left = `${Math.max(8, rect.left - host.left - 60)}px`;
    baseMenu.style.bottom = `${host.bottom - rect.top + 8}px`;
    closeBaseMenu = onDismiss(baseMenu, (event) => {
      if (anchor.contains(event.target)) return;
      hideBaseMenu();
    });
  }

  function hideBaseMenu() {
    baseMenu?.remove();
    baseMenu = null;
    closeBaseMenu?.();
    closeBaseMenu = null;
  }

  const legendBody = el('div');
  const legend = el('div.legend', null, [el('div.legend__title', { text: 'Условные обозначения' }), legendBody]);

  let objectCount = 0;

  return {
    zoombox,
    toolbar,
    legend,
    updateZoom(zoom) {
      zoomIn.disabled = zoom >= map.getMaxZoom();
      zoomOut.disabled = zoom <= map.getMinZoom();
    },
    updateToolbar(state) {
      for (const [id, btn] of toolButtons) {
        const active = state.ui.tool === id || (id === 'legend' && state.ui.legend);
        btn.classList.toggle('is-active', Boolean(active));
        btn.disabled = state.ui.viewMode && ['ruler', 'marker', 'area'].includes(id);
        btn.style.opacity = btn.disabled ? '0.4' : '';
      }
      viewSwitch.classList.toggle('is-on', state.ui.viewMode);
    },
    updateBase(key) {
      toolButtons.get('base').title = `Подложка: ${BASE_BY_ID[key].name}`;
    },
    updateLegend(state, scale) {
      legend.hidden = !state.ui.legend;
      if (legend.hidden) return;
      const rows =
        scale === 'object'
          ? [
              ...RESOURCES.map((r) => ({ color: r.color, name: r.name })),
              { color: STATUS_BY_ID.alert.color, name: 'Технологическое нарушение' },
            ]
          : scale === 'district'
            ? [
                ...RESOURCES.slice(0, 4).map((r) => ({ color: r.color, name: `Преобладает: ${r.short.toLowerCase()}` })),
              ]
            : STATUSES.map((s) => ({ color: s.color, name: s.name }));
      mount(
        legendBody,
        [
          ...rows.map((row) =>
            el('div.legend__row', null, [
              el('span.legend__swatch', { style: { background: row.color } }),
              el('span', { text: row.name }),
            ]),
          ),
          scale === 'object' && objectCount
            ? el('div.legend__row', { style: { marginTop: '4px', color: 'var(--text-3)' } }, [
                el('span', { text: `На карте: ${formatInt(objectCount)} объектов (выборка)` }),
              ])
            : null,
        ].filter(Boolean),
      );
    },
    setObjectCount(count) {
      objectCount = count;
    },
  };
}

function toggleFullscreen(node) {
  if (document.fullscreenElement) document.exitFullscreen();
  else node.requestFullscreen?.();
}

/* ============================ инструменты карты ============================ */

function createTools({ map, node, layers, onAction, onDone }) {
  let active = null;
  let points = [];
  let hint = null;

  function reset() {
    layers.tools.clearLayers();
    points = [];
    hint?.remove();
    hint = null;
    node.classList.remove('is-drawing');
  }

  /** Подсказка с явной кнопкой завершения: двойной клик как единственный
   *  способ применить построение — неочевиден и ненадёжен. */
  function showHint(text, apply = null) {
    hint?.remove();
    hint = el('div.draw-hint', null, [
      el('span', { text }),
      apply
        ? el('button.draw-hint__apply', {
            type: 'button',
            text: apply.label,
            disabled: !apply.enabled,
            onclick: apply.onClick,
          })
        : null,
      el('button.draw-hint__cancel', {
        type: 'button',
        text: 'Отмена',
        onclick: () => {
          reset();
          onDone();
        },
      }),
    ]);
    node.append(hint);
  }

  function applyArea() {
    if (points.length < 3) return;
    const polygon = [...points];
    reset();
    onAction({ type: 'applyArea', polygon });
    onDone();
  }

  function finishRuler() {
    reset();
    onDone();
  }

  function redrawRuler() {
    layers.tools.clearLayers();
    layers.tools.addLayer(L.polyline(points, { color: '#1668dc', weight: 2.5, dashArray: '6 4', interactive: false }));
    for (const p of points) {
      layers.tools.addLayer(
        L.circleMarker(p, { radius: 4, color: '#fff', weight: 2, fillColor: '#1668dc', fillOpacity: 1, interactive: false }),
      );
    }
    let total = 0;
    for (let i = 1; i < points.length; i += 1) total += distanceKm(points[i - 1], points[i]);
    showHint(
      points.length < 2 ? 'Отметьте вторую точку' : `Расстояние: ${formatNumber(total, 2)} км`,
      { label: 'Готово', enabled: points.length >= 2, onClick: finishRuler },
    );
  }

  function redrawArea() {
    layers.tools.clearLayers();
    layers.tools.addLayer(
      L.polygon(points, {
        color: '#1668dc',
        weight: 2,
        fillColor: '#1668dc',
        fillOpacity: 0.12,
        dashArray: '6 4',
        interactive: false,
      }),
    );
    for (const p of points) {
      layers.tools.addLayer(
        L.circleMarker(p, { radius: 4, color: '#fff', weight: 2, fillColor: '#1668dc', fillOpacity: 1, interactive: false }),
      );
    }
    const area = points.length >= 3 ? polygonAreaKm2(points) : 0;
    showHint(
      points.length < 3
        ? `Отметьте вершины области (${points.length}/3)`
        : `Площадь: ${formatArea(area)}`,
      { label: 'Применить область', enabled: points.length >= 3, onClick: applyArea },
    );
  }

  /** Клик рядом с первой вершиной замыкает контур. */
  function closesLoop(latlng) {
    if (points.length < 3) return false;
    const first = map.latLngToContainerPoint(points[0]);
    const now = map.latLngToContainerPoint(latlng);
    return first.distanceTo(now) < 14;
  }

  function onClick(event) {
    if (!active) return;
    const latlng = [event.latlng.lat, event.latlng.lng];

    if (active === 'marker') {
      layers.tools.addLayer(
        L.marker(latlng, {
          icon: L.divIcon({
            className: '',
            html: `<div style="transform:translate(-50%,-100%);color:#1668dc">${iconSvg('pin', { size: 26, cls: '', stroke: 2 })}</div>`,
            iconSize: null,
          }),
        }).bindTooltip(`Метка · ${latlng[0].toFixed(5)}, ${latlng[1].toFixed(5)}`, { className: 'map-tip' }),
      );
      return;
    }

    if (active === 'area' && closesLoop(event.latlng)) {
      applyArea();
      return;
    }

    points.push(latlng);
    if (active === 'ruler') redrawRuler();
    else if (active === 'area') redrawArea();
  }

  function onDoubleClick(event) {
    if (!active) return;
    L.DomEvent.stop(event);
    if (active === 'area') applyArea();
    else finishRuler();
  }

  map.on('click', onClick);
  map.on('dblclick', onDoubleClick);

  return {
    sync(state) {
      const next = state.ui.viewMode ? null : state.ui.tool;
      if (next === active) return;
      active = next;
      reset();
      if (!active) {
        map.doubleClickZoom.enable();
        return;
      }
      map.doubleClickZoom.disable();
      node.classList.add('is-drawing');
      if (active === 'ruler') {
        showHint('Кликайте по карте для измерения расстояния', { label: 'Готово', enabled: false, onClick: finishRuler });
      } else if (active === 'marker') {
        showHint('Кликните, чтобы поставить метку');
      } else {
        showHint('Отметьте вершины области (0/3)', { label: 'Применить область', enabled: false, onClick: applyArea });
      }
    },
    reset,
  };
}
