// Cuatro opciones de personaje para Gestiones Eléctricas, dibujadas en vector a partir de su marca (el círculo cortado
// por un rayo, degradado lima #C9E400 → oliva #5A6600, sobre negro #12140a). Cada personaje es una función que pinta un
// cuadro a partir de un estado; las acciones son líneas de tiempo de estados. generar.mjs las vuelve hojas de sprites.
//
// Lienzo de 200 × 200. El borde de la tarjeta es el borde de abajo del cuadro: en «asomarse» el personaje sube desde ahí.

const LIMA = "#c9e400", OLIVA = "#5a6600", NEGRO = "#12140a", GRAFITO = "#262a1c", BLANCO = "#ffffff";

const lerp = (a, b, t) => a + (b - a) * t;
const suave = (t) => t * t * (3 - 2 * t);
const onda = (t, veces = 1) => Math.sin(t * Math.PI * 2 * veces);
// pasa por una lista de valores repartidos en el tiempo, suavizando entre ellos
const tramos = (t, valores) => {
  const n = valores.length - 1, x = Math.min(0.9999, Math.max(0, t)) * n, i = Math.floor(x);
  return lerp(valores[i], valores[i + 1], suave(x - i));
};

// Estado de un cuadro. ojos: 1 abiertos, 0 cerrados. feliz: ojos en arco. mx/my: hacia dónde mira (−1…1).
// y: desplazamiento vertical (positivo hacia abajo). giro: grados desde la base. extra: pensar, senalar o celebrar.
export const BASE = { y: 0, giro: 0, escala: 1, ojos: 1, feliz: 0, mx: 0, my: 0, brillo: 0, fase: 0, extra: "", mano: 0 };

export const ACCIONES = {
  reposo: { cuadros: 24, fps: 12, bucle: true, texto: "Reposo: respira despacio", estado: (t) => ({ escala: 1 + 0.012 * onda(t), y: -1.5 * onda(t), brillo: 0.25 + 0.25 * (0.5 + 0.5 * onda(t)) }) },
  parpadeo: { cuadros: 8, fps: 16, bucle: false, texto: "Parpadeo", estado: (t) => ({ ojos: tramos(t, [1, 0.08, 0.08, 1]) }) },
  saludo: { cuadros: 18, fps: 12, bucle: false, texto: "Saludo", estado: (t) => ({ giro: tramos(t, [0, -7, 5, -4, 0]), feliz: tramos(t, [0, 1, 1, 1, 0]), mano: tramos(t, [0, 1, 1, 1, 0]), fase: t }) },
  pensar: { cuadros: 24, fps: 12, bucle: true, texto: "Pensando (mientras responde)", estado: (t) => ({ mx: 0.6, my: -0.7, extra: "pensar", fase: t, giro: 2 }) },
  senalar: { cuadros: 16, fps: 12, bucle: false, texto: "Señala la oferta", estado: (t) => ({ mx: tramos(t, [0, 1, 1, 1]), giro: tramos(t, [0, 5, 5, 3]), extra: "senalar", fase: t, mano: tramos(t, [0, 1, 1, 1]) }) },
  celebrar: { cuadros: 18, fps: 12, bucle: false, texto: "Celebra (solicitud enviada)", estado: (t) => ({ y: tramos(t, [0, -14, 0, -6, 0]), escala: tramos(t, [1, 1.04, 0.98, 1.02, 1]), feliz: tramos(t, [0, 1, 1, 1, 1]), extra: "celebrar", fase: t, brillo: tramos(t, [0.3, 1, 0.6, 0.9, 0.4]) }) },
  asomarse: { cuadros: 16, fps: 14, bucle: false, texto: "Se asoma desde el borde (al revés: se esconde)", estado: (t) => ({ y: tramos(t, [210, 120, -8, 3, 0]), ojos: tramos(t, [1, 1, 1, 0.1, 1]) }) },
};

const defs = (id) => `<defs>
  <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${LIMA}"/><stop offset="1" stop-color="${OLIVA}"/></linearGradient>
  <linearGradient id="${id}v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9f22a"/><stop offset="1" stop-color="#a8bf00"/></linearGradient>
  <radialGradient id="${id}r"><stop offset="0" stop-color="${LIMA}" stop-opacity=".55"/><stop offset="1" stop-color="${LIMA}" stop-opacity="0"/></radialGradient>
</defs>`;

// ojos tipo LED: píldora que se achica al parpadear; felices, arco hacia arriba
const ojoLed = (cx, cy, w, h, e, color) => {
  if (e.feliz > 0.5) return `<path d="M${cx - w * 0.9} ${cy + h * 0.15} Q${cx} ${cy - h * 0.55} ${cx + w * 0.9} ${cy + h * 0.15}" fill="none" stroke="${color}" stroke-width="${w * 0.62}" stroke-linecap="round"/>`;
  const alto = Math.max(w * 0.5, h * e.ojos);
  return `<rect x="${cx - w / 2 + e.mx * w * 0.45}" y="${cy - alto / 2 + e.my * h * 0.18}" width="${w}" height="${alto}" rx="${w / 2}" fill="${color}"/>`;
};

// lo que acompaña a cada acción, alrededor del personaje
const puntos = (x, y, fase, color) => [0, 1, 2].map((i) => {
  const v = 0.5 + 0.5 * Math.sin((fase - i * 0.18) * Math.PI * 2);
  return `<circle cx="${x + i * 13}" cy="${y - v * 4}" r="${4 + v * 1.2}" fill="${color}" opacity="${0.35 + 0.65 * v}"/>`;
}).join("");
const flecha = (x, y, fase, color) => {
  const d = 6 * Math.sin(fase * Math.PI * 4);
  return `<path d="M${x + d} ${y - 10} l10 10 -10 10" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="${Math.min(1, fase * 4)}"/>`;
};
const destellos = (cx, cy, r, fase, color) => {
  const a = Math.min(1, fase * 3) * (1 - Math.max(0, fase - 0.7) / 0.3);
  return [0, 60, 120, 180, 240, 300].map((g) => {
    const rad = (g - 90) * Math.PI / 180, r1 = r + 6 + fase * 10, r2 = r1 + 9;
    return `<line x1="${cx + Math.cos(rad) * r1}" y1="${cy + Math.sin(rad) * r1}" x2="${cx + Math.cos(rad) * r2}" y2="${cy + Math.sin(rad) * r2}" stroke="${color}" stroke-width="4" stroke-linecap="round" opacity="${a}"/>`;
  }).join("");
};
const cuerpo = (e, origenX, origenY, dibujo) =>
  `<g transform="translate(0 ${e.y}) rotate(${e.giro} ${origenX} ${origenY}) translate(${origenX} ${origenY}) scale(${e.escala}) translate(${-origenX} ${-origenY})">${dibujo}</g>`;

export const PERSONAJES = {
  insignia: {
    nombre: "Insignia",
    lema: "El logo cobra vida",
    descripcion: "El círculo de la marca, cortado por el rayo, con dos ojos LED. Sin brazos ni boca: se expresa con la mirada y el brillo. Es la más sobria y la que mejor se lee pequeña.",
    dibujar: (e, id) => {
      const cx = 100, cy = 112, r = 66;
      const corte = "M152 34 L108 106 L128 106 L72 196";
      const ojos = ojoLed(66, 100, 11, 24, e, BLANCO) + ojoLed(87, 100, 11, 24, e, BLANCO);
      const extra = e.extra === "pensar" ? puntos(150, 52, e.fase, LIMA) : e.extra === "senalar" ? flecha(178, cy, e.fase, LIMA) : e.extra === "celebrar" ? destellos(cx, cy, r, e.fase, LIMA) : "";
      return `${defs(id)}<mask id="${id}m"><rect width="200" height="220" fill="#fff"/><path d="${corte}" stroke="#000" stroke-width="11" fill="none" stroke-linejoin="miter"/></mask>
        <circle cx="${cx}" cy="${cy}" r="${r + 18}" fill="url(#${id}r)" opacity="${e.brillo}"/>
        ${cuerpo(e, cx, 178, `<g mask="url(#${id}m)"><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}g)"/></g>
          <circle cx="${cx}" cy="${cy}" r="${r - 1}" fill="none" stroke="${NEGRO}" stroke-opacity=".12" stroke-width="2"/>${ojos}`)}${extra}`;
    },
  },

  tecnico: {
    nombre: "Técnico",
    lema: "Chispa con casco de ingeniero",
    descripcion: "El rayo de siempre, pero geométrico y con el degradado de la marca, y un casco blanco de obra. Saluda tocándose el casco. Conserva la idea de Chispa y la vuelve de oficio.",
    dibujar: (e, id) => {
      const rayo = "M108 58 H150 L124 108 H152 L80 194 L96 132 H62 Z";
      const ojos = ojoLed(108, 84, 9, 18, e, NEGRO) + ojoLed(126, 84, 9, 18, e, NEGRO);
      // al saludar, el casco se levanta un poco desde la visera
      const casco = `<g transform="rotate(${-10 * e.mano} 104 58) translate(0 ${-4 * e.mano})">
        <path d="M104 60 Q104 30 131 30 Q158 30 158 60 Z" fill="${BLANCO}"/><path d="M127 31 h8 v28 h-8 Z" fill="#e3e7d6"/>
        <rect x="98" y="57" width="66" height="7" rx="3.5" fill="#eef1e2"/><path d="M118 44 l8 -10 h5 l-4 7 h6 l-10 12 h-5 l4 -9 Z" fill="${LIMA}"/></g>`;
      const extra = e.extra === "pensar" ? puntos(160, 100, e.fase, OLIVA) : e.extra === "senalar" ? flecha(170, 120, e.fase, OLIVA) : e.extra === "celebrar" ? destellos(110, 112, 62, e.fase, OLIVA) : "";
      return `${defs(id)}<circle cx="108" cy="118" r="80" fill="url(#${id}r)" opacity="${e.brillo * 0.8}"/>
        ${cuerpo(e, 100, 190, `<path d="${rayo}" fill="url(#${id}g)" stroke="${OLIVA}" stroke-width="2" stroke-linejoin="round"/>${ojos}${casco}`)}${extra}`;
    },
  },

  medidor: {
    nombre: "Medidor",
    lema: "Un medidor inteligente que te atiende",
    descripcion: "Un medidor de energía en grafito con pantalla. La cara es la pantalla: ojos de luz, puntos de carga mientras piensa, flecha al señalar y check al terminar. Se ve técnico y serio, y es del mundo eléctrico.",
    dibujar: (e, id) => {
      const pantalla = e.extra === "pensar"
        ? `<rect x="68" y="98" width="64" height="8" rx="4" fill="#2d3317"/><rect x="68" y="98" width="${8 + 56 * ((e.fase * 1.6) % 1)}" height="8" rx="4" fill="${LIMA}"/>${ojoLed(86, 80, 10, 14, { ...e, my: -0.6 }, LIMA)}${ojoLed(114, 80, 10, 14, { ...e, my: -0.6 }, LIMA)}`
        : e.extra === "celebrar" && e.fase > 0.35
          ? `<path d="M82 92 l12 12 l24 -26" fill="none" stroke="${LIMA}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`
          : e.extra === "senalar" && e.fase > 0.3
            ? `${ojoLed(84, 88, 11, 22, e, LIMA)}${ojoLed(108, 88, 11, 22, e, LIMA)}<path d="M126 80 l9 9 l-9 9" fill="none" stroke="${LIMA}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity="${0.4 + 0.6 * Math.abs(Math.sin(e.fase * Math.PI * 3))}"/>`
            : `${ojoLed(86, 90, 12, 24, e, LIMA)}${ojoLed(114, 90, 12, 24, e, LIMA)}`;
      const led = e.extra === "celebrar" ? LIMA : `rgba(201,228,0,${0.35 + 0.65 * e.brillo})`;
      return `${defs(id)}<circle cx="100" cy="110" r="84" fill="url(#${id}r)" opacity="${e.brillo * 0.7}"/>
        ${cuerpo(e, 100, 196, `<rect x="44" y="42" width="112" height="150" rx="24" fill="${GRAFITO}"/>
          <rect x="44" y="42" width="112" height="150" rx="24" fill="none" stroke="#3a3f2b" stroke-width="2"/>
          <rect x="56" y="56" width="88" height="66" rx="12" fill="#0b0d05"/>
          <rect x="56" y="56" width="88" height="66" rx="12" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="2"/>
          ${pantalla}
          <circle cx="100" cy="152" r="17" fill="none" stroke="#3a3f2b" stroke-width="4"/>
          <path d="M100 152 L${100 + 12 * Math.cos(-Math.PI / 2 + e.fase * Math.PI * 2)} ${152 + 12 * Math.sin(-Math.PI / 2 + e.fase * Math.PI * 2)}" stroke="#7e856c" stroke-width="3" stroke-linecap="round"/>
          <circle cx="138" cy="140" r="5" fill="${led}"/><path d="M64 136 l6 -9 h4 l-3 6 h5 l-7 10 h-4 l3 -7 Z" fill="${LIMA}"/>`)}
        ${e.extra === "celebrar" ? destellos(100, 110, 74, e.fase, LIMA) : ""}`;
    },
  },

  ingeniera: {
    nombre: "Ingeniera",
    lema: "Una persona del equipo",
    descripcion: "Una ingeniera con casco y chaleco reflectivo de los colores de la marca. Es la más humana y la más cercana al servicio técnico. Saluda con la mano, señala y levanta el pulgar al terminar.",
    dibujar: (e, id) => {
      const piel = "#b97a56", pelo = "#2a1d17";
      const mirar = (x) => x + e.mx * 2.5;
      const ojos = e.feliz > 0.5
        ? `<path d="M80 108 q6 -6 12 0 M108 108 q6 -6 12 0" fill="none" stroke="${NEGRO}" stroke-width="3.5" stroke-linecap="round"/>`
        : `<ellipse cx="${mirar(86)}" cy="${108 + e.my * 2}" rx="4" ry="${Math.max(0.6, 5 * e.ojos)}" fill="${NEGRO}"/><ellipse cx="${mirar(114)}" cy="${108 + e.my * 2}" rx="4" ry="${Math.max(0.6, 5 * e.ojos)}" fill="${NEGRO}"/>`;
      const boca = e.feliz > 0.5 || e.extra === "celebrar" ? `<path d="M90 124 q10 9 20 0" fill="none" stroke="${NEGRO}" stroke-width="3.5" stroke-linecap="round"/>` : `<path d="M93 125 q7 4 14 0" fill="none" stroke="${NEGRO}" stroke-width="3" stroke-linecap="round"/>`;
      // la mano sale por la derecha: saluda (se mece), señala o levanta el pulgar
      const sube = e.mano;
      const meneo = e.extra === "" && sube > 0.2 ? 14 * Math.sin(e.fase * Math.PI * 6) : 0;
      const mano = sube < 0.05 && e.extra !== "celebrar" ? "" : e.extra === "senalar"
        ? `<g transform="translate(${lerp(30, 0, sube)} 0)"><path d="M150 200 L156 150" stroke="${LIMA}" stroke-width="20" stroke-linecap="round"/><rect x="146" y="128" width="26" height="24" rx="11" fill="${piel}"/><rect x="164" y="132" width="26" height="9" rx="4.5" fill="${piel}"/></g>`
        : e.extra === "celebrar"
          ? `<g transform="translate(0 ${lerp(40, 0, Math.min(1, e.fase * 3))})"><path d="M152 200 L156 150" stroke="${LIMA}" stroke-width="20" stroke-linecap="round"/><rect x="143" y="128" width="28" height="26" rx="11" fill="${piel}"/><rect x="149" y="104" width="10" height="28" rx="5" fill="${piel}"/></g>`
          : `<g transform="rotate(${meneo} 158 170) translate(0 ${lerp(50, 0, sube)})"><path d="M152 200 L158 150" stroke="${LIMA}" stroke-width="20" stroke-linecap="round"/><rect x="145" y="112" width="28" height="34" rx="12" fill="${piel}"/><rect x="136" y="126" width="12" height="9" rx="4.5" fill="${piel}" transform="rotate(-30 142 130)"/></g>`;
      const extra = e.extra === "pensar" ? puntos(150, 70, e.fase, OLIVA) : e.extra === "celebrar" ? destellos(100, 104, 58, e.fase, OLIVA) : "";
      return `${defs(id)}${cuerpo(e, 100, 200, `
        <path d="M44 200 Q46 152 100 150 Q154 152 156 200 Z" fill="url(#${id}v)"/>
        <path d="M54 172 H146 M50 186 H150" stroke="#e6e9dc" stroke-width="6" opacity=".9"/>
        <path d="M86 150 L100 168 L114 150" fill="${NEGRO}"/>
        <rect x="90" y="132" width="20" height="22" rx="8" fill="${piel}"/>
        <ellipse cx="100" cy="108" rx="34" ry="36" fill="${piel}"/>
        <path d="M66 104 Q66 84 80 80 L120 80 Q134 84 134 104 Q128 92 118 90 L82 90 Q72 92 66 104 Z" fill="${pelo}"/>
        <path d="M64 120 Q62 98 68 92 L70 122 Z M136 120 Q138 98 132 92 L130 122 Z" fill="${pelo}"/>
        ${ojos}<path d="M80 98 h12 M108 98 h12" stroke="${pelo}" stroke-width="3" stroke-linecap="round" transform="translate(0 ${e.feliz * -2})"/>${boca}
        <path d="M62 90 Q62 50 100 50 Q138 50 138 90 Z" fill="${BLANCO}"/><path d="M96 51 h8 v38 h-8 Z" fill="#e3e7d6"/>
        <rect x="56" y="86" width="88" height="8" rx="4" fill="#eef1e2"/><path d="M86 74 l9 -12 h6 l-5 8 h7 l-11 14 h-6 l5 -10 Z" fill="${LIMA}"/>`)}
        ${mano}${extra}`;
    },
  },
};
