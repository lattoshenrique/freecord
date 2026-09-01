# Servidor de salas + sinalização para Cloud Run (região São Paulo).
#
# Só o workspace `server` entra na imagem: o web é servido pela Cloudflare,
# na borda de GRU. Ver docs/architecture.md.

FROM node:20-alpine AS build
WORKDIR /app
# Os package.json de todos os workspaces são necessários para o `npm ci`
# validar o lockfile, mesmo instalando só as dependências do server.
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
COPY worker/package.json worker/
RUN npm ci --workspace server --include-workspace-root
COPY server ./server
RUN npm run build --workspace server

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
COPY worker/package.json worker/
RUN npm ci --workspace server --include-workspace-root --omit=dev && npm cache clean --force
COPY --from=build /app/server/dist ./server/dist
# Cloud Run injeta PORT; o config já lê da env.
USER node
CMD ["node", "server/dist/index.js"]
