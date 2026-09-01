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
  consumptionFor,
  criticalFor,
  districtById,
  districtMetric,
  districts,
  districtSource,
  metricRange,
  okrugGroups,
  districtStats,
  districtsInBounds,
  featuresOfDistrict,
  filterFromState,
  incidentsByOkrug,
  okrugById,
  okrugStats,
  statsFor,
  territories,
} from '../data/model.js';
import { distanceKm, polygonAreaKm2, toMultiPolygon } from '../data/geo.js';
import { adjust } from '../utils/color.js';
import { THEMATIC_BY_ID, THEMATIC_LAYERS, rampColor, zoneColor } from '../data/thematic.js';
import { formatArea, formatInt, formatKm, formatNumber, pluralRu } from '../utils/format.js';
import { formatVolume } from '../data/consumption.js';
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

  let cardNode = null;
  let renderScheduled = false;
  // Во время рисования слои карты не должны перехватывать клики,
  // иначе события не доходят до инструмента.
  let drawing = false;
  let fillScale = 1;
  let thematicId = 'admin';
  let resourceIds = [];
  let metricScale = null;
  // Порядок источников фиксируется один раз: цвет зоны не должен «прыгать»
  // между перерисовками.
  const zoneOrder = new Map();

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
    const hasResource = state.filters.resources.length > 0;
    thematicId = state.ui.thematic || 'admin';
    resourceIds = state.filters.resources;
    metricScale =
      THEMATIC_BY_ID[thematicId]?.kind === 'scale'
        ? metricRange(thematicId, resourceIds, scale === 'city' ? okrugGroups : null)
        : null;
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
      drawDistricts({ state, filter, outlineOnly: false, labelsAbove: hasResource });
      if (hasResource) drawClusters({ state, filter });
    } else {
      drawDistricts({ state, filter, outlineOnly: true, labels: true });
      if (hasResource) drawObjects({ state, filter });
    }

    // Объекты показываются только после выбора ресурса: без него на карте
    // оказывались бы вперемешку все шесть систем ресурсоснабжения.
    updateResourceGate(scale, hasResource);

    controls.updateZoom(zoom);
    controls.updateLegend(state, scale, metricScale, zoneLegend());

    if (state.map.scale !== scale) {
      setState({ map: { scale, zoom, center: toArray(map.getCenter()) } }, ['scale']);
    }
    void focusOkrug;
    void focusDistrict;
  }

  let gateNode = null;

  /**
   * Подсказка о выборе ресурса. Раньше это было окно по центру карты — оно
   * закрывало обзор и перехватывало внимание. Теперь знак в углу, а текст
   * появляется по наведению.
   */
  function updateResourceGate(scale, hasResource) {
    const needed = !hasResource && (scale === 'district' || scale === 'object');
    if (!needed) {
      gateNode?.remove();
      gateNode = null;
      return;
    }
    if (gateNode) return;
    gateNode = el('div.maphint', { tabindex: '0', role: 'note' }, [
      el('span.maphint__mark', { text: '!', 'aria-hidden': 'true' }),
      el('div.maphint__tip', null, [
        el('div.maphint__title', { text: 'Объекты не показаны' }),
        el('div.maphint__text', {
          text: 'Отметьте один или несколько ресурсов в фильтрах слева — иначе на карте оказались бы вперемешку все системы ресурсоснабжения.',
        }),
      ]),
    ]);
    node.append(gateNode);
  }

  /** Цвет территории по действующему тематическому слою. */
  function paintOf(districtIds) {
    if (thematicId === 'admin') return null;
    for (const districtId of districtIds) {
      const source = THEMATIC_BY_ID[thematicId].kind === 'category' ? districtSource(districtId, resourceIds) : null;
      if (source && !zoneOrder.has(source.id)) zoneOrder.set(source.id, zoneOrder.size);
    }
    return thematicPaint(thematicId, districtIds, resourceIds, metricScale, zoneOrder)?.color || null;
  }

  /**
   * Перечень зон действия для легенды. Считается по всем районам, а не по
   * нарисованным: иначе список менялся бы при каждом сдвиге карты.
   */
  function zoneLegend() {
    if (THEMATIC_BY_ID[thematicId]?.kind !== 'category') return null;
    const counts = new Map();
    for (const district of districts) {
      const source = districtSource(district.id, resourceIds);
      if (!source) continue;
      if (!zoneOrder.has(source.id)) zoneOrder.set(source.id, zoneOrder.size);
      const seen = counts.get(source.id) || { source, districts: 0 };
      seen.districts += 1;
      counts.set(source.id, seen);
    }
    return [...counts.values()]
      .sort((a, b) => b.districts - a.districts)
      .map((item) => ({
        name: item.source.name,
        districts: item.districts,
        color: zoneColor(item.source.id, zoneOrder.get(item.source.id) ?? 0),
      }));
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
        fillColor: paintOf(okrug.districts.map((d) => d.id)) || okrug.color,
        fillOpacity: (dimmed ? 0.16 : dim ? 0.24 : thematicId === 'admin' ? 0.46 : 0.62) * fillScale,
        interactive: !drawing,
      });
      poly.on('click', (event) => {
        L.DomEvent.stop(event);
        openOkrugCard(okrug);
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
      const themed = paintOf([district.id]);
      const fill = themed || (outlineOnly ? base : districtColor(district, base));
      const idle = (dimmed ? 0.12 : themed ? 0.66 : outlineOnly ? 0.16 : 0.55) * fillScale;
      const hover = (dimmed ? 0.2 : themed ? 0.82 : outlineOnly ? 0.28 : 0.75) * fillScale;
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
        openDistrictCard(district);
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
    cardNode?.remove();
    cardNode = null;
  }

  /** Ресурсы, по которым строится сводка потребления: выбранные или все. */
  function scopeResources() {
    return getState().filters.resources;
  }

  function openOkrugCard(okrug) {
    const filter = filterFromState(getState());
    const stats = okrugStats(okrug.id, filter);
    const districtIds = okrug.districts.map((d) => d.id);

    showCard(
      territoryCard({
        title: okrug.name,
        subtitle: 'Административный округ Москвы',
        tabs: [
          {
            id: 'objects',
            name: 'Объекты',
            render: () =>
              objectsTab({
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
              }),
          },
          {
            id: 'consumption',
            name: 'Потребление',
            render: () =>
              consumptionTab(consumptionFor(districtIds, scopeResources()), {
                periodNote: 'за август 2026',
                critical: criticalFor(districtIds),
              }),
          },
        ],
        actions: [
          { label: 'Подробнее', primary: true, onClick: () => focusOn({ kind: 'okrug', id: okrug.id }) },
          {
            label: 'Список объектов округа',
            onClick: () =>
              onAction({ type: 'openList', districtIds: okrug.districts.map((d) => d.id), label: okrug.name }),
          },
        ],
        onClose: closeCard,
      }),
    );
  }

  function openDistrictCard(district) {
    const filter = filterFromState(getState());
    const stats = districtStats(district.id, filter);

    showCard(
      territoryCard({
        title: district.name,
        subtitle: `Район · ${okrugById.get(district.okrugId)?.name || ''}`,
        tabs: [
          {
            id: 'objects',
            name: 'Объекты',
            render: () =>
              objectsTab({
                rows: [
                  ['Количество объектов', formatInt(stats.total)],
                  ['Протяжённость сетей', formatKm(stats.networkKm)],
                  ['Площадь', formatArea(district.areaKm2)],
                  ['Организаций', String(Object.values(stats.byOrg).filter((v) => v > 0).length)],
                ],
                typeRows: TYPE_GROUPS.map((g) => [g.name, formatInt(stats.byGroup[g.id] || 0)]),
                resources: RESOURCES.map((r) => ({ resource: r, count: stats.byResource[r.id] || 0 })).filter(
                  (r) => r.count,
                ),
              }),
          },
          {
            id: 'consumption',
            name: 'Потребление',
            render: () =>
              consumptionTab(consumptionFor([district.id], scopeResources()), {
                periodNote: 'за август 2026',
                critical: criticalFor([district.id]),
              }),
          },
        ],
        actions: [
          { label: 'Подробнее', primary: true, onClick: () => focusOn({ kind: 'district', id: district.id }) },
          {
            // Список именно этого района, а не текущего охвата карты: карточку
            // открыли по клику по нему, и ожидание такое же.
            label: 'Список объектов района',
            onClick: () =>
              onAction({ type: 'openList', districtIds: [district.id], label: district.name }),
          },
        ],
        onClose: closeCard,
      }),
    );
  }

  /**
   * Карточка произвольной области. Открывается сразу после построения
   * контура: сводка нужна там же, где пользователь только что рисовал.
   */
  function openAreaCard(polygon, insideDistricts) {
    const filter = filterFromState(getState());
    const districtIds = insideDistricts.map((d) => d.id);
    const ids = new Set(districtIds);
    const stats = statsFor({ ...filter, districtIds: ids, okrugIds: null });

    showCard(
      territoryCard({
        title: 'Выделенная область',
        subtitle: districtIds.length
          ? `${districtIds.length} ${pluralRu(districtIds.length, 'район', 'района', 'районов')} · ${formatArea(polygonAreaKm2(polygon))}`
          : 'В границы области не попал ни один район',
        tabs: [
          {
            id: 'objects',
            name: 'Объекты',
            render: () =>
              objectsTab({
                rows: [
                  ['Площадь области', formatArea(polygonAreaKm2(polygon))],
                  ['Количество объектов', formatInt(stats.total)],
                  ['Протяжённость сетей', formatKm(stats.networkKm)],
                  ['Организаций', String(Object.values(stats.byOrg).filter((v) => v > 0).length)],
                ],
                typeRows: TYPE_GROUPS.map((g) => [g.name, formatInt(stats.byGroup[g.id] || 0)]),
                resources: RESOURCES.map((r) => ({ resource: r, count: stats.byResource[r.id] || 0 })).filter(
                  (r) => r.count,
                ),
                districts: insideDistricts.slice(0, 6).map((d) => ({
                  id: d.id,
                  name: d.name,
                  count: districtStats(d.id, filter).total,
                })),
                onDistrict: (id) => focusOn({ kind: 'district', id }),
              }),
          },
          {
            id: 'consumption',
            name: 'Потребление',
            render: () =>
              consumptionTab(consumptionFor(districtIds, scopeResources()), {
                periodNote: 'за август 2026',
                critical: criticalFor(districtIds),
              }),
          },
        ],
        actions: [
          { label: 'Показать объекты области', primary: true, onClick: () => onAction({ type: 'showObjects' }) },
          {
            label: 'Список объектов',
            onClick: () =>
              onAction({ type: 'openList', districtIds, label: 'выделенная область' }),
          },
          { label: 'Сбросить область', onClick: () => onAction({ type: 'clearArea' }) },
        ],
        onClose: closeCard,
      }),
    );
  }

  /**
   * Карточка территории — плавающая панель, а не поповер Leaflet.
   * Поповер привязан к точке и при открытии сдвигает карту автопанорамой,
   * из-за чего теряется контекст. Панель открывается по центру области карты,
   * перетаскивается за заголовок и карту не двигает. Как соседний узел, а не
   * потомок контейнера Leaflet, она вдобавок не отдаёт ему свои события.
   */
  function showCard(content) {
    closeCard();
    cardNode = content;
    cardNode.classList.add('mapcard--floating');
    node.append(cardNode);

    // Центрируем по видимой области карты и запоминаем в пикселях:
    // дальше положением управляет перетаскивание.
    const host = node.getBoundingClientRect();
    const box = cardNode.getBoundingClientRect();
    placeCard((host.width - box.width) / 2, Math.max(12, (host.height - box.height) / 2));
    attachDrag(cardNode);
  }

  function placeCard(left, top) {
    const host = node.getBoundingClientRect();
    const box = cardNode.getBoundingClientRect();
    const maxLeft = Math.max(0, host.width - box.width - 8);
    const maxTop = Math.max(0, host.height - box.height - 8);
    cardNode.style.left = `${Math.min(maxLeft, Math.max(8, left))}px`;
    cardNode.style.top = `${Math.min(maxTop, Math.max(8, top))}px`;
  }

  /** Перетаскивание за заголовок. Кнопка закрытия из захвата исключена. */
  function attachDrag(card) {
    const handle = card.querySelector('.mapcard__head');
    if (!handle) return;
    handle.classList.add('is-draggable');

    handle.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.mapcard__close')) return;
      const start = card.getBoundingClientRect();
      const host = node.getBoundingClientRect();
      const offsetX = event.clientX - start.left;
      const offsetY = event.clientY - start.top;
      handle.setPointerCapture(event.pointerId);
      card.classList.add('is-dragging');

      const onMove = (moveEvent) => {
        placeCard(moveEvent.clientX - host.left - offsetX, moveEvent.clientY - host.top - offsetY);
      };
      const onUp = () => {
        card.classList.remove('is-dragging');
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    });
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

  return {
    node,
    map,
    update,
    flyTo,
    closeCard,
    openAreaCard,
    render: scheduleRender,
    /** Контекст действующего тематического слоя — для рейтинга районов. */
    thematicContext() {
      return { layerId: thematicId, resourceIds, zoneOrder };
    },
  };
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
 * Окраска территории по тематическому слою. Возвращает null для
 * административного деления — тогда действует обычная палитра округов.
 */
function thematicPaint(layerId, districtIds, resourceIds, range, zoneOrder) {
  const layer = THEMATIC_BY_ID[layerId];
  if (!layer || layer.kind === 'admin' || !districtIds.length) return null;

  if (layer.kind === 'category') {
    // Зона действия источника — категория, усреднять её нельзя: для округа
    // берём источник, обслуживающий наибольшее число районов.
    const counts = new Map();
    for (const districtId of districtIds) {
      const source = districtSource(districtId, resourceIds);
      if (!source) continue;
      counts.set(source.id, (counts.get(source.id) || 0) + 1);
    }
    if (!counts.size) return null;
    const [sourceId] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    return { color: zoneColor(sourceId, zoneOrder.get(sourceId) ?? 0), value: null };
  }

  let sum = 0;
  for (const districtId of districtIds) sum += districtMetric(layerId, districtId, resourceIds);
  const value = sum / districtIds.length;
  const t = (value - range.min) / (range.max - range.min);
  return { color: rampColor(layer, t), value };
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
/**
 * Карточка территории поверх карты. Две вкладки: состав объектов и
 * потребление ресурсов. Активная вкладка живёт в замыкании — карточка
 * пересобирает только тело, не трогая поповер Leaflet.
 */
function territoryCard({ title, subtitle, tabs, actions = [], onClose }) {
  const body = el('div.mapcard__body');
  const tabsNode = el('div.mapcard__tabs');
  let activeId = tabs[0].id;

  // Кнопки создаются один раз и дальше только меняют класс. Если пересоздавать
  // их в обработчике клика, нажатый узел открепляется от документа посреди
  // всплытия, и Leaflet считает событие кликом по карте — карточка закрывается.
  const buttons = tabs.map((tab) =>
    el('button.mapcard__tab', {
      type: 'button',
      text: tab.name,
      onclick: () => {
        if (activeId === tab.id) return;
        activeId = tab.id;
        syncTabs();
        renderBody();
      },
    }),
  );
  for (const button of buttons) tabsNode.append(button);

  function syncTabs() {
    buttons.forEach((button, i) => button.classList.toggle('is-active', tabs[i].id === activeId));
  }

  function renderBody() {
    const tab = tabs.find((t) => t.id === activeId) || tabs[0];
    mount(body, tab.render());
    body.scrollTop = 0;
  }

  syncTabs();
  renderBody();

  return el('div.mapcard', null, [
    el('div.mapcard__head', null, [
      el('div', { style: { flex: '1', minWidth: '0' } }, [
        el('div.mapcard__title', { text: title }),
        el('div.mapcard__sub', { text: subtitle }),
      ]),
      el('button.mapcard__close', { type: 'button', title: 'Закрыть', onclick: onClose }, icon('close')),
    ]),
    tabs.length > 1 ? tabsNode : null,
    body,
    actions.length
      ? el(
          'div.mapcard__foot',
          null,
          actions.map((action, i) =>
            el(`button.btn${action.primary ? '.btn--primary' : ''}`, {
              type: 'button',
              text: action.label,
              onclick: action.onClick,
              style: { marginTop: i === 0 ? '0' : '6px' },
            }),
          ),
        )
      : null,
  ]);
}

/** Содержимое вкладки «Объекты». */
function objectsTab({ rows, resources, typeRows, districts, onDistrict }) {
  const nodes = [el('div.subhead', { text: 'Общая информация' })];
  for (const [label, value] of rows) {
    nodes.push(el('div.row', null, [el('span.row__label', { text: label }), el('span.row__value', { text: value })]));
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
      nodes.push(el('div.row', null, [el('span.row__label', { text: label }), el('span.row__value', { text: value })]));
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

  return nodes;
}

/**
 * Сворачиваемый раздел карточки. Заголовок только переключает класс:
 * пересборка узла в обработчике собственного клика откручивала бы его от
 * документа посреди всплытия, и Leaflet закрыл бы карточку.
 */
function cardGroup(title, children, { open = true } = {}) {
  const head = el('button.cardgroup__head', { type: 'button' }, [
    el('span', { text: title }),
    icon('chevronUp', { cls: 'icon cardgroup__chev', size: 14 }),
  ]);
  const node = el('div.cardgroup', null, [head, el('div.cardgroup__body', null, children)]);
  if (!open) node.classList.add('is-collapsed');
  head.addEventListener('click', () => node.classList.toggle('is-collapsed'));
  return node;
}

/** Содержимое вкладки «Потребление». */
function consumptionTab(summary, { periodNote, critical }) {
  if (!summary.rows.length) {
    return [el('div.empty', { text: 'Нет данных о потреблении по выбранным ресурсам' })];
  }

  const volumeRows = summary.rows.map((row) => {
    const unit = row.resource.unit;
    const volume = formatVolume(row.volume, unit.volume);
    const up = row.deltaPct >= 0;
    // Рост потребления сам по себе не авария: подсвечивается заметное
    // отклонение в любую сторону — оно и требует разбирательства.
    const notable = Math.abs(row.deltaPct) > 10;

    return el('div.consume', null, [
      el('div.consume__head', null, [
        resourceBadge(row.resource, 14),
        el('span.consume__name', { text: row.resource.short, title: row.resource.name }),
        el('span.consume__value', { text: `${formatNumber(volume.value, volume.digits)} ${volume.unit}` }),
      ]),
      el('div.consume__meta', null, [
        el('span', { text: `Нагрузка ${formatNumber(row.load, row.load >= 100 ? 0 : 1)} ${unit.load}` }),
        el('span.consume__delta', {
          class: notable ? 'is-notable' : '',
          text: `${up ? '+' : '−'}${formatNumber(Math.abs(row.deltaPct), 1)} % к пред. периоду`,
        }),
      ]),
    ]);
  });

  const nodes = [cardGroup(`Потребление ${periodNote}`, volumeRows)];

  if (summary.structure.length) {
    nodes.push(cardGroup('Структура потребления', structureRows(summary.structure, critical)));
  }

  if (critical) {
    nodes.push(cardGroup('Резервирование критической инфраструктуры', reserveRows(critical), { open: false }));
  }

  nodes.push(
    cardGroup(
      'Абоненты',
      [
        el('div.row', null, [
          el('span.row__label', { text: 'Точек учёта' }),
          el('span.row__value', { text: formatInt(summary.totalConsumers) }),
        ]),
      ],
      { open: false },
    ),
  );

  return nodes;
}

/**
 * Структура потребления. Критическая инфраструктура — такая же доля, как
 * жилой фонд, но её можно раскрыть до категорий объектов: доли категорий
 * складываются ровно в показатель верхнего уровня.
 */
function structureRows(structure, critical) {
  const nodes = [
    el(
      'div.bar',
      { style: { marginBottom: '8px' } },
      structure.map((item) =>
        el('div.bar__seg', {
          style: { width: `${item.share}%`, background: item.group.color },
          title: `${item.group.name}: ${Math.round(item.share)} %`,
        }),
      ),
    ),
  ];

  for (const item of structure) {
    const expandable = item.group.detail && critical && critical.categories.length;
    if (!expandable) {
      nodes.push(
        el('div.row', null, [
          el('span.legend__swatch', { style: { background: item.group.color } }),
          el('span.row__label', { text: item.group.name, title: item.group.name }),
          el('span.row__value', { text: `${formatNumber(item.share, 1)} %` }),
        ]),
      );
      continue;
    }

    const detail = el(
      'div.structure__detail',
      { hidden: true },
      critical.categories.map((row) =>
        // Две строки: в узкой карточке название категории иначе обрезается.
        el('div.structure__detail-row', null, [
          el('div.structure__detail-head', null, [
            el('span.structure__detail-name', { text: row.category.name, title: row.category.name }),
            el('span.structure__detail-share', { text: `${formatNumber(row.share * item.share, 1)} %` }),
          ]),
          el('div.structure__detail-meta', null, [
            el('span.crit__class', {
              text: `кат. ${row.category.reliability}`,
              title: `Категория надёжности электроснабжения: ${row.category.reliability}`,
              class: row.category.reliability === 'II' ? '' : 'is-high',
            }),
            el('span.structure__detail-count', {
              text: `${formatInt(row.count)} ${pluralRu(row.count, 'объект', 'объекта', 'объектов')}`,
            }),
          ]),
        ]),
      ),
    );

    const toggle = el('button.row.row--expand', { type: 'button' }, [
      icon('chevronDown', { cls: 'icon row__chev', size: 13 }),
      el('span.legend__swatch', { style: { background: item.group.color } }),
      el('span.row__label', { text: item.group.name, title: item.group.name }),
      el('span.row__value', { text: `${formatNumber(item.share, 1)} %` }),
    ]);
    toggle.addEventListener('click', () => {
      detail.hidden = !detail.hidden;
      toggle.classList.toggle('is-open', !detail.hidden);
    });

    nodes.push(el('div', null, [toggle, detail]));
  }

  return nodes;
}

/** Показатели резервирования критической инфраструктуры. */
function reserveRows(critical) {
  const share = (value) => (critical.total ? value / critical.total : 0);
  return [
    el('div.row.row--strong', null, [
      el('span.row__label', { text: 'Объектов на учёте' }),
      el('span.row__value', { text: formatInt(critical.total) }),
    ]),
    backupRow('Второй независимый ввод', critical.dualFeed, critical.total, share(critical.dualFeed)),
    backupRow('Автономный источник', critical.generator, critical.total, share(critical.generator)),
    el('div.row', null, [
      el('span.row__label', { text: 'Запас автономной работы' }),
      el('span.row__value', { text: `~${formatInt(critical.autonomyHours)} ч` }),
    ]),
    el('div.row', null, [
      el('span.legend__swatch', { style: { background: critical.attention ? 'var(--warn)' : 'var(--ok)' } }),
      el('span.row__label', { text: 'Требуют внимания' }),
      el('span.row__value', {
        text: formatInt(critical.attention),
        style: critical.attention ? { color: 'var(--warn)' } : null,
      }),
    ]),
  ];
}

function backupRow(label, value, total, share) {
  return el('div', { style: { padding: '4px 0 6px' } }, [
    el('div.row', { style: { padding: '2px 0' } }, [
      el('span.row__label', { text: label }),
      el('span.row__value', { text: `${formatInt(value)} из ${formatInt(total)}` }),
      el('span.check__meta', { text: `${Math.round(share * 100)} %` }),
    ]),
    el('div.bar', null, [
      el('div.bar__seg', {
        style: {
          width: `${Math.max(1, share * 100)}%`,
          background: share >= 0.8 ? 'var(--ok)' : share >= 0.5 ? 'var(--warn)' : 'var(--alert)',
        },
      }),
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
    { id: 'thematic', icon: 'chart', title: 'Тематический слой' },
    { id: 'legend', icon: 'eye', title: 'Легенда' },
    { id: 'list', icon: 'list', title: 'Список объектов' },
  ];

  const toolButtons = new Map();
  const toolbar = el('div.toolbar');
  for (const def of TOOL_BUTTONS) {
    const btn = el('button.toolbar__btn', { type: 'button', title: def.title }, icon(def.icon));
    btn.addEventListener('click', () => {
      if (def.id === 'base') return openMenu(btn, 'base');
      if (def.id === 'thematic') return openMenu(btn, 'thematic');
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

  /**
   * Меню над кнопкой панели инструментов. Одно на подложки и тематические
   * слои: списки одинаковые по устройству, различаются только содержимым.
   */
  let menuNode = null;
  let closeMenu = null;

  function menuItems(kind) {
    if (kind === 'base') {
      return BASE_LAYERS.map((layer) => ({
        id: layer.id,
        name: layer.name,
        hint: layer.hint,
        active: layer.id === getBase(),
        apply: () => onBaseSwitch(layer.id),
      }));
    }
    const current = getState().ui.thematic || 'admin';
    return THEMATIC_LAYERS.map((layer) => ({
      id: layer.id,
      name: layer.name,
      hint: layer.hint,
      active: layer.id === current,
      apply: () => setState({ ui: { thematic: layer.id } }, ['ui']),
    }));
  }

  /** Строка меню, ведущая к рейтингу районов по действующему слою. */
  function menuFooter(kind) {
    if (kind !== 'thematic') return null;
    if ((getState().ui.thematic || 'admin') === 'admin') return null;
    const btn = el('button.basemenu__more', { type: 'button' }, [
      icon('list', { size: 13 }),
      el('span', { text: 'Список районов по слою' }),
    ]);
    btn.addEventListener('click', () => {
      hideMenu();
      onAction({ type: 'openLayerList' });
    });
    return btn;
  }

  function openMenu(anchor, kind) {
    if (menuNode) {
      hideMenu();
      if (menuNode?.dataset.kind === kind) return;
    }
    menuNode = el(
      'div.basemenu',
      { dataset: { kind } },
      [...menuItems(kind).map((item) =>
        el(
          'button.basemenu__item',
          {
            type: 'button',
            class: item.active ? 'is-active' : '',
            onclick: () => {
              item.apply();
              hideMenu();
            },
          },
          [
            icon(item.active ? 'check' : 'dot', { size: 13 }),
            el('span', null, [
              el('span.basemenu__name', { text: item.name }),
              el('span.basemenu__hint', { text: item.hint }),
            ]),
          ],
        ),
      ), menuFooter(kind)].filter(Boolean),
    );
    node.append(menuNode);
    const rect = anchor.getBoundingClientRect();
    const host = node.getBoundingClientRect();
    menuNode.style.left = `${Math.max(8, Math.min(host.width - 236, rect.left - host.left - 80))}px`;
    menuNode.style.bottom = `${host.bottom - rect.top + 8}px`;
    closeMenu = onDismiss(menuNode, (event) => {
      if (anchor.contains(event.target)) return;
      hideMenu();
    });
  }

  function hideMenu() {
    menuNode?.remove();
    menuNode = null;
    closeMenu?.();
    closeMenu = null;
  }

  const legendBody = el('div');
  // Тепловая карта отвечает «где», список районов — «какие именно».
  const legendList = el('button.legend__list', {
    type: 'button',
    hidden: true,
    text: 'Список районов',
    onclick: () => onAction({ type: 'openLayerList' }),
  });
  const legend = el('div.legend', null, [
    el('div.legend__title', { text: 'Условные обозначения' }),
    legendBody,
    legendList,
  ]);

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
    updateLegend(state, scale, range, zones) {
      const layer = THEMATIC_BY_ID[state.ui.thematic || 'admin'];
      // У тематического слоя своя легенда — она объясняет окраску территорий.
      if (layer && layer.kind !== 'admin') {
        legend.hidden = !state.ui.legend;
        legendList.hidden = false;
        if (legend.hidden) return;
        legend.querySelector('.legend__title').textContent = layer.name;
        mount(legendBody, thematicLegend(layer, state.filters.resources, range, scale, zones));
        return;
      }
      legendList.hidden = true;
      legend.querySelector('.legend__title').textContent = 'Условные обозначения';

      // Легенда объектов бессмысленна, пока объекты не показываются.
      const gated = !state.filters.resources.length && (scale === 'district' || scale === 'object');
      legend.hidden = !state.ui.legend || gated;
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

/** Легенда тематического слоя: шкала или перечень зон. */
function thematicLegend(layer, resourceIds, range, scale, zones) {
  if (layer.kind === 'scale') {
    const span = range || metricRange(layer.id, resourceIds);
    const format = (value) =>
      layer.unit === '%' ? `${Math.round(value)} %` : `${formatNumber(value, 2)}${layer.unit}`;
    return [
      el('div.legend__ramp', {
        style: { background: `linear-gradient(90deg, ${layer.ramp.join(', ')})` },
      }),
      el('div.legend__scale', null, [
        el('span', { text: `${layer.legend[0]} · ${format(span.min)}` }),
        el('span', { text: `${format(span.max)} · ${layer.legend[1]}` }),
      ]),
      el('div.legend__note', {
        text: scale === 'city' ? 'Шкала по округам' : 'Шкала по районам',
      }),
    ];
  }

  // Зон много, в легенду выносим крупнейшие: они закрывают большую часть
  // карты, остальные сворачиваются в одну строку.
  const list = (zones || []).slice(0, 6);
  const rest = (zones || []).length - list.length;
  return [
    ...list.map((zone) =>
      el('div.legend__row', null, [
        el('span.legend__swatch', { style: { background: zone.color } }),
        el('span.legend__name', { text: zone.name, title: zone.name }),
        el('span.legend__count', { text: `${zone.districts}` }),
      ]),
    ),
    rest > 0 ? el('div.legend__note', { text: `и ещё ${rest} ${pluralRu(rest, 'источник', 'источника', 'источников')}` }) : null,
    el('div.legend__note', {
      text:
        resourceIds.length === 1
          ? 'Зоны по выбранному ресурсу'
          : 'Зоны по теплоснабжению — выберите один ресурс для другого',
    }),
  ].filter(Boolean);
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
