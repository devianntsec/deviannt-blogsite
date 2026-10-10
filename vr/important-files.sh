#!/usr/bin/env bash
# vr/important-files.sh — barrido de !important por ARCHIVO (adaptado a los parciales de assets/css/sections/).
#
# Para cada archivo listado en scripts/important-baseline.json (de menos a más !important):
#   1. quita TODOS sus !important
#   2. reconstruye (npm run build) y captura (capture.mjs + hover.mjs)
#   3. compara contra vr/shots/baseline: píxeles (compare), geometría (geodiff) y hover/focus (hoverdiff)
#   4. si NO hay ninguna diferencia  -> "SEGURO"
#      si hay diferencias            -> "CAMBIA" (hay que mirar ese archivo a mano)
#
# Modos:
#   bash vr/important-files.sh            solo mide; restaura cada archivo al terminar (no cambia nada)
#   APPLY=1 bash vr/important-files.sh    deja quitados los de veredicto SEGURO y revierte el resto
#
# Variables opcionales:
#   ONLY="_13 _28"     solo los archivos cuyo nombre contenga alguno de esos textos
#   SKIP="_30 syntax"  añade exclusiones (por defecto ya se salta _30: prefers-reduced-motion usa !important a propósito)
#   HOVER=0            no ejecuta la sonda de hover/focus (más rápido, menos seguro)
#
# Requisitos (una sola vez):   cd vr && npm i && npx playwright install chromium
#                              cd vr && npm run baseline && node hover.mjs baseline
# Usa sed -i de GNU (Linux / WSL), igual que los scripts anteriores.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

APPLY="${APPLY:-0}"; HOVER="${HOVER:-1}"
SKIP_DEFAULT="_30-prefers-reduced-motion"
SKIP="${SKIP:-} $SKIP_DEFAULT"
ONLY="${ONLY:-}"
SUMMARY="vr/shots/important-files-summary.txt"

[ -d vr/shots/baseline ] || { echo "Falta vr/shots/baseline. Corre:  cd vr && npm run baseline"; exit 1; }
if [ "$HOVER" = 1 ] && [ ! -d vr/shots/baseline/_hover ]; then
  echo "Falta la sonda de hover base. Corre:  cd vr && node hover.mjs baseline   (o usa HOVER=0)"; exit 1
fi
if [ "$APPLY" = 1 ] && ! git diff --quiet -- assets/css; then
  echo "APPLY=1 exige assets/css limpio (git status). Haz commit o stash antes: así puedes revertir con git."; exit 1
fi

# Archivos con !important, ordenados de menos a más (los pequeños dan resultados rápidos).
mapfile -t FILES < <(node -e '
  const b = JSON.parse(require("fs").readFileSync("scripts/important-baseline.json", "utf8"));
  Object.entries(b.files).sort((a, b) => a[1] - b[1]).forEach(([f]) => console.log(f));
')

BAK="$(mktemp)"; CUR=""
restore() { [ -n "$CUR" ] && [ -s "$BAK" ] && cp "$BAK" "$CUR"; }
trap restore EXIT INT TERM

mkdir -p vr/shots; : > "$SUMMARY"
echo "Archivos a probar: ${#FILES[@]}  (APPLY=$APPLY, HOVER=$HOVER)"; echo

kept=0; reverted=0
for f in "${FILES[@]}"; do
  [ -f "$f" ] || continue
  skip=0
  for s in $SKIP; do [[ "$f" == *"$s"* ]] && skip=1; done
  [ "$skip" = 1 ] && { echo "· salto $f"; continue; }
  if [ -n "$ONLY" ]; then
    hit=0; for o in $ONLY; do [[ "$f" == *"$o"* ]] && hit=1; done
    [ "$hit" = 0 ] && continue
  fi

  name="$(basename "$f")"; CUR="$f"; cp "$f" "$BAK"
  n=$(grep -o '!important' "$f" | wc -l)
  sed -i 's/[[:space:]]*!important//g' "$f"

  px="vr/shots/imp-$name.txt"; geo="vr/shots/imp-$name-geo.txt"; hov="vr/shots/imp-$name-hover.txt"
  verdict="CAMBIA"; why=""
  if ( cd vr && npm run build >/dev/null 2>&1 ) && ( cd vr && node capture.mjs current --concurrency 3 >/dev/null 2>&1 ); then
    rm -f vr/shots/report.html
    ( cd vr && node compare.mjs > "../$px" 2>&1 ); cmp_rc=$?
    [ -f vr/shots/report.html ] && mv vr/shots/report.html "vr/shots/imp-$name-report.html"
    ( cd vr && node geodiff.mjs > "../$geo" 2>&1 )
    ok=1
    [ "$cmp_rc" -ne 0 ] && { ok=0; why="píxeles: $(grep -c '^DIFF\|^TAMA\|^FALTA\|^NUEVA' "$px") tiles"; }
    grep -q 'Todo idéntico' "$geo" || { ok=0; why="$why geometría: $(tail -1 "$geo" | cut -c1-40)"; }
    if [ "$HOVER" = 1 ]; then
      ( cd vr && node hover.mjs current --concurrency 3 >/dev/null 2>&1 && node hoverdiff.mjs > "../$hov" 2>&1 )
      grep -q ' 0 diferencias de propiedad' "$hov" 2>/dev/null || { ok=0; why="$why hover/focus: $(grep -o '[0-9]* diferencias de propiedad' "$hov" 2>/dev/null | head -1)"; }
    fi
    [ "$ok" = 1 ] && verdict="SEGURO"
  else
    why="falló build o captura (cd vr && npm run build)"
  fi

  if [ "$verdict" = SEGURO ] && [ "$APPLY" = 1 ]; then
    kept=$((kept + 1)); act="quitado"          # el archivo se queda sin !important
  else
    cp "$BAK" "$f"; act="restaurado"
    [ "$verdict" = CAMBIA ] && reverted=$((reverted + 1))
  fi
  CUR=""
  printf '%-7s %3s !imp  %-62s %s %s\n' "$verdict" "$n" "$f" "[$act]" "$why" | tee -a "$SUMMARY"
done

echo; echo "Resumen guardado en $SUMMARY"
if [ "$APPLY" = 1 ]; then
  echo "Archivos dejados sin !important: $kept   |   con diferencias (revertidos): $reverted"
  node scripts/count-important.mjs --update
  echo "Revisa:  git diff --stat   y luego haz commit."
else
  echo "Nada se modificó. Para aplicar los SEGUROS:  APPLY=1 bash vr/important-files.sh"
fi
