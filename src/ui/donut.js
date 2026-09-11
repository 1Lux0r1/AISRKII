/**
 * Кольцевая диаграмма долей.
 *
 * Используется там, где важно соотношение частей одного целого: разбор
 * состояний объектов в панели отбора и баланс мощности источника в модуле
 * «Анализ территории». Каждая доля подписана числом и процентом — кольцо
 * само по себе значения не передаёт.
 */

import { el } from '../utils/dom.js';
import { formatInt } from '../utils/format.js';

/**
 * @param {{name: string, value: number, color: string, onClick?: Function,
 *   active?: boolean, strong?: boolean}[]} items
 * @param {{total?: string, label?: string, size?: number, thickness?: number,
 *   caption?: Node|string, format?: (n: number) => string}} options
 */
export function donut(items, {
  total = null,
  label = '',
  size = 96,
  thickness = 14,
  caption = null,
  format = formatInt,
} = {}) {
  const sum = items.reduce((acc, item) => acc + item.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  // Зазор между дугами: без него соседние доли сливаются в сплошное кольцо.
  const gap = sum ? 2.5 : 0;
  let offset = 0;

  const arcs = items.map((item) => {
    const len = sum ? Math.max(0, (item.value / sum) * c - gap) : 0;
    const arc = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${item.color}"
      stroke-width="${thickness}" stroke-linecap="butt"
      stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}"
      stroke-dashoffset="${(-offset).toFixed(2)}"/>`;
    offset += sum ? (item.value / sum) * c : 0;
    return arc;
  }).join('');

  const svg = `<svg width="${size}" height="${size}" role="img"
      aria-label="Доли: ${items.map((i) => `${i.name} — ${i.value}`).join(', ')}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${thickness}"/>
      ${arcs}
    </svg>`;

  const ring = el('div.donut', { style: { width: `${size}px`, height: `${size}px` }, html: svg });
  ring.append(
    el('span.donut__hole', null, [
      el('span.donut__value', { text: total ?? format(sum) }),
      el('br'),
      label ? el('span.donut__label', { text: label }) : null,
    ].filter(Boolean)),
  );

  const legend = el('div.donut__legend', null,
    items.map((item) => {
      const row = el(item.onClick ? 'button.donut__row' : 'div.donut__row', {
        type: item.onClick ? 'button' : null,
        class: item.active ? 'is-active' : '',
        title: item.onClick ? `Отобрать: ${item.name}` : item.name,
        onclick: item.onClick || null,
      }, [
        el('span.legend__swatch.legend__swatch--dot', { style: { background: item.color } }),
        el('span.donut__name', { text: item.name, title: item.name }),
        el('span.donut__num', { text: format(item.value) }),
        el('span.donut__pct', { text: sum ? `${Math.round((item.value / sum) * 100)} %` : '—' }),
      ]);
      return row;
    }));

  return el('div.donutbox', null, [
    ring,
    caption ? (typeof caption === 'string' ? el('div.donutbox__caption', { text: caption }) : caption) : null,
    legend,
  ].filter(Boolean));
}
