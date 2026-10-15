"""Recorta las hojas de poses de ChatGPT (arte/opcion-N-*.png, 6 poses en fila, fondo transparente) en hojas de sprites
alineadas: una celda por acción, todas del mismo tamaño y con el personaje parado en el mismo punto (los pies o el
torso, no la caja: el brazo que señala no lo corre de su sitio).

python3 sprites/recortar.py  →  sprites/<personaje>-arte.webp + .json
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
ACCIONES = ["reposo", "parpadeo", "saludo", "pensar", "senalar", "celebrar"]
PERSONAJES = {"tecnico": "opcion-2-tecnico.png", "medidor": "opcion-3-medidor.png", "ingeniera": "opcion-4-ingeniera.png"}
ALTO = 420  # alto final de la celda, en px (se muestra a ~150 px: sobra para pantallas 2x)
MARGEN = 12


def poses(mascara, n=6):
    """Las poses vienen repartidas a lo ancho en n partes iguales, y a veces un brazo toca la pose vecina: se corta en la
    columna más vacía cerca de cada límite (±1/3 de celda) y se recorta cada tramo a lo que tiene."""
    ancho = mascara.shape[1]
    perfil = mascara.sum(axis=0)
    celda = ancho / n
    cortes = [0]
    for k in range(1, n):
        c = int(k * celda)
        r = int(celda / 3)
        cortes.append(c - r + int(np.argmin(perfil[c - r:c + r])))
    cortes.append(ancho)
    tramos = []
    for x0, x1 in zip(cortes, cortes[1:]):
        xs = np.where(perfil[x0:x1] > 0)[0]
        tramos.append([x0 + int(xs[0]), x0 + int(xs[-1]) + 1])
    return tramos


def sin_migas(pieza):
    """Quita los pedacitos que entraron de la pose vecina por el corte (tocan el borde izquierdo o derecho y son chicos)."""
    a = np.array(pieza)
    m = a[..., 3] > 40
    alto, ancho = m.shape
    etiqueta = np.zeros(m.shape, dtype=np.int32)
    grupos = []
    for y0, x0 in zip(*np.nonzero(m)):
        if etiqueta[y0, x0]:
            continue
        n = len(grupos) + 1
        pila, area, toca, caja = [(y0, x0)], 0, False, [y0, x0, y0, x0]
        etiqueta[y0, x0] = n
        while pila:
            y, x = pila.pop()
            area += 1
            toca |= x == 0 or x == ancho - 1
            caja = [min(caja[0], y), min(caja[1], x), max(caja[2], y), max(caja[3], x)]
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < alto and 0 <= xx < ancho and m[yy, xx] and not etiqueta[yy, xx]:
                        etiqueta[yy, xx] = n
                        pila.append((yy, xx))
        grupos.append((n, area, toca, caja))
    mayor = max(g[1] for g in grupos)
    for n, area, toca, (y0, x0, y1, x1) in grupos:
        if toca and area < mayor * 0.03:
            # fuera la miga y el borde suave que la rodea
            zona = a[max(0, y0 - 3):y1 + 4, max(0, x0 - 3):x1 + 4]
            propia = etiqueta[max(0, y0 - 3):y1 + 4, max(0, x0 - 3):x1 + 4]
            zona[(propia == n) | ((propia == 0) & (zona[..., 3] <= 40))] = 0
    return Image.fromarray(a)


def recortar(clave, archivo):
    im = Image.open(RAIZ / "arte" / archivo).convert("RGBA")
    a = np.array(im)
    mascara = a[..., 3] > 40
    piezas = []
    for x0, x1 in poses(mascara):
        filas = np.where(mascara[:, x0:x1].any(axis=1))[0]
        y0, y1 = int(filas[0]), int(filas[-1]) + 1
        # ancla: el centro de lo que hay en el quinto de abajo (pies o torso) y la línea de abajo
        abajo = mascara[y1 - (y1 - y0) // 5:y1, x0:x1]
        ax = x0 + float(np.where(abajo)[1].mean())
        piezas.append({"caja": (x0, y0, x1, y1), "ancla": (ax, y1)})
    izq = max(p["ancla"][0] - p["caja"][0] for p in piezas)
    der = max(p["caja"][2] - p["ancla"][0] for p in piezas)
    arriba = max(p["ancla"][1] - p["caja"][1] for p in piezas)
    ancho, alto = int(izq + der) + 2 * MARGEN, int(arriba) + 2 * MARGEN
    hoja = Image.new("RGBA", (ancho * len(piezas), alto), (0, 0, 0, 0))
    for i, p in enumerate(piezas):
        x0, y0, x1, y1 = p["caja"]
        ax, ay = p["ancla"]
        hoja.alpha_composite(sin_migas(im.crop((x0, y0, x1, y1))), (int(i * ancho + MARGEN + izq - (ax - x0)), int(MARGEN + arriba - (ay - y0))))
    escala = ALTO / alto
    cw, ch = round(ancho * escala), ALTO
    hoja = hoja.resize((cw * len(piezas), ch), Image.LANCZOS)
    hoja.save(RAIZ / "sprites" / f"{clave}-arte.webp", "WEBP", quality=90, method=6)
    meta = {"personaje": clave, "cuadro": {"ancho": cw, "alto": ch}, "acciones": {k: i for i, k in enumerate(ACCIONES)},
            # dónde queda el ancla (pies o torso) dentro de la celda, en fracción: para colgarlo del borde de la tarjeta
            "ancla": {"x": round((MARGEN + izq) / ancho, 4), "y": round((MARGEN + arriba) / alto, 4)}}
    (RAIZ / "sprites" / f"{clave}-arte.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(clave, f"{cw}×{ch} por cuadro", meta["ancla"])


for clave, archivo in PERSONAJES.items():
    recortar(clave, archivo)
