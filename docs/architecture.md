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
- The honest limit of a mesh: with video, **each participant's upload** is the
  bottleneck (N−1 copies of every stream). `maxParticipants: 12` is that limit
  priced honestly: audio and screen are the product's quality promise and do
  not scale with room size (audio is cheap; the screen rides the relay tree),
  while the camera is the variable that adapts — server-granted camera slots
  shrink as the room grows (≤6 people: everyone; 7–9: four cameras; 10–12:
  three), and each camera's bitrate is a fixed uplink budget divided by the
  peer count, recomputed on every join and leave. Whoever already has a camera
  on keeps it when the room crosses a threshold; only new activations wait.

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
- Camera slots follow the same shape (`camera-request` → grant/deny plus a
  roster in `welcome`): the arithmetic is pure domain code shared by both
  edges, and the server is the referee so twelve clients cannot race each
  other into more cameras than the room can carry.

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

That dev default is also production's state, and the intended one: the hosted
service runs with no TURN credentials set, so every call is direct P2P or does
not connect at all. Whoever flips the secrets on owns a coupled edit in the same
movement — several public strings are written to be literally true only
while TURN is off (the "no TURN configured" notes in `llms.txt`, the JSON-LD
FAQ answer in `web/index.html`, one CONTRIBUTING paragraph, and the
how-it-works copy in the locale catalogs — the landing page's `home.dev.*`
tiles used to carry it and were retired with that page's redesign). Nothing
breaks when this is missed, which is exactly why it gets missed.

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
the same bitrate, but its software encoder is expensive — and a relay that
falls back to re-encoding pays that price for its whole subtree. So AV1 is
offered first (`setCodecPreferences`) only where `MediaCapabilities` reports a
power-efficient (hardware) encoder at the preset's load; every hop negotiates
independently, so a weak laptop in the middle simply stays on VP9/H.264. The
passthrough path (next section) adds its own codec rule: forwarding bytes
requires the same codec on both sides of the relay, so children are pinned to
the upstream's active codec before promotion — and never pinned to AV1 unless
the relay could re-encode it in hardware, because the fallback must stay
affordable.

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
             Duda   Caio     depth ≤ 2 with 12 people (1 + 3 + 9 seats)
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

The price a relay pays used to be fixed: it **decoded and re-encoded** for its
children, spending a full encoder cycle of latency per hop and a generation of
quality each time. That price is now the *fallback*, not the rule. Where the
browser supports WebRTC Encoded Transforms, the relay forwards the received
**encoded frames byte-for-byte** (`relay/`, the `@freecord/encoded-relay`
workspace — a standalone, dependency-free package other projects can lift
out): the relay's own encoder keeps running only as a cadence donor, crushed
to 100 kbps and a quarter of the resolution, and its output bytes are replaced
in the sender transform with the upstream frames. A hop then costs ~nothing in
latency and nothing in quality — depth stops mattering.

Passthrough is promoted per child, and only when it is provably safe: the
upstream's *active* codec must match the child's, and frames must be flowing.
Anything less demotes that child to the re-encode path — a viewer whose screen
stalls says so through the opaque `signal` envelope (a versioned `relay` note
the server relays without reading, so old clients interop untouched), and a
demotion is sticky for the rest of the share: recovery beats optimism. The
acceptance bar was that a passthrough failure must never be worse than
yesterday's behavior, and the worst case is exactly yesterday's behavior.

Relays are still chosen lexicographically for determinism, not for capacity: a
weak laptop can become a bottleneck (much less of one now that forwarding does
not encode). Picking relays by RTT/stability is the natural next step.

A second deliberate price came with session resume: detached peers stay in the
tree, so a relay that dies for real (transport AND media together) freezes its
subtree for up to the 35 s seat clock, where a clean close used to recover it
in seconds. That is the right trade for the common case — a WS-only drop keeps
the relay's media legs flowing, and rerouting would break a working stream. If
it ever hurts in practice, the escape is to exclude detached peers from
`computeScreenTree` and re-emit routes on detach/resume, paying an unnecessary
re-parent on every WS-only blip.

## The desktop shell's unfair advantages

The Electron app loads the same remote page as the browser — byte-identical
client, one deploy. What it adds is permission the browser cannot give
(`desktop/src/main.ts`), all of it aimed at the media path:

- **Real LAN candidates.** Chromium masks host ICE candidates behind mDNS
  `.local` names, which degrades or breaks same-network calls on routers that
  drop multicast. The shell disables the mask and pins the IP handling policy,
  so two PCs on one LAN connect host-to-host — the router round-trip and the
  NAT leave the path entirely. The privacy trade is stated, not hidden: media
  here is P2P-direct by design and the product already says a peer sees your
  IP.
- **Hardware video on Linux.** VA-API encode/decode is off by default in
  Chromium on Linux; the shell turns it on. Software encode was the CPU and
  latency bottleneck for 1080p screen share.
- **System audio in the share (Windows).** The display-media handler grants
  `'loopback'` audio, and the sharer's client sends that track mesh-direct to
  every viewer — not through the screen tree, because ~128 kbps of Opus times
  eleven peers costs less than one hop of forwarding complexity. The stage
  `<video>` stays muted; a dedicated audio sink plays the share.
- **A bigger appetite.** An installed app can assume a real machine and a real
  link, so the screen uplink budget rises from 10 to 25 Mbps and every preset's
  bitrate ceiling doubles. Browsers keep the conservative numbers.

The shell announces what it can do through one additive-safe surface
(`window.freecordDesktop.capabilities`); the site treats a missing flag as
`false`, so old shells and new pages keep working in both directions.

## Product decisions that control cost and complexity

| Decision | Effect |
| --- | --- |
| Small rooms (≤ 12) | Keeps the mesh viable; audio is cheap at 11 copies, cameras are rationed |
| Camera slots shrink as the room grows | Audio and screen never pay for a full room; cameras do |
| One screen at a time | The screen is the most expensive stream; locked on the server |
| Video off by default | A Discord-style room is mostly voice |
| Empty room expires in 15 min | Nothing sits in memory without people |
| Ephemeral chat over WS | Zero storage; broadcast is trivial |
| Chat sealed end-to-end | The room key rides the link's fragment; the server relays envelopes it cannot read |

## Security of the guest-first model

- Slug from `crypto.randomBytes` (72 bits): the link is the credential. No
  link, no room.
- A peer's identity is assigned by the server per connection — nobody picks
  their own id, and the `signal` relay only accepts ids that exist in the room.
- zod validation at the HTTP/WS edge; WS messages capped at 64 KB; rate limit
  on room creation (anonymous by design).
- P2P media is end-to-end encrypted by default (DTLS-SRTP) — the server could
  not see it even if it wanted to. A TURN relay, when in the path, forwards
  those same encrypted packets and cannot read them either.
- Chat is sealed end-to-end too (`web/src/lib/chat-crypto.ts`): room creation
  generates an AES-GCM-256 key that travels only in the invite link's
  **fragment** (`/r/<slug>#k=…`), which browsers never send over the network.
  Clients seal each message into an `e2e:<iv>.<ciphertext>` envelope; the
  server recognizes the envelope's *shape* only to refuse an oversized one
  whole (`normalizeChatText`) — trimming or slicing ciphertext would corrupt
  it for everybody, sender included. A joiner whose link lost the fragment
  sees a locked placeholder (`chat.locked`) instead of garbage — and the
  first sealed message that arrives proves the room has a key this client
  lacks, which **locks sending** (`chatLocked`): refusing beats silently
  downgrading the room to plaintext. Plaintext still relays in pre-key
  rooms, where no envelope ever arrives to prove otherwise.
- What chat E2EE does **not** cover, on purpose: sender names, timestamps and
  room membership are signaling, stamped by the server and visible to it; and
  anyone holding the full link holds the key — the same trust model as the
  slug. There is no forward secrecy: one key per room for the room's whole
  life, matching rooms that are themselves ephemeral.
- Two key-leak paths are this product's own, and neither is "sharing the
  link" by choice: sharing a screen or window with the address bar visible
  broadcasts the fragment to everyone watching — in a relay tree, viewers
  hops away from the sharer — and the same goes for a screenshot pasted
  elsewhere, or browser history on a shared machine. And `location.hash` is
  readable by any script on the page: the seal holds because this app ships
  no third-party scripts — a property of the build, not of the design, and
  one that a single "just add one analytics tag" change would break
  silently.

## The scaling path (in the order the money dictates)

1. **Today (validation, ~US$ 0–6/month)**: one Node process on a free
   VPS/PaaS serving API + WS + static files. It supports thousands of
   concurrent users in small rooms (the server only signals).
2. **TURN** — *built, deliberately switched off*: the credential path exists
   end to end (`welcome.ice`, `app/turn.ts`), but no provider is configured and
   none is planned for now. That is a product decision, not an oversight: the
   free tier would cover this stage, yet turning it on adds the project's first
   vendor for media-adjacent traffic, and the failure it fixes has not been
   reported by a real user yet. The cost of waiting is known and stated in the
   public copy — the ~10–20% of peers on restrictive networks get chat but no
   media. Flipping it on is two secrets; the self-owned variant (coturn on a
   small VPS, ~+US$ 6/month) sits behind the same protocol field.
3. **Multiple signaling instances** — *done, in production*: state is
   per-room → shard by slug. On Cloudflare that is one Durable Object per slug
   (`worker/`); on a Node cluster it would be sticky routing or Redis pub/sub.
   The UI does not change.
4. **Bigger rooms / millions of visits**: the relay tree pushed this frontier
   out once (the sharer no longer uploads N−1 copies), and encoded passthrough
   plus camera rationing pushed it again (12 seats with audio and screen at
   full quality). What remains is structural: the audio/camera mesh still
   costs N−1 uplinks per participant. The next step is **our own media node**
   — either an SFU (e.g. on top of Pion/werift, or from scratch on libwebrtc)
   behind the SAME signaling protocol, or its distributed cousin: a native
   sidecar in the desktop app that does for every stream what
   `@freecord/encoded-relay` already does for the screen, making each
   installed app a packet relay for its room. That frontier is already drawn:
   `mesh.ts` is the only file that knows the topology is P2P.

## Proving it: the e2e workspace

Three layers of proof live in `e2e/`, each catching what the others cannot:
raw `ws` clients speaking the wire protocol against the real compiled server
(capacity, camera slots, the screen tree checked against `computeScreenTree`
itself, resume in all its shapes), Playwright driving Chromium with fake
media through the actual UI (including a 12-context full room behind
`E2E_HEAVY=1`), and plain-Node load drivers. The browser suite paid for
itself on day one: it caught that a remote camera-off left viewers a black
tile, because a received track stays `enabled` locally no matter what the
sender does — the fix keys tiles off the camera roster.

Measured on loopback (Node edge, 50 rooms × 12 peers, 60 s soak): join →
welcome p95 **6 ms**, sustained ping RTT p95 **21 ms** (n=18 000), chat
fanout 21 600/21 600 delivered at p95 37 ms, camera request → decision p95
6 ms with the slot cap doing its job (484 grants, 1 316 denials), screen
request → route p95 4 ms, zero protocol errors. Two minutes of continuous
room churn (240 lifecycles) left the server's RSS **bounded** (0.82× of
start). Loopback numbers prove the software, not the internet — but they
put a floor under every regression that follows.

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

One debt graduated into a feature — **WS reconnect** (session resume with the
same peerId) — and one graduated into a *switch*: **TURN** is implemented and
left off, so the debt it was meant to pay is still outstanding by choice. See
the sections above.
