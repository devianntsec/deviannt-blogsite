// Uso:  node compare.mjs [--tolerance 0.0005] [--filter texto]
// Compara shots/current contra shots/baseline. Sale con código 1 si algo supera la tolerancia.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { SHOTS, arg } from './lib.mjs';

const tol = Number(arg('tolerance', 0.0005)); // fracción de píxeles distintos (0.05 %)
const filter = arg('filter');
const B = path.join(SHOTS, 'baseline'), C = path.join(SHOTS, 'current'), D = path.join(SHOTS, 'diff');
for (const d of [B, C]) if (!fs.existsSync(d)) { console.error(`Falta ${d}`); process.exit(2); }
fs.rmSync(D, { recursive: true, force: true });
fs.mkdirSync(D, { recursive: true });

const list = (d) => fs.readdirSync(d).filter((f) => f.endsWith('.png') && (!filter || f.includes(filter)));
const base = new Set(list(B)), cur = new Set(list(C));
const rows = [];

for (const f of [...base].sort()) {
  if (!cur.has(f)) { rows.push({ f, status: 'FALTA', note: 'no existe en current' }); continue; }
  const a = PNG.sync.read(fs.readFileSync(path.join(B, f)));
  const b = PNG.sync.read(fs.readFileSync(path.join(C, f)));
  if (a.width !== b.width || a.height !== b.height) {
    rows.push({ f, status: 'TAMAÑO', note: `${a.width}x${a.height} → ${b.width}x${b.height}` });
    continue;
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
  const ratio = n / (a.width * a.height);
  if (n > 0) fs.writeFileSync(path.join(D, f), PNG.sync.write(diff));
  rows.push({ f, status: ratio > tol ? 'DIFF' : 'ok', note: `${n} px (${(ratio * 100).toFixed(3)} %)` });
}
for (const f of cur) if (!base.has(f)) rows.push({ f, status: 'NUEVA', note: 'no existe en baseline' });

const bad = rows.filter((r) => r.status !== 'ok');
for (const r of rows) if (r.status !== 'ok' || process.argv.includes('--verbose')) console.log(`${r.status.padEnd(7)} ${r.f}  ${r.note}`);
console.log(`\n${rows.length - bad.length}/${rows.length} sin cambios (tolerancia ${(tol * 100).toFixed(3)} %)`);

// Informe HTML con baseline | current | diff lado a lado
if (bad.length) {
  const rel = (dir, f) => `${dir}/${encodeURIComponent(f)}`;
  const html = `<!doctype html><meta charset=utf-8><title>VR report</title>
<style>body{font:14px monospace;background:#111;color:#ddd;padding:1rem}.r{margin:2rem 0}
.i{display:flex;gap:8px;align-items:flex-start}.i figure{margin:0;flex:1;min-width:0}
img{width:100%;border:1px solid #444}h3{margin:.2rem 0}.DIFF,.TAMAÑO,.FALTA,.NUEVA{color:#f87171}</style>
<h1>${bad.length} cambios</h1>` + bad.map((r) => `<div class=r><h3><span class=${r.status}>${r.status}</span> ${r.f} — ${r.note}</h3>
<div class=i><figure><figcaption>baseline</figcaption><img src="${rel('baseline', r.f)}"></figure>
<figure><figcaption>current</figcaption><img src="${rel('current', r.f)}"></figure>
<figure><figcaption>diff</figcaption><img src="${rel('diff', r.f)}"></figure></div></div>`).join('');
  fs.writeFileSync(path.join(SHOTS, 'report.html'), html);
  console.log('Informe: vr/shots/report.html');
}
process.exit(bad.length ? 1 : 0);
