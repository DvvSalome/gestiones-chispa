// node --test test/  — el asistente sin llaves: tienda, NVIDIA y OpenRouter simulados en puertos locales.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

const servidores = [];
const levantar = (fn) => new Promise((ok) => {
  const s = createServer(fn).listen(0, "127.0.0.1", () => ok(`http://127.0.0.1:${s.address().port}`));
  servidores.push(s);
});
const responderJSON = (res, codigo, cuerpo) => { res.writeHead(codigo, { "content-type": "application/json" }); res.end(JSON.stringify(cuerpo)); };
const llamadas = { nvidia: 0, openrouter: 0 };
let comoNvidia = "falla", contenidoOR = null;

let tienda, nvidia, openrouter, A;
before(async () => {
  tienda = await levantar((req, res) => responderJSON(res, 200, {
    b: "https://x/", c: [["energia-solar", "Energía Solar Fotovoltaica"], ["iluminacion", "Iluminación"]],
    s: [["paneles-solares", "Paneles Solares", 0], ["inversor-solar", "Inversor Solar", 0], ["reflectores", "Reflectores", 1]],
    p: [["panel-550w", "Panel solar 550W monocristalino", "PAN-550", 0, 0, 505354, "~panel.webp", 0, ""],
      ["inversor-5kw", "Inversor híbrido 5kW", "INV-5", 0, 1, null, "", 0, ""],
      ["reflector-100w", "Reflector LED 100W", "REF-100", 1, 2, 88000, "", 0, ""]],
  }));
  nvidia = await levantar((req, res) => {
    llamadas.nvidia++;
    if (comoNvidia === "falla") return responderJSON(res, 500, { error: "caído" });
    if (comoNvidia === "niega") return responderJSON(res, 200, { choices: [{ finish_reason: "content_filter", message: { content: "" } }] });
    responderJSON(res, 200, { choices: [{ message: { content: '{"texto":"Te sirve este panel.","productos":["panel-550w"]}' } }] });
  });
  openrouter = await levantar((req, res) => {
    llamadas.openrouter++;
    responderJSON(res, 200, { choices: [{ message: { content: contenidoOR } }] });
  });
  Object.assign(process.env, { TIENDA_URL: tienda, ORIGENES: "https://tienda.gestioneselectricas.com", IA_TIMEOUT_MS: "3000" });
  A = await import("../servidor/asistente.mjs");
});
after(() => servidores.forEach((s) => s.close()));

const env = (extra = {}) => ({ NVIDIA_NIM_KEY: "x", NVIDIA_NIM_BASE: nvidia, NVIDIA_NIM_MODELS: "m1", OPENROUTER_API_KEY: "y", OPENROUTER_BASE: openrouter, OPENROUTER_MODELS: "m2", ...extra });
const pregunta = (texto, carrito = []) => ({ mensajes: [{ rol: "cliente", texto }], carrito });

test("NVIDIA caído → responde OpenRouter; sin productos inventados ni precios en el texto", async () => {
  comoNvidia = "falla";
  contenidoOR = 'Claro: {"texto":"Para tu sistema te recomiendo el panel y el inversor. El panel vale $500.000 hoy. Gestiones también lo instala.","productos":["panel-550w","inversor-5kw","panel-inventado"]}';
  const r = await A.responder(pregunta("quiero montar paneles solares en mi casa"), env());
  assert.equal(r.proveedor, "openrouter:m2");
  assert.deepEqual(r.productos.map((p) => p.slug), ["panel-550w", "inversor-5kw"], "solo productos del catálogo");
  assert.equal(r.productos[0].precio, 505354, "el precio sale del catálogo");
  assert.equal(r.productos[1].precio, null, "sin precio: se cotiza");
  assert.doesNotMatch(r.texto, /\$/, "la frase con el precio inventado se quita");
  assert.match(r.texto, /instala/);
  assert.equal(r.servicio?.id, "solar", "panel + inversor ofrece la instalación");
});

test("NVIDIA responde → no se llama a OpenRouter", async () => {
  comoNvidia = "bien";
  const antes = llamadas.openrouter;
  const r = await A.responder(pregunta("panel solar"), env());
  assert.equal(r.proveedor, "nvidia:m1");
  assert.equal(llamadas.openrouter, antes);
  assert.deepEqual(r.productos.map((p) => p.slug), ["panel-550w"]);
});

test("una negativa por política no se esquiva con el otro proveedor", async () => {
  comoNvidia = "niega";
  const antes = llamadas.openrouter;
  const r = await A.responder(pregunta("panel solar"), env());
  assert.equal(llamadas.openrouter, antes);
  assert.equal(r.productos.length, 0);
  assert.match(r.texto, /no te puedo ayudar/);
});

test("JSON roto de un modelo → pasa al siguiente", async () => {
  comoNvidia = "falla";
  contenidoOR = "no es json";
  const r = await A.responder(pregunta("reflector led"), env());
  assert.equal(r.proveedor, "catalogo", "sin respuesta útil de ningún modelo");
  assert.equal(r.productos[0].slug, "reflector-100w", "igual muestra lo del catálogo");
});

test("sin llaves → solo catálogo", async () => {
  const r = await A.responder(pregunta("reflector"), {});
  assert.equal(r.proveedor, "catalogo");
  assert.equal(r.productos[0].slug, "reflector-100w");
});

test("buscar entiende cómo lo pide la gente", async () => {
  const ps = await A.catalogo();
  assert.equal(A.buscar(ps, "una placa para el techo")[0].slug, "panel-550w");
  assert.deepEqual(A.buscar(ps, "receta de arepas"), []);
});

test("HTTP: CORS solo para la tienda, pregunta obligatoria y límite de tamaño", async () => {
  comoNvidia = "bien";
  const base = await new Promise((ok) => { const s = A.servidor(env()).listen(0, "127.0.0.1", () => ok(`http://127.0.0.1:${s.address().port}`)); servidores.push(s); });
  const post = (cuerpo, origen) => fetch(`${base}/api/chispa/chat`, { method: "POST", headers: { "content-type": "application/json", ...(origen ? { origin: origen } : {}) }, body: JSON.stringify(cuerpo) });
  const bien = await post(pregunta("panel"), "https://tienda.gestioneselectricas.com");
  assert.equal(bien.status, 200);
  assert.equal(bien.headers.get("access-control-allow-origin"), "https://tienda.gestioneselectricas.com");
  const ajeno = await post(pregunta("panel"), "https://otro.com");
  assert.equal(ajeno.headers.get("access-control-allow-origin"), null);
  assert.equal((await post({ mensajes: [] })).status, 400);
  assert.equal((await post({ mensajes: [{ rol: "cliente", texto: "x".repeat(30000) }] })).status, 413);
  const salud = await (await fetch(`${base}/api/chispa/salud`)).json();
  assert.deepEqual(salud.proveedores, ["nvidia", "openrouter"]);
});
