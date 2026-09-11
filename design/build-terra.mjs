/**
 * Геометрия для макетов «Анализа территории».
 *
 *     node design/build-terra.mjs
 *
 * Берёт настоящий контур района Некрасовка из src/data/territories.js,
 * строит по нему подложку крупного плана (соседние районы, улично-дорожная
 * сеть, существующая застройка) и раскладывает полигоны перспективной
 * застройки по свободной части района — не «где попало», а вдоль улиц.
 *
 * Результат: design/assets/map-nekrasovka.svg и design/data/terra-geo.json.
 * Оба файла сгенерированы, править их руками не нужно.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DISTRICT_RINGS } from '../src/data/territories.js';

const DIR = dirname(fileURLToPath(import.meta.url));
const W = 1600, H = 914, PAD = 34;
const HOME = 'uvao-nekrasovka';

/* ------------------------------- проекция ------------------------------- */
const merc = ([lat, lon]) => [lon, Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI / 180) / 2)) * 180 / Math.PI];
const home = DISTRICT_RINGS[HOME][0].map(merc);
const xs = home.map((p) => p[0]), ys = home.map((p) => p[1]);
const bb = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
const gx = (bb.x1 - bb.x0) * 0.05, gy = (bb.y1 - bb.y0) * 0.05;
bb.x0 -= gx; bb.x1 += gx; bb.y0 -= gy; bb.y1 += gy;
const sc = Math.min((W - PAD * 2) / (bb.x1 - bb.x0), (H - PAD * 2) / (bb.y1 - bb.y0));
const ox = (W - (bb.x1 - bb.x0) * sc) / 2 - 118, oy = (H - (bb.y1 - bb.y0) * sc) / 2;
const proj = (p) => { const [x, y] = merc(p); return [(x - bb.x0) * sc + ox, (bb.y1 - y) * sc + oy]; };
const path = (ring) => 'M' + ring.map((p) => proj(p).map((v) => v.toFixed(1)).join(',')).join('L') + 'Z';

const poly = DISTRICT_RINGS[HOME][0].map(proj);
const inside = ([px, py]) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};
const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
const cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;

/* Планировочная сетка: район вытянут с запада на восток, кварталы
   развёрнуты вдоль главной оси. */
const ANG = -14 * Math.PI / 180;
const cos = Math.cos(ANG), sin = Math.sin(ANG);
const toWorld = ([u, v]) => [cx + u * cos - v * sin, cy + u * sin + v * cos];
const rectPts = (u, v, w, h) => [[u, v], [u + w, v], [u + w, v + h], [u, v + h]].map(toWorld);
const fits = (pts) => pts.every(inside);
/* Квартал считается вписанным, если внутри контура лежат его углы, слегка
   поджатые внутрь: иначе у извилистой границы отсеиваются годные места. */
const fitsSoft = (pts, inset = 9) => {
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return pts.every(([x, y]) => {
    const d = Math.hypot(x - mx, y - my) || 1;
    return inside([x + ((mx - x) / d) * inset, y + ((my - y) / d) * inset]);
  });
};
const fmt = (pts) => pts.map((p) => p.map((n) => +n.toFixed(1)));

/* --------------------------- улично-дорожная сеть ------------------------ */
const streets = [];
for (let v = -420; v <= 420; v += 54) streets.push({ pts: [toWorld([-360, v]), toWorld([360, v])], main: v % 216 === 0 });
for (let u = -360; u <= 360; u += 72) streets.push({ pts: [toWorld([u, -420]), toWorld([u, 420])], main: u % 288 === 0 });

/* Продолжение улично-дорожной сети за границами района: без него район
   выглядит островом в пустоте, а не частью города. */
const around = [];
for (let v = -900; v <= 900; v += 54) around.push([toWorld([-1100, v]), toWorld([1100, v])]);
for (let u = -1100; u <= 1100; u += 72) around.push([toWorld([u, -900]), toWorld([u, 900])]);
let bseed = 21;
const brnd = () => (bseed = (bseed * 1103515245 + 12345) % 2147483648) / 2147483648;
const aroundBlocks = [];
for (let u = -1080; u < 1080; u += 72) {
  for (let v = -880; v < 880; v += 54) {
    const skip = brnd();
    if (skip < 0.34) continue;                       // не сплошная сетка: город неровный
    const w = 30 + brnd() * 22, h = 20 + brnd() * 14;
    const r = rectPts(u + 10, v + 9, w, h);
    if (!fitsSoft(r, 2)) aroundBlocks.push(fmt(r));
  }
}
/* Зелёные зоны и вода — Люберецкие поля аэрации и пруды по соседству. */
const green = [[-540, 470, 190, 120], [420, -520, 150, 200], [-820, -120, 160, 150]].map(([u, v, w, h]) => fmt(rectPts(u, v, w, h)));
const water = fmt([toWorld([560, 330]), toWorld([700, 300]), toWorld([760, 380]), toWorld([690, 470]), toWorld([560, 450])]);

/* ------------------- существующая застройка (северо-запад) --------------- */
const built = [];
for (let u = -270; u < 270; u += 60) {
  for (let v = -380; v < -10; v += 46) {
    const r = rectPts(u + 8, v + 7, 46, 32);
    if (fitsSoft(r, 4)) built.push(fmt(r));
  }
}

/* ------------------ полигоны перспективной застройки (юго-восток) -------- */
const NAMES = [
  'Некрасовка, кв. 8', 'Некрасовка, кв. 9', 'Люберецкие поля, уч. 3', 'Некрасовка, кв. 12',
  'Некрасовка, кв. 14', 'Некрасовка, кв. 15', 'Люберецкие поля, уч. 5', 'Некрасовка, кв. 17',
];
const LOAD = ['9,7', '7,3', '15,1', '12,4', '11,8', '6,2', '18,6', '5,4'];
const OCS = [12, 9, 21, 18, 16, 8, 24, 7];
const ppz = [];
let n = 0;
outer:
for (let v = -20; v < 440 && n < 8; v += 92) {
  for (let u = -280; u < 280 && n < 8; u += 116) {
    const r = rectPts(u, v, 104, 84);
    if (!fitsSoft(r, 13)) continue;
    const id = String(11 + n).padStart(3, '0');
    ppz.push({
      id, name: NAMES[n], load: LOAD[n], ocs: OCS[n],
      rki: String(4417804 + n * 5),
      ring: fmt(r),
      centre: fmt([toWorld([u + 52, v + 43])])[0],
      u, v,
    });
    n++;
    if (n >= 8) break outer;
  }
}

/* ---------------- дома внутри полигонов: секции разной этажности ---------- */
const FLOORS = [9, 12, 14, 17, 22, 25];
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
for (const p of ppz) {
  p.houses = [];
  const cols = 3, rows = 3;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (rnd() < 0.18) continue;
      const w = 28 + rnd() * 8, h = 17 + rnd() * 6;
      const u = p.u + 8 + i * 32, v = p.v + 8 + j * 26;
      p.houses.push({ ring: fmt(rectPts(u, v, w, h)), floors: FLOORS[Math.floor(rnd() * FLOORS.length)] });
    }
  }
}

/* ------------------------ магистральные тепловые сети -------------------- */
const mts = [[-140, -412], [-90, -250], [-20, -70], [40, 120], [150, 300], [250, 420]].map((c) => fmt([toWorld(c)])[0]);
const source = fmt([toWorld([-150, -430])])[0];

/* --------------------------------- SVG ---------------------------------- */
const others = Object.entries(DISTRICT_RINGS)
  .filter(([id]) => id !== HOME)
  .map(([, rings]) => rings.map((r) => path(r)).join(''))
  .join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Район Некрасовка">
<defs>
  <clipPath id="home"><path d="${path(DISTRICT_RINGS[HOME][0])}"/></clipPath>
  <filter id="lift" x="-8%" y="-8%" width="116%" height="116%">
    <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#2b3a52" flood-opacity=".14"/>
  </filter>
</defs>
<rect width="${W}" height="${H}" fill="#eaeef4"/>
<g fill="#e2e7ee" stroke="#ffffff" stroke-width="1.2">${others}</g>
<g stroke="#e6eaf1" stroke-width="5">${around.map((a) => `<line x1="${a[0][0].toFixed(1)}" y1="${a[0][1].toFixed(1)}" x2="${a[1][0].toFixed(1)}" y2="${a[1][1].toFixed(1)}"/>`).join('')}</g>
<g fill="#e1e6ee">${aroundBlocks.map((r) => `<polygon points="${r.map((p) => p.join(',')).join(' ')}"/>`).join('')}</g>
<g fill="#dfeada">${green.map((r) => `<polygon points="${r.map((p) => p.join(',')).join(' ')}" rx="8"/>`).join('')}</g>
<polygon points="${water.map((p) => p.join(',')).join(' ')}" fill="#d5e6f6"/>
<g filter="url(#lift)"><path d="${path(DISTRICT_RINGS[HOME][0])}" fill="#f7f9fc"/></g>
<g clip-path="url(#home)">
  <g stroke="#dfe5ee">${streets.filter((s) => !s.main).map((s) => `<line x1="${s.pts[0][0].toFixed(1)}" y1="${s.pts[0][1].toFixed(1)}" x2="${s.pts[1][0].toFixed(1)}" y2="${s.pts[1][1].toFixed(1)}" stroke-width="7"/>`).join('')}</g>
  <g stroke="#ffffff">${streets.filter((s) => !s.main).map((s) => `<line x1="${s.pts[0][0].toFixed(1)}" y1="${s.pts[0][1].toFixed(1)}" x2="${s.pts[1][0].toFixed(1)}" y2="${s.pts[1][1].toFixed(1)}" stroke-width="4.5"/>`).join('')}</g>
  <g stroke="#d3dae5">${streets.filter((s) => s.main).map((s) => `<line x1="${s.pts[0][0].toFixed(1)}" y1="${s.pts[0][1].toFixed(1)}" x2="${s.pts[1][0].toFixed(1)}" y2="${s.pts[1][1].toFixed(1)}" stroke-width="14"/>`).join('')}</g>
  <g stroke="#ffffff">${streets.filter((s) => s.main).map((s) => `<line x1="${s.pts[0][0].toFixed(1)}" y1="${s.pts[0][1].toFixed(1)}" x2="${s.pts[1][0].toFixed(1)}" y2="${s.pts[1][1].toFixed(1)}" stroke-width="10"/>`).join('')}</g>
  <g fill="#dbe1ea">${built.map((r) => `<polygon points="${r.map((p) => p.join(',')).join(' ')}"/>`).join('')}</g>
</g>
<path d="${path(DISTRICT_RINGS[HOME][0])}" fill="none" stroke="#8595ad" stroke-width="2" stroke-linejoin="round"/>
</svg>`;

mkdirSync(join(DIR, 'assets'), { recursive: true });
mkdirSync(join(DIR, 'data'), { recursive: true });
writeFileSync(join(DIR, 'assets', 'map-nekrasovka.svg'), svg);
writeFileSync(join(DIR, 'data', 'terra-geo.json'), JSON.stringify({ ppz, mts, source, W, H }, null, 1));
console.log(`Готово: ${ppz.length} ППЗ, ${ppz.reduce((a, p) => a + p.houses.length, 0)} домов, ${built.length} кварталов застройки`);
