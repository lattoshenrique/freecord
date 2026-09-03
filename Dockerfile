# Rooms and signaling server for a same-origin reverse-proxy deployment.
#
# Serve the frontend on the same public origin and route /api and /ws here.
# See docs/architecture.md.

FROM node:20-alpine AS build
WORKDIR /app
# Every workspace manifest is needed for npm to validate the lockfile, even
# though only server dependencies are installed in the image.
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
COPY worker/package.json worker/
COPY relay/package.json relay/
COPY e2e/package.json e2e/
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
COPY relay/package.json relay/
COPY e2e/package.json e2e/
RUN npm ci --workspace server --include-workspace-root --omit=dev && npm cache clean --force
COPY --from=build /app/server/dist ./server/dist
# The hosting platform injects PORT; the server reads it from the environment.
USER node
CMD ["node", "server/dist/index.js"]
