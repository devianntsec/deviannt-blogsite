// Uso:  node probe.mjs [--filter dwm | --url /es/] [--runs 8] [--concurrency 3]
//                      [--viewport desktop|mobile] [--mode dark|light] [--wait 2500]
//
// Carga LA MISMA página N veces (mismo HTML, sin reconstruir) con las mismas condiciones
// que capture.mjs, y reporta qué varía entre cargas:
//   1) por cada diagrama: el viewBox que calcula __dvDiagramInit, cuántas fuentes llevaba
//      cargadas en ese instante y el viewBox final;
//   2) la altura total del documento;
//   3) los primeros elementos (en orden DOM) cuya caja cambia respecto a la corrida 0.
// No modifica nada del repo; escribe vr/shots/probe.json con los datos crudos.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { SHOTS, ORIGIN, VIEWPORTS, SITE, serve, allPages, placeholderPng, arg } from './lib.mjs';

const runs = Number(arg('runs', 8));
const concurrency = Number(arg('concurrency', 3));
const waitMs = Number(arg('wait', 2500));
const vp = VIEWPORTS.find((v) => v.name === arg('viewport', 'desktop')) || VIEWPORTS[0];
const mode = arg('mode', 'dark');
const filter = arg('filter');

if (!fs.existsSync(path.join(SITE, 'index.html'))) {
  console.error('No existe vr/site. Corre primero:  npm run build');
  process.exit(2);
}
const url = arg('url') || allPages().find((u) => !filter || u.includes(filter));
if (!url) { console.error('Ninguna página coincide con el filtro.'); process.exit(2); }
console.log(`Página: ${url}  [${vp.name}/${mode}]  ${runs} cargas, concurrencia ${concurrency}\n`);

const PLACEHOLDER = placeholderPng();
const FREEZE = `*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;
transition-duration:0s!important;transition-delay:0s!important;caret-color:transparent!important}`;

// Envuelve __dvDiagramInit para registrar, en el MISMO frame en que el sitio mide el texto
// (después de sus dos rAF), el viewBox resultante y cuántas fuentes estaban cargadas.
const INSTRUMENT = () => {
  let real;
  Object.defineProperty(window, '__dvDiagramInit', {
    configurable: true,
    get() { return real; },
    set(fn) {
      real = function (id) {
        const out = fn.apply(this, arguments);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const svg = document.getElementById(id)?.querySelector('.dv-diagram-svg');
          const faces = [...document.fonts];
          (window.__dvProbe = window.__dvProbe || []).push({
            vbAtInit: svg ? svg.getAttribute('viewBox') : null,
            fontsLoaded: faces.filter((f) => f.status === 'loaded').length,
            fontsTotal: faces.length,
          });
        }));
        return out;
      };
    },
  });
};

const COLLECT = () => {
  const segs = (el) => {
    const out = [];
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const i = n.parentElement ? [...n.parentElement.children].indexOf(n) + 1 : 1;
      out.push(`${n.tagName.toLowerCase()}:${i}`);
    }
    return out.reverse().join('>');
  };
  const label = (el) =>
    el.tagName.toLowerCase() + (el.id ? '#' + el.id.replace(/\d{10,}/g, 'N') : '') +
    ([...el.classList].slice(0, 2).map((c) => '.' + c).join(''));
  const r2 = (n) => Math.round(n * 100) / 100;
  const boxes = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue; // los hijos del SVG no aportan al layout de página
    const b = el.getBoundingClientRect();
    boxes.push([segs(el), label(el), r2(b.left + scrollX), r2(b.top + scrollY), r2(b.width), r2(b.height)]);
  }
  const aside = document.querySelector('#sidebar');
  const asideCss = aside ? getComputedStyle(aside) : null;
  return {
    height: document.documentElement.scrollHeight,
    scroll: { x: scrollX, y: scrollY, behavior: getComputedStyle(document.documentElement).scrollBehavior },
    sidebar: asideCss ? { position: asideCss.position, top: asideCss.top, transform: asideCss.transform } : null,
    fontErrors: [...document.fonts].filter((f) => f.status === 'error').map((f) => `${f.family} ${f.weight}`),
    diagrams: [...document.querySelectorAll('.dv-diagram-svg')].map((s) => ({
      vbFinal: s.getAttribute('viewBox'),
      h: Math.round(s.getBoundingClientRect().height * 100) / 100,
    })),
    init: window.__dvProbe || [],
    boxes,
  };
};

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
);
const server = await serve(SITE);

async function load() {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1,
    isMobile: vp.isMobile, hasTouch: vp.isMobile, colorScheme: mode,
    locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'no-preference',
  });
  await ctx.addInitScript((m) => {
    try { localStorage.setItem('dv-mode', m); sessionStorage.setItem('mode', m); } catch (e) {}
  }, mode);
  await ctx.addInitScript(INSTRUMENT);
  await ctx.route('**/*', (route) => {
    const req = route.request();
    if (new URL(req.url()).origin === ORIGIN) return route.continue();
    if (req.resourceType() === 'image') return route.fulfill({ status: 200, contentType: 'image/png', body: PLACEHOLDER });
    return route.abort();
  });
  const page = await ctx.newPage();
  const bad = [];
  page.on('response', (r) => {
    const u = new URL(r.url());
    if (u.origin === ORIGIN && r.status() >= 400) bad.push(`${r.status()} ${u.pathname}`);
  });
  await page.clock.setFixedTime(new Date('2026-10-07T12:00:00Z'));
  await page.goto(ORIGIN + url, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: FREEZE });
  await page.evaluate(async () => {            // scroll completo, como en capture.mjs
    await new Promise((resolve) => {
      let y = 0;
      const t = setInterval(() => {
        scrollBy(0, 600); y += 600;
        if (y >= document.documentElement.scrollHeight) { clearInterval(t); scrollTo(0, 0); resolve(); }
      }, 50);
    });
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(waitMs);            // espera larga a propósito: queremos ver si AÚN así varía
  const data = await page.evaluate(COLLECT);
  data.bad = bad;
  await ctx.close();
  return data;
}

const results = new Array(runs);
let next = 0;
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (next < runs) {
    const i = next++;
    try { results[i] = await load(); } catch (e) { results[i] = { error: e.message }; }
    process.stdout.write(`\r${results.filter(Boolean).length}/${runs}`);
  }
}));
console.log('\n');
await browser.close();
server.close();

const ok = results.filter((r) => r && !r.error);
if (ok.length < 2) { console.error('Faltan cargas válidas.', results.map((r) => r?.error).filter(Boolean)); process.exit(1); }
fs.mkdirSync(SHOTS, { recursive: true });
fs.writeFileSync(path.join(SHOTS, 'probe.json'), JSON.stringify({ url, vp: vp.name, mode, ok }, null, 1));

// ---------- Informe ----------
console.log('Corrida  altura   diagramas (viewBox al medir | fuentes cargadas/total al medir | viewBox final)');
ok.forEach((r, i) => {
  const d = r.diagrams.map((g, k) => {
    const ini = r.init[k];
    return `[${k}] ${ini ? ini.vbAtInit : '—'} | ${ini ? `${ini.fontsLoaded}/${ini.fontsTotal}` : '—'} | ${g.vbFinal}`;
  }).join('   ');
  console.log(`#${String(i).padEnd(7)} ${String(r.height).padEnd(8)} ${d || '(sin diagramas)'}`);
});

const distinct = (f) => new Set(ok.map(f));
const heightVaries = distinct((r) => r.height).size > 1;
const nDiag = Math.max(...ok.map((r) => r.diagrams.length));
const diagVaries = [];
for (let k = 0; k < nDiag; k++) {
  const vbInit = distinct((r) => r.init[k]?.vbAtInit);
  const vbEnd = distinct((r) => r.diagrams[k]?.vbFinal);
  const fonts = distinct((r) => r.init[k]?.fontsLoaded);
  if (vbInit.size > 1 || vbEnd.size > 1) diagVaries.push({ k, vbInit: [...vbInit], vbEnd: [...vbEnd], fonts: [...fonts] });
}

console.log(`\nAltura del documento: ${heightVaries ? 'VARÍA entre cargas → ' + [...distinct((r) => r.height)].join(', ') : 'estable (' + ok[0].height + ')'}`);
if (diagVaries.length) {
  console.log('\nDiagramas que NO son deterministas:');
  for (const d of diagVaries) {
    console.log(`  [${d.k}] viewBox al medir: ${d.vbInit.join('  /  ')}`);
    console.log(`       viewBox final:  ${d.vbEnd.join('  /  ')}`);
    console.log(`       fuentes cargadas al medir: ${d.fonts.join(', ')}`);
  }
} else {
  console.log('Diagramas: viewBox idéntico en todas las cargas.');
}

// Primeros elementos cuya caja difiere de la corrida 0 (unión sobre todas las demás corridas)
const base = new Map(ok[0].boxes.map((b) => [b[0], b]));
const differing = new Map();
for (const r of ok.slice(1)) {
  for (const b of r.boxes) {
    const a = base.get(b[0]);
    if (!a) { differing.set(b[0], { label: b[1], note: 'no existe en corrida 0' }); continue; }
    const dd = [b[2] - a[2], b[3] - a[3], b[4] - a[4], b[5] - a[5]].map((n) => Math.round(n * 100) / 100);
    if (dd.some((n) => Math.abs(n) >= 0.5) && !differing.has(b[0])) {
      differing.set(b[0], { label: b[1], note: `Δx ${dd[0]}  Δy ${dd[1]}  Δw ${dd[2]}  Δh ${dd[3]}` });
    }
  }
}
console.log(`\nElementos cuya caja cambia ≥0.5px entre cargas: ${differing.size}`);
let shown = 0;
for (const [key, v] of differing) {
  if (shown++ >= 12) break;
  console.log(`  ${v.label.padEnd(48)} ${v.note}`);
}
if (differing.size > 12) console.log(`  … y ${differing.size - 12} más (en orden DOM; el primero suele ser la causa, el resto el arrastre)`);

// Recursos del propio sitio que respondieron 4xx (en todas las cargas)
const badAll = new Map();
for (const r of ok) for (const b of r.bad || []) badAll.set(b, (badAll.get(b) || 0) + 1);
console.log(`\nRespuestas 4xx del propio sitio: ${badAll.size ? badAll.size + ' URL distintas' : 'ninguna'}`);
[...badAll].slice(0, 15).forEach(([u, n]) => console.log(`  ${u}   (${n}/${ok.length} cargas)`));
if (badAll.size > 15) console.log(`  … y ${badAll.size - 15} más`);

const fe = new Set(ok.flatMap((r) => r.fontErrors || []));
console.log(`Fuentes en estado 'error': ${fe.size ? [...fe].slice(0, 8).join(', ') + (fe.size > 8 ? ` … (+${fe.size - 8})` : '') : 'ninguna'}`);

const sy = ok.map((r) => r.scroll.y);
console.log(`scrollY al medir: ${sy.join(', ')}   | scroll-behavior: ${[...distinct((r) => r.scroll.behavior)].join(', ')}`);
if (ok[0].sidebar) console.log(`#sidebar: ${JSON.stringify(ok[0].sidebar)}`);

console.log('\nDatos crudos: vr/shots/probe.json');
