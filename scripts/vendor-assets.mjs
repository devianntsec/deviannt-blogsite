#!/usr/bin/env node
/**
 * vendor-assets.mjs
 *
 * Copia los assets reales (Font Awesome, webfonts, tocbot, mermaid, dayjs,
 * glightbox, loading-attribute-polyfill, clipboard, mathjax) desde
 * node_modules hacia static/lib/, respetando EXACTAMENTE las rutas que pide
 * el theme Chirpy (Hugo) cuando `self_host = true`
 * (ver _vendor/.../data/origin/basic.yaml).
 *
 * Por qué existe este script: chirpy-static-assets usa submódulos de git
 * anidados por cada librería. Go Modules (motor de "hugo mod vendor") NO
 * descarga submódulos anidados, así que el vendor de Hugo siempre queda
 * incompleto. Este script reemplaza esa parte rota usando paquetes npm
 * reales, versión por versión.
 *
 * Uso:
 *   npm install
 *   node scripts/vendor-assets.mjs
 *   hugo build
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, ".."); // ajusta si mueves el script de carpeta
const NM = join(ROOT, "node_modules");
const OUT = join(ROOT, "static", "lib");

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(dirname(dest));
  copyFileSync(src, dest);
  console.log(`  ✓ ${dest.replace(ROOT + "/", "")}`);
}

function copyDir(srcDir, destDir) {
  ensureDir(destDir);
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const s = join(srcDir, entry.name);
    const d = join(destDir, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else copyFileSync(s, d);
  }
  console.log(`  ✓ ${destDir.replace(ROOT + "/", "")}/*`);
}

console.log("→ Font Awesome");
copyFile(join(NM, "@fortawesome/fontawesome-free/css/all.min.css"), join(OUT, "fontawesome-free/css/all.min.css"));
copyDir(join(NM, "@fortawesome/fontawesome-free/webfonts"), join(OUT, "fontawesome-free/webfonts"));

console.log("→ tocbot");
// Ojo: el paquete no publica "tocbot.min.css"; "tocbot.css" es el CSS real
// del componente (ya viene compacto) — "styles.css" es solo la demo, no sirve.
copyFile(join(NM, "tocbot/dist/tocbot.css"), join(OUT, "tocbot/tocbot.min.css"));
copyFile(join(NM, "tocbot/dist/tocbot.min.js"), join(OUT, "tocbot/tocbot.min.js"));

console.log("→ mermaid");
copyFile(join(NM, "mermaid/dist/mermaid.min.js"), join(OUT, "mermaid/mermaid.min.js"));

console.log("→ dayjs");
copyFile(join(NM, "dayjs/dayjs.min.js"), join(OUT, "dayjs/dayjs.min.js"));
copyFile(join(NM, "dayjs/locale/en.js"), join(OUT, "dayjs/locale/en.js"));
copyFile(join(NM, "dayjs/plugin/relativeTime.js"), join(OUT, "dayjs/plugin/relativeTime.js"));
copyFile(join(NM, "dayjs/plugin/localizedFormat.js"), join(OUT, "dayjs/plugin/localizedFormat.js"));
// Si usas otros idiomas en el sitio, agrega aquí más locales, p.ej.:
// copyFile(join(NM, "dayjs/locale/es.js"), join(OUT, "dayjs/locale/es.js"));

console.log("→ glightbox");
copyFile(join(NM, "glightbox/dist/css/glightbox.min.css"), join(OUT, "glightbox/glightbox.min.css"));
copyFile(join(NM, "glightbox/dist/js/glightbox.min.js"), join(OUT, "glightbox/glightbox.min.js"));

console.log("→ loading-attribute-polyfill");
// Nota: esta versión del paquete no publica un build .min por separado;
// copiamos el build normal con el nombre .min que espera el theme
// (funciona igual, solo pesa un poco más sin minificar).
copyFile(join(NM, "loading-attribute-polyfill/dist/loading-attribute-polyfill.css"), join(OUT, "loading-attribute-polyfill/loading-attribute-polyfill.min.css"));
copyFile(join(NM, "loading-attribute-polyfill/dist/loading-attribute-polyfill.umd.js"), join(OUT, "loading-attribute-polyfill/loading-attribute-polyfill.umd.min.js"));

console.log("→ clipboard");
copyFile(join(NM, "clipboard/dist/clipboard.min.js"), join(OUT, "clipboard/clipboard.min.js"));

console.log("→ mathjax");
copyFile(join(NM, "mathjax-full/es5/tex-chtml.js"), join(OUT, "mathjax/tex-chtml.js"));

console.log("→ webfonts (JetBrains Mono + Azeret Mono + Inter, self-hosted)");
// Reemplaza la carga en vivo desde fonts.googleapis.com que hacía
// layouts/partials/head.html — mismos pesos que pedía esa URL:
// JetBrains+Mono:wght@200;400;500;700 + Azeret+Mono:wght@300;400;500;600
// + Inter:wght@400;500;600
const fontsOut = join(OUT, "fonts");
 ensureDir(fontsOut);
 ensureDir(join(fontsOut, "files"));

const fontPieces = [
  { pkg: "@fontsource/jetbrains-mono", weights: ["200", "400", "500", "700"] },
  { pkg: "@fontsource/azeret-mono", weights: ["300", "400", "500", "600"] },
  { pkg: "@fontsource/inter", weights: ["400", "500", "600"] },
];

let combinedCss = "/* Generado por scripts/vendor-assets.mjs — JetBrains Mono + Azeret Mono + Inter self-hosted */\n\n";
for (const { pkg, weights } of fontPieces) {
  const pkgDir = join(NM, pkg);
  const filesSrc = join(pkgDir, "files");
  for (const w of weights) {
    const cssPath = join(pkgDir, `${w}.css`);
    if (!existsSync(cssPath)) continue;
    let css = readFileSync(cssPath, "utf8");
    // Nos quedamos solo con latin/latin-ext (evita descargar cirílico,
    // griego, vietnamita, etc. que este blog no usa).
    const blocks = css.split(/(?=\/\* )/g).filter(
      (b) => /latin(-ext)?-\d+-(normal|italic) \*\//.test(b)
    );
    combinedCss += blocks.join("\n") + "\n";
    for (const b of blocks) {
      const match = b.match(/jetbrains-mono-latin(?:-ext)?-\d+-\w+|azeret-mono-latin(?:-ext)?-\d+-\w+|inter-latin(?:-ext)?-\d+-\w+/);
      if (!match) continue;
      for (const ext of ["woff2", "woff"]) {
        const fname = `${match[0]}.${ext}`;
        const src = join(filesSrc, fname);
        if (existsSync(src)) copyFile(src, join(fontsOut, "files", fname));
      }
    }
  }
}
writeFileSync(join(fontsOut, "main.css"), combinedCss);
console.log(`  ✓ static/lib/fonts/main.css (+ files/)`);

console.log("\nListo. Corre 'hugo build' y verifica en DevTools → Network que /lib/... devuelva 200.");
