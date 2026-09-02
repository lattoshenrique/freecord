# Architecture

## The picture

```
browser A ◄──── WebRTC P2P (voice/video/screen, chat + files on data channels) ────► browser B
     │                                                                                │
     └──WS /ws/rooms/:slug──► our own server ◄──WS───────────────────────────────────┘
                              (rooms, SDP/ICE signaling, presence,
                               screen and camera slots, chat fallback)
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
  bottleneck (N−1 copies of every stream). `maxParticipants: 20` is that limit
  priced honestly: audio and screen are the product's quality promise and do
  not scale with room size (audio is cheap — ~1 Mbps of Opus at 19 copies;
  the screen rides the relay tree), while the camera is the variable that
  adapts — server-granted camera slots shrink as the room grows (≤6 people:
  everyone; 7–9: four cameras; 10–16: three; 17–20: two), and each camera's
  bitrate is a fixed uplink budget divided by the peer count, recomputed on
  every join and leave. The last camera step is what keeps the split
  (4 Mbps / 19 ≈ 210 kbps) above the floor where a face stops being a face. Whoever already has a camera
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
- Screen slots live on the server: a room holds a set of shares, at most
  `ROOM_LIMITS.maxScreens` (3) in start order (`screen-request` →
  `screen-started`/`screen-denied`, `screen-stopped` when one ends), each
  released even on a dropped connection. `welcome` lists the `screens` in
  progress. Three is a downlink budget more than an uplink one — every viewer
  receives every screen — and it fits a whiteboard, a document and a demo on
  a laptop link.
- Camera slots follow the same shape (`camera-request` → grant/deny plus a
  roster in `welcome`): the arithmetic is pure domain code shared by both
  edges, and the server is the referee so twenty clients cannot race each
  other into more cameras than the room can carry.
- Presence rides signaling too: `mute` and `deafen` are broadcast as
  `peer-muted`/`peer-deafened`, and `welcome` carries the `muted` and
  `deafened` rosters so a late joiner sees the same badges. A disabled
  audio track keeps flowing as silence, so nothing on the mesh could tell
  the others a mic was off — the server has to.

## Client (web/src/lib)

- `protocol.ts` — mirror of the server's message types.
- `signaling.ts` — WebSocket client with **automatic resume**: a dropped
  transport reconnects with backoff and presents the `resumeToken` from
  `welcome`, reclaiming the same peerId (see "How a room dies").
- `mesh.ts` — one `RTCPeerConnection` per peer, with **perfect negotiation**
  (the MDN pattern): renegotiations (turning the camera on, sharing a screen
  mid-call) work from both sides without glare. Whoever joins initiates the
  offer toward whoever was already there. A 2 s **watchdog** covers what
  negotiation cannot fix by itself once a signal has been lost (see "A leg
  that dies quietly" below).
- `chat-channel.ts` — chat text on a `chat` data channel of every peer
  connection, sealed exactly as it would be for the server. One path per
  message: text goes peer to peer only when **every** seat in the room has
  an open channel to us; otherwise the whole message goes through the
  signaling server, which relays it as it always has. Nobody receives a
  message twice, so there is no message id and no dedup. The fallback
  moments are short — someone joining, or a leg the mesh is still healing —
  and a peer that can never reach us directly keeps getting chat through
  the server, which is why chat works where media does not.
- `file-transfer.ts` — files on a second, pre-negotiated `files` data channel
  (id 0, created symmetrically so it exists the moment the connection does):
  offer/accept/cancel, 16 KiB chunks with a transfer-id header,
  `bufferedAmount` backpressure, one send queue per peer, sanitized names, a
  1 GB cap and a receiver that refuses more bytes than were offered. Text
  never rides this channel: it is ordered and may hold a megabyte of chunks,
  and a line of chat stuck behind a transfer would arrive late. An image
  pasted into the composer takes this path too, renamed with the moment.
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
  actually in use (the real latency between two people), the effective
  quality of the screen, and the per-sender congestion readings the
  adaptive loop consumes.
- `adaptive-policy.ts` — the pure state machine behind "The adaptive loop"
  below: congestion evidence in, a per-track cap factor out.

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

Each screen now propagates as a **tree**, not a star — and with up to three
shares at once, each share has a tree of its own:

```
        Sharer
       /   |   \
    Ana  Bruno  Enzo        fanout 3
                /   \
             Duda   Caio     depth ≤ 2 up to 13 people (1 + 3 + 9 seats), 3 at 20
```

- The server computes the tree (`computeScreenTree`: BFS, lexicographic order
  of peerIds, fanout 3) and sends each peer a `screen-route` with its children,
  its source, the quality and `of` — whose share this tree carries.
  Lexicographic order is what makes both edges arrive at the **same** tree
  without coordinating.
- A peer with children forwards the track it received and announces
  `screen-relay` for that tree; the server updates its children's source. A
  peer may be a leaf in one tree and a relay in another: the client keeps a
  route per tree and a relay leg per tree it forwards for.
- On the viewer's side the stage follows the newest screen (someone else's
  before our own) and the rest sit in the strip as tiles; a click pins any
  tile — screen or person — and a grid layout gives everything equal area.
  The HUD's quality readings and the stall watch follow whichever screen is
  on stage; system audio plays for every shared screen regardless.
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

## The adaptive loop: closing the budgets' open loop

Every cap above is an assumption: `screen-quality.ts` assumes a 10 Mbps
uplink, `camera-quality.ts` a 4 Mbps one. Whoever has less used to drown —
and, being a relay candidate, drown their subtree with them; whoever has
more was undersold. `adaptive-policy.ts` closes the loop on those
assumptions with what the network actually reports every 2 s sample:

- the encoder's own verdict (`qualityLimitationReason`: bandwidth- or
  CPU-bound),
- loss seen by the far ends (RTCP `fractionLost`, worst peer wins — in a
  mesh the slowest link defines what the room sees),
- the congestion controller's bandwidth estimate
  (`availableOutgoingBitrate`, where the browser exposes one).

Each adapted track (the camera, the sharer's screen) rides a **ladder of
factors** (1 → 0.7 → 0.5 → 0.35 → 0.25) over its composed cap: AIMD with
hysteresis. Sustained congestion (~4 s) steps down; consecutive steps are
spaced by a cooldown (~6 s); stepping back up takes ~16 s of proven calm
AND estimated headroom over everything currently asked of the uplink —
congestion is answered fast and forgiven slowly, which is the difference
between adapting and oscillating. Evidence-free samples hold: silence is
not calm. The user's preset stays the ceiling; the ladder only ever takes
away, down to a floor where the medium stops working (150 kbps for a
face, 500 kbps for readable 1080p text), and gives back what it took.

Division of labor with the pieces that already existed: `priority` decides
*what* congestion sacrifices first (camera, then screen, never voice); the
ladder decides *how much* is sacrificed, per track. CPU pressure moves only
the camera's ladder (at half factor its encode is also halved in
resolution — a starved encoder is a hot one); the screen's
`degradationPreference` already owns that axis choice, and a second hand on
the same wheel oscillates. Relays do not adapt: passthrough forwarding
costs ~nothing, and the re-encode fallback is the exception, not the rule.

The policy is deliberately pure (plain data in, plain data out, unit-tested
without a browser) and applied inside the two encoding funnels
(`roomCameraEncoding` / `screenEncoding` in `use-room.ts`), so every
existing re-application — join/leave, a settings change, a mic swap via
`replaceLocalTrack` — carries the current factor for free. Readings are
scoped per sender (`senderReports` in `stats.ts`): a sharer's connection
carries two outbound videos, and the camera's ladder must never read the
screen's congestion story as its own. Ladders reset when their story ends:
a fresh mesh, a share stopping, the sharer picking a new preset.

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

The one thing the shell adds that is not about media is **the window itself**.
Electron offers an app the system's title bar or nothing at all, and a strip of
Windows grey above a Freecord was the one surface the product's design never
reached — and the first thing anyone saw. So both windows are frameless
(`desktop/src/window-chrome.ts`) and the page draws the bar: the mark, where
you are, the three buttons and the application menu behind the mark, in the
app's own type and colours (`web/src/components/TitleBar.tsx`). macOS keeps its
traffic lights — there they *are* the platform's affordance — and the bar
leaves them room. What the bar costs is a token, not a number each screen
knows: `--titlebar-h`, subtracted once into `--app-h`, which every full-height
screen measures itself against; full screen gives all of it back. The screen
picker window wears the same chrome, and so does the offline page, which is the
one screen that shows up when everything else has failed.

The shell announces what it can do through one additive-safe surface
(`window.freecordDesktop.capabilities`); the site treats a missing flag as
`false`, so old shells and new pages keep working in both directions. The title
bar rides that contract in both directions: the page draws no bar unless the
shell declares `windowChrome`, and a shell whose page never reports one back
puts the menu bar in — a frameless window nobody can close is the one outcome
neither side may ship.

The shell also updates itself (`desktop/src/updater.ts`, zero dependencies):
it polls the same `/api/downloads` catalog the website serves, and applies
per platform as honestly as unsigned binaries allow — Windows installs the
NSIS package silently and the app reopens itself; an AppImage downloads its
replacement next to itself and swaps files on restart; macOS and .deb get a
one-click browser download, the same flow as the first install, because an
unsigned bundle cannot self-replace past Gatekeeper. One prompt per version,
declining is remembered, network failures stay silent, and nothing ever
applies without an explicit click. The page the shell loads is remote, so
the app's FEATURES update on every deploy regardless — the updater only has
to move the Electron shell itself, which changes rarely.

## Product decisions that control cost and complexity

| Decision | Effect |
| --- | --- |
| Small rooms (≤ 20) | Keeps the mesh viable; audio is cheap at 19 copies, cameras are rationed |
| Camera slots shrink as the room grows | Audio and screen never pay for a full room; cameras do |
| At most three screens at once | The screen is the most expensive stream; slots granted on the server, one relay tree each |
| Video off by default | A Discord-style room is mostly voice |
| Empty room expires in 15 min | Nothing sits in memory without people |
| Ephemeral chat, peer to peer first | Zero storage; the server relays text only for a seat that is off the mesh |
| Chat sealed end-to-end | The room key rides the link's fragment; neither the server nor a TURN relay can read the envelopes |
| Files peer to peer, 1 GB cap | A data channel on the connection that already exists; the server never sees a byte |

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
   plus camera rationing pushed it again (20 seats with audio and screen at
   full quality — voice at ~1 Mbps of Opus per peer is the last N−1 cost
   worth paying). What remains is structural: the audio/camera mesh still
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
(capacity, camera slots, the screen trees checked against `computeScreenTree`
itself, resume in all its shapes), Playwright driving Chromium with fake
media through the actual UI (peer-to-peer chat, a file received byte for
byte, several screens at once, presence and its sounds, plus a 20-context
full room behind `E2E_HEAVY=1`), and plain-Node load drivers. A fourth,
Worker-only probe runs the real Durable Object under `wrangler dev` (see
"Two edges over one core"). The browser suite paid for
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
`ROOM_LIMITS`, the screen slots and their release on a dropped connection.
The core tests (`server/test/`) hold for both, and
`e2e/worker/screen-drop.mjs` (`npm run check:worker --workspace e2e`) drives
the real Worker under `wrangler dev` through the abrupt drop, the quick
rejoin, the zombie and the mute presence, with timing budgets.

One Worker-only rule, learned the hard way: the Durable Object runs every
sweep on a single alarm, and a join or a resume must only ever move that
alarm **earlier**, never later. Setting it outright postponed the release a
dropped sharer's slot had scheduled, and every further join pushed it out
again.

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
   detached **sharer** loses its screen slot after `screenLockGraceMs` (10 s),
   because one frozen screen blocks a slot for the whole room while a frozen
   tile blocks nobody. The seat itself survives the full 35 s. The 10 s is a
   cutoff, not a deadline: release rides the sweep, so it lands at ~10 s on
   the Worker (detach schedules an early alarm) and 10–20 s on Node (10 s
   sweep cadence). With slots to spare, a sharer who drops and comes straight
   back shares again at once; the ghost seat's share still frees at the
   grace. And a `welcome` that says this seat holds a screen while the page
   has no capture to back it (the seat came back without the stream)
   releases the slot instead of leaving the room stuck behind it.
2. A room with nobody in it for `emptyTimeoutMs` (15 min) ceases to exist; the
   link starts answering `room_not_found`. Detached seats count as occupancy
   (and toward `maxParticipants`) until they expire.

The client runs the same clock in reverse — but silence no longer ends the
session: with no `pong` in time it forces the transport down and goes through
the resume path (backoff capped well inside the 35 s grace). The session only
ends when the resume is refused (`resume_invalid`: the seat was swept) or the
attempts run out.

**Signals do not die with the transport.** A renegotiation that lands in the
grace window — someone turning a camera on, a route change, an ICE restart
triggered by the very blip that dropped the socket — used to be discarded by
the server (no live socket for the addressee) and by the client (no open
socket to write to). The offering side then sat in `have-local-offer` for the
rest of the call: the browser fires `negotiationneeded` only from `stable`,
and an impolite peer ignores every rival offer meanwhile. That was the
"frozen tile that only F5 fixes". Now both edges **hold** signals for a
detached seat (`enqueueSignal`: bounded, and coherent per sender — a new
description from X supersedes X's older offer and its candidates, because
the client may have rolled that negotiation back), delivered in order right
after the resume's `welcome`; and the client holds its own answers and
candidates for a same-seat welcome (`signaling.ts`, outbox — offers are
deliberately not held, since a stale offer arriving after a fresh one would
put the peer on an ICE generation that no longer exists).

### The one number that outlives a room

A room leaves nothing behind except one increment on a counter, and only if it
was a room where something happened: **two people or more, together for twenty
minutes** (`server/src/domain/room-stats.ts`). A clock runs only while the head
count is at least two, so a link opened and abandoned is worth nothing and two
eleven-minute stretches add up. Each room reports itself **once**, ever.

Where the total lives follows the edge. On the Worker, a second Durable Object
(`StatsDurableObject`, one instance) holds a single integer — no slug, no name,
no timestamp, nothing that could be read back into a room. On the Node edge it
is a field on the registry, in memory, and it starts over with the process.
Both answer `GET /api/stats`, and the home page draws the number under the
button (hidden while it is zero).

Two rules it obeys, both learned the hard way:

- **It schedules nothing.** The mark is twenty minutes away and the sweep the
  room already runs comes every ~17 s, so the crossing is found on an alarm
  that was coming anyway. A Durable Object has one alarm for everything
  (screen locks, zombies, expiry); a counter is the last thing that should
  move it.
- **It is an aggregate or it is nothing.** Keeping *which* room, or when, would
  be persistent metadata about rooms — which is exactly what the promise on
  /community says does not exist. A number that only goes up says how much the
  thing is used and nothing about who used it.

### A leg that dies quietly

Three watches, because the mesh has no referee and a `RTCPeerConnection`
never repairs itself:

- **Negotiation left open** past 12 s (`mesh.ts`): the offer or the answer
  was lost. Roll back to `stable`, restart ICE, reoffer through the regular
  path. On a resumed signaling session this fires at once for every peer
  (`reconcile`), before the held signals arrive.
- **ICE down**: `failed` restarts at once; `disconnected` after a 7 s grace;
  and a restart that changes nothing is followed by another, the wait
  doubling to 28 s. One lost restart offer used to be the end of the road.
- **Voice gone quiet on a path that claims to be connected** (the NAT-rebind
  zombie the screen's stall watch already hunts): each peer's inbound audio
  packet counter is read on the 2 s stats tick, and a counter that stops
  moving for ~8 s earns one ICE restart per episode
  (`advanceAudioStall`). Chromium keeps sending silence frames for a muted
  microphone, so flat means the path, not the person.

On the Cloudflare edge a peer survives DO hibernation: participant identity
(with its resume token) goes in the socket's `serializeAttachment`, and the
screen shares, presence rosters, detached seats and metadata go in storage —
nothing depends on process memory.

## Conscious MVP debts (mapped, not forgotten)

- **Chat does not persist** (reload and it is gone) — a privacy and a scope
  decision; persistence would require storage and a retention policy.
- **No moderation/kick**: anyone in the room can rename it (`PATCH
  /api/rooms/:slug`, both edges), and nobody has more power than that; the
  protocol can carry it (`kick` would be one more message type, with a
  moderation secret in the creator's localStorage).
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
