#!/usr/bin/env node
// Trinquete de !important: falla si el nº de ocurrencias en el CSS PROPIO sube.
//   node scripts/count-important.mjs           → compara con scripts/important-baseline.json
//   node scripts/count-important.mjs --update  → baja el baseline (solo si bajó)
//   node scripts/count-important.mjs --init    → fija el baseline actual (primera vez)
// Cuenta ocurrencias (no líneas) fuera de comentarios, en assets/css/**.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIR = path.join(ROOT, 'assets/css');
const BASE = path.join(ROOT, 'scripts/important-baseline.json');

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(s?css)$/.test(e.name) && !e.name.endsWith('.orig') ? [p] : [];
  });
}
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const counts = {};
for (const f of walk(DIR)) {
  const n = (strip(fs.readFileSync(f, 'utf8')).match(/!important/g) || []).length;
  if (n) counts[path.relative(ROOT, f).split(path.sep).join('/')] = n;
}
const total = Object.values(counts).reduce((a, b) => a + b, 0);

if (process.argv.includes('--init')) {
  fs.writeFileSync(BASE, JSON.stringify({ total, files: counts }, null, 2) + '\n');
  console.log(`baseline fijado: ${total} !important`); process.exit(0);
}
const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));
console.log(`!important: ${total} (baseline ${base.total})`);
const worse = Object.entries(counts).filter(([f, n]) => n > (base.files[f] ?? 0));
if (process.argv.includes('--update')) {
  if (total > base.total) { console.error('No se puede subir el baseline.'); process.exit(1); }
  fs.writeFileSync(BASE, JSON.stringify({ total, files: counts }, null, 2) + '\n');
  console.log('baseline actualizado'); process.exit(0);
}
if (total > base.total) {
  console.error(`✖ subió en ${total - base.total}. Archivos que empeoraron:`);
  for (const [f, n] of worse) console.error(`   ${f}: ${base.files[f] ?? 0} → ${n}`);
  console.error('Quita !important (sube especificidad o baja la regla que combates) o justifícalo y discútelo antes de subir el baseline.');
  process.exit(1);
}
if (total < base.total) console.log(`✔ bajó ${base.total - total}: corre  node scripts/count-important.mjs --update  y commitea el baseline.`);
else console.log('✔ sin cambios');
