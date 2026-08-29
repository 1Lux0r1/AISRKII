/** Разделы верхней навигации, кроме карты. */

import { el, mount } from '../utils/dom.js';
import { icon, resourceBadge } from './icons.js';
import { getState } from '../state.js';
import { CITY, RESOURCES, RESOURCE_BY_ID, STATUS_BY_ID } from '../data/catalog.js';
import { INCIDENT_KINDS } from '../data/incidents.js';
import {
  filterFromState,
  incidents,
  okrugStats,
  organizationBreakdown,
  scopeFromState,
  statsFor,
  territories,
} from '../data/model.js';
import { formatDate, formatInt, formatKm, formatPercent } from '../utils/format.js';

export function createSections({ onAction }) {
  const node = el('div.section');

  function update() {
    const state = getState();
    switch (state.section) {
      case 'validation':
        mount(node, renderValidation(state, onAction));
        break;
      case 'analytics':
        mount(node, renderAnalytics(state));
        break;
      case 'reports':
        mount(node, renderReports(state, onAction));
        break;
      case 'admin':
        mount(node, renderAdmin());
        break;
      default:
        mount(node, []);
    }
    node.scrollTop = 0;
  }

  return { node, update };
}

/* ------------------------------ Проверка данных ------------------------------ */

function renderValidation(state, onAction) {
  const kindCounts = new Map();
  for (const inc of incidents) kindCounts.set(inc.kindId, (kindCounts.get(inc.kindId) || 0) + 1);

  const cards = INCIDENT_KINDS.map((kind) =>
    el('div.tile', null, [
      el('div.tile__label', null, [
        el('span.legend__swatch', { style: { background: kind.color } }),
        el('span', { text: kind.name }),
      ]),
      el('div.tile__value', { text: formatInt(kindCounts.get(kind.id) || 0) }),
      el('div.tile__sub', { text: 'открытых событий' }),
    ]),
  );

  const kindColor = Object.fromEntries(INCIDENT_KINDS.map((k) => [k.id, k.color]));
  const rows = incidents.slice(0, 40).map((inc) => {
    const resource = RESOURCE_BY_ID[inc.resourceId];
    return el('div.table__row', { onclick: () => onAction({ type: 'focusIncident', incident: inc }) }, [
      el('span.table__id', { text: inc.id }),
      el('span', null, [
        el('span.legend__swatch', { style: { background: kindColor[inc.kindId], display: 'inline-block', marginRight: '7px' } }),
        el('span', { text: inc.kindName }),
      ]),
      el('span', { title: resource.name }, [
        el('span.legend__swatch', { style: { background: resource.color, display: 'inline-block', marginRight: '7px' } }),
        el('span', { text: resource.short }),
      ]),
      el('span', { text: inc.title, title: inc.title }),
      el('span', { text: `${inc.districtName}, ${inc.okrugCode}` }),
      el('span', { text: `${inc.openedHoursAgo} ч назад` }),
      el('span', { text: formatInt(inc.affected) }),
    ]);
  });

  return [
    el('div.section__head', null, [
      el('h1.section__title', { text: 'Проверка данных' }),
      el('p.section__sub', {
        text: `Расхождения и события, выявленные при приёме выгрузок от ресурсоснабжающих организаций. Данные актуальны на ${formatDate(CITY.actualOn)}.`,
      }),
    ]),
    el('div.tiles', null, cards),
    el('div.card', null, [
      el('div.card__head', null, [
        el('span', { text: 'Журнал событий' }),
        el('span.card__meta', { text: `Всего: ${formatInt(incidents.length)}` }),
      ]),
      el('div.table', null, [
        el('div.table__row.table__row--head', null, [
          el('span', { text: 'Номер' }),
          el('span', { text: 'Категория' }),
          el('span', { text: 'Ресурс' }),
          el('span', { text: 'Описание' }),
          el('span', { text: 'Территория' }),
          el('span', { text: 'Открыто' }),
          el('span', { text: 'Затронуто' }),
        ]),
        ...rows,
      ]),
    ]),
  ];
}

/* --------------------------------- Аналитика --------------------------------- */

function renderAnalytics(state) {
  const filter = filterFromState(state);
  const cityStats = statsFor({ ...filter, districtIds: null, okrugIds: null });

  const okrugRows = territories
    .map((okrug) => ({ okrug, stats: okrugStats(okrug.id, filter) }))
    .sort((a, b) => b.stats.total - a.stats.total);
  const maxOkrug = Math.max(...okrugRows.map((r) => r.stats.total), 1);

  const maxResource = Math.max(...RESOURCES.map((r) => cityStats.byResource[r.id] || 0), 1);
  const orgRows = organizationBreakdown(cityStats).slice(0, 8);
  const maxOrg = Math.max(...orgRows.map((r) => r.count), 1);

  return [
    el('div.section__head', null, [
      el('h1.section__title', { text: 'Аналитика' }),
      el('p.section__sub', {
        text: `Распределение объектов реестра по территориям, ресурсам и организациям. Охват: ${scopeFromState(state).label}.`,
      }),
    ]),
    el('div.tiles', null, [
      tile('Объектов в реестре', formatInt(cityStats.total), 'по действующим фильтрам'),
      tile('Протяжённость сетей', formatKm(cityStats.networkKm), 'суммарно'),
      tile('Требуют внимания', formatInt(cityStats.byStatus.warn + cityStats.byStatus.alert), 'объектов'),
      tile('Полнота данных', formatPercent(((cityStats.total - cityStats.byStatus.nodata) / (cityStats.total || 1)) * 100), 'паспортов заполнено'),
    ]),
    el('div.grid2', null, [
      el('div.card', null, [
        el('div.card__head', null, el('span', { text: 'Объекты по административным округам' })),
        el('div.card__body', null,
          okrugRows.map(({ okrug, stats }) =>
            chartRow(okrug.name, stats.total, maxOkrug, okrug.color === '#c9ccd2' ? 'var(--brand)' : okrug.color),
          ),
        ),
      ]),
      el('div.card', null, [
        el('div.card__head', null, el('span', { text: 'Объекты по ресурсам' })),
        el('div.card__body', null,
          RESOURCES.map((resource) =>
            chartRow(resource.name, cityStats.byResource[resource.id] || 0, maxResource, resource.color, resourceBadge(resource, 14)),
          ),
        ),
      ]),
      el('div.card', null, [
        el('div.card__head', null, el('span', { text: 'Крупнейшие ресурсоснабжающие организации' })),
        el('div.card__body', null,
          orgRows.map(({ org, count }) => chartRow(org.name, count, maxOrg, 'var(--brand)')),
        ),
      ]),
      el('div.card', null, [
        el('div.card__head', null, el('span', { text: 'Состояние объектов' })),
        el('div.card__body', null,
          Object.entries(cityStats.byStatus).map(([id, count]) =>
            chartRow(STATUS_BY_ID[id].name, count, cityStats.total || 1, STATUS_BY_ID[id].color),
          ),
        ),
      ]),
    ]),
  ];
}

/* ---------------------------------- Отчёты ---------------------------------- */

function renderReports(state, onAction) {
  const scope = scopeFromState(state);
  const stats = statsFor(filterFromState(state));
  const templates = [
    { id: 'registry', name: 'Реестр объектов', desc: 'Полный перечень объектов выбранной территории с паспортными сведениями.' },
    { id: 'networks', name: 'Протяжённость сетей', desc: 'Сводка по протяжённости сетей в разрезе ресурсов и организаций.' },
    { id: 'quality', name: 'Полнота данных РСО', desc: 'Оценка полноты и своевременности выгрузок ресурсоснабжающих организаций.' },
    { id: 'incidents', name: 'Журнал событий', desc: 'Технологические нарушения и плановые отключения за период.' },
  ];

  return [
    el('div.section__head', null, [
      el('h1.section__title', { text: 'Отчёты' }),
      el('p.section__sub', { text: 'Формирование выгрузок по текущему территориальному охвату и фильтрам.' }),
    ]),
    el('div.card', null, [
      el('div.card__head', null, el('span', { text: 'Параметры выгрузки' })),
      el('div.card__body', null, [
        row('Территория', scope.label),
        row('Объектов в выборке', formatInt(stats.total)),
        row('Протяжённость сетей', formatKm(stats.networkKm)),
        row('Данные актуальны на', formatDate(CITY.actualOn)),
      ]),
    ]),
    el('div.tiles', null,
      templates.map((tpl) =>
        el('div.tile.tile--action', { onclick: () => onAction({ type: 'report', template: tpl }) }, [
          el('div.tile__label', null, [icon('doc'), el('span', { text: tpl.name })]),
          el('div.tile__sub', { text: tpl.desc, style: { marginTop: '6px' } }),
          el('button.btn', { type: 'button', text: 'Сформировать' }),
        ]),
      ),
    ),
  ];
}

/* ---------------------------- Администрирование ---------------------------- */

function renderAdmin() {
  const items = [
    { icon: 'building', name: 'Ресурсоснабжающие организации', desc: 'Реестр поставщиков данных, регламенты и форматы выгрузок.' },
    { icon: 'clipboard', name: 'Справочники', desc: 'Типы объектов, виды ресурсов, состояния, классификаторы.' },
    { icon: 'shield', name: 'Права доступа', desc: 'Роли пользователей и разграничение доступа к сведениям.' },
    { icon: 'clock', name: 'Расписание приёма данных', desc: 'Периодичность выгрузок и контроль их поступления.' },
  ];
  return [
    el('div.section__head', null, [
      el('h1.section__title', { text: 'Администрирование' }),
      el('p.section__sub', { text: 'Настройка справочников, источников данных и прав доступа.' }),
    ]),
    el('div.tiles', null,
      items.map((item) =>
        el('div.tile', null, [
          el('div.tile__label', null, [icon(item.icon), el('span', { text: item.name })]),
          el('div.tile__sub', { text: item.desc, style: { marginTop: '6px' } }),
        ]),
      ),
    ),
  ];
}

/* --------------------------------- помощники --------------------------------- */

function tile(label, value, sub) {
  return el('div.tile', null, [
    el('div.tile__label', null, el('span', { text: label })),
    el('div.tile__value', { text: value }),
    el('div.tile__sub', { text: sub }),
  ]);
}

function row(label, value) {
  return el('div.row', null, [
    el('span.row__label', { text: label }),
    el('span.row__value', { text: value }),
  ]);
}

function chartRow(label, value, max, color, prefix = null) {
  return el('div.chartrow', null, [
    el('div.chartrow__head', null, [
      prefix,
      el('span.chartrow__label', { text: label, title: label }),
      el('span.chartrow__value', { text: formatInt(value) }),
    ]),
    el('div.bar', null, [
      el('div.bar__seg', { style: { width: `${Math.max(1, (value / max) * 100)}%`, background: color } }),
    ]),
  ]);
}
