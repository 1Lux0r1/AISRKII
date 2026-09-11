/** Правая панель «Сведения»: город, округ, район, область, объект. */

import { el, mount, onDismiss } from '../utils/dom.js';
import { icon, resourceBadge } from './icons.js';
import { getState, setState } from '../state.js';
import {
  CITY,
  OBJECT_TYPES,
  RESOURCES,
  RESOURCE_BY_ID,
  STATUSES,
  STATUS_BY_ID,
  typesForResource,
} from '../data/catalog.js';
import {
  OKRUG_BY_ID,
  areaOfPolygon,
  streetsOfDistrict,
  territories,
  districtById,
  districtsInPolygon,
  filterFromState,
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
  const closeBtn = el('button.inspector__close', { type: 'button', title: 'Свернуть панель' }, icon('chevronRight'));

  // Сброс охвата: снимает округ, район, улицу и нарисованную область — панель
  // возвращается к сводке по всему городу. Отбор объектов слева не трогает:
  // это другая настройка, и у неё свой «Сбросить все».
  const resetBtn = el('button.inspector__reset', { type: 'button', text: 'Сбросить все' });
  resetBtn.addEventListener('click', () => onAction({ type: 'resetScope' }));

  // Охват одной строкой: Москва › округ › район › улица. Отдельного блока с
  // тремя списками нет — он дублировал эту строку и занимал полпанели;
  // списки раскрываются прямо из звена.
  const scopeBox = el('div.scope__box');
  const scopeMap = el('button.btn.btn--soft.btn--sm', { type: 'button', title: 'Перевести карту к заданной территории' }, [
    icon('pin', { size: 13, cls: 'icon icon--sm' }),
    el('span', { text: 'На карте' }),
  ]);
  scopeMap.addEventListener('click', () => onAction({ type: 'showScope' }));
  // Улица сужает объекты на карте и в списке, но не реестровые итоги: в
  // таблице агрегации улицы нет. Говорим об этом рядом с охватом, а не в
  // документации, — иначе расхождение выглядит ошибкой.
  const scopeNote = el('div.scope__note', {
    hidden: true,
    text: 'Улица сужает объекты на карте и в списке; сводные показатели считаются по району',
  });
  const scopeNode = el('div.scope', null, [
    el('div.scope__head', null, [
      el('span.eyebrow', { text: 'Охват сведений' }),
      el('span.u-spacer'),
      scopeMap,
    ]),
    scopeBox,
    scopeNote,
  ]);

  /**
   * Строка охвата. Щелчок по звену открывает список этого уровня — путь от
   * «что я смотрю» к «как это поменять» в один шаг, без отдельного блока.
   */
  function renderScope(state) {
    const f = state.filters;
    const okrug = f.okrugId ? okrugById.get(f.okrugId) : null;
    const district = f.districtId ? districtById.get(f.districtId) : null;
    const streets = f.districtId ? streetsOfDistrict(f.districtId) : [];
    const street = f.streetId ? streets.find((item) => item.id === f.streetId) : null;

    // Улица из другого района в списке не найдётся: сбрасываем молча, иначе
    // в строке охвата висело бы звено, которое ни на что не влияет.
    if (f.streetId && !street) setState({ filters: { streetId: null } }, []);

    const steps = [
      { level: 'city', name: state.customArea && f.customArea ? 'Область' : CITY.name, set: true, enabled: true },
      { level: 'okrug', name: okrug ? okrug.code : 'Округ', set: Boolean(okrug), enabled: true },
      { level: 'district', name: district ? district.name : 'Район', set: Boolean(district), enabled: Boolean(okrug) },
      { level: 'street', name: street ? street.name : 'Улица', set: Boolean(street), enabled: Boolean(district) },
    ];

    scopeNote.hidden = !street;

    mount(scopeBox, steps.flatMap((step, i) => [
      i ? el('span.scope__sep', null, icon('chevronRight', { size: 12, cls: 'icon icon--sm' })) : null,
      el('button.scope__item', {
        type: 'button',
        class: [step.set ? 'scope__item--set' : 'scope__item--empty', step.enabled ? '' : 'is-disabled']
          .filter(Boolean)
          .join(' '),
        disabled: !step.enabled,
        title: scopeHint(step.level, step.enabled),
        text: step.name,
        onclick: (event) => openScopeMenu(event.currentTarget, step.level),
      }),
    ].filter(Boolean)));
  }

  function scopeHint(level, enabled) {
    if (level === 'city') return 'Весь город: сбросить округ, район и улицу';
    if (!enabled) return level === 'district' ? 'Сначала выберите округ' : 'Сначала выберите район';
    return level === 'okrug' ? 'Выбрать округ' : level === 'district' ? 'Выбрать район' : 'Выбрать улицу';
  }

  let scopeMenu = null;
  let scopeDismiss = null;

  function hideScopeMenu() {
    scopeMenu?.remove();
    scopeMenu = null;
    scopeDismiss?.();
    scopeDismiss = null;
  }

  function scopeOptions(level) {
    const f = getState().filters;
    if (level === 'city') {
      return [{ id: 'reset', name: 'Вся Москва', meta: '12 округов', current: !f.okrugId }];
    }
    if (level === 'okrug') {
      return [
        { id: null, name: 'Все округа', meta: 'вся Москва', current: !f.okrugId },
        // Для ТиНАО в наборе границ нет геометрии — предупреждаем до выбора.
        ...territories.map((o) => ({
          id: o.id,
          name: `${o.name} (${o.code})`,
          meta: o.approximate ? 'без контура' : `${o.districts.length} р-нов`,
          current: o.id === f.okrugId,
        })),
      ];
    }
    if (level === 'district') {
      const okrug = f.okrugId ? okrugById.get(f.okrugId) : null;
      return [
        { id: null, name: 'Все районы округа', meta: okrug?.code || '', current: !f.districtId },
        ...(okrug?.districts || []).map((d) => ({ id: d.id, name: d.name, current: d.id === f.districtId })),
      ];
    }
    // Улицы берутся из адресов объектов района: общий справочник перечисляет
    // всю Москву, и выбор чужой улицы давал бы пустую карту.
    return [
      { id: null, name: 'Весь район', meta: 'без улицы', current: !f.streetId },
      ...streetsOfDistrict(f.districtId).map((item) => ({
        id: item.id,
        name: item.name,
        current: item.id === f.streetId,
      })),
    ];
  }

  function applyScope(level, id) {
    if (level === 'city') return onAction({ type: 'resetScope' });
    if (level === 'okrug') return onAction({ type: 'setScope', filters: { okrugId: id, districtId: null, streetId: null } });
    if (level === 'district') return onAction({ type: 'setScope', filters: { districtId: id, streetId: null } });
    return onAction({ type: 'setScope', filters: { streetId: id } });
  }

  function openScopeMenu(anchor, level) {
    if (scopeMenu?.dataset.level === level) return hideScopeMenu();
    hideScopeMenu();

    const options = scopeOptions(level);
    scopeMenu = el('div.dropdown.scope__menu', { dataset: { level } },
      options.map((option) =>
        el('div.dropdown__item', {
          class: option.current ? 'is-selected' : '',
          onclick: () => {
            hideScopeMenu();
            applyScope(level, option.id === 'reset' ? null : option.id);
          },
        }, [
          el('span', { text: option.name, title: option.name }),
          option.meta ? el('span.dropdown__meta', { text: option.meta }) : null,
        ].filter(Boolean))));

    const rect = anchor.getBoundingClientRect();
    scopeMenu.style.left = `${Math.min(rect.left, window.innerWidth - 268)}px`;
    scopeMenu.style.top = `${rect.bottom + 6}px`;
    document.body.append(scopeMenu);
    scopeDismiss = onDismiss(scopeMenu, (event) => {
      if (event.type === 'pointerdown' && anchor.contains(event.target)) return;
      hideScopeMenu();
    });
  }

  // Свёрнутая панель оставляет узкую полосу со стрелкой: закрытая наглухо,
  // она возвращалась только выбором объекта на карте — вернуть её вручную
  // было нечем.
  const rail = el('button.inspector__rail', { type: 'button', title: 'Развернуть панель' }, [
    icon('chevronLeft'),
    el('span.inspector__railname', { text: 'Сведения' }),
  ]);

  const node = el('aside.inspector', null, [
    rail,
    el('div.inspector__head', null, [
      el('div.inspector__titles', null, [titleNode, subNode]),
      resetBtn,
      closeBtn,
    ]),
    scopeNode,
    tabsNode,
    bodyNode,
  ]);

  const toggle = () => setState({ ui: { inspectorOpen: !getState().ui.inspectorOpen } }, ['ui']);
  closeBtn.addEventListener('click', toggle);
  rail.addEventListener('click', toggle);

  function update() {
    const state = getState();
    const ctx = buildContext(state);

    renderScope(state);
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

    // Раскрытие строки ресурса перерисовывает только тело панели и не сбрасывает
    // прокрутку: иначе список уезжал бы к началу на каждой стрелке.
    rerenderBody = () => mount(bodyNode, renderTab(buildContext(getState()), activeTab, onAction));
    mount(bodyNode, renderTab(ctx, activeTab, onAction));
    bodyNode.scrollTop = 0;

    const scoped = Boolean(state.filters.okrugId || state.filters.districtId || state.filters.streetId || state.customArea);
    resetBtn.disabled = !scoped;
    resetBtn.style.opacity = scoped ? '1' : '0.45';
    resetBtn.style.cursor = scoped ? 'pointer' : 'default';
  }

  update();
  return { node, update };
}

/**
 * Вкладки паспорта объекта для всплывающей карточки на карте. Панель сведений
 * отвечает за территорию, поэтому паспорт живёт рядом с самим объектом.
 */
export function objectCardTabs(feature, onAction) {
  const ctx = { kind: 'object', feature };
  return TABS.object.map((tab) => ({
    id: tab.id,
    name: tab.name,
    render: () => renderObject(ctx, tab.id, onAction),
  }));
}

/**
 * Контекст панели: территория, заданная в блоке «Территория» или выбранная на
 * карте. Объект сюда не попадает — его паспорт открывается карточкой.
 */
function buildContext(state) {
  const f = state.filters;
  const filter = filterFromState(state);

  if (state.customArea && f.customArea) {
    const inside = districtsInPolygon(state.customArea);
    const ids = new Set(inside.map((d) => d.id));
    const stats = statsFor({ ...filter, districtIds: ids, okrugIds: null });
    return {
      kind: 'area',
      title: 'Произвольная область',
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

  if (f.districtId) {
    const district = districtById.get(f.districtId);
    if (district) {
      const stats = statsFor({ ...filter, districtIds: new Set([district.id]), okrugIds: null });
      return {
        kind: 'district',
        // Заголовок называет территорию, подзаголовок — её вид: панель читается
        // одинаково для города, округа, района и произвольной области.
        title: district.name,
        subtitle: `Район · ${okrugById.get(district.okrugId)?.name || district.okrugCode}`,
        district,
        stats,
        areaKm2: district.areaKm2,
        state,
        filter,
      };
    }
  }

  if (f.okrugId) {
    const okrug = okrugById.get(f.okrugId);
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

    group('bolt', 'Ресурсы', formatInt(sumResources(s)), RESOURCES.flatMap((resource) => resourceRow(resource, s))),

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
      el('span', { text: 'Отчёт' }),
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
    ...RESOURCES.flatMap((resource) => resourceRow(resource, s)),
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

  // «Показать объекты» здесь нет: перевод карты к территории делает кнопка
  // «Показать на карте» в блоке «Территория» — это одно и то же действие.
  nodes.push(
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
      el('span', { text: 'Отчёт' }),
    ]),
  );

  // Нарисованную область можно снять там же, где по ней смотрят сводку.
  if (ctx.kind === 'area') {
    nodes.push(
      el('button.btn', { type: 'button', onclick: () => onAction({ type: 'clearArea' }) }, [
        icon('close'),
        el('span', { text: 'Сбросить область' }),
      ]),
    );
  }

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

/**
 * Раскрытые строки ресурсов. Состояние живёт в модуле, а не в общем
 * хранилище: это способ смотреть, а не настройка, — переживать перезагрузку
 * ему не нужно, а через setState каждая стрелка вызывала бы перерисовку карты.
 */
const openResources = new Set();
let rerenderBody = () => {};

/**
 * Строка ресурса с раскрытием до состава по типам объектов.
 *
 * Общий разрез byType на этот вопрос не отвечает: тепловые пункты и
 * подстанции попадают в один столбец «Преобразование», и понять, из чего
 * состоят 51 620 объектов теплоснабжения, по нему нельзя.
 */
function resourceRow(resource, stats) {
  const total = stats.byResource[resource.id] || 0;
  const open = openResources.has(resource.id);
  const share = stats.total ? Math.round((total / stats.total) * 100) : 0;

  const row = el('button.resrow', {
    type: 'button',
    class: open ? 'is-open' : '',
    title: open ? 'Свернуть состав' : 'Показать состав по типам объектов',
    onclick: () => {
      if (open) openResources.delete(resource.id);
      else openResources.add(resource.id);
      rerenderBody();
    },
  }, [
    resourceBadge(resource),
    el('span.resrow__name', { text: resource.name, title: resource.name }),
    el('span.resrow__num', { text: formatInt(total) }),
    el('span.resrow__pct', { text: `${share} %` }),
    el('span.resrow__chev', null, icon('chevronDown', { size: 14, cls: 'icon icon--sm' })),
  ]);

  if (!open) return [row];

  const byType = stats.byResourceType?.[resource.id] || {};
  const types = typesForResource(resource.id)
    .map((type) => ({ type, count: byType[type.id] || 0 }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);

  const body = el('div.restypes', null,
    types.length
      ? types.map(({ type, count }) =>
          el('div.restypes__row', null, [
            el('span', { text: type.plural, title: type.plural }),
            el('span.restypes__num', { text: formatInt(count) }),
          ]))
      : el('div.restypes__row', null, [el('span', { text: 'Объектов этого ресурса в выборке нет' })]));

  return [row, body];
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
