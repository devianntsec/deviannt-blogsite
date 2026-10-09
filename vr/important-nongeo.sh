#!/usr/bin/env bash
# Uso:  bash vr/important-nongeo.sh 600,657 2362,2399 [...]
# Quita el !important SOLO de las declaraciones que no afectan a la geometría (color, fondo, sombra,
# transición, opacidad…) dentro de los rangos de líneas dados. Conserva el de padding, margin, width,
# height, gap, display, border, font-size, transform, etc. Modifica assets/css/custom.scss en su sitio.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILE="$ROOT/assets/css/custom.scss"
[ $# -ge 1 ] || { echo 'Uso: bash vr/important-nongeo.sh 600,657 [2362,2399 ...]'; exit 2; }
BEFORE=$(grep -c '!important' "$FILE")
for r in "$@"; do
  a="${r%,*}"; b="${r#*,}"
  awk -v a="$a" -v b="$b" '
    BEGIN {
      geo = "^[[:space:]]*(padding|margin|height|width|min-|max-|gap|display|line-height|font|letter-spacing|flex|align-|justify-|border(-top|-right|-bottom|-left)?(-width)?[[:space:]]*:|box-sizing|position|top|right|bottom|left|inset|overflow|white-space|grid|order|float|content|aspect-ratio|text-indent|vertical-align|transform|zoom|scale|translate|rotate)"
    }
    NR >= a && NR <= b && /!important/ {
      t = $0
      if (t ~ /\{/) sub(/^[^{]*\{/, "", t)      # reglas de una sola línea: mirar solo la declaración
      nogeo = (t !~ geo)
      if (nogeo) sub(/[[:space:]]*!important/, "")
    }
    { print }
  ' "$FILE" > "$FILE.tmp" && mv "$FILE.tmp" "$FILE"
  echo "rango $r: hecho"
done
AFTER=$(grep -c '!important' "$FILE")
echo "líneas con !important: $BEFORE -> $AFTER (quitadas: $((BEFORE - AFTER)))"
