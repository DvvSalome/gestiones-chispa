// node sprites/generar.mjs → sprites/<personaje>.png + .json: una fila por acción, un cuadro de 200 × 200 por columna.
// Pinta cada cuadro con Chromium (Playwright) con fondo transparente. PLAYWRIGHT=ruta/a/playwright si no está instalado aquí.
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PERSONAJES, ACCIONES, BASE } from "./personajes.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
const LADO = 200;
const dir = new URL(".", import.meta.url).pathname;
const acciones = Object.entries(ACCIONES);
const columnas = Math.max(...acciones.map(([, a]) => a.cuadros));

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: columnas * LADO, height: acciones.length * LADO } });
for (const [clave, pj] of Object.entries(PERSONAJES)) {
  let n = 0;
  const filas = acciones.map(([, a]) => {
    const cuadros = [];
    for (let i = 0; i < a.cuadros; i++) {
      const e = { ...BASE, ...a.estado(a.bucle ? i / a.cuadros : i / (a.cuadros - 1)) };
      cuadros.push(`<svg width="${LADO}" height="${LADO}" viewBox="0 0 200 200" style="display:block;overflow:hidden">${pj.dibujar(e, `${clave}${n++}`)}</svg>`);
    }
    return `<div style="display:flex;height:${LADO}px">${cuadros.join("")}</div>`;
  });
  await p.setContent(`<body style="margin:0;background:transparent">${filas.join("")}</body>`);
  await p.screenshot({ path: `${dir}${clave}.png`, omitBackground: true, clip: { x: 0, y: 0, width: columnas * LADO, height: acciones.length * LADO } });
  const meta = {
    personaje: pj.nombre, cuadro: { ancho: LADO, alto: LADO }, columnas,
    acciones: Object.fromEntries(acciones.map(([k, a], fila) => [k, { fila, cuadros: a.cuadros, fps: a.fps, bucle: a.bucle }])),
  };
  writeFileSync(`${dir}${clave}.json`, JSON.stringify(meta, null, 2) + "\n");
  console.log(`${clave}: ${acciones.length} acciones, ${columnas} columnas`);
}
await b.close();
