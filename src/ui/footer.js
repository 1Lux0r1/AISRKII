/** Подвал: сведения об актуальности данных и обновление выгрузки. */

import { el } from '../utils/dom.js';
import { icon } from './icons.js';
import { CITY } from '../data/catalog.js';
import { getState } from '../state.js';
import { formatDate, formatInt } from '../utils/format.js';
import { filterFromState, statsFor } from '../data/model.js';

export function createFooter({ onRefresh }) {
  const countNode = el('span');
  const refreshBtn = el('button.footer__btn', { type: 'button' }, [icon('refresh'), el('span', { text: 'Обновить' })]);

  refreshBtn.addEventListener('click', async () => {
    refreshBtn.classList.add('is-busy');
    refreshBtn.disabled = true;
    await onRefresh();
    refreshBtn.classList.remove('is-busy');
    refreshBtn.disabled = false;
  });

  const node = el('footer.footer', null, [
    el('span', { text: `© РКИИЗ 2.0 Москва` }),
    el('span', { text: `Данные актуальны на ${formatDate(CITY.actualOn)}` }),
    countNode,
    el('span.footer__spacer'),
    refreshBtn,
  ]);

  function update() {
    const state = getState();
    const stats = statsFor(filterFromState(state));
    countNode.textContent = `В выборке: ${formatInt(stats.total)} объектов`;
  }

  update();
  return { node, update };
}
