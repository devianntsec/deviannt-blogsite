#!/usr/bin/env bash
# Uso:  bash vr/important-experiment.sh        (desde cualquier directorio)
# Para cada archivo CSS: quita TODOS sus !important, reconstruye, captura y compara contra vr/shots/baseline,
# y restaura el archivo. No modifica nada de forma permanente. No edites esos archivos mientras corre.
# Requiere un baseline del estado actual:  cd vr && node capture.mjs baseline
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
FILES=(assets/css/custom.scss assets/css/overrides.css assets/css/syntax.css)
TMP="$(mktemp -d)"

restore() { for f in "${FILES[@]}"; do [ -f "$TMP/$(basename "$f")" ] && cp "$TMP/$(basename "$f")" "$f"; done; }
trap restore EXIT INT TERM
for f in "${FILES[@]}"; do cp "$f" "$TMP/$(basename "$f")"; done

[ -d vr/shots/baseline ] || { echo 'Falta vr/shots/baseline. Corre antes:  cd vr && node capture.mjs baseline'; exit 1; }

echo '--- orden real de las hojas en vr/site/index.html (de la última construcción)'
if [ -f vr/site/index.html ]; then
  grep -o '<link rel="stylesheet"[^>]*>' vr/site/index.html | sed -E 's/.*href="([^"]*)".*/  \1/' | cut -c1-110
fi
echo

for f in "${FILES[@]}"; do
  name="$(basename "$f")"
  n=$(grep -c '!important' "$f")
  sed -i 's/[[:space:]]*!important//g' "$f"
  echo "=== $f : se quitan $n líneas con !important"
  ( cd vr \
    && npm run build >/dev/null 2>&1 \
    && node capture.mjs current --concurrency 3 >/dev/null 2>&1 \
    && { node compare.mjs > "shots/exp-$name.txt" 2>&1; node geodiff.mjs > "shots/exp-$name-geo.txt" 2>&1; } )
  if [ -f "vr/shots/exp-$name.txt" ]; then
    echo "  tiles distintos: $(grep -c '^DIFF\|^TAMAÑO' "vr/shots/exp-$name.txt")   |   $(grep 'sin cambios' "vr/shots/exp-$name.txt" | tail -1)"
    echo "  geometría: $(tail -1 "vr/shots/exp-$name-geo.txt")"
    [ -f vr/shots/report.html ] && cp vr/shots/report.html "vr/shots/report-$name.html"
  else
    echo "  (la construcción o la captura falló; revisa con: cd vr && npm run build)"
  fi
  cp "$TMP/$name" "$f"
  rm -f vr/shots/report.html
done
echo; echo 'Detalle: vr/shots/exp-<archivo>.txt, exp-<archivo>-geo.txt y report-<archivo>.html'
echo 'Archivos restaurados. Comprueba con:  git status --short'
