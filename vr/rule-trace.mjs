// Uso: node rule-trace.mjs <baseA> <baseB>   (env: PAGES=/,/about/  VP=desktop|mobile  MODE=dark|light  MAX=40)
// Compara A vs B (estilos computados de todos los elementos) y, para cada cambio,
// muestra qué reglas CSS declaran esa propiedad en B (archivo, selector, !important, capa).
import { chromium } from 'playwright';

const [A, B] = [process.argv[2], process.argv[3]];
const PAGES = (process.env.PAGES || '/,/es/,/about/').split(',');
const VP = process.env.VP === 'mobile'
  ? { width: 390, height: 844 } : { width: 1459, height: 1000 };
const MODE = process.env.MODE || 'dark';
const MAX = Number(process.env.MAX || 40);
const PROPS = [
  'display', 'flex-direction', 'justify-content', 'align-items', 'position',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'color', 'background-color', 'font-size', 'font-weight', 'line-height',
  'border-top-width', 'border-top-color', 'border-top-left-radius',
  'width', 'height', 'top', 'left', 'opacity', 'box-shadow', 'transform',
  'z-index', 'gap', 'letter-spacing', 'text-transform', 'visibility',
  'text-decoration-line', 'overflow-x', 'text-shadow', 'background-image',
  'border-left-width', 'border-left-color', 'border-right-width', 'border-bottom-width',
  'border-bottom-color', 'border-bottom-left-radius', 'outline-width', 'cursor',
  'white-space', 'text-align', 'font-family', 'fill', 'stroke',
];

function declares(name, prop) {
  return name === prop || prop.startsWith(name + '-')
    || (name === 'font' && /^(font|line-height)/.test(prop))
    || (name === 'background' && prop.startsWith('background'));
}

async function open(browser, base, path) {
  const ctx = await browser.newContext({ viewport: VP, locale: 'en-US', timezoneId: 'UTC' });
  await ctx.addInitScript((m) => {
    try { localStorage.setItem('dv-mode', m); sessionStorage.setItem('mode', m); } catch (e) {}
  }, MODE);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const sheets = new Map();
  cdp.on('CSS.styleSheetAdded', (e) => sheets.set(e.header.styleSheetId, e.header.sourceURL || '(inline)'));
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  return { ctx, page, cdp, sheets };
}

async function snapshot(page) {
  return page.evaluate((PROPS) => {
    const out = {};
    const walk = (el, p) => {
      Array.from(el.children).forEach((c, i) => {
        const key = p + '/' + c.tagName.toLowerCase() + ':' + i;
        const cls = typeof c.className === 'string'
          ? c.className.split(/\s+/).filter(Boolean) : [];
        const cs = getComputedStyle(c);
        const o = { _id: c.tagName.toLowerCase() + (c.id ? '#' + c.id : '') + '.' + cls.slice(0, 3).join('.') };
        PROPS.forEach((pr) => { o[pr] = cs.getPropertyValue(pr); });
        out[key] = o;
        walk(c, key);
      });
    };
    walk(document.body, '');
    return out;
  }, PROPS);
}

function selectorFor(key) {
  return 'body' + key.split('/').filter(Boolean)
    .map((s) => ' > :nth-child(' + (Number(s.split(':')[1]) + 1) + ')').join('');
}

const short = (u) => u.replace(/^.*\//, '').replace(/\.[0-9a-f]{20,}/, '').slice(0, 40);

const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
for (const path of PAGES) {
  const sa = await open(browser, A, path);
  const a = await snapshot(sa.page);
  await sa.ctx.close();
  const sb = await open(browser, B, path);
  const b = await snapshot(sb.page);

  const groups = new Map();
  for (const k of Object.keys(a)) {
    if (!b[k]) continue;
    for (const pr of PROPS) {
      if (a[k][pr] === b[k][pr]) continue;
      const g = pr + ': ' + a[k][pr] + ' -> ' + b[k][pr];
      if (!groups.has(g)) groups.set(g, { n: 0, key: k, pr, id: a[k]._id });
      groups.get(g).n++;
    }
  }
  console.log('\n######## ' + path + ' (' + VP.width + 'px, ' + MODE + ') grupos: ' + groups.size);

  const { root } = await sb.cdp.send('DOM.getDocument', { depth: -1 });
  let shown = 0;
  for (const [g, info] of groups) {
    if (shown++ >= MAX) { console.log('... (+' + (groups.size - MAX) + ' grupos más; sube MAX)'); break; }
    console.log('\n' + String(info.n).padStart(3) + 'x ' + g + '\n     elemento: ' + info.id);
    try {
      const q = await sb.cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: selectorFor(info.key) });
      if (!q.nodeId) { console.log('     (no se pudo localizar el nodo)'); continue; }
      const m = await sb.cdp.send('CSS.getMatchedStylesForNode', { nodeId: q.nodeId });
      const hits = [];
      for (const r of m.matchedCSSRules || []) {
        const props = (r.rule.style.cssProperties || []).filter((p) => !p.implicit && declares(p.name, info.pr));
        for (const p of props) {
          const layer = (r.rule.layers || []).map((l) => l.text).join('/') || '(sin capa)';
          hits.push('     ' + short(sb.sheets.get(r.rule.styleSheetId) || '?') + ' | '
            + r.rule.selectorList.text.slice(0, 90) + ' { ' + p.name + ': ' + p.value
            + (p.important ? ' !important' : '') + ' } [' + layer + ']');
        }
      }
      if (!hits.length) console.log('     (ninguna regla la declara: heredada del padre o derivada, p. ej. de color/tamaño)');
      Array.from(new Set(hits)).slice(-4).forEach((h) => console.log(h));
    } catch (e) { console.log('     error CDP: ' + e.message.slice(0, 80)); }
  }
  await sb.ctx.close();
}
await browser.close();
