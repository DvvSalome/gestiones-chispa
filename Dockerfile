# Bot de Chispa (servidor/asistente.mjs): un solo proceso de Node, sin dependencias. Escucha en el 4547.
FROM node:22-alpine
WORKDIR /app
COPY servidor/asistente.mjs servidor/asistente.mjs
COPY chispa-tecnico.js chispa-tecnico.js
ENV PORT=4547 NODE_ENV=production TRUST_PROXY=1
USER node
EXPOSE 4547
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:4547/api/chispa/vivo || exit 1
CMD ["node", "servidor/asistente.mjs"]
