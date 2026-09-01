/**
 * Рейтинг районов по действующему тематическому слою.
 *
 * Тепловая карта показывает, где показатель выше, но не отвечает на вопрос
 * «а какие именно это районы и что в них стоит». Окно даёт упорядоченный
 * список районов со значением показателя и переход к списку их объектов.
 */

import { el, mount } from '../utils/dom.js';
import { icon } from './icons.js';
import { createSelect } from './select.js';
import { formatInt, formatNumber } from '../utils/format.js';
import { OKRUG_BY_ID, districtMetric, districtSource, districtStats, districts, metricRange, territories } from '../data/model.js';
import { THEMATIC_BY_ID, rampColor, zoneColor } from '../data/thematic.js';

const PAGE_SIZE = 12;

export function createLayerModal({ onOpenList, onFocus }) {
  let rows = [];
  let filtered = [];
  let page = 0;
  let search = '';
  let okrugId = null;
  let descending = true;
  let layer = null;

  const titleNode = el('div.modal__title');
  const subtitleNode = el('div.modal__sub');
  const countNode = el('div.modal__count');
  const bodyNode = el('div.modal__body');

  const searchInput = el('input.modal__search-input', {
    type: 'search',
    placeholder: 'Поиск по названию района',
    'aria-label': 'Поиск по названию района',
  });
  searchInput.addEventListener('input', () => {
    search = searchInput.value.trim().toLowerCase();
    page = 0;
    renderRows();
  });

  const okrugSelect = createSelect({
    placeholder: 'Все округа',
    options: territories
      .filter((okrug) => !okrug.approximate)
      .map((okrug) => ({ id: okrug.id, name: okrug.name })),
    onChange: (value) => {
      okrugId = value;
      page = 0;
      renderRows();
    },
  });

  const sortBtn = el('button.btn.btn--ghost.modal__reset', { type: 'button' });
  sortBtn.addEventListener('click', () => {
    descending = !descending;
    page = 0;
    renderRows();
  });

  const resetBtn = el('button.btn.btn--ghost.modal__reset', { type: 'button', text: 'Сбросить' });
  resetBtn.addEventListener('click', () => {
    search = '';
    okrugId = null;
    descending = true;
    searchInput.value = '';
    okrugSelect.set({ value: null });
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

  const dialog = el('div.modal.modal--rank', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Районы по показателю' }, [
    el('div.modal__head', null, [
      el('div', { style: { flex: '1', minWidth: '0' } }, [titleNode, subtitleNode]),
      closeBtn,
    ]),
    el('div.modal__filters', null, [
      el('div.modal__search', null, [icon('search', { size: 15 }), searchInput]),
      okrugSelect.node,
      sortBtn,
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

  function applyFilters() {
    filtered = rows.filter((row) => {
      if (okrugId && row.okrugId !== okrugId) return false;
      if (!search) return true;
      return row.name.toLowerCase().includes(search);
    });
    if (layer?.kind === 'scale') {
      filtered.sort((a, b) => (descending ? b.value - a.value : a.value - b.value));
    } else {
      filtered.sort(
        (a, b) => a.valueText.localeCompare(b.valueText, 'ru') || a.name.localeCompare(b.name, 'ru'),
      );
    }
  }

  function renderRows() {
    applyFilters();
    if (page >= pageCount()) page = pageCount() - 1;

    sortBtn.textContent = descending ? 'Сначала больше' : 'Сначала меньше';
    sortBtn.hidden = layer?.kind !== 'scale';

    countNode.textContent = filtered.length
      ? `Районов: ${formatInt(filtered.length)} из ${formatInt(rows.length)}`
      : 'По заданным условиям районов нет';

    const slice = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

    if (!slice.length) {
      mount(bodyNode, el('div.empty', { text: 'Измените условия отбора или очистите поиск' }));
    } else {
      mount(bodyNode, [
        el('div.modal__row.modal__row--rank.modal__row--head', null, [
          el('span', { text: 'Район' }),
          el('span', { text: 'Округ' }),
          el('span', { text: layer.kind === 'scale' ? layer.name : 'Источник' }),
          el('span', { text: 'Объектов' }),
          el('span', { text: '' }),
        ]),
        ...slice.map((row) => {
          const focus = () => {
            close();
            onFocus(row);
          };
          return el(
            'div.modal__row.modal__row--rank',
            {
              tabindex: '0',
              role: 'button',
              onclick: focus,
              onkeydown: (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                focus();
              },
            },
            [
              el('span.modal__name', { text: row.name, title: row.name }),
              el('span', { text: row.okrugName, title: row.okrugName }),
              el('span.rank__metric', null, [
                el('span.rank__swatch', { style: { background: row.color } }),
                el('span', { text: row.valueText, title: row.valueText }),
              ]),
              el('span', { text: formatInt(row.objects) }),
              el(
                'span',
                null,
                el('button.rank__list', {
                  type: 'button',
                  text: 'Объекты',
                  onclick: (event) => {
                    event.stopPropagation();
                    close();
                    onOpenList(row);
                  },
                }),
              ),
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

  /** @param {{ layerId: string, resourceIds: string[], filter: object, zoneOrder: Map<string, number> }} ctx */
  function open({ layerId, resourceIds, filter, zoneOrder }) {
    layer = THEMATIC_BY_ID[layerId];
    if (!layer || layer.kind === 'admin') return;

    const range = layer.kind === 'scale' ? metricRange(layerId, resourceIds) : null;
    rows = districts.map((district) => {
      const okrug = OKRUG_BY_ID[district.okrugId];
      const base = {
        id: district.id,
        name: district.name,
        okrugId: district.okrugId,
        okrugName: okrug?.name || '',
        objects: districtStats(district.id, filter).total,
        layerName: layer.name,
      };
      if (layer.kind === 'scale') {
        const value = districtMetric(layerId, district.id, resourceIds);
        return {
          ...base,
          value,
          valueText: layer.unit === '%' ? `${Math.round(value)} %` : `${formatNumber(value, 2)}${layer.unit}`,
          color: rampColor(layer, (value - range.min) / (range.max - range.min)),
        };
      }
      const source = districtSource(district.id, resourceIds);
      return {
        ...base,
        value: 0,
        valueText: source?.name || 'нет данных',
        color: source ? zoneColor(source.id, zoneOrder.get(source.id) ?? 0) : 'var(--border-strong)',
      };
    });

    page = 0;
    descending = true;
    search = '';
    okrugId = null;
    searchInput.value = '';
    okrugSelect.set({ value: null });
    titleNode.textContent = layer.name;
    subtitleNode.textContent =
      layer.kind === 'scale'
        ? `Районы по показателю · ${layer.legend[0]} → ${layer.legend[1]}`
        : 'Районы по обслуживающему источнику';
    overlay.hidden = false;
    document.addEventListener('keydown', onKeyDown, true);
    renderRows();
    searchInput.focus();
  }

  function close() {
    overlay.hidden = true;
    document.removeEventListener('keydown', onKeyDown, true);
    okrugSelect.close();
  }

  return {
    open,
    close,
    get isOpen() {
      return !overlay.hidden;
    },
  };
}
