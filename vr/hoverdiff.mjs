// Uso:  node hoverdiff.mjs [--max 6]
// Compara shots/baseline/_hover contra shots/current/_hover: qué propiedad cambió, en qué estado y en qué elemento.
import fs from 'node:fs';
import path from 'node:path';
import { SHOTS, arg } from './lib.mjs';

const A = path.join(SHOTS, 'baseline', '_hover'), B = path.join(SHOTS, 'current', '_hover');
const MAX = Number(arg('max', 6));
const FULL = process.argv.includes('--full');
const TOL = Number(arg('tol', 0));
const cut = (v) => (FULL ? String(v) : String(v).slice(0, 60));
// Iguales si la estructura es la misma y cada número difiere menos que TOL (animaciones captadas a medias).
const same = (p, q) => {
  if (p === q) return true;
  if (!TOL) return false;
  const re = /-?\d*\.?\d+/g, sp = String(p).replace(re, '#'), sq = String(q).replace(re, '#');
  if (sp !== sq) return false;
  const np = String(p).match(re) || [], nq = String(q).match(re) || [];
  return np.every((n, i) => Math.abs(Number(n) - Number(nq[i])) <= TOL);
};
if (!fs.existsSync(A) || !fs.existsSync(B)) { console.error('Faltan shots/baseline/_hover o shots/current/_hover. Corre hover.mjs en ambos.'); process.exit(2); }

let files = 0, pagesDiff = 0, total = 0;
const bySel = new Map();                       // selector → nº de cambios, para ver qué reglas se ven afectadas
for (const f of fs.readdirSync(A).filter((x) => x.endsWith('.json')).sort()) {
  files++;
  if (!fs.existsSync(path.join(B, f))) { console.log(`${f}: falta en current`); pagesDiff++; continue; }
  const a = JSON.parse(fs.readFileSync(path.join(A, f))), b = JSON.parse(fs.readFileSync(path.join(B, f)));
  const lines = [];
  for (const el of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (!a[el] || !b[el]) { lines.push(`  ${el}  (existe solo en ${a[el] ? 'baseline' : 'current'})`); continue; }
    for (const st of ['rest', 'hover', 'focus']) {
      const x = a[el][st], y = b[el][st];
      if (!x && !y) continue;
      if (!x || !y) { lines.push(`  ${el} [${st}]  estado solo en ${x ? 'baseline' : 'current'}`); continue; }
      for (const p of Object.keys(x)) if (!same(x[p], y[p])) {
        lines.push(`  ${el} [${st}] ${p}: ${cut(x[p])} → ${cut(y[p])}`);
        bySel.set(el, (bySel.get(el) || 0) + 1);
      }
    }
  }
  if (lines.length) {
    pagesDiff++; total += lines.length;
    console.log(`${f}  (${lines.length} cambios)`);
    lines.slice(0, MAX).forEach((l) => console.log(l));
    if (lines.length > MAX) console.log(`  … ${lines.length - MAX} más`);
  }
}
console.log(`\n${files - pagesDiff}/${files} sondas idénticas (reposo, hover y focus). ${total} diferencias de propiedad.`);
if (bySel.size) {
  console.log('\nElementos más afectados:');
  [...bySel].sort((x, y) => y[1] - x[1]).slice(0, 15).forEach(([k, n]) => console.log(`  ${String(n).padStart(4)}  ${k}`));
}
