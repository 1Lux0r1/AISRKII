/** Левая панель фильтров. */

import { el, mount, onDismiss } from '../utils/dom.js';
import { toast } from './toast.js';
import { icon, resourceBadge } from './icons.js';
import { createCheck, createSelect } from './select.js';
import { promptDialog } from './dialog.js';
import { getState, resetFilters, setState, toggleInFilter } from '../state.js';
import { ORGANIZATIONS, RESOURCES, STATUSES, organizationsForResources, typesForResource } from '../data/catalog.js';
import { OKRUG_BY_ID, ORG_BY_ID, districtById, statsFor, streets, territories } from '../data/model.js';
import { RESOURCE_BY_ID, STATUS_BY_ID, TYPE_BY_ID } from '../data/catalog.js';
import { allPresets, deletePreset, describeFilters, savePreset } from '../data/presets.js';
import { formatPercent } from '../utils/format.js';

export function createFilters({ onChange }) {
  const body = el('div.sidebar__body');
  const toggleBtn = el('button.sidebar__title', { type: 'button' }, [
    icon('chevronLeft'),
    el('span', { text: 'Фильтры' }),
  ]);
  const resetBtn = el('button.sidebar__reset', { type: 'button', text: 'Сбросить все' });
  const node = el('aside.sidebar', null, [
    el('div.sidebar__head', null, [toggleBtn, resetBtn]),
    body,
  ]);

  toggleBtn.addEventListener('click', () => {
    setState({ ui: { sidebarCollapsed: !getState().ui.sidebarCollapsed } }, ['ui']);
  });
  resetBtn.addEventListener('click', () => {
    resetFilters();
    onChange();
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
      if (presetLabel.contains(event.target)) return;
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

  // --- Территория -------------------------------------------------------
  const okrugSelect = createSelect({
    placeholder: 'Выберите округ',
    options: territories.map((o) => ({
      id: o.id,
      // Для ТиНАО в наборе границ нет геометрии — предупреждаем до выбора.
      name: `${o.name} (${o.code})${o.approximate ? ' — без контура' : ''}`,
    })),
    onChange: (value) => {
      setState({ filters: { okrugId: value, districtId: null } }, ['filters']);
      onChange({ flyTo: value ? { kind: 'okrug', id: value } : { kind: 'city' } });
    },
  });

  const districtSelect = createSelect({
    placeholder: 'Выберите район',
    options: [],
    disabled: true,
    onChange: (value) => {
      setState({ filters: { districtId: value } }, ['filters']);
      onChange({ flyTo: value ? { kind: 'district', id: value } : { kind: 'okrug', id: getState().filters.okrugId } });
    },
  });

  const streetSelect = createSelect({
    placeholder: 'Выберите улица / квартал',
    options: streets.map((s) => ({ id: s.id, name: s.name })),
    onChange: (value) => {
      setState({ filters: { streetId: value } }, ['filters']);
      onChange();
    },
  });

  const areaCheck = createCheck({
    label: 'Произвольная область на карте',
    onToggle: () => {
      const state = getState();
      const next = !state.filters.customArea;
      setState(
        {
          filters: { customArea: next },
          customArea: next ? state.customArea : null,
          ui: { tool: next ? 'area' : null },
        },
        ['filters', 'ui'],
      );
      onChange();
    },
  });

  const territorySection = section('Территория', [
    field('Округ', okrugSelect.node),
    field('Район', districtSelect.node),
    field('Улица / квартал', streetSelect.node),
    areaCheck.node,
  ]);

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

  // --- Состояние --------------------------------------------------------
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
  const statusSection = section('Состояние', statusChecks.map((c) => c.node));

  mount(body, [
    presetBar,
    territorySection.node,
    resourceSection.node,
    orgSection.node,
    statusSection.node,
  ]);

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

    okrugSelect.set({ value: f.okrugId });

    const okrug = f.okrugId ? OKRUG_BY_ID[f.okrugId] : null;
    const districtOptions = okrug
      ? (territories.find((o) => o.id === okrug.id)?.districts || []).map((d) => ({ id: d.id, name: d.name }))
      : [];
    districtSelect.set({
      options: districtOptions,
      value: f.districtId,
      disabled: !okrug,
    });
    streetSelect.set({ value: f.streetId });
    areaCheck.update(f.customArea);

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
    STATUSES.forEach((status, i) => statusChecks[i].update(f.statuses.includes(status.id)));

    // В макете «Сбросить все» присутствует всегда; при пустом фильтре — приглушено.
    syncPresets();

    const active = countActive(f);
    resetBtn.disabled = active === 0;
    resetBtn.style.opacity = active ? '1' : '0.45';
    resetBtn.style.cursor = active ? 'pointer' : 'default';
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

function field(label, control) {
  return el('div.field', null, [el('label.field__label', { text: label }), control]);
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
