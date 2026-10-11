#!/usr/bin/env bash
# vr/trace-file.sh <archivo> — explica POR QUÉ un archivo salió CAMBIA en el barrido.
# Construye A (estado actual) y B (igual, pero sin !important en ese archivo), sirve ambos
# y corre rule-trace.mjs: para cada propiedad que cambia muestra qué reglas la declaran en B.
#
# Uso:  bash vr/trace-file.sh assets/css/sections/_24-footer.scss
# Env:  PAGES=/,/es/  VP=desktop|mobile  MODE=dark|light  MAX=12
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT" || exit 1
F="${1:-}"; [ -f "$F" ] || { echo "uso: bash vr/trace-file.sh assets/css/sections/_24-footer.scss"; exit 1; }
git diff --quiet -- assets/css || { echo "assets/css tiene cambios sin commit: haz commit antes."; exit 1; }
PA=4101; PB=4102; OUT=vr/shots; name="$(basename "$F")"
export MAX="${MAX:-12}"
BAK="$(mktemp)"; cp "$F" "$BAK"; SA=""; SB=""
cleanup() { cp "$BAK" "$F"; [ -n "$SA" ] && kill "$SA" 2>/dev/null; [ -n "$SB" ] && kill "$SB" 2>/dev/null; }
trap cleanup EXIT INT TERM

echo "→ build A (estado actual)"
hugo --gc --buildDrafts --baseURL "http://localhost:$PA/" --destination "$OUT/traceA" >/dev/null 2>&1 \
  || { echo "falló el build A"; exit 1; }
sed -i 's/[[:space:]]*!important//g' "$F"
echo "→ build B (sin !important en $name)"
hugo --gc --buildDrafts --baseURL "http://localhost:$PB/" --destination "$OUT/traceB" >/dev/null 2>&1 \
  || { echo "falló el build B"; exit 1; }
cp "$BAK" "$F"

python3 -m http.server "$PA" --bind 127.0.0.1 --directory "$OUT/traceA" >/dev/null 2>&1 & SA=$!
python3 -m http.server "$PB" --bind 127.0.0.1 --directory "$OUT/traceB" >/dev/null 2>&1 & SB=$!
sleep 1
(cd vr && node rule-trace.mjs "http://localhost:$PA" "http://localhost:$PB") | tee "$OUT/trace-$name.txt"
echo; echo "Guardado en $OUT/trace-$name.txt"
