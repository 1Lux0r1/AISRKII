/**
 * Модальное окно отчёта по территории.
 *
 * Форма отчёта ещё не спроектирована, поэтому окно показывает охват и
 * действующие условия отбора — то, из чего отчёт будет построен, — и прямо
 * говорит, что сама форма появится позже. Заглушка, которая делает вид, что
 * отчёт сформирован, вводила бы в заблуждение.
 */

import { el, mount } from '../utils/dom.js';
import { icon } from './icons.js';
import { RESOURCE_BY_ID, STATUS_BY_ID, TYPE_BY_ID } from '../data/catalog.js';
import { ORG_BY_ID } from '../data/model.js';
import { formatArea, formatInt, formatKm } from '../utils/format.js';

export function createReportModal() {
  const titleNode = el('div.modal__title');
  const subtitleNode = el('div.modal__sub');
  const bodyNode = el('div.modal__body');
  const closeBtn = el('button.modal__close', { type: 'button', title: 'Закрыть' }, icon('close'));
  closeBtn.addEventListener('click', () => close());

  const dialog = el('div.modal.modal--report', { role: 'dialog', 'aria-modal': 'true' }, [
    el('div.modal__head', null, [
      el('div', { style: { flex: '1', minWidth: '0' } }, [titleNode, subtitleNode]),
      closeBtn,
    ]),
    bodyNode,
    el('div.modal__foot', null, [
      el('button.btn.btn--ghost', { type: 'button', text: 'Закрыть', onclick: () => close() }),
    ]),
  ]);

  const overlay = el('div.modal-overlay', { hidden: true }, dialog);
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) close();
  });
  document.body.append(overlay);

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  }

  /** @param {{ scope: object, stats: object, filters: object, period: string }} ctx */
  function open({ scope, stats, filters, areaKm2 }) {
    titleNode.textContent = 'Отчёт по территории';
    subtitleNode.textContent = scope.label;

    const conditions = describeFilters(filters);
    mount(bodyNode, [
      el('div.subhead', { text: 'Охват отчёта' }),
      row('Территория', scope.label),
      areaKm2 ? row('Площадь', formatArea(areaKm2)) : null,
      row('Объектов в выборке', formatInt(stats.total)),
      row('Протяжённость сетей', formatKm(stats.networkKm)),
      row('Организаций', String(Object.values(stats.byOrg).filter((v) => v > 0).length)),

      el('div.subhead', { text: 'Условия отбора' }),
      ...(conditions.length
        ? conditions.map(([label, value]) => row(label, value))
        : [el('div.hint', { text: 'Фильтры не заданы — в отчёт попадут все объекты территории' })]),

      el('div.callout.callout--wait', null, [
        icon('clock'),
        el('span', {
          text: 'Форма отчёта в разработке: состав разделов и выгрузка появятся позже. Здесь показано, по какому охвату он будет построен.',
        }),
      ]),
    ].filter(Boolean));

    overlay.hidden = false;
    document.addEventListener('keydown', onKeyDown, true);
    closeBtn.focus();
  }

  function close() {
    overlay.hidden = true;
    document.removeEventListener('keydown', onKeyDown, true);
  }

  return {
    open,
    close,
    get isOpen() {
      return !overlay.hidden;
    },
  };
}

function row(label, value) {
  return el('div.row', null, [
    el('span.row__label', { text: label }),
    el('span.row__value', { text: value, title: value }),
  ]);
}

/** Действующие условия отбора человеческим языком. */
function describeFilters(filters) {
  const rows = [];
  if (filters.resources.length) {
    rows.push(['Ресурсы', filters.resources.map((id) => RESOURCE_BY_ID[id]?.short || id).join(', ')]);
  }
  for (const [resourceId, types] of Object.entries(filters.typesByResource || {})) {
    if (!types?.length) continue;
    rows.push([
      `Типы · ${RESOURCE_BY_ID[resourceId]?.short || resourceId}`,
      types.map((id) => TYPE_BY_ID[id]?.name || id).join(', '),
    ]);
  }
  if (filters.orgs.length) {
    rows.push(['Организации', filters.orgs.map((id) => ORG_BY_ID[id]?.name || id).join(', ')]);
  }
  if (filters.statuses.length) {
    rows.push(['Состояние', filters.statuses.map((id) => STATUS_BY_ID[id]?.name || id).join(', ')]);
  }
  return rows;
}
