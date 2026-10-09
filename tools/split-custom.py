#!/usr/bin/env python3
"""Divide assets/css/custom.scss en parciales por sección (@use).

Uso (desde la raíz del repo):
    python3 tools/split-custom.py            # escribe assets/css/sections/ y custom.scss nuevo
    python3 tools/split-custom.py --check    # solo informa, no escribe

Guarda una copia del original en tools/custom.scss.orig la primera vez.
Verifica después con:  node tools/verify-split.mjs   (compila antes y después
y compara el CSS emitido, ignorando comentarios y espacios).
"""
import re, sys, pathlib, shutil, unicodedata

ROOT = pathlib.Path('.')
SRC = ROOT / 'assets/css/custom.scss'
OUT = ROOT / 'assets/css/sections'
check = '--check' in sys.argv

text = SRC.read_text(encoding='utf-8').replace('\r\n', '\n')
HDR = re.compile(r'/\* ─+\n   (\d+)\. ([^\n]+)\n   ─+ \*/\n')
ms = list(HDR.finditer(text))
assert ms and ms[0].group(1) == '0', 'no encuentro la sección 0 (tokens)'

def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    s = s.lower()
    s = re.sub(r'\(.*?\)', '', s)
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s[:40].strip('-')

preamble = text[:ms[0].start()]
parts = []
for i, m in enumerate(ms):
    end = ms[i + 1].start() if i + 1 < len(ms) else len(text)
    parts.append((int(m.group(1)), m.group(2).strip(), text[m.start():end].rstrip() + '\n'))

# --- correcciones de deprecación que no cambian el CSS emitido ---
def modernize(body):
    body = body.replace('map-get(map-get($semantic, $name), $mode)',
                        'map.get(map.get($semantic, $name), $mode)')
    body = body.replace('map-get($z-map, $name)', 'map.get($z-map, $name)')
    body = body.replace('$archives-width / 2', 'math.div($archives-width, 2)')
    body = body.replace('$alpha-dark: if($name == info, 0.15, 0.12);\n  $alpha-light: if($name == info, 0.10, 0.08);',
                        '$alpha-dark: 0.12;\n  $alpha-light: 0.08;\n  @if $name == info {\n    $alpha-dark: 0.15;\n    $alpha-light: 0.10;\n  }')
    body = body.replace('stroke-width: if($cls == active, 2, 1.5);',
                        '$sw: 1.5;\n      @if $cls == active { $sw: 2; }\n      stroke-width: $sw;')
    return body

files = []
for num, title, body in parts:
    body = modernize(body)
    if num == 0:
        name = '_tokens.scss'
        head = "@use 'sass:map';\n\n"
        content = preamble + head + body
    else:
        name = f'_{num:02d}-{slug(title)}.scss'
        uses = []
        if 'math.div' in body: uses.append("@use 'sass:math';")
        uses.append("@use 'tokens' as *;")
        if '@extend %dv-card' in body and num != 11:
            uses.append("@use '__CARDS__' as cards;")
        content = '\n'.join(uses) + '\n\n' + body
    files.append((num, name, content))

cards = next(n for num, n, _ in files if num == 11)
cards_mod = cards[1:].removesuffix('.scss')
files = [(n, f, c.replace('__CARDS__', cards_mod)) for n, f, c in files]

index = ["/* =============================================================",
         "   devianntsec · custom.scss — índice de parciales",
         "   Cada sección vive en assets/css/sections/. El orden de @use",
         "   ES el orden de la cascada: no lo cambies sin pasar el kit vr/.",
         "   ============================================================= */", ""]
for num, name, _ in files:
    if num == 0:
        continue  # tokens: no emite CSS, se importa en cada parcial
    index.append(f"@use 'sections/{name[1:].removesuffix('.scss')}' as s{num:02d};")
index.append('')

if check:
    for _, n, c in files: print(f'{n:55s} {len(c.splitlines()):5d} líneas')
    sys.exit(0)

OUT.mkdir(parents=True, exist_ok=True)
bak = ROOT / 'tools/custom.scss.orig'
if not bak.exists():
    shutil.copy(SRC, bak)
for _, n, c in files:
    (OUT / n).write_text(c, encoding='utf-8')
SRC.write_text('\n'.join(index), encoding='utf-8')
print(f'{len(files)} parciales en {OUT}; custom.scss ahora es un índice de {len(files)-1} @use')
