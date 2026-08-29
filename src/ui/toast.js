/** Короткие уведомления о выполненных действиях. */

import { el } from '../utils/dom.js';
import { icon } from './icons.js';

let host = null;

export function toast(message, { kind = 'info', timeout = 3600 } = {}) {
  if (!host) {
    host = el('div.toasts');
    document.body.append(host);
  }
  const node = el(`div.toast.toast--${kind}`, null, [
    icon(kind === 'ok' ? 'check' : kind === 'warn' ? 'warning' : 'info'),
    el('span', { text: message }),
  ]);
  host.append(node);
  requestAnimationFrame(() => node.classList.add('is-in'));
  setTimeout(() => {
    node.classList.remove('is-in');
    setTimeout(() => node.remove(), 220);
  }, timeout);
  return node;
}
