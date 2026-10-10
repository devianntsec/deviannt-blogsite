#!/usr/bin/env node
// Uso:  node scripts/nav-dump.mjs <directorio-construido>
// Imprime, para varias páginas EN y ES, los elementos del menú principal del sidebar:
//   página | activo | href | etiqueta
// Sirve para comparar el menú antes y después de un cambio:
//   hugo --gc --baseURL "https://blog.deviannt.com/" --destination /tmp/menu-before
//   node scripts/nav-dump.mjs /tmp/menu-before > /tmp/nav-before.txt
//   (cambios)
//   hugo --gc --baseURL "https://blog.deviannt.com/" --destination /tmp/menu-after
//   node scripts/nav-dump.mjs /tmp/menu-after > /tmp/nav-after.txt
//   diff /tmp/nav-before.txt /tmp/nav-after.txt
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error('Uso: node scripts/nav-dump.mjs <directorio-construido>');
  process.exit(2);
}

const PAGES = [
  'index.html', 'about/index.html', 'categories/index.html', 'tags/index.html', 'archives/index.html',
  'es/index.html', 'es/about/index.html', 'es/categories/index.html', 'es/tags/index.html', 'es/archives/index.html',
];

// <li class="nav-item[ active]"><a href="..." ...> ... <span>ETIQUETA</span> ... </a>
const ITEM = /<li class="nav-item([^"]*)">\s*<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;

let missing = 0;
for (const page of PAGES) {
  const file = path.join(dir, page);
  if (!fs.existsSync(file)) {
    console.log(`${page} | (no existe)`);
    missing++;
    continue;
  }
  const html = fs.readFileSync(file, 'utf8');
  const items = [];
  for (const m of html.matchAll(ITEM)) {
    const active = /\bactive\b/.test(m[1]) ? 'activo' : '-';
    const label = (m[3].match(/<span>([\s\S]*?)<\/span>/) || [, m[3].replace(/<[^>]+>/g, '')])[1].trim();
    items.push(`${page} | ${active} | ${m[2]} | ${label}`);
  }
  if (!items.length) console.log(`${page} | (sin elementos de menú)`);
  else for (const line of items) console.log(line);
}
process.exit(missing ? 1 : 0);
