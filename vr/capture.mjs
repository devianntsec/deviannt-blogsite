// Uso:  node capture.mjs <baseline|current> [--filter texto] [--concurrency 3]
// Requiere haber corrido antes el build (npm run build) → vr/site
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
  SITE, SHOTS, ORIGIN, VIEWPORTS, MODES, TILE,
  serve, allPages, shotName, arg, makeContext, FIXED_DATE,
} from './lib.mjs';

const outName = process.argv[2];
if (!['baseline', 'current'].includes(outName)) {
  console.error('Uso: node capture.mjs <baseline|current> [--filter texto] [--concurrency N]');
  process.exit(2);
}
if (!fs.existsSync(path.join(SITE, 'index.html'))) {
  console.error('No existe vr/site. Corre primero:  npm run build');
  process.exit(2);
}

const filter = arg('filter');
const concurrency = Number(arg('concurrency', 3));
const outDir = path.join(SHOTS, outName);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const FREEZE = `*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;
transition-duration:0s!important;transition-delay:0s!important;caret-color:transparent!important}
html,body{scroll-behavior:auto!important}`;

const pages = allPages().filter((u) => !filter || u.includes(filter));
const jobs = pages.flatMap((url) => VIEWPORTS.flatMap((vp) => MODES.map((mode) => ({ url, vp, mode }))));
console.log(`${pages.length} páginas × ${VIEWPORTS.length} viewports × ${MODES.length} modos = ${jobs.length} capturas`);

const server = await serve(SITE);
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
);
const errors = [];
const aborted = new Map();   // peticiones externas que el kit bloquea (tipo + url → nº de veces)

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let y = 0;
      const t = setInterval(() => {
        window.scrollBy({ top: 600, left: 0, behavior: 'instant' }); y += 600;
        if (y >= document.documentElement.scrollHeight) {
          clearInterval(t);
          window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
          resolve();
        }
      }, 50);
    });
  });
}

// Espera a que la página deje de cambiar: altura, scroll, fuentes en carga y la caja de los
// elementos que se animan por JS. Reemplaza las esperas fijas y el sondeo del título.
// Devuelve false si no se asienta en maxMs (se registra como error, no se ignora).
async function settle(page, quietMs = 500, maxMs = 8000) {
  const sig = () => page.evaluate(() => {
    const box = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return '-';
      const b = e.getBoundingClientRect();
      return [b.x, b.y, b.width, b.height].map((n) => Math.round(n * 100)).join(',');
    };
    return [
      document.documentElement.scrollHeight, window.scrollY, document.fonts.status,
      [...document.fonts].filter((f) => f.status === 'loading').length,
      box('#sidebar .dv-title-name'), box('#toc-wrapper'),
    ].join('|');
  });
  let last = await sig(), quiet = 0, waited = 0;
  while (waited < maxMs) {
    await page.waitForTimeout(100); waited += 100;
    const cur = await sig();
    if (cur === last) { quiet += 100; if (quiet >= quietMs) return true; }
    else { last = cur; quiet = 0; }
  }
  return false;
}

async function shoot({ url, vp, mode }) {
  const ctx = await makeContext(browser, vp, mode, { aborted });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${url} [${vp.name}/${mode}] ${e.message}`));
  await page.clock.setFixedTime(FIXED_DATE); // fechas relativas estables
  await page.goto(ORIGIN + url, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: FREEZE });
  await autoScroll(page);                   // dispara imágenes lazy y las fuentes de lo que está abajo
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);   // DESPUÉS del scroll: ahí ya se pidieron todas
  await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  if (!(await settle(page))) errors.push(`${url} [${vp.name}/${mode}] no se asentó en 8 s (la captura puede ser inestable)`);
  if ((await page.evaluate(() => window.scrollY)) !== 0) errors.push(`${url} [${vp.name}/${mode}] scrollY != 0 al capturar`);

  // Geometría + estado de fuentes/diagramas, para que geodiff.mjs encuentre QUÉ cambia entre corridas.
  const geo = await page.evaluate(() => {
    const depth = (e) => { let d = 0; for (let n = e.parentElement; n; n = n.parentElement) d++; return d; };
    const els = [...document.body.querySelectorAll('*')].map((e) => {
      const b = e.getBoundingClientRect();
      const cl = typeof e.className === 'string' && e.className.trim()
        ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
      return [e.tagName.toLowerCase() + (e.id ? '#' + e.id.replace(/\d{6,}/g, 'N') : '') + cl,
        Math.round(b.y * 100) / 100, Math.round(b.height * 100) / 100, Math.round(b.width * 100) / 100, depth(e)];
    });
    const fonts = [...document.fonts].map((f) =>
      [f.family, f.weight, f.style, String(f.unicodeRange).slice(0, 24), f.status].join('|'));
    const viewBoxes = [...document.querySelectorAll('.dv-diagram-wrap svg')].map((s) => s.getAttribute('viewBox'));
    const woffs = performance.getEntriesByType('resource')
      .filter((r) => /\.woff2?(\?|$)/.test(r.name)).map((r) => r.name.split('/').pop());
    return { els, fonts, viewBoxes, woffs };
  });
  fs.mkdirSync(path.join(outDir, '_geo'), { recursive: true });
  fs.writeFileSync(path.join(outDir, '_geo', shotName(url, vp.name, mode, 0).replace(/__00\.png$/, '.json')), JSON.stringify(geo));

  const height = await page.evaluate(() =>
    Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
  if (height <= TILE) {
    await page.screenshot({
      path: path.join(outDir, shotName(url, vp.name, mode, 0)),
      fullPage: true, animations: 'disabled',
    });
  } else {
    // Página inusualmente larga: la troceamos para no pegarle un PNG gigante a Chromium.
    let tile = 0;
    for (let y = 0; y < height; y += TILE) {
      await page.screenshot({
        path: path.join(outDir, shotName(url, vp.name, mode, tile++)),
        fullPage: true, animations: 'disabled',
        clip: { x: 0, y, width: vp.width, height: Math.min(TILE, height - y) },
      });
    }
  }
  await ctx.close();
}

let next = 0, done = 0;
async function worker() {
  while (next < jobs.length) {
    const job = jobs[next++];
    try { await shoot(job); }
    catch (e) { errors.push(`${job.url} [${job.vp.name}/${job.mode}] CAPTURA FALLÓ: ${e.message}`); }
    process.stdout.write(`\r${++done}/${jobs.length}`);
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
console.log('\n');

await browser.close();
server.close();
fs.writeFileSync(path.join(outDir, '_errors.log'), errors.join('\n'));
fs.writeFileSync(path.join(outDir, '_aborted.log'),
  [...aborted].sort((x, y) => y[1] - x[1]).map(([k, n]) => `${n}×  ${k}`).join('\n'));
const blockedCss = [...aborted.keys()].filter((k) => /^(stylesheet|font) /.test(k));
if (blockedCss.length) console.log(`⚠ el kit bloquea ${blockedCss.length} hoja(s)/fuente(s) externas que producción sí carga (ver shots/${outName}/_aborted.log)`);
console.log(errors.length ? `⚠ ${errors.length} errores de página/captura (ver shots/${outName}/_errors.log)` : '✓ sin errores JS');
console.log(`Capturas en vr/shots/${outName}`);