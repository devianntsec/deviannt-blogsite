---
title: "Styleguide (dev only)"
date: 2026-01-01
draft: true
toc: true
math: false
cve_id: "CVE-0000-00000"
cvss: "0.0"
categories:
  - Security
tags:
  - styleguide
image:
  path: /styleguide-cover.svg
  alt: "Styleguide cover"
---

> **TL;DR:** Página de referencia visual, no un post real. Reúne todos los
> componentes personalizados del tema (callouts, pasos, diagrama, tablas,
> código, tareas, tags) para comparar capturas antes/después al tocar
> `custom.scss`. Vive marcada `draft: true` y se construye solo con
> `--buildDrafts`, así que nunca sale en el build de producción normal.

---

## 1. Callouts

> Nota informativa de ejemplo, en línea propia tras un espacio en blanco.
{.prompt-info}

> Dato que vale la pena recordar.
{.prompt-tip}

> Algo que requiere atención antes de continuar.
{.prompt-warning}

> Esto puede salir mal si se ignora.
{.prompt-danger}

## 2. Pasos (`{{</* steps */>}}`)

{{< steps >}}
Primer paso | Descripción corta del primer paso, con algo de texto para ver el wrap.
Segundo paso | Otra descripción, esta vez un poco más larga para forzar que ocupe dos líneas en móvil.
Tercer paso | Último paso de la lista.
{{< /steps >}}

## 3. Diagrama (`{{</* diagram */>}}`)

{{< diagram title="Styleguide · Nodos y colores" label="todas las variantes de node-* / edge-* / label-*" height="260" >}}
<rect x="10" y="10" width="140" height="50" rx="2" class="node-default"/>
<text x="80" y="40" text-anchor="middle" class="label-primary" font-family="JetBrains Mono,monospace" font-size="8">default</text>

<rect x="170" y="10" width="140" height="50" rx="2" class="node-active"/>
<text x="240" y="40" text-anchor="middle" class="label-accent" font-family="JetBrains Mono,monospace" font-size="8">active</text>

<rect x="330" y="10" width="140" height="50" rx="2" class="node-ok"/>
<text x="400" y="40" text-anchor="middle" class="label-ok" font-family="JetBrains Mono,monospace" font-size="8">ok</text>

<rect x="10" y="80" width="140" height="50" rx="2" class="node-warn"/>
<text x="80" y="110" text-anchor="middle" class="label-warn" font-family="JetBrains Mono,monospace" font-size="8">warn</text>

<rect x="170" y="80" width="140" height="50" rx="2" class="node-danger"/>
<text x="240" y="110" text-anchor="middle" class="label-danger" font-family="JetBrains Mono,monospace" font-size="8">danger</text>

<rect x="330" y="80" width="140" height="50" rx="2" class="node-purple"/>
<text x="400" y="110" text-anchor="middle" class="label-purple" font-family="JetBrains Mono,monospace" font-size="8">purple</text>

<line x1="80" y1="60" x2="80" y2="80" stroke-width="1.5" class="edge-default"/>
<line x1="240" y1="60" x2="240" y2="80" stroke-width="1.5" class="edge-active"/>
<line x1="400" y1="60" x2="400" y2="80" stroke-width="1.5" class="edge-ok"/>
<text x="80" y="150" text-anchor="middle" class="label-muted" font-family="JetBrains Mono,monospace" font-size="7">label-muted</text>
{{< /diagram >}}

## 4. Tabla de datos

| CVE            | CVSS | Categoría | Estado   |
|----------------|------|-----------|----------|
| CVE-2021-4034  | 7.8  | Linux     | Parcheado |
| CVE-2024-30051 | 7.8  | Windows   | Parcheado |
| CVE-2024-51324 | 3.8  | Windows   | Parcheado |
| CVE-2025-55182 | 10.0 | Web       | Parcheado |

## 5. Lista de tareas

- [x] Reconocimiento inicial
- [x] Identificación del root cause
- [ ] Escribir el exploit
- [ ] Publicar el write-up

## 6. Código

```c
int main(int argc, char **argv) {
    // argc=0 dispara el bug de PwnKit
    if (argc < 1) {
        return exploit();
    }
    return 0;
}
```

```python
import requests

def poc(target):
    r = requests.post(target, json={"__proto__": {"then": "pwn"}})
    print(r.status_code)
```

## 7. Encabezados y texto

### Encabezado H3

Texto de párrafo normal con **negrita**, *cursiva*, `código inline` y un
[enlace de ejemplo](https://example.com). Lorem ipsum dolor sit amet,
consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore.

#### Encabezado H4

- Lista simple
- con varios
- elementos

1. Lista
2. numerada
3. de ejemplo
