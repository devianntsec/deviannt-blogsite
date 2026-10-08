import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SITE = path.join(HERE, 'site');
export const SHOTS = path.join(HERE, 'shots');
export const PORT = 4000; // debe coincidir con --baseURL del script "build"
export const ORIGIN = `http://localhost:${PORT}`;

export const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, isMobile: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true },
];
export const MODES = ['dark', 'light'];
export const TILE = 6000; // alto máximo por captura (evita el límite de textura de Chromium)

// Páginas fijas. Los posts se descubren solos (ver discoverPosts).
export const FIXED_PAGES = [
  '/', '/es/', '/about/', '/archives/', '/categories/',
  '/categories/security/', '/tags/', '/404.html',
];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.xml': 'application/xml', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.txt': 'text/plain', '.webmanifest': 'application/manifest+json',
};

export function serve(root, port = PORT) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      const pathname = decodeURIComponent(new URL(req.url, ORIGIN).pathname);
      let file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(path.resolve(root))) { res.writeHead(403); return res.end(); }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) {
        const nf = path.join(root, '404.html');
        res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : 'Not found');
      }
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.on('error', reject);
    srv.listen(port, () => resolve(srv));
  });
}

// Un post es toda página cuyo HTML incluye el JSON-LD "TechArticle" de layouts/post/single.html.
// Así el kit no depende de los slugs (que vamos a cambiar más adelante).
export function discoverPosts(siteDir = SITE) {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === 'index.html' && fs.readFileSync(p, 'utf8').includes('"TechArticle"')) {
        const rel = path.relative(siteDir, path.dirname(p)).split(path.sep).join('/');
        if (rel) out.push(`/${rel}/`);
      }
    }
  })(siteDir);
  return out.sort();
}

export function allPages(siteDir = SITE) {
  const fixed = FIXED_PAGES.filter((u) => {
    const f = u.endsWith('/') ? path.join(siteDir, u, 'index.html') : path.join(siteDir, u);
    const ok = fs.existsSync(f);
    if (!ok) console.warn(`  (omito ${u}: no existe en el build)`);
    return ok;
  });
  return [...fixed, ...discoverPosts(siteDir)];
}

export function shotName(url, vp, mode, tile) {
  const slug = url.replace(/^\/|\/$/g, '').replace(/[^a-z0-9]+/gi, '-').slice(0, 50) || 'home';
  const h = crypto.createHash('md5').update(url).digest('hex').slice(0, 6);
  return `${slug}.${h}__${vp}__${mode}__${String(tile).padStart(2, '0')}.png`;
}

// PNG gris 1200x630 para sustituir las portadas externas (R2): determinista y sin red.
export function placeholderPng(w = 1200, h = 630) {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h * 4; i += 4) { png.data[i] = 51; png.data[i + 1] = 65; png.data[i + 2] = 85; png.data[i + 3] = 255; }
  return PNG.sync.write(png);
}

export function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}
