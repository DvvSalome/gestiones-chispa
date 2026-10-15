// Demo local: sirve la tienda real a través de un proxy e inyecta chispa-tecnico.js antes de </body>.
// node demo/servidor.mjs  →  http://localhost:4546   (CHISPA_ENDPOINT=/solicitudes prueba el envío a un endpoint)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const ORIGEN = "https://tienda.gestioneselectricas.com";
const PUERTO = Number(process.env.PORT || 4546);
const ENDPOINT = process.env.CHISPA_ENDPOINT || "";
const script = new URL("../chispa-tecnico.js", import.meta.url);

createServer(async (req, res) => {
  try {
    // las hojas de sprites de la mascota
    const sprite = req.url.match(/^\/sprites\/([a-z]+-arte\.webp)$/);
    if (sprite) {
      res.writeHead(200, { "content-type": "image/webp", "cache-control": "no-store" });
      return res.end(await readFile(new URL(`../sprites/${sprite[1]}`, import.meta.url)));
    }
    if (req.url === "/chispa-tecnico.js") {
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
      return res.end(await readFile(script));
    }
    // endpoint de prueba: solo registra en consola, no manda nada a nadie
    if (req.url === "/solicitudes" && req.method === "POST") {
      let cuerpo = "";
      for await (const t of req) cuerpo += t;
      console.log("[demo] solicitud recibida:", cuerpo);
      res.writeHead(201, { "content-type": "application/json" });
      return res.end('{"ok":true}');
    }
    const r = await fetch(ORIGEN + req.url, { headers: { accept: req.headers.accept || "*/*", "user-agent": req.headers["user-agent"] || "demo" }, redirect: "manual" });
    const cabeceras = Object.fromEntries([...r.headers].filter(([k]) => !/^(content-encoding|content-length|content-security-policy|strict-transport-security|transfer-encoding)$/.test(k)));
    if (cabeceras.location) cabeceras.location = cabeceras.location.replace(ORIGEN, "");
    if ((r.headers.get("content-type") || "").includes("text/html")) {
      const etiqueta = `<script src="/chispa-tecnico.js"${ENDPOINT ? ` data-endpoint="${ENDPOINT}"` : ""} defer></script>`;
      const html = (await r.text()).replace("</body>", `${etiqueta}</body>`);
      res.writeHead(r.status, cabeceras);
      return res.end(html);
    }
    res.writeHead(r.status, cabeceras);
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end(`proxy: ${e.message}`);
  }
}).listen(PUERTO, () => console.log(`Demo de Chispa técnico en http://localhost:${PUERTO}`));
