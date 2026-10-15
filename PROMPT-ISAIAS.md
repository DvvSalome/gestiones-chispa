# Prompt para el Claude de Isaías

Copiar todo lo de abajo en una sesión de Claude Code abierta en el VPS del cliente o en el PC donde estén el repo
de la tienda y este repo.

---

Vas a llevar a producción **Chispa y el servicio técnico** en la tienda de Gestiones Eléctricas
(tienda.gestioneselectricas.com). Tienes que validar todo antes de publicar.

**Repos:**
- `FOURGSOLUTIONS-FGS/gestiones-chispa`: este. Lee primero `HANDOFF.md` y `README.md`.
- El de la tienda (Next.js en Vercel): pídeme la ruta si no la tienes.
- El widget del chat de Chispa (`asistente.js`, `asistente-widget.js`): está en el PC de cotizaciones; pídemelo si
  no lo encuentras.

**Orden de trabajo.** No pases a un paso sin que el anterior quede en verde:

1. **Leer y medir.** Lee `HANDOFF.md`. Corre `node test.cjs` y `node --test test/`. Deben pasar todas.
2. **Bot en el VPS.**
   - Crea `.env` desde `.env.example` con las llaves del cliente (`NVIDIA_NIM_KEY` y `OPENROUTER_API_KEY`). Te las
     doy yo; no las imprimas, no las subas a git y no las pongas en el front.
   - Corre `node test/e2e-vivo.mjs` (con `PLAYWRIGHT` apuntando a un Playwright instalado). Tiene que terminar en
     `✓ todo bien`.
   - Si algo falla, muéstrame el texto del bot y qué recomendó. Ajusta solo lo necesario (sinónimos de búsqueda o
     el prompt del sistema en `servidor/asistente.mjs`) y repite.
3. **Servicio.**
   - Deja `servidor/asistente.mjs` corriendo como servicio con reinicio automático (systemd, pm2 o Docker, lo que
     ya use el VPS) en el puerto 4547.
   - Publícalo por HTTPS en `/api/chispa/` con el proxy del VPS y `ORIGENES=https://tienda.gestioneselectricas.com`.
   - Verifica `GET /api/chispa/salud` y una pregunta por `POST /api/chispa/chat` desde fuera.
4. **Tienda en un preview, no en producción.**
   - En una rama de la tienda: copia `chispa-tecnico.js` y `sprites/*-arcilla.webp` a `public/chispa/`.
   - Carga el script en el layout raíz como dice el `HANDOFF.md` (sección 3).
   - Conecta el widget del chat a `/api/chispa/chat`, mandando el carrito y mostrando los productos y la oferta.
   - Usa la mascota de arcilla de este repo, asomada al borde del panel y sin flotar sobre el contenido.
   - Despliega un **preview de Vercel**.
5. **Validar el preview con capturas.** A 390 y 1280 px, en claro y oscuro:
   - Un carrito solar (panel + inversor) muestra al Técnico con «¿Te lo instalamos?» en el carrito y en `/pedido`.
   - «Sí, agrégala a mi pedido» escribe la instalación en la nota del pedido.
   - Un carrito de puesta a tierra muestra al Medidor.
   - «Solo técnico» llega al paso 2 con la Ingeniera, valida el celular y termina en «¡Listo!».
   - El chat recomienda productos reales y ofrece el técnico.
   - La consola queda sin errores, no hay desborde horizontal y con movimiento reducido la mascota queda quieta.

   **No hagas pedidos reales ni envíes WhatsApp a clientes:** usa el endpoint de prueba o detente antes de enviar.
6. **Mándame las capturas y el resultado de las pruebas, y espera mi OK.** Adrián aprueba antes de producción.
7. **Con el OK.**
   - Promueve el preview a producción.
   - Comprueba en vivo que respondan `/chispa/chispa-tecnico.js`, `/chispa/sprites/tecnico-arcilla.webp` y
     `/api/chispa/salud`.
   - Repite el punto 5 en producción, sin enviar nada real.
8. **Al terminar, reporta:**
   - el commit de la tienda y el de este repo;
   - la URL del bot y el resultado de `e2e-vivo`;
   - las capturas;
   - cómo se revierte (quitar el `<script>` y parar el servicio).

**Reglas:**
- Nada de credenciales en el código, en los logs ni en el chat.
- No toques precios, productos ni pedidos de la tienda.
- Si algo de la tienda cambió y rompe lo que se lee (las clases del carrito o de `/pedido`, la clave del
  localStorage), dímelo antes de adaptarlo.
- La propuesta de tarjetas estilo Rappi (`docs/propuesta-tarjetas/`) es aparte: no la implementes sin el OK de
  Adrián.
