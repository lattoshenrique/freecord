# Sparse audio activation

**Current production status: suspended.** After the first activation, a user
reported an intermittent perceived lower voice pitch in Brave. A local synthetic
Brave probe reproduced a frequency change under reordered delivery, although
not the exact reported real-call symptom. Production was redeployed with
`VITE_SPARSE_AUDIO=0`; native P2P RTP and timestamped chat events were verified
with two production browsers. The root `npm run deploy` now enforces that flag
through `scripts/deploy.mjs` so a later ordinary publication cannot silently
reopen the quality gate. Local research builds can still exercise the pilot.

The first runtime integration builds on [the measured experiments](p2p-audio.md).
The selected substrate is a degree-eight participant overlay carrying signed,
encoded Opus packets on unordered DataChannels with `maxRetransmits: 0`.
Automatic sparse activation is limited to **10 participants**, the validated
product envelope. Larger rooms use the existing native P2P path. This release
keeps the room admission limit at **20**. It does not certify 50-person
calls or treat a same-host browser experiment as a WAN capacity result.

## Effective behavior

The behavior below describes local/research builds. The public deployment
wrapper currently closes this activation gate with `VITE_SPARSE_AUDIO=0`.

The explicit build flag `VITE_SPARSE_AUDIO_RESEARCH_20=1` permits testing up to
20 sparse participants; production does not set it. Crossing the validated
envelope withdraws sparse capability for that seat and restores native P2P.

Capability negotiation runs automatically unless the web build sets
`VITE_SPARSE_AUDIO=0`. WebCodecs Opus encode/decode, Web Audio at 48 kHz,
AudioWorklet and WebCrypto must initialize successfully. The first encoded
profile is mono voice at 48 kbps; the existing stereo music profile uses native
RTP, including when selected during a call. An unsupported member
keeps the room on native WebRTC RTP. A failed capable member withdraws once per
seat, preventing repeated transport oscillation. A new seat can negotiate again.

The shared `audio-network.ts` coordinator runs in both Node and the room Durable
Object. It separates connectivity neighbors from per-source distribution trees,
allocates every source together, caps degree at eight and aggregate outgoing
copies at 32 per participant per generation (old/new overlap may temporarily
double that work). Sources are never dropped to make allocation fit.
Each source uses one encoder. A relay verifies and forwards the same encoded
payload; its decoder serves its own listener, without feeding another encoder.

Startup retains the native mesh while encoded routes warm up. Native senders
switch with `replaceTrack(null)`/`replaceTrack(track)`, preserving their
negotiated m-lines and avoiding renegotiation for transport activation. A sparse generation
commits only after every listener receives authenticated packets from every other
source and decodes audio. Old/new generations overlap for 750 ms. During fallback, each source retains its old playout until native packets
advance; an absent member cannot block other listeners switching locally.
Sequence windows
reject repeated playout across that overlap, and routes never return a source to
its owner. Physical degree is bounded **after convergence in audio-only rooms**;
startup, native fallback and current camera/screen legs can exceed eight. This
first activation does not yet eliminate the full-mesh bootstrap signaling cost.

Source identity, mute, volume and speaking indication continue through the
existing participant mixer. Camera video is composed into the same logical
participant stream. Existing camera slots, bitrate policy and screen trees remain
in force. Files between updated clients establish temporary direct connections;
file chunks do not share the audio SCTP association. Both still share the user's
uplink: separate connections are not an implementation of a global upload budget.
Chat uses its existing encrypted signaling fallback when direct channels do not
reach every member; routing chat over the overlay is subsequent work.

## Transport and privacy boundaries

The packet header binds generation, source index, sequence, capture timestamp and
payload length to a P-256 signature. Public keys are ephemeral room metadata;
private keys stay in the originating browser. DTLS protects each connection.
This is **not relay-opaque media E2EE**: members are listeners and can decode the
Opus payload. SFrame/key rotation remain research work, not a claimed feature.

Packets are bounded to 1500 bytes. Per-source replay/verification queues, codec
queues and channel buffering have explicit limits. A receiver accepts a packet
only from the parent assigned to that source and generation, after signature
verification. Repeated capability advertisements cannot repeatedly reroute a room.

The custom path supplies sequence/replay checking, a short reorder window and a
bounded Web Audio playout clock (60–160 ms target lead). It does not recreate all
RTP facilities: loss concealment/FEC integration, RTCP, NACK, per-edge audio BWE,
A/V synchronization and a measured global upload scheduler remain open. SCTP
congestion control still exists; unreliable messages still compete for its send
budget. Native RTP requests Opus DTX; the earlier RTP silence benchmark must not
be reused as a bandwidth claim about signed DataChannel packets.

## Room event timeline

The local chat includes translated, timestamped joins, definitive departures,
signaling interruptions/restoration, screen starts/stops and local audio fallback.
An interruption is distinct from leaving the room; a successful resume preserves
identity and does not invent another join. The timestamp is the receiving
browser's wall clock, displayed with seconds. It is not an authoritative record
of events missed while offline. Welcome reconciles the current roster without
inventing historical timestamps. Events share the bounded, in-memory chat and
its local export; no logging service or server-side chat history is introduced.

## Reproduction and release evidence

Use a fresh web build. Keep browser/Worker lifecycle checks sequential: rebuilding
assets while `wrangler dev` is serving can restart the Worker and invalidate a
socket-lifetime test.

```sh
E2E_BUILD_WEB=1 npm test
E2E_BUILD_WEB=1 VITE_SPARSE_AUDIO_RESEARCH_20=1 E2E_SPARSE_PEERS=20 E2E_SPARSE_BROWSERS=4 npm test --workspace e2e -- --project=browser sparse-audio.spec.ts --grep 'actual room'
node e2e/worker/restart-resume.mjs
# With a local Worker on 8787 and no concurrent rebuild:
npm run check:worker --workspace e2e
```

The sparse browser test inspects actual constructed PeerConnections, exercises
independent sources and checks rendered speaking indication. The native full-room
baseline explicitly disables AudioEncoder to preserve its N−1 RTP control.
Neither test measures microphone-to-speaker acoustic delay or perceptual quality.

## Next admission gate: 50

Remove full-mesh bootstrap and replace full-room route snapshots with stable
neighbor establishment and bounded route deltas. Validate 50 actual product
clients with 1, 4, 10 and all simultaneous synthetic sources. Measure per-peer
upload including signatures/DTLS/SCTP, CPU, memory, acoustic startup, audible
recovery and playout underruns. Add WAN latency/jitter/loss, limited uplinks,
TURN edges, background tabs and multiple browser engines. Certify fallback and
relay loss before raising admission. The earlier 50-context research harness
remains supporting transport evidence, not this admission gate.

## Brave playout quality gate — 2026-09-05

The runtime capture, signing, real loopback DataChannels, decode and logical
source playout were exercised in a fresh Brave 151 profile. One source emitted
a continuous 220 Hz synthetic tone; the listener's stream was sampled at 48 kHz.
Each run recorded eight seconds. A Hann-windowed frequency scan measured the
dominant tone in 100 ms windows, excluding the first window. This omits physical
microphones, browser APM, speakers, WAN paths, human speech and perceptual scoring.

| Candidate / condition | Dominant Hz min–max (median) | Observation |
| --- | --- | --- |
| Current runtime / clean | 219–221 (220) | Stable tone |
| Current runtime / delivery delays 0, 60, 10, 30 ms | 220–235 (232) | Failed frequency preservation |
| Current runtime / 80 ms main-thread stall every 500 ms | 220–220 (220) | Stable in this trace |
| Monotonic decode, 20 ms reorder / delayed delivery | 214–239 (225) | Failed; 99 packets discarded before decode |
| Monotonic decode, 60 ms reorder / clean | 220–220 (220) | Stable tone |
| Monotonic decode, 60 ms reorder / delayed delivery | 220–220 (220) | Stable in this trace, no decoder-order drops |
| Monotonic decode, 60 ms reorder / main-thread stalls | 219–220 (220) | Stable in this trace |

No scheduled buffer overlap was observed; buffer rates remained 48 kHz and
playback speed remained 1. The larger reorder window is the winner **for this
one trace**, not a speech-quality certification. The variants alter the module
served by the local experiment; neither candidate changes the product runtime.
The original real-call report concerned a perceived lower voice pitch; the
baseline delay experiment instead produced a higher dominant tone. This is
supporting evidence of a quality defect, not an exact reproduction of that call.

The [raw summary](brave-playout-quality.json) retains every exploratory row.
Reproduce the baseline failure and candidate (a 1% frequency tolerance, no silent
windows or overlapping buffers, and no native fallback are required):

```sh
BROWSER=brave QUALITY_VARIANT=baseline QUALITY_CASES=jitter node e2e/research/run-playout-quality.mjs
BROWSER=brave QUALITY_VARIANT=ordered60 node e2e/research/run-playout-quality.mjs
```

`BROWSER=chromium` is the portable default. For Brave outside the default macOS
installation, set `BRAVE_EXECUTABLE`. `OUTPUT` selects the local JSON destination.
Failed candidates exit nonzero. Before activation resumes, test actual speech,
independent devices, greater/bursty jitter and packet loss, DTX transitions and
first-phoneme preservation. A tone that remains in tune is insufficient to
declare a voice call good.

The published runner was then verified against Brave: the repeated baseline
jitter case failed again (220–234 Hz, median 231); `ordered60` passed clean,
jitter and stall cases (3/3). Both verification cohorts are retained in the JSON.

## Recorded failures and decisions

- Initial ten-person churn exposed incomplete ICE gathering after glare,
  candidates arriving before SDP, and a native RTP stall monitor treating an
  intentionally stopped sender as a dead path. The integration now keeps RTP
  m-lines warm, buffers early candidates, serializes negotiations, assigns an
  initial offerer, and has a bounded watchdog for ICE stuck in `new`. A
  `max-bundle` experiment did not fix the failure and was reverted.
- Separate logical audio initially hid camera video from the participant tile.
  Composing the camera into the logical stream restored the camera regression.
- Fallback now watches native packet progress per source. A disappeared seat
  does not block other listeners behind a global acknowledgment barrier.
- Before the final admission gate, two consecutive five-scenario sparse runs
  passed (10/10 tests), including actual ten-person rooms, source mute,
  compatibility fallback, channel failure, signature tampering and replay.
- Twenty actual product clients across four Chromium processes exceeded the
  unchanged 90-second acceptance deadline, including an isolated repeat. A
  separate run overlapped the unit suite and is unsuitable for capacity claims.
  Host: Apple M5, 16 GiB, other user workloads present. These failures are not a
  physical P2P limit; they leave the twenty-person sparse product gate closed.
- A Worker screen-lifetime run was invalidated by rebuilding watched web assets
  during `wrangler dev`; the reload closed its sockets. Run that gate after the
  final build, without a concurrent rebuild.
- The production two-browser smoke exposed a missing reciprocal WebSocket close
  frame: interruption was announced, but the browser stayed `CLOSING` and did not
  begin automatic resume within 15 seconds. A new local Worker regression also
  failed before the fix. The close handler now explicitly completes the handshake
  after detaching the seat, as required by the deployment's pre-April-2026
  [Cloudflare compatibility date](https://developers.cloudflare.com/durable-objects/api/base/).

The room HUD uses authenticated sequence-span loss, arrival jitter and scheduled
playout delay while sparse audio is active. Loss is cumulative since that source
was first received, and covers its complete route; it is not attributed to the
last relay edge. Native mode retains the existing RTP interval statistics.

Final release gates on this implementation:

| Gate | Result |
| --- | --- |
| TypeScript, all five workspaces | Passed |
| Server unit tests | 196 passed |
| Web unit tests | 489 passed |
| Encoded relay unit tests | 25 passed |
| Initial fresh-build Node protocol + browser E2E | 75 passed, 1 opt-in native heavy control skipped |
| Post-handshake-fix Node protocol + browser E2E | 74 passed, 1 failed (intermittent tile animation), 1 opt-in native heavy control skipped |
| Production build | Passed |
| Local Worker restart/resume | 17 checks passed, including close-handshake completion, route/key persistence and route-before-held-signal ordering |
| Local Worker screen/presence/ownership lifecycle | All seven scenarios passed; dropped screen released at 10 s, zombie at 35 s |

The fresh browser suite includes the default eleven-seat activation rejection,
all ten sources heard, zero active native microphone senders after sparse commit,
source mute/volume, camera/screen regressions, tampering/replay, a disappeared
participant, music fallback and timestamped chat events. Worklet capture also
uses a tested eight-buffer credit bound so a stalled main thread cannot accumulate
unbounded PCM messages. The twenty-person sparse stress result remains failed;
it is deliberately excluded from the automatic production envelope.

The post-handshake-fix full suite exposed an intermittent `speaking.spec.ts`
failure: two tiles replayed `rise-in` during the mute observation window. An
isolated unchanged-test cohort also returned two passes and one failure.
Temporary animation tracing observed both existing tiles restarting as their
first latency readings appeared; it did not establish the rendering root cause.
The diagnostic instrumentation was removed. This visual finding remains open;
the Worker-only handshake correction cannot affect the Node edge used by that
test. All eight sparse-audio scenarios and the chat event scenario passed in
the post-fix full suite. Its red result is retained, not replaced by isolated
passing runs or a weaker animation assertion.
