// Uso:  node coverage.mjs [--filter texto] [--top 40] [--no-states]
// Requiere:  npm run build  (→ vr/site)  y  npm i  (añade postcss a vr/)
//
// Mide qué reglas CSS se usan de verdad (cobertura de Chrome) en todas las
// páginas del kit × 2 viewports × 2 modos, ejercitando estados: scroll, hover,
// foco con Tab, sidebar móvil, buscador, toggle de tema, colapsables e impresión.
// Salida: vr/coverage/report.json + resumen por hoja y por "origen" de selector
// (bootstrap-util, bootstrap-comp, chirpy, custom, otros).
//
// Límite honesto: "sin uso aquí" ≠ "borrable". Un estado que el script no
// provoca (error de red, JS tardío) aparece como no usado. Úsalo para decidir
// QUÉ revisar, y confirma cada recorte con `npm run check` (kit visual).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import postcss from 'postcss';
import { HERE, ORIGIN, SITE, VIEWPORTS, MODES, serve, allPages, arg } from './lib.mjs';

if (!fs.existsSync(path.join(SITE, 'index.html'))) {
  console.error('No existe vr/site. Corre primero:  npm run build');
  process.exit(2);
}
const filter = arg('filter');
const TOP = Number(arg('top', 40));
const states = !process.argv.includes('--no-states');
const OUT = path.join(HERE, 'coverage');
fs.mkdirSync(OUT, { recursive: true });

// ── clasificación heurística del selector ───────────────────────────────
const BS_UTIL = /^\.(d|m[trblxy se]?|p[trblxy se]?|g[xy]?|gap|w|h|mw|mh|vw|vh|flex|justify|align|order|float|text|fw|fs|lh|bg|border|rounded|shadow|opacity|overflow|position|top|bottom|start|end|translate|z|visible|invisible|user-select|pe|object|link|col|row|offset|ratio|vstack|hstack|visually-hidden|sticky|fixed|clearfix|container|table|font)(-|$)/;
const BS_COMP = /^\.(btn|nav|navbar|card|modal|tooltip|popover|dropdown|carousel|accordion|alert|badge|breadcrumb|pagination|progress|list-group|toast|spinner|offcanvas|placeholder|form|input|btn-close|collapse|collapsing|fade|show|tab|bs-)/;
function classify(sel) {
  if (/\.dv-|#dv-|\.dv_/.test(sel)) return 'custom';
  const first = sel.trim().split(/[\s>+~,]/)[0];
  if (BS_UTIL.test(first)) return 'bootstrap-util';
  if (BS_COMP.test(first) || /^:root|^\[data-bs|^\*|^::?(before|after)$|^(html|body|a|p|h[1-6]|ul|ol|li|table|th|td|img|button|input|label|hr|small|abbr|code|pre|kbd|blockquote|figure|textarea|select)\b/.test(first)) return 'base/bootstrap-reboot';
  return 'chirpy/otros';
}

// ── ejercitar estados ──────────────────────────────────────────────────
const found = {}; // qué controles existieron (para saber qué NO se ejercitó)
const note = (k) => { found[k] = (found[k] || 0) + 1; };
async function tryClick(page, sel, key) {
  const loc = page.locator(sel).first();
  try {
    if (!(await loc.count())) return false;
    await loc.click({ timeout: 1500, force: true });
    note(key); await page.waitForTimeout(250); return true;
  } catch { return false; }
}
async function exercise(page, vp) {
  // scroll completo (back-to-top, scroll-spy, lazy)
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 500) {
      window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40));
    }
  });
  note('scroll'); await page.waitForTimeout(300);
  // hover sobre todo lo interactivo (hasta 80)
  const targets = await page.$$('a, button, [role=button], summary, .card, .post-preview, .tag, .dv-tag');
  let n = 0;
  for (const el of targets.slice(0, 80)) {
    try { await el.scrollIntoViewIfNeeded({ timeout: 300 }); await el.hover({ timeout: 300, force: true }); n++; } catch {}
  }
  found.hover = (found.hover || 0) + n;
  // foco con teclado (:focus-visible)
  for (let i = 0; i < 25; i++) await page.keyboard.press('Tab');
  note('tab-focus');
  await page.evaluate(() => window.scrollTo(0, 0));
  // colapsables / toggles bootstrap
  const toggles = await page.$$('[data-bs-toggle], .category-trigger, details > summary');
  for (const t of toggles.slice(0, 12)) {
    try { await t.click({ timeout: 800, force: true }); note('collapse/toggle'); await page.waitForTimeout(150); } catch {}
  }
  // tema
  await tryClick(page, '#mode-toggle, .mode-toggle, [data-mode-toggle], #dv-theme-toggle', 'theme-toggle');
  await tryClick(page, '#mode-toggle, .mode-toggle, [data-mode-toggle], #dv-theme-toggle', 'theme-toggle');
  // sidebar móvil
  if (vp.isMobile) {
    if (await tryClick(page, '#sidebar-trigger', 'sidebar-open')) {
      await tryClick(page, '#mask, #sidebar-trigger', 'sidebar-close');
    }
  }
  // buscador
  const opened = vp.isMobile ? await tryClick(page, '#search-trigger', 'search-open') : true;
  if (opened) {
    try {
      const inp = page.locator('#search-input').first();
      if (await inp.count()) {
        await inp.fill('cve', { timeout: 1500 }); note('search-input');
        await page.waitForTimeout(600);
        await inp.fill('zzzzqx', { timeout: 1500 }); note('search-empty');
        await page.waitForTimeout(400);
        await inp.fill('', { timeout: 1500 });
      }
    } catch {}
    await tryClick(page, '#search-cancel', 'search-cancel');
  }
  // back to top
  await tryClick(page, '#back-to-top', 'back-to-top');
  // imágenes → popup (glightbox)
  await tryClick(page, 'a.popup, .post-content img', 'img-popup');
  await page.keyboard.press('Escape');
}

// ── agregación por hoja ────────────────────────────────────────────────
const sheets = new Map(); // key = pathname → { text, used: Uint8Array }
function absorb(entries) {
  for (const e of entries) {
    let u; try { u = new URL(e.url); } catch { continue; }
    if (u.origin !== ORIGIN || !u.pathname.endsWith('.css')) continue;
    let s = sheets.get(u.pathname);
    if (!s) { s = { text: e.text, used: new Uint8Array(e.text.length) }; sheets.set(u.pathname, s); }
    for (const r of e.ranges) s.used.fill(1, r.start, r.end);
  }
}

const pages = allPages().filter((u) => !filter || u.includes(filter));
const server = await serve(SITE);
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const errors = [];

async function run({ url, vp, mode, media }) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.isMobile,
    colorScheme: mode, locale: 'en-US', timezoneId: 'UTC',
  });
  await ctx.addInitScript((m) => { try { localStorage.setItem('dv-mode', m); sessionStorage.setItem('mode', m); } catch (e) {} }, mode);
  await ctx.route('**/*', (route) => {
    const req = route.request();
    if (new URL(req.url()).origin === ORIGIN) return route.continue();
    if (req.resourceType() === 'image') return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') });
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${url} [${vp.name}/${mode}] ${e.message}`));
  await page.coverage.startCSSCoverage();
  await page.goto(ORIGIN + url, { waitUntil: 'networkidle' });
  if (media === 'print') await page.emulateMedia({ media: 'print' });
  else if (states) await exercise(page, vp);
  absorb(await page.coverage.stopCSSCoverage());
  await ctx.close();
}

const jobs = pages.flatMap((url) => VIEWPORTS.flatMap((vp) => MODES.map((mode) => ({ url, vp, mode }))));
console.log(`${pages.length} páginas × ${VIEWPORTS.length} viewports × ${MODES.length} modos = ${jobs.length} cargas${states ? ' + estados' : ''}`);
const queue = [...jobs]; let done = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  while (queue.length) {
    const j = queue.shift();
    try { await run(j); } catch (e) { errors.push(`${j.url} [${j.vp.name}/${j.mode}] ${e.message}`); }
    if (++done % 8 === 0) process.stdout.write(`  ${done}/${jobs.length}\r`);
  }
}));
// impresión: una carga por página (desktop, modo claro)
for (const url of pages) {
  try { await run({ url, vp: VIEWPORTS[0], mode: 'light', media: 'print' }); } catch (e) { errors.push(`${url} [print] ${e.message}`); }
}
await browser.close(); server.close();

// ── análisis de reglas ─────────────────────────────────────────────────
const report = { generated: new Date().toISOString(), pages: pages.length, controlsExercised: found, errors, sheets: {} };
for (const [name, s] of sheets) {
  const root = postcss.parse(s.text);
  const tot = { rules: 0, used: 0, bytes: s.text.length, usedBytes: 0 };
  const byBucket = {}; const unused = [];
  root.walkRules((rule) => {
    if (rule.parent?.type === 'atrule' && /keyframes$/i.test(rule.parent.name)) return;
    const start = rule.source.start.offset, end = rule.source.end.offset;
    const used = s.used[start] === 1;
    const bytes = end - start;
    tot.rules++; if (used) { tot.used++; tot.usedBytes += bytes; }
    const b = classify(rule.selector.split(',')[0]);
    byBucket[b] ??= { rules: 0, unusedRules: 0, unusedBytes: 0 };
    byBucket[b].rules++;
    if (!used) { byBucket[b].unusedRules++; byBucket[b].unusedBytes += bytes; unused.push({ selector: rule.selector.slice(0, 140), bytes, bucket: b }); }
  });
  unused.sort((a, b) => b.bytes - a.bytes);
  report.sheets[name] = { ...tot, byBucket, unusedTop: unused.slice(0, 400) };
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log('\n════ COBERTURA CSS ════');
for (const [name, r] of Object.entries(report.sheets)) {
  console.log(`\n${name}  (${kb(r.bytes)})  reglas usadas ${r.used}/${r.rules} (${((100 * r.used) / r.rules).toFixed(0)}%)`);
  for (const [b, v] of Object.entries(r.byBucket).sort((x, y) => y[1].unusedBytes - x[1].unusedBytes))
    console.log(`   ${b.padEnd(24)} ${String(v.unusedRules).padStart(5)}/${String(v.rules).padEnd(5)} sin uso  ≈ ${kb(v.unusedBytes)}`);
  console.log(`   mayores sin uso:`);
  for (const u of r.unusedTop.slice(0, Math.min(TOP, 10))) console.log(`     ${String(u.bytes).padStart(6)} B  ${u.selector}`);
}
console.log('\nControles ejercitados:', JSON.stringify(found));
if (errors.length) console.log(`\n⚠ ${errors.length} incidencias (ver report.json → errors)`);
console.log(`\nInforme completo: vr/coverage/report.json`);
