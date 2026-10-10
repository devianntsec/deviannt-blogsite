// Uso: node mjx-scale.mjs [--filter cve-2024-30051] [--runs 6]
// Carga cada página bajo distintos niveles de CPU y muestra qué escala (font-size) puso MathJax
// a las fórmulas. Si el valor cambia con la carga, la escala se mide una sola vez con fuentes a medio cargar.
import { chromium } from 'playwright';
import { SITE, ORIGIN, serve, allPages, arg } from './lib.mjs';

const filter = arg('filter', 'cve-2024-30051');
const runs = Number(arg('runs', 6));
const RATES = [1, 4, 8];   // 1 = sin throttling; 8 = CPU 8 veces más lenta

const server = await serve(SITE);
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});

for (const url of allPages().filter((u) => u.includes(filter))) {
  console.log(`\n${url}`);
  for (const rate of RATES) {
    const hist = new Map();
    for (let i = 0; i < runs; i++) {
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US', timezoneId: 'UTC' });
      await ctx.route('**/*', (route) =>
        new URL(route.request().url()).origin === ORIGIN ? route.continue() : route.abort());
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      await page.goto(ORIGIN + url, { waitUntil: 'networkidle' });
      await page.evaluate(() => window.MathJax && MathJax.startup && MathJax.startup.promise);
      await page.waitForTimeout(800);
      const s = await page.evaluate(() => {
        const m = [...document.querySelectorAll('mjx-math')];
        return {
          n: m.length,
          estilos: [...new Set(m.slice(0, 10).map((e) => (e.getAttribute('style') || '').replace(/\s+/g, ' ')))],
          px: [...new Set(m.slice(0, 10).map((e) => getComputedStyle(e).fontSize))],
          matchFontHeight: window.MathJax && MathJax.config && MathJax.config.chtml
            ? MathJax.config.chtml.matchFontHeight : 'sin-config',
        };
      });
      const key = JSON.stringify(s);
      hist.set(key, (hist.get(key) || 0) + 1);
      await ctx.close();
    }
    console.log(`  CPU ×${rate}: ${hist.size} resultado(s) distinto(s) en ${runs} cargas`);
    for (const [k, v] of hist) console.log(`    ${v}×  ${k}`);
  }
}
await browser.close();
server.close();
