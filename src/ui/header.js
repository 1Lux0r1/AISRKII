/**
 * Шапка приложения: бренд, разделы, палитра команд, свежесть данных.
 *
 * Раздел «Карта» переименован в «Сведения об объектах» и раскрывается списком
 * инструментов: карта объектов, анализ территории и смежные подсистемы.
 * Глобальный поиск стал палитрой команд (⌘K) — территории, объекты, события
 * и команды интерфейса в одном списке.
 */

import { el, mount, onDismiss } from '../utils/dom.js';
import { icon, iconSvg } from './icons.js';
import { getState } from '../state.js';
import { formatDate } from '../utils/format.js';
import { CITY } from '../data/catalog.js';

export const SECTIONS = [
  { id: 'map', name: 'Сведения об объектах', tools: true },
  { id: 'validation', name: 'Проверка данных', badge: 12 },
  { id: 'analytics', name: 'Аналитика' },
  { id: 'reports', name: 'Отчёты' },
  { id: 'admin', name: 'Администрирование' },
];

/** Инструменты раздела «Сведения об объектах». */
export const TOOLS = [
  {
    id: 'map',
    name: 'Карта объектов',
    hint: 'Реестр, состояние, тематические слои',
    icon: 'map',
  },
  {
    id: 'terra',
    name: 'Анализ территории',
    hint: 'Подключение перспективной застройки к КИИ',
    icon: 'polygon',
  },
  {
    id: 'grid',
    name: 'Мониторинг электрических сетей',
    hint: 'Схемы питания, режимы, отключения',
    icon: 'power',
    soon: true,
  },
  {
    id: 'ksio',
    name: 'Автоматизация КСИО',
    hint: 'Комплексная система инженерного обеспечения',
    icon: 'gear',
    soon: true,
  },
];

export function createHeader({ onNavigate, onTool, onCommand }) {
  const nav = el('nav.nav');
  const navButtons = new Map();
  for (const section of SECTIONS) {
    const btn = el('button.nav__item', { type: 'button' }, [
      el('span', { text: section.name }),
      section.badge ? el('span.nav__badge', { text: String(section.badge) }) : null,
      section.tools ? icon('chevronDown', { size: 14, cls: 'icon icon--sm' }) : null,
    ].filter(Boolean));
    btn.addEventListener('click', () => {
      if (section.tools) return toggleTools(btn);
      hideTools();
      onNavigate(section.id);
    });
    navButtons.set(section.id, btn);
    nav.append(btn);
  }

  /* --- список инструментов раздела --- */
  let toolsMenu = null;
  let toolsDismiss = null;

  function hideTools() {
    toolsMenu?.remove();
    toolsMenu = null;
    toolsDismiss?.();
    toolsDismiss = null;
  }

  function toggleTools(anchor) {
    if (toolsMenu) return hideTools();
    const activeTool = getState().tool || 'map';
    toolsMenu = el('div.navmenu', null, [
      el('div.navmenu__group.eyebrow', { text: 'Инструменты раздела' }),
      ...TOOLS.map((tool) => {
        const row = el('button.navmenu__row', {
          type: 'button',
          class: tool.id === activeTool ? 'is-current' : '',
          disabled: Boolean(tool.soon),
        }, [
          el('span.navmenu__icon', null, icon(tool.icon, { size: 16 })),
          el('span.navmenu__main', null, [
            el('span.navmenu__title', { text: tool.name }),
            el('span.navmenu__sub', { text: tool.soon ? `${tool.hint} · в разработке` : tool.hint }),
          ]),
          tool.id === activeTool ? icon('check', { size: 15 }) : null,
        ].filter(Boolean));
        row.addEventListener('click', () => {
          hideTools();
          onTool(tool.id);
        });
        return row;
      }),
    ]);
    const rect = anchor.getBoundingClientRect();
    toolsMenu.style.left = `${Math.max(8, rect.left)}px`;
    toolsMenu.style.top = `${rect.bottom + 6}px`;
    document.body.append(toolsMenu);
    toolsDismiss = onDismiss(toolsMenu, (event) => {
      if (event.type === 'pointerdown' && anchor.contains(event.target)) return;
      hideTools();
    });
  }

  /* --- палитра команд --- */
  const cmdk = el('button.cmdk', { type: 'button', title: 'Поиск и команды' }, [
    icon('search', { size: 14, cls: 'icon icon--sm' }),
    el('span.cmdk__text', { text: 'Поиск и команды' }),
    el('span.kbd', { text: '⌘K' }),
  ]);
  cmdk.addEventListener('click', () => onCommand());

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      onCommand();
    }
  });

  /* --- свежесть данных --- */
  const freshness = el('div.freshness', {
    title: 'Система показывает последнюю принятую выгрузку, а не данные в реальном времени',
  }, [
    el('span.freshness__pulse'),
    el('span', null, [document.createTextNode('Данные на '), el('strong', { text: formatDate(CITY.actualOn) })]),
  ]);

  const notifyBtn = el('button.iconbtn', { type: 'button', title: 'Уведомления' }, [
    icon('bell'),
    el('span.iconbtn__dot', { text: '7' }),
  ]);

  /* --- тёмная тема --- */
  const themeBtn = el('button.iconbtn', { type: 'button', title: 'Диспетчерский режим (тёмная тема)' }, icon('moon'));
  themeBtn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      localStorage.setItem('rkiie.theme', next);
    } catch {
      /* приватное окно — тема просто не запомнится */
    }
  });

  const header = el('header.topbar', null, [
    el('div.brand', null, [
      el('span.brand__mark', { html: iconSvg('layers', { size: 18, cls: 'icon', stroke: 1.9 }) }),
      el('span.brand__text', null, [
        el('span.brand__name', { text: 'РКИИЭ 2.0' }),
        el('span.brand__sub', { text: 'Мониторинг ресурсоснабжения Москвы' }),
      ]),
    ]),
    nav,
    el('span.u-spacer'),
    cmdk,
    freshness,
    notifyBtn,
    themeBtn,
    el('div.user', null, [
      el('span.avatar', { text: 'ИИ' }),
      el('span.user__text', null, [
        el('span.user__name', { text: 'Иванов И.' }),
        el('span.user__role', { text: 'Диспетчер' }),
      ]),
    ]),
  ]);

  function update() {
    const { section } = getState();
    for (const [id, btn] of navButtons) {
      btn.classList.toggle('is-active', id === section);
    }
  }

  update();
  return { node: header, update, hideTools };
}

/**
 * Тема применяется к корню документа: токены переопределяются там. Событие
 * нужно карте — заливки территорий и подложка на тёмной теме приглушаются,
 * а это считается в JavaScript, а не в CSS.
 */
export function applyTheme(theme) {
  if (theme === 'dark') document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  document.dispatchEvent(new CustomEvent('rkiie:theme', { detail: { theme } }));
}

/** Восстановление темы до первой отрисовки — чтобы не мигало светлым. */
export function restoreTheme() {
  try {
    applyTheme(localStorage.getItem('rkiie.theme') || 'light');
  } catch {
    applyTheme('light');
  }
}
