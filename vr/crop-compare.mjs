// Uso: node crop-compare.mjs [--delta 49] [--tolerance 0.0005]
// Para las capturas con TAMAÑO distinto: si current es exactamente <delta> px más baja que baseline
// (mismo ancho), recorta el baseline desde arriba al alto de current y compara píxeles.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { SHOTS, arg } from './lib.mjs';

const delta = Number(arg('delta', 49));
const tol = Number(arg('tolerance', 0.0005));
const B = path.join(SHOTS, 'baseline'), C = path.join(SHOTS, 'current');
let same = 0, bad = 0, skipped = 0;
for (const f of fs.readdirSync(B).filter((x) => x.endsWith('.png')).sort()) {
  if (!fs.existsSync(path.join(C, f))) continue;
  const a = PNG.sync.read(fs.readFileSync(path.join(B, f)));
  const b = PNG.sync.read(fs.readFileSync(path.join(C, f)));
  if (a.width === b.width && a.height === b.height) continue;          // ya lo cubre compare.mjs
  if (a.width !== b.width || a.height - b.height !== delta) {
    console.log(`OTRO     ${f}  ${a.width}x${a.height} -> ${b.width}x${b.height} (no es -${delta}px)`); skipped++; continue;
  }
  const crop = new PNG({ width: b.width, height: b.height });
  PNG.bitblt(a, crop, 0, 0, b.width, b.height, 0, 0);
  const n = pixelmatch(crop.data, b.data, null, b.width, b.height, { threshold: 0.1 });
  const ratio = n / (b.width * b.height);
  if (ratio > tol) { console.log(`DIFF     ${f}  ${n} px (${(ratio * 100).toFixed(3)} %)`); bad++; } else same++;
}
console.log(`\nrecortadas iguales: ${same} | distintas: ${bad} | no comparables: ${skipped}`);
process.exit(bad || skipped ? 1 : 0);
