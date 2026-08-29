/** Выпадающий список в стиле макета (нативный select не даёт нужного вида). */

import { el, mount, onDismiss } from '../utils/dom.js';
import { icon } from './icons.js';

/**
 * options: [{ id, name, count?, disabled? }]
 * multiple: множественный выбор с галочками
 */
export function createSelect({
  placeholder = 'Выберите из списка',
  options = [],
  value = null,
  multiple = false,
  disabled = false,
  clearable = true,
  onChange = () => {},
}) {
  const valueNode = el('span.select__value');
  const button = el('button.select', { type: 'button' }, [valueNode, icon('chevronDown', { cls: 'icon select__chev' })]);
  const dropdown = el('div.dropdown', { hidden: true });
  let state = { options, value, disabled };
  let dismiss = null;

  function selectedList() {
    if (multiple) return Array.isArray(state.value) ? state.value : [];
    return state.value == null ? [] : [state.value];
  }

  function renderValue() {
    const selected = selectedList();
    const names = selected
      .map((id) => state.options.find((o) => o.id === id)?.name)
      .filter(Boolean);
    if (!names.length) {
      valueNode.textContent = placeholder;
      valueNode.classList.add('is-placeholder');
    } else {
      valueNode.textContent = names.length > 1 ? `Выбрано: ${names.length}` : names[0];
      valueNode.classList.remove('is-placeholder');
    }
    button.disabled = Boolean(state.disabled);
    button.title = names.join(', ');
  }

  function renderOptions() {
    if (!state.options.length) {
      mount(dropdown, el('div.dropdown__empty', { text: 'Нет доступных значений' }));
      return;
    }
    const selected = selectedList();
    const nodes = [];
    if (clearable && !multiple) {
      nodes.push(
        el('div.dropdown__item', {
          text: placeholder,
          class: selected.length ? '' : 'is-selected',
          onclick: () => commit(null),
        }),
      );
    }
    for (const option of state.options) {
      const isSelected = selected.includes(option.id);
      nodes.push(
        el(
          'div.dropdown__item',
          {
            class: isSelected ? 'is-selected' : '',
            onclick: () => {
              if (multiple) {
                const next = isSelected ? selected.filter((v) => v !== option.id) : [...selected, option.id];
                commit(next, true);
              } else {
                commit(option.id);
              }
            },
          },
          [
            multiple ? icon(isSelected ? 'check' : 'dot', { size: 13 }) : null,
            el('span', { text: option.name }),
            option.count != null ? el('span.dropdown__count.dropdown__item-count', { text: String(option.count) }) : null,
          ],
        ),
      );
    }
    mount(dropdown, nodes);
  }

  function commit(next, keepOpen = false) {
    state.value = next;
    renderValue();
    if (keepOpen) renderOptions();
    else close();
    onChange(next);
  }

  function place() {
    const rect = button.getBoundingClientRect();
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.width = `${rect.width}px`;
    const below = window.innerHeight - rect.bottom;
    if (below < 220 && rect.top > below) {
      dropdown.style.top = 'auto';
      dropdown.style.bottom = `${window.innerHeight - rect.top + 4}px`;
      dropdown.style.maxHeight = `${Math.min(280, rect.top - 12)}px`;
    } else {
      dropdown.style.bottom = 'auto';
      dropdown.style.top = `${rect.bottom + 4}px`;
      dropdown.style.maxHeight = `${Math.min(280, below - 12)}px`;
    }
  }

  function open() {
    if (state.disabled) return;
    renderOptions();
    dropdown.hidden = false;
    document.body.append(dropdown);
    place();
    button.classList.add('is-open');
    dismiss = onDismiss(dropdown, (event) => {
      if (button.contains(event.target)) return;
      close();
    });
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
  }

  function close() {
    dropdown.hidden = true;
    dropdown.remove();
    button.classList.remove('is-open');
    if (dismiss) dismiss();
    dismiss = null;
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
  }

  button.addEventListener('click', () => (dropdown.hidden ? open() : close()));
  renderValue();

  return {
    node: button,
    set(next) {
      state = { ...state, ...next };
      renderValue();
      if (!dropdown.hidden) renderOptions();
    },
    get value() {
      return state.value;
    },
    close,
  };
}

/** Строка-чекбокс со значком ресурса и правой метрикой. */
export function createCheck({ label, checked = false, meta = null, prefix = null, onToggle }) {
  const box = el('span.check__box', null, icon('check', { size: 11, stroke: 3 }));
  const metaNode = el('span.check__meta', { text: meta ?? '' });
  const node = el(
    'label.check',
    {
      class: checked ? 'is-checked' : '',
      onclick: (event) => {
        event.preventDefault();
        onToggle();
      },
    },
    [box, prefix, el('span.check__label', { text: label }), metaNode],
  );
  return {
    node,
    update(nextChecked, nextMeta) {
      node.classList.toggle('is-checked', Boolean(nextChecked));
      if (nextMeta !== undefined) metaNode.textContent = nextMeta ?? '';
    },
  };
}
