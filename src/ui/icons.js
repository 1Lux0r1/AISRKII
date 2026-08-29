/** Набор иконок интерфейса (inline SVG, единый стиль обводки 1.7). */

const P = (d, extra = '') => `<path d="${d}" ${extra}/>`;

const PATHS = {
  logo: `<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 21V9"/>`,
  search: `<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>`,
  star: `<path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8z"/>`,
  bell: `<path d="M18 8.5a6 6 0 10-12 0c0 6-2 7.5-2 7.5h16s-2-1.5-2-7.5z"/><path d="M13.7 20a2 2 0 01-3.4 0"/>`,
  menu: `<path d="M4 7h16M4 12h16M4 17h16"/>`,
  close: `<path d="M6 6l12 12M18 6L6 18"/>`,
  chevronDown: `<path d="M6 9.5l6 6 6-6"/>`,
  chevronUp: `<path d="M6 14.5l6-6 6 6"/>`,
  chevronLeft: `<path d="M14.5 6l-6 6 6 6"/>`,
  chevronRight: `<path d="M9.5 6l6 6-6 6"/>`,
  check: `<path d="M4 12.5l5 5L20 6.5"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  minus: `<path d="M5 12h14"/>`,
  info: `<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>`,
  refresh: `<path d="M20 11a8 8 0 10-2.3 6.3"/><path d="M20 5v6h-6"/>`,
  doc: `<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>`,
  list: `<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>`,
  pin: `<path d="M12 21s7-5.3 7-11a7 7 0 10-14 0c0 5.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>`,
  pinSearch: `<path d="M11 20s6-4.6 6-9.5A6 6 0 105 10.5C5 15.4 11 20 11 20z"/><circle cx="11" cy="10" r="2"/>`,
  target: `<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.6"/>`,
  dot: `<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>`,
  network: `<circle cx="5.5" cy="6.5" r="2.2"/><circle cx="18.5" cy="6.5" r="2.2"/><circle cx="12" cy="17.5" r="2.2"/><path d="M7.4 7.8l3.3 8M16.6 7.8l-3.3 8M7.7 6.5h8.6"/>`,
  bolt: `<path d="M13.5 2.5L5 13.5h6l-.5 8L19 10.5h-6z"/>`,
  map: `<path d="M9 4L3.6 6.2v13.4L9 17.4l6 2.2 5.4-2.2V4L15 6.2z"/><path d="M9 4v13.4M15 6.2v13.4"/>`,
  layers: `<path d="M12 3l9 5-9 5-9-5z"/><path d="M3.5 12.5L12 17l8.5-4.5"/>`,
  building: `<path d="M4 21V7l7-4 7 4v14"/><path d="M9 21v-5h6v5M8.5 9h1.5M14 9h1.5M8.5 12.5H10M14 12.5h1.5"/>`,
  factory: `<path d="M3 21V10l5 3V10l5 3V7l6 3.5V21z"/><path d="M7 17h1.5M11.5 17H13M16 17h1.5"/>`,
  drop: `<path d="M12 3.5S6.5 10 6.5 14a5.5 5.5 0 0011 0c0-4-5.5-10.5-5.5-10.5z"/>`,
  flame: `<path d="M12 3.5s4.5 4.2 4.5 8.2a4.5 4.5 0 11-9 0c0-1.6.8-3 1.6-4 .2 1.2.9 2 1.7 2 1.2 0 1.8-1.1 1.5-3-.2-1.5-.3-2.4-.3-3.2z"/>`,
  radiator: `<rect x="4" y="6" width="16" height="12" rx="2"/><path d="M8.5 6v12M12 6v12M15.5 6v12"/>`,
  waves: `<path d="M3 9c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0"/><path d="M3 15c2-1.6 4-1.6 6 0s4 1.6 6 0 4-1.6 6 0"/>`,
  tunnel: `<path d="M5 20V11a7 7 0 0114 0v9"/><path d="M9.5 20v-8.5a2.5 2.5 0 015 0V20"/>`,
  ruler: `<path d="M4.5 14.5l5.5-5.5 4.5 4.5-5.5 5.5a1.5 1.5 0 01-2.1 0l-2.4-2.4a1.5 1.5 0 010-2.1z"/><path d="M13.5 5.5l5 5"/><path d="M7 12l1.5 1.5M9.5 9.5L11 11M12 7l1.5 1.5"/>`,
  polygon: `<path d="M12 3.5l8 5.8-3 9.4H7l-3-9.4z"/>`,
  square: `<rect x="4.5" y="4.5" width="15" height="15" rx="2"/>`,
  arrowsH: `<path d="M4 12h16"/><path d="M7.5 8.5L4 12l3.5 3.5M16.5 8.5L20 12l-3.5 3.5"/>`,
  arrowsDiag: `<path d="M14.5 9.5L20 4M20 4h-4.5M20 4v4.5"/><path d="M9.5 14.5L4 20M4 20h4.5M4 20v-4.5"/>`,
  swap: `<path d="M7 4L4 7l3 3"/><path d="M4 7h11a5 5 0 015 5"/><path d="M17 20l3-3-3-3"/><path d="M20 17H9a5 5 0 01-5-5"/>`,
  save: `<path d="M5 5h11l3 3v11H5z"/><path d="M8 5v5h7V5M8 19v-5h8v5"/>`,
  filter: `<path d="M4 5h16l-6.4 7.4V19l-3.2 1.6v-8.2z"/>`,
  chart: `<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5M12 16V7M16 16v-8"/>`,
  shield: `<path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z"/><path d="M9 12l2 2 4-4"/>`,
  clipboard: `<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9.5 4V2.8h5V4"/><path d="M9.5 10h5M9.5 14h5"/>`,
  gear: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 11-4 0v-.1A1.6 1.6 0 006.5 19l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00-1.1-2.7H2.5a2 2 0 110-4h.1A1.6 1.6 0 004 6.5l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 002.7-1.1V2.5a2 2 0 114 0v.1A1.6 1.6 0 0017.5 4l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 001.1 2.7h.1a2 2 0 110 4h-.1a1.6 1.6 0 00-1.1 1z"/>`,
  warning: `<path d="M12 4l9 15.5H3z"/><path d="M12 10v4M12 17h.01"/>`,
  clock: `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>`,
  download: `<path d="M12 4v11"/><path d="M8 11.5l4 4 4-4"/><path d="M5 19h14"/>`,
  eye: `<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>`,
  logout: `<path d="M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4"/><path d="M10 8l-4 4 4 4M6 12h11"/>`,
};

/** Иконка ресурса. */
export const RESOURCE_ICONS = {
  heat: 'radiator',
  power: 'bolt',
  water: 'drop',
  gas: 'flame',
  storm: 'waves',
  collector: 'tunnel',
};

export function iconSvg(name, { size = 16, cls = 'icon', stroke = 1.7 } = {}) {
  const body = PATHS[name] || PATHS.dot;
  return `<svg class="${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none"
    stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true">${body}</svg>`;
}

export function icon(name, opts) {
  const span = document.createElement('span');
  span.style.display = 'contents';
  span.innerHTML = iconSvg(name, opts);
  return span.firstElementChild;
}

/** Цветной значок ресурса, как в фильтрах и панели сведений. */
export function resourceBadge(resource, size = 16) {
  const box = document.createElement('span');
  box.className = 'res-dot';
  box.style.background = resource.color;
  box.style.width = `${size}px`;
  box.style.height = `${size}px`;
  box.innerHTML = iconSvg(RESOURCE_ICONS[resource.id] || 'dot', {
    size: Math.round(size * 0.68),
    cls: '',
    stroke: 2,
  });
  return box;
}

export { P };
