/** Шапка приложения: разделы, глобальный поиск, уведомления, пользователь. */

import { el, mount, onDismiss } from '../utils/dom.js';
import { icon, iconSvg } from './icons.js';
import { getState, setState } from '../state.js';
import { search as searchModel } from '../data/model.js';

export const SECTIONS = [
  { id: 'map', name: 'Карта', icon: 'map' },
  { id: 'validation', name: 'Проверка данных', icon: 'shield' },
  { id: 'reports', name: 'Отчёты', icon: 'doc' },
  { id: 'analytics', name: 'Аналитика', icon: 'chart' },
  { id: 'admin', name: 'Администрирование', icon: 'gear' },
];

export function createHeader({ onNavigate, onPick }) {
  const nav = el('nav.nav');
  const navButtons = new Map();
  for (const section of SECTIONS) {
    const btn = el('button.nav__item', {
      type: 'button',
      text: section.name,
      onclick: () => onNavigate(section.id),
    });
    navButtons.set(section.id, btn);
    nav.append(btn);
  }

  const input = el('input.search__input', {
    type: 'search',
    placeholder: 'Глобальный поиск',
    autocomplete: 'off',
    'aria-label': 'Глобальный поиск',
  });
  const results = el('div.search__results', { hidden: true });
  const searchBox = el('div.search', null, [
    input,
    el('button.search__btn', { type: 'button', title: 'Найти' }, icon('search')),
    results,
  ]);

  let activeIndex = -1;
  let current = [];
  let dismiss = null;

  const closeResults = () => {
    results.hidden = true;
    activeIndex = -1;
    if (dismiss) dismiss();
    dismiss = null;
  };

  const renderResults = () => {
    if (!current.length) {
      mount(results, el('div.search__empty', { text: 'Ничего не найдено' }));
      return;
    }
    const groups = new Map();
    for (const item of current) {
      if (!groups.has(item.kind)) groups.set(item.kind, []);
      groups.get(item.kind).push(item);
    }
    const nodes = [];
    let index = 0;
    for (const [kind, items] of groups) {
      nodes.push(el('div.search__group', { text: GROUP_TITLES[kind] || kind }));
      for (const item of items) {
        const i = index++;
        nodes.push(
          el(
            'div.search__row',
            {
              class: i === activeIndex ? 'is-active' : '',
              onclick: () => {
                onPick(item);
                input.value = '';
                closeResults();
              },
            },
            [
              icon(GROUP_ICONS[kind] || 'dot'),
              el('div.search__row-main', null, [
                el('div.search__row-title', { text: item.title }),
                el('div.search__row-sub', { text: item.sub }),
              ]),
            ],
          ),
        );
      }
    }
    mount(results, nodes);
  };

  const runSearch = () => {
    const q = input.value;
    setState({ ui: { search: q } }, []);
    current = searchModel(q);
    if (q.trim().length < 2) {
      closeResults();
      return;
    }
    activeIndex = -1;
    results.hidden = false;
    if (!dismiss) dismiss = onDismiss(searchBox, closeResults);
    renderResults();
  };

  input.addEventListener('input', runSearch);
  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 2) runSearch();
  });
  input.addEventListener('keydown', (event) => {
    if (results.hidden) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      activeIndex = (activeIndex + delta + current.length) % current.length;
      renderResults();
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      onPick(current[activeIndex]);
      input.value = '';
      closeResults();
    }
  });

  const notifyBtn = el('button.iconbtn', { type: 'button', title: 'Уведомления' }, [
    icon('bell'),
    el('span.iconbtn__dot'),
  ]);

  const header = el('header.header', null, [
    el('div.brand', null, [
      el('div.brand__mark', { html: iconSvg('layers', { size: 18, cls: 'icon', stroke: 1.8 }) }),
      el('div', null, [
        el('div.brand__title', { text: 'РКИИЭ 2.0' }),
        el('div.brand__sub', { text: 'Сведения об объектах' }),
      ]),
    ]),
    nav,
    el('div.header__spacer'),
    searchBox,
    el('button.iconbtn', { type: 'button', title: 'Избранное' }, icon('star')),
    notifyBtn,
    el('div.user', null, [
      el('div.user__avatar', { text: 'ИИ' }),
      el('span.user__name', { text: 'Иванов И.' }),
    ]),
    el('button.iconbtn', { type: 'button', title: 'Меню' }, icon('menu')),
  ]);

  function update() {
    const { section } = getState();
    for (const [id, btn] of navButtons) {
      btn.classList.toggle('is-active', id === section);
    }
  }

  update();
  return { node: header, update };
}

const GROUP_TITLES = {
  okrug: 'Административные округа',
  district: 'Районы',
  org: 'Организации',
  object: 'Объекты',
  incident: 'События',
};

const GROUP_ICONS = {
  okrug: 'map',
  district: 'polygon',
  org: 'building',
  object: 'factory',
  incident: 'warning',
};
