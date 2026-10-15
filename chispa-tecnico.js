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
 * La mascota se asoma por el borde de la tarjeta, como la de TARGET: el Técnico (rayo con casco) atiende, y el Medidor
 * y la Ingeniera hacen cameo según el caso. Cada uno es una hoja de sprites con una pose por acción (sprites/*-arcilla.webp,
 * ilustración de ChatGPT recortada con sprites/recortar.py); con movimiento reducido no sube ni respira, solo cambia de pose.
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
    sprites: yo?.dataset.sprites || "",
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
  // Los mismos campos, botones y colores de la tienda (DM Sans, lima #c9e400, campos de 48 px con borde de 2 px,
  // botones píldora), en claro y en oscuro, para que se lea como parte de ella.
  const css = `
.cht{--t:#12140a;--fondo:#fff;--borde:#12140a;--campo:#6f7660;--linea:#d3d7c2;--suave:#565c46;--acento:#3b4f00;--lima:#c9e400;--error:#b42318;position:relative;margin:142px 16px 16px;font:inherit;color:var(--t);scroll-margin-top:190px}
[data-theme=dark] .cht{--t:#eef1e2;--fondo:#171a0f;--borde:#c9e400;--campo:#7e856c;--linea:#343a26;--suave:#a5ab93;--acento:#c9e400;--error:#ff9b8f}
.pedido__lineas > .cht{margin:142px 0 8px}
@media(max-width:600px){.cht{margin-top:126px}.pedido__lineas > .cht{margin-top:126px}}
.cht *{box-sizing:border-box}
.cht [hidden]{display:none!important}
.cht-card{position:relative;background:var(--fondo);border:2px solid var(--borde);border-radius:18px;padding:20px}
.cht-cerrar{position:absolute;top:8px;right:8px;width:44px;height:44px;display:grid;place-items:center;border:0;border-radius:50%;background:transparent;color:inherit;cursor:pointer}
.cht-cerrar:hover{background:color-mix(in srgb,var(--t) 8%,transparent)}
.cht-ceja{margin:0 0 4px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--acento)}
.cht-titulo{margin:0 44px 8px 0;font-size:21px;font-weight:800;line-height:1.2;letter-spacing:-.01em}
.cht-titulo:focus{outline:none}
.cht-texto{margin:0 0 14px;font-size:15px;line-height:1.5;color:var(--suave)}
.cht-para{margin:0 0 16px;padding:12px 14px;border-radius:10px;background:color-mix(in srgb,var(--lima) 22%,transparent);font-size:14px;line-height:1.45}
.cht-para ul{margin:4px 0 0;padding:0;list-style:none;color:var(--suave)}
.cht-para li{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.cht-para li::before{content:"· "}
.cht-acciones{display:flex;gap:10px;flex-wrap:wrap}
.cht-boton{flex:1 1 180px;min-height:52px;padding:12px 20px;border-radius:999px;border:2px solid var(--t);background:transparent;color:inherit;font:inherit;font-size:16px;font-weight:700;cursor:pointer}
.cht-boton[data-principal]{background:var(--lima);border-color:#12140a;color:#12140a}
[data-theme=dark] .cht-boton[data-principal]{border-color:var(--lima)}
.cht-boton:disabled{opacity:.6;cursor:progress}
.cht-enlace{margin:12px 0 0;padding:8px 0;border:0;background:none;color:inherit;font:inherit;font-size:14px;font-weight:600;text-align:left;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.cht-nota{margin:10px 0 0;font-size:13px;line-height:1.45;color:var(--suave)}
.cht :focus-visible{outline:3px solid var(--acento);outline-offset:2px}
.cht-pasos{display:flex;align-items:center;gap:6px;margin:0 0 8px;font-size:13px;font-weight:600;color:var(--suave)}
.cht-pasos i{width:28px;height:4px;border-radius:2px;background:var(--linea)}
.cht-pasos i[data-hecho]{background:var(--acento)}
.cht-pasos span{margin-left:4px}
.cht form{display:grid;gap:18px;max-width:560px}
.cht fieldset{margin:0;padding:0;border:0;min-width:0}
.cht legend{padding:0;margin:0 0 8px;font-size:15px;font-weight:700}
.cht legend small,.cht-campo small{font-weight:500;color:var(--suave)}
.cht-chips{display:flex;flex-wrap:wrap;gap:8px}
.cht-chip{position:relative;display:block}
.cht-chip input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.cht-chip span{display:flex;align-items:center;min-height:44px;padding:8px 16px;border:2px solid var(--campo);border-radius:999px;background:var(--fondo);font-size:15px;font-weight:600}
.cht-chip input:checked + span{background:var(--lima);border-color:#12140a;color:#12140a}
.cht-chip input:focus-visible + span{outline:3px solid var(--acento);outline-offset:2px}
.cht-campo{display:grid;gap:6px}
.cht-campo > label{font-size:15px;font-weight:600}
.cht-ayuda{margin:0;font-size:13px;color:var(--suave)}
.cht-input{width:100%;min-height:48px;padding:10px 14px;border:2px solid var(--campo);border-radius:10px;background:var(--fondo);color:inherit;font:inherit;font-size:17px}
.cht-input[aria-invalid=true]{border-color:var(--error)}
.cht-tel{display:flex}
.cht-tel span{display:grid;place-items:center;padding:0 12px;white-space:nowrap;border:2px solid var(--campo);border-right:0;border-radius:10px 0 0 10px;font-weight:700;color:var(--suave)}
.cht-tel .cht-input{border-radius:0 10px 10px 0}
.cht-error{margin:0;font-size:14px;font-weight:600;color:var(--error)}
.cht-error[hidden]{display:none}
.cht-permiso{display:flex;gap:12px;align-items:flex-start;font-size:14px;line-height:1.45;color:var(--suave)}
.cht-permiso input{width:24px;height:24px;margin:0;flex:none;accent-color:var(--acento)}
.cht-resumen{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;margin:0 0 6px;font-size:14px;color:var(--suave)}
.cht-resumen strong{color:var(--t)}
.cht-resumen .cht-enlace{margin:0;padding:4px 0}
.cht-ok{display:flex;gap:12px;align-items:flex-start;margin-right:-8px}
.cht-ok svg{flex:none;margin-top:4px;color:var(--acento)}
/* la mascota de arcilla se asoma por el borde de arriba de la tarjeta, como la de TARGET: su línea del borde (--ay)
   queda sobre el borde de la tarjeta y los dedos cuelgan por delante. Mientras sube o se esconde se recorta en esa línea. */
.cht-mascota{position:absolute;left:var(--mx,22%);bottom:calc(100% - var(--h,120px) * (1 - var(--ay,.8)));width:var(--w,98px);height:var(--h,120px);margin-left:calc(var(--w,98px) * var(--ax,.5) * -1);pointer-events:none;user-select:none;filter:drop-shadow(0 6px 10px rgba(18,20,10,.12))}
.cht-sube{position:absolute;inset:0}
.cht-mascota[data-recorte] .cht-sube{clip-path:inset(-60% -60% calc((1 - var(--ay)) * 100%) -60%)}
.cht-pj{position:absolute;inset:0;background-repeat:no-repeat;background-size:calc(var(--w) * 6) var(--h);transform-origin:calc(var(--ax) * 100%) calc(var(--ay) * 100%);animation:cht-respirar 4.8s ease-in-out infinite}
@keyframes cht-respirar{50%{transform:scale(1.008,1.016)}}
@media(prefers-reduced-motion:reduce){.cht-pj{animation:none}}
`;

  // ── La mascota: personajes de arcilla asomados (estilo TARGET), una pose por acción ───────────────────────
  // El Técnico atiende; el Medidor hace cameo en los servicios de medición y la Ingeniera cuando escribe una persona del
  // equipo. Cada hoja es una fila de 6 cuadros en este orden; ancho/alto son los del cuadro, ax/ay el centro del cuerpo
  // sobre la línea del borde (en fracción) y ver, el alto que se ve por encima del borde de la tarjeta.
  const POSES = ["reposo", "parpadeo", "saludo", "pensar", "senalar", "celebrar"];
  const PJ = {
    tecnico: { ancho: 313, alto: 420, ax: 0.3781, ay: 0.8964, ver: 134 },
    medidor: { ancho: 410, alto: 420, ax: 0.4155, ay: 0.8684, ver: 108 },
    ingeniera: { ancho: 322, alto: 420, ax: 0.5432, ay: 0.9308, ver: 118 },
  };
  const SPRITES = CONF.sprites || new URL("sprites/", yo?.src || location.href).href;
  const MASCOTA = '<span class="cht-mascota" aria-hidden="true"><span class="cht-sube"><span class="cht-pj"></span></span></span>';
  const precargarSprites = () => Object.keys(PJ).forEach((k) => { new Image().src = `${SPRITES}${k}-arcilla.webp`; });

  function crearMascota(caja) {
    const sube = caja.querySelector(".cht-sube"), pj = caja.querySelector(".cht-pj");
    let actual = null, pose = "reposo", turno = 0, vivo = true, parpadeo = 0;
    const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
    // alto de la celda entera: lo visible sobre el borde es ver, y eso es la fracción ay de la celda
    const medida = () => { const d = PJ[actual]; const alto = (d.ver * (innerWidth < 600 ? 0.88 : 1)) / d.ay; return { alto, ancho: (alto * d.ancho) / d.alto }; };
    const poner = (p) => {
      pose = p;
      if (!actual) return;
      pj.style.backgroundPosition = `${-POSES.indexOf(p) * medida().ancho}px 0`;
      if (!reducido) pj.animate([{ translate: "0 3px", scale: ".985" }, { translate: "0 0", scale: "1" }], { duration: 160, easing: "ease-out" });
    };
    const vestir = (k) => {
      actual = k;
      const { alto, ancho } = medida();
      caja.style.setProperty("--w", `${ancho}px`);
      caja.style.setProperty("--h", `${alto}px`);
      caja.style.setProperty("--ax", PJ[k].ax);
      caja.style.setProperty("--ay", PJ[k].ay);
      pj.style.backgroundImage = `url("${SPRITES}${k}-arcilla.webp")`;
    };
    // sube desde detrás del borde o baja a esconderse, recortado en la línea del borde; al llegar arriba se suelta el
    // recorte y aparecen los dedos que cuelgan por delante
    const mover = async (subir, ms) => {
      if (reducido) return;
      const abajo = `translateY(${Math.round(PJ[actual].ay * 100) + 4}%)`;
      caja.dataset.recorte = "";
      await sube.animate([{ transform: subir ? abajo : "none" }, { transform: subir ? "none" : abajo }], { duration: ms, easing: subir ? "cubic-bezier(.2,.8,.2,1)" : "cubic-bezier(.5,0,.8,.4)", fill: "forwards" }).finished.catch(() => {});
      if (subir) delete caja.dataset.recorte;
    };
    // parpadea cada tanto, solo quieto y con la pestaña a la vista
    const programar = () => {
      clearTimeout(parpadeo);
      parpadeo = setTimeout(async () => {
        if (vivo && pose === "reposo" && !document.hidden) { poner("parpadeo"); await esperar(170); if (vivo && pose === "parpadeo") poner("reposo"); }
        if (vivo) programar();
      }, 3500 + Math.random() * 4000);
    };
    if (!reducido) programar();
    return {
      // cambia de personaje si hace falta (el que está se esconde y sube el otro) y corre las poses con su duración
      async mostrar(k, secuencia) {
        const mio = ++turno;
        if (actual && actual !== k) { await mover(false, 280); if (mio !== turno) return; }
        if (actual !== k) { vestir(k); poner(secuencia[0][0]); await mover(true, 620); }
        for (const [p, ms] of secuencia) {
          if (!vivo || mio !== turno) return;
          poner(p);
          if (ms) await esperar(reducido ? ms / 2 : ms);
        }
      },
      pose: (p) => { turno++; poner(p); },
      parar: () => { vivo = false; turno++; clearTimeout(parpadeo); },
    };
  }

  // ── La tarjeta ──────────────────────────────────────────────────────────────────────────────────────────
  let abierta = null;
  const PEDIDO = "chispa-tecnico-pedido", BORRADOR = "chispa-tecnico-borrador", MARCA = "[Servicio técnico]";
  const guardado = {
    leer: (k) => { try { return JSON.parse(sessionStorage.getItem(k) || "null"); } catch { return null; } },
    poner: (k, v) => { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* sin sesión: se pierde al recargar, nada más */ } },
  };
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const QUE = ["Instalación", "Revisión o mantenimiento", "Solo asesoría"];
  const CUANDO = ["Lo antes posible", "Esta semana", "Este mes", "Solo estoy cotizando"];
  const CIUDADES = ["Barranquilla", "Bogotá", "Medellín", "Otra"];
  const X = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
  const LISTO = '<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="currentColor"/><path d="m7 12.5 3.2 3.2L17 9" fill="none" style="stroke:var(--fondo)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  // Celular colombiano: 10 dígitos que empiezan por 3. Acepta +57 pegado y lo quita.
  const soloCelular = (t) => { let d = String(t || "").replace(/\D/g, ""); if (d.length === 12 && d.startsWith("57")) d = d.slice(2); return d.slice(0, 10); };
  const conEspacios = (d) => [d.slice(0, 3), d.slice(3, 6), d.slice(6)].filter(Boolean).join(" ");
  const celularValido = (d) => /^3\d{9}$/.test(d);
  // para la nota del asesor van las referencias (cortas y exactas); los nombres van en la tarjeta
  const paraQue = (servicio) => [...new Set(servicio.productos.map((p) => p.codigo || p.nombre))].slice(0, 8).join(", ");
  const listaProductos = (servicio) => {
    const n = [...new Set(servicio.productos.map((p) => p.nombre))];
    const lis = n.slice(0, 3).map((x) => `<li title="${esc(x)}">${esc(x)}</li>`).join("");
    return `<ul>${lis}${n.length > 3 ? `<li>y ${n.length - 3} más</li>` : ""}</ul>`;
  };
  const lineaNota = (p) => `${MARCA} Quiero cotizar: ${p.titulo}${p.cuando ? ` (${p.cuando.toLowerCase()})` : ""}. Referencias: ${p.para}.`;

  // La nota del formulario de /pedido es de React: se escribe con el setter nativo y un «input» para que la guarde
  // en su estado. Solo se toca la línea de la marca; lo que la persona escribió queda igual.
  function escribirNota(linea) {
    const ta = document.querySelector('.pedido__form textarea[name="nota"]');
    if (!ta) return;
    notasPuestas.add(ta);
    const resto = ta.value.split("\n").filter((l) => !l.startsWith(MARCA)).join("\n").trim();
    let valor = linea ? (resto ? `${resto}\n${linea}` : linea) : resto;
    if (ta.maxLength > 0) valor = valor.slice(0, ta.maxLength);
    if (valor === ta.value) return;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(ta, valor);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }
  // Una vez por campo: si la persona borra la línea a mano, se respeta; si React lo vuelve a montar, se repone.
  const notasPuestas = new WeakSet();
  function reponerNota() {
    const ta = document.querySelector('.pedido__form textarea[name="nota"]');
    const p = guardado.leer(PEDIDO);
    if (ta && p && !notasPuestas.has(ta)) escribirNota(lineaNota(p));
  }

  // En /pedido no se le vuelve a pedir a la persona lo que ya escribió en «Tus datos».
  function datosDelPedido() {
    const f = document.querySelector(".pedido__form");
    const v = (n) => (f?.querySelector(`[name="${n}"]`)?.value || "").trim();
    return { nombre: v("nombre"), telefono: soloCelular(v("telefono")), ciudad: v("ciudad"), direccion: v("direccion") };
  }

  function mensajeWhatsApp(servicio, b, items) {
    const lineas = items.slice(0, 15).map((i) => `• ${i.cantidad || 1} × ${i.nombre}${i.codigo ? ` (${i.codigo})` : ""}`);
    return [`Hola, quiero cotizar: *${servicio.titulo}*.`, `Necesito: ${b.que} · ${b.cuando}`, `Nombre: ${b.nombre}`,
      `Ciudad: ${b.ciudad === "Otra" ? b.otra : b.ciudad}${b.direccion ? ` — ${b.direccion}` : ""}`, `WhatsApp: ${conEspacios(b.telefono)}`,
      ...(lineas.length ? ["", "Lo que llevo en el pedido:", ...lineas] : [])].join("\n");
  }

  // va dentro del panel del carrito abierto (carrito) o debajo de la lista de /pedido (lineas)
  function mostrar(servicio, { carrito, lineas }) {
    if (abierta) return;
    const uid = `cht${Math.random().toString(36).slice(2, 7)}`;
    const enPedido = !!lineas;
    const raiz = document.createElement("div");
    raiz.className = "cht";
    raiz.dataset.servicio = servicio.id;
    raiz.setAttribute("role", "region");
    raiz.setAttribute("aria-label", "Servicio técnico de Gestiones Eléctricas");
    raiz.innerHTML = `<div class="cht-card">${MASCOTA}<button type="button" class="cht-cerrar" aria-label="Cerrar">${X}</button><div class="cht-cuerpo"></div></div>`;
    // dentro de la sección (no como hermana): /pedido es una grilla y una hermana suelta se va al final
    (lineas || carrito.querySelector(".carrito__cuerpo") || carrito).appendChild(raiz);
    const cuerpo = raiz.querySelector(".cht-cuerpo");
    const masc = crearMascota(raiz.querySelector(".cht-mascota"));
    precargarSprites();
    // el Medidor hace cameo en los servicios que se miden; el resto lo atiende el Técnico
    const quien = ["medidor", "tierra", "transformador"].includes(servicio.id) ? "medidor" : "tecnico";
    const para = paraQue(servicio);

    // el borrador vive en la sesión: si cierra el carrito a mitad, al volver sigue donde iba
    const b = Object.assign({ vista: "", que: QUE[0], cuando: "", ciudad: "", otra: "", nombre: "", telefono: "", direccion: "" }, guardado.leer(BORRADOR));
    const precargar = () => {
      if (!enPedido) return;
      const d = datosDelPedido();
      for (const k of ["nombre", "telefono", "direccion"]) if (!b[k] && d[k]) b[k] = d[k];
      if (!b.ciudad && d.ciudad) { b.ciudad = CIUDADES.find((c) => plano(c) === plano(d.ciudad)) || "Otra"; if (b.ciudad === "Otra") b.otra = d.ciudad; }
    };
    precargar();
    const guardar = () => guardado.poner(BORRADOR, b);

    const alCerrarCarrito = () => cerrar(false);
    const cerrar = (no) => {
      if (no) sesion.sumar(NO, servicio.id);
      masc.parar();
      raiz.remove();
      abierta = null;
      carrito?.removeEventListener("close", alCerrarCarrito);
    };
    // al cerrar el carrito se va con él (sin contar como «no»); vuelve la próxima vez que lo abra
    carrito?.addEventListener("close", alCerrarCarrito);
    raiz.querySelector(".cht-cerrar").onclick = () => cerrar(true);
    raiz.cerrar = cerrar;
    abierta = raiz;

    // pinta una vista; si viene de un clic de la persona, le lleva el foco al título y la deja a la vista
    const pintar = (html, delClic) => {
      cuerpo.innerHTML = html;
      if (!delClic) return;
      cuerpo.querySelector(".cht-titulo")?.focus({ preventScroll: true });
      raiz.scrollIntoView({ block: "nearest", behavior: reducido ? "auto" : "smooth" });
    };
    const chips = (campo, opciones, actual) => opciones.map((o) =>
      `<label class="cht-chip"><input type="radio" name="${uid}-${campo}" data-campo="${campo}" value="${esc(o)}"${o === actual ? " checked" : ""}><span>${esc(o)}</span></label>`).join("");
    const error = (k) => `<p class="cht-error" id="${uid}-e-${k}" data-error="${k}" hidden></p>`;
    const pasos = (n) => `<p class="cht-pasos" aria-label="Paso ${n} de 2"><i data-hecho></i><i${n === 2 ? " data-hecho" : ""}></i><span aria-hidden="true">Paso ${n} de 2</span></p>`;
    const ciudad = () => (b.ciudad === "Otra" ? b.otra.trim() || "Otra ciudad" : b.ciudad);

    const vistas = {
      oferta: (delClic) => (void masc.mostrar(quien, [["saludo", 1400], ["senalar", 1800], ["reposo", 0]]), pintar(`<p class="cht-ceja">Servicio técnico</p>
        <h3 class="cht-titulo" tabindex="-1">¿Te lo instalamos?</h3>
        <p class="cht-texto">${esc(servicio.motivo)}</p>
        <div class="cht-para"><strong>${esc(servicio.titulo)}</strong>${listaProductos(servicio)}</div>
        <div class="cht-acciones">
          <button type="button" class="cht-boton" data-principal data-accion="agregar">${enPedido ? "Sí, agrégala a mi pedido" : "Sí, la quiero en mi pedido"}</button>
          <button type="button" class="cht-boton" data-accion="no">Ahora no</button>
        </div>
        <button type="button" class="cht-enlace" data-accion="solo">¿Solo necesitas el técnico, sin comprar? Pídelo aquí</button>
        <p class="cht-nota">Con el respaldo de ingeniería de Gestiones Eléctricas. Pedir la cotización no te compromete a nada.</p>`, delClic)),

      agregada: (delClic) => {
        void masc.mostrar(quien, delClic ? [["celebrar", 1600], ["reposo", 0]] : [["saludo", 1200], ["reposo", 0]]);
        const p = guardado.leer(PEDIDO) || {};
        pintar(`<div class="cht-ok">${LISTO}<div><p class="cht-ceja">Servicio técnico</p>
          <h3 class="cht-titulo" tabindex="-1">Instalación agregada a tu pedido</h3></div></div>
          <p class="cht-texto">${enPedido
            ? "Quedó escrita en la nota de tu pedido. Al enviarlo, el asesor te cotiza también la instalación."
            : "La dejamos escrita en la nota de tu pedido y el asesor te la cotiza junto con los materiales."}</p>
          ${enPedido ? `<fieldset><legend>¿Para cuándo la necesitas? <small>(opcional)</small></legend><div class="cht-chips">${chips("cuandoPedido", CUANDO, p.cuando || "")}</div></fieldset>` : ""}
          <button type="button" class="cht-enlace" data-accion="quitar">Quitar la instalación</button>`, delClic);
      },

      trabajo: (delClic) => (void masc.mostrar("tecnico", [["reposo", 0]]), pintar(`${pasos(1)}<h3 class="cht-titulo" tabindex="-1">Cuéntanos del trabajo</h3>
        <form data-paso="1" novalidate>
          <fieldset><legend>¿Qué necesitas?</legend><div class="cht-chips">${chips("que", QUE, b.que)}</div></fieldset>
          <fieldset aria-describedby="${uid}-e-cuando"><legend>¿Para cuándo?</legend><div class="cht-chips">${chips("cuando", CUANDO, b.cuando)}</div>${error("cuando")}</fieldset>
          <fieldset aria-describedby="${uid}-e-ciudad"><legend>¿En qué ciudad?</legend><div class="cht-chips">${chips("ciudad", CIUDADES, b.ciudad)}</div>
            <div class="cht-campo" data-otra${b.ciudad === "Otra" ? "" : " hidden"} style="margin-top:10px"><label for="${uid}-otra">¿Cuál ciudad?</label>
              <input class="cht-input" id="${uid}-otra" data-campo="otra" value="${esc(b.otra)}" autocomplete="address-level2" maxlength="60" aria-describedby="${uid}-e-ciudad"></div>
            ${error("ciudad")}</fieldset>
          <div class="cht-acciones"><button class="cht-boton" data-principal>Continuar</button></div>
        </form>
        <button type="button" class="cht-enlace" data-accion="volver">Volver</button>`, delClic)),

      contacto: (delClic) => (void masc.mostrar("ingeniera", [["saludo", 1400], ["reposo", 0]]), pintar(`${pasos(2)}<h3 class="cht-titulo" tabindex="-1">¿A quién le escribimos?</h3>
        <p class="cht-resumen"><span><strong>${esc(b.que)}</strong> · ${esc(b.cuando)} · ${esc(ciudad())}</span><button type="button" class="cht-enlace" data-accion="cambiar">Cambiar</button></p>
        <form data-paso="2" novalidate>
          <div class="cht-campo"><label for="${uid}-nombre">Nombre</label>
            <input class="cht-input" id="${uid}-nombre" data-campo="nombre" value="${esc(b.nombre)}" autocomplete="name" maxlength="80" enterkeyhint="next" aria-describedby="${uid}-e-nombre">${error("nombre")}</div>
          <div class="cht-campo"><label for="${uid}-tel">Celular con WhatsApp</label>
            <div class="cht-tel"><span aria-hidden="true">+57</span><input class="cht-input" id="${uid}-tel" data-campo="telefono" type="tel" inputmode="numeric" autocomplete="tel-national" placeholder="300 123 4567" value="${esc(conEspacios(b.telefono))}" enterkeyhint="next" aria-describedby="${uid}-a-tel ${uid}-e-telefono"></div>
            <p class="cht-ayuda" id="${uid}-a-tel">Por ahí te escribe el asesor para coordinar la visita.</p>${error("telefono")}</div>
          <div class="cht-campo"><label for="${uid}-dir">Barrio o dirección <small>(opcional)</small></label>
            <input class="cht-input" id="${uid}-dir" data-campo="direccion" value="${esc(b.direccion)}" autocomplete="street-address" maxlength="120" enterkeyhint="done"></div>
          <div><label class="cht-permiso"><input type="checkbox" data-campo="permiso" aria-describedby="${uid}-e-permiso"> Autorizo a Gestiones Eléctricas a contactarme por WhatsApp o llamada sobre esta solicitud.</label>${error("permiso")}</div>
          ${error("envio")}
          <div class="cht-acciones"><button class="cht-boton" data-principal>Pedir el técnico</button></div>
        </form>`, delClic)),

      listo: (enviada) => (void masc.mostrar("ingeniera", [["celebrar", 1800], ["reposo", 0]]), pintar(`<div class="cht-ok">${LISTO}<div><p class="cht-ceja">Solicitud ${enviada ? "recibida" : "lista"}</p>
        <h3 class="cht-titulo" tabindex="-1">¡Listo, ${esc(b.nombre.trim().split(/\s+/)[0])}!</h3></div></div>
        <p class="cht-texto">${enviada
          ? `Un asesor de Gestiones Eléctricas te escribe al ${esc(conEspacios(b.telefono))} por WhatsApp para coordinar la visita y el valor del servicio.`
          : "Termina de enviar el mensaje en WhatsApp y un asesor te responde para coordinar la visita y el valor del servicio."}</p>
        <div class="cht-acciones"><button type="button" class="cht-boton" data-accion="seguir">Seguir comprando</button></div>`, true)),
    };
    const ir = (vista, delClic = true) => { b.vista = vista; precargar(); guardar(); vistas[vista](delClic); };

    // errores en línea: cada uno debajo de su campo, con aria-invalid; «solo» limita a un campo (al salir de él)
    const validar = (form, solo) => {
      const e = {};
      if (form.dataset.paso === "1") {
        if (!b.cuando) e.cuando = "Elige para cuándo lo necesitas.";
        if (!b.ciudad) e.ciudad = "Elige la ciudad.";
        else if (b.ciudad === "Otra" && !b.otra.trim()) e.ciudad = "Escribe la ciudad.";
      } else {
        if (!b.nombre.trim()) e.nombre = "Escribe tu nombre.";
        if (!celularValido(b.telefono)) e.telefono = b.telefono ? "Revisa el número: son 10 dígitos y empieza por 3." : "Escribe tu celular.";
        if (!form.querySelector('[data-campo="permiso"]').checked) e.permiso = "Marca la autorización para poder escribirte.";
      }
      for (const nodo of form.querySelectorAll("[data-error]")) {
        const k = nodo.dataset.error;
        if (k === "envio" || (solo && k !== solo)) continue;
        nodo.textContent = e[k] || "";
        nodo.hidden = !e[k];
        const campo = form.querySelector(`[data-campo="${k}"]:not([type=radio])`);
        if (campo) campo.setAttribute("aria-invalid", e[k] ? "true" : "false");
      }
      return e;
    };

    cuerpo.addEventListener("click", (ev) => {
      const accion = ev.target.closest("[data-accion]")?.dataset.accion;
      if (!accion) return;
      if (accion === "agregar") {
        guardado.poner(PEDIDO, { id: servicio.id, titulo: servicio.titulo, para, cuando: "" });
        if (enPedido) escribirNota(lineaNota(guardado.leer(PEDIDO)));
        ir("agregada");
      } else if (accion === "quitar") {
        guardado.poner(PEDIDO, null);
        if (enPedido) escribirNota(null);
        ir("oferta");
      } else if (accion === "no") cerrar(true);
      else if (accion === "solo" || accion === "cambiar") ir("trabajo");
      else if (accion === "volver") ir("oferta");
      else if (accion === "seguir") cerrar(false);
    });

    cuerpo.addEventListener("input", (ev) => {
      const campo = ev.target.dataset.campo;
      if (!campo || campo === "permiso") return;
      if (campo === "cuandoPedido") return;
      if (campo === "telefono") {
        b.telefono = soloCelular(ev.target.value);
        ev.target.value = conEspacios(b.telefono);
      } else b[campo] = ev.target.value;
      guardar();
      const form = ev.target.form;
      // si el campo ya mostraba un error, se revisa mientras escribe para quitarlo apenas quede bien
      const conError = campo === "otra" ? "ciudad" : campo;
      if (form && !form.querySelector(`[data-error="${conError}"]`)?.hidden) validar(form, conError);
    });

    cuerpo.addEventListener("change", (ev) => {
      const campo = ev.target.dataset.campo;
      if (ev.target.type !== "radio" && campo !== "permiso") return;
      if (campo === "cuandoPedido") {
        const p = guardado.leer(PEDIDO);
        if (!p) return;
        p.cuando = ev.target.value === "Solo estoy cotizando" ? "" : ev.target.value;
        guardado.poner(PEDIDO, p);
        if (enPedido) escribirNota(lineaNota(p));
        return;
      }
      if (campo === "permiso") { validar(ev.target.form, "permiso"); return; }
      b[campo] = ev.target.value;
      guardar();
      if (campo === "ciudad") {
        const otra = cuerpo.querySelector("[data-otra]");
        otra.hidden = b.ciudad !== "Otra";
        if (!otra.hidden) otra.querySelector("input").focus();
      }
      const nodo = ev.target.form?.querySelector(`[data-error="${campo}"]`);
      if (nodo && !nodo.hidden) validar(ev.target.form, campo);
    });

    // al salir de un campo con algo escrito, se valida ese campo (no antes: no regaña mientras escribe)
    cuerpo.addEventListener("focusout", (ev) => {
      const campo = ev.target.dataset.campo;
      if (ev.target.form?.dataset.paso === "2" && (campo === "nombre" || campo === "telefono") && ev.target.value) validar(ev.target.form, campo);
    });

    cuerpo.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const form = ev.target;
      const errores = validar(form);
      const primero = Object.keys(errores)[0];
      if (primero) {
        (form.querySelector(`[data-campo="${primero}"]:not([type=radio])`) || form.querySelector(`[data-campo="${primero}"]`))?.focus();
        return;
      }
      if (form.dataset.paso === "1") return ir("contacto");

      const items = leerCarrito();
      const wa = `https://wa.me/${CONF.whatsapp}?text=${encodeURIComponent(mensajeWhatsApp(servicio, b, items))}`;
      // sin endpoint, la solicitud sale por WhatsApp (se abre en el mismo clic para que no la bloqueen)
      if (!CONF.endpoint) {
        window.open(wa, "_blank", "noopener");
        return terminar(false);
      }
      const boton = form.querySelector(".cht-boton[data-principal]");
      const fallo = form.querySelector('[data-error="envio"]');
      // la misma solicitud lleva siempre el mismo id: si se reintenta, el CRM no la duplica
      b.idSolicitud = b.idSolicitud || (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      guardar();
      boton.disabled = true;
      boton.textContent = "Enviando…";
      masc.pose("pensar");
      fallo.hidden = true;
      try {
        const r = await fetch(CONF.endpoint, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({
            id: b.idSolicitud, tipo: "solicitud_servicio", servicio: { id: servicio.id, titulo: servicio.titulo },
            necesidad: { que: b.que, cuando: b.cuando },
            contacto: { nombre: b.nombre.trim(), telefono: b.telefono, ciudad: ciudad(), direccion: b.direccion.trim() },
            permiso_contacto: true, carrito: items.map((i) => ({ codigo: i.codigo, nombre: i.nombre, cantidad: i.cantidad, categoria: i.categoria })),
            pagina: location.href,
          }),
        });
        if (!r.ok) throw new Error(String(r.status));
        terminar(true);
      } catch {
        // no se perdió nada: lo escrito sigue en el formulario y queda el camino por WhatsApp
        boton.disabled = false;
        boton.textContent = "Pedir el técnico";
        masc.pose("reposo");
        fallo.hidden = false;
        fallo.innerHTML = `No pudimos enviarla. Inténtalo de nuevo o <a href="${esc(wa)}" target="_blank" rel="noopener">mándala por WhatsApp</a>.`;
      }
    });

    const terminar = (enviada) => {
      sesion.sumar(NO, servicio.id);
      vistas.listo(enviada);
      guardado.poner(BORRADOR, null);
    };

    // al abrir: si ya la agregó al pedido, lo muestra así; si dejó el formulario a medias, sigue ahí
    if (guardado.leer(PEDIDO)?.id === servicio.id) {
      vistas.agregada(false);
      if (enPedido) reponerNota();
    } else if (b.vista === "trabajo" || b.vista === "contacto") vistas[b.vista](false);
    else vistas.oferta(false);
  }

  // ── Vigilar el carrito ──────────────────────────────────────────────────────────────────────────────────
  // ponytail: sondeo cada 1,5 s (lee un string de localStorage); si la tienda emite un evento propio, usarlo.
  let antes = "";
  const revisar = () => {
    const ruta = location.pathname.replace(/\/$/, "");
    // pedido enviado: lo del servicio ya viajó en la nota
    if (ruta.startsWith("/pedido/gracias")) { guardado.poner(PEDIDO, null); guardado.poner(BORRADOR, null); }
    const enPedido = ruta === "/pedido";
    if (enPedido) reponerNota();
    const crudo = (() => { try { return localStorage.getItem(CONF.carrito) || ""; } catch { return ""; } })();
    const carrito = document.querySelector("dialog.carrito[open]");
    const lineas = enPedido ? document.querySelector(".pedido__lineas") : null;
    const clave = crudo + ruta + (carrito ? "|carrito" : "") + (lineas ? "|lineas" : "");
    if (clave === antes) return;
    antes = clave;
    const servicio = sugerirServicio(leerCarrito());
    // si el carrito cambió y ya no pide ese servicio (vació el pedido, quitó el inversor…), se retira todo
    const intento = guardado.leer(PEDIDO);
    if (intento && intento.id !== servicio?.id) { guardado.poner(PEDIDO, null); if (enPedido) escribirNota(null); }
    if (abierta && abierta.dataset.servicio !== servicio?.id) abierta.cerrar(false);
    if (abierta) return;
    // se ofrece solo donde la persona está mirando su pedido: el carrito abierto o /pedido (nunca encima de la ficha)
    if (!carrito && !lineas) return;
    if (!servicio || sesion.leer(NO).includes(servicio.id)) return;
    mostrar(servicio, { carrito, lineas });
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
