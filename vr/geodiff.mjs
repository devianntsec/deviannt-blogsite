// Uso: node geodiff.mjs [--filter texto]
// Compara vr/shots/baseline/_geo con vr/shots/current/_geo: qué elemento cambió, y si cambiaron
// el viewBox de los diagramas, el estado de las fuentes o los .woff pedidos.
import fs from 'node:fs';
import path from 'node:path';
import { SHOTS, arg } from './lib.mjs';

const filter = arg('filter');
const A = path.join(SHOTS, 'baseline', '_geo'), B = path.join(SHOTS, 'current', '_geo');
const setDiff = (x, y) => [...new Set(x)].filter((v) => !y.includes(v));
let pagesWithDiff = 0;

for (const f of fs.readdirSync(A).filter((f) => !filter || f.includes(filter)).sort()) {
  if (!fs.existsSync(path.join(B, f))) continue;
  const a = JSON.parse(fs.readFileSync(path.join(A, f))), b = JSON.parse(fs.readFileSync(path.join(B, f)));
  const out = [];

  if (JSON.stringify(a.viewBoxes) !== JSON.stringify(b.viewBoxes))
    out.push(`  viewBox de diagramas: ${JSON.stringify(a.viewBoxes)} → ${JSON.stringify(b.viewBoxes)}`);
  const fa = setDiff(a.fonts, b.fonts), fb = setDiff(b.fonts, a.fonts);
  if (fa.length || fb.length) {
    out.push(`  fuentes con estado distinto (${fa.length}):`);
    fa.slice(0, 6).forEach((x) => out.push(`    base: ${x}`));
    fb.slice(0, 6).forEach((x) => out.push(`    curr: ${x}`));
  }
  const wa = setDiff(a.woffs, b.woffs), wb = setDiff(b.woffs, a.woffs);
  if (wa.length || wb.length) out.push(`  .woff pedidos solo en base: [${wa.join(', ')}]  solo en curr: [${wb.join(', ')}]`);

  if (a.els.length !== b.els.length) {
    out.push(`  nº de elementos distinto: ${a.els.length} → ${b.els.length}`);
  } else {
    const E = a.els, F = b.els;
    const ch = (i) => Math.abs(E[i][2] - F[i][2]) > 0.01 || Math.abs(E[i][3] - F[i][3]) > 0.01;
    const changed = E.map((_, i) => i).filter(ch);
    // hoja = cambió y ningún descendiente (los siguientes con mayor profundidad) cambió
    const leaves = changed.filter((i) => {
      for (let j = i + 1; j < E.length && E[j][4] > E[i][4]; j++) if (ch(j)) return false;
      return true;
    });
    out.push(`  ${changed.length} elementos cambian de tamaño; ${leaves.length} hojas (causas):`);
    for (const i of leaves.slice(0, 8)) {
      const anc = []; let d = E[i][4];
      for (let j = i - 1; j >= 0 && anc.length < 3; j--) if (E[j][4] < d) { anc.push(E[j][0]); d = E[j][4]; }
      out.push(`    #${i} ${E[i][0]}  alto ${E[i][2]} → ${F[i][2]}  ancho ${E[i][3]} → ${F[i][3]}  y=${E[i][1]}  ⊂ ${anc.join(' ⊂ ')}`);
    }
    if (!changed.length) continue;
  }
  if (!out.length) continue;
  pagesWithDiff++;
  console.log(`\n${f}`); out.forEach((l) => console.log(l));
}
console.log(pagesWithDiff ? `\n${pagesWithDiff} páginas con diferencias` : '\nTodo idéntico: geometría, fuentes y viewBox');
