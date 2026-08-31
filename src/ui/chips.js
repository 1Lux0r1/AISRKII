/** Строка активных фильтров под шапкой. */

import { el, mount } from '../utils/dom.js';
import { icon } from './icons.js';
import { getState, resetFilters, setState } from '../state.js';
import { RESOURCE_BY_ID, STATUS_BY_ID, TYPE_BY_ID, scaleForZoom, typesForResource } from '../data/catalog.js';
import { OKRUG_BY_ID, ORG_BY_ID, districtById, streets } from '../data/model.js';

export function createChips({ onChange }) {
  const node = el('div.chips');

  function chip(label, onRemove) {
    return el('div.chip', null, [
      el('span', { text: label }),
      onRemove
        ? el('button.chip__x', { type: 'button', title: 'Убрать фильтр', onclick: onRemove }, icon('close', { size: 12 }))
        : null,
    ]);
  }

  function update() {
    const state = getState();
    const f = state.filters;
    const chips = [];

    chips.push(chip(`Масштаб: ${scaleForZoom(state.map.zoom).name}`));

    if (f.okrugId) {
      chips.push(
        chip(`Округ: ${OKRUG_BY_ID[f.okrugId].name}`, () => {
          setState({ filters: { okrugId: null, districtId: null } }, ['filters']);
          onChange({ flyTo: { kind: 'city' } });
        }),
      );
    }
    if (f.districtId) {
      chips.push(
        chip(`Район: ${districtById.get(f.districtId)?.name || ''}`, () => {
          setState({ filters: { districtId: null } }, ['filters']);
          onChange({ flyTo: f.okrugId ? { kind: 'okrug', id: f.okrugId } : { kind: 'city' } });
        }),
      );
    }
    if (f.streetId) {
      chips.push(
        chip(`Улица: ${streets.find((s) => s.id === f.streetId)?.name || ''}`, () => {
          setState({ filters: { streetId: null } }, ['filters']);
          onChange();
        }),
      );
    }
    if (f.customArea) {
      chips.push(
        chip('Произвольная область', () => {
          setState({ filters: { customArea: false }, customArea: null, ui: { tool: null } }, ['filters', 'ui']);
          onChange();
        }),
      );
    }
    for (const id of f.resources) {
      chips.push(
        chip(`Ресурс: ${RESOURCE_BY_ID[id].name.toLowerCase()}`, () => {
          const next = { ...f.typesByResource };
          delete next[id];
          setState(
            { filters: { resources: f.resources.filter((v) => v !== id), typesByResource: next } },
            ['filters'],
          );
          onChange();
        }),
      );
    }
    for (const id of f.orgs) {
      chips.push(
        chip(ORG_BY_ID[id]?.name || id, () => {
          setState({ filters: { orgs: f.orgs.filter((v) => v !== id) } }, ['filters']);
          onChange();
        }),
      );
    }
    // Чип показывается, только когда у ресурса выбраны не все типы:
    // полный набор — это и есть «ресурс целиком», отдельная метка не нужна.
    for (const [resourceId, list] of Object.entries(f.typesByResource)) {
      const all = typesForResource(resourceId);
      if (list.length >= all.length) continue;
      const names = list.map((id) => TYPE_BY_ID[id]?.name.toLowerCase()).join(', ');
      chips.push(
        chip(`${RESOURCE_BY_ID[resourceId].short}: ${names}`, () => {
          const next = { ...f.typesByResource, [resourceId]: all.map((t) => t.id) };
          setState({ filters: { typesByResource: next } }, ['filters']);
          onChange();
        }),
      );
    }
    for (const id of f.statuses) {
      chips.push(
        chip(STATUS_BY_ID[id].name, () => {
          setState({ filters: { statuses: f.statuses.filter((v) => v !== id) } }, ['filters']);
          onChange();
        }),
      );
    }

    if (chips.length > 2) {
      chips.push(
        el('button.chip.chip--clear', {
          type: 'button',
          text: 'Сбросить все',
          onclick: () => {
            resetFilters();
            onChange({ flyTo: { kind: 'city' } });
          },
        }),
      );
    }

    mount(node, chips);
  }

  update();
  return { node, update };
}
