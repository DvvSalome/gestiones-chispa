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
# arcilla/: asomados por encima de un borde (estilo TARGET); el ancla es la línea del borde y los dedos cuelgan por debajo
PERSONAJES = {"tecnico": "arcilla/tecnico.png", "medidor": "arcilla/medidor.png", "ingeniera": "arcilla/ingeniera.png"}
ALTO = 420  # alto final de la celda, en px (se muestra a ~150 px: sobra para pantallas 2x)
MARGEN = 12


def etiquetar(m):
    """Piezas conectadas (8 vecinos) de la máscara: devuelve la matriz de etiquetas y [(etiqueta, área, x0, x1)]."""
    alto, ancho = m.shape
    etiqueta = np.zeros(m.shape, dtype=np.int32)
    piezas = []
    for y0, x0 in zip(*np.nonzero(m)):
        if etiqueta[y0, x0]:
            continue
        n = len(piezas) + 1
        etiqueta[y0, x0] = n
        pila, area, xa, xb = [(y0, x0)], 0, x0, x0
        while pila:
            y, x = pila.pop()
            area += 1
            xa, xb = min(xa, x), max(xb, x)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < alto and 0 <= xx < ancho and m[yy, xx] and not etiqueta[yy, xx]:
                        etiqueta[yy, xx] = n
                        pila.append((yy, xx))
        piezas.append((n, area, xa, xb + 1))
    return etiqueta, piezas


def poses(mascara, n=6):
    """Reparte las piezas conectadas en n poses: las n más grandes son los cuerpos y cada pieza suelta (una mano que
    señala, un casco levantado, una miga) va con el cuerpo más cercano a lo ancho. Así nada queda en la celda vecina."""
    etiqueta, piezas = etiquetar(mascara)
    # si dos poses se tocan (hombro con hombro) salen como una pieza: se parte la más ancha por su columna más vacía,
    # en su tramo del medio, hasta tener n cuerpos
    grandes = lambda: [p for p in piezas if p[1] >= max(q[1] for q in piezas) * 0.15]
    while len(grandes()) < n:
        k, area, x0, x1 = max(grandes(), key=lambda p: p[3] - p[2])
        suya = etiqueta == k
        perfil = suya[:, x0:x1].sum(axis=0)
        a, b = int((x1 - x0) * 0.3), int((x1 - x0) * 0.7)
        corte = x0 + a + int(np.argmin(perfil[a:b]))
        nueva = len(piezas) + 1
        derecha = suya.copy()
        derecha[:, :corte] = False
        etiqueta[derecha] = nueva
        izquierda = int(suya[:, :corte].sum())
        piezas = [p for p in piezas if p[0] != k] + [(k, izquierda, x0, corte), (nueva, area - izquierda, corte, x1)]
    cuerpos = sorted(sorted(piezas, key=lambda p: -p[1])[:n], key=lambda p: p[2])
    de = {c[0]: i for i, c in enumerate(cuerpos)}

    def distancia(p, c):
        return max(0, c[2] - p[3], p[2] - c[3])

    for p in piezas:
        if p[0] not in de:
            de[p[0]] = min(range(n), key=lambda i: (distancia(p, cuerpos[i]), abs((p[2] + p[3]) / 2 - (cuerpos[i][2] + cuerpos[i][3]) / 2)))
    mapa = np.full(max(p[0] for p in piezas) + 1, -1, dtype=np.int32)
    for k, i in de.items():
        mapa[k] = i
    return mapa[etiqueta], n  # la pose de cada píxel (−1: fondo)


def ensanchar(m, veces=3):
    for _ in range(veces):
        m = m | np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)
    return m


def linea_del_borde(cual, n):
    """Fila donde el cuerpo termina recto: desde abajo, la primera fila ancha (≥ 45 % de la fila más ancha de la pose).
    Lo que sigue por debajo son los dedos que cuelgan. Se usa la mediana de las poses: todas se asoman al mismo borde."""
    filas = []
    for i in range(n):
        anchos = (cual == i).sum(axis=1)
        filas.append(int(np.where(anchos >= anchos.max() * 0.45)[0][-1]) + 1)
    return int(np.median(filas))


def recortar(clave, archivo):
    im = Image.open(RAIZ / "arte" / archivo).convert("RGBA")
    a = np.array(im)
    cual, n = poses(a[..., 3] > 40)
    borde = linea_del_borde(cual, n)
    piezas = []
    for i in range(n):
        suya = cual == i
        ys, xs = np.nonzero(suya)
        x0, x1, y0, y1 = int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1
        # la pose sola: fuera lo de las otras poses y su borde suave
        sola = a[y0:y1, x0:x1].copy()
        otras = ensanchar((cual >= 0) & ~suya)[y0:y1, x0:x1]
        sola[otras & ~suya[y0:y1, x0:x1]] = 0
        franja = suya[borde - 24:borde, x0:x1]
        ax = x0 + float(np.where(franja)[1].mean())
        piezas.append({"caja": (x0, y0, x1, y1), "ancla": (ax, borde), "img": Image.fromarray(sola)})
    izq = max(p["ancla"][0] - p["caja"][0] for p in piezas)
    der = max(p["caja"][2] - p["ancla"][0] for p in piezas)
    arriba = max(p["ancla"][1] - p["caja"][1] for p in piezas)
    debajo = max(p["caja"][3] - p["ancla"][1] for p in piezas)
    ancho, alto = int(izq + der) + 2 * MARGEN, int(arriba + debajo) + 2 * MARGEN
    hoja = Image.new("RGBA", (ancho * len(piezas), alto), (0, 0, 0, 0))
    for i, p in enumerate(piezas):
        x0, y0, x1, y1 = p["caja"]
        ax, ay = p["ancla"]
        hoja.alpha_composite(p["img"], (int(i * ancho + MARGEN + izq - (ax - x0)), int(MARGEN + arriba - (ay - y0))))
    escala = ALTO / alto
    cw, ch = round(ancho * escala), ALTO
    hoja = hoja.resize((cw * len(piezas), ch), Image.LANCZOS)
    hoja.save(RAIZ / "sprites" / f"{clave}-arcilla.webp", "WEBP", quality=90, method=6)
    meta = {"personaje": clave, "cuadro": {"ancho": cw, "alto": ch}, "acciones": {k: i for i, k in enumerate(ACCIONES)},
            # dónde queda el ancla (centro del cuerpo sobre la línea del borde) dentro de la celda, en fracción
            "ancla": {"x": round((MARGEN + izq) / ancho, 4), "y": round((MARGEN + arriba) / alto, 4)}}
    (RAIZ / "sprites" / f"{clave}-arcilla.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(clave, f"{cw}×{ch} por cuadro", meta["ancla"])


for clave, archivo in PERSONAJES.items():
    recortar(clave, archivo)
