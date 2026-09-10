/**
 * Сборка дизайн-макетов РКИИЭ 2.0.
 *
 * Макеты — статические HTML-страницы: их можно открыть в браузере, снять
 * скриншотом и построчно перенести в приложение. Этот файл нужен только
 * чтобы не дублировать общий каркас в десяти файлах руками:
 *
 *     node design/build.mjs
 *
 * Разметку правьте здесь, а не в сгенерированных *.html.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { iconSvg, RESOURCE_ICONS } from '../src/ui/icons.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const ico = (name, size = 16, stroke = 1.7) => iconSvg(name, { size, cls: 'icon', stroke });
const icoSm = (name) => iconSvg(name, { size: 14, cls: 'icon icon--sm', stroke: 1.8 });

const MOON = `<svg class="icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"/></svg>`;
const SUN = `<svg class="icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"/></svg>`;

/* ========================== Данные для макетов ==========================
   Цифры совпадают с контрольными значениями демо (CITY_TARGETS), чтобы
   макет и приложение не расходились.                                     */

const CITY = {
  objects: '165 287', networkKm: '2 356', attention: '16 192', complete: '97',
  sources: 71, heatpoints: '5 432', consumers: '132 814', substations: '2 184',
  pumps: 646, networks: '14 380', equipment: '9 760',
  okrugs: 12, districts: 146, events: 70, actualOn: '07.08.2026',
};

const RES = [
  { id: 'heat',      name: 'Теплоснабжение',   short: 'Тепло',      count: '51 620', share: 31 },
  { id: 'power',     name: 'Электроснабжение', short: 'Электро',    count: '48 248', share: 29 },
  { id: 'water',     name: 'Водоснабжение',    short: 'Вода',       count: '32 946', share: 20 },
  { id: 'gas',       name: 'Газоснабжение',    short: 'Газ',        count: '27 210', share: 16 },
  { id: 'storm',     name: 'Ливневый сток',    short: 'Ливнёвка',   count: '2 843',  share: 2 },
  { id: 'collector', name: 'Коллекторы',       short: 'Коллекторы', count: '2 420',  share: 1 },
];

/* Состав каждого ресурса по типам. Суммы по типам сходятся с контрольными
   значениями города: 71 источник, 5 432 ЦТП, 2 184 подстанции, 646 насосных,
   14 380 участков сетей, 9 760 единиц оборудования, 132 814 потребителей. */
const RES_TYPES = {
  heat:      [['Источники', '33'], ['Тепловые пункты', '5 432'], ['Участки сетей', '3 206'], ['Оборудование', '2 342'], ['Потребители', '40 607']],
  power:     [['Источники', '21'], ['Подстанции', '2 184'], ['Участки сетей', '3 020'], ['Оборудование', '2 538'], ['Потребители', '40 485']],
  water:     [['Источники', '11'], ['Насосные станции', '549'], ['Участки сетей', '2 588'], ['Оборудование', '1 757'], ['Потребители', '28 041']],
  gas:       [['Источники', '6'], ['Участки сетей', '2 157'], ['Оборудование', '1 366'], ['Потребители', '23 681']],
  storm:     [['Насосные станции', '97'], ['Участки сетей', '1 869'], ['Оборудование', '877']],
  collector: [['Участки сетей', '1 540'], ['Оборудование', '880']],
};

const STATUSES = [
  { id: 'ok',     name: 'В работе',                  count: '143 625', share: 87 },
  { id: 'warn',   name: 'Требует внимания',          count: '14 543',  share: 9 },
  { id: 'alert',  name: 'Технологическое нарушение', count: '1 649',   share: 1 },
  { id: 'nodata', name: 'Нет данных',                count: '5 470',   share: 3 },
];

const OKRUG_PILLS = [
  { code: 'САО',  x: 37.3,  y: 8.98,  n: 2 },
  { code: 'СВАО', x: 53.0,  y: 23.18, n: 12, hot: true },
  { code: 'СЗАО', x: 40.42, y: 31.42, n: 8 },
  { code: 'ВАО',  x: 62.89, y: 38.06, n: 8 },
  { code: 'ЦАО',  x: 52.57, y: 44.49, n: 4 },
  { code: 'ЗАО',  x: 42.01, y: 53.55, n: 12, hot: true },
  { code: 'ЮВАО', x: 61.48, y: 56.42, n: 12, hot: true },
  { code: 'ЮАО',  x: 55.52, y: 67.11, n: 5 },
  { code: 'ЮЗАО', x: 48.27, y: 71.65, n: 3 },
  { code: 'ЗелАО', x: 25.63, y: 2.4,  n: 1 },
];

const ORGS = [
  { name: 'ПАО «МОЭК»', count: '29 221', share: 100, res: 'heat' },
  { name: 'АО «Мосводоканал»', count: '25 644', share: 88, res: 'water' },
  { name: 'АО «Мосгаз»', count: '23 400', share: 80, res: 'gas' },
  { name: 'ПАО «Россети Московский регион»', count: '23 203', share: 79, res: 'power' },
  { name: 'ПАО «Мосэнерго»', count: '18 698', share: 64, res: 'power' },
  { name: 'АО «ОЭК»', count: '14 924', share: 51, res: 'power' },
  { name: 'ГУП «Мосводосток»', count: '10 145', share: 35, res: 'storm' },
  { name: 'АО «МТК»', count: '7 610', share: 26, res: 'heat' },
];

const OKRUG_ROWS = [
  { name: 'Восточный АО', count: '21 338', share: 100 },
  { name: 'Западный АО', count: '21 035', share: 99 },
  { name: 'Центральный АО', count: '20 991', share: 98 },
  { name: 'Южный АО', count: '17 818', share: 84 },
  { name: 'Юго-Восточный АО', count: '16 291', share: 76 },
  { name: 'Юго-Западный АО', count: '15 722', share: 74 },
  { name: 'Северо-Восточный АО', count: '13 909', share: 65 },
  { name: 'Северный АО', count: '13 319', share: 62 },
  { name: 'Северо-Западный АО', count: '12 807', share: 60 },
  { name: 'Троицкий АО', count: '8 902', share: 42 },
  { name: 'Новомосковский АО', count: '2 636', share: 12 },
  { name: 'Зеленоградский АО', count: '519', share: 2 },
];

/* Пересчёт координат из системы SVG (1600×940) в проценты области карты,
   которая ниже шапки и выше строки состояния (1600×914, object-fit: cover). */
const BOX_H = 914, SVG_H = 940;
const ax = (x) => `${x.toFixed(2)}%`;
/* Приближение карты в макете: та же схема, увеличенная вокруг точки. */
const ZK = 3.2, ZOX = 46, ZOY = 55;
const zx = (x) => `${(ZOX + (x - ZOX) * ZK).toFixed(2)}%`;
const zy = (y) => `${(ZOY + (parseFloat(ay(y)) - ZOY) * ZK).toFixed(2)}%`;
const ay = (y) => `${(((y / 100) * SVG_H + (BOX_H - SVG_H) / 2) / BOX_H * 100).toFixed(2)}%`;

/* ============================ Каркас страницы ========================== */

function page({ title, body, theme = 'light', bodyClass = '' }) {
  return `<!doctype html>
<html lang="ru"${theme === 'dark' ? ' data-theme="dark"' : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — РКИИЭ 2.0</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%232f63e2'/%3E%3Cpath d='M16 6l10 5.5-10 5.5L6 11.5z' fill='none' stroke='white' stroke-width='2' stroke-linejoin='round'/%3E%3Cpath d='M6 17l10 5.5L26 17' fill='none' stroke='white' stroke-width='2' stroke-linejoin='round'/%3E%3C/svg%3E">
<link rel="stylesheet" href="css/tokens.css">
<link rel="stylesheet" href="css/ui.css">
</head>
<body class="${bodyClass}">
${body}
</body>
</html>
`;
}

const NAV = [
  { id: 'map', name: 'Карта', icon: 'map' },
  { id: 'validation', name: 'Проверка данных', icon: 'shield', badge: 12 },
  { id: 'analytics', name: 'Аналитика', icon: 'chart' },
  { id: 'reports', name: 'Отчёты', icon: 'doc' },
  { id: 'admin', name: 'Администрирование', icon: 'gear' },
];

function topbar(active = 'map', { theme = 'light' } = {}) {
  return `<header class="topbar">
  <div class="brand">
    <span class="brand__mark">${iconSvg('layers', { size: 18, cls: 'icon', stroke: 1.9 })}</span>
    <span class="brand__text">
      <span class="brand__name">РКИИЭ 2.0</span>
      <span class="brand__sub">Мониторинг ресурсоснабжения Москвы</span>
    </span>
  </div>
  <nav class="nav">
    ${NAV.map((s) => `<button class="nav__item${s.id === active ? ' is-active' : ''}">${icoSm(s.icon)}<span>${s.name}</span>${s.badge ? `<span class="nav__badge">${s.badge}</span>` : ''}</button>`).join('\n    ')}
  </nav>
  <span class="u-spacer"></span>
  <button class="cmdk">${icoSm('search')}<span class="cmdk__text">Поиск и команды</span><span class="kbd">⌘K</span></button>
  <div class="freshness" title="Система показывает последнюю принятую выгрузку, а не данные в реальном времени">
    <span class="freshness__pulse"></span>
    <span>Данные на <strong>${CITY.actualOn}</strong></span>
  </div>
  <button class="iconbtn" title="Уведомления">${ico('bell')}<span class="iconbtn__dot">7</span></button>
  <button class="iconbtn" title="${theme === 'dark' ? 'Дневной режим' : 'Диспетчерский режим (тёмная тема)'}">${theme === 'dark' ? SUN : MOON}</button>
  <div class="user">
    <span class="avatar">ИИ</span>
    <span class="user__text">
      <span class="user__name">Иванов И.</span>
      <span class="user__role">Диспетчер</span>
    </span>
  </div>
</header>`;
}

function statusbar(extra = '') {
  return `<footer class="statusbar">
  <span>© РКИИЭ 2.0 · Москва</span>
  <span>Выгрузка принята <strong>${CITY.actualOn}, 06:20</strong> · источник: РСО (12 организаций)</span>
  <span class="u-spacer"></span>
  ${extra}
  <span>В выборке <strong>${CITY.objects}</strong> объектов</span>
  <span>© OpenStreetMap</span>
</footer>`;
}

function stage({ map = 'map-light-admin.svg', children = '' }) {
  return `<div class="stage">
  <img class="stage__map" src="assets/${map}" alt="Схема Москвы">
  <div class="stage__vignette"></div>
  ${children}
</div>`;
}

export { zx, zy, ZK, ZOX, ZOY, DIR, ico, icoSm, iconSvg, RESOURCE_ICONS, CITY, RES, STATUSES, OKRUG_PILLS, ORGS,
         OKRUG_ROWS, ax, ay, page, topbar, statusbar, stage, mkdirSync, writeFileSync, join };

/* ======================= Повторяемые фрагменты ========================= */

const resRow = (r, on) => `<label class="checkrow${on ? ' is-on' : ''}">
      <span class="checkbox${on === 'mixed' ? ' checkbox--mixed' : ''}">${on === 'mixed' ? '' : iconSvg('check', { size: 12, cls: '', stroke: 3 })}</span>
      <span class="res res--sm res--${r.id}">${iconSvg(RESOURCE_ICONS[r.id], { size: 11, cls: '', stroke: 2 })}</span>
      <span class="checkrow__label">${r.name}</span>
      <span class="checkrow__meta">${r.share} %</span>
    </label>`;

const statusRow = (s, on) => `<label class="checkrow${on ? ' is-on' : ''}">
      <span class="checkbox">${on ? iconSvg('check', { size: 12, cls: '', stroke: 3 }) : ''}</span>
      <span class="status status--${s.id}"><span class="status__dot"></span></span>
      <span class="checkrow__label">${s.name}</span>
      <span class="checkrow__meta">${s.count}</span>
    </label>`;

const mrow = (name, value, share, color, sub) => `<div class="mrow mrow--link">
      <span class="res res--sm res--${color}">${iconSvg(RESOURCE_ICONS[color] || 'dot', { size: 11, cls: '', stroke: 2 })}</span>
      <span>
        <span class="mrow__name">${name}</span>
        <span class="mrow__track" style="margin-top:5px"><span class="mrow__fill" style="width:${share}%;background:var(--res-${color})"></span></span>
      </span>
      <span style="text-align:right">
        <span class="mrow__value">${value}</span>
        ${sub ? `<br><span class="mrow__sub">${sub}</span>` : ''}
      </span>
    </div>`;

const kpi = (label, value, unit, foot, mod = '') => `<div class="kpi ${mod}">
      <span class="kpi__label">${label}</span>
      <div class="kpi__value">${value}${unit ? `<span class="kpi__unit">${unit}</span>` : ''}</div>
      <div class="kpi__foot">${foot}</div>
    </div>`;

/** Кольцевая диаграмма: доли от целого, подписанные числом и процентом. */
function donut(items, { total, label, size = 92, thickness = 13 } = {}) {
  const sum = items.reduce((a, i) => a + i.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const gap = 2.5;
  let offset = 0;
  const arcs = items.map((i) => {
    const len = Math.max(0, (i.value / sum) * c - gap);
    const arc = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${i.color}"
      stroke-width="${thickness}" stroke-linecap="butt"
      stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}"
      stroke-dashoffset="${(-offset).toFixed(2)}"/>`;
    offset += (i.value / sum) * c;
    return arc;
  }).join('');
  return `<div class="donutbox"><div class="donut" style="width:${size}px;height:${size}px">
      <svg width="${size}" height="${size}" role="img" aria-label="Доли: ${items.map((i) => `${i.name} ${i.value}`).join(', ')}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="${thickness}"/>
        ${arcs}
      </svg>
      <span class="donut__hole"><span class="donut__value">${total}</span><br><span class="donut__label">${label}</span></span>
    </div>
    <div class="donut__legend">
      ${items.map((i) => `<span class="donut__row">
        <span class="legend__swatch legend__swatch--dot" style="background:${i.color}"></span>
        <span class="donut__name">${i.name}</span>
        <span class="donut__num">${String(i.value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}</span>
        <span class="donut__pct">${Math.round((i.value / sum) * 100)} %</span>
      </span>`).join('\n      ')}
    </div></div>`;
}

/** Левая панель отбора. */
function filterPanel() {
  return `<aside class="panel panel--left">
  <div class="panel__head">
    <div style="flex:1;min-width:0">
      <div class="panel__title">Отбор объектов</div>
      <div class="panel__sub">Что показывать на карте</div>
    </div>
    <button class="panel__collapse" title="Свернуть">${ico('chevronLeft')}</button>
  </div>
  <div class="panel__body">

    <div class="group" style="padding-top:0">
      <button class="select" style="height:34px">
        ${icoSm('star')}
        <span class="select__value" title="Шаблон задаёт, что искать, и не меняет территорию">Теплоснабжение: источники и ЦТП</span>
        ${icoSm('chevronDown')}
      </button>
    </div>

    <div class="group">
      <button class="group__head">${icoSm('layers')}<span>Ресурс и типы объектов</span><span class="group__count">2 из 6</span>${icoSm('chevronDown')}</button>
      <div class="group__body">
        ${resRow(RES[0], true)}
        <div style="margin:2px 0 8px 30px;display:flex;flex-wrap:wrap;gap:5px">
          <span class="chip chip--plain" style="height:24px;font-size:var(--t-xs)">Источники · 33</span>
          <span class="chip chip--plain" style="height:24px;font-size:var(--t-xs)">ЦТП · 5 432</span>
          <span class="chip chip--plain" style="height:24px;font-size:var(--t-xs);opacity:.55">Сети</span>
          <span class="chip chip--plain" style="height:24px;font-size:var(--t-xs);opacity:.55">Оборудование</span>
        </div>
        ${resRow(RES[1], true)}
        ${RES.slice(2).map((r) => resRow(r, false)).join('\n        ')}
      </div>
    </div>

    <div class="group is-collapsed">
      <button class="group__head">${icoSm('factory')}<span>Организация / РСО</span><span class="group__count">все 12</span><span class="chev">${icoSm('chevronDown')}</span></button>
      <div class="group__body">
        <button class="select"><span class="select__value is-placeholder">Все организации · 12</span>${icoSm('chevronDown')}</button>
        <div class="field__hint">Список зависит от ресурса</div>
      </div>
    </div>

    <div class="group">
      <button class="group__head">${icoSm('target')}<span>Состояние</span><span class="group__count">1 из 4</span>${icoSm('chevronDown')}</button>
      <div class="group__body">
        ${statusRow(STATUSES[0], false)}
        ${statusRow(STATUSES[1], true)}
        ${statusRow(STATUSES[2], false)}
        ${statusRow(STATUSES[3], false)}
      </div>
    </div>

    <div class="group">
      <div class="group__head" style="padding-bottom:2px">Требуют разбора<span class="u-spacer"></span><span class="group__count">15 909</span></div>
      <div class="field__hint" style="margin:0 0 6px;white-space:nowrap">исправные не показаны · 83 959</div>
      <div>
        ${donut([
          { name: 'Требуют внимания', value: 11240, color: 'var(--st-warn)' },
          { name: 'Нет данных', value: 3020, color: 'var(--st-nodata)' },
          { name: 'Нарушения', value: 1649, color: 'var(--st-alert)' },
        ], { total: '15 909', label: 'ОБЪЕКТА', size: 80, thickness: 12 })}
      </div>
    </div>

  </div>
  <div class="panel__foot">
    <span>Найдено <strong class="num" style="color:var(--ink)">99 868</strong> объектов</span>
    <span class="u-spacer"></span>
    <button class="btn btn--link">Сбросить</button>
  </div>
</aside>`;
}

/** Выбор охвата: хлебные крошки вместо трёх отдельных списков. */
function scopeControl({ okrug = null, district = null, street = null, reset = false } = {}) {
  const item = (value, placeholder) => value
    ? `<button class="scope__item scope__item--set">${value} ${icoSm('chevronDown')}</button>`
    : `<button class="scope__item scope__item--empty">${placeholder} ${icoSm('chevronDown')}</button>`;
  return `<div class="scope">
    <div class="scope__head">
      <span class="eyebrow">Охват сведений</span>
      <span class="u-spacer"></span>
      <button class="btn btn--link"${reset ? '' : ' style="opacity:.4"'}>Сбросить</button>
      <button class="btn btn--soft btn--sm" title="Перевести карту к выбранной территории">${icoSm('pinSearch')} На карте</button>
    </div>
    <div class="scope__box">
      <span class="scope__item" style="font-weight:600">${icoSm('map')} Москва</span>
      <span class="scope__sep">${icoSm('chevronRight')}</span>
      ${item(okrug, 'Округ')}
      <span class="scope__sep">${icoSm('chevronRight')}</span>
      ${item(district, 'Район')}
      <span class="scope__sep">${icoSm('chevronRight')}</span>
      ${item(street, 'Улица')}
    </div>
  </div>`;
}

/** Правая панель сведений — обзор по городу. */
function inspectorCity() {
  return `<aside class="panel panel--right">
  <div class="panel__head">
    <div style="flex:1;min-width:0">
      <div class="panel__title">Москва</div>
      <div class="panel__sub">Городской уровень · 12 округов · 146 районов</div>
    </div>
    <button class="panel__collapse" title="Свернуть">${ico('chevronRight')}</button>
  </div>

  ${scopeControl({})}

  <div style="padding:0 var(--s-4) var(--s-3)">
    <div class="tabs">
      <button class="tabs__item is-active">Обзор</button>
      <button class="tabs__item">Состав</button>
      <button class="tabs__item">Организации</button>
      <button class="tabs__item">Данные</button>
    </div>
  </div>

  <div class="panel__body">
    <div class="kpigrid" style="margin-bottom:var(--s-3)">
      ${kpi('Объектов в реестре', CITY.objects, '', '<span class="delta delta--up">+0,4 %</span> к прошлой выгрузке', 'kpi--accent')}
      ${kpi('Протяжённость сетей', CITY.networkKm, ' км', 'по 6 системам')}
      ${kpi('Требуют внимания', CITY.attention, '', '<span class="status status--warn"><span class="status__dot"></span>9 % реестра</span>')}
      ${kpi('Полнота паспортов', CITY.complete, ' %', '<span class="delta delta--up">+1,2 п.п.</span> за месяц')}
    </div>

    <div class="group" style="border-top:1px solid var(--border)">
      <div class="group__head">Объекты по ресурсам<span class="u-spacer"></span><span class="group__count">6 систем · 165 287</span></div>
      <div class="stack" style="margin:2px 0 10px" title="Структура реестра по ресурсам">
        ${RES.map((r) => `<span class="stack__seg" style="flex-grow:${r.share};background:var(--res-${r.id})" title="${r.name} — ${r.share} %"></span>`).join('')}
      </div>
      ${RES.map((r, i) => `<button class="resrow${i === 0 ? ' is-open' : ''}">
        <span class="res res--sm res--${r.id}">${iconSvg(RESOURCE_ICONS[r.id], { size: 11, cls: '', stroke: 2 })}</span>
        <span class="resrow__name">${r.name}</span>
        <span class="resrow__num">${r.count}</span>
        <span class="resrow__pct">${r.share} %</span>
        <span class="resrow__chev">${icoSm('chevronDown')}</span>
      </button>${i === 0 ? `
      <div class="restypes">
        ${RES_TYPES[r.id].map(([n, v]) => `<span class="restypes__row">${n}<span class="restypes__num">${v}</span></span>`).join('\n        ')}
      </div>` : ''}`).join('\n      ')}
    </div>

    <div class="group">
      <div class="group__head">События мониторинга<span class="u-spacer"></span><button class="btn btn--link">Журнал</button></div>
      <div class="mrow mrow--link" style="grid-template-columns:auto 1fr auto">
        <span class="res res--sm res--soft res--power">${iconSvg('warning', { size: 11, cls: '', stroke: 2 })}</span>
        <span>
          <span class="mrow__name">Открытые события</span>
          <span class="mrow__sub">за 7 суток <b>+18</b></span>
        </span>
        <span style="display:flex;align-items:center;gap:10px">
          <svg width="64" height="26" viewBox="0 0 64 26" aria-hidden="true">
            <polyline points="2,18 12,16 22,19 32,13 42,15 52,9 62,5" fill="none" stroke="var(--st-alert)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="mrow__value">70</span>
        </span>
      </div>
    </div>
  </div>

  <div class="panel__foot">
    <button class="btn btn--ghost btn--sm" style="flex:1">${icoSm('list')} Список объектов</button>
    <button class="btn btn--primary btn--sm" style="flex:1">${icoSm('doc')} Отчёт</button>
  </div>
</aside>`;
}

/** Панель инструментов карты — внизу поля, как в действующей системе. */
function toolbar({ active = '', leftOnly = false, style = '' } = {}) {
  const tools = [
    ['ruler', 'Измерить расстояние'],
    ['pin', 'Поставить метку'],
    ['polygon', 'Выделить область'],
    ['sep', ''],
    ['layers', 'Тематический слой'],
    ['eye', 'Легенда'],
    ['list', 'Список объектов'],
    ['sep', ''],
    ['arrowsDiag', 'Во весь экран'],
  ];
  return `<div class="mapctl toolbar${leftOnly ? ' toolbar--left-only' : ''}"${style ? ` style="${style}"` : ''}>
    ${tools.map(([id, title]) => id === 'sep'
      ? '<span class="toolbar__sep"></span>'
      : `<button class="toolbar__btn${id === active ? ' is-active' : ''}" title="${title}">${ico(id)}</button>`).join('\n    ')}
    <span class="toolbar__sep"></span>
    <label class="toolbar__switch">
      <span class="switch is-on"><span class="switch__track"><span class="switch__knob"></span></span></span>
      Режим просмотра
    </label>
  </div>`;
}

function zoombox({ right = '400px', bottom = '112px' } = {}) {
  return `<div class="mapctl zoombox" style="right:${right};bottom:${bottom}">
    <button class="zoombox__btn" title="Приблизить">${ico('plus')}</button>
    <span class="toolrail__sep" style="margin:1px 5px"></span>
    <button class="zoombox__btn" title="Отдалить">${ico('minus')}</button>
  </div>`;
}

function basethumb({ right = '400px', bottom = '14px', map = 'map-light-plain.svg', name = 'Схема' } = {}) {
  return `<button class="mapctl basethumb" style="right:${right};bottom:${bottom}" title="Картографическая подложка">
    <img src="assets/${map}" alt="">
    <span class="basethumb__label">${name}</span>
  </button>`;
}

function scalebar({ left = '600px', bottom = '22px' } = {}) {
  return `<div class="scalebar" style="left:${left};bottom:${bottom}">
    <span class="scalebar__line" style="width:96px"></span>
    <span>10 км</span>
  </div>`;
}

/* ============================== Экраны ================================= */

const SCREENS = [];
const screen = (file, title, note, html, theme = 'light') => SCREENS.push({ file, title, note, html, theme });

/* --- 01. Карта: обзор города ------------------------------------------- */
screen('01-map-city.html', 'Карта — обзор города',
  'Главный экран. Карта во весь кадр, панели плавают над ней; открытые нарушения видны на любом масштабе.',
  `<div class="app">
${topbar('map')}
<div class="app__body">
${stage({ map: 'map-light-admin.svg', children: `
  ${OKRUG_PILLS.map((p) => `<button class="pill${p.hot ? ' pill--hot' : ''}" style="left:${ax(p.x)};top:${ay(p.y)}">${p.code}<span class="pill__count">${p.n}</span></button>`).join('\n  ')}

  <button class="marker marker--alert" style="left:${ax(49.9)};top:${ay(27.9)};background:var(--res-heat-soft);color:var(--res-heat-deep)" title="РТС «Отрадное» — технологическое нарушение">
    ${iconSvg('factory', { size: 14, cls: '', stroke: 2 })}
    <span class="marker__flag">${iconSvg('warning', { size: 9, cls: '', stroke: 3 })}</span>
  </button>
  <button class="marker marker--alert" style="left:${ax(60.6)};top:${ay(60.4)};background:var(--res-water-soft);color:var(--res-water-deep)" title="КНС «Марьино» — технологическое нарушение">
    ${iconSvg('drop', { size: 14, cls: '', stroke: 2 })}
    <span class="marker__flag">${iconSvg('warning', { size: 9, cls: '', stroke: 3 })}</span>
  </button>
  <button class="marker marker--warn" style="left:${ax(44.3)};top:${ay(48.2)};background:var(--res-power-soft);color:var(--res-power-deep)" title="ПС «Пресня» — требует внимания">
    ${iconSvg('bolt', { size: 14, cls: '', stroke: 2 })}
  </button>

  <div class="srcpin" style="left:${ax(46.6)};top:${ay(56.2)}">
    <span class="srcpin__mark">${iconSvg('factory', { size: 15, cls: '', stroke: 2 })}</span>
    <span class="srcpin__name">ТЭЦ-12</span>
  </div>
  <div class="srcpin" style="left:${ax(57.2)};top:${ay(36.4)}">
    <span class="srcpin__mark" style="background:var(--res-power)">${iconSvg('bolt', { size: 15, cls: '', stroke: 2 })}</span>
    <span class="srcpin__name">ТЭЦ-23</span>
  </div>

  <div class="chipbar">
    <span class="chip"><span class="chip__dot" style="background:var(--res-heat)"></span>Теплоснабжение<button class="chip__x">${iconSvg('close', { size: 11, cls: '', stroke: 2.4 })}</button></span>
    <span class="chip"><span class="chip__dot" style="background:var(--res-power)"></span>Электроснабжение<button class="chip__x">${iconSvg('close', { size: 11, cls: '', stroke: 2.4 })}</button></span>
    <span class="chip"><span class="status status--warn"><span class="status__dot"></span></span>Требует внимания<button class="chip__x">${iconSvg('close', { size: 11, cls: '', stroke: 2.4 })}</button></span>
    <button class="chip chip--ghost">Сбросить всё</button>
  </div>

  <div class="mapctl legend" style="left:332px;bottom:76px">
    <div class="legend__title">Условные обозначения</div>
    <div class="legend__sub">Заливка значка — ресурс, кольцо — состояние</div>
    <div class="legend__row"><span class="legend__swatch" style="background:var(--res-heat)"></span>Теплоснабжение<span class="legend__count">51 620</span></div>
    <div class="legend__row"><span class="legend__swatch" style="background:var(--res-power)"></span>Электроснабжение<span class="legend__count">48 248</span></div>
    <div class="legend__row" style="margin-top:6px;padding-top:8px;border-top:1px solid var(--border)">
      <span class="legend__swatch legend__swatch--dot" style="background:transparent;border:2px solid var(--st-ok)"></span>В работе</div>
    <div class="legend__row"><span class="legend__swatch legend__swatch--dot" style="background:transparent;border:2px solid var(--st-warn)"></span>Требует внимания</div>
    <div class="legend__row"><span class="legend__swatch legend__swatch--dot" style="background:transparent;border:2px solid var(--st-alert)"></span>Технологическое нарушение</div>
    <div class="legend__row"><span class="legend__swatch legend__swatch--dot" style="background:transparent;border:2px dashed var(--st-nodata)"></span>Нет данных</div>
  </div>

  ${scalebar({ left: '332px', bottom: '26px' })}
  ${toolbar({ active: 'eye' })}
  ${zoombox({})}
  ${basethumb({})}
` })}
${filterPanel()}
${inspectorCity()}
</div>
${statusbar('')}
</div>`);

/* --- 02. Тематический слой: износ ---------------------------------------- */
const WEAR_TOP = [
  { name: 'Хамовники', okrug: 'ЦАО', wear: 80, objects: '868' },
  { name: 'Обручевский', okrug: 'ЮЗАО', wear: 79, objects: '930' },
  { name: 'Войковский', okrug: 'САО', wear: 78, objects: '1 411' },
  { name: 'Новокосино', okrug: 'ВАО', wear: 78, objects: '2 736' },
  { name: 'Бутырский', okrug: 'СВАО', wear: 77, objects: '2 215' },
  { name: 'Косино-Ухтомский', okrug: 'ВАО', wear: 77, objects: '1 591' },
  { name: 'Южное Тушино', okrug: 'СЗАО', wear: 77, objects: '1 954' },
  { name: 'Алексеевский', okrug: 'СВАО', wear: 75, objects: '2 138' },
  { name: 'Сокольники', okrug: 'ВАО', wear: 75, objects: '2 100' },
  { name: 'Капотня', okrug: 'ЮВАО', wear: 74, objects: '1 879' },
  { name: 'Печатники', okrug: 'ЮВАО', wear: 73, objects: '2 323' },
  { name: 'Кунцево', okrug: 'ЗАО', wear: 73, objects: '2 527' },
];
const wearStep = (v) => `var(--seq-wear-${Math.min(5, Math.floor((v - 28) / 52 * 5) + 1)})`;

screen('02-map-thematic.html', 'Тематический слой и рейтинг районов',
  'Износ показан одной последовательной шкалой, а не «светофором». В легенде — распределение районов, чтобы шкала читалась как данные.',
  `<div class="app">
${topbar('map')}
<div class="app__body">
${stage({ map: 'map-light-wear.svg', children: `
  <div class="chipbar">
    <span class="chip"><span class="chip__dot" style="background:var(--seq-wear-4)"></span>Слой: износ сетей и оборудования<button class="chip__x">${iconSvg('close', { size: 11, cls: '', stroke: 2.4 })}</button></span>
    <span class="chip"><span class="chip__dot" style="background:var(--res-heat)"></span>Теплоснабжение<button class="chip__x">${iconSvg('close', { size: 11, cls: '', stroke: 2.4 })}</button></span>
    <button class="chip chip--ghost">Сбросить всё</button>
  </div>

  ${WEAR_TOP.slice(0, 3).map((d, i) => `<button class="pill pill--label" style="left:${ax([49.98, 35.42, 60.83][i])};top:${ay([49.24, 39.31, 64.05][i])}">${d.name} · ${d.wear} %</button>`).join('\n  ')}

  <div class="mapctl legend" style="left:332px;bottom:76px;width:272px">
    <div class="legend__title">Износ сетей и оборудования</div>
    <div class="legend__sub">Средневзвешенный по району, % · 146 районов</div>
    <div class="hist">
      ${[4, 7, 11, 16, 21, 26, 24, 19, 14, 9, 6, 3].map((h, i) => `<span class="hist__bar" style="height:${h * 3.4}%;background:${`var(--seq-wear-${Math.min(5, Math.floor(i / 12 * 5) + 1)})`}"></span>`).join('')}
    </div>
    <div class="ramp ramp--wear"></div>
    <div class="ramp__scale"><span>28 % · новое</span><span>80 % · предельный</span></div>
    <div class="legend__row" style="margin-top:9px;padding-top:8px;border-top:1px solid var(--border)">
      <span class="legend__swatch" style="background:repeating-linear-gradient(45deg,var(--st-nodata) 0 3px,transparent 3px 6px),var(--st-nodata-soft)"></span>Нет данных о годе ввода<span class="legend__count">7</span>
    </div>
    <button class="btn btn--soft btn--sm btn--full" style="margin-top:10px">${icoSm('list')} Список районов</button>
  </div>

  <div class="dropdown" style="left:calc(50% + (var(--panel-w) - var(--inspector-w)) / 2 - 111px);bottom:76px;width:266px">
    <div class="cmd__group eyebrow">Тематический слой</div>
    <div class="dropdown__item">${icoSm('map')}<span>Административное деление</span></div>
    <div class="dropdown__item">${icoSm('square')}<span>Без раскраски</span></div>
    <div class="dropdown__item is-selected">${icoSm('chart')}<span>Износ сетей и оборудования</span>${icoSm('check')}</div>
    <div class="dropdown__item">${icoSm('waves')}<span>Интенсивность потребления</span></div>
    <div class="dropdown__item">${icoSm('factory')}<span>Зоны действия источников</span></div>
    <div class="dropdown__sep"></div>
    <div class="dropdown__item">${icoSm('list')}<span>Рейтинг районов по слою</span><span class="dropdown__meta">146</span></div>
  </div>

  ${scalebar({ left: '332px', bottom: '26px' })}
  ${toolbar({ active: 'layers' })}
  ${zoombox({})}
  ${basethumb({})}
` })}
${filterPanel()}
<aside class="panel panel--right">
  <div class="panel__head">
    <div style="flex:1;min-width:0">
      <div class="panel__title">Рейтинг районов</div>
      <div class="panel__sub">По износу сетей и оборудования</div>
    </div>
    <button class="panel__collapse">${ico('chevronRight')}</button>
  </div>
  <div style="padding:0 var(--s-4) var(--s-3);display:flex;gap:var(--s-2)">
    <span class="search" style="height:34px">${icoSm('search')}<input placeholder="Район или округ" value=""></span>
    <button class="btn btn--ghost btn--sm">${icoSm('filter')}</button>
  </div>
  <div style="padding:0 var(--s-4) var(--s-3)">
    <div class="segmented" style="width:100%">
      <button class="segmented__item is-active" style="flex:1">Хуже всего</button>
      <button class="segmented__item" style="flex:1">Лучше всего</button>
      <button class="segmented__item" style="flex:1">По алфавиту</button>
    </div>
  </div>
  <div class="panel__body" style="padding-top:2px">
    <div class="callout" style="margin-bottom:var(--s-3)">
      ${icoSm('info')}<span>Шкала считается по тем территориям, которые раскрашиваются: на городском масштабе — округа, дальше — районы.</span>
    </div>
    ${WEAR_TOP.map((d, i) => `<div class="mrow mrow--link" style="grid-template-columns:26px 1fr auto">
      <span class="num" style="color:var(--ink-4);font-size:var(--t-sm);text-align:right">${i + 1}</span>
      <span>
        <span class="mrow__name">${d.name}</span>
        <span class="mrow__track" style="margin-top:5px"><span class="mrow__fill" style="width:${d.wear}%;background:${wearStep(d.wear)}"></span></span>
        <span class="mrow__sub" style="margin-top:3px">${d.okrug} · ${d.objects} объектов</span>
      </span>
      <span style="text-align:right"><span class="mrow__value">${d.wear} %</span><span class="mrow__sub">износ</span></span>
    </div>`).join('\n    ')}
  </div>
  <div class="panel__foot">
    <button class="btn btn--ghost btn--sm" style="flex:1">${icoSm('download')} Выгрузить рейтинг</button>
  </div>
</aside>
</div>
${statusbar('')}
</div>`);

/* --- 03. Карточка территории --------------------------------------------- */
screen('03-card-district.html', 'Карточка территории',
  'Сводка по району — плавающая карточка у самой карты. Разделы сворачиваются, «критическая инфраструктура» раскрывается до категорий надёжности.',
  `<div class="app">
${topbar('map')}
<div class="app__body">
${stage({ map: 'map-light-admin.svg', children: `
  <div class="chipbar">
    <span class="chip"><span class="chip__dot" style="background:var(--res-heat)"></span>Теплоснабжение<button class="chip__x">${iconSvg('close', { size: 11, cls: '', stroke: 2.4 })}</button></span>
    <span class="chip">${icoSm('pin')}Район: Раменки<button class="chip__x">${iconSvg('close', { size: 11, cls: '', stroke: 2.4 })}</button></span>
    <button class="chip chip--ghost">Сбросить всё</button>
  </div>

  <div class="cluster" style="left:${ax(46.06)};top:${ay(53.67)};color:var(--ink)">
    <svg class="cluster__ring" viewBox="0 0 60 60"><circle cx="30" cy="30" r="27" fill="none" stroke="var(--res-heat)" stroke-width="5" stroke-dasharray="63 107" stroke-linecap="round" transform="rotate(-90 30 30)"/><circle cx="30" cy="30" r="27" fill="none" stroke="var(--res-power)" stroke-width="5" stroke-dasharray="45 125" stroke-dashoffset="-66" stroke-linecap="round" transform="rotate(-90 30 30)"/><circle cx="30" cy="30" r="27" fill="none" stroke="var(--res-water)" stroke-width="5" stroke-dasharray="32 138" stroke-dashoffset="-114" stroke-linecap="round" transform="rotate(-90 30 30)"/></svg>
    1 842
  </div>
  <button class="marker marker--alert" style="left:${ax(44.9)};top:${ay(56.2)};background:var(--res-water-soft);color:var(--res-water-deep)">
    ${iconSvg('drop', { size: 14, cls: '', stroke: 2 })}<span class="marker__flag">${iconSvg('warning', { size: 9, cls: '', stroke: 3 })}</span>
  </button>
  <div class="srcpin" style="left:${ax(48.4)};top:${ay(57.6)}">
    <span class="srcpin__mark">${iconSvg('factory', { size: 15, cls: '', stroke: 2 })}</span>
    <span class="srcpin__name">РТС «Раменки»</span>
  </div>

  <div class="mapcard" style="left:786px;top:78px;width:396px">
    <div class="mapcard__grip"></div>
    <div class="mapcard__head">
      <div style="flex:1;min-width:0">
        <div class="mapcard__title">Раменки</div>
        <div class="mapcard__sub" style="color:var(--ink-3)">Район · Западный административный округ</div>
      </div>
      <button class="mapcard__close" style="color:var(--ink-3)">${ico('close')}</button>
    </div>
    <div style="padding:0 var(--s-4) var(--s-3)">
      <div class="tabs"><button class="tabs__item is-active">Объекты</button><button class="tabs__item">Потребление</button></div>
    </div>
    <div class="mapcard__body">
      <div class="kpigrid" style="margin-bottom:var(--s-3)">
        ${kpi('Объектов', '1 842', '', '9 из них требуют внимания')}
        ${kpi('Сети', '31,4', ' км', 'износ 39 %')}
      </div>

      <div class="group" style="border-top:1px solid var(--border)">
        <div class="group__head">Состояние объектов</div>
        <div class="stack" style="margin:2px 0 10px">
          <span class="stack__seg" style="width:86%;background:var(--st-ok)"></span>
          <span class="stack__seg" style="width:9%;background:var(--st-warn)"></span>
          <span class="stack__seg" style="width:2%;background:var(--st-alert)"></span>
          <span class="stack__seg" style="width:3%;background:var(--st-nodata)"></span>
        </div>
        <div style="display:flex;gap:var(--s-4);flex-wrap:wrap">
          <span class="status status--ok"><span class="status__dot"></span>В работе · <b class="num">1 584</b></span>
          <span class="status status--warn"><span class="status__dot"></span>Внимание · <b class="num">166</b></span>
          <span class="status status--alert"><span class="status__dot"></span>Нарушения · <b class="num">37</b></span>
        </div>
      </div>
      <div class="group">
        <button class="group__head">Состав по типам<span class="u-spacer"></span>${icoSm('chevronDown')}</button>
        <div class="group__body">
          <div class="list">
            <div class="list__row"><span class="res res--sm res--heat">${iconSvg('factory', { size: 11, cls: '', stroke: 2 })}</span><span class="list__main"><span class="list__title">Источники</span><span class="list__sub">РТС «Раменки»</span></span><span class="list__value">1</span></div>
            <div class="list__row"><span class="res res--sm res--soft res--heat">${iconSvg('radiator', { size: 11, cls: '', stroke: 2 })}</span><span class="list__main"><span class="list__title">Тепловые пункты</span></span><span class="list__value">64</span></div>
            <div class="list__row"><span class="res res--sm res--soft res--power">${iconSvg('bolt', { size: 11, cls: '', stroke: 2 })}</span><span class="list__main"><span class="list__title">Подстанции</span></span><span class="list__value">27</span></div>
            <div class="list__row"><span class="res res--sm res--soft res--water">${iconSvg('building', { size: 11, cls: '', stroke: 2 })}</span><span class="list__main"><span class="list__title">Потребители</span><span class="list__sub">в т. ч. 38 объектов КИ</span></span><span class="list__value">1 508</span></div>
          </div>
        </div>
      </div>

      <div class="group">
        <button class="group__head">Действующие источники<span class="group__count">3</span>${icoSm('chevronDown')}</button>
        <div class="group__body">
          <div class="list">
            <div class="list__row"><span class="res res--sm res--heat">${iconSvg('factory', { size: 11, cls: '', stroke: 2 })}</span><span class="list__main"><span class="list__title" style="color:var(--a-600)">РТС «Раменки»</span><span class="list__sub">ПАО «МОЭК» · зона: 4 района</span></span><span class="badge badge--ok">в работе</span></div>
            <div class="list__row"><span class="res res--sm res--power">${iconSvg('bolt', { size: 11, cls: '', stroke: 2 })}</span><span class="list__main"><span class="list__title" style="color:var(--a-600)">ПС «Матвеевская»</span><span class="list__sub">ПАО «Россети МР»</span></span><span class="badge badge--warn">внимание</span></div>
          </div>
        </div>
      </div>

    </div>
    <div class="mapcard__foot">
      <div class="btnrow">
        <button class="btn btn--ghost btn--sm">${icoSm('list')} Объекты района</button>
        <button class="btn btn--primary btn--sm">${icoSm('doc')} Отчёт</button>
      </div>
    </div>
  </div>

  ${scalebar({ left: '332px', bottom: '26px' })}
  ${toolbar({})}
  ${zoombox({})}
  ${basethumb({})}
` })}
${filterPanel()}
${inspectorCity()}
</div>
${statusbar('')}
</div>`);

/* --- 04. Паспорт объекта -------------------------------------------------- */
const fact = (label, value, extra = '') => `<div style="padding:8px 0;border-bottom:1px solid var(--border);display:flex;gap:var(--s-3);align-items:baseline">
        <span style="flex:0 0 132px;font-size:var(--t-sm);color:var(--ink-3)">${label}</span>
        <span style="flex:1;min-width:0;font-size:var(--t-md);font-weight:500">${value}</span>${extra}
      </div>`;

screen('04-card-object.html', 'Паспорт объекта',
  'Шапка карточки окрашена по ресурсу, состояние вынесено значком и подписью. Показатели последней выгрузки — с отметкой, когда они приняты.',
  `<div class="app">
${topbar('map')}
<div class="app__body">
<div class="stage">
  <img class="stage__map" src="assets/map-light-plain.svg" alt="Схема Москвы" style="transform:scale(${ZK});transform-origin:${ZOX}% ${ZOY}%">
  <svg class="netlayer" viewBox="0 0 1600 914" preserveAspectRatio="none">
    <g fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M788 592 L744 558 L710 514 L664 478" stroke="var(--res-heat)" stroke-width="6" opacity=".9"/>
      <path d="M710 514 L700 550 L732 600 L800 636" stroke="var(--res-heat)" stroke-width="4" opacity=".85"/>
      <path d="M710 514 L764 498 L836 466 L900 470" stroke="var(--res-heat)" stroke-width="4" opacity=".85"/>
      <path d="M623 569 L676 612 L744 642 L822 656" stroke="var(--res-power)" stroke-width="3.2" stroke-dasharray="16 8" opacity=".85"/>
      <path d="M623 569 L590 508 L556 452" stroke="var(--res-power)" stroke-width="3.2" stroke-dasharray="16 8" opacity=".85"/>
      <path d="M754 454 L688 428 L604 440 L520 418" stroke="var(--res-water)" stroke-width="3.4" stroke-dasharray="2 9" opacity=".9"/>
      <path d="M788 532 L836 574 L878 640" stroke="var(--res-gas)" stroke-width="3" stroke-dasharray="22 6 4 6" opacity=".85"/>
    </g>
  </svg>
  <div class="stage__vignette"></div>
  <div class="chipbar">
    <span class="chip"><span class="chip__dot" style="background:var(--res-heat)"></span>Теплоснабжение<button class="chip__x">${iconSvg('close', { size: 11, cls: '', stroke: 2.4 })}</button></span>
    <span class="chip">${icoSm('pin')}Район: Раменки<button class="chip__x">${iconSvg('close', { size: 11, cls: '', stroke: 2.4 })}</button></span>
    <span class="chip chip--plain">Масштаб: объект</span>
  </div>

  ${[[44.6, 52.1, 'heat', 'radiator', ''], [45.3, 54.6, 'heat', 'radiator', ''], [43.8, 55.2, 'power', 'bolt', 'warn'],
     [46.4, 51.4, 'water', 'drop', ''], [45.9, 56.3, 'heat', 'radiator', ''], [47.1, 54.1, 'gas', 'flame', '']]
    .map(([x, y, r, i, st]) => `<button class="marker${st ? ` marker--${st}` : ''}" style="left:${zx(x)};top:${zy(y)};background:var(--res-${r}-soft);color:var(--res-${r}-deep)">${iconSvg(i, { size: 14, cls: '', stroke: 2 })}</button>`).join('\n  ')}
  <button class="marker marker--alert marker--lg" style="left:${zx(45.5)};top:${zy(53.4)};background:var(--res-heat-soft);color:var(--res-heat-deep)">
    ${iconSvg('radiator', { size: 18, cls: '', stroke: 2 })}<span class="marker__flag">${iconSvg('warning', { size: 9, cls: '', stroke: 3 })}</span>
  </button>
  <div class="srcpin" style="left:${zx(47.8)};top:${zy(56.4)}">
    <span class="srcpin__mark">${iconSvg('factory', { size: 15, cls: '', stroke: 2 })}</span>
    <span class="srcpin__name">РТС «Раменки»</span>
  </div>

  <div class="mapcard" style="left:800px;top:60px;width:412px">
    <div class="mapcard__head mapcard__head--hero" style="background:linear-gradient(140deg,var(--res-heat),var(--res-heat-deep))">
      <span class="res" style="background:rgba(255,255,255,.2);width:38px;height:38px;border-radius:11px">${iconSvg('radiator', { size: 20, cls: '', stroke: 2 })}</span>
      <div style="flex:1;min-width:0">
        <div class="mapcard__title">ЦТП № 04-06-1180</div>
        <div class="mapcard__sub">Тепловой пункт · Раменки, ЗАО</div>
      </div>
      <button class="mapcard__close">${ico('close')}</button>
    </div>
    <div style="padding:11px var(--s-4) 0;display:flex;align-items:center;gap:var(--s-2)">
      <span class="badge badge--alert">${icoSm('warning')} Технологическое нарушение</span>
      <span class="u-spacer"></span>
      <span style="font-size:var(--t-xs);color:var(--ink-4);white-space:nowrap">Выгрузка 06:20</span>
    </div>
    <div style="padding:var(--s-3) var(--s-4) var(--s-3)">
      <div class="tabs"><button class="tabs__item is-active">Паспорт</button><button class="tabs__item">Характеристики</button><button class="tabs__item">События <span class="badge badge--alert" style="height:16px;padding:0 5px">3</span></button></div>
    </div>
    <div class="mapcard__body" style="max-height:566px">
      <div class="callout callout--warn" style="margin-bottom:var(--s-3)">
        ${icoSm('warning')}<span><b>Отклонение обратной сети</b> — 8,4 °C выше графика. Открыто 4 ч назад · ТН-2026-4417</span>
      </div>

      ${fact('Организация', 'ПАО «МОЭК»')}
      ${fact('Адрес', 'ул. Мосфильмовская, 17к2')}
      ${fact('Питающий источник', '<a href="#" style="color:var(--a-600);text-decoration:none">РТС «Раменки»</a>', `<span class="badge badge--ok">в работе</span>`)}
      ${fact('Год ввода', '1987', '<span class="badge">39 лет</span>')}
      ${fact('Износ', '<span style="display:flex;align-items:center;gap:8px">68 %<span class="mrow__track" style="flex:1;max-width:88px"><span class="mrow__fill" style="width:68%;background:var(--seq-wear-4)"></span></span></span>')}
      ${fact('Обслуживает', '24 здания · 1 180 потребителей')}

      <div class="group">
        <div class="group__head">Показатели последней выгрузки<span class="u-spacer"></span><span class="group__count">4 ч назад</span></div>
        <div class="kpigrid">
          ${kpi('Подача', '74,2', ' °C', 'график 72,0 °C')}
          ${kpi('Обратка', '60,2', ' °C', '<span class="delta delta--down">+8,4 °C</span> к графику', 'kpi--alert')}
        </div>
        <div style="margin-top:var(--s-2)">
          <div class="eyebrow" style="margin-bottom:4px">Обратка за 7 суток, °C</div>
          <svg class="spark" viewBox="0 0 300 40" preserveAspectRatio="none">
            <polyline points="0,30 43,29 86,31 129,28 171,24 214,16 257,9 300,6" fill="none" stroke="var(--st-alert)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="0" y1="30" x2="300" y2="30" stroke="var(--n-300)" stroke-width="1" stroke-dasharray="3 3"/>
          </svg>
        </div>
      </div>
    </div>
    <div class="mapcard__foot">
      <div class="btnrow">
        <button class="btn btn--ghost btn--sm">${icoSm('pinSearch')} На карте</button>
        <button class="btn btn--ghost btn--sm">${icoSm('clock')} История</button>
        <button class="btn btn--primary btn--sm">${icoSm('doc')} Паспорт PDF</button>
      </div>
    </div>
  </div>

  <div class="scalebar" style="left:332px;bottom:26px"><span class="scalebar__line" style="width:96px"></span><span>500 м</span></div>
  ${toolbar({ leftOnly: true })}
  ${zoombox({ right: '14px' })}
  ${basethumb({ right: '14px' })}
</div>
${filterPanel()}
</div>
${statusbar('')}
</div>`);

/* --- 05. Список объектов -------------------------------------------------- */
const OBJ_ROWS = [
  ['ЦТП № 04-06-1180', 'Тепловой пункт', 'heat', 'Тепло', 'ПАО «МОЭК»', 'ул. Мосфильмовская, 17к2', 'alert', 'Нарушение'],
  ['ЦТП № 04-06-1181', 'Тепловой пункт', 'heat', 'Тепло', 'ПАО «МОЭК»', 'ул. Пырьева, 4', 'ok', 'В работе'],
  ['ТП-7412', 'Подстанция', 'power', 'Электро', 'ПАО «Россети МР»', 'Мичуринский просп., 31к5', 'warn', 'Внимание'],
  ['РТС «Раменки»', 'Источник', 'heat', 'Тепло', 'ПАО «МОЭК»', 'ул. Раменки, 1с3', 'ok', 'В работе'],
  ['КНС-14', 'Насосная станция', 'water', 'Вода', 'АО «Мосводоканал»', 'Воробьёвское ш., 6', 'ok', 'В работе'],
  ['ГРП-118', 'Оборудование', 'gas', 'Газ', 'АО «Мосгаз»', 'ул. Довженко, 12', 'nodata', 'Нет данных'],
  ['Участок Т-4 · 1,8 км', 'Сеть', 'heat', 'Тепло', 'ПАО «МОЭК»', 'от ЦТП 1180 до ул. Улофа Пальме', 'warn', 'Внимание'],
  ['ТП-7418', 'Подстанция', 'power', 'Электро', 'АО «ОЭК»', 'ул. Косыгина, 15', 'ok', 'В работе'],
  ['Жилой дом · 412 кв.', 'Потребитель', 'heat', 'Тепло', 'ПАО «МОЭК»', 'ул. Мосфильмовская, 17к1', 'ok', 'В работе'],
  ['Больница № 31', 'Потребитель · КИ', 'power', 'Электро', 'ПАО «Россети МР»', 'ул. Лобачевского, 42', 'ok', 'В работе'],
  ['Коллектор К-8 · 0,9 км', 'Сеть', 'collector', 'Коллекторы', 'ГУП «Москоллектор»', 'Мичуринский просп.', 'ok', 'В работе'],
];
const COLS = '1.6fr .9fr .8fr 1.2fr 1.6fr .9fr';

screen('05-modal-objects.html', 'Список объектов',
  'Разбор выборки: поиск, фильтры и постраничная выдача. Фильтры окна сужают уже отобранный набор и не трогают карту.',
  `<div class="app">
${topbar('map')}
<div class="app__body">
${stage({ map: 'map-light-admin.svg', children: `
  ${toolbar({ active: 'list' })}
  ${zoombox({})}
  ${basethumb({})}
  <div class="overlay">
    <div class="modal">
      <div class="modal__head">
        <div style="flex:1;min-width:0">
          <div class="modal__title">Объекты района Раменки</div>
          <div class="modal__sub">Отбор: теплоснабжение и электроснабжение · требуют внимания</div>
        </div>
        <span class="badge badge--accent">${icoSm('info')} выборка 1 : 4 — на карте показана каждая четвёртая точка</span>
        <button class="iconbtn">${ico('close')}</button>
      </div>
      <div class="modal__tools">
        <span class="search">${icoSm('search')}<input placeholder="Наименование или адрес"></span>
        <button class="select" style="width:170px"><span class="select__value">Все ресурсы</span>${icoSm('chevronDown')}</button>
        <button class="select" style="width:170px"><span class="select__value">Все типы</span>${icoSm('chevronDown')}</button>
        <button class="select" style="width:170px"><span class="select__value is-placeholder">Состояние</span>${icoSm('chevronDown')}</button>
        <button class="btn btn--quiet btn--sm">Сбросить</button>
      </div>
      <div class="modal__body">
        <div class="table">
          <div class="table__row table__row--head" style="grid-template-columns:${COLS}">
            <span>Наименование</span><span>Тип</span><span>Ресурс</span><span>Организация</span><span>Адрес</span><span>Состояние</span>
          </div>
          ${OBJ_ROWS.map((r, i) => `<div class="table__row table__row--body${i === 0 ? ' is-selected' : ''}" style="grid-template-columns:${COLS}">
            <span class="table__cell table__strong">${r[0]}</span>
            <span class="table__cell u-mute">${r[1]}</span>
            <span class="table__cell"><span class="u-row"><span class="res res--sm res--soft res--${r[2]}">${iconSvg(RESOURCE_ICONS[r[2]], { size: 11, cls: '', stroke: 2 })}</span>${r[3]}</span></span>
            <span class="table__cell u-mute">${r[4]}</span>
            <span class="table__cell u-mute">${r[5]}</span>
            <span class="table__cell"><span class="status status--${r[6]}"><span class="status__dot"></span>${r[7]}</span></span>
          </div>`).join('\n          ')}
        </div>
      </div>
      <div class="modal__foot">
        <span>Показано <strong style="color:var(--ink)">1–50</strong> из <strong style="color:var(--ink)">1 842</strong></span>
        <span class="u-spacer"></span>
        <button class="btn btn--ghost btn--sm">${icoSm('download')} Выгрузить CSV</button>
        <div class="pager">
          <button class="pager__btn">${icoSm('chevronLeft')}</button>
          <button class="pager__btn is-active">1</button>
          <button class="pager__btn">2</button>
          <button class="pager__btn">3</button>
          <span class="u-mute" style="padding:0 4px">…</span>
          <button class="pager__btn">37</button>
          <button class="pager__btn">${icoSm('chevronRight')}</button>
        </div>
      </div>
    </div>
  </div>
` })}
${filterPanel()}
${inspectorCity()}
</div>
${statusbar('')}
</div>`);

/* --- 06. Проверка данных -------------------------------------------------- */
const EVENTS = [
  ['ТН-2026-4417', 'alert', 'Технологическое нарушение', 'heat', 'Отклонение температуры обратной сети', 'Раменки, ЗАО', '4 ч', '1 180'],
  ['РС-2026-0912', 'warn', 'Расхождение в выгрузке', 'power', 'Паспорт ТП-7412 без года ввода', 'Тропарёво, ЗАО', '9 ч', '—'],
  ['ТН-2026-4416', 'alert', 'Технологическое нарушение', 'water', 'Падение давления на КНС-14', 'Марьино, ЮВАО', '11 ч', '4 320'],
  ['ДБ-2026-0233', 'dup', 'Дубль объекта', 'gas', 'ГРП-118 принят дважды от двух РСО', 'Хамовники, ЦАО', '14 ч', '—'],
  ['НД-2026-1877', 'nodata', 'Нет данных за период', 'storm', '38 объектов без показаний за сутки', 'Печатники, ЮВАО', '18 ч', '—'],
  ['ТН-2026-4412', 'alert', 'Технологическое нарушение', 'heat', 'Останов ЦТП по аварии на вводе', 'Бутырский, СВАО', '1 сут', '860'],
  ['РС-2026-0908', 'warn', 'Расхождение в выгрузке', 'power', 'Координаты вне границ района', 'Капотня, ЮВАО', '1 сут', '—'],
  ['НД-2026-1874', 'nodata', 'Нет данных за период', 'collector', 'Коллектор К-8: нет телеметрии', 'Раменки, ЗАО', '2 сут', '—'],
  ['ТН-2026-4408', 'alert', 'Технологическое нарушение', 'power', 'Отключение секции шин на ТП-7412', 'Тропарёво, ЗАО', '2 сут', '2 140'],
  ['ДБ-2026-0231', 'dup', 'Дубль объекта', 'water', 'Два паспорта на одну КНС', 'Строгино, СЗАО', '3 сут', '—'],
  ['РС-2026-0901', 'warn', 'Расхождение в выгрузке', 'heat', 'Протяжённость участка меньше геометрии', 'Кунцево, ЗАО', '3 сут', '—'],
  ['ТН-2026-4401', 'alert', 'Технологическое нарушение', 'gas', 'Падение давления в распределительной сети', 'Капотня, ЮВАО', '4 сут', '640'],
];
const EV_COLS = '104px 128px 62px minmax(220px, 1fr) 132px 80px 74px';

screen('06-validation.html', 'Проверка данных',
  'Журнал расхождений и событий приёма выгрузок. Рядом — качество данных по каждой организации: видно, кто задерживает.',
  `<div class="app">
${topbar('validation')}
<div class="app__body">
<div class="page">
  <div class="page__inner">
    <div class="page__head">
      <div>
        <div class="eyebrow">Приём выгрузок от РСО</div>
        <h1 class="page__title">Проверка данных</h1>
        <p class="page__sub">Расхождения и события, выявленные при приёме. Последняя выгрузка принята ${CITY.actualOn} в 06:20; следующая ожидается сегодня в 18:00.</p>
      </div>
      <span class="u-spacer"></span>
      <button class="btn btn--ghost">${icoSm('refresh')} Проверить сейчас</button>
      <button class="btn btn--primary">${icoSm('download')} Выгрузить журнал</button>
    </div>

    <div class="grid grid--4" style="margin-bottom:var(--s-4)">
      <div class="stat"><span class="stat__label"><span class="status status--alert"><span class="status__dot"></span></span>Технологические нарушения</span><div class="stat__value">31</div><div class="stat__foot"><span class="delta delta--down">+4</span> к прошлой выгрузке</div></div>
      <div class="stat"><span class="stat__label"><span class="status status--warn"><span class="status__dot"></span></span>Расхождения в паспортах</span><div class="stat__value">24</div><div class="stat__foot"><span class="delta delta--up">−7</span> к прошлой выгрузке</div></div>
      <div class="stat"><span class="stat__label"><span class="status status--warn"><span class="status__dot"></span></span>Дубли объектов</span><div class="stat__value">6</div><div class="stat__foot">от двух и более РСО</div></div>
      <div class="stat"><span class="stat__label"><span class="status status--nodata"><span class="status__dot"></span></span>Нет данных за период</span><div class="stat__value">9</div><div class="stat__foot">5 470 объектов затронуто</div></div>
    </div>

    <div class="grid grid--2-1">
      <div class="card">
        <div class="card__head">
          <span class="card__title">Журнал событий</span>
          <span class="badge badge--accent">70 открытых</span>
          <span class="u-spacer"></span>
          <span class="search" style="max-width:230px;height:32px">${icoSm('search')}<input placeholder="Номер, объект, адрес"></span>
          <button class="btn btn--ghost btn--sm">${icoSm('filter')} Фильтры</button>
        </div>
        <div class="card__body card__body--flush">
          <div class="table">
            <div class="table__row table__row--head" style="grid-template-columns:${EV_COLS}">
              <span>Номер</span><span>Категория</span><span>Ресурс</span><span>Описание</span><span>Территория</span><span>Открыто</span><span class="table__num">Затронуто</span>
            </div>
            ${EVENTS.map((e) => `<div class="table__row table__row--body" style="grid-template-columns:${EV_COLS}">
              <span class="table__cell table__id">${e[0]}</span>
              <span class="table__cell" title="${e[2]}"><span class="status status--${e[1] === 'dup' ? 'warn' : e[1]}"><span class="status__dot"></span>${{ alert: 'Нарушение', warn: 'Расхождение', nodata: 'Нет данных', dup: 'Дубль' }[e[1]]}</span></span>
              <span class="table__cell"><span class="u-row"><span class="res res--sm res--soft res--${e[3]}">${iconSvg(RESOURCE_ICONS[e[3]], { size: 11, cls: '', stroke: 2 })}</span></span></span>
              <span class="table__cell table__strong">${e[4]}</span>
              <span class="table__cell u-mute">${e[5]}</span>
              <span class="table__cell u-mute">${e[6]} назад</span>
              <span class="table__cell table__num">${e[7]}</span>
            </div>`).join('\n            ')}
          </div>
        </div>
        <div class="modal__foot" style="border-top:1px solid var(--border)">
          <span>Показано <strong style="color:var(--ink)">1–12</strong> из <strong style="color:var(--ink)">70</strong></span>
          <span class="u-spacer"></span>
          <div class="pager">
            <button class="pager__btn">${icoSm('chevronLeft')}</button>
            <button class="pager__btn is-active">1</button>
            <button class="pager__btn">2</button>
            <button class="pager__btn">3</button>
            <button class="pager__btn">${icoSm('chevronRight')}</button>
          </div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:var(--s-3)">
        <div class="card">
          <div class="card__head"><span class="card__title">Качество выгрузок</span><span class="card__meta">за 30 суток</span></div>
          <div class="card__body">
            <div class="bars">
              ${[['ПАО «МОЭК»', 99, 'ok'], ['АО «Мосводоканал»', 98, 'ok'], ['ПАО «Россети МР»', 96, 'ok'], ['АО «Мосгаз»', 93, 'warn'], ['ГУП «Мосводосток»', 88, 'warn'], ['АО «МТК»', 74, 'alert']]
                .map(([n, v, st]) => `<div class="bars__row" style="grid-template-columns:150px 1fr 58px">
                <span class="table__cell u-mute" title="${n}">${n}</span>
                <span class="bars__track"><span class="bars__fill" style="width:${v}%;background:var(--st-${st})"></span></span>
                <span class="bars__value" style="min-width:0">${v} %</span>
              </div>`).join('\n              ')}
            </div>
            <div class="callout" style="margin-top:var(--s-3)">${icoSm('info')}<span>Полнота — доля объектов, по которым выгрузка пришла вовремя и прошла проверку.</span></div>
          </div>
        </div>

        <div class="card">
          <div class="card__head"><span class="card__title">Расписание приёма</span></div>
          <div class="card__body" style="padding-top:var(--s-2)">
            <div class="list">
              <div class="list__row"><span class="res res--sm res--soft res--heat">${iconSvg('clock', { size: 11, cls: '', stroke: 2 })}</span><span class="list__main"><span class="list__title">Сегодня, 06:20</span><span class="list__sub">принято 12 из 12 выгрузок</span></span><span class="badge badge--ok">${icoSm('check')} принято</span></div>
              <div class="list__row"><span class="res res--sm res--soft res--water">${iconSvg('clock', { size: 11, cls: '', stroke: 2 })}</span><span class="list__main"><span class="list__title">Сегодня, 18:00</span><span class="list__sub">плановый приём</span></span><span class="badge">ожидается</span></div>
              <div class="list__row"><span class="res res--sm res--soft res--gas">${iconSvg('clock', { size: 11, cls: '', stroke: 2 })}</span><span class="list__main"><span class="list__title">06.08.2026, 18:00</span><span class="list__sub">АО «МТК» — задержка 2 ч</span></span><span class="badge badge--warn">с задержкой</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
</div>
${statusbar('')}
</div>`);

/* --- 07. Аналитика -------------------------------------------------------- */
screen('07-analytics.html', 'Аналитика',
  'Разрезы реестра с учётом действующих фильтров. Один тип шкалы на график, легенда и прямые подписи — цвет не остаётся единственным ключом.',
  `<div class="app">
${topbar('analytics')}
<div class="app__body">
<div class="page">
  <div class="page__inner">
    <div class="page__head">
      <div>
        <div class="eyebrow">Охват: Москва · все ресурсы</div>
        <h1 class="page__title">Аналитика</h1>
        <p class="page__sub">Распределение объектов реестра по территориям, ресурсам и организациям. Считается по действующему отбору.</p>
      </div>
      <span class="u-spacer"></span>
      <div class="segmented">
        <button class="segmented__item">Неделя</button>
        <button class="segmented__item is-active">Месяц</button>
        <button class="segmented__item">Год</button>
      </div>
      <button class="btn btn--ghost">${icoSm('download')} Выгрузить</button>
    </div>

    <div class="grid grid--4" style="margin-bottom:var(--s-4)">
      <div class="stat"><span class="stat__label">${icoSm('layers')}Объектов в реестре</span><div class="stat__value">165 287</div><div class="stat__foot"><span class="delta delta--up">+0,4 %</span> к прошлой выгрузке</div></div>
      <div class="stat"><span class="stat__label">${icoSm('network')}Протяжённость сетей</span><div class="stat__value">2 356<span class="kpi__unit" style="font-size:var(--t-lg)"> км</span></div><div class="stat__foot">по 6 системам</div></div>
      <div class="stat"><span class="stat__label">${icoSm('warning')}Требуют внимания</span><div class="stat__value">16 192</div><div class="stat__foot">9,8 % реестра · <span class="delta delta--down">+312</span></div></div>
      <div class="stat"><span class="stat__label">${icoSm('shield')}Полнота паспортов</span><div class="stat__value">97<span class="kpi__unit" style="font-size:var(--t-lg)"> %</span></div><div class="stat__foot"><span class="delta delta--up">+1,2 п.п.</span> за месяц</div></div>
    </div>

    <div class="grid grid--2" style="margin-bottom:var(--s-3)">
      <div class="card">
        <div class="card__head"><span class="card__title">Объекты по административным округам</span><span class="card__meta">12 округов</span></div>
        <div class="card__body">
          <div class="bars">
            ${OKRUG_ROWS.map((o) => `<div class="bars__row">
              <span class="table__cell">${o.name}</span>
              <span class="bars__track"><span class="bars__fill" style="width:${o.share}%;background:var(--a-400)"></span></span>
              <span class="bars__value">${o.count}</span>
            </div>`).join('\n            ')}
          </div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:var(--s-3)">
        <div class="card">
          <div class="card__head"><span class="card__title">Приём выгрузок и открытые события</span><span class="card__meta">30 суток</span></div>
          <div class="card__body">
            <svg viewBox="0 0 620 190" style="width:100%;height:190px" role="img" aria-label="График открытых событий за 30 суток">
              <g stroke="var(--border)" stroke-width="1">
                ${[0, 1, 2, 3].map((i) => `<line x1="34" y1="${20 + i * 42}" x2="612" y2="${20 + i * 42}"/>`).join('')}
              </g>
              <g fill="var(--ink-4)" font-size="11" font-family="system-ui">
                ${[100, 75, 50, 25].map((v, i) => `<text x="0" y="${24 + i * 42}">${v}</text>`).join('')}
                <text x="34" y="180">09.07</text><text x="272" y="180">23.07</text><text x="556" y="180">07.08</text>
              </g>
              <polyline fill="none" stroke="var(--a-500)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"
                points="34,120 74,112 114,126 154,104 194,110 234,92 274,98 314,84 354,96 394,72 434,80 474,64 514,74 554,56 594,48"/>
              <polyline fill="none" stroke="var(--st-alert)" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round"
                points="34,146 74,150 114,142 154,148 194,138 234,144 274,132 314,140 354,128 394,134 434,122 474,130 514,118 554,124 594,112"/>
              <circle cx="594" cy="48" r="4" fill="var(--a-500)" stroke="#fff" stroke-width="2"/>
              <circle cx="594" cy="112" r="4" fill="var(--st-alert)" stroke="#fff" stroke-width="2"/>
            </svg>
            <div style="display:flex;gap:var(--s-4);margin-top:6px">
              <span class="status"><span class="status__dot" style="background:var(--a-500)"></span>Принято объектов, тыс.</span>
              <span class="status"><span class="status__dot" style="background:var(--st-alert)"></span>Открытые события</span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card__head"><span class="card__title">Состояние объектов</span><span class="card__meta">165 287</span></div>
          <div class="card__body">
            <div class="stack" style="height:14px;border-radius:7px;margin-bottom:var(--s-3)">
              ${STATUSES.map((st) => `<span class="stack__seg" style="width:${st.share}%;background:var(--st-${st.id})"></span>`).join('')}
            </div>
            <div class="grid grid--2" style="gap:var(--s-2)">
              ${STATUSES.map((st) => `<div class="u-row"><span class="status status--${st.id}"><span class="status__dot"></span>${st.name}</span><span class="u-spacer"></span><span class="num u-strong">${st.count}</span></div>`).join('\n              ')}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid--2">
      <div class="card">
        <div class="card__head"><span class="card__title">Объекты по ресурсам</span><span class="card__meta">6 систем</span></div>
        <div class="card__body">
          <div class="bars">
            ${RES.map((r) => `<div class="bars__row">
              <span class="u-row"><span class="res res--sm res--soft res--${r.id}">${iconSvg(RESOURCE_ICONS[r.id], { size: 11, cls: '', stroke: 2 })}</span><span class="table__cell">${r.name}</span></span>
              <span class="bars__track"><span class="bars__fill" style="width:${Math.round(r.share * 3.2)}%;background:var(--res-${r.id})"></span></span>
              <span class="bars__value">${r.count}</span>
            </div>`).join('\n            ')}
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card__head"><span class="card__title">Крупнейшие ресурсоснабжающие организации</span><span class="card__meta">цвет — основной ресурс · 12 РСО</span></div>
        <div class="card__body">
          <div class="bars">
            ${ORGS.map((o) => `<div class="bars__row">
              <span class="table__cell" title="${o.name}">${o.name}</span>
              <span class="bars__track"><span class="bars__fill" style="width:${o.share}%;background:var(--res-${o.res})"></span></span>
              <span class="bars__value">${o.count}</span>
            </div>`).join('\n            ')}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
</div>
${statusbar('')}
</div>`);

/* --- 08. Отчёты ------------------------------------------------------------ */
screen('08-reports.html', 'Отчёты',
  'Параметры выгрузки собраны в один экран: охват, период, состав и формат — и сразу видно, что попадёт в отчёт.',
  `<div class="app">
${topbar('reports')}
<div class="app__body">
<div class="page">
  <div class="page__inner">
    <div class="page__head">
      <div>
        <div class="eyebrow">Формирование выгрузки</div>
        <h1 class="page__title">Отчёты</h1>
        <p class="page__sub">Отчёт собирается по тем же условиям, что действуют на карте: охват территории и отбор объектов подставлены автоматически.</p>
      </div>
    </div>

    <div class="grid grid--1-2">
      <div style="display:flex;flex-direction:column;gap:var(--s-3)">
        <div class="card">
          <div class="card__head"><span class="card__title">Шаблоны отчётов</span></div>
          <div class="card__body" style="padding:var(--s-2)">
            ${[['Реестр объектов по территории', 'состав, типы, организации', true],
               ['Технологические нарушения за период', 'события, длительность, затронутые потребители', false],
               ['Износ сетей и оборудования', 'рейтинг районов, объекты старше 40 лет', false],
               ['Потребление по ресурсам', 'объёмы, нагрузка, отклонения', false],
               ['Критическая инфраструктура', 'категории надёжности, резервирование', false]]
              .map(([n, sub, on]) => `<div class="dropdown__item${on ? ' is-selected' : ''}" style="padding:10px 12px">
              ${icoSm('doc')}
              <span style="flex:1;min-width:0"><span style="display:block">${n}</span><span class="list__sub">${sub}</span></span>
              ${on ? icoSm('check') : ''}
            </div>`).join('\n            ')}
            <div class="dropdown__sep"></div>
            <button class="btn btn--quiet btn--sm btn--full">${icoSm('plus')} Создать шаблон</button>
          </div>
        </div>
        <div class="card">
          <div class="card__head"><span class="card__title">История</span><span class="card__meta">последние 3</span></div>
          <div class="card__body" style="padding-top:var(--s-2)">
            <div class="list">
              ${[['Реестр · ЗАО · 07.08.2026', 'XLSX · 4,2 МБ', 'ok'], ['Нарушения · июль 2026', 'PDF · 1,1 МБ', 'ok'], ['Износ · СВАО', 'формируется…', 'warn']]
                .map(([n, sub, st]) => `<div class="list__row"><span class="res res--sm res--soft res--water">${iconSvg('doc', { size: 11, cls: '', stroke: 2 })}</span><span class="list__main"><span class="list__title">${n}</span><span class="list__sub">${sub}</span></span>${st === 'ok' ? `<button class="btn btn--quiet btn--sm">${icoSm('download')}</button>` : '<span class="badge badge--warn">в работе</span>'}</div>`).join('\n              ')}
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__head"><span class="card__title">Реестр объектов по территории</span><span class="u-spacer"></span><button class="btn btn--ghost btn--sm">${icoSm('save')} Сохранить как шаблон</button></div>
        <div class="card__body">
          <div class="grid grid--2" style="gap:var(--s-4)">
            <div>
              <div class="eyebrow" style="margin-bottom:var(--s-2)">Охват</div>
              <div class="field"><span class="field__label">Территория</span><button class="select"><span class="select__value">Западный административный округ</span>${icoSm('chevronDown')}</button></div>
              <div class="field"><span class="field__label">Район</span><button class="select"><span class="select__value">Раменки</span>${icoSm('chevronDown')}</button></div>
              <div class="field"><span class="field__label">Период</span><button class="select"><span class="select__value">01.07.2026 — 07.08.2026</span>${icoSm('chevronDown')}</button></div>
            </div>
            <div>
              <div class="eyebrow" style="margin-bottom:var(--s-2)">Состав</div>
              <label class="checkrow is-on"><span class="checkbox">${iconSvg('check', { size: 12, cls: '', stroke: 3 })}</span><span class="checkrow__label">Паспортные сведения</span></label>
              <label class="checkrow is-on"><span class="checkbox">${iconSvg('check', { size: 12, cls: '', stroke: 3 })}</span><span class="checkrow__label">Показатели последней выгрузки</span></label>
              <label class="checkrow is-on"><span class="checkbox">${iconSvg('check', { size: 12, cls: '', stroke: 3 })}</span><span class="checkrow__label">События за период</span></label>
              <label class="checkrow"><span class="checkbox"></span><span class="checkrow__label">Схема сетей (PDF-приложение)</span></label>
              <label class="checkrow"><span class="checkbox"></span><span class="checkrow__label">Критическая инфраструктура</span></label>
            </div>
          </div>

          <div style="height:1px;background:var(--border);margin:var(--s-4) 0"></div>

          <div class="eyebrow" style="margin-bottom:var(--s-2)">Что попадёт в отчёт</div>
          <div class="grid grid--4" style="gap:var(--s-2);margin-bottom:var(--s-4)">
            ${kpi('Объектов', '1 842', '', 'из них 37 с нарушениями')}
            ${kpi('Сетей', '31,4', ' км', '64 участка')}
            ${kpi('События', '112', '', 'за 38 суток')}
            ${kpi('Организаций', '7', '', 'РСО в выборке')}
          </div>

          <div class="u-row" style="gap:var(--s-3);flex-wrap:wrap">
            <div class="segmented">
              <button class="segmented__item is-active">XLSX</button>
              <button class="segmented__item">PDF</button>
              <button class="segmented__item">CSV</button>
              <button class="segmented__item">GeoJSON</button>
            </div>
            <label class="switch is-on"><span class="switch__track"><span class="switch__knob"></span></span>Включить титульный лист</label>
            <span class="u-spacer"></span>
            <span class="u-row" style="gap:var(--s-2)">
              <button class="btn btn--ghost">${icoSm('eye')} Предпросмотр</button>
              <button class="btn btn--primary">${icoSm('download')} Сформировать</button>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
</div>
${statusbar('')}
</div>`);

/* --- 09. Администрирование ------------------------------------------------- */
screen('09-admin.html', 'Администрирование',
  'Настройки системы: источники и расписание приёма, роли, справочники, журнал действий.',
  `<div class="app">
${topbar('admin')}
<div class="app__body">
<div class="page">
  <div class="page__inner">
    <div class="page__head">
      <div>
        <div class="eyebrow">Настройки системы</div>
        <h1 class="page__title">Администрирование</h1>
        <p class="page__sub">Подключение источников, расписание приёма выгрузок, права доступа и справочники.</p>
      </div>
      <span class="u-spacer"></span>
      <button class="btn btn--primary">${icoSm('plus')} Добавить источник</button>
    </div>

    <div class="grid grid--3" style="margin-bottom:var(--s-4)">
      <div class="stat"><span class="stat__label">${icoSm('factory')}Подключённых РСО</span><div class="stat__value">12</div><div class="stat__foot">из 12 предусмотренных регламентом</div></div>
      <div class="stat"><span class="stat__label">${icoSm('refresh')}Приёмов в сутки</span><div class="stat__value">2</div><div class="stat__foot">06:00 и 18:00 · МСК</div></div>
      <div class="stat"><span class="stat__label">${icoSm('shield')}Пользователей</span><div class="stat__value">148</div><div class="stat__foot">5 ролей · 23 организации</div></div>
    </div>

    <div class="grid grid--2-1">
      <div class="card">
        <div class="card__head"><span class="card__title">Источники данных</span><span class="u-spacer"></span><span class="search" style="max-width:220px;height:32px">${icoSm('search')}<input placeholder="Организация"></span></div>
        <div class="card__body card__body--flush">
          <div class="table">
            <div class="table__row table__row--head" style="grid-template-columns:1.6fr 1fr .9fr 1fr .9fr">
              <span>Организация</span><span>Ресурсы</span><span>Протокол</span><span>Последний приём</span><span>Состояние</span>
            </div>
            ${[['ПАО «МОЭК»', ['heat'], 'SOAP', 'сегодня, 06:20', 'ok', 'работает'],
               ['ПАО «Мосэнерго»', ['heat', 'power'], 'REST', 'сегодня, 06:18', 'ok', 'работает'],
               ['ПАО «Россети МР»', ['power'], 'REST', 'сегодня, 06:20', 'ok', 'работает'],
               ['АО «Мосводоканал»', ['water'], 'SOAP', 'сегодня, 06:12', 'ok', 'работает'],
               ['ГУП «Мосводосток»', ['water', 'storm'], 'FTP', 'сегодня, 06:41', 'warn', 'с задержкой'],
               ['АО «Мосгаз»', ['gas'], 'REST', 'сегодня, 06:20', 'ok', 'работает'],
               ['ГУП «Москоллектор»', ['collector'], 'FTP', 'вчера, 18:00', 'warn', 'с задержкой'],
               ['АО «МТК»', ['heat'], 'SOAP', '06.08, 20:04', 'alert', 'ошибка приёма']]
              .map(([n, res, proto, last, st, stn]) => `<div class="table__row table__row--body" style="grid-template-columns:1.6fr 1fr .9fr 1fr .9fr">
              <span class="table__cell table__strong">${n}</span>
              <span class="table__cell"><span class="u-row" style="gap:4px">${res.map((r) => `<span class="res res--sm res--soft res--${r}">${iconSvg(RESOURCE_ICONS[r], { size: 11, cls: '', stroke: 2 })}</span>`).join('')}</span></span>
              <span class="table__cell u-mute">${proto}</span>
              <span class="table__cell u-mute">${last}</span>
              <span class="table__cell"><span class="status status--${st}"><span class="status__dot"></span>${stn}</span></span>
            </div>`).join('\n            ')}
          </div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:var(--s-3)">
        <div class="card">
          <div class="card__head"><span class="card__title">Роли и доступ</span></div>
          <div class="card__body" style="padding-top:var(--s-2)">
            <div class="list">
              ${[['Диспетчер', 'карта, события, отчёты', 96], ['Аналитик', '+ аналитика и выгрузки', 28], ['Оператор РСО', 'только свои объекты', 18], ['Администратор', 'полный доступ', 6]]
                .map(([n, sub, c]) => `<div class="list__row"><span class="list__main"><span class="list__title">${n}</span><span class="list__sub">${sub}</span></span><span class="list__value">${c}</span></div>`).join('\n              ')}
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card__head"><span class="card__title">Справочники</span></div>
          <div class="card__body" style="padding-top:var(--s-2)">
            <div class="list">
              ${[['Ресурсы и типы объектов', '6 систем · 7 типов'], ['Административное деление', '12 округов · 146 районов'], ['Ресурсоснабжающие организации', '12 записей'], ['Категории надёжности', '3 категории']]
                .map(([n, sub]) => `<div class="list__row"><span class="list__main"><span class="list__title">${n}</span><span class="list__sub">${sub}</span></span>${icoSm('chevronRight')}</div>`).join('\n              ')}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
</div>
${statusbar('')}
</div>`);

/* --- 10. Дизайн-система ---------------------------------------------------- */
const sw = (varName, label, hex, ink = 'var(--ink)') => `<div style="flex:1;min-width:104px">
    <div style="height:56px;border-radius:var(--r-md);background:var(--${varName});border:1px solid rgba(16,26,44,.08)"></div>
    <div style="font-size:var(--t-sm);font-weight:600;margin-top:6px;color:${ink}">${label}</div>
    <div class="num" style="font-size:var(--t-xs);color:var(--ink-4);text-transform:uppercase">${hex}</div>
  </div>`;

const principle = (n, title, text) => `<div class="card"><div class="card__body">
    <div class="eyebrow">Принцип ${n}</div>
    <div class="card__title" style="margin:4px 0 6px">${title}</div>
    <div style="font-size:var(--t-md);color:var(--ink-2);line-height:1.5">${text}</div>
  </div></div>`;

screen('10-design-system.html', 'Дизайн-система',
  'Токены, компоненты и правила картографической символики — то, из чего собраны остальные макеты.',
  `<div class="app" style="height:auto;overflow:visible">
${topbar('map')}
<div class="page" style="position:static">
  <div class="page__inner">
    <div class="page__head">
      <div>
        <div class="eyebrow">РКИИЭ 2.0</div>
        <h1 class="page__title">Дизайн-система</h1>
        <p class="page__sub">Один источник правды по цвету, типографике, ритму и символике карты. Значения живут в <code>design/css/tokens.css</code>, компоненты — в <code>design/css/ui.css</code>.</p>
      </div>
    </div>

    <div class="grid grid--3" style="margin-bottom:var(--s-6)">
      ${principle(1, 'Карта — герой', 'План города не режется колонками: панели плавают над картой на «стекле» и убираются в полосу. Всё, что не карта, — спокойный фон.')}
      ${principle(2, 'Цвет закреплён за смыслом', 'Оттенок = ресурс. Состояние = форма: кольцо у маркера, точка с подписью в строке, ореол у нарушения. Ни одно значение не передаётся цветом в одиночку.')}
      ${principle(3, 'Спокойно по умолчанию', 'Норма выглядит тихо, внимание тратится на отклонения — принцип ISA-101 для диспетчерских интерфейсов. Насыщенный цвет означает, что нужно вмешаться.')}
      ${principle(4, 'Плотно, но не тесно', 'Шаг сетки 4 px, цифры табличные, у чисел своя иерархия размеров. Данных много — воздух распределяется, а не сокращается.')}
      ${principle(5, 'Видно, откуда данные', 'Система показывает последнюю принятую выгрузку. Дата и время приёма — в шапке, в карточках и в подвале, а не в справке.')}
      ${principle(6, 'Доступно', 'Контраст текста не ниже 4.5:1, фокус виден всегда, цели нажатия от 32 px, движение отключается по prefers-reduced-motion.')}
    </div>

    <div class="card" style="margin-bottom:var(--s-4)">
      <div class="card__head"><span class="card__title">Цвет ресурсов</span><span class="card__meta">оттенок = система ресурсоснабжения</span></div>
      <div class="card__body">
        <div style="display:flex;gap:var(--s-3);flex-wrap:wrap;margin-bottom:var(--s-4)">
          ${RES.map((r) => `<div style="flex:1;min-width:150px">
            <div style="height:56px;border-radius:var(--r-md);background:var(--res-${r.id});display:flex;align-items:flex-end;padding:8px">
              <span class="res" style="background:rgba(255,255,255,.24)">${iconSvg(RESOURCE_ICONS[r.id], { size: 13, cls: '', stroke: 2 })}</span>
            </div>
            <div style="display:flex;gap:4px;margin-top:4px">
              <span style="flex:1;height:20px;border-radius:5px;background:var(--res-${r.id}-soft)"></span>
              <span style="flex:1;height:20px;border-radius:5px;background:var(--res-${r.id}-deep)"></span>
            </div>
            <div style="font-size:var(--t-sm);font-weight:600;margin-top:6px">${r.name}</div>
            <div class="num" style="font-size:var(--t-xs);color:var(--ink-4)">soft · base · deep</div>
          </div>`).join('\n          ')}
        </div>
        <div class="callout">${icoSm('info')}<span><b>Проверено расчётом, а не на глаз.</b> Набор проходит контроль различимости соседних пар (ΔE ≥ 8 при протанопии и дейтеранопии, ≥ 15 при обычном зрении). На карте шесть оттенков сразу — случай, где одного цвета мало: поэтому у каждого маркера есть значок ресурса, а в легенде — подпись.</span></div>
      </div>
    </div>

    <div class="grid grid--2" style="margin-bottom:var(--s-4)">
      <div class="card">
        <div class="card__head"><span class="card__title">Состояние объекта</span><span class="card__meta">всегда со значком и подписью</span></div>
        <div class="card__body">
          <div style="display:flex;gap:var(--s-3);margin-bottom:var(--s-4)">
            ${[['ok', 'В работе', '#16A34A'], ['warn', 'Требует внимания', '#F59E0B'], ['alert', 'Нарушение', '#E11D48'], ['nodata', 'Нет данных', '#94A3B8']]
              .map(([id, name, hex]) => `<div style="flex:1">
              <div style="height:48px;border-radius:var(--r-md);background:var(--st-${id})"></div>
              <div style="font-size:var(--t-sm);font-weight:600;margin-top:6px">${name}</div>
              <div class="num" style="font-size:var(--t-xs);color:var(--ink-4)">${hex}</div>
            </div>`).join('\n            ')}
          </div>
          <div class="u-row" style="gap:var(--s-3);flex-wrap:wrap">
            <span class="badge badge--ok">${icoSm('check')} в работе</span>
            <span class="badge badge--warn">${icoSm('warning')} внимание</span>
            <span class="badge badge--alert">${icoSm('warning')} нарушение</span>
            <span class="badge badge--nodata">нет данных</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__head"><span class="card__title">Последовательные шкалы</span><span class="card__meta">один ход, светлее → темнее</span></div>
        <div class="card__body">
          <div class="eyebrow" style="margin-bottom:4px">Износ сетей и оборудования</div>
          <div class="ramp ramp--wear" style="height:14px"></div>
          <div class="ramp__scale" style="margin-bottom:var(--s-4)"><span>28 % · новое</span><span>80 % · предельный</span></div>
          <div class="eyebrow" style="margin-bottom:4px">Интенсивность потребления</div>
          <div class="ramp ramp--load" style="height:14px"></div>
          <div class="ramp__scale" style="margin-bottom:var(--s-3)"><span>ниже среднего</span><span>выше среднего</span></div>
          <div class="callout callout--warn">${icoSm('warning')}<span>«Светофор» зелёный → красный для шкалы величины не используется: радуга ломает порядок и не читается при дальтонизме.</span></div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:var(--s-4)">
      <div class="card__head"><span class="card__title">Нейтральная шкала и акцент</span></div>
      <div class="card__body">
        <div style="display:flex;gap:var(--s-2);margin-bottom:var(--s-4)">
          ${['n-0', 'n-50', 'n-100', 'n-150', 'n-200', 'n-300', 'n-400', 'n-500', 'n-600', 'n-700', 'n-800', 'n-900', 'n-950']
            .map((n) => `<div style="flex:1"><div style="height:44px;border-radius:var(--r-sm);background:var(--${n});border:1px solid rgba(16,26,44,.08)"></div><div class="num" style="font-size:var(--t-xs);color:var(--ink-4);margin-top:4px">${n.replace('n-', '')}</div></div>`).join('')}
        </div>
        <div style="display:flex;gap:var(--s-2)">
          ${['a-50', 'a-100', 'a-200', 'a-300', 'a-400', 'a-500', 'a-600', 'a-700', 'a-800', 'a-900']
            .map((n) => `<div style="flex:1"><div style="height:44px;border-radius:var(--r-sm);background:var(--${n})"></div><div class="num" style="font-size:var(--t-xs);color:var(--ink-4);margin-top:4px">${n.replace('a-', '')}</div></div>`).join('')}
        </div>
      </div>
    </div>

    <div class="grid grid--2" style="margin-bottom:var(--s-4)">
      <div class="card">
        <div class="card__head"><span class="card__title">Типографика</span><span class="card__meta">Inter → системный гротеск</span></div>
        <div class="card__body">
          <div style="font-size:var(--t-4xl);font-weight:700;letter-spacing:var(--tr-tight);line-height:1.1">165 287</div>
          <div class="u-mute" style="font-size:var(--t-sm);margin-bottom:var(--s-3)">34 / 700 / −0.02em · крупное число, табличные цифры</div>
          <div style="font-size:var(--t-3xl);font-weight:700;letter-spacing:var(--tr-tight)">Заголовок раздела</div>
          <div class="u-mute" style="font-size:var(--t-sm);margin-bottom:var(--s-3)">26 / 700</div>
          <div style="font-size:var(--t-xl);font-weight:650">Заголовок панели</div>
          <div class="u-mute" style="font-size:var(--t-sm);margin-bottom:var(--s-3)">16 / 650</div>
          <div style="font-size:var(--t-md)">Основной текст интерфейса — 13 / 400 / 1.48</div>
          <div style="font-size:var(--t-sm);color:var(--ink-3)">Вспомогательный — 12 / 400</div>
          <div class="eyebrow" style="margin-top:var(--s-2)">Капитель-подпись — 10 / 650 / 0.06em</div>
        </div>
      </div>

      <div class="card">
        <div class="card__head"><span class="card__title">Глубина и радиусы</span></div>
        <div class="card__body">
          <div style="display:flex;gap:var(--s-3);margin-bottom:var(--s-4)">
            ${[['e-1', '1 — строки, плитки'], ['e-2', '2 — чипы, кнопки карты'], ['e-3', '3 — выпадающие списки'], ['e-4', '4 — карточки и окна']]
              .map(([e, l]) => `<div style="flex:1"><div style="height:56px;border-radius:var(--r-lg);background:var(--surface);box-shadow:var(--${e})"></div><div style="font-size:var(--t-xs);color:var(--ink-4);margin-top:8px">${l}</div></div>`).join('')}
          </div>
          <div style="display:flex;gap:var(--s-3)">
            ${[['r-xs', '6'], ['r-sm', '8'], ['r-md', '10'], ['r-lg', '14'], ['r-xl', '18'], ['r-2xl', '24']]
              .map(([r, l]) => `<div style="flex:1"><div style="height:48px;border-radius:var(--${r});background:var(--a-50);border:1px solid var(--a-200)"></div><div class="num" style="font-size:var(--t-xs);color:var(--ink-4);margin-top:6px">${l} px</div></div>`).join('')}
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:var(--s-4)">
      <div class="card__head"><span class="card__title">Символика карты</span><span class="card__meta">заливка — ресурс, кольцо — состояние, ореол — нарушение</span></div>
      <div class="card__body">
        <div style="display:flex;gap:var(--s-7);flex-wrap:wrap;align-items:flex-start">
          <div>
            <div class="eyebrow" style="margin-bottom:var(--s-3)">Объект: ресурс × состояние</div>
            <div style="display:grid;grid-template-columns:repeat(4,72px);gap:var(--s-2)">
              ${['ok', 'warn', 'alert', 'nodata'].map((st) => `<div style="position:relative;height:46px">
                <span class="marker marker--${st}" style="position:relative;left:auto;top:auto;transform:none;background:var(--res-heat-soft);color:var(--res-heat-deep)">${iconSvg('radiator', { size: 14, cls: '', stroke: 2 })}${st === 'alert' ? `<span class="marker__flag">${iconSvg('warning', { size: 9, cls: '', stroke: 3 })}</span>` : ''}</span>
              </div>`).join('')}
              ${['ok', 'warn', 'alert', 'nodata'].map((st) => `<div style="font-size:var(--t-xs);color:var(--ink-4);width:72px;line-height:1.3">${{ ok: 'в работе', warn: 'внимание', alert: 'нарушение', nodata: 'нет данных' }[st]}</div>`).join('')}
            </div>
          </div>

          <div>
            <div class="eyebrow" style="margin-bottom:var(--s-3)">Масштаб</div>
            <div style="display:flex;gap:var(--s-5);align-items:center;height:56px">
              <span class="dot" style="position:relative;left:auto;top:auto;transform:none;background:var(--res-heat)"></span>
              <span class="marker marker--ok" style="position:relative;left:auto;top:auto;transform:none;background:var(--res-water-soft);color:var(--res-water-deep)">${iconSvg('drop', { size: 14, cls: '', stroke: 2 })}</span>
              <span class="cluster" style="position:relative;left:auto;top:auto;transform:none;color:var(--ink)"><svg class="cluster__ring" viewBox="0 0 60 60"><circle cx="30" cy="30" r="27" fill="none" stroke="var(--res-heat)" stroke-width="5" stroke-dasharray="60 110" stroke-linecap="round" transform="rotate(-90 30 30)"/><circle cx="30" cy="30" r="27" fill="none" stroke="var(--res-power)" stroke-width="5" stroke-dasharray="42 128" stroke-dashoffset="-63" stroke-linecap="round" transform="rotate(-90 30 30)"/></svg>842</span>
              <span class="srcpin" style="position:relative;left:auto;top:auto;transform:none"><span class="srcpin__mark">${iconSvg('factory', { size: 15, cls: '', stroke: 2 })}</span><span class="srcpin__name">ТЭЦ-12</span></span>
              <span class="pill" style="position:relative;left:auto;top:auto;transform:none">ЮВАО<span class="pill__count">12</span></span>
            </div>
            <div style="font-size:var(--t-xs);color:var(--ink-4);margin-top:6px">точка · маркер · кластер с долями ресурсов · источник · плашка округа</div>
          </div>

          <div style="min-width:260px">
            <div class="eyebrow" style="margin-bottom:var(--s-3)">Линии сетей</div>
            <svg viewBox="0 0 260 96" style="width:260px;height:96px">
              <g fill="none" stroke-linecap="round">
                <path d="M8 16 H252" stroke="var(--res-heat)" stroke-width="5"/>
                <path d="M8 36 H252" stroke="var(--res-power)" stroke-width="3.2" stroke-dasharray="16 8"/>
                <path d="M8 56 H252" stroke="var(--res-water)" stroke-width="3.4" stroke-dasharray="2 9"/>
                <path d="M8 76 H252" stroke="var(--res-gas)" stroke-width="3" stroke-dasharray="22 6 4 6"/>
              </g>
            </svg>
            <div style="font-size:var(--t-xs);color:var(--ink-4)">Рисунок штриха — второй канал: сети различаются и на чёрно-белой печати.</div>
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:var(--s-4)">
      <div class="card__head"><span class="card__title">Тёмная тема</span><span class="card__meta">те же токены, другие ступени</span></div>
      <div class="card__body card__body--flush">
        <div data-theme="dark" style="background:var(--surface-sunk);padding:var(--s-4)">
          <div style="display:flex;gap:var(--s-3);flex-wrap:wrap;margin-bottom:var(--s-4)">
            ${RES.map((r) => `<div style="flex:1;min-width:118px">
              <div style="height:44px;border-radius:var(--r-md);background:var(--res-${r.id})"></div>
              <div style="font-size:var(--t-sm);color:var(--ink-2);margin-top:6px">${r.short}</div>
            </div>`).join('')}
          </div>
          <div style="display:flex;gap:var(--s-3);align-items:flex-start;flex-wrap:wrap">
            <div class="kpigrid" style="flex:0 0 300px">
              ${kpi('Объектов в реестре', '165 287', '', '<span class="delta delta--up">+0,4 %</span> к выгрузке', 'kpi--accent')}
              ${kpi('Нарушения', '31', '', '<span class="status status--alert"><span class="status__dot"></span>открыты</span>', 'kpi--alert')}
            </div>
            <div style="flex:1;min-width:260px">
              <div class="u-row" style="gap:var(--s-2);flex-wrap:wrap;margin-bottom:var(--s-3)">
                <button class="btn btn--primary btn--sm">Основное</button>
                <button class="btn btn--soft btn--sm">Мягкая</button>
                <button class="btn btn--ghost btn--sm">Контурная</button>
                <span class="badge badge--ok">в работе</span>
                <span class="badge badge--warn">внимание</span>
                <span class="badge badge--alert">нарушение</span>
              </div>
              <div class="mrow"><span class="res res--sm res--heat">${iconSvg('radiator', { size: 11, cls: '', stroke: 2 })}</span><span><span class="mrow__name">Теплоснабжение</span><span class="mrow__track" style="margin-top:5px"><span class="mrow__fill" style="width:99%;background:var(--res-heat)"></span></span></span><span class="mrow__value">51 620</span></div>
              <div class="mrow"><span class="res res--sm res--water">${iconSvg('drop', { size: 11, cls: '', stroke: 2 })}</span><span><span class="mrow__name">Водоснабжение</span><span class="mrow__track" style="margin-top:5px"><span class="mrow__fill" style="width:63%;background:var(--res-water)"></span></span></span><span class="mrow__value">32 946</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card__head"><span class="card__title">Компоненты</span></div>
      <div class="card__body">
        <div class="grid grid--3" style="gap:var(--s-6)">
          <div>
            <div class="eyebrow" style="margin-bottom:var(--s-2)">Кнопки</div>
            <div style="display:flex;flex-direction:column;gap:var(--s-2);align-items:flex-start">
              <button class="btn btn--primary">${icoSm('download')} Основное действие</button>
              <button class="btn btn--soft">Мягкая</button>
              <button class="btn btn--ghost">Контурная</button>
              <button class="btn btn--quiet">Тихая</button>
              <div class="segmented"><button class="segmented__item is-active">Схема</button><button class="segmented__item">Снимок</button></div>
              <label class="switch is-on"><span class="switch__track"><span class="switch__knob"></span></span>Режим просмотра</label>
            </div>
          </div>
          <div>
            <div class="eyebrow" style="margin-bottom:var(--s-2)">Поля и списки</div>
            <div class="field"><span class="field__label">Организация</span><button class="select"><span class="select__value">ПАО «МОЭК»</span>${icoSm('chevronDown')}</button></div>
            <label class="checkrow is-on"><span class="checkbox">${iconSvg('check', { size: 12, cls: '', stroke: 3 })}</span><span class="res res--sm res--heat">${iconSvg('radiator', { size: 11, cls: '', stroke: 2 })}</span><span class="checkrow__label">Теплоснабжение</span><span class="checkrow__meta">31 %</span></label>
            <label class="checkrow"><span class="checkbox checkbox--mixed"></span><span class="res res--sm res--power">${iconSvg('bolt', { size: 11, cls: '', stroke: 2 })}</span><span class="checkrow__label">Электроснабжение</span><span class="checkrow__meta">частично</span></label>
            <span class="search" style="margin-top:var(--s-2)">${icoSm('search')}<input placeholder="Поиск по адресу"></span>
          </div>
          <div>
            <div class="eyebrow" style="margin-bottom:var(--s-2)">Показатели и метки</div>
            <div class="kpigrid" style="margin-bottom:var(--s-2)">
              ${kpi('Объектов', '1 842', '', '<span class="delta delta--up">+12</span> за сутки')}
              ${kpi('Износ', '68', ' %', 'выше среднего', 'kpi--alert')}
            </div>
            <div class="u-row" style="gap:6px;flex-wrap:wrap;margin-bottom:var(--s-2)">
              <span class="chip chip--plain"><span class="chip__dot" style="background:var(--res-water)"></span>Водоснабжение<button class="chip__x">${iconSvg('close', { size: 11, cls: '', stroke: 2.4 })}</button></span>
              <span class="chip chip--plain">Район: Раменки<button class="chip__x">${iconSvg('close', { size: 11, cls: '', stroke: 2.4 })}</button></span>
            </div>
            <div class="callout">${icoSm('info')}<span>Подсказка объясняет расхождение прямо там, где оно видно.</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
</div>`);

/* --- 11. Диспетчерский режим (тёмная тема) --------------------------------- */
screen('11-dark-dispatch.html', 'Диспетчерский режим',
  'Тёмная тема для ночной смены и видеостены. Те же токены — другие ступени: оттенки ресурсов и состояний сохраняют смысл.',
  `<div class="app">
${topbar('map', { theme: 'dark' })}
<div class="app__body">
${stage({ map: 'map-dark-admin.svg', children: `
  ${OKRUG_PILLS.map((p) => `<button class="pill${p.hot ? ' pill--hot' : ''}" style="left:${ax(p.x)};top:${ay(p.y)}">${p.code}<span class="pill__count">${p.n}</span></button>`).join('\n  ')}
  <button class="marker marker--alert" style="left:${ax(49.9)};top:${ay(27.9)};background:var(--res-heat-soft);color:var(--res-heat-deep)">
    ${iconSvg('factory', { size: 14, cls: '', stroke: 2 })}<span class="marker__flag">${iconSvg('warning', { size: 9, cls: '', stroke: 3 })}</span>
  </button>
  <button class="marker marker--alert" style="left:${ax(60.6)};top:${ay(60.4)};background:var(--res-water-soft);color:var(--res-water-deep)">
    ${iconSvg('drop', { size: 14, cls: '', stroke: 2 })}<span class="marker__flag">${iconSvg('warning', { size: 9, cls: '', stroke: 3 })}</span>
  </button>
  <div class="srcpin" style="left:${ax(46.6)};top:${ay(56.2)}">
    <span class="srcpin__mark">${iconSvg('factory', { size: 15, cls: '', stroke: 2 })}</span>
    <span class="srcpin__name">ТЭЦ-12</span>
  </div>
  <div class="chipbar">
    <span class="chip"><span class="chip__dot" style="background:var(--res-heat)"></span>Теплоснабжение<button class="chip__x">${iconSvg('close', { size: 11, cls: '', stroke: 2.4 })}</button></span>
    <span class="chip"><span class="status status--alert"><span class="status__dot"></span></span>Технологические нарушения<button class="chip__x">${iconSvg('close', { size: 11, cls: '', stroke: 2.4 })}</button></span>
    <button class="chip chip--ghost">Сбросить всё</button>
  </div>
  <div class="mapctl legend" style="left:332px;bottom:76px">
    <div class="legend__title">Условные обозначения</div>
    <div class="legend__sub">Заливка значка — ресурс, кольцо — состояние</div>
    <div class="legend__row"><span class="legend__swatch" style="background:var(--res-heat)"></span>Теплоснабжение<span class="legend__count">51 620</span></div>
    <div class="legend__row"><span class="legend__swatch" style="background:var(--res-power)"></span>Электроснабжение<span class="legend__count">48 248</span></div>
    <div class="legend__row"><span class="legend__swatch legend__swatch--dot" style="background:transparent;border:2px solid var(--st-alert)"></span>Технологическое нарушение<span class="legend__count">31</span></div>
  </div>
  ${scalebar({ left: '332px', bottom: '26px' })}
  ${toolbar({ active: 'eye' })}
  ${zoombox({})}
  ${basethumb({ map: 'map-dark-plain.svg', name: 'Ночная' })}
` })}
${filterPanel()}
${inspectorCity()}
</div>
${statusbar('')}
</div>`, 'dark');

/* --- 12. Командная палитра -------------------------------------------------- */
screen('12-command-palette.html', 'Командная палитра',
  'Одна точка входа для поиска и действий: округа, объекты, события и команды интерфейса — с клавиатуры, по ⌘K.',
  `<div class="app">
${topbar('map')}
<div class="app__body">
${stage({ map: 'map-light-admin.svg', children: `
  ${OKRUG_PILLS.map((p) => `<button class="pill${p.hot ? ' pill--hot' : ''}" style="left:${ax(p.x)};top:${ay(p.y)}">${p.code}<span class="pill__count">${p.n}</span></button>`).join('\n  ')}
  ${toolbar({})}
  ${zoombox({})}
  <div class="overlay" style="align-items:flex-start;padding-top:96px">
    <div class="cmd">
      <div class="cmd__input">${ico('search', 20)}<input value="раменки" spellcheck="false"><span class="kbd">esc</span></div>
      <div class="cmd__body">
        <div class="cmd__group eyebrow">Территории</div>
        <div class="cmd__row is-active"><span class="cmd__icon">${icoSm('map')}</span><span class="cmd__main"><span class="cmd__title">Раменки</span><span class="cmd__sub">Район · Западный АО · 1 842 объекта</span></span><span class="kbd">↵</span></div>
        <div class="cmd__row"><span class="cmd__icon">${icoSm('map')}</span><span class="cmd__main"><span class="cmd__title">Раменки, улица</span><span class="cmd__sub">Улица · Раменки, ЗАО · 64 объекта</span></span></div>
        <div class="cmd__group eyebrow">Объекты</div>
        <div class="cmd__row"><span class="cmd__icon" style="background:var(--res-heat-soft);color:var(--res-heat-deep)">${icoSm('factory')}</span><span class="cmd__main"><span class="cmd__title">РТС «Раменки»</span><span class="cmd__sub">Источник · ПАО «МОЭК» · в работе</span></span></div>
        <div class="cmd__row"><span class="cmd__icon" style="background:var(--res-heat-soft);color:var(--res-heat-deep)">${icoSm('radiator')}</span><span class="cmd__main"><span class="cmd__title">ЦТП № 04-06-1180</span><span class="cmd__sub">Тепловой пункт · ул. Мосфильмовская, 17к2</span></span><span class="badge badge--alert">нарушение</span></div>
        <div class="cmd__group eyebrow">События</div>
        <div class="cmd__row"><span class="cmd__icon" style="background:var(--st-alert-soft);color:var(--st-alert)">${icoSm('warning')}</span><span class="cmd__main"><span class="cmd__title">ТН-2026-4417 · отклонение обратной сети</span><span class="cmd__sub">Раменки · открыто 4 ч назад · 1 180 потребителей</span></span></div>
        <div class="cmd__group eyebrow">Команды</div>
        <div class="cmd__row"><span class="cmd__icon">${icoSm('layers')}</span><span class="cmd__main"><span class="cmd__title">Включить слой «Износ сетей»</span></span><span class="kbd">⌘L</span></div>
        <div class="cmd__row"><span class="cmd__icon">${icoSm('doc')}</span><span class="cmd__main"><span class="cmd__title">Сформировать отчёт по текущему охвату</span></span><span class="kbd">⌘R</span></div>
      </div>
      <div class="cmd__foot">
        <span><span class="kbd">↑</span> <span class="kbd">↓</span> выбор</span>
        <span><span class="kbd">↵</span> открыть</span>
        <span><span class="kbd">⌘</span><span class="kbd">↵</span> показать на карте</span>
        <span class="u-spacer"></span>
        <span>Поиск идёт по последней принятой выгрузке</span>
      </div>
    </div>
  </div>
` })}
${filterPanel()}
${inspectorCity()}
</div>
${statusbar('')}
</div>`);

/* ============================== Запись ================================= */

function writeAll() {
  for (const s of SCREENS) {
    writeFileSync(join(DIR, s.file), page({ title: s.title, body: s.html, theme: s.theme }));
  }
  writeFileSync(join(DIR, 'index.html'), gallery());
  console.log(`Готово: ${SCREENS.length} макетов + index.html`);
}

function gallery() {
  const cards = SCREENS.map((s, i) => `<a class="card" href="${s.file}" style="text-decoration:none;color:inherit;display:block">
    <div style="aspect-ratio:16/10;background:var(--surface-3);position:relative;overflow:hidden;border-bottom:1px solid var(--border)">
      <img src="preview/${s.file.replace('.html', '.png')}" alt="" style="width:100%;height:100%;object-fit:cover;object-position:top center">
    </div>
    <div class="card__body" style="padding:13px 15px 15px">
      <div class="eyebrow">Макет ${String(i + 1).padStart(2, '0')}</div>
      <div class="card__title" style="margin:3px 0 4px">${s.title}</div>
      <div style="font-size:var(--t-sm);color:var(--ink-3);line-height:1.45">${s.note}</div>
    </div>
  </a>`).join('\n  ');

  return page({
    title: 'Дизайн-макеты',
    body: `<div class="page" style="position:static;min-height:100vh">
  <div class="page__inner">
    <div class="page__head" style="margin-bottom:var(--s-6)">
      <div>
        <div class="eyebrow">РКИИЭ 2.0 · дизайн-система</div>
        <h1 class="page__title" style="margin-top:6px">Дизайн-макеты интерфейса</h1>
        <p class="page__sub">Мониторинг объектов ресурсоснабжения Москвы. Карта — главный экран, панели плавают над ней; цвет закреплён за смыслом; состояние объекта читается формой, а не только оттенком. Спецификация — в <code>design/README.md</code>.</p>
      </div>
    </div>
    <div class="grid grid--3">
  ${cards}
    </div>
  </div>
</div>`,
  });
}

writeAll();
