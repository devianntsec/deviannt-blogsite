import { chromium } from 'playwright';

const [A, B] = [process.argv[2], process.argv[3]];
const PAGES = ['/', '/es/', '/about/', '/archives/'];
const VPS = [
  { n: 'desktop', width: 1459, height: 1000 },
  { n: 'mobile', width: 390, height: 844 },
];
const ALL = !!process.env.ALL;
const PROPS = [
  'display', 'flex-direction', 'flex-wrap', 'flex-shrink', 'flex-grow',
  'justify-content', 'align-items', 'position', 'text-decoration-line',
  'border-top-left-radius',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
].concat(ALL ? [
  'color', 'background-color', 'font-size', 'font-weight', 'line-height',
  'border-top-width', 'border-top-color', 'width', 'height', 'top', 'left',
  'opacity', 'box-shadow', 'transform', 'z-index', 'gap', 'letter-spacing',
  'text-transform', 'visibility', 'overflow-x',
] : []);
const UTIL_SRC =
  '^(d-|flex-|justify-|align-|m[trblxy]?-|p[trblxy]?-|me-|ms-|w-|h-|position-|text-decoration|rounded)';

async function snap(browser, base, path, vp) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    locale: 'en-US',
    timezoneId: 'UTC',
  });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('dv-mode', 'dark');
      sessionStorage.setItem('mode', 'dark');
    } catch (e) {}
  });
  const page = await ctx.newPage();
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const data = await page.evaluate(({ PROPS, src, all }) => {
    const UTIL = new RegExp(src);
    const out = {};
    const walk = (el, p) => {
      Array.from(el.children).forEach((c, i) => {
        const key = p + '/' + c.tagName.toLowerCase() + i;
        const cls = typeof c.className === 'string'
          ? c.className.split(/\s+/).filter(Boolean) : [];
        if (all || cls.some((x) => UTIL.test(x))) {
          const cs = getComputedStyle(c);
          const o = {
            _h: Math.round(c.getBoundingClientRect().height),
            _id: c.tagName.toLowerCase() + (c.id ? '#' + c.id : '')
              + '.' + cls.slice(0, 4).join('.'),
          };
          PROPS.forEach((pr) => { o[pr] = cs.getPropertyValue(pr); });
          out[key] = o;
        }
        walk(c, key);
      });
    };
    walk(document.body, '');
    return out;
  }, { PROPS, src: UTIL_SRC, all: ALL });
  await ctx.close();
  return data;
}

const opts = process.env.CHROME_PATH
  ? { executablePath: process.env.CHROME_PATH } : {};
const browser = await chromium.launch(opts);

for (const vp of VPS) {
  for (const path of PAGES) {
    const a = await snap(browser, A, path, vp);
    const b = await snap(browser, B, path, vp);
    const groups = new Map();
    for (const k of Object.keys(a)) {
      if (!b[k]) continue;
      for (const pr of PROPS) {
        if (a[k][pr] === b[k][pr]) continue;
        const g = pr + ': ' + a[k][pr] + ' -> ' + b[k][pr];
        if (!groups.has(g)) groups.set(g, { n: 0, ex: [] });
        const e = groups.get(g);
        e.n++;
        if (e.ex.length < 2) e.ex.push(a[k]._id);
      }
    }
    console.log('\n=== ' + vp.n + ' ' + path + ' | elementos: '
      + Object.keys(a).length + ' | grupos de cambio: ' + groups.size);
    Array.from(groups).slice(0, 25).forEach(([g, e]) => {
      console.log('  ' + String(e.n).padStart(3) + 'x  ' + g);
      console.log('        ' + e.ex.join('  |  '));
    });
  }
}
await browser.close();
