#!/usr/bin/env python3
"""patch-scroll.py: sustituye scrollToAnchor (JS) por scroll nativo + CSS.

Ejecutar desde la raiz del repo (deviannt-blogsite). Todo o nada: valida
todos los anclajes y solo entonces escribe. Si ya esta aplicado, aborta.

Cambios:
  1. assets/js/site-runtime.js: elimina scrollToAnchor y el listener de clic
     que interceptaba los enlaces con hash.
  2. assets/css/sections/_04-topbar.scss: agrega :target { scroll-margin-top }
     y scroll-behavior: smooth (solo si no hay prefers-reduced-motion).
"""
import sys
from pathlib import Path

JS = Path("assets/js/site-runtime.js")
SCSS = Path("assets/css/sections/_04-topbar.scss")

START = "  /* ------------------------------------------------------------\n     SOFT NAVIGATION\n"
END = "  window.addEventListener('load', function() {\n    initThemeToggle();"

NEW_JS = (
    "  /* ------------------------------------------------------------\n"
    "     ANCLAS (#hash): las resuelve el navegador (scroll, foco, :target).\n"
    "     El desplazamiento y el smooth scroll viven en _04-topbar.scss.\n"
    "  ------------------------------------------------------------ */\n\n"
)

CSS_MARK = "/* Anclas (#hash): scroll nativo."
NEW_CSS = """
/* Anclas (#hash): scroll nativo. Reemplaza a scrollToAnchor de site-runtime.js.
   3.5rem = topbar (3rem) + 0.5rem de aire, igual que el calculo anterior en movil.
   :target (0,1,0) gana a los scroll-margin de h2..h4 del tema (selectores de
   elemento, 0,0,1) sin necesitar !important. */
:target {
  scroll-margin-top: 3.5rem;
}
@media (prefers-reduced-motion: no-preference) {
  html {
    scroll-behavior: smooth;
  }
}
"""


def fail(msg):
    print("ABORTA: " + msg + ". No se escribio nada.", file=sys.stderr)
    sys.exit(1)


for f in (JS, SCSS):
    if not f.is_file():
        fail("no existe %s (ejecuta desde la raiz del repo)" % f)

js = JS.read_text(encoding="utf-8")
scss = SCSS.read_text(encoding="utf-8")

if "scrollToAnchor" not in js and CSS_MARK in scss:
    fail("el parche ya esta aplicado")
if "scrollToAnchor" not in js or CSS_MARK in scss:
    fail("estado inconsistente (solo una de las dos mitades aplicada)")
if js.count(START) != 1 or js.count(END) != 1:
    fail("anclajes de site-runtime.js no coinciden con lo esperado")

i, j = js.index(START), js.index(END)
if i > j:
    fail("orden de anclajes inesperado en site-runtime.js")
region = js[i:j]
if region.count("function scrollToAnchor") != 1 or region.count("document.addEventListener('click'") != 1:
    fail("el bloque a eliminar no es el esperado")
if region.count("addEventListener") != 1 or "initThemeToggle" in region:
    fail("el bloque a eliminar contiene codigo ajeno a las anclas")

new_js = js[:i] + NEW_JS + js[j:]
if "scrollToAnchor" in new_js:
    fail("quedaron referencias a scrollToAnchor")
new_scss = scss.rstrip("\n") + "\n" + NEW_CSS

JS.write_text(new_js, encoding="utf-8")
SCSS.write_text(new_scss, encoding="utf-8")
print("OK modificados: %s (-%d lineas), %s (+css)" % (JS, region.count("\n"), SCSS))
