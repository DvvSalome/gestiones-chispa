# Handoff: Chispa y el servicio técnico en la tienda de Gestiones Eléctricas

Para: **Isaías**, que lo sube a producción. Preparado por FourG (Adrián con Claude), 15 de octubre de 2026.

Nada de esto está en producción todavía. Todo se probó contra la tienda real a través de un proxy local, que
inyecta el script sin tocar la tienda.

## Qué se entrega

| Pieza | Qué hace | Dónde |
|---|---|---|
| **Oferta del técnico** | Lee el carrito. Si lo que lleva pide instalación (paneles + inversor, un transformador, tablero + tubería…), ofrece un técnico de Gestiones dentro del carrito y en `/pedido`. Con un toque, la instalación queda escrita en la nota del pedido. Si solo quiere el técnico, sin comprar, se pide en dos pasos y llega por endpoint o por WhatsApp. | `chispa-tecnico.js` (un solo archivo, sin dependencias) |
| **Mascota** | Personajes de arcilla 3D (estilo de la mascota de TARGET) asomados al borde de la tarjeta. El **Técnico** (rayo con casco) atiende; el **Medidor** hace cameo en servicios de medición (medidor, puesta a tierra, transformador) y la **Ingeniera** cuando el cliente deja sus datos. Una hoja de sprites por personaje con 6 poses: reposo, parpadeo, saludo, pensando, señalando y celebrando. | `sprites/*-arcilla.webp` + `.json` (~140 KB cada una) |
| **Bot del chat** | Servidor que responde en el chat recomendando SOLO productos del catálogo real de la tienda, sin inventar precios, y ofrece el técnico. Usa NVIDIA NIM con OpenRouter de respaldo, la misma cadena del FourG CRM. Si no hay modelo, muestra lo encontrado en el catálogo. | `servidor/asistente.mjs` (Node 20+, sin dependencias) |
| **Pruebas** | Reglas del servicio, el bot con proveedores simulados (7 casos) y una prueba real de punta a punta con llaves. | `test.cjs`, `test/asistente.test.mjs`, `test/e2e-vivo.mjs` |
| **Propuesta de tarjetas estilo Rappi** | Maqueta con el catálogo real: 2 por fila en celular, «+» sobre la foto, barra del pedido. Al final trae la tabla de cambios. | `docs/propuesta-tarjetas/index.html` (abrir en el navegador) |
| **Capturas** | Cada paso en celular y escritorio, en claro y oscuro. | `capturas/` |

## Lo que tiene que quedar en producción

### 1. El bot en el VPS del cliente

1. Clonar este repo en el VPS. Requiere Node 20 o más.
2. Crear `.env` desde `.env.example` con las llaves **del cliente**: `NVIDIA_NIM_KEY` y `OPENROUTER_API_KEY`. Para
   las pruebas no se usan las llaves de FourG.
3. Correr `node servidor/asistente.mjs` como servicio (systemd, pm2 o Docker) en el puerto 4547, con reinicio
   automático.
4. Publicarlo por HTTPS detrás del proxy que ya tiene el VPS, por ejemplo `https://crm.gestioneselectricas.tech/api/chispa/`
   → `http://127.0.0.1:4547/api/chispa/`.
5. Comprobar `GET /api/chispa/salud` → `{"ok":true,"proveedores":["nvidia","openrouter"],"catalogo":107}`.
6. `ORIGENES` debe ser solo `https://tienda.gestioneselectricas.com`: es lo único que deja pasar el CORS.

Contrato del chat: `POST /api/chispa/chat` con `{ "mensajes": [{ "rol": "cliente", "texto": "…" }], "carrito": [ …lo del localStorage ge-tienda-carrito-v1… ] }`.
Responde `{ texto, productos: [{ slug, nombre, precio, foto, url, categoria }], servicio: { id, titulo, motivo } | null, proveedor }`.
Hay un límite de 30 preguntas por minuto por IP, en memoria.

### 2. El widget de Chispa en la tienda

El chat de Chispa lo hizo otra sesión, en el PC de cotizaciones (`asistente.js`, `asistente-widget.js`,
`asistente-demo.js`). **Ese código no está en este repo.** Al integrarlo:

- **El chat:** que llame a `/api/chispa/chat` (o que adopte su lógica) y mande el carrito en cada mensaje.
- **Las respuestas:** cada producto recomendado va como una tarjeta con «Agregar», que use el agregar de la propia
  tienda (el índice público no trae el `id` del producto). Si viene `servicio`, se muestra la oferta del técnico.
- **La mascota:** usar las hojas de este repo, no el rayo de ojos saltones. El Técnico se pone «Pensando» mientras
  el modelo escribe y «Celebrando» cuando se agrega algo.
- **Sin flotar:** que no tape el contenido de la tienda; hoy flota encima de las fichas. Asomado al borde del
  panel del chat, como en el carrito.

### 3. La oferta del técnico en la tienda

1. Copiar `chispa-tecnico.js` y `sprites/*-arcilla.webp` al `public/chispa/` de la tienda.
2. Cargarlo en el layout raíz:
   `<script src="/chispa/chispa-tecnico.js" data-sprites="/chispa/sprites/" defer></script>`
   o con `next/script` y `strategy="afterInteractive"`.
3. `data-endpoint="https://crm.gestioneselectricas.tech/api/public/solicitudes-servicio"`: las solicitudes del
   técnico sin compra llegan al CRM del cliente (ver sección 4). Sin endpoint salen por WhatsApp al 573018141027;
   eso sirve solo de respaldo.
4. Partes de la tienda de las que depende (si cambian, se rompe; mejor ponerles un `data-` fijo):
   - `localStorage` `ge-tienda-carrito-v1` con `nombre`, `categoria`, `cantidad` y `codigo`;
   - el carrito como `dialog.carrito` con `.carrito__cuerpo`;
   - en `/pedido`, `.pedido__lineas` y `.pedido__form textarea[name="nota"]`;
   - `/pedido/gracias` como página de pedido enviado;
   - `data-theme="dark"` en `<html>` para el modo oscuro.

### 4. Conectarlo con el CRM del cliente (obligatorio)

Todo lo que el cliente pida tiene que **llegar al CRM** (crm.gestioneselectricas.tech) y verse ahí, con origen
claro, para que un asesor lo atienda:

| Qué | Cómo llega | Qué se tiene que ver en el CRM |
|---|---|---|
| **Solicitud «solo técnico»** | `POST /api/public/solicitudes-servicio` (crearlo en el CRM) con el JSON del `README.md` | Contacto (nombre, celular, ciudad) con origen «Tienda — servicio técnico» y una tarea u oportunidad para el asesor. Debe traer el servicio, qué necesita, cuándo, lo del carrito y la autorización de contacto con fecha. |
| **Pedido con instalación** | El pedido que la tienda ya manda al CRM, con la línea `[Servicio técnico] Quiero cotizar: …` en la nota | El pedido con la nota completa, y que el asesor vea que también pide instalación (ideal: una etiqueta o tarea por la marca `[Servicio técnico]`). |
| **Conversación del chat** | Lo que ya haga el widget de Chispa | La conversación y, si deja datos o pide asesor, el contacto. |

El endpoint de solicitudes tiene que cumplir esto:
- Aceptar solo el origen de la tienda (CORS) y tener límite por IP.
- Validar tipos y largos de cada campo.
- **No duplicar:** si llega el mismo `id`, responde 200 sin crear otro.
- Responder 2xx solo cuando quedó guardado; si falla, la tienda le ofrece WhatsApp a la persona.
- Avisar al asesor como avisa hoy el CRM con un lead nuevo.

### 5. Tarjetas de producto estilo Rappi (propuesta)

Abrir `docs/propuesta-tarjetas/index.html`. La tabla del final dice qué cambia en la tarjeta, la categoría y el
carrito. Son cambios del código de la tienda; no tocan datos ni precios. Es una propuesta: va solo con el visto
bueno de Adrián.

### Pendiente aparte (no es de este repo)

Adrián mandó que en el pie de la tienda, en la versión web, se veían desalineados el WhatsApp y el correo. En
producción hoy está bien: se midió de 320 a 1920 px de ancho y el correo cabe en una línea en todos menos en 320,
donde el ícono queda con la primera línea. Revisar si alguien lo ve en otra resolución o con caché vieja.

## Validar antes de publicar

Todo en verde antes de tocar producción:

```bash
node test.cjs                          # reglas del servicio
node --test test/                      # bot sin llaves: respaldo NVIDIA→OpenRouter, sin productos inventados, sin precios, CORS
cp .env.example .env && nano .env      # llaves del cliente
PLAYWRIGHT=ruta/a/playwright node test/e2e-vivo.mjs   # prueba real (ver abajo)
```

`test/e2e-vivo.mjs` hace esto:
1. Le pregunta al bot 8 cosas de clientes reales: paneles solares, breaker, reflectores, tubo PVC, medidor, puesta
   a tierra, precio de un transformador y una fuera de tema.
2. En cada una revisa la categoría de lo recomendado, que el texto no traiga precios, que ofrezca el técnico en el
   caso solar y que no recomiende nada si la pregunta es fuera de tema.
3. Apaga NVIDIA a propósito y comprueba que responde OpenRouter.
4. Lleva lo recomendado al carrito de la tienda (por el proxy de `demo/`) y comprueba que la tienda ofrece ese mismo
   servicio y que, al agregarlo, la nota del pedido trae la instalación. Deja `capturas/e2e-pedido-390.png`.

Termina en `✓ todo bien` o dice qué falló. El detalle queda en `test/resultado-e2e.json`.

Que llegue al CRM, en el preview y contra el CRM, con datos de prueba marcados como prueba (nombre «PRUEBA
Chispa», tu propio celular):
1. **«Solo técnico»:** completar el flujo. En el CRM aparece **una** solicitud con todos los campos.
   - Reenviar la misma (recargar y volver a enviar) **no crea otra**.
   - Con el endpoint caído, la tienda ofrece WhatsApp y no pierde lo escrito.
2. **Pedido con instalación:** carrito solar → «Sí, agrégala a mi pedido» → enviar el pedido de prueba. En el CRM
   el pedido trae la línea `[Servicio técnico] …` en la nota.
3. **Chat:** preguntar por paneles solares y dejar datos. La conversación y el contacto quedan en el CRM.
4. **Limpieza:** borrar o marcar como prueba todo lo creado.

Pruebas con personas: 3 personas que no conozcan la tienda, en su propio celular, con estos encargos, sin ayudarlas
y anotando dónde se traban:
- «Compra lo necesario para una instalación solar pequeña y pide que te la instalen.»
- «Pregúntale al chat qué breaker necesitas para tu tablero y agrégalo.»
- «Pide solo un técnico para revisar una puesta a tierra, sin comprar nada.»

En cada encargo, comprobar después que lo pedido llegó al CRM.

Además:
- **Antes de producción:** probar en un **preview de Vercel** (o una rama) de la tienda con el script puesto.
  Revisar el carrito y `/pedido` en celular (390 px) y escritorio, en claro y oscuro, con un carrito solar (panel +
  inversor), uno de puesta a tierra (Medidor) y el flujo «solo técnico» (Ingeniera). La consola tiene que estar sin
  errores y la página sin desborde horizontal.
- **Movimiento reducido:** la mascota no sube ni respira, solo cambia de pose.
- **Antes de promover a producción:** mandarle a Adrián las capturas del preview y esperar su OK.

## Volver atrás

- **La oferta del técnico:** quitar la línea del `<script>` del layout de la tienda; no deja datos.
- **El bot:** parar el servicio y quitar la ruta del proxy. El chat cae a lo que tenga hoy.

## Lo que no se hizo y por qué

- **El chat de Chispa no está aquí.** Lo hizo otra sesión en otro PC; se integra según el paso 2.
- **El endpoint de solicitudes del CRM del cliente no existe todavía.** Hay que crearlo (sección 4). WhatsApp queda
  solo de respaldo.
- **No se corrió la prueba real con llaves:** quedó para hacerla con las llaves del cliente.
