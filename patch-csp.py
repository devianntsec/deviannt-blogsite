#!/usr/bin/env python3
"""Punto 2 (CSP): elimina scripts inline, onclick y style= de layouts propios.
Ejecutar desde la raíz del repo. Todo o nada: si algo no coincide, no escribe nada."""
import pathlib, re, sys

def die(m): sys.exit("ABORTADO (no se escribió nada): " + m)
def read(p):
    f = pathlib.Path(p)
    if not f.exists(): die("no existe " + p)
    t = f.read_bytes().decode("utf-8")
    return t.replace("\r\n", "\n"), ("\r\n" if "\r\n" in t else "\n")

out, new = {}, {}

# 1) site-runtime.js
rp = "assets/js/site-runtime.js"; r, rnl = read(rp)
old = "  if (window.__dv404) {"
if r.count(old) != 1: die("site-runtime.js: flag __dv404 no encontrado")
r = r.replace(old, "  if (document.querySelector('meta[name=\"dv-404\"]')) {")
anchor = "    try { document.cookie = 'blog_lang=' + a.getAttribute('data-set-lang') + ';path=/;max-age=31536000;SameSite=Lax'; } catch(err) {}\n  }, true);\n"
if r.count(anchor) != 1: die("site-runtime.js: listener de blog_lang no encontrado")
email_js = """
  /* Botón de email del sidebar: copia al portapapeles (antes un onclick inline, bloqueado por la CSP). */
  document.addEventListener('click', function(e) {
    var btn = e.target.closest && e.target.closest('button[data-email]');
    if (!btn) return;
    var email = btn.getAttribute('data-email');
    var lang = document.documentElement.getAttribute('lang') || 'en';
    var msg = lang === 'es'
      ? '¡' + email + ' copiado al portapapeles!'
      : email + ' copied to clipboard!';
    navigator.clipboard.writeText(email).then(function() {
      var t = document.getElementById('dv-copy-toast');
      if (!t) {
        t = document.createElement('div');
        t.id = 'dv-copy-toast';
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.classList.add('visible');
      setTimeout(function() { t.classList.remove('visible'); }, 2500);
    }).catch(function() {});
  });
"""
r = r.replace(anchor, anchor + email_js)
if "data-dv-diagram" in r: die("site-runtime.js: ya tiene el init de diagramas")
if not r.rstrip("\n").endswith("})();"): die("site-runtime.js: final inesperado")
r = r.rstrip("\n") + """

/* Diagramas: el shortcode solo marca el contenedor (data-dv-diagram / data-dv-height) y esto lo inicializa
   (antes: <script> y style inline en cada shortcode, bloqueados por la CSP). */
(function() {
  function initDiagrams() {
    if (!window.__dvDiagramInit) return;
    document.querySelectorAll('.dv-diagram-wrap[data-dv-diagram]').forEach(function(w) {
      if (w.getAttribute('data-dv-ready')) return;
      w.setAttribute('data-dv-ready', '1');
      var h = (parseInt(w.getAttribute('data-dv-height'), 10) || 240) + 'px';
      var c = w.querySelector('.dv-diagram-canvas');
      var s = w.querySelector('.dv-diagram-svg');
      if (c) c.style.minHeight = h;
      if (s) { s.style.minHeight = h; s.style.display = 'block'; }
      window.__dvDiagramInit(w.id);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDiagrams);
  else initDiagrams();
})();
"""
out[rp] = (r, rnl)

# 2) sidebar.html
sp = "layouts/partials/sidebar.html"; s, snl = read(sp)
rx = re.compile(r"\n[ \t]+onclick=\"\(function\(btn\)\{.*?\}\)\(this\)\"", re.S)
if len(rx.findall(s)) != 1: die("sidebar.html: onclick del email no encontrado")
s = rx.sub("", s)
if "onclick=" in s: die("sidebar.html: quedan onclick")
out[sp] = (s, snl)

# 3) access.html + CSS
ap = "layouts/partials/access.html"; a, anl = read(ap)
old = 'class="content list-unstyled ps-0 pb-1 ms-1 mt-2" style="font-size: 0.8em;"'
if a.count(old) != 1: die("access.html: lista de trending no encontrada")
out[ap] = (a.replace(old, 'class="content list-unstyled ps-0 pb-1 ms-1 mt-2 dv-trending-list"'), anl)
cp = "assets/css/sections/_13-right-panel-toc.scss"; c13, cnl = read(cp)
out[cp] = (c13.rstrip("\n") + """

/* Lista de "Trending Posts" (antes style="font-size: 0.8em" inline, bloqueado por la CSP) */
#panel-wrapper ul.content.dv-trending-list,
ul.content.dv-trending-list {
  font-size: 0.8em;
}
""", cnl)

# 4) shortcode diagram.html
dp = "layouts/shortcodes/diagram.html"; d, dnl = read(dp)
for o, n in [
    ('{{- $hpx     := printf "min-height:%spx" $height | safeCSS -}}\n', ''),
    ('{{- $hpxsvg  := printf "min-height:%spx;display:block" $height | safeCSS -}}\n', ''),
    ('<div class="dv-diagram-wrap" id="{{ $id }}">', '<div class="dv-diagram-wrap" id="{{ $id }}" data-dv-diagram="1" data-dv-height="{{ $height }}">'),
    ('<div class="dv-diagram-canvas" style="{{ $hpx }}">', '<div class="dv-diagram-canvas">'),
    ('             style="{{ $hpxsvg }}"\n', ''),
    ("\n<script>window.__dvDiagramInit && window.__dvDiagramInit('{{ $id }}');</script>", ''),
]:
    if d.count(o) != 1: die("diagram.html: no coincide: " + o[:50])
    d = d.replace(o, n)
if "style=" in d or "<script" in d: die("diagram.html: quedan style/script")
out[dp] = (d, dnl)

# 5) CSS diagramas
gp = "assets/css/sections/_26-diagram-shortcode-color-mix-en-nodos.scss"; g, gnl = read(gp)
out[gp] = (g.rstrip("\n") + """

/* Altura mínima por defecto (240px, la de antes del style inline). Si el shortcode pide otra
   (height="..."), site-runtime.js la ajusta con data-dv-height. */
.dv-diagram-canvas { min-height: 240px; }
.dv-diagram-svg { min-height: 240px; }
""", gnl)

# 6) metadata-hook.html
mp = "layouts/partials/metadata-hook.html"; m, mnl = read(mp)
old = '<script>window.__dv404 = true;</script>'
if m.count(old) != 1: die("metadata-hook.html: flag 404 no encontrado")
out[mp] = (m.replace(old, '<meta name="dv-404" content="1">'), mnl)

# 7) 404.html -> css/js externos
fp = "layouts/404.html"; f, fnl = read(fp)
sm = re.search(r"  <style>\n(.*?)\n  </style>\n", f, re.S)
jm = re.search(r"  <script>\n(.*?)\n  </script>\n", f, re.S)
if not sm or not jm: die("404.html: no encuentro <style> o <script>")
if "{{" in sm.group(1) or "{{" in jm.group(1): die("404.html: contiene Hugo; no se puede mover tal cual")
new["assets/css/404.css"] = sm.group(1) + "\n"
new["assets/js/404.js"] = jm.group(1) + "\n"
f = f.replace(sm.group(0), '  {{- $css404 := resources.Get "css/404.css" | minify | fingerprint -}}\n  <link rel="stylesheet" href="{{ $css404.RelPermalink }}">\n')
f = f.replace(jm.group(0), '  {{- $js404 := resources.Get "js/404.js" | minify | fingerprint -}}\n  <script src="{{ $js404.RelPermalink }}"></script>\n')
out[fp] = (f, fnl)

# 8) buscador: override en layouts/partials (no se toca el tema) + JS externo
tp = "themes/hugo-theme-chirpy/layouts/partials/search-results.html"; t, _ = read(tp)
tm = re.search(r"<script>\n(.*?)\n</script>", t, re.S)
if not tm: die("search-results.html del tema: no encuentro el <script>")
js = tm.group(1)
old_msg = """'<p class="mt-5">{{ i18n "search.no_results" }}</p>'"""
if js.count(old_msg) != 1: die("search: línea de 'sin resultados' no coincide")
js = js.replace(old_msg, """'<p class="mt-5">' + this.escapeHtml(this.noResultsText || 'No results found.') + '</p>'""")
inst = re.search(r"  const search = new FastSearch\(\{.*?\n  \}\);", js, re.S)
if not inst or "{{" not in inst.group(0): die("search: instanciación no coincide")
js = js.replace(inst.group(0), """  const searchResultsEl = document.getElementById('search-results');
  const search = new FastSearch({
    searchInput: document.getElementById('search-input'),
    resultsContainer: searchResultsEl,
    json: searchResultsEl.dataset.json,
    noResultsText: searchResultsEl.dataset.noResults
  });""")
if "{{" in js: die("search: quedan expresiones Hugo en el JS")
new["assets/js/search.js"] = "/* Buscador. Antes: <script> inline en el partial del tema (bloqueado por la CSP).\n   La URL del índice y el texto 'sin resultados' llegan por data-* de #search-results. */\n" + js.rstrip("\n") + "\n"
markup = t[:tm.start()].rstrip("\n")
oldd = '<div id="search-results" class="d-flex flex-wrap justify-content-center text-muted mt-3"></div>'
if oldd not in markup: die("search: marcado no esperado")
markup = markup.replace(oldd, '<div id="search-results" class="d-flex flex-wrap justify-content-center text-muted mt-3"\n         data-json="{{ path.Join .Site.Home.RelPermalink "index.json" }}"\n         data-no-results="{{ i18n "search.no_results" }}"></div>')
new["layouts/partials/search-results.html"] = markup + '\n\n{{- $search := resources.Get "js/search.js" | minify | fingerprint -}}\n<script src="{{ $search.RelPermalink }}" defer></script>\n'

for p in new:
    if pathlib.Path(p).exists(): die("ya existe " + p)
for p, (txt, nl) in out.items():
    pathlib.Path(p).write_bytes(txt.replace("\n", nl).encode("utf-8"))
for p, txt in new.items():
    q = pathlib.Path(p); q.parent.mkdir(parents=True, exist_ok=True); q.write_bytes(txt.encode("utf-8"))
print("OK modificados:", ", ".join(out)); print("OK nuevos:", ", ".join(new))
