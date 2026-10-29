#!/usr/bin/env python3
"""
Convierte PNG/JPG a WebP sin tocar los originales.
Uso: python tools/imagenes_webp.py <carpeta> [--calidad 85]
La salida va a <carpeta>-webp/ para que la revises antes de subir nada.
"""
import argparse
import sys
from pathlib import Path

from PIL import Image

EXTENSIONES = {".png", ".jpg", ".jpeg"}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("carpeta", type=Path)
    p.add_argument("--calidad", type=int, default=85)
    args = p.parse_args()

    if not args.carpeta.is_dir():
        sys.exit(f"✗ No existe la carpeta: {args.carpeta}")

    salida = args.carpeta.parent / (args.carpeta.name + "-webp")
    salida.mkdir(exist_ok=True)

    total_in = total_out = 0
    for f in sorted(args.carpeta.iterdir()):
        if f.suffix.lower() not in EXTENSIONES:
            continue

        with Image.open(f) as im:
            ancho, alto = im.size
            con_alfa = im.mode in ("RGBA", "LA") or "transparency" in im.info
            im = im.convert("RGBA" if con_alfa else "RGB")
            destino = salida / (f.stem + ".webp")
            im.save(destino, "WEBP", quality=args.calidad, method=6)

        antes = f.stat().st_size
        despues = destino.stat().st_size
        total_in += antes
        total_out += despues
        pct = 100 * despues / antes
        print(f"{f.name:45} {ancho}x{alto:<6} {antes/1024:8.0f} KB -> {despues/1024:8.0f} KB ({pct:4.0f} %)")

    if total_in:
        ahorro = 100 * (1 - total_out / total_in)
        print(f"\nTotal: {total_in/1024/1024:.2f} MB -> {total_out/1024/1024:.2f} MB (ahorro {ahorro:.0f} %)")
        print(f"Salida: {salida}")
    else:
        print("No se encontraron PNG/JPG en la carpeta.")


if __name__ == "__main__":
    main()
