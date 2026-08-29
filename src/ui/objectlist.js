/** Нижняя панель со списком объектов и постраничной навигацией. */

import { el, mount } from '../utils/dom.js';
import { icon } from './icons.js';
import { RESOURCE_BY_ID, STATUS_BY_ID } from '../data/catalog.js';
import { formatInt } from '../utils/format.js';

const PAGE_SIZE = 8;

export function createObjectList({ onSelect, onClose }) {
  let items = [];
  let page = 0;
  let title = 'Объекты';

  const titleNode = el('div.oblist__title');
  const countNode = el('div.oblist__count');
  const bodyNode = el('div.oblist__body');
  const pagerLabel = el('span.pager__label');
  const prevBtn = el('button.pager__btn', { type: 'button', title: 'Предыдущая страница' }, icon('chevronLeft'));
  const nextBtn = el('button.pager__btn', { type: 'button', title: 'Следующая страница' }, icon('chevronRight'));

  prevBtn.addEventListener('click', () => {
    page = Math.max(0, page - 1);
    renderPage();
  });
  nextBtn.addEventListener('click', () => {
    page = Math.min(pageCount() - 1, page + 1);
    renderPage();
  });

  const node = el('div.oblist', { hidden: true }, [
    el('div.oblist__head', null, [
      el('div', { style: { flex: '1', minWidth: '0' } }, [titleNode, countNode]),
      el('button.oblist__close', { type: 'button', title: 'Закрыть список', onclick: () => close() }, icon('close')),
    ]),
    bodyNode,
    el('div.oblist__foot', null, [
      el('div.pager', null, [prevBtn, pagerLabel, nextBtn]),
    ]),
  ]);

  function pageCount() {
    return Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  }

  function renderPage() {
    const start = page * PAGE_SIZE;
    const slice = items.slice(start, start + PAGE_SIZE);

    if (!slice.length) {
      mount(bodyNode, el('div.empty', { text: 'Нет объектов, удовлетворяющих фильтру' }));
    } else {
      mount(bodyNode, [
        el('div.oblist__row.oblist__row--head', null, [
          el('span', { text: 'Наименование' }),
          el('span', { text: 'Тип' }),
          el('span', { text: 'Ресурс' }),
          el('span', { text: 'Организация' }),
          el('span', { text: 'Состояние' }),
        ]),
        ...slice.map((item) => {
          const resource = RESOURCE_BY_ID[item.resourceId];
          const status = STATUS_BY_ID[item.statusId];
          return el('div.oblist__row', { onclick: () => onSelect(item) }, [
            el('span', null, [
              el('span.oblist__name', { text: item.name, title: item.name }),
              el('span.oblist__addr', { text: item.address || '', title: item.address || '' }),
            ]),
            el('span', { text: item.typeName }),
            el('span', null, [
              el('span.legend__swatch', { style: { background: resource.color, display: 'inline-block', marginRight: '6px' } }),
              el('span', { text: resource.short }),
            ]),
            el('span', { text: item.orgName, title: item.orgName }),
            el('span', null, [
              el('span.badge', { style: { background: `${status.color}1f`, color: status.color } }, [
                el('span.badge__dot', { style: { background: status.color } }),
                el('span', { text: status.name }),
              ]),
            ]),
          ]);
        }),
      ]);
    }

    pagerLabel.textContent = `${page + 1} / ${pageCount()}`;
    prevBtn.disabled = page === 0;
    nextBtn.disabled = page >= pageCount() - 1;
  }

  function open(nextItems, nextTitle, subtitle) {
    items = nextItems;
    title = nextTitle;
    page = 0;
    titleNode.textContent = title;
    countNode.textContent = subtitle || `${formatInt(items.length)} записей на карте`;
    node.hidden = false;
    renderPage();
  }

  function close() {
    node.hidden = true;
    onClose?.();
  }

  return { node, open, close, get isOpen() { return !node.hidden; } };
}
