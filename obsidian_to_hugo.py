#!/usr/bin/env python3
"""
obsidian_to_hugo.py
Convierte un post de Obsidian al formato Hugo:
  - Lee frontmatter con delimitadores /// frontmatter-start /// y /// frontmatter-end ///
    directamente desde el .md del borrador
  - Sube imágenes a Cloudflare R2 (incluyendo ambos covers)
  - Incluye el cover del idioma correcto en el frontmatter generado
  - Reemplaza ![[imagen.png]] por URLs públicas de R2
  - Guarda el MD resultante en HUGO_CONTENT_ROOT/<fecha>-<slug>/

Uso:
  python obsidian_to_hugo.py <nombre-carpeta-post> [--lang es|en]

.env esperado:
  HUGO_CONTENT_ROOT = /ruta/al/repo/content/post   ← apunta directo a content/post
  OBSIDIAN_ROOT     = /ruta/a/1_Drafts
"""

import os
import re
import sys
import argparse
from pathlib import Path
from datetime import date
import boto3
from botocore.config import Config
from dotenv import load_dotenv

# ── Cargar variables de entorno ───────────────────────────────────────────────
load_dotenv()

R2_ACCESS_KEY     = os.getenv("R2_ACCESS_KEY")
R2_SECRET_KEY     = os.getenv("R2_SECRET_KEY")
R2_ENDPOINT       = os.getenv("R2_ENDPOINT")
R2_BUCKET         = os.getenv("R2_BUCKET")
R2_PUBLIC_URL     = os.getenv("R2_PUBLIC_URL").rstrip("/")
OBSIDIAN_ROOT     = Path(os.getenv("OBSIDIAN_ROOT"))
HUGO_CONTENT_ROOT = Path(os.getenv("HUGO_CONTENT_ROOT"))

FM_START = "/// frontmatter-start ///"
FM_END   = "/// frontmatter-end ///"

CONTENT_TYPES = {
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif":  "image/gif",
    ".webp": "image/webp",
    ".svg":  "image/svg+xml",
}


# ── Cliente R2 ────────────────────────────────────────────────────────────────
def get_r2_client():
    return boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY,
        aws_secret_access_key=R2_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


# ── Subir imagen a R2 ─────────────────────────────────────────────────────────
def upload_image(client, local_path: Path, post_slug: str) -> str:
    r2_key = f"posts/{post_slug}/{local_path.name}"
    ct     = CONTENT_TYPES.get(local_path.suffix.lower(), "application/octet-stream")
    print(f"  ↑ Subiendo {local_path.name} → R2:{r2_key}")
    client.upload_file(
        str(local_path),
        R2_BUCKET,
        r2_key,
        ExtraArgs={"ContentType": ct},
    )
    return f"{R2_PUBLIC_URL}/{r2_key}"


# ── Limpiar YAML extraído de Obsidian ─────────────────────────────────────────
def clean_obsidian_yaml(yaml_text: str) -> str:
    """
    Obsidian inserta líneas en blanco entre campos YAML al guardar el archivo.
    Eso rompe bloques escalares (>-, |) porque Hugo/YAML interpreta la línea
    vacía como fin del bloque antes de que el texto haya terminado.

    FIX PRINCIPAL: Los bloques escalares (>-, >, |, |-) requieren que las líneas
    de contenido estén indentadas con exactamente 2 espacios. Este limpiador:

    1. Preserva la indentación existente si ya la tiene.
    2. Añade 2 espacios de indentación a líneas de bloque escalar que la perdieron.
    3. Elimina líneas en blanco espurias entre campos raíz, PERO las conserva
       cuando son parte legítima del contenido de un bloque escalar.

    Reglas adicionales:
    - Dentro de un bloque escalar (>-, |): conservar líneas vacías SOLO si la
      siguiente línea no-vacía sigue indentada (sigue siendo parte del bloque).
    - Dentro de una lista (- items): eliminar líneas vacías entre ítems.
    - Entre campos raíz: eliminar líneas vacías.
    """
    lines = yaml_text.split("\n")
    result          = []
    in_scalar_block = False
    in_list         = False
    # Rastrear qué indicador de bloque escalar estamos usando
    scalar_indent   = "  "  # 2 espacios, estándar YAML para Hugo

    for i, line in enumerate(lines):
        stripped = line.rstrip()

        # ── Inicio de bloque escalar: clave: >- o clave: | (y variantes)
        if re.match(r"^\S.*:\s*(>[-+]?|\|[-+]?)\s*$", stripped):
            in_scalar_block = True
            in_list         = False
            result.append(stripped)
            continue

        # ── Inicio de campo de mapa anidado (ej: "image:") sin valor inline
        # Nota: no es inicio de bloque escalar, es un submapa
        if re.match(r"^\S[^:]*:\s*$", stripped):
            in_scalar_block = False
            in_list         = False
            result.append(stripped)
            continue

        # ── Inicio de lista: campo con guión en la siguiente línea
        # (detectado cuando la línea tiene solo la clave sin valor)
        # Este caso ya se cubre arriba; aquí manejamos ítems de lista
        if in_list and stripped.startswith("  ") and stripped.lstrip().startswith("-"):
            result.append(stripped)
            continue

        # ── Dentro de bloque escalar
        if in_scalar_block:
            if stripped == "":
                # Buscar la siguiente línea no vacía
                next_non_blank = next(
                    (lines[j].rstrip() for j in range(i + 1, len(lines))
                     if lines[j].strip() != ""),
                    ""
                )
                if next_non_blank and not next_non_blank[0].isspace():
                    # La siguiente línea raíz = fin del bloque → descartar vacía
                    in_scalar_block = False
                else:
                    # Vacía dentro del bloque → conservar
                    result.append("")
                continue
            elif line[:1].isspace():
                # Línea ya indentada = contenido del bloque, preservar tal cual
                result.append(line.rstrip())
                continue
            elif not line[:1].isspace() and stripped:
                # Línea no indentada pero con contenido dentro del bloque escalar.
                # Esto ocurre cuando Obsidian/el editor eliminó la indentación.
                # FIX: añadir los 2 espacios de indentación requeridos por YAML.
                result.append(scalar_indent + stripped)
                continue
            else:
                # Línea raíz no vacía = fin del bloque
                in_scalar_block = False

        # ── Dentro de lista
        if in_list:
            if stripped == "":
                in_list = False
                continue   # eliminar línea vacía entre campos
            elif line[:1].isspace():
                result.append(stripped)
                continue
            else:
                in_list = False

        # ── Detectar inicio de lista en el contexto raíz
        # Una línea como "categories:" seguida de "  - Security"
        if re.match(r"^\S[^:]*:\s*$", stripped):
            in_list = True
            result.append(stripped)
            continue

        # ── Línea raíz normal
        if stripped == "":
            continue   # eliminar líneas en blanco entre campos raíz

        result.append(stripped)

    return "\n".join(result)


# ── Extraer frontmatter y cuerpo del borrador ─────────────────────────────────
def extract_frontmatter_and_body(text: str) -> tuple[str, str]:
    """
    Extrae el bloque entre /// frontmatter-start /// y /// frontmatter-end ///.
    Limpia el YAML de líneas vacías espurias de Obsidian.
    Retorna (yaml_content_limpio, body).
    """
    text_norm = text.replace("\r\n", "\n").replace("\r", "\n")

    start_idx = text_norm.find(FM_START)
    end_idx   = text_norm.find(FM_END)

    if start_idx == -1 or end_idx == -1 or end_idx <= start_idx:
        print(f"  [debug] FM_START en índice: {start_idx}")
        print(f"  [debug] FM_END   en índice: {end_idx}")
        return "", text_norm

    raw_yaml     = text_norm[start_idx + len(FM_START):end_idx]
    yaml_content = clean_obsidian_yaml(raw_yaml)

    before = text_norm[:start_idx].strip()
    after  = text_norm[end_idx + len(FM_END):].strip()
    body   = "\n\n".join(part for part in [before, after] if part)

    return yaml_content, body


# ── Reemplazar el path del cover en el YAML ───────────────────────────────────
def inject_cover_url_in_yaml(yaml_content: str, cover_url: str) -> str:
    """
    Reemplaza el valor de 'path:' dentro del bloque 'image:' por la URL de R2.

    Maneja todos los formatos posibles que puede generar Obsidian o el limpiador:
      image:
        path: cover.es.png          ← relativo simple
        path: ./cover.es.png        ← relativo con ./
        path: https://...           ← ya es URL (se sobreescribe igual)

    La búsqueda es tolerante a la cantidad de espacios de indentación (1-8).
    """
    # Estrategia: buscar el bloque image: y dentro de él reemplazar path:
    # Regex multilinea que encuentra "image:" seguido (con posible líneas entre medias)
    # de "  path: <valor>" y lo reemplaza por la URL de R2.
    #
    # Captura grupos:
    #   \1 = todo lo que hay entre "image:" y "path:" (alt u otras claves)
    #   \2 = la indentación de path:
    #   El valor actual de path: es reemplazado por cover_url
    #
    # Nota: usamos una función de reemplazo para evitar que grupos de captura
    # en cover_url (ej. paréntesis en URLs) rompan el reemplazo.

    pattern = re.compile(
        r"(image:\n(?:[ \t]+(?!path:)[^\n]*\n)*)"  # image: + líneas previas al path
        r"([ \t]+path:[ \t]*)\S[^\n]*",             # indentación + path: + valor actual
        re.MULTILINE,
    )

    def replacer(m):
        return m.group(1) + m.group(2) + cover_url

    new_yaml, count = pattern.subn(replacer, yaml_content)

    if count > 0:
        print(f"  ✓ URL del cover inyectada en frontmatter existente (path reemplazado)")
        return new_yaml

    # Si no encontró el patrón completo, intentar reemplazo simple de solo path:
    # (por si image: y path: quedaron en el mismo contexto sin otras claves entre medias)
    simple_pattern = re.compile(
        r"([ \t]+path:[ \t]*)\S[^\n]*",
        re.MULTILINE,
    )
    new_yaml, count = simple_pattern.subn(
        lambda m: m.group(1) + cover_url,
        yaml_content,
    )

    if count > 0:
        print(f"  ✓ URL del cover inyectada (reemplazo simple de path:)")
        return new_yaml

    # No se encontró path: en absoluto — añadir bloque image: completo al final
    print(f"  ⚠ No se encontró 'path:' en el frontmatter — añadiendo bloque image:")
    cover_block = (
        f"image:\n"
        f"  path: {cover_url}\n"
        f'  alt: ""\n'
    )
    return yaml_content.rstrip() + "\n" + cover_block


# ── Construir frontmatter Hugo ────────────────────────────────────────────────
def build_frontmatter(yaml_content: str, post_slug: str,
                      cover_url: str | None) -> str:
    if not yaml_content:
        today = date.today().strftime("%Y-%m-%d")
        title = post_slug.replace("-", " ").title()
        print("  ⚠ Frontmatter personalizado vacío — generando uno básico")
        yaml_content = (
            f'title: "{title}"\n'
            f"date: {today}\n"
            f"draft: true\n"
            f'description: ""\n'
            f"categories:\n  - Security\n"
            f"tags:\n  -\n"
        )

    # Inyectar / reemplazar la URL del cover
    if cover_url:
        if "image:" in yaml_content:
            yaml_content = inject_cover_url_in_yaml(yaml_content, cover_url)
        else:
            cover_block = (
                f"image:\n"
                f"  path: {cover_url}\n"
                f'  alt: ""\n'
            )
            yaml_content = yaml_content.rstrip() + "\n" + cover_block
            print(f"  ✓ Bloque image: añadido al frontmatter")

    # ── Validación final: asegurar que los bloques escalares (>-, >, |, |-) ──
    # tienen sus líneas de contenido indentadas con al menos 2 espacios.
    # Esto actúa como red de seguridad por si clean_obsidian_yaml dejó escapar
    # alguna línea sin indentar.
    yaml_content = _ensure_scalar_blocks_indented(yaml_content)

    return f"---\n{yaml_content.strip()}\n---"


def _ensure_scalar_blocks_indented(yaml_content: str) -> str:
    """
    Red de seguridad post-limpieza.
    Recorre el YAML línea a línea y garantiza que cualquier línea de contenido
    dentro de un bloque escalar (>-, >, |, |-) tenga al menos 2 espacios de
    indentación. Si no los tiene, los añade.

    Esta función es idempotente: llamarla dos veces produce el mismo resultado.
    """
    lines           = yaml_content.split("\n")
    result          = []
    in_scalar_block = False

    for i, line in enumerate(lines):
        stripped = line.rstrip()

        # Detectar inicio de bloque escalar
        if re.match(r"^\S.*:\s*(>[-+]?|\|[-+]?)\s*$", stripped):
            in_scalar_block = True
            result.append(stripped)
            continue

        if in_scalar_block:
            if stripped == "":
                # Línea vacía dentro del bloque: verificar si continúa
                next_non_blank = next(
                    (lines[j].rstrip() for j in range(i + 1, len(lines))
                     if lines[j].strip() != ""),
                    ""
                )
                if next_non_blank and not next_non_blank[0].isspace():
                    in_scalar_block = False
                    # No añadir la línea vacía al final del bloque
                else:
                    result.append("")
                continue
            elif line and not line[0].isspace():
                # Línea de contenido SIN indentación — esto es el bug que queremos corregir
                # Verificar que no sea el inicio de un nuevo campo raíz
                if ":" in stripped and re.match(r"^\S[^:]*:\s", stripped):
                    # Es un nuevo campo raíz, el bloque terminó
                    in_scalar_block = False
                    result.append(stripped)
                else:
                    # Es contenido del bloque sin indentar — añadir 2 espacios
                    result.append("  " + stripped)
                continue
            else:
                result.append(line.rstrip())
                continue

        result.append(stripped)

    return "\n".join(result)


# ── Subir covers ──────────────────────────────────────────────────────────────
def handle_covers(client, post_dir: Path, post_slug: str, lang: str) -> str | None:
    """
    Sube cover-es.png y cover-en.png a R2.
    Retorna la URL del cover del idioma activo.
    """
    screenshots_dir = post_dir / "screenshots"
    search_dirs     = [screenshots_dir, post_dir]
    cover_names     = {"es": "cover-es.png", "en": "cover-en.png"}
    cover_urls: dict[str, str] = {}

    for lang_code, filename in cover_names.items():
        local_path = None
        for d in search_dirs:
            candidate = d / filename
            if candidate.exists():
                local_path = candidate
                break
        if local_path:
            url = upload_image(client, local_path, post_slug)
            cover_urls[lang_code] = url
        else:
            print(f"  ⚠ No se encontró {filename} — se omitirá cover para '{lang_code}'")

    return cover_urls.get(lang)


# ── Procesar el markdown ──────────────────────────────────────────────────────
def process_markdown(body: str, md_path: Path, screenshots_dir: Path,
                     post_slug: str, client, frontmatter: str) -> str:
    pattern  = re.compile(r"!\[\[([^\]]+)\]\]")
    uploaded: dict[str, str] = {}

    def replace_image(match):
        ref      = match.group(1)
        filename = Path(ref).name
        candidates = [
            screenshots_dir / filename,
            md_path.parent  / filename,
            md_path.parent  / ref,
        ]
        local_path = next((p for p in candidates if p.exists()), None)
        if not local_path:
            print(f"  ⚠ Imagen no encontrada: {ref} — se deja sin cambiar")
            return match.group(0)
        if filename not in uploaded:
            uploaded[filename] = upload_image(client, local_path, post_slug)
        return f"![]({uploaded[filename]})"

    processed_body = pattern.sub(replace_image, body)
    return f"{frontmatter}\n\n{processed_body.strip()}\n"


# ── Crear carpeta de destino en Hugo ──────────────────────────────────────────
def get_hugo_post_dir(post_slug: str) -> Path:
    """
    HUGO_CONTENT_ROOT debe apuntar directamente a content/post del repo.
    Resultado: <HUGO_CONTENT_ROOT>/<fecha>-<slug>/
    """
    today    = date.today().strftime("%Y-%m-%d")
    dir_name = f"{today}-{post_slug}"
    dest     = HUGO_CONTENT_ROOT / dir_name
    dest.mkdir(parents=True, exist_ok=True)
    return dest


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    arg_parser = argparse.ArgumentParser(
        description="Convierte un borrador de Obsidian a Hugo."
    )
    arg_parser.add_argument(
        "folder",
        help="Nombre de la carpeta del post dentro de OBSIDIAN_ROOT.",
    )
    arg_parser.add_argument(
        "--lang",
        choices=["es", "en"],
        default="es",
        help="Idioma principal del borrador (default: es).",
    )
    args = arg_parser.parse_args()

    folder_name = args.folder
    lang        = args.lang
    post_dir    = OBSIDIAN_ROOT / folder_name

    if not post_dir.exists():
        print(f"✗ No se encontró la carpeta: {post_dir}")
        sys.exit(1)

    md_files = list(post_dir.glob("*.md"))
    if not md_files:
        print(f"✗ No se encontró ningún archivo .md en: {post_dir}")
        sys.exit(1)

    md_path         = md_files[0]
    screenshots_dir = post_dir / "screenshots"
    post_slug       = folder_name

    print(f"\n🚀 Procesando post: {md_path.name}")
    print(f"   Slug   : {post_slug}")
    print(f"   Idioma : {lang}")
    print(f"   Screenshots: {screenshots_dir}")
    print(f"   Destino Hugo: {HUGO_CONTENT_ROOT}\n")

    if not screenshots_dir.exists():
        print("  ⚠ No existe carpeta screenshots/ — buscando imágenes en directorio del post\n")

    # ── Leer borrador con detección automática de encoding ──
    raw_text = None
    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            raw_text = md_path.read_text(encoding=encoding)
            print(f"  ✓ Archivo leído con encoding: {encoding}")
            break
        except UnicodeDecodeError:
            continue

    if raw_text is None:
        print(f"✗ No se pudo leer {md_path}")
        sys.exit(1)

    # ── Extraer frontmatter y cuerpo ──
    yaml_content, body = extract_frontmatter_and_body(raw_text)

    if yaml_content:
        print(f"  ✓ Frontmatter personalizado encontrado y extraído\n")
    else:
        print(f"  ⚠ No se encontró /// frontmatter-start /// en el archivo\n")

    # ── R2 ──
    client = get_r2_client()

    # ── Covers ──
    print("── Procesando covers ──")
    active_cover_url = handle_covers(client, post_dir, post_slug, lang)
    if active_cover_url:
        print(f"  ✓ Cover activo ({lang}): {active_cover_url}")

    # ── Construir frontmatter final (la inyección del cover ocurre dentro) ──
    frontmatter = build_frontmatter(yaml_content, post_slug, active_cover_url)

    # ── Procesar imágenes del cuerpo ──
    print("\n── Procesando imágenes del cuerpo ──")
    final_content = process_markdown(
        body, md_path, screenshots_dir, post_slug, client, frontmatter
    )

    # ── Guardar en Hugo ──
    hugo_dir  = get_hugo_post_dir(post_slug)
    dest_file = hugo_dir / f"index.{lang}.md"
    dest_file.write_text(final_content, encoding="utf-8")

    print(f"\n✓ Post guardado en: {dest_file}")
    print(f"  Revisa el frontmatter y ajusta antes de publicar.")
    print(
        f"\n  Cuando esté listo:\n"
        f"  git add . && git commit -m 'post: {post_slug}' && git push origin master\n"
    )


if __name__ == "__main__":
    main()