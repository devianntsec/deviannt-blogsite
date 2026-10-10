#!/usr/bin/env bash
# Uso:  bash vr/important-sections.sh [archivo]            (por defecto assets/css/custom.scss)
#       SECCIONES="3 7 12" bash vr/important-sections.sh   (solo esas secciones)
# Para cada sección del archivo (delimitadas por cabeceras '/* ───'): quita SOLO los !important de esa sección,
# reconstruye, captura y compara contra vr/shots/baseline; restaura el archivo. No cambia nada de forma permanente.
# Requiere un baseline del estado actual:  cd vr && npm run build && node capture.mjs baseline
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
FILE="${1:-assets/css/custom.scss}"
BAK="$(mktemp)"; cp "$FILE" "$BAK"
SUM="$(mktemp)"
restore() { cp "$BAK" "$FILE"; }
trap restore EXIT INT TERM

[ -d vr/shots/baseline ] || { echo 'Falta vr/shots/baseline. Corre antes:  cd vr && npm run build && node capture.mjs baseline'; exit 1; }

TOTAL=$(wc -l < "$FILE")
mapfile -t STARTS < <(grep -n '^/\* ─' "$FILE" | cut -d: -f1)
N=${#STARTS[@]}
echo "$FILE: $N secciones con cabecera, $(grep -c '!important' "$FILE") líneas con !important en total"
echo

for ((i = 0; i < N; i++)); do
  num=$((i + 1))
  s=${STARTS[$i]}
  if ((i + 1 < N)); then e=$((STARTS[i + 1] - 1)); else e=$TOTAL; fi
  if [ -n "${SECCIONES:-}" ] && ! [[ " $SECCIONES " == *" $num "* ]]; then continue; fi
  imp=$(sed -n "${s},${e}p" "$FILE" | grep -c '!important')
  title=$(sed -n "$((s + 1))p" "$FILE" | sed -E 's/^[[:space:]]*//; s/[[:space:]]+$//' | cut -c1-48)
  if [ "$imp" -eq 0 ]; then continue; fi

  sed -i "${s},${e}s/[[:space:]]*!important//g" "$FILE"
  ( cd vr \
    && npm run build >/dev/null 2>&1 \
    && node capture.mjs current --concurrency 3 >/dev/null 2>&1 \
    && { node compare.mjs > "shots/sec-$num.txt" 2>&1; node geodiff.mjs > "shots/sec-$num-geo.txt" 2>&1; } )
  if [ -f "vr/shots/sec-$num.txt" ]; then
    tiles=$(grep -c '^DIFF\|^TAMAÑO' "vr/shots/sec-$num.txt")
    geo=$(tail -1 "vr/shots/sec-$num-geo.txt" | cut -c1-40)
  else
    tiles=999; geo='(falló la construcción o la captura)'
  fi
  cp "$BAK" "$FILE"
  printf '%05d|§%-2s líneas %4s-%-4s | %3s !important | tiles distintos: %3s | %s | %s\n' \
    "$tiles" "$num" "$s" "$e" "$imp" "$tiles" "$title" "$geo" | tee -a "$SUM" | cut -d'|' -f2-
done

echo; echo '=== ordenado de menos a más impacto (los de 0 tiles son los candidatos a borrar enteros) ==='
sort -n "$SUM" | cut -d'|' -f2-
sort -n "$SUM" | cut -d'|' -f2- > vr/shots/sections-summary.txt
echo; echo 'Guardado en vr/shots/sections-summary.txt. Archivo restaurado. Comprueba con:  git status --short'
