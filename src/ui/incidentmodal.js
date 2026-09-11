/**
 * Модальное окно со списком открытых событий.
 *
 * Открывается с плашки округа (восклицательный знак), из подсветки района и
 * из панели отбора. Окно показывает весь перечень событий по городу, а вызов
 * может сузить его до округа или района — тогда это разбор конкретной
 * территории, а не новая настройка карты.
 */

import { el, mount } from '../utils/dom.js';
import { icon } from './icons.js';
import { createSelect } from './select.js';
import { formatInt, pluralRu } from '../utils/format.js';
import { RESOURCE_BY_ID } from '../data/catalog.js';
import { INCIDENT_KINDS } from '../data/incidents.js';
import { incidents, okrugById } from '../data/model.js';

const PAGE_SIZE = 12;
const KIND_BY_ID = Object.fromEntries(INCIDENT_KINDS.map((k) => [k.id, k]));

/** «14 ч назад» читается быстрее, чем дата с точностью до минуты. */
function ago(hours) {
  if (hours < 1) return 'меньше часа назад';
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.round(hours / 24);
  return `${days} сут. назад`;
}

export function createIncidentModal({ onFocus }) {
  let items = [];
  let filtered = [];
  let page = 0;
  let search = '';
  let okrugId = null;
  let kindId = null;

  const titleNode = el('div.modal__title');
  const subtitleNode = el('div.modal__sub');
  const countNode = el('div.modal__count');
  const bodyNode = el('div.modal__body');

  const searchInput = el('input.modal__search-input', {
    type: 'search',
    placeholder: 'Поиск по району, причине или номеру',
    'aria-label': 'Поиск по событиям',
  });
  searchInput.addEventListener('input', () => {
    search = searchInput.value.trim().toLowerCase();
    page = 0;
    renderRows();
  });

  const okrugSelect = createSelect({
    placeholder: 'Все округа',
    options: [...okrugById.values()].map((o) => ({ id: o.id, name: o.name })),
    onChange: (value) => {
      okrugId = value;
      page = 0;
      renderRows();
    },
  });

  const kindSelect = createSelect({
    placeholder: 'Все виды событий',
    options: INCIDENT_KINDS.map((k) => ({ id: k.id, name: k.name })),
    onChange: (value) => {
      kindId = value;
      page = 0;
      renderRows();
    },
  });

  const resetBtn = el('button.btn.btn--ghost.modal__reset', { type: 'button', text: 'Сбросить' });
  resetBtn.addEventListener('click', () => {
    search = '';
    okrugId = null;
    kindId = null;
    searchInput.value = '';
    okrugSelect.set({ value: null });
    kindSelect.set({ value: null });
    page = 0;
    renderRows();
  });

  const pagerLabel = el('span.pager__label');
  const prevBtn = el('button.pager__btn', { type: 'button', title: 'Предыдущая страница' }, icon('chevronLeft'));
  const nextBtn = el('button.pager__btn', { type: 'button', title: 'Следующая страница' }, icon('chevronRight'));
  prevBtn.addEventListener('click', () => {
    page = Math.max(0, page - 1);
    renderRows();
  });
  nextBtn.addEventListener('click', () => {
    page = Math.min(pageCount() - 1, page + 1);
    renderRows();
  });

  const closeBtn = el('button.modal__close', { type: 'button', title: 'Закрыть' }, icon('close'));
  closeBtn.addEventListener('click', () => close());

  const dialog = el('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Открытые события' }, [
    el('div.modal__head', null, [
      el('div', { style: { flex: '1', minWidth: '0' } }, [titleNode, subtitleNode]),
      closeBtn,
    ]),
    el('div.modal__filters', null, [
      el('div.modal__search', null, [icon('search', { size: 15 }), searchInput]),
      okrugSelect.node,
      kindSelect.node,
      resetBtn,
    ]),
    countNode,
    bodyNode,
    el('div.modal__foot', null, [el('div.pager', null, [prevBtn, pagerLabel, nextBtn])]),
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

  function pageCount() {
    return Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  }

  function renderRows() {
    filtered = items.filter((item) => {
      if (okrugId && item.okrugId !== okrugId) return false;
      if (kindId && item.kindId !== kindId) return false;
      if (!search) return true;
      return (
        item.districtName.toLowerCase().includes(search) ||
        item.title.toLowerCase().includes(search) ||
        item.id.toLowerCase().includes(search)
      );
    });
    if (page >= pageCount()) page = pageCount() - 1;

    countNode.textContent = filtered.length
      ? `Найдено ${formatInt(filtered.length)} из ${formatInt(items.length)}`
      : 'По заданным условиям событий нет';

    const slice = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

    if (!slice.length) {
      mount(bodyNode, el('div.empty', { text: 'Измените условия отбора или очистите поиск' }));
    } else {
      mount(bodyNode, [
        el('div.modal__row.modal__row--incident.modal__row--head', null, [
          el('span', { text: 'Номер' }),
          el('span', { text: 'Вид события' }),
          el('span', { text: 'Округ' }),
          el('span', { text: 'Район' }),
          el('span', { text: 'Ресурс' }),
          el('span', { text: 'Причина' }),
          el('span', { text: 'Открыто' }),
        ]),
        ...slice.map((item) => {
          const kind = KIND_BY_ID[item.kindId];
          const resource = RESOURCE_BY_ID[item.resourceId];
          const activate = () => {
            onFocus(item);
            close();
          };
          return el('div.modal__row.modal__row--incident', {
            tabindex: '0',
            title: 'Перейти к району события',
            onclick: activate,
            onkeydown: (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                activate();
              }
            },
          }, [
            el('span.modal__name', { text: item.id }),
            el('span', null, [
              el('span.badge', { style: { background: `${kind.color}1f`, color: kind.color } }, [
                el('span.badge__dot', { style: { background: kind.color } }),
                el('span', { text: kind.name }),
              ]),
            ]),
            el('span', { text: item.okrugCode }),
            el('span', { text: item.districtName, title: item.districtName }),
            el('span', null, [
              el('span.legend__swatch', { style: { background: resource.color, display: 'inline-block', marginRight: '6px' } }),
              el('span', { text: resource.short }),
            ]),
            el('span', { text: item.title, title: item.title }),
            el('span', { text: ago(item.openedHoursAgo) }),
          ]);
        }),
      ]);
    }

    pagerLabel.textContent = `${page + 1} / ${pageCount()}`;
    prevBtn.disabled = page === 0;
    nextBtn.disabled = page >= pageCount() - 1;
    bodyNode.scrollTop = 0;
  }

  /**
   * @param {{ okrugId?: string, districtId?: string, title?: string }} scope
   *   Пустой охват — все открытые события по городу.
   */
  function open(scope = {}) {
    items = incidents.filter((inc) => {
      if (scope.districtId && inc.districtId !== scope.districtId) return false;
      if (scope.okrugId && inc.okrugId !== scope.okrugId) return false;
      return true;
    });
    page = 0;
    search = '';
    searchInput.value = '';
    okrugId = null;
    kindId = null;
    okrugSelect.set({ value: null });
    kindSelect.set({ value: null });
    titleNode.textContent = scope.title || 'Открытые события';
    subtitleNode.textContent = `${formatInt(items.length)} ${pluralRu(items.length, 'событие', 'события', 'событий')} · щелчок по строке переводит карту к району`;
    overlay.hidden = false;
    document.addEventListener('keydown', onKeyDown, true);
    renderRows();
    searchInput.focus();
  }

  function close() {
    overlay.hidden = true;
    document.removeEventListener('keydown', onKeyDown, true);
    okrugSelect.close();
    kindSelect.close();
  }

  return {
    open,
    close,
    get isOpen() {
      return !overlay.hidden;
    },
  };
}
