/** Левая панель фильтров. */

import { el, mount, onDismiss } from '../utils/dom.js';
import { toast } from './toast.js';
import { icon, resourceBadge } from './icons.js';
import { createCheck, createSelect } from './select.js';
import { donut } from './donut.js';
import { promptDialog } from './dialog.js';
import { getState, resetFilters, setState, toggleInFilter } from '../state.js';
import { ORGANIZATIONS, RESOURCES, STATUSES, organizationsForResources, typesForResource } from '../data/catalog.js';
import { ORG_BY_ID, incidents, statsFor } from '../data/model.js';
import { RESOURCE_BY_ID, STATUS_BY_ID, TYPE_BY_ID } from '../data/catalog.js';
import { allPresets, deletePreset, describeFilters, savePreset } from '../data/presets.js';
import { formatInt, formatPercent, pluralRu } from '../utils/format.js';

export function createFilters({ onChange }) {
  const body = el('div.sidebar__body');
  const toggleBtn = el('button.sidebar__title', { type: 'button' }, [
    icon('chevronLeft'),
    el('span', { text: 'Фильтры' }),
  ]);
  const resetBtn = el('button.sidebar__reset', { type: 'button', text: 'Сбросить все' });
  // Свёрнутая панель — узкая полоса, поэтому название идёт вертикально, а
  // счётчик показывает, что фильтры под ней всё ещё действуют.
  const railCount = el('span.sidebar__railcount');
  const rail = el('button.sidebar__rail', { type: 'button', title: 'Развернуть фильтры' }, [
    railCount,
    el('span.sidebar__railname', { text: 'Фильтры' }),
  ]);
  const node = el('aside.sidebar', null, [
    el('div.sidebar__head', null, [toggleBtn, resetBtn]),
    rail,
    body,
  ]);

  const toggleSidebar = () => {
    setState({ ui: { sidebarCollapsed: !getState().ui.sidebarCollapsed } }, ['ui']);
    syncCollapsed();
  };
  toggleBtn.addEventListener('click', toggleSidebar);
  rail.addEventListener('click', toggleSidebar);

  /** Подписи и счётчик свёрнутой панели. */
  function syncCollapsed() {
    const collapsed = getState().ui.sidebarCollapsed;
    toggleBtn.title = collapsed ? 'Развернуть фильтры' : 'Свернуть фильтры';
    node.classList.toggle('is-collapsed', collapsed);
    const active = countActive(getState().filters);
    railCount.textContent = active ? String(active) : '';
    railCount.hidden = !active;
  }
  resetBtn.addEventListener('click', () => {
    // Сброс возвращает и карту: иначе после отбора по району остаёшься на его
    // масштабе, хотя фильтра по нему уже нет.
    resetFilters();
    onChange({ flyTo: { kind: 'city' } });
  });

  // --- Шаблоны поиска ---------------------------------------------------
  // Шаблоны нужны не в каждом сеансе, поэтому список спрятан за подписью,
  // а сохранение вынесено на звёздочку рядом с ней.
  const presetLabel = el('button.presetbar__label', { type: 'button' }, [
    el('span', { text: 'Шаблоны' }),
    el('span.presetbar__badge', { hidden: true }),
    icon('chevronDown', { size: 13 }),
  ]);
  const starBtn = el('button.presetbar__star', {
    type: 'button',
    title: 'Сохранить текущие фильтры как шаблон',
    'aria-label': 'Сохранить текущие фильтры как шаблон',
  }, icon('star', { size: 15 }));
  const presetBar = el('div.presetbar', null, [presetLabel, starBtn]);

  let presetMenu = null;
  let presetDismiss = null;

  function closePresetMenu() {
    presetMenu?.remove();
    presetMenu = null;
    presetDismiss?.();
    presetDismiss = null;
    presetLabel.classList.remove('is-open');
  }

  function applyPreset(preset) {
    // Шаблон задаёт, что искать, и не трогает территориальный охват.
    setState(
      {
        filters: {
          resources: [...preset.filters.resources],
          typesByResource: { ...preset.filters.typesByResource },
          statuses: [...preset.filters.statuses],
          orgs: [...preset.filters.orgs],
        },
      },
      ['filters'],
    );
    onChange();
  }

  function openPresetMenu() {
    if (presetMenu) return closePresetMenu();
    const dictionaries = presetDictionaries();
    const active = activePreset();
    const presets = allPresets();
    presetMenu = el('div.presetmenu', null, [
      el('div.presetmenu__title', { text: 'Шаблоны поиска' }),
      ...presets.map((preset) => {
        const row = el('div.presetmenu__row', { class: preset.id === active?.id ? 'is-active' : '' }, [
          el('button.presetmenu__pick', { type: 'button' }, [
            el('span.presetmenu__name', { text: preset.name }),
            el('span.presetmenu__hint', {
              text: preset.hint || describeFilters(preset.filters, dictionaries),
            }),
          ]),
          preset.builtin
            ? null
            : el('button.presetmenu__del', {
                type: 'button',
                title: 'Удалить шаблон',
                'aria-label': `Удалить шаблон «${preset.name}»`,
              }, icon('close', { size: 13 })),
        ].filter(Boolean));
        row.querySelector('.presetmenu__pick').addEventListener('click', () => {
          closePresetMenu();
          applyPreset(preset);
        });
        row.querySelector('.presetmenu__del')?.addEventListener('click', () => {
          deletePreset(preset.id);
          toast(`Шаблон «${preset.name}» удалён`, { kind: 'ok' });
          closePresetMenu();
          update();
        });
        return row;
      }),
      presets.length ? null : el('div.presetmenu__empty', { text: 'Сохранённых шаблонов нет' }),
      el('div.presetmenu__foot', {
        text: 'Шаблон меняет ресурсы, типы, организации и состояние — территория остаётся прежней',
      }),
    ].filter(Boolean));
    presetBar.append(presetMenu);
    presetLabel.classList.add('is-open');
    presetDismiss = onDismiss(presetMenu, (event) => {
      // Подпись исключаем только для указателя: её клик и так переключает
      // список. По Escape закрываем всегда — фокус после клика на подписи.
      if (event.type === 'pointerdown' && presetLabel.contains(event.target)) return;
      closePresetMenu();
    });
  }

  function openSaveDialog() {
    closePresetMenu();
    const active = activePreset();
    const editing = active && !active.builtin;
    promptDialog({
      title: editing ? 'Изменить шаблон' : 'Новый шаблон поиска',
      subtitle: describeFilters(getState().filters, presetDictionaries()),
      label: 'Название шаблона',
      value: editing ? active.name : '',
      placeholder: 'Например, «Аварийные ЦТП»',
      onConfirm: (name) => {
        const saved = savePreset(name, getState().filters);
        if (saved) {
          toast(`Шаблон «${saved.name}» сохранён`, { kind: 'ok' });
          update();
        } else {
          toast('Не удалось сохранить шаблон: браузер запретил хранение данных', { kind: 'warn' });
        }
      },
    });
  }

  presetLabel.addEventListener('click', openPresetMenu);
  starBtn.addEventListener('click', openSaveDialog);

  // Выбор территории живёт в строке охвата правой панели: она видна всегда,
  // а отдельный блок с тремя списками дублировал её и занимал полпанели.

  // --- Ресурс с вложенными типами объектов ------------------------------
  //
  // Отдельного блока «Тип объекта» больше нет: типы зависят от ресурса
  // (тепловые пункты бывают только в теплоснабжении, подстанции — только
  // в электроснабжении), поэтому выбираются внутри него. При включении
  // ресурса отмечаются все его типы, снятие последнего выключает ресурс.

  /** Все типы ресурса — с ними ресурс включается. */
  const allTypeIds = (resourceId) => typesForResource(resourceId).map((type) => type.id);

  function selectedTypes(resourceId) {
    const map = getState().filters.typesByResource;
    return map[resourceId] || [];
  }

  function toggleResource(resourceId) {
    const f = getState().filters;
    const isOn = f.resources.includes(resourceId);
    const nextMap = { ...f.typesByResource };

    if (isOn) {
      delete nextMap[resourceId];
    } else {
      nextMap[resourceId] = allTypeIds(resourceId);
    }
    setState(
      {
        filters: {
          resources: isOn ? f.resources.filter((id) => id !== resourceId) : [...f.resources, resourceId],
          typesByResource: nextMap,
        },
      },
      ['filters'],
    );
    syncOrgOptions();
    onChange();
  }

  function toggleType(resourceId, typeId) {
    const f = getState().filters;
    const current = f.typesByResource[resourceId] || allTypeIds(resourceId);
    const next = current.includes(typeId) ? current.filter((id) => id !== typeId) : [...current, typeId];
    const nextMap = { ...f.typesByResource };

    if (!next.length) {
      // Ресурс без единого типа показывать нечем — снимаем его целиком.
      delete nextMap[resourceId];
      setState(
        { filters: { resources: f.resources.filter((id) => id !== resourceId), typesByResource: nextMap } },
        ['filters'],
      );
    } else {
      nextMap[resourceId] = next;
      setState({ filters: { typesByResource: nextMap } }, ['filters']);
    }
    syncOrgOptions();
    onChange();
  }

  const resourceRows = RESOURCES.map((resource) => {
    const check = createCheck({
      label: resource.name,
      prefix: resourceBadge(resource),
      onToggle: () => toggleResource(resource.id),
    });
    const typeChecks = typesForResource(resource.id).map((type) =>
      createCheck({
        label: type.name,
        onToggle: () => toggleType(resource.id, type.id),
      }),
    );
    const typesNode = el('div.resgroup__types', { hidden: true }, typeChecks.map((c) => c.node));
    return {
      resource,
      check,
      typeChecks,
      typesNode,
      node: el('div.resgroup', null, [check.node, typesNode]),
    };
  });

  const resourceSection = section('Ресурс и типы объектов', [
    el('div.field__label', { text: 'Основной ресурс', style: { marginBottom: '2px' } }),
    ...resourceRows.map((row) => row.node),
  ]);

  // --- Организация / РСО ------------------------------------------------
  const orgSelect = createSelect({
    placeholder: 'Выберите из списка',
    multiple: true,
    options: ORGANIZATIONS.map((o) => ({ id: o.id, name: o.name })),
    onChange: (value) => {
      setState({ filters: { orgs: value || [] } }, ['filters']);
      onChange();
    },
  });
  const orgSection = section('Организация / РСО', [
    el('div.hint', { text: 'Список зависит от выбранного ресурса' }),
    orgSelect.node,
  ]);

  // --- Состояние объектов и события -------------------------------------
  //
  // Отбор по состоянию и разбор состояний — один и тот же вопрос, заданный с
  // двух сторон: «что показать» и «сколько чего». Держать их разными блоками
  // значило бы заставлять сверять два списка одних и тех же четырёх значений.
  const statusChecks = STATUSES.map((status) =>
    createCheck({
      label: status.name,
      prefix: el('span.legend__swatch', { style: { background: status.color } }),
      onToggle: () => {
        toggleInFilter('statuses', status.id);
        onChange();
      },
    }),
  );

  // Разбор: всё, что не «в работе». Именно эти объекты требуют действия,
  // и их доля друг в друге важнее доли в реестре.
  const REVIEW_STATUSES = STATUSES.filter((status) => status.id !== 'ok');
  const reviewSlot = el('div.review');

  // Подсветка событий ничего не фильтрует — она помечает территории, где есть
  // открытые события, поэтому стоит отдельной строкой под разбором.
  const incidentCheck = createCheck({
    label: 'Подсветить события на карте',
    prefix: el('span.legend__swatch', { style: { background: 'var(--st-alert)' } }),
    meta: formatInt(incidents.length),
    onToggle: () => {
      setState({ ui: { incidents: !getState().ui.incidents } }, ['ui', 'map']);
      onChange();
    },
  });
  const incidentListBtn = el('button.btn.btn--link.fsection__link', {
    type: 'button',
    onclick: () => onChange({ action: { type: 'openIncidents', scope: { title: 'Открытые события · Москва' } } }),
  }, [icon('list', { size: 14, cls: 'icon icon--sm' }), el('span', { text: 'Показать все события списком' })]);

  const statusSection = section('Состояние объектов', [
    ...statusChecks.map((c) => c.node),
    reviewSlot,
    incidentCheck.node,
    el('div.hint.review__hint', { text: 'Восклицательный знак у округа приближает карту к районам, требующим внимания' }),
    incidentListBtn,
  ]);

  /**
   * Кольцо разбора: сколько объектов охвата не в работе и из чего это
   * складывается. Щелчок по доле включает отбор по этому состоянию —
   * диаграмма и флажки выше показывают одно и то же.
   */
  function renderReview(stats, active) {
    const items = REVIEW_STATUSES.map((status) => ({
      name: status.name,
      value: stats.byStatus[status.id] || 0,
      color: status.color,
      active: active.includes(status.id),
      onClick: () => {
        toggleInFilter('statuses', status.id);
        onChange();
      },
    }));
    const total = items.reduce((acc, item) => acc + item.value, 0);

    // В центре кольца — доля в реестре, под ним — абсолютное число: одно и то
    // же значение в двух местах ничего не добавляет.
    mount(reviewSlot, [
      el('div.review__head', null, [el('span', { text: 'Требует разбора' })]),
      donut(items, {
        total: stats.total ? formatPercent((total / stats.total) * 100) : '—',
        label: 'РЕЕСТРА',
        size: 104,
        thickness: 15,
        caption: el('div.review__caption', null, [
          el('span.review__value', { text: formatInt(total) }),
          el('span.review__unit', {
            text: pluralRu(total, 'объект требует внимания', 'объекта требуют внимания', 'объектов требуют внимания'),
          }),
        ]),
      }),
    ]);
  }

  // Территория живёт в правой панели: она задаёт охват сведений, которые там
  // же и показываются, — а слева остаётся отбор объектов.
  mount(body, [presetBar, resourceSection.node, orgSection.node, statusSection.node]);

  /** Совпадает ли текущий набор фильтров с каким-либо шаблоном. */
  function sameSet(a, b) {
    return a.length === b.length && a.every((value) => b.includes(value));
  }

  /** Совпадают ли наборы типов по каждому ресурсу. */
  function sameTypeMap(a, b) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (!sameSet(a[key] || [], b[key] || [])) return false;
    }
    return true;
  }

  function activePreset() {
    const f = getState().filters;
    const matches = (preset) =>
      sameSet(preset.filters.resources, f.resources) &&
      sameTypeMap(preset.filters.typesByResource, f.typesByResource) &&
      sameSet(preset.filters.statuses, f.statuses) &&
      sameSet(preset.filters.orgs, f.orgs);
    const presets = allPresets();
    // Свой шаблон важнее встроенного с тем же набором: пользователь сохранил
    // его осознанно и ждёт увидеть именно своё название.
    return presets.find((p) => !p.builtin && matches(p)) || presets.find(matches) || null;
  }

  function presetDictionaries() {
    return {
      resourceName: (id) => RESOURCE_BY_ID[id]?.short || id,
      typeName: (id) => TYPE_BY_ID[id]?.name || id,
      statusName: (id) => STATUS_BY_ID[id]?.name || id,
      orgName: (id) => ORG_BY_ID[id]?.name || id,
    };
  }

  function syncPresets() {
    const active = activePreset();
    // Подпись показывает действующий шаблон: иначе непонятно, почему набор
    // фильтров именно такой.
    const badge = presetBar.querySelector('.presetbar__badge');
    badge.hidden = !active;
    badge.textContent = active ? active.name : '';
    badge.title = active ? active.name : '';
    starBtn.classList.toggle('is-on', Boolean(active && !active.builtin));
    starBtn.title = active && !active.builtin
      ? `Шаблон «${active.name}» — сохранить изменения`
      : 'Сохранить текущие фильтры как шаблон';
    if (presetMenu) {
      // Открытое меню перестраивается, чтобы отметка совпадала с фильтрами.
      closePresetMenu();
      openPresetMenu();
    }
  }

  function syncOrgOptions() {
    const { resources, orgs } = getState().filters;
    const available = organizationsForResources(resources);
    const availableIds = available.map((o) => o.id);
    const nextOrgs = orgs.filter((id) => availableIds.includes(id));
    if (nextOrgs.length !== orgs.length) {
      setState({ filters: { orgs: nextOrgs } }, ['filters']);
    }
    orgSelect.set({ options: available.map((o) => ({ id: o.id, name: o.name })), value: nextOrgs });
  }

  function update() {
    const state = getState();
    const f = state.filters;

    // Доля объектов ресурса в текущем территориальном охвате.
    const scopeStats = statsFor({
      districtIds: f.districtId ? new Set([f.districtId]) : null,
      okrugIds: !f.districtId && f.okrugId ? new Set([f.okrugId]) : null,
    });

    for (const row of resourceRows) {
      const count = scopeStats.byResource[row.resource.id] || 0;
      const share = scopeStats.total ? (count / scopeStats.total) * 100 : 0;
      const on = f.resources.includes(row.resource.id);
      const chosen = selectedTypes(row.resource.id);
      const all = allTypeIds(row.resource.id);

      row.check.update(on, count ? formatPercent(share) : '—');
      // Частичный выбор типов помечается отдельно: галочка означала бы «все».
      row.check.node.classList.toggle('is-partial', on && chosen.length > 0 && chosen.length < all.length);
      row.typesNode.hidden = !on;
      row.typeChecks.forEach((check, i) => check.update(chosen.includes(all[i])));
    }

    syncOrgOptions();
    STATUSES.forEach((status, i) =>
      statusChecks[i].update(f.statuses.includes(status.id), formatInt(scopeStats.byStatus[status.id] || 0)),
    );
    renderReview(scopeStats, f.statuses);
    incidentCheck.update(getState().ui.incidents);

    // В макете «Сбросить все» присутствует всегда; при пустом фильтре — приглушено.
    syncPresets();

    const active = countActive(f);
    resetBtn.disabled = active === 0;
    resetBtn.style.opacity = active ? '1' : '0.45';
    resetBtn.style.cursor = active ? 'pointer' : 'default';
    syncCollapsed();
  }

  update();
  return { node, update };
}

function countActive(f) {
  return (
    (f.okrugId ? 1 : 0) +
    (f.districtId ? 1 : 0) +
    (f.streetId ? 1 : 0) +
    (f.customArea ? 1 : 0) +
    f.resources.length +
    f.orgs.length +
    Object.values(f.typesByResource).reduce((acc, list) => acc + list.length, 0) +
    f.statuses.length
  );
}

function section(title, children) {
  const chev = icon('chevronUp', { cls: 'icon fsection__chev' });
  const bodyNode = el('div.fsection__body', null, children);
  const node = el('section.fsection', null, [
    el('button.fsection__head', { type: 'button' }, [el('span', { text: title }), chev]),
    bodyNode,
  ]);
  node.querySelector('.fsection__head').addEventListener('click', () => {
    node.classList.toggle('is-collapsed');
  });
  return { node };
}
