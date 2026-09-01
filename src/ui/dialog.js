/**
 * Небольшое модальное окно с одним полем ввода.
 *
 * Нужно там, где действие требует подтверждения и короткого текста — например,
 * названия шаблона поиска. Списочные модальные окна строятся отдельно
 * (см. objectmodal.js), здесь нарочно ничего лишнего.
 */

import { el } from '../utils/dom.js';
import { icon } from './icons.js';

/**
 * @param {{ title: string, subtitle?: string, label?: string, value?: string,
 *   placeholder?: string, confirmText?: string, cancelText?: string,
 *   onConfirm: (value: string) => void }} options
 */
export function promptDialog({
  title,
  subtitle = '',
  label = 'Название',
  value = '',
  placeholder = '',
  confirmText = 'Сохранить',
  cancelText = 'Отмена',
  onConfirm,
}) {
  const input = el('input.dialog__input', {
    type: 'text',
    value,
    placeholder,
    maxlength: '60',
  });
  const error = el('div.dialog__error', { hidden: true, text: 'Введите название' });
  const confirmBtn = el('button.btn.btn--primary', { type: 'button', text: confirmText });
  const cancelBtn = el('button.btn.btn--ghost', { type: 'button', text: cancelText });
  const closeBtn = el('button.modal__close', { type: 'button', 'aria-label': 'Закрыть' }, icon('close', { size: 16 }));

  const dialog = el('div.modal.dialog', { role: 'dialog', 'aria-modal': 'true' }, [
    el('div.modal__head', null, [
      el('div', { style: { flex: '1', minWidth: '0' } }, [
        el('div.modal__title', { text: title }),
        subtitle ? el('div.modal__sub', { text: subtitle }) : null,
      ].filter(Boolean)),
      closeBtn,
    ]),
    el('div.dialog__body', null, [
      el('label.dialog__label', { text: label }),
      input,
      error,
    ]),
    el('div.dialog__foot', null, [cancelBtn, confirmBtn]),
  ]);

  const overlay = el('div.modal-overlay', null, dialog);
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) close();
  });

  function close() {
    document.removeEventListener('keydown', onKeyDown, true);
    overlay.remove();
  }

  function commit() {
    const text = input.value.trim();
    if (!text) {
      error.hidden = false;
      input.focus();
      return;
    }
    close();
    onConfirm(text);
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
    if (event.key === 'Enter' && overlay.contains(document.activeElement)) commit();
  }

  input.addEventListener('input', () => {
    error.hidden = true;
  });
  confirmBtn.addEventListener('click', commit);
  cancelBtn.addEventListener('click', close);
  closeBtn.addEventListener('click', close);

  document.body.append(overlay);
  document.addEventListener('keydown', onKeyDown, true);
  input.focus();
  input.select();

  return { close };
}
