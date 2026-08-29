/** Правая панель «Сведения»: город, округ, район, область, объект. */

import { el, mount } from '../utils/dom.js';
import { icon, resourceBadge } from './icons.js';
import { getState, setState } from '../state.js';
import {
  CITY,
  OBJECT_TYPES,
  RESOURCES,
  RESOURCE_BY_ID,
  STATUSES,
  STATUS_BY_ID,
  TYPE_GROUPS,
} from '../data/catalog.js';
import {
  OKRUG_BY_ID,
  areaOfPolygon,
  districtById,
  districtsInPolygon,
  filterFromState,
  findFeature,
  incidents,
  incidentsByDistrict,
  incidentsByOkrug,
  okrugById,
  organizationBreakdown,
  scopeFromState,
  statsFor,
} from '../data/model.js';
import {
  formatArea,
  formatDate,
  formatInt,
  formatKm,
  formatNumber,
  formatPercent,
  formatPower,
  pluralRu,
} from '../utils/format.js';

const TABS = {
  city: [
    { id: 'overview', name: 'Обзор' },
    { id: 'composition', name: 'Состав' },
    { id: 'orgs', name: 'Организации' },
    { id: 'data', name: 'Данные' },
  ],
  okrug: [
    { id: 'overview', name: 'Обзор' },
    { id: 'composition', name: 'Состав' },
    { id: 'orgs', name: 'Организации' },
    { id: 'data', name: 'Данные' },
  ],
  district: [
    { id: 'overview', name: 'Обзор' },
    { id: 'types', name: 'Типы объектов' },
    { id: 'orgs', name: 'Организации' },
    { id: 'data', name: 'Данные' },
  ],
  area: [
    { id: 'overview', name: 'Обзор' },
    { id: 'types', name: 'Типы объектов' },
    { id: 'orgs', name: 'Организации' },
  ],
  object: [
    { id: 'overview', name: 'Паспорт' },
    { id: 'params', name: 'Характеристики' },
    { id: 'events', name: 'События' },
  ],
};

export function createInspector({ onAction }) {
  const titleNode = el('div.inspector__title');
  const subNode = el('div.inspector__sub');
  const tabsNode = el('div.tabs');
  const bodyNode = el('div.inspector__body');
  const closeBtn = el('button.inspector__close', { type: 'button', title: 'Свернуть панель' }, icon('close'));

  closeBtn.addEventListener('click', () => setState({ ui: { inspectorOpen: false } }, ['ui']));

  const node = el('aside.inspector', null, [
    el('div.inspector__head', null, [
      el('div.inspector__titles', null, [titleNode, subNode]),
      closeBtn,
    ]),
    tabsNode,
    bodyNode,
  ]);

  function update() {
    const state = getState();
    const ctx = buildContext(state);

    titleNode.textContent = ctx.title;
    subNode.textContent = ctx.subtitle;

    const tabs = TABS[ctx.kind] || TABS.city;
    const activeTab = tabs.some((t) => t.id === state.ui.inspectorTab) ? state.ui.inspectorTab : tabs[0].id;

    mount(
      tabsNode,
      tabs.map((tab) =>
        el('button.tab', {
          type: 'button',
          text: tab.name,
          class: tab.id === activeTab ? 'is-active' : '',
          onclick: () => setState({ ui: { inspectorTab: tab.id } }, ['ui']),
        }),
      ),
    );

    mount(bodyNode, renderTab(ctx, activeTab, onAction));
    bodyNode.scrollTop = 0;
  }

  update();
  return { node, update };
}

/** Контекст панели: что выбрано и какая сводка ему соответствует. */
function buildContext(state) {
  const { selection } = state;
  const filter = filterFromState(state);

  if (selection.kind === 'object') {
    const feature = findFeature(selection.id);
    return { kind: 'object', feature, title: feature?.name || 'Объект', subtitle: feature ? `${feature.typeName} · ${feature.districtName}` : '', state };
  }

  if (selection.kind === 'area' && state.customArea) {
    const inside = districtsInPolygon(state.customArea);
    const ids = new Set(inside.map((d) => d.id));
    const stats = statsFor({ ...filter, districtIds: ids, okrugIds: null });
    return {
      kind: 'area',
      title: 'Выбранная территория',
      subtitle: inside.length
        ? `${inside.length} ${pluralRu(inside.length, 'район', 'района', 'районов')} · ${formatArea(areaOfPolygon(state.customArea))}`
        : 'Область не содержит районов',
      stats,
      areaKm2: areaOfPolygon(state.customArea),
      districts: inside,
      state,
      filter,
    };
  }

  if (selection.kind === 'district') {
    const district = districtById.get(selection.id);
    if (district) {
      const stats = statsFor({ ...filter, districtIds: new Set([district.id]), okrugIds: null });
      return {
        kind: 'district',
        title: 'Выбранная территория',
        subtitle: `Район ${district.name}, ${district.okrugCode}`,
        district,
        stats,
        areaKm2: district.areaKm2,
        state,
        filter,
      };
    }
  }

  if (selection.kind === 'okrug') {
    const okrug = okrugById.get(selection.id);
    if (okrug) {
      const stats = statsFor({ ...filter, okrugIds: new Set([okrug.id]), districtIds: null });
      return {
        kind: 'okrug',
        title: okrug.name,
        subtitle: `Административный округ · ${okrug.code}`,
        okrug,
        stats,
        areaKm2: okrug.areaKm2,
        state,
        filter,
      };
    }
  }

  const stats = statsFor(filter);
  return {
    kind: 'city',
    title: CITY.name,
    subtitle: scopeFromState(state).kind === 'city' ? CITY.subtitle : `Городской уровень · ${scopeFromState(state).label}`,
    stats,
    state,
    filter,
  };
}

function renderTab(ctx, tab, onAction) {
  if (ctx.kind === 'object') return renderObject(ctx, tab, onAction);
  switch (tab) {
    case 'composition':
    case 'types':
      return renderComposition(ctx);
    case 'orgs':
      return renderOrgs(ctx);
    case 'data':
      return renderData(ctx);
    default:
      return ctx.kind === 'city' || ctx.kind === 'okrug' ? renderCityOverview(ctx, onAction) : renderTerritoryOverview(ctx, onAction);
  }
}

/* ------------------------------ Обзор: город / округ ------------------------------ */

function renderCityOverview(ctx, onAction) {
  const s = ctx.stats;
  const isCity = ctx.kind === 'city';
  const openIncidents = isCity ? incidents.length : incidentsByOkrug.get(ctx.okrug.id) || 0;

  const nodes = [
    statRow('pinSearch', 'Всего объектов', formatInt(s.total), { strong: true }),
    statRow('target', 'Источников', formatInt(s.byType.source), { color: 'var(--res-power)' }),
    statRow('dot', 'Тепловых пунктов', formatInt(s.byType.heatpoint), { color: 'var(--res-water)' }),
    statRow('dot', 'Потребителей', formatInt(s.byType.consumer), { color: 'var(--res-heat)' }),
    statRow('network', 'Протяжённость сетей', formatKm(s.networkKm)),

    group('bolt', 'Ресурсы', formatInt(sumResources(s)), RESOURCES.map((resource) =>
      el('div.row', null, [
        resourceBadge(resource),
        el('span.row__label', { text: resource.name, title: resource.name }),
        el('span.row__value', { text: formatInt(s.byResource[resource.id]) }),
      ]),
    )),

    group('map', 'Территория', isCity ? formatInt(12 + 146) : formatInt(1 + ctx.okrug.districts.length), isCity
      ? [
          simpleRow('Административных округов', '12'),
          simpleRow('Районов', '146'),
        ]
      : [
          simpleRow('Районов', String(ctx.okrug.districts.length)),
          simpleRow('Площадь', formatArea(ctx.areaKm2)),
        ]),
  ];

  if (openIncidents) {
    nodes.push(
      group('warning', 'События', formatInt(openIncidents), [
        el('div.row.row--link', {
          onclick: () => onAction({ type: 'openSection', id: 'validation' }),
        }, [
          el('span.legend__swatch', { style: { background: 'var(--alert)' } }),
          el('span.row__label', { text: 'Открытых событий мониторинга' }),
          el('span.row__value', { text: formatInt(openIncidents) }),
        ]),
      ]),
    );
  }

  nodes.push(
    el('div.callout', null, [icon('info'), el('span', { text: `Данные актуальны на ${formatDate(CITY.actualOn)}` })]),
    el('button.btn', { type: 'button', onclick: () => onAction({ type: 'report', ctx }) }, [
      icon('doc'),
      el('span', { text: 'Сформировать отчёт' }),
    ]),
  );

  return nodes;
}

/* --------------------------- Обзор: район / область --------------------------- */

function renderTerritoryOverview(ctx, onAction) {
  const s = ctx.stats;
  const nodes = [
    el('div.subhead', { text: 'Сводка' }),
    simpleRow('Площадь', formatArea(ctx.areaKm2)),
    simpleRow('Мощность', formatPower(s.powerMw)),
    simpleRow('Протяжённость сетей', formatKm(s.networkKm)),
    simpleRow('Объектов', formatInt(s.total), true),

    el('div.subhead', { text: 'По ресурсам' }),
    ...RESOURCES.map((resource) =>
      el('div.row', null, [
        resourceBadge(resource),
        el('span.row__label', { text: resource.name, title: resource.name }),
        el('span.row__value', { text: formatInt(s.byResource[resource.id]) }),
      ]),
    ),

    el('div.subhead', { text: 'По типам' }),
    ...TYPE_GROUPS.map((groupDef) => simpleRow(groupDef.name, formatInt(s.byGroup[groupDef.id] || 0))),
  ];

  const openIncidents = ctx.district ? incidentsByDistrict.get(ctx.district.id) || 0 : 0;
  if (openIncidents) {
    nodes.push(
      el('div.subhead', { text: 'События' }),
      el('div.row', null, [
        el('span.legend__swatch', { style: { background: 'var(--alert)' } }),
        el('span.row__label', { text: 'Открытых событий' }),
        el('span.row__value', { text: formatInt(openIncidents) }),
      ]),
    );
  }

  nodes.push(
    el('button.btn.btn--primary', { type: 'button', onclick: () => onAction({ type: 'showObjects', ctx }) }, [
      icon('pin'),
      el('span', { text: 'Показать объекты' }),
    ]),
    el('button.btn', { type: 'button', onclick: () => onAction({ type: 'openList', ctx }) }, [
      icon('list'),
      el('span', { text: 'Открыть список' }),
    ]),
    el('button.btn', { type: 'button', onclick: () => onAction({ type: 'saveArea', ctx }) }, [
      icon('save'),
      el('span', { text: 'Сохранить область' }),
    ]),
    el('button.btn', { type: 'button', onclick: () => onAction({ type: 'report', ctx }) }, [
      icon('doc'),
      el('span', { text: 'Сформировать отчёт' }),
    ]),
  );

  return nodes;
}

/* ------------------------------- Состав / типы ------------------------------- */

function renderComposition(ctx) {
  const s = ctx.stats;
  if (!s.total) return [el('div.empty', { text: 'Нет объектов, удовлетворяющих фильтру' })];

  const nodes = [el('div.subhead', { text: 'Состав по типам' })];
  for (const type of OBJECT_TYPES) {
    const count = s.byType[type.id] || 0;
    nodes.push(
      el('div', null, [
        el('div.row', null, [
          el('span.row__label', { text: type.plural }),
          el('span.row__value', { text: formatInt(count) }),
        ]),
        bar([{ value: count, total: s.total, color: 'var(--brand)' }]),
      ]),
    );
  }

  nodes.push(el('div.subhead', { text: 'Состояние объектов' }));
  for (const status of STATUSES) {
    const count = s.byStatus[status.id] || 0;
    nodes.push(
      el('div.row', null, [
        el('span.legend__swatch', { style: { background: status.color } }),
        el('span.row__label', { text: status.name }),
        el('span.row__value', { text: formatInt(count) }),
        el('span.check__meta', { text: formatPercent(s.total ? (count / s.total) * 100 : 0) }),
      ]),
    );
  }

  nodes.push(
    el('div.subhead', { text: 'Протяжённость сетей' }),
    simpleRow('Всего', formatKm(s.networkKm)),
    simpleRow('Установленная мощность', formatPower(s.powerMw)),
  );

  return nodes;
}

/* -------------------------------- Организации -------------------------------- */

function renderOrgs(ctx) {
  const rows = organizationBreakdown(ctx.stats);
  if (!rows.length) return [el('div.empty', { text: 'Организации не найдены' })];
  const total = rows.reduce((acc, r) => acc + r.count, 0);

  const nodes = [
    el('div.subhead', { text: `Ресурсоснабжающих организаций: ${rows.length}` }),
  ];
  for (const { org, count } of rows) {
    nodes.push(
      el('div', { style: { padding: '4px 0 8px' } }, [
        el('div.row', null, [
          el('span.row__label', { text: org.name, title: org.name }),
          el('span.row__value', { text: formatInt(count) }),
        ]),
        el('div', { style: { display: 'flex', gap: '4px', margin: '2px 0 5px' } },
          org.resources.map((r) => resourceBadge(RESOURCE_BY_ID[r], 13)),
        ),
        bar([{ value: count, total, color: 'var(--brand)' }]),
      ]),
    );
  }
  return nodes;
}

/* ----------------------------------- Данные ----------------------------------- */

function renderData(ctx) {
  const rows = organizationBreakdown(ctx.stats);
  const total = ctx.stats.total || 1;
  const nodes = [
    el('div.subhead', { text: 'Полнота и качество данных' }),
    simpleRow('Объектов в реестре', formatInt(ctx.stats.total)),
    simpleRow('С полным паспортом', formatInt(ctx.stats.total - ctx.stats.byStatus.nodata)),
    simpleRow('Без данных за период', formatInt(ctx.stats.byStatus.nodata)),
    simpleRow('Полнота', formatPercent(((total - ctx.stats.byStatus.nodata) / total) * 100), true),
    el('div.subhead', { text: 'Поступление данных от РСО' }),
  ];

  rows.forEach(({ org, count }, i) => {
    const lag = (i * 7) % 3;
    const status = lag === 0 ? 'ok' : lag === 1 ? 'warn' : 'alert';
    nodes.push(
      el('div.row', null, [
        el('span.legend__swatch', { style: { background: STATUS_BY_ID[status].color } }),
        el('span.row__label', { text: org.name, title: org.name }),
        el('span.check__meta', { text: lag === 0 ? 'сегодня' : `${lag} дн.` }),
        el('span.row__value.row__value--muted', { text: formatInt(count) }),
      ]),
    );
  });

  nodes.push(
    el('div.callout', null, [
      icon('info'),
      el('span', { text: `Последняя выгрузка получена ${formatDate(CITY.actualOn)}. Расхождения выносятся в раздел «Проверка данных».` }),
    ]),
  );
  return nodes;
}

/* ----------------------------------- Объект ----------------------------------- */

function renderObject(ctx, tab, onAction) {
  const f = ctx.feature;
  if (!f) return [el('div.empty', { text: 'Объект не найден' })];
  const resource = RESOURCE_BY_ID[f.resourceId];
  const status = STATUS_BY_ID[f.statusId];

  if (tab === 'params') {
    return [
      el('div.subhead', { text: 'Технические характеристики' }),
      f.kind === 'line'
        ? simpleRow('Диаметр', `${f.diameter} мм`)
        : simpleRow('Установленная мощность', formatPower(f.capacityMw)),
      f.kind === 'line' ? simpleRow('Протяжённость', `${formatNumber(f.lengthKm, 3)} км`) : null,
      simpleRow('Год ввода в эксплуатацию', String(f.commissioned)),
      simpleRow('Износ', formatPercent(f.wear)),
      bar([
        { value: f.wear, total: 100, color: f.wear > 65 ? 'var(--alert)' : f.wear > 40 ? 'var(--warn)' : 'var(--ok)' },
      ]),
      el('div.subhead', { text: 'Учётные сведения' }),
      simpleRow('Реестровый номер', f.regNumber),
      simpleRow('УНОМ', String(f.unom ?? '—')),
      simpleRow('Обновлено', formatDate(f.updatedAt)),
    ].filter(Boolean);
  }

  if (tab === 'events') {
    const related = incidents.filter((inc) => inc.districtId === f.districtId).slice(0, 6);
    if (!related.length) return [el('div.empty', { text: 'Событий за выбранный период нет' })];
    return [
      el('div.subhead', { text: `События в районе ${f.districtName}` }),
      ...related.map((inc) =>
        el('div', { style: { padding: '7px 0', borderTop: '1px solid var(--border)' } }, [
          el('div.row', null, [
            el('span.legend__swatch', { style: { background: RESOURCE_BY_ID[inc.resourceId].color } }),
            el('span.row__label', { text: inc.kindName }),
            el('span.check__meta', { text: `${inc.openedHoursAgo} ч` }),
          ]),
          el('div', { text: inc.title, style: { fontSize: 'var(--fs-sm)', color: 'var(--text-2)', lineHeight: '1.4' } }),
        ]),
      ),
    ];
  }

  return [
    el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '2px 0 10px' } }, [
      el('span.badge', { style: { background: 'var(--brand-soft)', color: 'var(--brand)' } }, [
        el('span', { text: f.typeName }),
      ]),
      el('span.badge', { style: { background: `${status.color}1f`, color: status.color } }, [
        el('span.badge__dot', { style: { background: status.color } }),
        el('span', { text: status.name }),
      ]),
    ]),
    el('div.subhead', { text: 'Паспорт объекта' }),
    el('div.row', null, [
      resourceBadge(resource),
      el('span.row__label', { text: 'Ресурс' }),
      el('span.row__value', { text: resource.short }),
    ]),
    simpleRow('Организация', f.orgName),
    simpleRow('Адрес', f.address),
    simpleRow('Район', f.districtName),
    simpleRow('Округ', OKRUG_BY_ID[f.okrugId]?.code || '—'),
    simpleRow('Реестровый номер', f.regNumber),
    el('div.callout', null, [icon('clock'), el('span', { text: `Сведения получены от РСО ${formatDate(f.updatedAt)}` })]),
    el('button.btn.btn--primary', { type: 'button', onclick: () => onAction({ type: 'zoomFeature', feature: f }) }, [
      icon('pin'),
      el('span', { text: 'Показать на карте' }),
    ]),
    el('button.btn', { type: 'button', onclick: () => onAction({ type: 'report', ctx }) }, [
      icon('doc'),
      el('span', { text: 'Выгрузить паспорт' }),
    ]),
  ];
}

/* ----------------------------------- Помощники ----------------------------------- */

function sumResources(stats) {
  return RESOURCES.reduce((acc, r) => acc + (stats.byResource[r.id] || 0), 0);
}

function statRow(iconName, label, value, opts = {}) {
  const iconNode = icon(iconName);
  if (opts.color) iconNode.style.color = opts.color;
  return el(`div.row${opts.strong ? '.row--strong' : ''}`, null, [
    iconNode,
    el('span.row__label', { text: label }),
    el('span.row__value', { text: value }),
  ]);
}

function simpleRow(label, value, strong = false) {
  return el(`div.row${strong ? '.row--strong' : ''}`, null, [
    el('span.row__label', { text: label, title: label }),
    el('span.row__value', { text: value, title: value }),
  ]);
}

function group(iconName, title, total, children) {
  return el('div.stat-group', null, [
    el('div.stat-group__head', null, [
      icon(iconName),
      el('span', { text: title }),
      el('span.stat-group__total', { text: total }),
    ]),
    ...children,
  ]);
}

function bar(segments) {
  return el(
    'div.bar',
    null,
    segments.map((seg) =>
      el('div.bar__seg', {
        style: {
          width: `${seg.total ? Math.max(1, (seg.value / seg.total) * 100) : 0}%`,
          background: seg.color,
        },
      }),
    ),
  );
}
