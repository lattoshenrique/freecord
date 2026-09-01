# Architecture

## The picture

```
browser A ◄────────── WebRTC P2P (voice/video/screen) ──────────► browser B
     │                                                              │
     └──WS /ws/rooms/:slug──► our own server ◄──WS─────────────────┘
                              (rooms, SDP/ICE signaling,
                               chat, screen lock)
```

**Fully self-owned.** Media flows straight between browsers in a P2P mesh (each
peer keeps one `RTCPeerConnection` with every other). The server never touches
media: it owns room state and carries signaling envelopes. Consequences:

- Infrastructure cost ~zero: one small Node process serves thousands of rooms,
  because the heavy traffic never goes through it.
- No vendor, no SDK — the entire protocol lives in this repository. The one
  deliberate exception is an optional TURN credential (see "TURN" below): a
  relay for peers that cannot connect directly, carrying encrypted bytes it
  cannot read. Unset, everything still works on public STUN.
- The honest limit of a mesh: with video, past ~8 people **each participant's
  upload** becomes the bottleneck (N−1 copies of every stream). That is why
  `maxParticipants: 8` is both a product rule and a technical one.

## Server layers

```
src/
  domain/     Room, limits, errors and the closed message protocol
  app/        RoomRegistry (state + expiry) and SignalingSession (the rules)
  http/       Fastify routes + the WebSocket endpoint (zod validation at the edge)
  index.ts    composition root
```

`worker/` is a **second edge** over the same layers: it imports `domain/` and
`parseClientMessage` and swaps only the transport (see "Two edges" below).

- `SignalingSession` is transport-independent: it takes a `PeerSender` (a send
  function) and is tested with fakes, with no real WebSocket.
- `parseClientMessage` only accepts the closed protocol — a message outside the
  format is dropped at the edge. `screen-request` carries the `quality`
  (`sharp`/`balanced`/`smooth`, defaulting to `balanced`). Those values are on
  the wire; the labels a user sees are translated in the client's i18n layer.
- `ping`/`pong` is the heartbeat: the client times the echo (signaling latency)
  and the server uses the silence to evict zombie connections.
- The "one screen at a time" lock lives on the server (`screen-request` →
  `screen-started`/`screen-denied`) and is released even on a dropped
  connection.

## Client (web/src/lib)

- `protocol.ts` — mirror of the server's message types.
- `signaling.ts` — WebSocket client with **automatic resume**: a dropped
  transport reconnects with backoff and presents the `resumeToken` from
  `welcome`, reclaiming the same peerId (see "How a room dies").
- `mesh.ts` — one `RTCPeerConnection` per peer, with **perfect negotiation**
  (the MDN pattern): renegotiations (turning the camera on, sharing a screen
  mid-call) work from both sides without glare. Whoever joins initiates the
  offer toward whoever was already there.
- `use-room.ts` — the hook that orchestrates signaling + mesh + UI state.

### TURN

Public STUN handles address discovery on most networks; the ~10–20% that
cannot connect directly (restrictive corporate networks, symmetric CGNAT) fall
back to TURN. The edge hands ephemeral credentials to each join inside
`welcome.ice` (`app/turn.ts` talks to Cloudflare Realtime's anycast TURN and
caches one credential set for 6 h; the free tier is 1 TB/month at the time of
writing — a vendor number, unlike the rest of this doc's). The tradeoff
is deliberate and narrow: a TURN relay forwards DTLS-SRTP bytes it cannot
decrypt, which is a categorically smaller exposure than a media vendor — and
TURN is an open protocol, so the escape hatch (self-hosted coturn behind the
same `welcome.ice` field) stays real. With no `TURN_KEY_ID`/`TURN_API_TOKEN`
configured (dev default), joins get an empty list and the client falls back to
public STUN, exactly as before.

That dev default is also production's state today: the hosted service runs
with no TURN credentials set, so every call is direct P2P or does not
connect. Whoever flips the secrets on owns a coupled edit in the same
movement — several public strings are written to be literally true only
while TURN is off (the "no TURN configured" notes in `llms.txt`, the JSON-LD
FAQ answer in `web/index.html`, one CONTRIBUTING paragraph, and the
`home.dev.p2p.title`/`home.dev.lead` catalog keys). Nothing breaks when this
is missed, which is exactly why it gets missed.

- `stats.ts` — reads `getStats()` from the mesh: the RTT of the candidate pair
  actually in use (the real latency between two people) and the effective
  quality of the screen.

## Screen sharing: what actually controls quality

`getDisplayMedia({ video: true })` gives you the worst of both worlds — the
browser degrades resolution AND fps together, and aims at a conservative
bitrate. Four explicit levers, in `screen-quality.ts` and `mesh.ts`:

| Lever | Effect |
| --- | --- |
| `contentHint` (`text`/`detail`/`motion`) | Tells the codec what to preserve: letter sharpness or smoothness |
| `degradationPreference` | What to sacrifice under pressure — resolution or fps, never both |
| `maxBitrate`/`maxFramerate` on the sender | An explicit ceiling instead of the browser's guess |
| `playoutDelayHint = 0` on the receiver | Cuts the playout buffer: the difference between keeping up and watching the past |

The sharer picks the preset (Sharp / Balanced / Smooth) and the switch takes
effect immediately — resending `screen-request` with a different `quality`
renegotiates without restarting the share.

A fifth lever is the codec: AV1's screen-content tools give sharper text at
the same bitrate, but its software encoder is expensive — and in the relay
tree a relay re-encodes for its whole subtree. So AV1 is offered first
(`setCodecPreferences`) only where `MediaCapabilities` reports a
power-efficient (hardware) encoder at the preset's load; every hop negotiates
independently, so a weak laptop in the middle simply stays on VP9/H.264.

### The relay tree

The per-peer ceiling is rationed out of the uplink budget. While the screen was
uploaded N−1 times, that rationing behaved like a tax: with 6 people watching,
each one's ceiling fell to a sixth and quality collapsed exactly when the room
was full.

The screen now propagates as a **tree**, not a star:

```
        Sharer
       /   |   \
    Ana  Bruno  Enzo        fanout 3
                /   \
             Duda   Caio     depth ≤ 2 with 8 people
```

- The server computes the tree (`computeScreenTree`: BFS, lexicographic order
  of peerIds, fanout 3) and sends each peer a `screen-route` with its children,
  its source and the quality. Lexicographic order is what makes both edges
  arrive at the **same** tree without coordinating.
- A peer with children forwards the track it received and announces
  `screen-relay`; the server updates its children's source.
- The rationing now divides by **children (≤3)**, not by N−1 — that is what
  removes the ceiling that used to fall with room size.
- A relay dropping out: the tree is recomputed and the orphans get a new
  `screen-route`. Tested in-browser with 6 people — video is flowing again in
  under 6 s, and `mesh.ts`'s perfect negotiation absorbs the burst of
  renegotiation.

The deliberate price: a relay **decodes and re-encodes** (this is not packet
forwarding), so it spends CPU on everyone else's behalf, and every hop adds
latency — which is why fanout 3 keeps the depth at 2. Relays are chosen
lexicographically for determinism, not for capacity: a weak laptop can become a
bottleneck. Picking relays by RTT/stability is the natural next step.

A second deliberate price came with session resume: detached peers stay in the
tree, so a relay that dies for real (transport AND media together) freezes its
subtree for up to the 35 s seat clock, where a clean close used to recover it
in seconds. That is the right trade for the common case — a WS-only drop keeps
the relay's media legs flowing, and rerouting would break a working stream. If
it ever hurts in practice, the escape is to exclude detached peers from
`computeScreenTree` and re-emit routes on detach/resume, paying an unnecessary
re-parent on every WS-only blip.

## Product decisions that control cost and complexity

| Decision | Effect |
| --- | --- |
| Small rooms (≤ 8) | Keeps the mesh viable; upload per person ≤ 7 copies |
| One screen at a time | The screen is the most expensive stream; locked on the server |
| Video off by default | A Discord-style room is mostly voice |
| Empty room expires in 15 min | Nothing sits in memory without people |
| Ephemeral chat over WS | Zero storage; broadcast is trivial |

## Security of the guest-first model

- Slug from `crypto.randomBytes` (72 bits): the link is the credential. No
  link, no room.
- A peer's identity is assigned by the server per connection — nobody picks
  their own id, and the `signal` relay only accepts ids that exist in the room.
- zod validation at the HTTP/WS edge; WS messages capped at 64 KB; rate limit
  on room creation (anonymous by design).
- P2P media is end-to-end encrypted by default (DTLS-SRTP) — the server could
  not see it even if it wanted to.

## The scaling path (in the order the money dictates)

1. **Today (validation, ~US$ 0–6/month)**: one Node process on a free
   VPS/PaaS serving API + WS + static files. It supports thousands of
   concurrent users in small rooms (the server only signals).
2. **TURN** — *done, in production*: ephemeral credentials from Cloudflare
   Realtime's anycast TURN, handed out in `welcome.ice` (free up to 1 TB/month;
   see "TURN" above for why this vendor exception is acceptable). The
   self-owned variant (coturn on a small VPS, ~+US$ 6/month) remains the
   documented escape hatch behind the same protocol field.
3. **Multiple signaling instances** — *done, in production*: state is
   per-room → shard by slug. On Cloudflare that is one Durable Object per slug
   (`worker/`); on a Node cluster it would be sticky routing or Redis pub/sub.
   The UI does not change.
4. **Bigger rooms / millions of visits**: the relay tree pushes this frontier
   out (the sharer no longer uploads N−1 copies), but does not remove it: the
   audio/camera mesh is still the limit past ~8 with video. The next step is
   **our own SFU** (e.g. on top of Pion/werift, or from scratch on libwebrtc)
   behind the SAME signaling protocol — the client then sends 1 stream to the
   SFU instead of N−1 to its peers. That frontier is already drawn: `mesh.ts`
   is the only file that knows the topology is P2P.

## Two edges over one core

`domain/` and the protocol do not know which transport they run on. There are
two edges:

| | `server/` (Node) | `worker/` (Cloudflare) |
| --- | --- | --- |
| Transport | Fastify + `ws` | `fetch` + WebSocket Hibernation |
| Room state | `RoomRegistry`, one `Map` per process | one Durable Object per slug |
| Expiry | `setInterval` sweeping zombies and empty rooms | DO alarm (sweeps while occupied, schedules the end once empty) |
| Static files | `@fastify/static` | `ASSETS` binding (SPA fallback in the Worker) |
| Rate limit | `@fastify/rate-limit` | `ratelimit` binding (60/min per IP) |

What does **not** change between the two: the closed protocol, the
`ROOM_LIMITS`, the one-screen-at-a-time lock and its release on a dropped
connection. The core tests (`server/test/`) hold for both.

### Why signaling is not hosted in Brazil

Measured, not assumed: signaling RTT to the Durable Object is **~150 ms**,
against **34 ms** for an equivalent server on Cloud Run in São Paulo. The cause
is the platform — **Durable Objects do not exist in South America**, and
Cloudflare's docs state that an object with the `sam` hint is created on the US
east coast.

We keep the 150 ms on purpose. They only delay chat and joining a room: voice,
video and screen are P2P and never pass through a server. The Brazilian path
was built and then torn down because Cloud Run starts charging past ~50 h of
monthly use and brings two problems worse than latency: WebSockets cut off at
60 min (with no reconnect, the call ends) and scale-to-zero (a room created and
not used disappears).

The `Dockerfile` and the `VITE_SIGNALING_ORIGIN` variable (in `web/src/api.ts`)
stay ready to rebuild that path if the math changes.

### How a room dies (and how a connection comes back)

A dropped transport is an accident; leaving is a decision. The protocol keeps
them apart:

- A **deliberate goodbye** is the `leave` message (sent on the leave button and
  on `pagehide`): the seat is vacated and `peer-left` goes out immediately.
- A **bare close or silence** detaches the peer but keeps the seat: `welcome`
  carries a `resumeToken` (16 random bytes, valid only in that room), and a
  reconnecting client presents it to reclaim the **same peerId** — which
  matters because the screen tree is computed from lexicographic peerIds, so a
  preserved id keeps the tree stable, and the P2P media legs never stopped
  flowing anyway. No `peer-left` is broadcast during the grace.

Death still happens in two stages, on the same clocks as before (a resume
never extends the worst case):

1. With no `ping` for `peerTimeoutMs` (35 s), the seat expires — detached or
   zombie alike — and `peer-left` goes out. One exception is faster: a
   detached **sharer** loses the screen lock after `screenLockGraceMs` (10 s),
   because one frozen screen blocks the whole room while a frozen tile blocks
   nobody. The seat itself survives the full 35 s. The 10 s is a cutoff, not
   a deadline: release rides the sweep, so it lands at ~10 s on the Worker
   (detach schedules an early alarm) and 10–20 s on Node (10 s sweep cadence).
2. A room with nobody in it for `emptyTimeoutMs` (15 min) ceases to exist; the
   link starts answering `room_not_found`. Detached seats count as occupancy
   (and toward `maxParticipants`) until they expire.

The client runs the same clock in reverse — but silence no longer ends the
session: with no `pong` in time it forces the transport down and goes through
the resume path (backoff capped well inside the 35 s grace). The session only
ends when the resume is refused (`resume_invalid`: the seat was swept) or the
attempts run out.

On the Cloudflare edge a peer survives DO hibernation: participant identity
(with its resume token) goes in the socket's `serializeAttachment`, and
`screenSharer`, detached seats and metadata go in storage — nothing depends on
process memory.

## Conscious MVP debts (mapped, not forgotten)

- **Chat does not persist** (reload and it is gone) — a privacy and a scope
  decision; persistence would require storage and a retention policy.
- **No moderation/kick**: the room's creator has no powers yet; the protocol
  can carry it (`kick` would be one more message type, with a moderation secret
  in the creator's localStorage).
- **Observability**: structured Fastify logs; metrics land alongside the first
  serious deploy.
- **The coturn escape hatch is argued for, never exercised**: the TURN section
  claims a self-hosted relay can replace the vendor behind the same
  `welcome.ice` field, and nothing has ever proven it end to end. Until
  someone runs a call through a real coturn, that claim is a design, not a
  fact.

Two debts graduated into features: **TURN** (ephemeral credentials in
`welcome.ice`) and **WS reconnect** (session resume with the same peerId) —
see the sections above.
