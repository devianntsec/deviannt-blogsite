// Uso:  node hover.mjs <baseline|current> [--filter texto] [--concurrency 3]
// Sonda de estados que las capturas estáticas no ven: reposo, :hover y :focus-visible.
// No compara píxeles: guarda los estilos calculados de cada elemento interactivo en cada estado
// (shots/<nombre>/_hover/*.json). hoverdiff.mjs compara baseline contra current.
// Solo escritorio (en móvil no hay hover). Requiere vr/site construido (npm run build).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { SITE, SHOTS, ORIGIN, MODES, serve, allPages, shotName, placeholderPng, arg } from './lib.mjs';

const outName = process.argv[2];
if (!['baseline', 'current'].includes(outName)) {
  console.error('Uso: node hover.mjs <baseline|current> [--filter texto] [--concurrency N]');
  process.exit(2);
}
if (!fs.existsSync(path.join(SITE, 'index.html'))) { console.error('No existe vr/site. Corre primero:  npm run build'); process.exit(2); }

const filter = arg('filter');
const concurrency = Number(arg('concurrency', 3));
const VP = { name: 'desktop', width: 1440, height: 900 };
const outDir = path.join(SHOTS, outName, '_hover');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const PLACEHOLDER = placeholderPng();
const FREEZE = `*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;
transition-duration:0s!important;transition-delay:0s!important;caret-color:transparent!important}
html,body{scroll-behavior:auto!important}`;

const SELECTOR = [
  'a[href]', 'button', 'input', 'textarea', 'select', 'summary', 'label', '[role="button"]',
  '[tabindex]:not([tabindex="-1"])', 'tr', 'th', 'td', 'li', 'pre', 'code',
  '[class*="card"]', '[class*="tag"]', '[class*="callout"]', '[class*="prompt"]', '[class*="step"]',
  '[class*="toggle"]', '[class*="social"]', '[class*="badge"]', '[class*="search"]', '[class*="toc"]',
  '[class*="timeline"]', '[class*="task"]', '[class*="trending"]', '[class*="pagination"]',
  '.nav-link', '.dv-diagram-wrap [class]', '.dv-title-name',
].join(',');

const PROPS = ['color', 'background-color', 'background-image', 'border-top-color', 'border-right-color',
  'border-bottom-color', 'border-left-color', 'border-top-width', 'border-bottom-width', 'box-shadow',
  'outline-color', 'outline-style', 'outline-width', 'outline-offset', 'opacity', 'transform', 'filter',
  'text-decoration-line', 'text-decoration-color', 'cursor', 'fill', 'stroke', 'font-weight',
  'letter-spacing', 'width', 'height', 'padding-top', 'padding-left', 'margin-top', 'visibility', 'display'];
const PPROPS = ['content', 'color', 'background-color', 'border-top-color', 'box-shadow', 'opacity',
  'transform', 'width', 'height', 'display'];

const MAX_PER_SIG = 2, MAX_PER_PAGE = 160;
const server = await serve(SITE);
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const errors = [];

async function probe({ url, mode }) {
  const ctx = await browser.newContext({
    viewport: { width: VP.width, height: VP.height }, deviceScaleFactor: 1, colorScheme: mode,
    locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'no-preference',
  });
  await ctx.addInitScript((m) => { try { localStorage.setItem('dv-mode', m); sessionStorage.setItem('mode', m); } catch (e) {} }, mode);
  await ctx.route('**/*', (route) => {
    const req = route.request();
    if (new URL(req.url()).origin === ORIGIN) return route.continue();
    if (req.resourceType() === 'image') return route.fulfill({ status: 200, contentType: 'image/png', body: PLACEHOLDER });
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${url} [${mode}] ${e.message}`));
  await page.clock.setFixedTime(new Date('2026-10-07T12:00:00Z'));
  await page.goto(ORIGIN + url, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: FREEZE });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);

  // Marca los elementos visibles (máx. MAX_PER_SIG por firma de tag+clases) con data-vr-i.
  const targets = await page.evaluate(({ sel, maxSig, maxPage }) => {
    const seen = new Map(), out = [];
    for (const e of document.querySelectorAll(sel)) {
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const cn = typeof e.className === 'string' ? e.className : (e.getAttribute('class') || '');
      const sig = e.tagName.toLowerCase() + '.' + cn.trim().split(/\s+/).slice(0, 3).join('.');
      const n = seen.get(sig) || 0;
      if (n >= maxSig) continue;
      seen.set(sig, n + 1);
      e.setAttribute('data-vr-i', String(out.length));
      out.push(`${sig}#${n}`);
      if (out.length >= maxPage) break;
    }
    return out;
  }, { sel: SELECTOR, maxSig: MAX_PER_SIG, maxPage: MAX_PER_PAGE });

  const read = (i) => page.evaluate(([i, props, pprops]) => {
    const e = document.querySelector(`[data-vr-i="${i}"]`);
    if (!e) return null;
    // Lleva a su estado final toda transición/animación finita en curso. El FREEZE del kit no basta:
    // una regla del sitio con `transition: … !important` lo gana, y al quitarle el !important el
    // FREEZE pasa a ganar. Sin esto, la sonda mediría la transición a medias y vería diferencias falsas.
    for (const a of document.getAnimations()) { try { a.finish(); } catch (err) {} }
    const s = getComputedStyle(e), o = {};
    for (const p of props) o[p] = s.getPropertyValue(p);
    for (const ps of ['::before', '::after']) {
      const q = getComputedStyle(e, ps);
      for (const p of pprops) o[ps + ' ' + p] = q.getPropertyValue(p);
    }
    return o;
  }, [i, PROPS, PPROPS]);

  const result = {};
  await page.mouse.move(0, 0);
  await page.keyboard.press('Shift');          // para que el foco programático cuente como :focus-visible
  for (let i = 0; i < targets.length; i++) {
    const st = { rest: null, hover: null, focus: null };
    const pos = await page.evaluate((i) => {
      const e = document.querySelector(`[data-vr-i="${i}"]`);
      e.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, i);
    await page.mouse.move(0, 0);
    st.rest = await read(i);
    await page.mouse.move(pos.x, pos.y);
    st.hover = await read(i);
    await page.mouse.move(0, 0);
    const focusable = await page.evaluate((i) => {
      const e = document.querySelector(`[data-vr-i="${i}"]`);
      if (typeof e.focus !== 'function') return false;
      e.focus({ preventScroll: true });
      return document.activeElement === e;
    }, i);
    if (focusable) st.focus = await read(i);
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    result[targets[i]] = st;
  }
  fs.writeFileSync(path.join(outDir, shotName(url, VP.name, mode, 0).replace(/__00\.png$/, '.json')), JSON.stringify(result));
  await ctx.close();
}

const pages = allPages().filter((u) => !filter || u.includes(filter));
const jobs = pages.flatMap((url) => MODES.map((mode) => ({ url, mode })));
console.log(`${pages.length} páginas × desktop × ${MODES.length} modos = ${jobs.length} sondas (reposo, hover, focus)`);
let next = 0, done = 0;
async function worker() {
  while (next < jobs.length) {
    const job = jobs[next++];
    try { await probe(job); } catch (e) { errors.push(`${job.url} [${job.mode}] SONDA FALLÓ: ${e.message}`); }
    process.stdout.write(`\r${++done}/${jobs.length}`);
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
console.log('\n');
await browser.close(); server.close();
fs.writeFileSync(path.join(SHOTS, outName, '_hover-errors.log'), errors.join('\n'));
console.log(errors.length ? `⚠ ${errors.length} errores (ver shots/${outName}/_hover-errors.log)` : '✓ sin errores');
console.log(`Estilos en vr/shots/${outName}/_hover`);
