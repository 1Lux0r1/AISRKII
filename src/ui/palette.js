/**
 * Палитра команд (⌘K).
 *
 * Глобальный поиск и команды интерфейса в одном списке: территории, объекты,
 * события ищутся по той же модели, что и раньше, а команды дают клавиатурный
 * доступ к тому, что иначе требует мыши и знания, где лежит кнопка.
 */

import { el, mount } from '../utils/dom.js';
import { icon } from './icons.js';
import { search as searchModel } from '../data/model.js';

const GROUP_TITLES = {
  okrug: 'Административные округа',
  district: 'Районы',
  org: 'Организации',
  object: 'Объекты',
  incident: 'События',
  command: 'Команды',
};

const GROUP_ICONS = {
  okrug: 'map',
  district: 'polygon',
  org: 'building',
  object: 'factory',
  incident: 'warning',
  command: 'bolt',
};

export function createPalette({ onPick, onCommand, commands }) {
  let rows = [];
  let active = 0;

  const input = el('input', {
    type: 'text',
    placeholder: 'Территория, объект, событие или команда',
    'aria-label': 'Поиск и команды',
    autocomplete: 'off',
  });
  const body = el('div.cmd__body');

  const dialog = el('div.cmd', { role: 'dialog', 'aria-modal': 'true' }, [
    el('div.cmd__input', null, [icon('search', { size: 20 }), input]),
    body,
    el('div.cmd__foot', null, [
      el('span', { text: '↑↓ — выбор' }),
      el('span', { text: '↵ — открыть' }),
      el('span', { text: 'Esc — закрыть' }),
    ]),
  ]);

  const overlay = el('div.modal-overlay.modal-overlay--cmd', { hidden: true }, dialog);
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) close();
  });
  document.body.append(overlay);

  function collect(query) {
    const q = query.trim().toLowerCase();
    const found = q.length >= 2 ? searchModel(q, 12) : [];
    const matched = commands()
      .filter((c) => !q || c.title.toLowerCase().includes(q) || (c.sub || '').toLowerCase().includes(q))
      .slice(0, q ? 6 : 8)
      .map((c) => ({ ...c, kind: 'command' }));
    return [...found, ...matched];
  }

  function render() {
    if (!rows.length) {
      mount(body, el('div.search__empty', { text: 'Ничего не найдено' }));
      return;
    }
    const nodes = [];
    let seen = null;
    rows.forEach((item, i) => {
      if (item.kind !== seen) {
        seen = item.kind;
        nodes.push(el('div.cmd__group.eyebrow', { text: GROUP_TITLES[item.kind] || item.kind }));
      }
      nodes.push(
        el('div.cmd__row', {
          class: i === active ? 'is-active' : '',
          onmouseenter: () => {
            active = i;
            syncActive();
          },
          onclick: () => choose(item),
        }, [
          el('span.cmd__icon', null, icon(item.icon || GROUP_ICONS[item.kind] || 'dot', { size: 14, cls: 'icon icon--sm' })),
          el('span.cmd__main', null, [
            el('span.cmd__title', { text: item.title }),
            el('span.cmd__sub', { text: item.sub || '' }),
          ]),
          i === active ? el('span.kbd', { text: '↵' }) : null,
        ].filter(Boolean)),
      );
    });
    mount(body, nodes);
  }

  function syncActive() {
    const list = [...body.querySelectorAll('.cmd__row')];
    list.forEach((n, i) => n.classList.toggle('is-active', i === active));
    list[active]?.scrollIntoView({ block: 'nearest' });
  }

  function choose(item) {
    close();
    if (item.kind === 'command') onCommand(item);
    else onPick(item);
  }

  function refresh() {
    rows = collect(input.value);
    active = 0;
    render();
  }

  input.addEventListener('input', refresh);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      active = Math.min(rows.length - 1, active + 1);
      syncActive();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      active = Math.max(0, active - 1);
      syncActive();
    } else if (event.key === 'Enter' && rows[active]) {
      event.preventDefault();
      choose(rows[active]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });

  function open() {
    overlay.hidden = false;
    input.value = '';
    refresh();
    input.focus();
  }

  function close() {
    overlay.hidden = true;
  }

  return {
    open,
    close,
    toggle: () => (overlay.hidden ? open() : close()),
    get isOpen() {
      return !overlay.hidden;
    },
  };
}
