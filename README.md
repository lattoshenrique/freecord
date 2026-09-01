# Guest Rooms

Plataforma **guest-first** de salas de conversa: qualquer pessoa cria uma sala,
compartilha o link e os amigos entram sem cadastro — com **voz, vídeo, chat de
texto e compartilhamento de tela (1 por vez)**.

**100% própria**: WebRTC nativo do navegador em malha P2P + servidor próprio de
salas/sinalização. Nenhum fornecedor de mídia, nenhum SDK de terceiro, nenhuma
credencial externa. Ver [docs/architecture.md](docs/architecture.md).

## Stack

| Peça | Tecnologia | Por quê |
| --- | --- | --- |
| Mídia | WebRTC nativo (mesh P2P) | Voz/vídeo/tela fluem direto entre navegadores; custo de servidor ~zero |
| Sinalização | WebSocket próprio (protocolo fechado) | Salas, relay de SDP/ICE, chat e lock de tela num só lugar |
| API/servidor | Node 20+ / Fastify / TypeScript | Um único processo serve API, WS e o frontend buildado |
| Web | React + Vite | UI própria; bundle da sala com ~14 kB |

## Rodando localmente

Pré-requisito: Node 20+. **Nenhuma conta ou credencial externa.**

```bash
npm install

# terminal 1 — servidor (porta 3001)
npm run dev:server

# terminal 2 — web (porta 5173, com proxy de /api e /ws)
npm run dev:web
```

Abra http://localhost:5173, crie uma sala e compartilhe o link (`/r/<slug>`)
— abra numa aba anônima para simular um convidado.

## Qualidade

```bash
npm run typecheck   # tsc em todos os workspaces
npm test            # vitest: registry de salas, sinalização, rotas HTTP
npm run build       # build de produção (server + web)
```

## Deploy

Está no ar em **https://guest-rooms.lattoshenrique.workers.dev** (Cloudflare
Workers + Durable Objects, tudo em plano free — inclusive o DNS `workers.dev`).

```bash
npm run deploy   # build do web + wrangler deploy
```

O `worker/` é a borda Cloudflare: mesma API HTTP e mesmo protocolo WS do
servidor Node, com o estado de cada sala numa Durable Object por slug (ver
[docs/architecture.md](docs/architecture.md)).

### Alternativa: 1 processo Node

O servidor Fastify continua sendo o alvo de dev/teste e roda em qualquer lugar
que execute Node — ele serve o build do web quando `WEB_DIST` aponta para ele:

```bash
npm run build
PORT=3001 WEB_DIST=$(pwd)/web/dist node server/dist/index.js
```

Atrás de um proxy com TLS (Caddy/nginx) — WebRTC exige HTTPS fora do
localhost. `CORS_ORIGIN` restringe a origem em produção.

## Regras de produto no código

- Sala expira sozinha após 15 min vazia; máximo de **8 participantes**
  (limite técnico e de produto do mesh P2P — ver arquitetura).
- Compartilhamento de tela: **uma pessoa por vez**, garantido no servidor
  (lock na sala, liberado até em queda de conexão).
- O link da sala é a credencial de acesso: slug aleatório não adivinhável.
- Chat efêmero (não persiste) — zero armazenamento de conteúdo.
