// Prueba real de punta a punta: el bot con NVIDIA (y OpenRouter de respaldo) contra el catálogo real de la tienda, y
// después lo que recomendó en el carrito de la tienda hasta la oferta del técnico y la nota del pedido.
// Llaves en el entorno o en .env (no se versiona): NVIDIA_NIM_KEY y OPENROUTER_API_KEY.
//
// node test/e2e-vivo.mjs        (PLAYWRIGHT=ruta/a/playwright si no está instalado aquí; sin él se salta el navegador)
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const raiz = new URL("..", import.meta.url).pathname;
if (existsSync(`${raiz}.env`)) for (const l of readFileSync(`${raiz}.env`, "utf8").split("\n")) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const A = await import("../servidor/asistente.mjs");
const nombres = A.proveedores().map((p) => p.nombre);
if (!nombres.length) { console.log("Faltan NVIDIA_NIM_KEY y OPENROUTER_API_KEY (entorno o .env)."); process.exit(2); }
console.log(`Proveedores: ${nombres.join(" → ")}\n`);

const ESCENARIOS = [
  { pregunta: "Voy a montar paneles solares en mi casa, ¿qué necesito?", categoria: /Solar/, servicio: "solar" },
  { pregunta: "necesito un breaker para el tablero", categoria: /Solar|Tablero|Protecc|Conector|Materiales Varios/ },
  { pregunta: "busco reflectores led para una bodega grande", categoria: /Iluminación|Solar/ },
  { pregunta: "tubo pvc de media pulgada", categoria: /Tubería/ },
  { pregunta: "tienen medidor trifásico?", categoria: /Medidores/ },
  { pregunta: "materiales para una puesta a tierra", categoria: /Tierra|Conectores/ },
  { pregunta: "¿cuánto cuesta un transformador de 50 kva?", categoria: /Transformadores/, sinPrecio: true },
  { pregunta: "dame una receta de arepas de huevo", nada: true },
];

const resultados = [];
let fallas = 0;
const chequear = (ok, que, fila) => { fila.checks.push(`${ok ? "✓" : "✗"} ${que}`); if (!ok) fallas++; };
for (const e of ESCENARIOS) {
  const t0 = Date.now();
  const r = await A.responder({ mensajes: [{ rol: "cliente", texto: e.pregunta }] });
  const fila = { pregunta: e.pregunta, proveedor: r.proveedor, ms: Date.now() - t0, texto: r.texto, productos: r.productos.map((p) => `${p.nombre} [${p.categoria}]`), servicio: r.servicio?.titulo || "", checks: [] };
  chequear(r.proveedor !== "catalogo", "respondió un modelo", fila);
  chequear(r.texto.length > 0 && r.texto.length <= 600, "texto corto", fila);
  chequear(!/\$\s?\d/.test(r.texto), "sin precios en el texto", fila);
  if (e.nada) chequear(r.productos.length === 0, "fuera de tema: no recomienda productos", fila);
  else chequear(r.productos.length > 0 && r.productos.some((p) => e.categoria.test(p.categoria)), "recomienda de la categoría correcta", fila);
  if (e.servicio) chequear(r.servicio?.id === e.servicio, `ofrece el técnico (${e.servicio})`, fila);
  resultados.push({ ...fila, crudo: r });
  console.log(`«${e.pregunta}»  ${r.proveedor} · ${fila.ms} ms\n  ${r.texto}\n  → ${fila.productos.join(" | ") || "(sin productos)"}${fila.servicio ? `\n  técnico: ${fila.servicio}` : ""}\n  ${fila.checks.join("  ")}\n`);
}

// respaldo: NVIDIA apuntando a un puerto muerto → tiene que responder OpenRouter
if (process.env.OPENROUTER_API_KEY && process.env.NVIDIA_NIM_KEY) {
  // OpenRouter va primero y NVIDIA de respaldo: se apaga OpenRouter a propósito y tiene que responder NVIDIA
  A.reiniciarDegradados();
  const r = await A.responder({ mensajes: [{ rol: "cliente", texto: "panel solar" }] }, { ...process.env, OPENROUTER_BASE: "http://127.0.0.1:9" });
  const ok = r.proveedor.startsWith("nvidia");
  if (!ok) fallas++;
  console.log(`${ok ? "✓" : "✗"} Respaldo: con OpenRouter caído respondió ${r.proveedor}\n`);
  A.reiniciarDegradados();
}

// navegador: lo que recomendó para el sistema solar, al carrito de la tienda → oferta del técnico → nota del pedido
const require = createRequire(import.meta.url);
let chromium = null;
try { ({ chromium } = require(process.env.PLAYWRIGHT || "playwright")); } catch { console.log("(sin Playwright: se salta el navegador)"); }
const solar = resultados[0].crudo;
if (chromium && solar.productos.length && solar.servicio) {
  const puerto = 4560 + Math.floor(Math.random() * 30);
  const demo = spawn(process.execPath, [`${raiz}demo/servidor.mjs`], { env: { ...process.env, PORT: String(puerto) }, stdio: "ignore" });
  await new Promise((ok) => setTimeout(ok, 1200));
  const b = await chromium.launch();
  try {
    const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    await p.goto(`http://localhost:${puerto}/nosotros`);
    const carrito = solar.productos.map((x) => ({ id: x.slug, slug: x.slug, codigo: x.slug, nombre: x.nombre, precio: x.precio, ivaPct: 19, unidad: "UND", categoria: x.categoria, foto: null, fotoAlt: x.nombre, cantidad: 1 }));
    await p.evaluate((c) => { localStorage.setItem("ge-tienda-carrito-v1", JSON.stringify(c)); sessionStorage.clear(); }, carrito);
    await p.goto(`http://localhost:${puerto}/pedido`);
    await p.waitForSelector(".cht", { timeout: 15000 });
    const titulo = await p.locator(".cht-para strong").innerText();
    const okTitulo = titulo === solar.servicio.titulo;
    await p.locator(".cht").getByRole("button", { name: "Sí, agrégala a mi pedido" }).click();
    await p.waitForTimeout(600);
    const nota = await p.evaluate(() => document.querySelector('.pedido__form textarea[name="nota"]')?.value || "");
    const okNota = nota.includes(`[Servicio técnico] Quiero cotizar: ${solar.servicio.titulo}`);
    await p.screenshot({ path: `${raiz}capturas/e2e-pedido-390.png` });
    if (!okTitulo || !okNota) fallas++;
    console.log(`${okTitulo ? "✓" : "✗"} Carrito → la tienda ofrece «${titulo}» (el bot dijo «${solar.servicio.titulo}»)`);
    console.log(`${okNota ? "✓" : "✗"} Agregar → la nota del pedido trae la instalación`);
  } finally { await b.close(); demo.kill(); }
}

writeFileSync(`${raiz}test/resultado-e2e.json`, JSON.stringify({ proveedores: nombres, fallas, resultados: resultados.map(({ crudo, ...r }) => r) }, null, 2));
console.log(`\n${fallas ? `✗ ${fallas} chequeo(s) fallaron` : "✓ todo bien"} · detalle en test/resultado-e2e.json`);
process.exit(fallas ? 1 : 0);
