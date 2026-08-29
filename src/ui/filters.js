/** Левая панель фильтров. */

import { el, mount } from '../utils/dom.js';
import { icon, resourceBadge } from './icons.js';
import { createCheck, createSelect } from './select.js';
import { getState, resetFilters, setState, toggleInFilter } from '../state.js';
import { OBJECT_TYPES, ORGANIZATIONS, RESOURCES, STATUSES, organizationsForResources } from '../data/catalog.js';
import { OKRUG_BY_ID, districtById, statsFor, streets, territories } from '../data/model.js';
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

  // --- Территория -------------------------------------------------------
  const okrugSelect = createSelect({
    placeholder: 'Выберите округ',
    options: territories.map((o) => ({ id: o.id, name: `${o.name} (${o.code})` })),
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

  // --- Ресурс -----------------------------------------------------------
  const resourceChecks = RESOURCES.map((resource) =>
    createCheck({
      label: resource.name,
      prefix: resourceBadge(resource),
      onToggle: () => {
        toggleInFilter('resources', resource.id);
        syncOrgOptions();
        onChange();
      },
    }),
  );
  const resourceSection = section('Ресурс', [
    el('div.field__label', { text: 'Основной ресурс', style: { marginBottom: '2px' } }),
    ...resourceChecks.map((c) => c.node),
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

  // --- Тип объекта ------------------------------------------------------
  const allTypesCheck = createCheck({
    label: 'Все объекты',
    onToggle: () => {
      const has = getState().filters.types.length > 0;
      setState({ filters: { types: has ? [] : [] } }, ['filters']);
      if (has) onChange();
    },
  });
  const typeChecks = OBJECT_TYPES.map((type) =>
    createCheck({
      label: type.name,
      onToggle: () => {
        toggleInFilter('types', type.id);
        onChange();
      },
    }),
  );
  const typeSection = section('Тип объекта', [allTypesCheck.node, ...typeChecks.map((c) => c.node)]);

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

  mount(body, [territorySection.node, resourceSection.node, orgSection.node, typeSection.node, statusSection.node]);

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
    RESOURCES.forEach((resource, i) => {
      const count = scopeStats.byResource[resource.id] || 0;
      const share = scopeStats.total ? (count / scopeStats.total) * 100 : 0;
      resourceChecks[i].update(f.resources.includes(resource.id), count ? formatPercent(share) : '—');
    });

    syncOrgOptions();

    allTypesCheck.update(f.types.length === 0);
    OBJECT_TYPES.forEach((type, i) => typeChecks[i].update(f.types.includes(type.id)));
    STATUSES.forEach((status, i) => statusChecks[i].update(f.statuses.includes(status.id)));

    // В макете «Сбросить все» присутствует всегда; при пустом фильтре — приглушено.
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
    f.types.length +
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
