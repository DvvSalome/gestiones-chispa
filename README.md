# Chispa técnico — Gestiones Eléctricas

Complemento de Chispa para tienda.gestioneselectricas.com. Cuando lo que la persona lleva pide una instalación,
Chispa se asoma en el carrito (y en `/pedido`) y le ofrece un técnico de Gestiones Eléctricas. Si acepta, deja
nombre, WhatsApp y ciudad y la solicitud llega con la lista de lo que lleva.

No toca el código de la tienda ni el CRM de FourG: es un solo archivo, `chispa-tecnico.js`, sin dependencias.

## Ponerlo en la tienda

1. Subir `chispa-tecnico.js` al VPS del cliente (o servirlo desde su CRM, junto al widget de Chispa).
2. Agregar una línea en la tienda, antes de `</body>`:

   ```html
   <script src="https://crm.gestioneselectricas.tech/chispa-tecnico.js" data-endpoint="https://crm.gestioneselectricas.tech/api/public/solicitudes-servicio" defer></script>
   ```

   - **Sin `data-endpoint`**, la solicitud sale por WhatsApp al número de la tienda (573018141027) con el mensaje
     ya escrito. Sirve desde el primer día, sin backend.
   - `data-whatsapp="57…"` cambia ese número.
   - `data-carrito` cambia la clave del carrito en `localStorage` (hoy `ge-tienda-carrito-v1`).

## Lo que recibe el endpoint

`POST` con JSON. Hay que responder 2xx. Si falla, la persona ve el error con un enlace para mandarla por WhatsApp
y no pierde lo que escribió.

```json
{
  "tipo": "solicitud_servicio",
  "servicio": { "id": "solar", "titulo": "Instalación del sistema solar" },
  "contacto": { "nombre": "…", "telefono": "3001234567", "ciudad": "Barranquilla", "direccion": "" },
  "permiso_contacto": true,
  "carrito": [{ "codigo": "PNLM33", "nombre": "Panel Solar…", "cantidad": 1, "categoria": "Energía Solar Fotovoltaica" }],
  "pagina": "https://tienda.gestioneselectricas.com/pedido"
}
```

El endpoint es público, así que necesita lo de siempre:

- CORS solo para `https://tienda.gestioneselectricas.com`.
- Límite por IP.
- Validar los tamaños de cada campo.
- Crear el contacto o lead en su CRM con origen «Tienda — servicio técnico».

## Cuándo ofrece y qué

Las reglas están en `sugerirServicio()`, al principio del archivo. Leen la categoría y el nombre de cada producto
del carrito.

| Lleva | Ofrece |
|---|---|
| Panel e inversor, o dos piezas solares | Instalación del sistema solar |
| Un transformador | Montaje y puesta en servicio |
| Material antiexplosión (NEMA 7) | Instalación en áreas clasificadas |
| Tablero más tubería, conectores o material de red | Montaje del tablero y cableado |
| Puesta a tierra con conectores | Puesta a tierra con medición |
| Red trenzada, aisladores, acometida… | Instalación de acometida o red |
| Medidor, domótica o fibra (con otra área) | Su instalación |
| 4 o más luminarias (con otra área) | Instalación de la iluminación |
| Tres áreas sueltas (tubería, conectores, luz…) | Instalación eléctrica completa |

Un producto suelto, como un bombillo o un panel, no dispara nada. «Ahora no» lo calla en esa sesión. Nunca sale
encima de la ficha del producto, solo donde la persona mira su pedido.

## La mascota

El **Técnico** (el rayo con casco de ingeniero) es el que atiende. Dos personajes más aparecen según el caso:

- **Medidor**: en los servicios que se miden (medidor, puesta a tierra, transformador).
- **Ingeniera**: cuando el cliente deja sus datos («¿A quién le escribimos?») y en la confirmación, porque le escribe
  una persona del equipo.

Al cambiar de personaje, el que está se esconde detrás del borde y sube el otro.

Los tres son de arcilla 3D, como la mascota de TARGET: se asoman por el borde de la tarjeta con las manos agarradas por delante. Cada personaje es una hoja de sprites en `sprites/<personaje>-arcilla.webp`. Tiene una pose por acción, en este orden:

| Pose | Cuándo sale |
|---|---|
| Reposo | Quieto, respirando |
| Parpadeo | Cada 3 a 7 segundos |
| Saludo | Al aparecer; el Técnico levanta el casco |
| Pensando | Mientras se envía la solicitud |
| Señalando | Apunta a la oferta |
| Celebrando | Instalación agregada o solicitud enviada |

El `.json` de cada hoja trae el tamaño del cuadro y el punto donde va parado el personaje.

Las poses salen de ilustraciones de ChatGPT (`arte/arcilla/`, hechas con la mascota de TARGET y el logo de referencia, que están en `arte/referencias/`). `sprites/recortar.py` las separa por piezas (una mano suelta va con su pose) y las alinea por la línea del borde. Con movimiento reducido no sube ni respira: solo cambia de pose.

Para servir las hojas desde otra ruta, usar `data-sprites="https://…/sprites/"`.

## Probar

```bash
node test.cjs                  # reglas: qué servicio sale con cada carrito
node demo/servidor.mjs         # la tienda real por un proxy local, con el script inyectado: http://localhost:4546
CHISPA_ENDPOINT=/solicitudes node demo/servidor.mjs   # prueba el envío: el proxy solo lo imprime en consola
```

## Con el chat de Chispa

El widget del chat puede usar las mismas hojas: la pose «Pensando» del Técnico mientras el modelo escribe y
«Celebrando» cuando se crea el pedido. `window.ChispaTecnico.sugerirServicio(carrito)` queda disponible. Si el widget de Chispa le manda el carrito al
modelo en cada mensaje, puede usar la misma regla para ofrecer el técnico dentro de la conversación y no solo en
la tarjeta.
