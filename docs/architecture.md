# Arquitetura

## Visão

```
navegador A ◄────────── WebRTC P2P (voz/vídeo/tela) ──────────► navegador B
     │                                                              │
     └──WS /ws/rooms/:slug──► servidor próprio ◄──WS──────────────┘
                              (salas, sinalização SDP/ICE,
                               chat, lock de tela)
```

**Solução 100% própria.** A mídia flui direto entre os navegadores em malha
P2P (cada par mantém uma `RTCPeerConnection` com cada outro). O servidor não
toca em mídia: ele é dono do estado das salas e transporta os envelopes de
sinalização. Consequências:

- Custo de infra ~zero: um processo Node pequeno atende milhares de salas,
  porque o tráfego pesado nem passa por ele.
- Sem fornecedor, sem SDK, sem credencial externa — o protocolo inteiro está
  neste repositório.
- O limite honesto do mesh: com vídeo, acima de ~8 pessoas o **upload de cada
  participante** vira o gargalo (N−1 cópias de cada stream). Por isso
  `maxParticipants: 8` é regra de produto E técnica.

## Camadas do servidor

```
src/
  domain/     Room, limites, erros e o protocolo fechado de mensagens
  app/        RoomRegistry (estado + expiração) e SignalingSession (regras)
  http/       rotas Fastify + endpoint WebSocket (validação zod na borda)
  index.ts    raiz de composição
```

O `worker/` é uma **segunda borda** sobre as mesmas camadas: importa
`domain/` e `parseClientMessage` e troca só o transporte (ver "Duas bordas"
abaixo).

- `SignalingSession` é independente de transporte: recebe um `PeerSender`
  (função de envio) e é testada com fakes, sem WebSocket real.
- `parseClientMessage` só aceita o protocolo fechado — mensagem fora do
  formato é descartada na borda. `screen-request` carrega a `quality`
  (`nitida`/`equilibrada`/`fluida`, default `equilibrada`).
- `ping`/`pong` é a batida do coração: o cliente cronometra o eco (latência de
  sinalização) e o servidor usa o silêncio para expulsar conexões zumbis.
- O lock de "uma tela por vez" vive no servidor (`screen-request` →
  `screen-started`/`screen-denied`) e é liberado até em queda de conexão.

## Cliente (web/src/lib)

- `protocol.ts` — espelho dos tipos de mensagem do servidor.
- `signaling.ts` — cliente fino do WebSocket.
- `mesh.ts` — uma `RTCPeerConnection` por par, com **negociação perfeita**
  (padrão MDN): renegociações (ligar câmera, compartilhar tela no meio da
  chamada) funcionam dos dois lados sem glare. Quem entra inicia a oferta
  para quem já estava.
- `use-room.ts` — hook que orquestra sinalização + mesh + estado da UI.

STUN público resolve a descoberta de endereço na maioria das redes. Sem TURN,
uma fração de pares (redes corporativas restritivas, CGNAT simétrico) não se
conecta — ver hardening.

- `stats.ts` — lê `getStats()` da malha: RTT do par de candidatos em uso (a
  latência real entre duas pessoas) e a qualidade efetiva da tela.

## Compartilhamento de tela: o que controla a qualidade

`getDisplayMedia({ video: true })` entrega o pior dos mundos — o navegador
degrada resolução E fps juntos e mira um bitrate conservador. Quatro alavancas
explícitas em `screen-quality.ts` e `mesh.ts`:

| Alavanca | Efeito |
| --- | --- |
| `contentHint` (`text`/`detail`/`motion`) | Diz ao codec o que preservar: nitidez de letra ou fluidez |
| `degradationPreference` | O que sacrificar sob pressão — resolução ou fps, nunca os dois |
| `maxBitrate`/`maxFramerate` no sender | Teto explícito, em vez do palpite do navegador |
| `playoutDelayHint = 0` no receiver | Corta o buffer de reprodução: a diferença entre acompanhar e ver o passado |

Quem compartilha escolhe o preset (Nítida / Equilibrada / Fluida) e a troca
vale na hora — reenviar `screen-request` com outra `quality` renegocia sem
reiniciar o compartilhamento.

### Árvore de retransmissão

O teto por par é rateado pelo orçamento de uplink. Enquanto a tela subia N−1
vezes, esse rateio virava um imposto: com 6 pessoas assistindo, o teto de cada
uma caía a um sexto e a qualidade desabava justamente na sala cheia.

A tela agora se propaga em **árvore**, não em estrela:

```
        Sharer
       /   |   \
    Ana  Bruno  Enzo        fanout 3
                /   \
             Duda   Caio     profundidade ≤ 2 com 8 pessoas
```

- O servidor calcula a árvore (`computeScreenTree`: BFS, ordem lexicográfica
  de peerIds, fanout 3) e manda a cada par um `screen-route` com seus filhos,
  sua origem e a qualidade. A ordem lexicográfica é o que faz as duas bordas
  chegarem à **mesma** árvore sem combinar nada.
- Quem tem filhos reencaminha o track recebido e avisa `screen-relay`; o
  servidor atualiza a origem dos filhos.
- O rateio passa a dividir por **filhos (≤3)**, não por N−1 — é isso que tira
  o teto que caía com o tamanho da sala.
- Queda de relay: a árvore é recalculada e os órfãos recebem `screen-route`
  novo. Testado em navegador com 6 pessoas — o vídeo volta a fluir em menos de
  6 s, e a negociação perfeita do `mesh.ts` absorve a rajada de renegociação.

O preço, consciente: o relay **decodifica e recodifica** (não é repasse de
pacote), então paga CPU pelos outros, e cada salto acrescenta latência — por
isso o fanout 3 mantém a profundidade em 2. A escolha dos relays é
lexicográfica por determinismo, não por capacidade: um notebook fraco pode
virar gargalo. Escolher relay por RTT/estabilidade é a evolução natural.

## Decisões de produto que controlam custo e complexidade

| Decisão | Efeito |
| --- | --- |
| Salas pequenas (≤ 8) | Mantém o mesh viável; upload por pessoa ≤ 7 cópias |
| 1 tela por vez | Tela é o stream mais caro; lock no servidor |
| Vídeo desligado por padrão | Sala estilo Discord é majoritariamente voz |
| Sala vazia expira em 15 min | Nada fica em memória sem gente |
| Chat efêmero via WS | Zero storage; broadcast trivial |

## Segurança do modelo guest-first

- Slug com `crypto.randomBytes` (72 bits): o link é a credencial. Sem link,
  sem sala.
- Identidade do par é atribuída pelo servidor por conexão — ninguém escolhe
  o próprio id, o relay de `signal` só aceita ids existentes na sala.
- Validação zod na borda HTTP/WS; mensagens WS limitadas a 64 KB; rate limit
  na criação de sala (anônima por design).
- Mídia P2P é criptografada fim a fim por padrão (DTLS-SRTP) — o servidor
  não teria como ver nem se quisesse.

## Caminho de escala (na ordem em que o dinheiro manda)

1. **Hoje (validação, ~R$ 0–30/mês)**: 1 processo Node num VPS/PaaS free
   servindo API + WS + estáticos. Suporta milhares de usuários simultâneos
   em salas pequenas (o servidor só sinaliza).
2. **TURN próprio (~+R$ 30/mês)**: coturn num VPS pequeno com
   `credenciais efêmeras` emitidas pelo backend, para os ~10–20% de pares
   que não conectam direto. Continua 100% próprio.
3. **Múltiplas instâncias de sinalização** — *feito, em produção*: o estado é
   por sala → sharding por slug. Na Cloudflare isso é uma Durable Object por
   slug (`worker/`); num cluster Node seria sticky routing ou Redis pub/sub.
   A UI não muda.
4. **Salas maiores / milhões de acessos**: a árvore de retransmissão adia essa
   fronteira (o sharer não sobe mais N−1 cópias), mas não a remove: o mesh de
   áudio/câmera continua sendo o limite acima de ~8 com vídeo. O passo seguinte é um **SFU próprio** (ex.: sobre Pion/werift, ou
   do zero sobre libwebrtc) atrás do MESMO protocolo de sinalização — o
   cliente passa a mandar 1 stream para o SFU em vez de N−1 para os pares.
   Essa fronteira já está desenhada: `mesh.ts` é o único arquivo que sabe
   que a topologia é P2P.

## Duas bordas sobre o mesmo núcleo

`domain/` e o protocolo não sabem em que transporte rodam. Existem duas bordas:

| | `server/` (Node) | `worker/` (Cloudflare) |
| --- | --- | --- |
| Transporte | Fastify + `ws` | `fetch` + WebSocket Hibernation |
| Estado da sala | `RoomRegistry`, um `Map` por processo | uma Durable Object por slug |
| Expiração | `setInterval` varrendo zumbis e salas vazias | alarme da DO (varre com gente, agenda o fim ao esvaziar) |
| Estáticos | `@fastify/static` | binding `ASSETS` (fallback de SPA no Worker) |
| Rate limit | `@fastify/rate-limit` | binding `ratelimit` (60/min por IP) |

O que **não** muda entre as duas: o protocolo fechado, os limites de
`ROOM_LIMITS`, o lock de uma-tela-por-vez e a liberação dele em queda de
conexão. Os testes do núcleo (`server/test/`) valem para as duas.

### Por que a sinalização não fica no Brasil

Medido, não suposto: o RTT de sinalização até a Durable Object é **~150 ms**,
contra **34 ms** de um servidor equivalente no Cloud Run de São Paulo. A causa
é da plataforma — **Durable Objects não existem na América do Sul**, e a doc da
Cloudflare diz que objeto com hint `sam` nasce na costa leste dos EUA.

Ficamos com os 150 ms de propósito. Eles atrasam só o chat e a entrada na sala:
voz, vídeo e tela são P2P e nunca passam por servidor. O caminho brasileiro foi
construído e derrubado porque o Cloud Run cobra a partir de ~50 h de uso mensal
e traz dois problemas piores que a latência: WebSocket cortado em 60 min (sem
reconexão, a chamada acaba) e escala a zero (sala criada e não usada some).

O `Dockerfile` e a variável `VITE_SIGNALING_ORIGIN` (em `web/src/api.ts`) ficam
prontos para refazer o caminho se a conta mudar.

### Como uma sala morre

Queda de rede sem FIN (tampa do notebook, wi-fi que some) não gera evento de
close: o socket fantasma segura a vaga e a sala nunca fica vazia — logo, nunca
expira. Por isso a morte é em duas etapas, com timeout dos dois lados:

1. Sem `ping` por `peerTimeoutMs` (35 s), o servidor derruba o par e anuncia
   `peer-left` a quem ficou — liberando o lock de tela se era dele.
2. Sala sem ninguém por `emptyTimeoutMs` (15 min) deixa de existir; o link
   passa a responder `room_not_found`.

O cliente tem o mesmo relógio ao contrário: sem `pong` no prazo ele encerra a
sessão sozinho, porque a rede que sumiu também não entrega o frame de close.

Na borda Cloudflare o par sobrevive à hibernação da DO: identidade do
participante vai no `serializeAttachment` do socket, `screenSharer` e
metadados no storage — nada depende de memória do processo.

## Débitos conscientes do MVP (mapeados, não esquecidos)

- **Sem TURN**: redes muito restritivas não conectam mídia (o chat, via WS,
  funciona mesmo assim). Primeiro item de hardening pago.
- **Chat não persiste** (recarregou, perdeu) — decisão de privacidade e de
  escopo; persistência exigiria storage e retenção.
- **Sem moderação/expulsão**: o criador da sala ainda não tem poderes; o
  protocolo comporta (`kick` seria mais um tipo de mensagem com segredo de
  moderação no localStorage do criador).
- **Sem reconexão automática de WS**: queda de sinalização derruba a sessão
  da sala (a UI avisa, via timeout de `pong`). Reconnect com backoff é
  melhoria contida.
- **Observabilidade**: logs estruturados do Fastify; métricas entram junto
  com o primeiro deploy sério.
