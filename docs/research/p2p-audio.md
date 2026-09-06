# P2P audio research: bounded connectivity and forwarding costs

Runtime integration now has its own [activation record](audio-activation.md).
The measurements below describe the original isolated experiments.

This release publishes executable experiments and their measured decisions.
It does not enable sparse media in product rooms or raise the 20-seat limit.
The media plane remains participant-owned; the coordinator never carries audio.

## Reproduce

From the repository root, after `npm install` and installing Playwright Chromium:

```sh
npm run typecheck
npm run research:topology --workspace e2e
REPEATS=3 CASES=track:1,track:2,track:3,track:4,encoded-inplace:2,encoded-inplace:3,encoded-inplace:4,track:1:dtx,track:2:dtx,encoded-inplace:2:dtx,datachannel:1,datachannel:2,datachannel:3,datachannel:4 OUTPUT=/tmp/freecord-audio-matrix.json npm run research:audio --workspace e2e
REPEATS=1 CASES=encoded:2,clone:2,foreign:2 OUTPUT=/tmp/freecord-audio-constructor.json npm run research:audio --workspace e2e
CASES=5:1,10:4,20:4,50:1,50:4,50:10,50:50 OUTPUT=/tmp/freecord-sparse-research.json npm run research:sparse --workspace e2e
BROWSERS=5 CASES=50:10 OUTPUT=/tmp/freecord-sparse-multibrowser.json npm run research:sparse --workspace e2e
DECODE=0 CASES=50:10 OUTPUT=/tmp/freecord-sparse-nodecode.json npm run research:sparse --workspace e2e
BATCH=1 CASES=50:10 OUTPUT=/tmp/freecord-sparse-batch.json npm run research:sparse --workspace e2e
```

Run browser experiments serially. They own their loopback HTTP listeners and
browser contexts and do not use the shared `e2e/.server.json`. There is no
remote target option. Audio is synthetic; no microphone permission, user
content, production room, or deployment is part of the experiments.

`REPEATS` is bounded to 1–10. Audio cases use `mode:hops[:dtx]`, with one to
four network hops (one hop means direct, four means three relays). Sparse cases
use `participants:sources`, with up to 50 participants. Its five-second window
is a transport probe, not a sustained capacity qualification.
`BROWSERS` (1–10) splits contexts between independent browser instances on the
same host. `DECODE=0` isolates transport cost and cannot establish decoded audio.
`BATCH=1` groups logical packets per neighbor with a requested 2 ms timer and a
1200-byte envelope cap. Both controls keep the same graph and source count.

Every candidate failure remains in JSON and produces a nonzero exit code.
`foreign` is an explicit negative control: it passes the *control* only if
upstream audio is decoded, downstream writes occur, and the final listener
receives no pulse. This is never counted as a working transport. `clone` and
`encoded` are actual forwarding candidates and must deliver audio to pass.

## Three different experiments

### Audio hops

`audio-peer.ts`, `audio-transform.ts`, `audio-datagram.ts`, and
`audio-capture.ts` compare the same 48 kHz mono synthetic source through:

| Mode | Operation |
| --- | --- |
| `track` | Received MediaStreamTrack attached to a downstream sender |
| `encoded` | Clone a donor RTCEncodedAudioFrame, rewrite RTP timestamp, substitute upstream payload |
| `clone` | Clone the donor without changing its metadata or payload |
| `foreign` | Write a copied receiver-owned frame into a different sender pipeline |
| `encoded-inplace` | Replace the payload in the original downstream donor, retaining its envelope |
| `datachannel` | AudioWorklet capture, WebCodecs Opus, unordered/unreliable DataChannel forwarding, per-participant decode and fixed-lead playout |

The RTP paths still decode at relays and run downstream donor encoders. Byte
preservation does not imply codec CPU elimination. A receiver renderer is
explicitly consuming each remote stream: the initial instrument without it
saw inbound packets and successful transform writes but no decoded samples.

Each measured repetition sends six pulses after sustained silence. Onset is
measured with 5 ms polled Web Audio taps and includes codec/receiver buffering.
It excludes physical capture, APM and hardware playback. It is not acoustic
latency or a first-phoneme quality test. Unequal pulse counts or negative
index-aligned deltas invalidate that latency sample, rather than proving
negative delay. Payload hashes, decoded pulses and errors are separate checks.

CPU is the sum of process CPU time for the entire browser divided by elapsed
time, not the cost of one relay. Reversing alternate repetitions exposes order
bias. It is a short local experiment with other applications on the machine;
small CPU differences are not a production optimization claim.

The DataChannel receiver uses a fixed 40 ms playout lead, bounds queued audio,
and reports underruns. Relays forward bytes before their own decode. It does
not implement an adaptive jitter buffer, clock recovery, congestion estimation,
FEC, source authentication, or E2EE. Unordered SCTP still has congestion control.
The capture worklet writes zero samples when an input block has no channels;
skipping that block leaves the encoder holding old audio during silence in
Firefox. Playout preserves decoded timestamp gaps instead of concatenating
unrelated time intervals. Neither behavior is a general clock recovery system.

### Connectivity and multi-source routing

`server/src/domain/media-topology.ts` is an experimental pure domain module.
It is imported by tests and research drivers, **not by product signaling**.
It separates a persistent connectivity graph from per-source shortest-hop DAGs.

Connectivity preserves surviving edges, grafts new members into established
edges when degree is saturated, repairs disconnected components, and fills
remaining degree with deterministic shortcuts. A batch-join regression ensures
new members do not form a cluster behind one newly elected relay. Generations
increase monotonically; speaker activity does not alter the graph.

Routing chooses among shortest-hop parents using aggregate normalized outgoing
load. Capacity is a hard bound. An unsuccessful allocation returns no partial
room plan and identifies the failed source/listener. It means the heuristic
did not find a plan; longer paths or different allocations might still work.
It is not a proof that the room is infeasible.

The driver compares independent current screen trees against degree-6/8
overlays, with and without global load balancing, for five deterministic seeds
and 5/10/20/30/50/100/200 participants. These are graph measurements, not browser
capacity, bandwidth, or latency measurements. Copy budgets are unitless work
units; production admission needs measured bitrate and upload capacity.

### Sparse multi-source transport

`sparse-peer.ts` runs one independent browser context per participant, one PC
per selected neighbor, and one encoded Opus source per active participant.
All listeners independently decode each remote logical source. Different
frequencies identify sources; parent validation, sequence checks and a root
exclusion detect routing errors. Every relay is also a listener.

The test verifies max degree, all expected logical sources, decoded samples,
source frequency, delivery ratios, queue drops, errors and self-return counts.
It uses real DataChannels with `ordered: false` and `maxRetransmits: 0`.
It excludes playout, APM, physical networks, TURN, malicious peers and product
signaling. Successful 50-peer transport is not successful 50-person calling.

## Admission gates still required

- Physical capture-to-playback latency and speech quality across supported browsers.
- Independent devices, real TURN paths, restricted bandwidth, jitter and burst loss.
- Individual volume/mute and source identity in the actual room UI.
- Authenticated sources, replay windows, membership/key rotation and privacy review.
- Warm backup routes and make-before-break, with useful audio recovery p95 below 1.5 seconds.
- Explicit peer upload budgets shared with screen, camera, chat and temporary file connections.
- Sustained 50/1, 50/4, 50/10, 50/20 and everyone-speaking runs; no arbitrary speaker cutoff.
- Coordinated Node/Worker protocol integration and a bounded fallback at large room sizes.

Do not fall back to full mesh at 50 participants and call that sparse capacity.
Existing camera admission, screen routing and room limits remain unchanged.

## API references

- [WebRTC Encoded Transform](https://www.w3.org/TR/webrtc-encoded-transform/): pipeline ownership and ordered frame handling.
- [Opus RTP](https://www.rfc-editor.org/rfc/rfc7587.html): DTX/FEC negotiation is not proof of their actual behavior.
- [WebRTC DataChannels](https://www.rfc-editor.org/rfc/rfc8831.html): reliability options and SCTP congestion behavior.
- [WebCodecs](https://www.w3.org/TR/webcodecs/): codec availability requires testing the actual configuration.
- [SFrame](https://www.rfc-editor.org/rfc/rfc9605.html): an input to later media encryption work, not implemented by this release.

## Measured decisions — 2026-09-05

Environment: Apple M5, 16 GiB RAM, Node 26.5.0, Chromium 151.0.7922.34.
The raw experiments ran from additions based on commit `3632267`; this report,
the executable sources and sanitized results are published together. The
[machine-readable record](https://freecord.lattoshenrique.workers.dev/research/p2p-audio.json)
includes individual experiment cohorts and failed scenarios. No SDP or ICE
addresses are published.

**Connectivity winner: one persistent degree-bounded overlay, with global
route allocation.** At 50 sources, independently repeating the current screen
tree required 1,046 edges and max degree 47. Degree 8 required 200 edges and
depth 3 for each of five seeds. The balanced allocator's maximum outgoing
copies were 54–60, against 57–65 without balancing on those same graphs.
Degree 6 used 150 edges, but maximum depth was 4 for all five seeds. Degree 8
is the initial latency-oriented experiment; degree 6 remains the lower-state
alternative. Neither figure is an upload measurement or a global optimum.

**Forwarding winner for further research: Opus over DataChannel.** Native
track forwarding passed all three repetitions at each tested depth, but its
median onset rose from 44 ms direct to 202 ms with three relays. Replacing
bytes in the original RTP donor preserved payloads, but did not eliminate
codec work: its three-hop case produced seven detected onsets for six source
pulses in two of three repetitions. At four hops its valid samples had median
onset 239 ms. Cloning donor frames, with or without metadata rewriting, emitted
no downstream audio in the Chromium probe despite successful writes. These
approaches do not qualify as zero-cost passthrough.

DataChannel byte forwarding kept the initial Chromium hop matrix near 65–69 ms
median onset from one through four hops, with all 12 repetitions delivering
the six pulses. The final timestamp/silence handling implementation is tested
again separately and its results replace that cohort in the published JSON.
CPU did not uniformly beat RTP; the advantage measured here is preserving
encoded payloads without accumulating the RTP relay pipeline's hop delay.

**Silence winner for RTP experiments: Opus DTX.** Sustained-silence source
traffic changed from about 50 packets/s and 1.2 kb/s of payload to 4.5 packets/s
and 0.072 kb/s in Chromium. Direct/one-relay DTX cases preserved all measured
pulses in three repetitions each. Firefox 153 and WebKit 26.5 also delivered
the direct DTX probe at about 4.5 packets/s. These tones do not establish
speech quality, first-phoneme preservation, FEC recovery, or universal browser
support. DTX is not enabled in product SDP by this release.

### Multi-source browser evidence

All rows below use the same degree-8 algorithm and five-second measurement.
Browser instances share one physical host; this is not a multi-device test.

| Participants / sources | Browser instances | Minimum delivery ratio | Result |
| --- | --- | --- | --- |
| 5 / 1 | 1 | 100% | Transport and source decoding passed |
| 10 / 4 | 1 | 100% | Transport and source decoding passed |
| 20 / 4 | 1 | 100% | Transport and source decoding passed |
| 50 / 1 | 1 | 100% | 200 edges, degree 8, decoding passed |
| 50 / 4 | 1 | 100% | 200 edges, degree 8, decoding passed |
| 50 / 10 | 1 | 43.0% | Failed delivery/decoding gates |
| 50 / 10, decoder disabled | 1 | 86.9% | Failed; isolates some decoding cost |
| 50 / 10, 2 ms batching | 1 | 49.6% | Failed; batching did not remove the limit |
| 50 / 10 | 5 | 100% | All sources decoded; 5.96 aggregate CPU cores |
| 50 / 20 | 10 | 99.6% | Failed: decoder queue drops, minimum 194 decoded frames |
| 50 / 50 | 10 | 9.6% | Failed: queue pressure and insufficient source cadence |

Changing only the browser-instance distribution made 50/10 pass. The earlier
failure therefore cannot establish a P2P or graph limit; shared browser
execution materially affected it. This experiment does not identify which
native thread or subsystem dominates. With 20 sources, 14,693 application
queue drops remained despite near-complete packet delivery. With 50 sources,
aggregate CPU approached nine cores and the slowest source emitted only 173
packets. Distributed physical machines and profiling are the next controls.

### Browser differences and failed experiments

- The initial capture worklet skipped input blocks without channels. Firefox
  delivered duplicated pulse onsets because the encoder held old audio across
  silence. Writing zero samples for those blocks fixed the reproduction:
  the final two-hop Firefox probe delivered exactly six pulses, p95 72 ms.
- WebKit 26.5 passed two-hop track forwarding, direct DTX, and two-hop
  DataChannel (six pulses, p95 68 ms). Its first direct RTP case hit the
  five-second ICE-gathering deadline. That failure remains recorded; this is
  not a complete Safari qualification.
- The constructor probe's successful writer counters and absent downstream
  media are both preserved as a failed forwarding experiment.
- Independent trees lose on degree; packet batching loses as a remedy for
  this host's 50/10 limit; in-place encoded RTP loses on stable multi-hop
  onset and demonstrated codec savings. They remain reproducible comparisons.

The production recommendation is to keep the current media behavior while
the winning experimental substrate gains bounded jitter/clock recovery,
authenticated sources, upload admission, make-before-break and real device
coverage. No 50-person production claim is made by this release.

## Release validation and remaining baseline failure

- All five workspace typechecks passed; production builds and Worker dry-run passed.
- The regular regression passed 694 unit tests and 65 protocol/browser E2E tests
  against a fresh web build. Its separately gated heavy case was skipped there.
- The explicit 20-person heavy test failed a 20-second join assertion with one
  browser instance. A four-instance control caused severe host resource pressure
  and was stopped; it did not establish a valid mesh baseline. Owned browser
  processes were cleaned up. Neither attempt is reported as passing.
- The heavy harness now supports `E2E_HEAVY_BROWSERS=1..20`, retains the original
  assertions, and additionally checks N−1 connected PCs and advancing audio
  counters. It writes `mesh-baseline.json` only after those checks pass. Its
  new full-mesh measurement has not passed on this host.
- The runtime media path, signaling protocol, camera limits, screen behavior
  and 20-seat admission value are unchanged. Publication is the tested research
  code and report, plus a static result artifact; it does not activate a new
  transport or claim that the heavy production journey has been qualified.

Reproduce the additional host-layout control explicitly (it is resource-heavy):

```sh
E2E_BUILD_WEB=1 E2E_HEAVY_BROWSERS=4 npm run test:heavy --workspace e2e
```
