// node --test test/  — el asistente sin llaves: tienda, NVIDIA y OpenRouter simulados en puertos locales.
import { test, before, after, beforeEach } from "node:test";
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
beforeEach(() => A.reiniciarDegradados());   // el estado «modelo degradado» es del módulo: cada prueba parte limpia

// Las pruebas históricas parten de NVIDIA primero; el orden por defecto (OpenRouter primero) se prueba aparte, al final.
const env = (extra = {}) => ({ PROVEEDORES: "nvidia,openrouter", NVIDIA_NIM_KEY: "x", NVIDIA_NIM_BASE: nvidia, NVIDIA_NIM_MODELS: "m1", OPENROUTER_API_KEY: "y", OPENROUTER_BASE: openrouter, OPENROUTER_MODELS: "m2", ...extra });
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

test("TRUST_PROXY=1: el límite se cuenta por la última IP de X-Forwarded-For (la de nuestro proxy), no por la IP del proxy ni por lo que escriba el cliente", async () => {
  comoNvidia = "bien";
  const base = await new Promise((ok) => { const s = A.servidor({ ...env(), TRUST_PROXY: "1" }).listen(0, "127.0.0.1", () => ok(`http://127.0.0.1:${s.address().port}`)); servidores.push(s); });
  const post = (xff) => fetch(`${base}/api/chispa/chat`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": xff }, body: JSON.stringify(pregunta("panel")) });
  const codigos = [];
  for (let i = 0; i < 31; i += 1) codigos.push((await post("198.51.100.7, 203.0.113.50")).status);
  assert.equal(codigos[0], 200);
  assert.equal(codigos.at(-1), 429, "la 31.ª pregunta de la misma persona se frena");
  assert.equal((await post("198.51.100.7, 203.0.113.51")).status, 200, "otra persona (otra IP vista por el proxy) no comparte el cupo");
  assert.equal((await post("9.9.9.9, 203.0.113.50")).status, 429, "cambiar lo que escribe el cliente al inicio no libera el cupo");
});

test("sin TRUST_PROXY se ignora X-Forwarded-For: cualquiera podría escribirlo para esquivar el límite", async () => {
  comoNvidia = "bien";
  const base = await new Promise((ok) => { const s = A.servidor(env()).listen(0, "127.0.0.1", () => ok(`http://127.0.0.1:${s.address().port}`)); servidores.push(s); });
  const codigos = [];
  for (let i = 0; i < 45; i += 1) codigos.push((await fetch(`${base}/api/chispa/chat`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `203.0.113.${i + 1}` }, body: JSON.stringify(pregunta("panel")) })).status);
  assert.ok(codigos.includes(429), "con IP distinta en cada petición igual se frena: la IP real es la de la conexión");
});

test("ipDe: solo acepta direcciones con forma de IP en la cabecera confiable", () => {
  const req = (xff) => ({ headers: { "x-forwarded-for": xff }, socket: { remoteAddress: "10.0.0.2" } });
  assert.equal(A.ipDe(req("1.1.1.1, 203.0.113.9"), { TRUST_PROXY: "1" }), "203.0.113.9");
  assert.equal(A.ipDe(req("1.1.1.1, <script>"), { TRUST_PROXY: "1" }), "10.0.0.2");
  assert.equal(A.ipDe(req(""), { TRUST_PROXY: "1" }), "10.0.0.2");
  assert.equal(A.ipDe(req("203.0.113.9"), {}), "10.0.0.2");
});

test("/api/chispa/vivo responde sin consultar el catálogo (healthcheck del contenedor)", async () => {
  const base = await new Promise((ok) => { const s = A.servidor({ ...env(), TIENDA_URL: "http://127.0.0.1:9" }).listen(0, "127.0.0.1", () => ok(`http://127.0.0.1:${s.address().port}`)); servidores.push(s); });
  const r = await fetch(`${base}/api/chispa/vivo`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
});

// ── Modelos lentos: se degradan al final de la fila (se vio a gemma tardar 30 a 45 s mientras gpt-oss contestaba en 1 s) ──
const OK = '{"texto":"Te sirve este panel.","productos":["panel-550w"]}';

test("un modelo que se cuelga pasa al final de la fila: solo la primera pregunta espera su tiempo máximo", async () => {
  const vistos = [];
  const mock = await levantar(async (req, res) => {
    let cuerpo = ""; for await (const t of req) cuerpo += t;
    const modelo = JSON.parse(cuerpo).model; vistos.push(modelo);
    if (modelo === "lento") return;   // no responde nunca: la petición se corta por tiempo
    responderJSON(res, 200, { choices: [{ message: { content: OK } }] });
  });
  const e = { NVIDIA_NIM_KEY: "x", NVIDIA_NIM_BASE: mock, NVIDIA_NIM_MODELS: "lento,rapido", IA_TIMEOUT_MS: "400" };
  let t0 = Date.now();
  const r1 = await A.responder(pregunta("panel solar"), e);
  const primera = Date.now() - t0;
  assert.equal(r1.proveedor, "nvidia:rapido");
  assert.ok(primera >= 400, `la primera pregunta paga la espera del lento (${primera} ms)`);
  t0 = Date.now();
  const r2 = await A.responder(pregunta("panel solar"), e);
  const segunda = Date.now() - t0;
  assert.equal(r2.proveedor, "nvidia:rapido");
  assert.ok(segunda < 300, `la segunda va directo al que responde (${segunda} ms)`);
  assert.deepEqual(vistos, ["lento", "rapido", "rapido"], "la segunda pregunta ni siquiera tocó al modelo lento");
});

test("un modelo que responde error se degrada igual, y al reiniciar vuelve a su lugar", async () => {
  const vistos = [];
  const mock = await levantar(async (req, res) => {
    let cuerpo = ""; for await (const t of req) cuerpo += t;
    const modelo = JSON.parse(cuerpo).model; vistos.push(modelo);
    if (modelo === "roto") return responderJSON(res, 503, { error: "sobrecargado" });
    responderJSON(res, 200, { choices: [{ message: { content: OK } }] });
  });
  const e = { NVIDIA_NIM_KEY: "x", NVIDIA_NIM_BASE: mock, NVIDIA_NIM_MODELS: "roto,bueno" };
  await A.responder(pregunta("panel solar"), e);
  await A.responder(pregunta("panel solar"), e);
  assert.deepEqual(vistos, ["roto", "bueno", "bueno"]);
  A.reiniciarDegradados();
  await A.responder(pregunta("panel solar"), e);
  assert.deepEqual(vistos.slice(3), ["roto", "bueno"], "tras el minuto de penalización se vuelve a intentar con el primero");
});

test("un modelo degradado pasa después de los demás proveedores, no solo de sus hermanos", async () => {
  comoNvidia = "falla";
  contenidoOR = OK;
  assert.equal((await A.responder(pregunta("panel solar"), env())).proveedor, "openrouter:m2");
  comoNvidia = "bien";
  assert.equal((await A.responder(pregunta("panel solar"), env())).proveedor, "openrouter:m2", "NVIDIA sigue degradado durante la penalización");
  A.reiniciarDegradados();
  assert.equal((await A.responder(pregunta("panel solar"), env())).proveedor, "nvidia:m1");
});

test("una negativa por política que llega con HTTP de error tampoco se esquiva con otro modelo", async () => {
  const mock = await levantar((req, res) => responderJSON(res, 400, { error: { code: "content_policy_violation", message: "no" } }));
  const antes = llamadas.openrouter;
  contenidoOR = OK;
  const r = await A.responder(pregunta("panel solar"), { ...env(), NVIDIA_NIM_BASE: mock });
  assert.match(r.proveedor, /^nvidia:/);
  assert.equal(r.productos.length, 0);
  assert.equal(llamadas.openrouter, antes, "no se probó con OpenRouter");
});

test("con TODOS los modelos caídos, solo la primera pregunta espera; las siguientes salen al instante con lo del catálogo", async () => {
  const mock = await levantar(() => {});   // nadie responde nunca
  const e = { NVIDIA_NIM_KEY: "x", NVIDIA_NIM_BASE: mock, NVIDIA_NIM_MODELS: "a,b", IA_TIMEOUT_MS: "300" };
  let t0 = Date.now();
  const r1 = await A.responder(pregunta("panel solar"), e);
  const primera = Date.now() - t0;
  assert.equal(r1.proveedor, "catalogo");
  assert.ok(primera >= 600, `la primera paga el tiempo completo de cada modelo (${primera} ms)`);
  assert.ok(r1.productos.length > 0, "igual se muestra lo encontrado en el catálogo");
  t0 = Date.now();
  const r2 = await A.responder(pregunta("panel solar"), e);
  const segunda = Date.now() - t0;
  assert.equal(r2.proveedor, "catalogo");
  assert.ok(r2.productos.length > 0);
  assert.ok(segunda < 150, `la segunda ni intenta los modelos degradados (${segunda} ms)`);
});

// ── Orden por defecto: OpenRouter primero, NVIDIA de respaldo (decisión del 2026-10-15) ──
test("por defecto OpenRouter va primero y NVIDIA solo si OpenRouter falla", async () => {
  const { PROVEEDORES, ...sinOrden } = env();
  contenidoOR = OK;
  comoNvidia = "bien";
  const antes = llamadas.nvidia;
  const r = await A.responder(pregunta("panel solar"), sinOrden);
  assert.equal(r.proveedor, "openrouter:m2");
  assert.equal(llamadas.nvidia, antes, "NVIDIA no se toca si OpenRouter responde");
  assert.deepEqual(A.proveedores(sinOrden).map((p) => p.nombre), ["openrouter", "nvidia"]);
  const rotoOR = await levantar((req, res) => responderJSON(res, 500, { error: "caído" }));
  const r2 = await A.responder(pregunta("panel solar"), { ...sinOrden, OPENROUTER_BASE: rotoOR });
  assert.equal(r2.proveedor, "nvidia:m1", "con OpenRouter caído responde NVIDIA");
});

test("PROVEEDORES cambia el orden y un proveedor sin llave se omite", () => {
  const base = { NVIDIA_NIM_KEY: "x", OPENROUTER_API_KEY: "y" };
  assert.deepEqual(A.proveedores({ ...base, PROVEEDORES: "nvidia,openrouter" }).map((p) => p.nombre), ["nvidia", "openrouter"]);
  assert.deepEqual(A.proveedores({ ...base, PROVEEDORES: "openrouter" }).map((p) => p.nombre), ["openrouter", "nvidia"], "el que no aparece va al final");
  assert.deepEqual(A.proveedores({ NVIDIA_NIM_KEY: "x" }).map((p) => p.nombre), ["nvidia"]);
  assert.deepEqual(A.proveedores({}), []);
});

// ── La tienda (servidor) se identifica con CHISPA_KEY y pasa la IP real de la persona ──
test("ipDe: con la llave correcta se toma X-Client-IP; sin ella o con otra, se ignora", () => {
  const req = (h) => ({ headers: h, socket: { remoteAddress: "10.0.0.2" } });
  const env = { CHISPA_KEY: "llave-compartida-de-prueba", TRUST_PROXY: "1" };
  assert.equal(A.ipDe(req({ "x-chispa-key": "llave-compartida-de-prueba", "x-client-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1, 76.76.21.1" }), env), "203.0.113.9");
  assert.equal(A.ipDe(req({ "x-chispa-key": "otra-llave-distinta-xxxx", "x-client-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1, 76.76.21.1" }), env), "76.76.21.1", "llave equivocada: se ignora X-Client-IP y rige el proxy");
  assert.equal(A.ipDe(req({ "x-client-ip": "203.0.113.9" }), env), "10.0.0.2", "sin llave no se confía en X-Client-IP");
  assert.equal(A.ipDe(req({ "x-chispa-key": "llave-compartida-de-prueba", "x-client-ip": "<script>" }), env), "10.0.0.2", "una IP con forma rara no se acepta");
  assert.equal(A.ipDe(req({ "x-chispa-key": "x", "x-client-ip": "203.0.113.9" }), {}), "10.0.0.2", "sin CHISPA_KEY configurada nunca se confía");
});

test("con CHISPA_KEY el límite es por la IP real de cada persona, aunque todas lleguen desde la misma IP de la tienda", async () => {
  comoNvidia = "bien";
  const base = await new Promise((ok) => { const s = A.servidor({ ...env(), CHISPA_KEY: "llave-de-prueba-1234" }).listen(0, "127.0.0.1", () => ok(`http://127.0.0.1:${s.address().port}`)); servidores.push(s); });
  const post = (ip) => fetch(`${base}/api/chispa/chat`, { method: "POST", headers: { "content-type": "application/json", "x-chispa-key": "llave-de-prueba-1234", "x-client-ip": ip }, body: JSON.stringify(pregunta("panel")) });
  const codigos = [];
  for (let i = 0; i < 31; i += 1) codigos.push((await post("203.0.113.77")).status);
  assert.equal(codigos.at(-1), 429, "la persona 77 se pasó de 30 por minuto");
  assert.equal((await post("203.0.113.78")).status, 200, "la persona 78, desde la misma IP de la tienda, no queda bloqueada");
});

// ── Producción 15-oct: «tuberias» y «cables azules» no encontraban nada; el bot decía «te recomiendo estos» sin tarjetas; el técnico se repetía ──
const CATALOGO_REAL = [
  { slug: "tubo-pvc-1-2", nombre: "Tubo Pvc 1/2\"", codigo: "T1", categoria: "Tubería Conduit PVC", sub: "", precio: 8000 },
  { slug: "tubo-imc-1", nombre: "Tubo IMC 1\" x 3Mts", codigo: "T2", categoria: "Tubería Metálica e IMC", sub: "", precio: 30000 },
  { slug: "cable-fv-6", nombre: "Cable Fotovoltaico 6Mm2", codigo: "C1", categoria: "Energía Solar Fotovoltaica", sub: "", precio: 4000 },
  { slug: "cable-red-2x1", nombre: "Cable Red Trenzada 2X1/0+1/0", codigo: "C2", categoria: "Baja, Media y Alta Tensión", sub: "", precio: 9000 },
  { slug: "interruptor-dimmer", nombre: "INTERRUPTOR DIMMER", codigo: "I1", categoria: "Domótica", sub: "", precio: 50000 },
  { slug: "medidor-tri", nombre: "Medidor trifasico", codigo: "M1", categoria: "Medidores", sub: "", precio: 400000 },
  { slug: "trafo-tri-15", nombre: "TRANSFORMADOR TRIFASICO 15 KVA", codigo: "TR1", categoria: "Transformadores", sub: "", precio: null },
];
const slugs = (q) => A.buscar(CATALOGO_REAL, q).map((p) => p.slug);

test("buscar entiende plurales: «tuberias», «cables», «interruptores» encuentran lo mismo que en singular", () => {
  assert.deepEqual(slugs("tuberias").sort(), slugs("tuberia").sort());
  assert.ok(slugs("tuberias").includes("tubo-pvc-1-2") && slugs("tuberias").includes("tubo-imc-1"), "las dos tuberías del catálogo");
  assert.ok(slugs("cables").includes("cable-fv-6") && slugs("cables").includes("cable-red-2x1"));
  assert.ok(slugs("interruptores").includes("interruptor-dimmer"));
  assert.ok(slugs("Necesito TUBERÍAS para mi proyecto").includes("tubo-pvc-1-2"), "con tilde, mayúsculas y relleno");
});

test("una palabra que el catálogo no conoce (un color) no deja la búsqueda sin resultados", () => {
  const r = slugs("cables azules");
  assert.ok(r.includes("cable-fv-6") && r.includes("cable-red-2x1"), "muestra los cables aunque no haya color en el catálogo");
  assert.equal(slugs("xyzzy plugh").length, 0, "lo que no existe sigue sin resultados");
});

test("con plural y singular a la vez, «medidores trifasicos» pone primero el medidor, no el transformador", () => {
  assert.equal(slugs("medidores trifasicos")[0], "medidor-tri");
});

test("si el modelo dice «te recomiendo estos» pero no devuelve slugs válidos, se muestran los que coinciden con lo que se pidió", async () => {
  comoNvidia = "falla";
  contenidoOR = '{"texto":"Entendido. Te recomiendo estos productos para tu proyecto.","productos":[]}';
  const r = await A.responder(pregunta("necesito paneles"), env());
  assert.ok(r.productos.length >= 1, "no se queda sin tarjetas");
  assert.equal(r.productos[0].slug, "panel-550w");
  contenidoOR = '{"texto":"Entendido. Te recomiendo estos productos.","productos":["Panel-550W "]}';
  const r2 = await A.responder(pregunta("necesito paneles"), env());
  assert.deepEqual(r2.productos.map((p) => p.slug), ["panel-550w"], "el slug con otra capitalización o espacios sí se resuelve");
});

test("si el modelo solo pregunta pero hay productos que coinciden, se muestran (recomendar primero, preguntar después); si dice que no los tiene, no se inventan", async () => {
  comoNvidia = "falla";
  contenidoOR = '{"texto":"¿Para qué voltaje lo necesitas?","productos":[]}';
  const r = await A.responder(pregunta("necesito paneles"), env());
  assert.equal(r.productos[0]?.slug, "panel-550w", "pregunta de aclaración + coincidencia → tarjeta (el panel primero)");
  contenidoOR = '{"texto":"Lo siento, no tenemos eso en el catálogo.","productos":[]}';
  assert.equal((await A.responder(pregunta("necesito paneles"), env())).productos.length, 0, "«no tenemos» se respeta");
  contenidoOR = '{"texto":"¿Para qué voltaje lo necesitas?","productos":[]}';
  assert.equal((await A.responder(pregunta("xyzzy plugh"), env())).productos.length, 0, "sin coincidencias no hay tarjetas");
});

test("el técnico no se repite por lo que ya hay en el carrito: solo si se habla de instalar o si lo que se muestra lo pide", async () => {
  comoNvidia = "falla";
  const carrito = [{ nombre: "Panel solar 550W monocristalino", categoria: "Energía Solar Fotovoltaica", cantidad: 4, codigo: "PAN-550" }, { nombre: "Inversor híbrido 5kW", categoria: "Energía Solar Fotovoltaica", cantidad: 1, codigo: "INV-5" }];
  contenidoOR = '{"texto":"Lo siento, no tenemos eso.","productos":[]}';
  const sinHablar = await A.responder(pregunta("tuberias", carrito), env());
  assert.equal(sinHablar.servicio, null, "pedir tuberías con paneles en el carrito no vuelve a ofrecer la instalación solar");
  const hablando = await A.responder(pregunta("¿quién me instala todo esto?", carrito), env());
  assert.equal(hablando.servicio?.id, "solar", "si pregunta por la instalación, el carrito sí cuenta");
  contenidoOR = '{"texto":"Te recomiendo estos.","productos":["panel-550w","inversor-5kw"]}';
  const mostrando = await A.responder(pregunta("paneles e inversor"), env());
  assert.equal(mostrando.servicio?.id, "solar", "lo que se muestra ahora sigue ofreciendo la instalación");
});
