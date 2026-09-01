# @freecord/encoded-relay

Encoded-frame passthrough relaying for WebRTC forwarding trees, built on
[WebRTC Encoded Transforms](https://www.w3.org/TR/webrtc-encoded-transform/)
(`RTCRtpScriptTransform`). MIT, zero dependencies, TypeScript source.

## Install

```sh
npm install @freecord/encoded-relay
```

Ships compiled ESM plus type declarations (and the TypeScript source, for
source maps and for bundler setups that prefer it). The worker module is a
sibling file resolved via `new URL('./relay-worker.js', import.meta.url)`,
which every modern bundler — and the bare browser — understands.

## Why

In an application-level forwarding tree (or P2P CDN), a relay peer receives a
video track and re-sends it to its children. The naive wiring — feed the
received `MediaStreamTrack` into each child's `RTCRtpSender` — makes every
relay **decode and re-encode** the video: ~50–150 ms of added latency per hop,
one compression generation lost per hop, and a full encoder's worth of CPU
spent on someone else's stream.

This package forwards the received **encoded** frames to the downstream
senders byte-for-byte instead. The decoder still runs (the relay usually wants
to display the stream too), but the downstream encoders are reduced to cadence
donors whose output is discarded — so they can be crushed to a tiny
resolution/bitrate via `setParameters` and cost almost nothing.

## How it works

One module worker hosts both sides of every pipe:

- The **upstream** transform sits on the `RTCRtpReceiver`. Each encoded frame
  has its bytes copied into the substituting downstreams' queues and is passed
  through unchanged, so local decode/display never stops.
- Each **downstream** transform sits on an `RTCRtpSender` that is still fed
  the decoded remote track. For every frame the local encoder produces, the
  transform discards the encoder's bytes and emits the oldest queued upstream
  frame instead — rebuilt with `new RTCEncodedVideoFrame(donorFrame,
  { metadata })` so frameId/dependencies stay monotonic and self-consistent
  and the RTP timestamp follows the upstream clock.

Frames never leave the worker; routing between the two sides is by ids passed
through the transform options.

Downstreams start in **identity** mode (frames pass through untouched — the
ordinary re-encode path, plus one worker hop) and are promoted to
**substitute** only when the caller has verified the codec matches and frames
are flowing. Any failure demotes back to identity and asks the local encoder
for a keyframe, so a broken passthrough degrades to plain re-encoding instead
of a dead stream.

## API

```ts
import { encodedRelaySupported, RelayPipe, codecsMatch, preferredCodecOrder } from '@freecord/encoded-relay';

if (encodedRelaySupported()) {
  const pipe = new RelayPipe();
  pipe.onstall = (sender, reason) => {
    // demote this child to your re-encode path and restore its encoder params
  };

  pipe.attachUpstream(receiver);            // RTCRtpReceiver of the incoming track
  pipe.addDownstream(sender);               // starts in identity mode
  // ...negotiate the child with preferredCodecOrder(upstreamCodecs, senderCapabilities),
  // verify the active codecs with codecsMatch(via getStats), then:
  pipe.setDownstreamMode(sender, 'substitute');
  crushEncoder(sender);                     // scaleResolutionDownBy: 4+, tiny maxBitrate
  pipe.requestKeyFrame();                   // children join on a fresh keyframe

  pipe.removeDownstream(sender);            // child left
  pipe.close();                             // detaches transforms BEFORE killing the worker
}
```

- `encodedRelaySupported()` — feature detection: module `Worker`,
  `RTCRtpScriptTransform`, and a constructible `RTCEncodedVideoFrame` (the
  Chromium-only piece). Construction failures at runtime still demote the
  affected downstream, so this only needs to be right often enough to avoid
  pointless setup.
- `RelayPipe` — one upstream, N downstreams. `upstreamFlowing` reports
  whether encoded frames are actually reaching the worker (gate promotion on
  it); `onstall` fires when a substituting downstream stops emitting while
  the upstream advances, or when the worker demoted it itself.
- `codecsMatch` / `preferredCodecOrder` — passthrough requires the child to
  negotiate the SAME codec as the upstream leg. `preferredCodecOrder` builds
  a `setCodecPreferences` list with the upstream's codecs first (set it in
  the same tick as `addTrack`, before `negotiationneeded` fires);
  `codecsMatch` verifies the actually-active pair from `getStats`.
- `FrameQueue`, `decideSubstitution`, `RelayRegistry` — the pure policy
  pieces, exported for testing and reuse.

The worker is created with
`new Worker(new URL('./relay-worker.ts', import.meta.url), { type: 'module' })`
— the package ships TypeScript source and expects a bundler that understands
that pattern (Vite, webpack 5, …).

## Known-hard parts, handled explicitly

- **The sender still needs an encoder running.** Substitution rides the local
  encoder's cadence; keep feeding it the decoded track and crush it with
  `setParameters` once passthrough is active.
- **Frame types can't be rewritten.** A donor frame's key/delta type must
  match the upstream frame it carries; the worker uses
  `generateKeyFrame()`/`sendKeyFrameRequest()` to line them up (and a child's
  PLI — which reaches the donor encoder, not the upstream — is translated
  into an upstream keyframe request, chaining correctly through nested
  relays).
- **Decode dependencies are never broken.** Deltas can't be thinned, so the
  per-downstream queue is small (8 frames); on overflow the whole run is
  dropped and the stream resumes at the next upstream keyframe, which is
  requested immediately. A new downstream also joins on a requested keyframe.

## Limitations — read before depending on it

- **Chromium-only today.** Safari has `RTCRtpScriptTransform` but not the
  constructible `RTCEncodedVideoFrame`; Firefox has neither piece in usable
  form. Feature-detect and keep a re-encode fallback.
- **The codec must match end-to-end.** No simulcast, single spatial layer;
  VP8/VP9 are the tested targets. AV1/H.264 matching is implemented but the
  metadata requirements of their packetizers are less explored.
- **Metadata rewriting is frontier territory.** What Chromium's packetizer
  accepts from a substituted frame (frameId monotonicity windows, dependency
  validation, timestamp handling) is not fully specified; this package uses
  the most conservative scheme that works in practice, and every rejection
  path degrades to identity mode rather than a dead stream.
- **Mode switches jump timebases.** Substitute mode stamps upstream RTP
  timestamps; identity mode uses the encoder's. A demotion mid-stream is a
  timestamp discontinuity that the receiver absorbs at the next keyframe.
