/*
 * Chispa técnico — Gestiones Eléctricas.
 *
 * Mira el carrito de tienda.gestioneselectricas.com y, cuando lo que lleva la persona pide una instalación
 * (paneles + inversor, un transformador, tablero + tubería…), Chispa se asoma al borde de una tarjeta y le
 * ofrece un técnico de Gestiones Eléctricas. Si acepta, toma nombre, WhatsApp y ciudad y manda la solicitud.
 *
 * Se pega con una línea, sin tocar el código de la tienda:
 *   <script src="/chispa-tecnico.js" data-endpoint="https://crm…/api/solicitudes" defer></script>
 * Sin data-endpoint, la solicitud sale por WhatsApp al número de la tienda (data-whatsapp lo cambia).
 *
 * La mascota sigue la coreografía de MascotaAsomada de TARGET (target-scale-web) con mano fija: se agarra del
 * borde, respira, parpadea, mira al cursor, se esconde detrás y vuelve a salir; con movimiento reducido, quieta.
 */
(function () {
  "use strict";

  // ── Reglas: qué servicio pide cada combinación ──────────────────────────────────────────────────────────
  // El carrito trae la categoría por nombre («Energía Solar Fotovoltaica»); se compara sin tildes.
  const plano = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const AREAS = {
    solar: /solar/, transformador: /transformador/, tierra: /tierra/, tablero: /tablero|gabinete/,
    tension: /tension/, medidor: /medidor/, luz: /iluminacion/, nema7: /explosion/, domotica: /domotica/,
    fibra: /fibra/, tuberia: /tuberia/, conector: /conector|terminal/,
  };
  const areaDe = (item) => Object.keys(AREAS).find((a) => AREAS[a].test(plano(item.categoria))) || null;

  /** Devuelve el mejor servicio para el carrito, o null si no hay nada que ofrecer. */
  function sugerirServicio(items) {
    const lista = (Array.isArray(items) ? items : []).filter((i) => i && i.nombre);
    const por = {};
    for (const i of lista) { const a = areaDe(i); if (a) (por[a] = por[a] || []).push(i); }
    const tiene = (a) => (por[a] || []).length > 0;
    const nombres = (a) => por[a].map((i) => i.nombre);
    const unidades = (a) => (por[a] || []).reduce((s, i) => s + (Number(i.cantidad) || 1), 0);
    const areas = Object.keys(por);
    const opciones = [];
    const ofrecer = (id, titulo, motivo, fuerza, de) => opciones.push({ id, titulo, motivo, fuerza, productos: de });

    if (tiene("solar")) {
      const n = plano(nombres("solar").join(" "));
      const completo = /inversor/.test(n) && /panel/.test(n);
      if (completo || por.solar.length >= 2) ofrecer("solar", "Instalación del sistema solar",
        completo ? "Llevas paneles e inversor: el sistema queda listo solo si se monta y conecta bien." : "Llevas varias piezas de un sistema solar.",
        3, por.solar);
    }
    if (tiene("transformador")) ofrecer("transformador", "Montaje y puesta en servicio del transformador",
      "Un transformador necesita montaje, pruebas y conexión por personal calificado.", 3, por.transformador);
    if (tiene("nema7")) ofrecer("nema7", "Instalación en áreas clasificadas",
      "El material antiexplosión (NEMA 7) exige una instalación certificada.", 3, por.nema7);
    if (tiene("tablero") && (tiene("tuberia") || tiene("conector") || tiene("tension"))) ofrecer("tablero", "Montaje del tablero y cableado",
      "Llevas tablero y material para canalizar y conectar: te lo dejamos montado.", 3, por.tablero.concat(por.tuberia || [], por.conector || []));
    if (tiene("tierra")) ofrecer("tierra", "Sistema de puesta a tierra con medición",
      "Una puesta a tierra se instala y se mide para saber que protege.", tiene("conector") ? 3 : 2, por.tierra);
    if (tiene("tension")) ofrecer("tension", "Instalación de acometida o red",
      "El material de red y acometida se instala con maniobras seguras.", por.tension.length >= 2 ? 3 : 2, por.tension);
    if (tiene("medidor")) ofrecer("medidor", "Instalación del medidor", "Te instalamos el medidor y dejamos la conexión lista.", 2, por.medidor);
    if (tiene("domotica")) ofrecer("domotica", "Instalación y configuración domótica", "Te dejamos la domótica instalada y funcionando.", 2, por.domotica);
    if (tiene("fibra")) ofrecer("fibra", "Tendido y empalme de fibra óptica", "La fibra se tiende y se empalma con equipo especializado.", 2, por.fibra);
    if (unidades("luz") >= 4) ofrecer("luz", "Instalación de la iluminación", `Llevas ${unidades("luz")} luminarias: te las dejamos instaladas.`, 2, por.luz);
    if (!opciones.length && ["tuberia", "conector", "tablero", "tension", "tierra", "luz"].filter(tiene).length >= 3) ofrecer("obra",
      "Instalación eléctrica completa", "Por lo que llevas, parece una obra: te ayudamos con la instalación.", 2, lista);

    // fuerza 3: casi siempre hace falta un técnico. Fuerza 2: solo si el carrito ya mezcla dos áreas.
    const mejor = opciones.sort((a, b) => b.fuerza - a.fuerza)[0];
    if (!mejor || (mejor.fuerza < 3 && areas.length < 2)) return null;
    return mejor;
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { sugerirServicio };
  if (typeof window === "undefined" || typeof document === "undefined") return;

  // ── Configuración y estado ──────────────────────────────────────────────────────────────────────────────
  const yo = document.currentScript;
  const CONF = {
    endpoint: yo?.dataset.endpoint || "",
    whatsapp: (yo?.dataset.whatsapp || "573018141027").replace(/\D/g, ""),
    carrito: yo?.dataset.carrito || "ge-tienda-carrito-v1",
  };
  const NO = "chispa-tecnico-no";
  const sesion = {
    leer: (k) => { try { return JSON.parse(sessionStorage.getItem(k) || "[]"); } catch { return []; } },
    sumar: (k, v) => { try { sessionStorage.setItem(k, JSON.stringify([...new Set([...sesion.leer(k), v])])); } catch { /* sin sesión: se ofrece igual */ } },
  };
  const leerCarrito = () => { try { const c = JSON.parse(localStorage.getItem(CONF.carrito) || "[]"); return Array.isArray(c) ? c : []; } catch { return []; } };
  const reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── Estilos ─────────────────────────────────────────────────────────────────────────────────────────────
  const css = `
/* una tarjeta más del carrito o del pedido, con aire arriba para que Chispa se asome */
.cht{--cht-lima:#c9e400;--cht-tinta:#111;--cht-fondo:#fff;--cht-borde:#111;--cht-suave:#5b5b52;position:relative;margin:104px 16px 16px;font:inherit;color:var(--cht-tinta)}
.pedido__lineas > .cht{margin:104px 0 8px}
.cht{scroll-margin-top:190px}
.cht form{max-width:560px}
[data-theme=dark] .cht{--cht-fondo:#1a1a17;--cht-tinta:#f4f4ee;--cht-borde:#c9e400;--cht-suave:#b9b9ad}
.cht-card{position:relative;background:var(--cht-fondo);border:2px solid var(--cht-borde);border-radius:20px;padding:18px 18px 16px}
.cht-cerrar{position:absolute;top:8px;right:8px;width:36px;height:36px;border:0;border-radius:50%;background:transparent;color:inherit;font-size:22px;line-height:1;cursor:pointer}
.cht-cerrar:hover{background:rgba(127,127,127,.15)}
.cht-titulo{margin:0 34px 6px 0;font-size:18px;font-weight:800;line-height:1.25}
.cht-texto{margin:0 0 14px;font-size:14px;line-height:1.45;color:var(--cht-suave)}
.cht-acciones{display:flex;gap:8px;flex-wrap:wrap}
.cht-boton{flex:1 1 auto;min-height:44px;padding:10px 16px;border-radius:999px;border:2px solid var(--cht-tinta);background:transparent;color:inherit;font:inherit;font-weight:700;cursor:pointer}
.cht-boton[data-principal]{background:var(--cht-lima);border-color:var(--cht-lima);color:#111}
.cht-boton:focus-visible,.cht-cerrar:focus-visible,.cht input:focus-visible,.cht select:focus-visible{outline:3px solid var(--cht-lima);outline-offset:2px}
.cht form{display:grid;gap:10px}
.cht label{display:grid;gap:4px;font-size:13px;font-weight:700}
.cht input,.cht select{min-height:44px;padding:8px 12px;border:1.5px solid var(--cht-suave);border-radius:12px;background:var(--cht-fondo);color:inherit;font:inherit;font-size:16px}
.cht .cht-permiso{display:flex;gap:8px;align-items:flex-start;font-weight:400;font-size:12px;line-height:1.4;color:var(--cht-suave)}
.cht .cht-permiso input{min-height:0;width:18px;height:18px;margin:1px 0 0;flex:none}
.cht-error{margin:0;font-size:13px;color:#b42318}
[data-theme=dark] .cht-error{color:#ff9b8f}
/* la mascota: cuelga del borde de arriba de la tarjeta, como la de TARGET */
.cht-mascota{position:absolute;bottom:100%;left:var(--mx,24%);width:var(--mw,104px);margin-left:calc(var(--mw,104px) / -2);aspect-ratio:120/100;pointer-events:none;user-select:none}
@media(max-width:600px){.cht-mascota{--mw:84px}}
.cht-escena{position:absolute;inset:0;clip-path:inset(-100% -60% 0 -60%)}
.cht-manos{position:absolute;inset:0}
.cht-salto,.cht-giro,.cht-respira{position:absolute;inset:0;transform-origin:50% 100%}
.cht-respira{animation:cht-respirar 5.5s ease-in-out infinite}
@keyframes cht-respirar{50%{transform:scale(1.015,1.04)}}
.cht-mascota svg{position:absolute;left:0;top:0;width:100%;overflow:visible}
.cht-ojo{transform-box:fill-box;transform-origin:center}
.cht-pupila{translate:calc(var(--ox,0) * 3px) calc(var(--oy,0) * 3px);transition:translate .24s cubic-bezier(.3,.7,.3,1)}
@media(prefers-reduced-motion:reduce){.cht-respira{animation:none}}
`;

  // Chispa en piezas: el rayo con los ojos (se recorta en el borde) y las dos manos que lo agarran por delante.
  const OJO = (x, y) => `<g class="cht-ojo"><circle cx="${x}" cy="${y}" r="10" fill="#fff" stroke="#111" stroke-width="3"/><circle class="cht-pupila" cx="${x}" cy="${y + 1}" r="4.5" fill="#111"/></g>`;
  const CUERPO = `<svg viewBox="0 0 120 140" style="height:140%"><path d="M76 4 22 74h32L40 136l62-86H70L92 4Z" fill="#c9e400" stroke="#111" stroke-width="4" stroke-linejoin="round"/><path d="M98 18l10-6M100 30l12 1" stroke="#ff8a00" stroke-width="4" stroke-linecap="round"/>${OJO(52, 46)}${OJO(73, 43)}</svg>`;
  // cada mano cuelga por delante del borde (y=100): los dedos pasan por encima y terminan redondos abajo
  const MANO = (x) => `<rect x="${x - 10}" y="91" width="20" height="19" rx="8" fill="#c9e400" stroke="#111" stroke-width="3.5"/><path d="M${x - 3.5} 100v7M${x + 3.5} 100v7" stroke="#111" stroke-width="2.5" stroke-linecap="round"/>`;
  const MANOS = `<svg viewBox="0 0 120 140" style="height:140%">${MANO(42)}${MANO(76)}</svg>`;
  const MASCOTA = `<span class="cht-mascota" aria-hidden="true"><span class="cht-escena"><span class="cht-salto"><span class="cht-giro"><span class="cht-respira">${CUERPO}</span></span></span></span><span class="cht-manos"><span class="cht-salto"><span class="cht-respira">${MANOS}</span></span></span></span>`;

  // ── Vida de la mascota (MascotaAsomada de TARGET, con mano fija) ─────────────────────────────────────────
  function darVida(raiz) {
    if (reducido || typeof raiz.animate !== "function") return { celebrar: async () => {}, parar: () => {} };
    const [cuerpo, manos] = raiz.querySelectorAll(".cht-salto");
    const giro = raiz.querySelector(".cht-giro");
    const ojos = [...raiz.querySelectorAll(".cht-ojo")];
    const azar = (a, b) => a + Math.random() * (b - a);
    const tope = (v) => Math.max(-1, Math.min(1, v));
    const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
    const corriendo = new Set();
    let activa = true, ocupada = false, reloj = 0, movido = -Infinity;
    const ultima = { saludo: 0, escondida: performance.now() };
    const animar = (els, cuadros, ms, extra = {}) => Promise.all([].concat(els).map((el) => {
      const a = el.animate(cuadros, { duration: ms, ...extra });
      corriendo.add(a);
      return a.finished.then(() => corriendo.delete(a), () => corriendo.delete(a));
    }));
    // las manos repiten los estirones del cuerpo pero nunca sus traslados: no sueltan el borde
    const sinTraslado = (cs) => cs.map((c) => ({ ...c, transform: String(c.transform || "none").replace(/translateY\([^)]*\)\s*/g, "").trim() || "none" }));
    const mirar = (x, y) => { raiz.style.setProperty("--ox", x.toFixed(2)); raiz.style.setProperty("--oy", y.toFixed(2)); };

    const parpadear = () => animar(ojos, [
      { transform: "scaleY(1)", easing: "cubic-bezier(.5,0,.9,.6)" }, { transform: "scaleY(.08)", offset: 0.4 },
      { transform: "scaleY(.08)", offset: 0.55, easing: "cubic-bezier(.2,.5,.3,1)" }, { transform: "scaleY(1)" }], 220);
    // sin brazo: saluda ladeándose de contento, con los ojos entrecerrados
    const saludar = () => {
      ultima.saludo = performance.now();
      return Promise.all([
        animar(giro, [{ transform: "none" }, { transform: "rotate(-9deg)", offset: 0.2 }, { transform: "rotate(7deg)", offset: 0.45 }, { transform: "rotate(-5deg)", offset: 0.7 }, { transform: "none" }], 1300, { easing: "ease-in-out" }),
        animar(ojos, [{ transform: "scaleY(1)" }, { transform: "scaleY(.55)", offset: 0.15 }, { transform: "scaleY(.55)", offset: 0.85 }, { transform: "scaleY(1)" }], 1300),
      ]);
    };
    const celebrar = () => Promise.all([
      animar(cuerpo, [{ transform: "none" }, { transform: "scale(.94,1.1)", offset: 0.3 }, { transform: "scale(1.05,.95)", offset: 0.62 }, { transform: "none" }], 560),
      animar(manos, sinTraslado([{ transform: "none" }, { transform: "scale(.94,1.1)", offset: 0.3 }, { transform: "scale(1.05,.95)", offset: 0.62 }, { transform: "none" }]), 560),
      animar(ojos, [{ transform: "scaleY(1)" }, { transform: "scaleY(.6)", offset: 0.3 }, { transform: "scaleY(.6)", offset: 0.7 }, { transform: "scaleY(1)" }], 560),
    ]);
    // se agacha detrás del borde, espera ladeándose y vuelve a salir estirado
    const esconderse = async () => {
      ultima.escondida = performance.now();
      const hondo = Math.random() < 0.3 ? 106 : 74, quieta = azar(700, 1400), total = 1500 + quieta;
      const t = (ms) => Math.min(1, ms / total);
      const bajada = [
        { transform: "none", easing: "cubic-bezier(.3,0,.5,1)" },
        { transform: "scale(1.04,.95)", offset: t(190), easing: "cubic-bezier(.55,0,.85,.35)" },
        { transform: `translateY(${hondo}%) scale(.97,1.03)`, offset: t(430), easing: "cubic-bezier(.2,.7,.4,1)" },
        { transform: `translateY(${hondo - 4}%)`, offset: t(560) },
        { transform: `translateY(${hondo - 4}%)`, offset: t(560 + quieta), easing: "cubic-bezier(.25,.6,.35,1)" },
        { transform: "translateY(0) scale(.94,1.09)", offset: t(900 + quieta), easing: "cubic-bezier(.45,0,.55,1)" },
        { transform: "scale(1.05,.95)", offset: t(1120 + quieta), easing: "cubic-bezier(.4,0,.4,1)" },
        { transform: "none" },
      ];
      await Promise.all([
        animar(cuerpo, bajada, total), animar(manos, sinTraslado(bajada), total),
        animar(giro, [{ transform: "none" }, { transform: "none", offset: t(560) }, { transform: "rotate(-5deg)", offset: t(560 + quieta * 0.35) }, { transform: "rotate(4deg)", offset: t(560 + quieta * 0.75) }, { transform: "none", offset: t(560 + quieta) }, { transform: "none" }], total, { easing: "ease-in-out" }),
      ]);
      if (activa) await parpadear();
    };
    const ojear = async () => {
      const [x, y] = [[-1, -0.25], [1, -0.2], [-0.8, 0.45], [0.85, 0.4], [0, -0.9]][Math.floor(Math.random() * 5)];
      mirar(x, y);
      await esperar(azar(700, 1500));
      if (activa && performance.now() - movido > 2500) mirar(0, 0);
    };
    // aparece subiendo desde detrás del borde; las manos ya están agarradas
    const entrar = async () => {
      const subida = [
        { transform: "translateY(106%)", easing: "cubic-bezier(.25,.7,.35,1)" },
        { transform: "translateY(0) scale(.94,1.09)", offset: 0.55, easing: "cubic-bezier(.45,0,.55,1)" },
        { transform: "scale(1.05,.95)", offset: 0.78, easing: "cubic-bezier(.4,0,.4,1)" }, { transform: "none" },
      ];
      await Promise.all([animar(cuerpo, subida, 820), animar(manos, sinTraslado(subida), 820)]);
      if (activa) await saludar();
    };
    const hacer = async (accion) => {
      ocupada = true;
      await accion();
      ocupada = false;
      if (activa) programar(azar(900, 2600));
    };
    const turno = () => {
      if (!activa) return;
      if (document.hidden || ocupada) return programar(1500);
      const ahora = performance.now();
      const opciones = [[parpadear, 5], [ojear, ahora - movido > 2500 ? 3 : 0], [saludar, ahora - ultima.saludo > 11000 ? 2 : 0], [esconderse, ahora - ultima.escondida > 6000 ? 4 : 0]];
      let r = Math.random() * opciones.reduce((s, [, p]) => s + p, 0);
      const [accion] = opciones.find(([, p]) => (r -= p) < 0) || opciones[0];
      void hacer(accion);
    };
    const programar = (ms) => { clearTimeout(reloj); reloj = setTimeout(turno, ms); };
    // con mouse mira al cursor (solo los ojos) y, si se le acerca, saluda
    const alMover = (e) => {
      movido = performance.now();
      const r = raiz.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height * 0.45);
      mirar(tope(dx / Math.max(140, r.width * 1.1)), tope(dy / Math.max(110, r.height * 1.2)));
      if (!ocupada && Math.hypot(dx, dy) < r.width * 0.8 && movido - ultima.saludo > 6000) { clearTimeout(reloj); void hacer(saludar); }
    };
    if (matchMedia("(hover: hover) and (pointer: fine)").matches) addEventListener("pointermove", alMover, { passive: true });
    void hacer(entrar);
    return {
      celebrar: () => (ocupada ? Promise.resolve() : hacer(celebrar)),
      parar: () => { activa = false; clearTimeout(reloj); removeEventListener("pointermove", alMover); corriendo.forEach((a) => a.cancel()); },
    };
  }

  // ── La tarjeta ──────────────────────────────────────────────────────────────────────────────────────────
  let abierta = null;
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function mensajeWhatsApp(servicio, datos, items) {
    const lineas = items.slice(0, 15).map((i) => `• ${i.cantidad || 1} × ${i.nombre}${i.codigo ? ` (${i.codigo})` : ""}`);
    return [`Hola, quiero el servicio de *${servicio.titulo}*.`, `Nombre: ${datos.nombre}`, `Ciudad: ${datos.ciudad}${datos.direccion ? ` — ${datos.direccion}` : ""}`,
      `WhatsApp: ${datos.telefono}`, "", "Lo que llevo en el pedido:", ...lineas].join("\n");
  }

  // va dentro del panel del carrito abierto (carrito) o debajo de la lista de /pedido (lineas)
  function mostrar(servicio, items, { carrito, lineas }) {
    if (abierta) return;
    const raiz = document.createElement("div");
    raiz.className = "cht";
    raiz.setAttribute("role", "region");
    raiz.setAttribute("aria-label", "Chispa te ofrece un técnico");
    raiz.innerHTML = `<div class="cht-card">${MASCOTA}<button type="button" class="cht-cerrar" aria-label="Cerrar">×</button><div class="cht-cuerpo"></div></div>`;
    // dentro de la sección (no como hermana): /pedido es una grilla y una hermana suelta se va al final
    (lineas || carrito.querySelector(".carrito__cuerpo") || carrito).appendChild(raiz);
    const cuerpo = raiz.querySelector(".cht-cuerpo");
    const vida = darVida(raiz.querySelector(".cht-mascota"));
    const cerrar = (no) => { if (no) sesion.sumar(NO, servicio.id); vida.parar(); raiz.remove(); abierta = null; carrito?.removeEventListener("close", alCerrarCarrito); };
    // al cerrar el carrito se va con él (sin contar como «no»); vuelve la próxima vez que lo abra
    const alCerrarCarrito = () => cerrar(false);
    raiz.querySelector(".cht-cerrar").onclick = () => cerrar(true);
    carrito?.addEventListener("close", alCerrarCarrito);
    abierta = raiz;

    const paso1 = () => {
      cuerpo.innerHTML = `<p class="cht-titulo">¿Te lo instalamos?</p><p class="cht-texto">${esc(servicio.motivo)} Gestiones Eléctricas también hace la <strong>${esc(servicio.titulo.toLowerCase())}</strong>.</p>
        <div class="cht-acciones"><button type="button" class="cht-boton" data-principal>Quiero un técnico</button><button type="button" class="cht-boton">Ahora no</button></div>`;
      const [si, no] = cuerpo.querySelectorAll("button");
      si.onclick = paso2;
      no.onclick = () => cerrar(true);
    };

    const paso2 = () => {
      cuerpo.innerHTML = `<p class="cht-titulo">${esc(servicio.titulo)}</p><form novalidate>
        <label>Nombre<input name="nombre" autocomplete="name" required maxlength="80"></label>
        <label>WhatsApp<input name="telefono" type="tel" inputmode="tel" autocomplete="tel" required maxlength="20" placeholder="300 123 4567"></label>
        <label>Ciudad<select name="ciudad" required><option>Barranquilla</option><option>Bogotá</option><option>Medellín</option><option>Otra</option></select></label>
        <label>Barrio o dirección (opcional)<input name="direccion" autocomplete="street-address" maxlength="120"></label>
        <label class="cht-permiso"><input type="checkbox" name="permiso" required> Autorizo a Gestiones Eléctricas a contactarme por WhatsApp o llamada sobre esta solicitud.</label>
        <p class="cht-error" role="alert" hidden></p>
        <button class="cht-boton" data-principal>Pedir el técnico</button></form>`;
      raiz.scrollIntoView({ block: "nearest", behavior: reducido ? "auto" : "smooth" });
      const form = cuerpo.querySelector("form");
      const error = form.querySelector(".cht-error");
      form.nombre.focus({ preventScroll: true });
      form.onsubmit = async (e) => {
        e.preventDefault();
        const datos = Object.fromEntries(new FormData(form));
        const digitos = String(datos.telefono || "").replace(/\D/g, "");
        const falta = !String(datos.nombre || "").trim() ? "Escribe tu nombre." : digitos.length < 7 ? "Revisa el número de WhatsApp." : !datos.permiso ? "Marca la autorización para que te podamos contactar." : "";
        error.hidden = !falta;
        error.textContent = falta;
        if (falta) return;
        datos.telefono = digitos;
        const texto = mensajeWhatsApp(servicio, datos, items);
        const wa = `https://wa.me/${CONF.whatsapp}?text=${encodeURIComponent(texto)}`;
        // sin endpoint, la solicitud sale por WhatsApp (se abre en el mismo clic para que no la bloqueen)
        if (!CONF.endpoint) { window.open(wa, "_blank", "noopener"); return listo(false); }
        const boton = form.querySelector("button");
        boton.disabled = true;
        boton.textContent = "Enviando…";
        try {
          const r = await fetch(CONF.endpoint, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({
              tipo: "solicitud_servicio", servicio: { id: servicio.id, titulo: servicio.titulo },
              contacto: { nombre: datos.nombre.trim(), telefono: digitos, ciudad: datos.ciudad, direccion: (datos.direccion || "").trim() },
              permiso_contacto: true, carrito: items.map((i) => ({ codigo: i.codigo, nombre: i.nombre, cantidad: i.cantidad, categoria: i.categoria })),
              pagina: location.href,
            }),
          });
          if (!r.ok) throw new Error(String(r.status));
          listo(true);
        } catch {
          // no se perdió nada: los datos siguen en el formulario y queda el camino por WhatsApp
          boton.disabled = false;
          boton.textContent = "Pedir el técnico";
          error.hidden = false;
          error.innerHTML = `No pudimos enviarla. <a href="${esc(wa)}" target="_blank" rel="noopener">Mándala por WhatsApp</a>.`;
        }
      };
    };

    const listo = (enviada) => {
      cuerpo.innerHTML = `<p class="cht-titulo">¡Listo!</p><p class="cht-texto">${enviada ? "Recibimos tu solicitud. Un asesor de Gestiones Eléctricas te escribe por WhatsApp para coordinar la visita y el valor del servicio." : "Termina de enviar el mensaje en WhatsApp y un asesor te responde para coordinar la visita."}</p>
        <div class="cht-acciones"><button type="button" class="cht-boton">Seguir comprando</button></div>`;
      cuerpo.querySelector("button").onclick = () => cerrar(false);
      raiz.scrollIntoView({ block: "nearest", behavior: reducido ? "auto" : "smooth" });
      sesion.sumar(NO, servicio.id);
      void vida.celebrar();
    };

    paso1();
  }

  // ── Vigilar el carrito ──────────────────────────────────────────────────────────────────────────────────
  // ponytail: sondeo cada 1,5 s (lee un string de localStorage); si la tienda emite un evento propio, usarlo.
  let antes = "";
  const revisar = () => {
    const crudo = (() => { try { return localStorage.getItem(CONF.carrito) || ""; } catch { return ""; } })();
    const carrito = document.querySelector("dialog.carrito[open]");
    const enPedido = location.pathname.replace(/\/$/, "") === "/pedido";
    const lineas = enPedido ? document.querySelector(".pedido__lineas") : null;
    const clave = crudo + location.pathname + (carrito ? "|carrito" : "") + (lineas ? "|lineas" : "");
    if (clave === antes || abierta) return;
    antes = clave;
    // se ofrece solo donde la persona está mirando su pedido: el carrito abierto o /pedido (nunca encima de la ficha)
    if (!carrito && !lineas) return;
    const items = leerCarrito();
    const servicio = sugerirServicio(items);
    if (!servicio || sesion.leer(NO).includes(servicio.id)) return;
    mostrar(servicio, items, { carrito, lineas });
  };

  const arrancar = () => {
    const estilo = document.createElement("style");
    estilo.textContent = css;
    document.head.appendChild(estilo);
    revisar();
    setInterval(revisar, 1500);
  };
  window.ChispaTecnico = { sugerirServicio, revisar };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar, { once: true });
  else arrancar();
})();
