# blog.deviannt.com

Blog bilingüe (EN/ES) de investigación en seguridad ofensiva. Sitio estático con [Hugo](https://gohugo.io/) y el tema Chirpy (`themes/hugo-theme-chirpy`), con estilos propios en `assets/css/custom.scss`.

## Requisitos

- Hugo extended `0.159.1` (la versión que usa el CI)
- Dart Sass
- Go `^1.24.2` (módulos de Hugo)
- Node 20

## Desarrollo local

```bash
npm ci
npm run vendor-assets   # copia Font Awesome, tocbot, mermaid, mathjax, etc. a static/lib/
hugo server
```

`static/lib/`, `public/`, `resources/_gen/` y `assets/jsconfig.json` son salida generada: no se versionan.

## Despliegue

El workflow `.github/workflows/deploy.yaml` corre **solo con push a `master`** (o `workflow_dispatch`). Construye con `hugo --gc --baseURL "https://blog.deviannt.com/"`, publica en GitHub Pages y purga la caché de Cloudflare (secrets `CF_ZONE_ID` y `CF_API_TOKEN`).

Cualquier otra rama se puede subir sin que se publique nada. No lances `workflow_dispatch` sobre una rama que no quieras desplegar.

## Contenido

Cada post vive en `content/post/<fecha>-<slug>/` con `index.md` (EN) e `index.es.md` (ES). Las imágenes de portada se alojan en Cloudflare R2 y se enlazan por URL en el frontmatter (`image.path`).

`obsidian_to_hugo.py` convierte un borrador de Obsidian al formato Hugo y sube las imágenes a R2:

```bash
python obsidian_to_hugo.py <carpeta-del-post> [--lang es|en]
```

Requiere `boto3` y `python-dotenv`, y un `.env` (no versionado) con `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_ENDPOINT`, `R2_BUCKET`, `R2_PUBLIC_URL`, `OBSIDIAN_ROOT` y `HUGO_CONTENT_ROOT`.

## CSS

Todo el CSS propio está en `assets/css/custom.scss`, dividido en secciones con cabecera `/* ─ … */`. Los tokens van al inicio. Tras la fase de limpieza de deuda, los `!important` que quedan reemplazan componentes del tema o resuelven conflictos entre reglas que ya tienen `!important`: no se quitan sin pasar el kit de regresión visual.

## Kit de regresión visual (`vr/`)

Aislado del `package.json` raíz; el CI no lo instala. Captura el sitio con Playwright (17 páginas × 2 viewports × 2 modos) y compara píxeles contra una línea base. Si no tienes los navegadores de Playwright, define `CHROME_PATH`.

```bash
cd vr
npm install
npm run baseline            # construye en vr/site y captura vr/shots/baseline
# ...cambios en el CSS...
npm run check               # reconstruye, captura current y compara (tolerancia 0.05 %)
node geodiff.mjs            # diferencias de geometría
node hover.mjs baseline     # sonda de :hover y :focus-visible (solo escritorio)
node hover.mjs current
node hoverdiff.mjs          # compara las sondas
```

Las capturas estáticas no ven `.active`, `.show`, `.collapse` ni estados que activa el JS: tras un cambio de CSS, revisa a mano el sidebar móvil, el buscador, el toggle de tema, el TOC, el botón de volver arriba y la impresión.

`vr/important-sections.sh` quita los `!important` de cada sección por separado y mide el impacto (ver cabecera del script); restaura el archivo al terminar.

## Ramas

- `master`: lo que se publica.
- Todo trabajo va en ramas propias y se integra a `master` solo cuando está revisado.
