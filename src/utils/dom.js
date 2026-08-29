/** Минимальные помощники для работы с DOM без внешних зависимостей. */

/**
 * el('div.card', { onclick }, [children]) — создание элемента по css-подобной строке.
 */
export function el(spec, props = null, children = null) {
  const [tagPart, ...classParts] = String(spec).split('.');
  const tag = tagPart || 'div';
  const node = document.createElement(tag);
  if (classParts.length) node.className = classParts.join(' ');

  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') {
        node.className = node.className ? `${node.className} ${value}` : value;
      } else if (key === 'html') {
        node.innerHTML = value;
      } else if (key === 'text') {
        node.textContent = value;
      } else if (key === 'dataset') {
        Object.assign(node.dataset, value);
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(node.style, value);
      } else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2), value);
      } else if (value === true) {
        node.setAttribute(key, '');
      } else {
        node.setAttribute(key, value);
      }
    }
  }

  appendChildren(node, children);
  return node;
}

export function appendChildren(node, children) {
  if (children == null) return node;
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function mount(node, children) {
  clear(node);
  appendChildren(node, children);
  return node;
}

export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/** Закрытие поповера/меню по клику вне узла и по Escape. */
export function onDismiss(node, handler) {
  const onPointer = (event) => {
    if (!node.contains(event.target)) handler(event);
  };
  const onKey = (event) => {
    if (event.key === 'Escape') handler(event);
  };
  setTimeout(() => {
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
  }, 0);
  return () => {
    document.removeEventListener('pointerdown', onPointer);
    document.removeEventListener('keydown', onKey);
  };
}
