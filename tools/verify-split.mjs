#!/usr/bin/env node
// Compara el CSS compilado de tools/custom.scss.orig (original) con el de
// assets/css/custom.scss (índice de parciales). Debe dar IGUAL.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const sass = (f) => execFileSync('npx', ['--yes', 'sass', '--no-source-map', '--quiet', f], { encoding: 'utf8' });
const norm = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.trim()).filter(Boolean);

const a = norm(sass('tools/custom.scss.orig'));
const b = norm(sass('assets/css/custom.scss'));
if (a.length === b.length && a.every((l, i) => l === b[i])) {
  console.log(`✔ CSS idéntico (${a.length} líneas). La partición no cambia nada.`);
  process.exit(0);
}
const i = a.findIndex((l, k) => l !== b[k]);
console.error(`✖ difieren desde la línea normalizada ${i}:\n  orig: ${a[i]}\n  nuevo: ${b[i]}`);
process.exit(1);
