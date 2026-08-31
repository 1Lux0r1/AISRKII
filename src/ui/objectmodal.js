/**
 * Модальное окно со списком объектов.
 *
 * Открывается из карточки территории и из панели инструментов. Список уже
 * ограничен фильтрами карты; выпадающие списки и поиск внутри окна сужают
 * выборку дальше, не меняя состояние карты — это разбор конкретного набора,
 * а не новая настройка фильтра.
 */

import { el, mount } from '../utils/dom.js';
import { icon } from './icons.js';
import { OBJECT_TYPES, RESOURCES, RESOURCE_BY_ID, STATUSES, STATUS_BY_ID } from '../data/catalog.js';
import { createSelect } from './select.js';
import { formatInt } from '../utils/format.js';

const PAGE_SIZE = 12;

export function createObjectModal({ onSelect }) {
  let items = [];
  let filtered = [];
  let page = 0;
  let search = '';
  let resourceId = null;
  let typeId = null;
  let statusId = null;

  const titleNode = el('div.modal__title');
  const subtitleNode = el('div.modal__sub');
  const countNode = el('div.modal__count');
  const bodyNode = el('div.modal__body');

  const searchInput = el('input.modal__search-input', {
    type: 'search',
    placeholder: 'Поиск по адресу или наименованию',
    'aria-label': 'Поиск по адресу или наименованию',
  });
  searchInput.addEventListener('input', () => {
    search = searchInput.value.trim().toLowerCase();
    page = 0;
    renderRows();
  });

  const resourceSelect = createSelect({
    placeholder: 'Все ресурсы',
    options: RESOURCES.map((r) => ({ id: r.id, name: r.name })),
    onChange: (value) => {
      resourceId = value;
      page = 0;
      renderRows();
    },
  });

  const typeSelect = createSelect({
    placeholder: 'Все типы',
    options: OBJECT_TYPES.map((t) => ({ id: t.id, name: t.name })),
    onChange: (value) => {
      typeId = value;
      page = 0;
      renderRows();
    },
  });

  const statusSelect = createSelect({
    placeholder: 'Любое состояние',
    options: STATUSES.map((s) => ({ id: s.id, name: s.name })),
    onChange: (value) => {
      statusId = value;
      page = 0;
      renderRows();
    },
  });

  const resetBtn = el('button.btn.btn--ghost.modal__reset', { type: 'button', text: 'Сбросить' });
  resetBtn.addEventListener('click', () => {
    search = '';
    resourceId = null;
    typeId = null;
    statusId = null;
    searchInput.value = '';
    resourceSelect.set({ value: null });
    typeSelect.set({ value: null });
    statusSelect.set({ value: null });
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

  const dialog = el(
    'div.modal',
    { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Список объектов' },
    [
      el('div.modal__head', null, [
        el('div', { style: { flex: '1', minWidth: '0' } }, [titleNode, subtitleNode]),
        closeBtn,
      ]),
      el('div.modal__filters', null, [
        el('div.modal__search', null, [icon('search', { size: 15 }), searchInput]),
        resourceSelect.node,
        typeSelect.node,
        statusSelect.node,
        resetBtn,
      ]),
      countNode,
      bodyNode,
      el('div.modal__foot', null, [el('div.pager', null, [prevBtn, pagerLabel, nextBtn])]),
    ],
  );

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

  function applyFilters() {
    filtered = items.filter((item) => {
      if (resourceId && item.resourceId !== resourceId) return false;
      if (typeId && item.typeId !== typeId) return false;
      if (statusId && item.statusId !== statusId) return false;
      if (!search) return true;
      return (
        (item.address || '').toLowerCase().includes(search) ||
        (item.name || '').toLowerCase().includes(search)
      );
    });
  }

  function renderRows() {
    applyFilters();
    if (page >= pageCount()) page = pageCount() - 1;

    countNode.textContent = filtered.length
      ? `Найдено ${formatInt(filtered.length)} из ${formatInt(items.length)}`
      : 'По заданным условиям объектов нет';

    const slice = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

    if (!slice.length) {
      mount(bodyNode, el('div.empty', { text: 'Измените условия отбора или очистите поиск' }));
    } else {
      mount(bodyNode, [
        el('div.modal__row.modal__row--head', null, [
          el('span', { text: 'Наименование' }),
          el('span', { text: 'Тип' }),
          el('span', { text: 'Ресурс' }),
          el('span', { text: 'Организация' }),
          el('span', { text: 'Адрес' }),
          el('span', { text: 'Состояние' }),
        ]),
        ...slice.map((item) => {
          const resource = RESOURCE_BY_ID[item.resourceId];
          const status = STATUS_BY_ID[item.statusId];
          return el(
            'div.modal__row',
            {
              tabindex: '0',
              onclick: () => {
                onSelect(item);
                close();
              },
              onkeydown: (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(item);
                  close();
                }
              },
            },
            [
              el('span.modal__name', { text: item.name, title: item.name }),
              el('span', { text: item.typeName }),
              el('span', null, [
                el('span.legend__swatch', {
                  style: { background: resource.color, display: 'inline-block', marginRight: '6px' },
                }),
                el('span', { text: resource.short }),
              ]),
              el('span', { text: item.orgName, title: item.orgName }),
              el('span', { text: item.address || '—', title: item.address || '' }),
              el('span', null, [
                el('span.badge', { style: { background: `${status.color}1f`, color: status.color } }, [
                  el('span.badge__dot', { style: { background: status.color } }),
                  el('span', { text: status.name }),
                ]),
              ]),
            ],
          );
        }),
      ]);
    }

    pagerLabel.textContent = `${page + 1} / ${pageCount()}`;
    prevBtn.disabled = page === 0;
    nextBtn.disabled = page >= pageCount() - 1;
    bodyNode.scrollTop = 0;
  }

  function open(nextItems, { title, subtitle }) {
    items = nextItems;
    page = 0;
    titleNode.textContent = title;
    subtitleNode.textContent = subtitle || '';
    overlay.hidden = false;
    document.addEventListener('keydown', onKeyDown, true);
    renderRows();
    searchInput.focus();
  }

  function close() {
    overlay.hidden = true;
    document.removeEventListener('keydown', onKeyDown, true);
    resourceSelect.close();
    typeSelect.close();
    statusSelect.close();
  }

  return {
    open,
    close,
    get isOpen() {
      return !overlay.hidden;
    },
  };
}
