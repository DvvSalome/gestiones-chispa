// El asistente de la tienda (Chispa): responde en el chat recomendando SOLO productos del catálogo real de
// tienda.gestioneselectricas.com y ofrece el técnico de Gestiones cuando lo que lleva o busca pide instalación.
//
// Modelo: NVIDIA NIM primero (NVIDIA_NIM_KEY) y OpenRouter de respaldo (OPENROUTER_API_KEY), la misma cadena que usa
// el FourG CRM (lib/llm.ts). Si un modelo no responde, tarda o devuelve algo que no sirve, pasa al siguiente; si se
// niega por política, no se busca otro para esquivarla. Si no hay ninguno, igual muestra lo encontrado en el catálogo.
//
// node servidor/asistente.mjs  →  POST /api/chispa/chat   GET /api/chispa/salud   (PORT, por defecto 4547)
import { createServer } from "node:http";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { sugerirServicio } = require("../chispa-tecnico.js");

const TIENDA = (process.env.TIENDA_URL || "https://tienda.gestioneselectricas.com").replace(/\/+$/, "");
const ORIGENES = (process.env.ORIGENES || "https://tienda.gestioneselectricas.com").split(",").map((s) => s.trim());
const TIEMPO = Number(process.env.IA_TIMEOUT_MS || 8000);
const lista = (v, porDefecto) => (v || porDefecto).split(",").map((s) => s.trim()).filter(Boolean);

export function proveedores(env = process.env) {
  return [
    env.NVIDIA_NIM_KEY && { nombre: "nvidia", base: env.NVIDIA_NIM_BASE || "https://integrate.api.nvidia.com/v1", key: env.NVIDIA_NIM_KEY,
      modelos: lista(env.NVIDIA_NIM_MODELS, "google/gemma-4-31b-it,openai/gpt-oss-20b") },
    env.OPENROUTER_API_KEY && { nombre: "openrouter", base: env.OPENROUTER_BASE || "https://openrouter.ai/api/v1", key: env.OPENROUTER_API_KEY,
      modelos: lista(env.OPENROUTER_MODELS, "google/gemini-2.5-flash,openai/gpt-4o-mini") },
  ].filter(Boolean);
}

// ── Catálogo: el índice público de la tienda, en caché 10 minutos ─────────────────────────────────────────
const plano = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
let cache = { hasta: 0, productos: [] };
export async function catalogo() {
  if (Date.now() < cache.hasta && cache.productos.length) return cache.productos;
  const r = await fetch(`${TIENDA}/api/indice-busqueda`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`catálogo ${r.status}`);
  const j = await r.json();
  const productos = j.p.map((p) => ({
    slug: p[0], nombre: p[1], codigo: p[2], categoria: j.c[p[3]]?.[1] || "", sub: p[4] >= 0 ? j.s[p[4]]?.[1] || "" : "",
    precio: p[5] > 0 ? p[5] : null, foto: p[6] ? (p[6].startsWith("~") ? j.b + p[6].slice(1) : p[6]) : null, url: `${TIENDA}/producto/${p[0]}`,
  }));
  cache = { hasta: Date.now() + 600000, productos };
  return productos;
}

// Cómo lo pide la gente → cómo se llama en el catálogo
const SINONIMOS = {
  breaker: "interruptor proteccion breaker", taco: "breaker interruptor", bombillo: "led lampara bombillo", foco: "reflector led lampara",
  placa: "panel solar", paneles: "panel solar", solar: "solar fotovoltaico panel inversor bateria", trafo: "transformador",
  contador: "medidor", tierra: "tierra varilla suelo puesta", spt: "puesta tierra", alambre: "cable", tuberia: "tubo conduit pvc emt imc",
  tubo: "tubo conduit", tablero: "tablero caja gabinete", caja: "caja", poste: "alumbrado publico", luz: "iluminacion led lampara",
  explosion: "nema anti explosion", fibra: "fibra optica red", red: "red trenzada acometida",
};
const VACIAS = new Set("de del la las el los un una unos unas para por con sin que y o en mi mis tu su al lo como necesito quiero busco tienen tienes hay me algo".split(" "));
export function buscar(productos, consulta, cuantos = 12) {
  const palabras = plano(consulta).split(/[^a-z0-9/".-]+/).filter((w) => w.length > 1 && !VACIAS.has(w));
  const terminos = [...new Set(palabras.flatMap((w) => [w, ...(SINONIMOS[w] || "").split(" ")]).filter(Boolean))];
  if (!terminos.length) return [];
  return productos
    .map((p) => {
      const nombre = plano(p.nombre), donde = plano(`${p.sub} ${p.categoria}`);
      const puntos = terminos.reduce((s, t) => s + (nombre.includes(t) ? 2 : 0) + (donde.includes(t) ? 1.5 : 0), 0);
      return { p, puntos: puntos + (p.precio ? 0.1 : 0) };
    })
    .filter((x) => x.puntos >= 1.5)
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, cuantos)
    .map((x) => x.p);
}

// ── El modelo ─────────────────────────────────────────────────────────────────────────────────────────────
const SISTEMA = `Eres Chispa, el asesor virtual de Gestiones Eléctricas (Barranquilla): materiales eléctricos y servicios de ingeniería con norma RETIE.
Reglas:
- Responde en español, cálido y profesional, en 1 a 3 frases cortas.
- Recomienda SOLO productos de la lista CANDIDATOS, por su slug, como máximo 4. Elige los que mejor sirven para lo que pide; si ninguno es exacto, muestra los más cercanos: es mejor enseñar lo más parecido del catálogo que dejar a la persona sin nada.
- Cada candidato trae al final su categoría: si el nombre O la categoría tiene que ver con lo que pide (por ejemplo «Materiales Puesta a Tierra» para una puesta a tierra), el producto sirve y lo recomiendas; no digas que no hay.
- Si hay candidatos relacionados con lo que pide, recomienda SIEMPRE al menos uno, aunque falte algún dato. Si falta un dato clave (voltaje, potencia, calibre, uso), recomienda primero y después haz UNA pregunta corta para afinar. Nunca respondas solo con una pregunta cuando hay candidatos.
- Nunca escribas precios, cantidades de dinero ni promesas de entrega: la tienda muestra el precio en cada tarjeta.
- Si la persona va a instalar algo, dile que Gestiones Eléctricas también hace la instalación.
- Solo si NINGÚN candidato tiene relación con lo que pide, o lo que pide no tiene que ver con electricidad, no recomiendes nada: dilo y ofrece que un asesor le ayude por WhatsApp.
Responde SOLO con JSON: {"texto": "…", "productos": ["slug", …]}`;

// No cambiar de proveedor para eludir una negativa de política (igual que el CRM).
const negado = (j) => {
  const c = j?.choices?.[0];
  return !!c?.message?.refusal || [c?.finish_reason, j?.error?.code, j?.error?.type].some((v) => typeof v === "string" && /^(content_filter|content_policy_violation|safety|prohibited_content)$/i.test(v));
};
const json = (texto) => { const m = String(texto || "").match(/\{[\s\S]*\}/); try { return m ? JSON.parse(m[0]) : null; } catch { return null; } };

/**
 * Un modelo que se cuelga o falla se manda al FINAL de la fila durante un minuto: el proveedor de modelos a veces deja uno minutos sin responder
 * (se vio a gemma tardar 30 a 45 s mientras gpt-oss contestaba en 1 s). Sin esto cada pregunta esperaba el tiempo máximo del lento antes de probar
 * el siguiente (20 a 24 s por respuesta); ahora solo la primera paga esa espera y las demás van directo a un modelo que sí responde.
 * Pasado el minuto se vuelve a intentar con el original. Si todos están degradados se respeta el orden de siempre.
 */
const PENALIZACION_MS = 60_000;
const degradados = new Map();   // "proveedor:modelo" → hasta cuándo (ms)
const estaDegradado = (clave) => (degradados.get(clave) || 0) > Date.now();
export function reiniciarDegradados() { degradados.clear(); }

async function preguntar(mensajes, env) {
  const fila = proveedores(env).flatMap((prov) => prov.modelos.map((modelo) => ({ prov, modelo, clave: `${prov.nombre}:${modelo}` })));
  fila.sort((a, b) => Number(estaDegradado(a.clave)) - Number(estaDegradado(b.clave)));   // estable: lo degradado va después, el resto conserva su orden
  const tiempo = Number(env.IA_TIMEOUT_MS) || TIEMPO;
  for (const { prov, modelo, clave } of fila) {
    const inicio = Date.now();
    try {
      const r = await fetch(`${prov.base}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${prov.key}`, "content-type": "application/json", "HTTP-Referer": TIENDA, "X-Title": "Chispa Gestiones" },
        body: JSON.stringify({ model: modelo, messages: mensajes, temperature: 0.2, max_tokens: 700 }),
        signal: AbortSignal.timeout(tiempo),
      });
      const j = await r.json().catch(() => null);
      if (negado(j)) return { negado: true, proveedor: clave };   // una negativa por política no se esquiva, llegue con el HTTP que llegue
      if (!r.ok) { degradados.set(clave, Date.now() + PENALIZACION_MS); continue; }
      degradados.delete(clave);
      const salida = json(j?.choices?.[0]?.message?.content);
      if (salida && typeof salida.texto === "string" && salida.texto.trim()) return { salida, proveedor: clave, ms: Date.now() - inicio };
    } catch { degradados.set(clave, Date.now() + PENALIZACION_MS); /* cuelgue o red: al siguiente */ }
  }
  return null;
}

/** Una vuelta del chat. mensajes: [{rol: "cliente"|"chispa", texto}]; carrito: el de la tienda (ge-tienda-carrito-v1). */
export async function responder({ mensajes = [], carrito = [] }, env = process.env) {
  const productos = await catalogo();
  const ultima = [...mensajes].reverse().find((m) => m.rol === "cliente")?.texto || "";
  // candidatos: lo que pide ahora, y si no alcanza, lo que venía pidiendo
  let candidatos = buscar(productos, ultima);
  if (candidatos.length < 4) candidatos = [...new Set([...candidatos, ...buscar(productos, mensajes.filter((m) => m.rol === "cliente").map((m) => m.texto).join(" "))])].slice(0, 12);
  const porSlug = new Map(productos.map((p) => [p.slug, p]));
  const lista = candidatos.map((p) => `- ${p.slug} | ${p.nombre} | ${p.sub || p.categoria}${p.precio ? "" : " | se cotiza"}`).join("\n") || "(ninguno)";
  const enCarrito = carrito.map((i) => `- ${i.cantidad || 1} × ${i.nombre}`).join("\n") || "(vacío)";
  const respuesta = await preguntar([
    { role: "system", content: SISTEMA },
    { role: "system", content: `CANDIDATOS:\n${lista}\n\nCARRITO DEL CLIENTE:\n${enCarrito}` },
    ...mensajes.slice(-10).map((m) => ({ role: m.rol === "chispa" ? "assistant" : "user", content: String(m.texto).slice(0, 600) })),
  ], env);

  const elegidos = (respuesta?.salida?.productos || []).filter((s) => candidatos.some((c) => c.slug === s)).slice(0, 4).map((s) => porSlug.get(s));
  let texto = respuesta?.negado
    ? "En eso no te puedo ayudar por aquí. Si es sobre materiales o instalaciones eléctricas, cuéntame qué necesitas."
    : respuesta?.salida?.texto || (candidatos.length ? "Esto es lo que encontré en el catálogo:" : "No encontré eso en el catálogo. Un asesor te ayuda por WhatsApp.");
  // los precios los pone la tienda: una frase con una cifra de dinero se quita
  texto = texto.split(/(?<=[.!?])\s+/).filter((f) => !/\$\s?\d|\d[\d.]*\s?(pesos|cop)\b/i.test(f)).join(" ") || "Esto es lo que encontré en el catálogo:";
  // sin respuesta de ningún modelo se muestra lo del catálogo; si se negó o eligió nada, no se muestra nada
  const mostrar = elegidos.length ? elegidos : respuesta ? [] : candidatos.slice(0, 4);
  const servicio = sugerirServicio([...carrito, ...mostrar.map((p) => ({ nombre: p.nombre, categoria: p.categoria, cantidad: 1, codigo: p.codigo }))]);
  return {
    texto, productos: mostrar.map(({ slug, nombre, precio, foto, url, categoria }) => ({ slug, nombre, precio, foto, url, categoria })),
    servicio: servicio && { id: servicio.id, titulo: servicio.titulo, motivo: servicio.motivo },
    proveedor: respuesta?.proveedor || "catalogo",
  };
}

// ── HTTP ──────────────────────────────────────────────────────────────────────────────────────────────────
const visitas = new Map();
/**
 * IP de quien pregunta, para el límite. Detrás del proxy de Coolify (Traefik) `remoteAddress` es SIEMPRE la del proxy: sin esto todas las personas
 * compartirían un único cupo de 30 preguntas por minuto. Con TRUST_PROXY=1 se toma la ÚLTIMA IP de X-Forwarded-For, la que añade nuestro propio
 * proxy; las anteriores las escribe quien llama y no sirven. Sin TRUST_PROXY (desarrollo, sin proxy) se ignora la cabecera.
 */
const IP = /^[0-9a-fA-F:.]{3,64}$/;
export function ipDe(req, env = process.env) {
  if (env.TRUST_PROXY === "1") {
    const ultima = String(req.headers["x-forwarded-for"] || "").split(",").map((x) => x.trim()).filter(Boolean).at(-1);
    if (ultima && IP.test(ultima)) return ultima;
  }
  return req.socket.remoteAddress;
}
const demasiadas = (ip) => {
  const ahora = Date.now(), v = (visitas.get(ip) || []).filter((t) => ahora - t < 60000);
  v.push(ahora); visitas.set(ip, v);
  return v.length > 30; // ponytail: límite en memoria por IP; con varias instancias, moverlo a Redis o al proxy
};

export function servidor(env = process.env) {
  return createServer(async (req, res) => {
    const origen = req.headers.origin;
    const cabeceras = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", vary: "origin" };
    if (origen && ORIGENES.includes(origen)) Object.assign(cabeceras, { "access-control-allow-origin": origen, "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, GET" });
    const enviar = (codigo, cuerpo) => { res.writeHead(codigo, cabeceras); res.end(JSON.stringify(cuerpo)); };
    try {
      if (req.method === "OPTIONS") return enviar(204, {});
      if (req.method === "GET" && req.url === "/api/chispa/vivo") return enviar(200, { ok: true });   // healthcheck del contenedor: no toca el catálogo ni los modelos
      if (req.method === "GET" && req.url === "/api/chispa/salud") {
        return enviar(200, { ok: true, proveedores: proveedores(env).map((p) => p.nombre), catalogo: (await catalogo()).length });
      }
      if (req.method !== "POST" || req.url !== "/api/chispa/chat") return enviar(404, { error: "no existe" });
      if (demasiadas(ipDe(req, env))) return enviar(429, { error: "Demasiadas preguntas seguidas. Espera un momento." });
      let cuerpo = "";
      for await (const trozo of req) { cuerpo += trozo; if (cuerpo.length > 20000) return enviar(413, { error: "mensaje muy largo" }); }
      const datos = JSON.parse(cuerpo || "{}");
      const mensajes = (Array.isArray(datos.mensajes) ? datos.mensajes : []).slice(-12)
        .filter((m) => m && (m.rol === "cliente" || m.rol === "chispa") && typeof m.texto === "string").map((m) => ({ rol: m.rol, texto: m.texto.slice(0, 600) }));
      const carrito = (Array.isArray(datos.carrito) ? datos.carrito : []).slice(0, 50)
        .filter((i) => i && typeof i.nombre === "string").map((i) => ({ nombre: i.nombre.slice(0, 200), categoria: String(i.categoria || "").slice(0, 80), cantidad: Number(i.cantidad) || 1, codigo: String(i.codigo || "").slice(0, 60) }));
      if (!mensajes.some((m) => m.rol === "cliente")) return enviar(400, { error: "falta la pregunta" });
      enviar(200, await responder({ mensajes, carrito }, env));
    } catch (e) {
      enviar(500, { error: "No pude responder ahora. Escríbenos por WhatsApp." });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const puerto = Number(process.env.PORT || 4547);
  servidor().listen(puerto, () => console.log(`Chispa en http://localhost:${puerto} · proveedores: ${proveedores().map((p) => p.nombre).join(", ") || "ninguno (solo catálogo)"}`));
}
