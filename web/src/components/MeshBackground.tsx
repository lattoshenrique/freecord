import { useEffect, useRef } from 'react';
import './mesh-background.css';

/**
 * The home page's background: the product's own topology, drawn live.
 *
 * Peers join and leave, every peer holds a connection to every other peer,
 * and packets travel the edges directly — no server in the middle, which is
 * the one thing the landing page has to say before anyone reads a word.
 *
 * Decoration only: a canvas behind the content, no pointer events, no text
 * a translator has to own. The labels are the WebRTC handshake itself
 * (`offer`, `answer`, `ice ok`) and hex peer ids — protocol, not copy, the
 * same in every locale.
 */

/** The real ceiling: a mesh costs each peer N−1 uploads. `ROOM_LIMITS.maxParticipants`. */
const MAX_PEERS = 12;
const MIN_PEERS = 4;
/**
 * Edge count is quadratic — 4 peers draw 6 lines, 12 draw 66 — so a fixed
 * per-line opacity that reads as a mesh at the floor reads as grey fog at the
 * ceiling. Ink is budgeted for a room of this size and thinned from there.
 */
const EDGE_INK = 0.38;
const EDGE_BUDGET = 6;

/** Seconds between a join and a leave. */
const CHURN_MIN = 2.4;
const CHURN_MAX = 6;
/** Seconds a peer spends fading in or out. */
const FADE = 0.85;
/** Seconds a fresh peer keeps its edges dashed — the connection is still negotiating. */
const NEGOTIATING = 1.5;

const DRIFT = 11; // px/s
const PACKET_SPEED = 190; // px/s, so a long hop honestly takes longer
const PACKET_RATE = 5; // packets born per second, room-wide
const MAX_PACKETS = 48;
const HANDSHAKE_STEP = 0.75; // seconds per handshake line

type Rgb = [number, number, number];

/** The three lights already in the page background. */
const PALETTE: Rgb[] = [
  [88, 101, 242],
  [168, 85, 247],
  [56, 189, 248],
];

const HANDSHAKE = ['offer →', '← answer', 'ice ok'];
const MONO = "10px ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

interface Peer {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: Rgb;
  /** Seconds since it appeared: drives the handshake caption and the dashed edges. */
  age: number;
  alpha: number;
  leaving: boolean;
  /** Seconds until the next heartbeat ring — the server drops a silent peer at 35 s. */
  beat: number;
}

interface Packet {
  from: Peer;
  to: Peer;
  /** 0 → 1 along the edge. */
  t: number;
  speed: number;
  color: Rgb;
}

const rgba = (c: Rgb, a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)]!;

export default function MeshBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;
    const peers: Peer[] = [];
    const packets: Packet[] = [];
    let churn = rand(CHURN_MIN, CHURN_MAX);
    let spawn = 0;

    /** How far a peer may drift before it turns around. */
    const inset = () => Math.min(width, height) * 0.07 + 24;

    /**
     * Peers are seeded on a ring, not uniformly: the middle of the screen is
     * masked out for the hero, and a peer dropped there would just be a hole
     * in the mesh. `slot` spreads the opening cast evenly around it.
     */
    function newPeer(slot?: { index: number; of: number }): Peer {
      const pad = inset();
      const around =
        slot === undefined
          ? rand(0, Math.PI * 2)
          : ((slot.index + rand(-0.28, 0.28)) / slot.of) * Math.PI * 2;
      const reach = rand(0.55, 1);
      const heading = rand(0, Math.PI * 2);
      return {
        id: Math.random().toString(16).slice(2, 6),
        x: width / 2 + Math.cos(around) * (width / 2 - pad) * reach,
        y: height / 2 + Math.sin(around) * (height / 2 - pad) * reach,
        vx: Math.cos(heading) * DRIFT,
        vy: Math.sin(heading) * DRIFT,
        color: pick(PALETTE),
        age: 0,
        alpha: 0,
        leaving: false,
        beat: rand(0, 4),
      };
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const next = { w: Math.max(rect.width, 1), h: Math.max(rect.height, 1) };
      // Keep the mesh where it was, proportionally, instead of reshuffling it.
      if (width && height) {
        for (const peer of peers) {
          peer.x *= next.w / width;
          peer.y *= next.h / height;
        }
      }
      width = next.w;
      height = next.h;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();
    // A room that is already going when the page opens, not one booting up.
    const opening = 6;
    for (let i = 0; i < opening; i += 1) {
      const peer = newPeer({ index: i, of: opening });
      peer.alpha = 1;
      peer.age = NEGOTIATING + rand(0, 10);
      peers.push(peer);
    }

    function step(dt: number) {
      const pad = inset();

      churn -= dt;
      if (churn <= 0) {
        churn = rand(CHURN_MIN, CHURN_MAX);
        const live = peers.filter((peer) => !peer.leaving);
        const room = live.length < MAX_PEERS;
        // Below the floor we only add; at the ceiling we only drop.
        if (room && (live.length <= MIN_PEERS || Math.random() < 0.55)) {
          peers.push(newPeer());
        } else if (live.length > MIN_PEERS) {
          pick(live).leaving = true;
        }
      }

      for (const peer of peers) {
        peer.age += dt;
        peer.alpha = Math.max(
          0,
          Math.min(1, peer.alpha + (peer.leaving ? -dt / FADE : dt / FADE)),
        );
        peer.x += peer.vx * dt;
        peer.y += peer.vy * dt;
        if (peer.x < pad || peer.x > width - pad) {
          peer.vx *= -1;
          peer.x = Math.max(pad, Math.min(width - pad, peer.x));
        }
        if (peer.y < pad || peer.y > height - pad) {
          peer.vy *= -1;
          peer.y = Math.max(pad, Math.min(height - pad, peer.y));
        }
        peer.beat -= dt;
        if (peer.beat <= -1) peer.beat = rand(3.5, 6);
      }

      for (let i = peers.length - 1; i >= 0; i -= 1) {
        if (peers[i]!.leaving && peers[i]!.alpha <= 0) {
          const gone = peers[i]!;
          peers.splice(i, 1);
          // Its connections die with it: no packet outlives its peer.
          for (let j = packets.length - 1; j >= 0; j -= 1) {
            if (packets[j]!.from === gone || packets[j]!.to === gone) packets.splice(j, 1);
          }
        }
      }

      for (let i = packets.length - 1; i >= 0; i -= 1) {
        packets[i]!.t += packets[i]!.speed * dt;
        if (packets[i]!.t >= 1) packets.splice(i, 1);
      }

      const settled = peers.filter((peer) => !peer.leaving && peer.age > NEGOTIATING);
      spawn -= dt;
      while (spawn <= 0) {
        spawn += 1 / PACKET_RATE;
        if (settled.length < 2 || packets.length >= MAX_PACKETS) continue;
        const from = pick(settled);
        const to = pick(settled.filter((peer) => peer !== from));
        const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
        packets.push({ from, to, t: 0, speed: PACKET_SPEED / length, color: from.color });
      }
    }

    function draw(time: number) {
      const maxEdge = Math.hypot(width, height) * 0.72;
      // Summed alpha, not a count: the mesh thins as a peer fades in, never in a step.
      const crowd = peers.reduce((total, peer) => total + peer.alpha, 0);
      const ink = EDGE_INK * Math.min(1, EDGE_BUDGET / Math.max(EDGE_BUDGET, crowd));
      ctx!.clearRect(0, 0, width, height);

      // Every peer to every other peer — that is the whole point of a mesh.
      ctx!.lineWidth = 1;
      for (let i = 0; i < peers.length; i += 1) {
        for (let j = i + 1; j < peers.length; j += 1) {
          const a = peers[i]!;
          const b = peers[j]!;
          const length = Math.hypot(b.x - a.x, b.y - a.y);
          const falloff = Math.max(0, 1 - length / maxEdge);
          const alpha = a.alpha * b.alpha * falloff * ink;
          if (alpha <= 0.004) continue;
          const negotiating = Math.min(a.age, b.age) < NEGOTIATING;
          ctx!.setLineDash(negotiating ? [3, 5] : []);
          ctx!.lineDashOffset = negotiating ? -time * 22 : 0;
          ctx!.strokeStyle = `rgba(158, 170, 232, ${alpha})`;
          ctx!.beginPath();
          ctx!.moveTo(a.x, a.y);
          ctx!.lineTo(b.x, b.y);
          ctx!.stroke();
        }
      }
      ctx!.setLineDash([]);

      // Payload in flight, drawn as a short comet along its own edge.
      ctx!.lineCap = 'round';
      for (const packet of packets) {
        const alpha = packet.from.alpha * packet.to.alpha;
        if (alpha <= 0.01) continue;
        const dx = packet.to.x - packet.from.x;
        const dy = packet.to.y - packet.from.y;
        const tail = Math.max(0, packet.t - 0.07);
        const hx = packet.from.x + dx * packet.t;
        const hy = packet.from.y + dy * packet.t;
        const tx = packet.from.x + dx * tail;
        const ty = packet.from.y + dy * tail;
        const trail = ctx!.createLinearGradient(tx, ty, hx, hy);
        trail.addColorStop(0, rgba(packet.color, 0));
        trail.addColorStop(1, rgba(packet.color, 0.55 * alpha));
        ctx!.strokeStyle = trail;
        ctx!.lineWidth = 1.8;
        ctx!.beginPath();
        ctx!.moveTo(tx, ty);
        ctx!.lineTo(hx, hy);
        ctx!.stroke();
        ctx!.fillStyle = rgba(packet.color, 0.85 * alpha);
        ctx!.beginPath();
        ctx!.arc(hx, hy, 1.6, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.lineWidth = 1;

      for (const peer of peers) {
        if (peer.alpha <= 0.01) continue;
        const radius = 3.2;

        // Heartbeat: the ping that keeps the seat. Silence for 35 s and the peer is dropped.
        if (peer.beat < 0) {
          const ring = 1 + peer.beat; // 1 → 0 over the second after it fires
          ctx!.strokeStyle = rgba(peer.color, 0.32 * ring * peer.alpha);
          ctx!.beginPath();
          ctx!.arc(peer.x, peer.y, radius + (1 - ring) * 16, 0, Math.PI * 2);
          ctx!.stroke();
        }

        const glow = ctx!.createRadialGradient(peer.x, peer.y, 0, peer.x, peer.y, 26);
        glow.addColorStop(0, rgba(peer.color, 0.42 * peer.alpha));
        glow.addColorStop(1, rgba(peer.color, 0));
        ctx!.fillStyle = glow;
        ctx!.beginPath();
        ctx!.arc(peer.x, peer.y, 26, 0, Math.PI * 2);
        ctx!.fill();

        ctx!.fillStyle = rgba(peer.color, 0.95 * peer.alpha);
        ctx!.beginPath();
        ctx!.arc(peer.x, peer.y, radius, 0, Math.PI * 2);
        ctx!.fill();

        ctx!.font = MONO;
        ctx!.textBaseline = 'middle';
        ctx!.fillStyle = `rgba(154, 160, 173, ${0.62 * peer.alpha})`;
        ctx!.fillText(peer.id, peer.x + 10, peer.y + 1);

        const stage = Math.floor(peer.age / HANDSHAKE_STEP);
        if (stage < HANDSHAKE.length) {
          const fade = 1 - (peer.age / HANDSHAKE_STEP - stage);
          ctx!.fillStyle = rgba(peer.color, 0.55 * fade * peer.alpha);
          ctx!.fillText(HANDSHAKE[stage]!, peer.x + 10, peer.y + 14);
        }
      }
    }

    if (still) {
      // One honest frame of the topology, and nothing moves.
      draw(0);
      const observer = new ResizeObserver(() => {
        resize();
        draw(0);
      });
      observer.observe(canvas);
      return () => observer.disconnect();
    }

    let frame = 0;
    let last = performance.now();
    let clock = 0;

    const tick = (now: number) => {
      // A backgrounded tab hands back a huge delta; clamp it or the mesh teleports.
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      clock += dt;
      step(dt);
      draw(clock);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const onVisibility = () => {
      last = performance.now();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div className="mesh-bg" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}
