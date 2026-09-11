#!/usr/bin/env node
/**
 * Сборка демо в один HTML-файл: стили, Leaflet и код приложения
 * встраиваются внутрь страницы. Нужна, чтобы демо можно было передать
 * одним файлом или опубликовать там, где нет доступа к соседним файлам.
 *
 *   node tools/bundle.js [выходной файл]
 *
 * Для повседневной работы сборка не требуется — `npm start` отдаёт исходники
 * как есть, без зависимостей.
 */

import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT = resolve(ROOT, process.argv[2] || 'dist/rkiie-demo.html');

const read = (path) => readFile(resolve(ROOT, path), 'utf8');

// Порядок совпадает с index.html: токены → библиотека компонентов →
// правила приложения → карта → модуль «Анализ территории».
const STYLES = [
  'vendor/leaflet/leaflet.css',
  'styles/tokens.css',
  'styles/ui.css',
  'styles/app.css',
  'styles/map.css',
  'styles/terra.css',
];

const [css, leafletJs] = await Promise.all([
  Promise.all(STYLES.map(read)).then((parts) => parts.join('\n')),
  read('vendor/leaflet/leaflet.js'),
]);

const bundled = await build({
  entryPoints: [resolve(ROOT, 'src/main.js')],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  charset: 'utf8',
  write: false,
  logLevel: 'warning',
});
const appJs = bundled.outputFiles[0].text;

// Страница собирается без обёртки <html>/<head>/<body>: так её принимает
// и публикация артефактом, и обычный браузер.
const html = `<title>РКИИЭ 2.0</title>
<meta name="description" content="Демонстрационный стенд мониторинга объектов ресурсоснабжения города на карте." />
<style>
${css}
</style>

<div class="app" id="app"></div>

<script>
${leafletJs}
</script>
<script>
${appJs}
</script>
`;

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, html, 'utf8');
console.log(`${OUT} — ${(Buffer.byteLength(html) / 1024).toFixed(0)} КБ`);
