/**
 * Who you are before you type anything.
 *
 * A guest gets a nickname and an avatar the moment the pre-join card opens —
 * both made here, from arithmetic. No account, no avatar service, no request:
 * the avatar is a pure function of the name, so the same person draws the same
 * picture on every screen in the room without anything being stored anywhere.
 */

/**
 * Star names read as nicknames and are proper nouns — the same word in every
 * locale, which is why this list is not in the i18n catalog. The number keeps
 * two guests who roll the same star apart.
 */
const STARS = [
  'Vega',
  'Altair',
  'Rigel',
  'Lyra',
  'Orion',
  'Atlas',
  'Nova',
  'Ceres',
  'Mira',
  'Antares',
  'Polaris',
  'Sirius',
  'Deneb',
  'Aquila',
  'Carina',
  'Draco',
  'Pollux',
  'Tucana',
  'Vela',
  'Elara',
  'Hydra',
  'Lupus',
  'Nashira',
  'Phoenix',
];

export function randomNickname(): string {
  const star = STARS[Math.floor(Math.random() * STARS.length)];
  return `${star} ${10 + Math.floor(Math.random() * 90)}`;
}

/** FNV-1a in 32 bits: two operations per character, no dependency. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Side of the square the mascot is drawn in; the caller sizes it. */
export const AVATAR_SIZE = 100;

export type AvatarFill = 'skin' | 'ink' | 'solid' | 'light' | 'blush' | 'spot';
/** The features the room animates: eyes blink, the mouth talks, the z's drift. */
export type AvatarPart = 'eye' | 'mouth' | 'zzz';

/** One stroke of the drawing. The parts are the features the room animates. */
export type AvatarShape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; rx: number; fill: AvatarFill; part?: AvatarPart }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; fill: AvatarFill; part?: AvatarPart }
  | { kind: 'path'; d: string; fill?: AvatarFill; stroke?: AvatarFill; width?: number; part?: AvatarPart };

/** What the mascot is going through: it shows on the face. */
export interface AvatarMood {
  /** Microphone off: the mouth is zipped. */
  micOff?: boolean;
  /** Speakers off: fingers in the ears. */
  deafened?: boolean;
}

export interface AvatarSeed {
  /** The ground: two colours and the direction the first runs to the second. */
  ground: { from: string; to: string; x1: number; y1: number; x2: number; y2: number };
  /** What each fill of the drawing is painted in. */
  palette: Record<AvatarFill, string>;
  /** Shapes in drawing order, in an AVATAR_SIZE × AVATAR_SIZE box. */
  shapes: AvatarShape[];
}

/**
 * mulberry32: a tiny generator seeded with the name's hash, so the drawing
 * can draw as many choices as it likes and every one still follows from the
 * name alone. The order of the draws below is part of the picture: change
 * it and every guest gets a new face.
 */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Point {
  x: number;
  y: number;
}

/**
 * A polygon with every corner rounded off by its own radius: the body. With
 * small radii it is a box or a gem, with large ones a blob or an egg, and
 * the sides can lean, so a few numbers cover a whole zoo of silhouettes.
 */
function roundedPolygon(points: Point[], radii: number[]): { d: string; outline: Point[] } {
  const count = points.length;
  const parts: string[] = [];
  const outline: Point[] = [];
  const unit = (from: Point, to: Point) => {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length, length };
  };
  for (let i = 0; i < count; i++) {
    const previous = points[(i + count - 1) % count]!;
    const corner = points[i]!;
    const next = points[(i + 1) % count]!;
    const back = unit(corner, previous);
    const ahead = unit(corner, next);
    const radius = Math.min(radii[i]!, back.length / 2, ahead.length / 2);
    const entry = { x: corner.x + back.x * radius, y: corner.y + back.y * radius };
    const exit = { x: corner.x + ahead.x * radius, y: corner.y + ahead.y * radius };
    parts.push(
      `${i === 0 ? 'M' : 'L'}${entry.x.toFixed(1)} ${entry.y.toFixed(1)} Q${corner.x.toFixed(1)} ${corner.y.toFixed(1)} ${exit.x.toFixed(1)} ${exit.y.toFixed(1)}`,
    );
    // The same curve, sampled, for the geometry questions asked below.
    for (let step = 0; step <= 8; step++) {
      const t = step / 8;
      const a = 1 - t;
      outline.push({
        x: a * a * entry.x + 2 * a * t * corner.x + t * t * exit.x,
        y: a * a * entry.y + 2 * a * t * corner.y + t * t * exit.y,
      });
    }
  }
  return { d: `${parts.join(' ')} Z`, outline };
}

/** The top of the outline at `x`; the top of the whole body if `x` is off it. */
function topAt(outline: Point[], x: number): number {
  let best = Infinity;
  let lowest = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    lowest = Math.min(lowest, a.y);
    if (a.x !== b.x && x >= Math.min(a.x, b.x) && x <= Math.max(a.x, b.x)) {
      best = Math.min(best, a.y + ((x - a.x) * (b.y - a.y)) / (b.x - a.x));
    }
  }
  return best === Infinity ? lowest : best;
}

/** Where a horizontal line at `y` meets the polygon: its left and right edge. */
function edgesAt(points: Point[], y: number): [number, number] {
  let left = Infinity;
  let right = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    if ((y >= Math.min(a.y, b.y) && y <= Math.max(a.y, b.y)) && a.y !== b.y) {
      const x = a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y);
      left = Math.min(left, x);
      right = Math.max(right, x);
    }
  }
  if (left === Infinity) {
    for (const point of points) {
      left = Math.min(left, point.x);
      right = Math.max(right, point.x);
    }
  }
  return [left, right];
}

/**
 * The name's hash seeds a generator, and the generator draws a mascot one
 * feature at a time — body, limbs, hair, eyes, mouth, marks — each from a
 * small set with its own odds, and each sized by its own draw, so the
 * combinations run to the millions while every one still reads as a little
 * creature rather than as noise. The same name draws the same one everywhere.
 */
export function avatarFrom(name: string, mood: AvatarMood = {}): AvatarSeed {
  const random = generator(hashString(name));
  const between = (low: number, high: number) => low + random() * (high - low);
  const pick = <T>(options: readonly T[]): T => options[Math.floor(random() * options.length)]!;
  const chance = (odds: number) => random() < odds;

  // Colours first: the ground, then a body that stands off it, then an ink
  // dark enough to read on both.
  const hue = Math.floor(between(0, 360));
  const hue2 = (hue + pick([40, 40, 60, 120, 150, 180])) % 360;
  const angles = [
    { x1: 0, y1: 0, x2: 1, y2: 1 },
    { x1: 0, y1: 1, x2: 1, y2: 0 },
    { x1: 0, y1: 0, x2: 0, y2: 1 },
    { x1: 0, y1: 0, x2: 1, y2: 0 },
  ];
  const ground = {
    from: `hsl(${hue} ${Math.round(between(55, 70))}% ${Math.round(between(40, 48))}%)`,
    to: `hsl(${hue2} ${Math.round(between(60, 75))}% ${Math.round(between(54, 62))}%)`,
    ...pick(angles),
  };
  const palette: Record<AvatarFill, string> = {
    skin: pick([
      'rgba(255, 255, 255, 0.94)',
      'rgba(255, 255, 255, 0.94)',
      'hsl(45 90% 92%)',
      'hsl(30 85% 89%)',
      'hsl(150 55% 88%)',
      'hsl(200 70% 90%)',
      `hsl(${hue} 75% 90%)`,
      `hsl(${(hue + 180) % 360} 65% 88%)`,
      `hsl(${hue2} 70% 90%)`,
    ]),
    ink: '',
    solid: '',
    light: 'rgba(255, 255, 255, 0.96)',
    blush: `hsl(${pick([350, 355, 10, hue2])} 85% 70% / 0.55)`,
    spot: `hsl(${hue} 40% 20% / 0.28)`,
  };

  // The ink is a little translucent so it takes on the ground; the solid is
  // the same colour at full strength, for what must hide what is under it.
  const inkHue = pick([`${hue} 45% 14%`, `${hue2} 45% 16%`, '240 30% 16%', '20 40% 18%']);
  palette.ink = `hsl(${inkHue} / 0.85)`;
  palette.solid = `hsl(${inkHue})`;

  const shapes: AvatarShape[] = [];
  const rect = (x: number, y: number, w: number, h: number, rx: number, fill: AvatarFill, part?: AvatarPart) =>
    shapes.push({ kind: 'rect', x, y, w, h, rx, fill, part });
  const dot = (cx: number, cy: number, r: number, fill: AvatarFill, part?: AvatarPart) =>
    shapes.push({ kind: 'ellipse', cx, cy, rx: r, ry: r, fill, part });
  const oval = (cx: number, cy: number, rx: number, ry: number, fill: AvatarFill, part?: AvatarPart) =>
    shapes.push({ kind: 'ellipse', cx, cy, rx, ry, fill, part });
  const stroke = (d: string, width: number, part?: AvatarPart, fill: AvatarFill = 'ink') =>
    shapes.push({ kind: 'path', d, stroke: fill, width, part });

  // The body is the whole creature: the face sits on it and the limbs hang
  // off it. A rounded polygon — four, five or six corners, each with its own
  // radius, the top and the bottom each with their own width — placed so
  // that there is room for hair above and legs below.
  const cx = 50;
  const top = between(12, 26);
  const bottom = between(76, 86);
  // At least one of the two ends is broad: a body thin at both is a stick.
  let halfTop = between(18, 36);
  let halfBottom = between(18, 38);
  if (Math.max(halfTop, halfBottom) < 26) {
    if (chance(0.5)) halfTop = between(26, 36);
    else halfBottom = between(26, 38);
  }
  const corners = pick([4, 4, 4, 5, 6]);
  const points: Point[] =
    corners === 4
      ? [
          { x: cx - halfTop, y: top },
          { x: cx + halfTop, y: top },
          { x: cx + halfBottom, y: bottom },
          { x: cx - halfBottom, y: bottom },
        ]
      : corners === 5
        ? [
            // A peak on top: a pear, a drop, a gem.
            { x: cx, y: top },
            { x: cx + halfTop, y: top + between(10, 22) },
            { x: cx + halfBottom, y: bottom },
            { x: cx - halfBottom, y: bottom },
            { x: cx - halfTop, y: top + between(10, 22) },
          ]
        : [
            // A waist: the sides bulge or pinch halfway down.
            { x: cx - halfTop, y: top },
            { x: cx + halfTop, y: top },
            { x: cx + between(16, 40), y: (top + bottom) / 2 },
            { x: cx + halfBottom, y: bottom },
            { x: cx - halfBottom, y: bottom },
            { x: cx - between(16, 40), y: (top + bottom) / 2 },
          ];
  const roundness = between(0.15, 1);
  const radii = points.map(() => between(0.6, 1.4) * roundness * 34);
  const { d: bodyPath, outline } = roundedPolygon(points, radii);
  shapes.push({ kind: 'path', d: bodyPath, fill: 'skin' });
  const surface = (x: number) => topAt(outline, x);
  const height = bottom - top;
  const eyeY = top + height * between(0.36, 0.46);
  const mouthY = eyeY + height * between(0.2, 0.28);
  const [faceLeft, faceRight] = edgesAt(outline, eyeY);
  const faceWidth = faceRight - faceLeft;

  // Limbs: legs, feet, arms — each optional, each its own size.
  if (chance(0.6)) {
    const legWidth = between(6, 10);
    const legHeight = between(8, 14);
    const spread = between(6, 14);
    const [footLeft, footRight] = edgesAt(outline, bottom - 3);
    const legs = chance(0.12) ? [cx] : [Math.max(footLeft + 2, cx - spread - legWidth), Math.min(footRight - 2 - legWidth, cx + spread)];
    for (const x of legs) {
      rect(x, bottom - 4, legWidth, legHeight, legWidth / 2, 'skin');
      if (chance(0.5)) oval(x + legWidth / 2, bottom + legHeight - 4, legWidth * 0.9, 3, 'skin');
    }
  }
  if (chance(0.55)) {
    const armY = top + height * between(0.48, 0.62);
    const [armLeft, armRight] = edgesAt(outline, armY);
    const length = between(9, 14);
    if (chance(0.25)) {
      // One arm up: a wave.
      rect(armRight - 4, armY - length + 4, 7, length, 3.5, 'skin');
      rect(armLeft - length + 4, armY, length, 7, 3.5, 'skin');
    } else {
      rect(armLeft - length + 4, armY, length, 7, 3.5, 'skin');
      rect(armRight - 4, armY, length, 7, 3.5, 'skin');
    }
  }
  // Ears, or horns, on the temples.
  const [templeLeft, templeRight] = edgesAt(outline, top + height * 0.2);
  if (chance(0.2)) {
    const size = between(4, 7);
    oval(templeLeft - 1, eyeY - 2, size, size * 1.2, 'skin');
    oval(templeRight + 1, eyeY - 2, size, size * 1.2, 'skin');
  } else if (chance(0.18)) {
    const size = between(5, 9);
    const tipY = top + height * 0.2 - size * 1.6;
    shapes.push({ kind: 'path', d: `M${templeLeft - 1} ${top + height * 0.2} L${templeLeft + 2} ${tipY} L${templeLeft + size + 2} ${top + height * 0.2 - 3} Z`, fill: 'ink' });
    shapes.push({ kind: 'path', d: `M${templeRight + 1} ${top + height * 0.2} L${templeRight - 2} ${tipY} L${templeRight - size - 2} ${top + height * 0.2 - 3} Z`, fill: 'ink' });
  }

  // Hair sits on the crown, in ink; antennae are part of the body, in skin.
  // Every lock is anchored to the surface under it, so nothing floats over
  // a rounded shoulder or a pointed head.
  const [crownLeft, crownRight] = edgesAt(outline, top + height * 0.12);
  const crownWidth = crownRight - crownLeft;
  const crownY = surface(cx);
  // A cap follows the crown: a band of ink that hugs the outline from one
  // side to the other, thick enough to read as hair.
  const cap = (spread: number) => {
    const thickness = between(8, 12);
    const x1 = cx - (crownWidth * spread) / 2;
    const x2 = cx + (crownWidth * spread) / 2;
    const upper: string[] = [];
    const lower: string[] = [];
    for (let step = 0; step <= 16; step++) {
      const x = x1 + ((x2 - x1) * step) / 16;
      const y = surface(x);
      upper.push(`${x.toFixed(1)} ${(y - thickness + 3).toFixed(1)}`);
      lower.unshift(`${x.toFixed(1)} ${(y + 3).toFixed(1)}`);
    }
    shapes.push({ kind: 'path', d: `M${upper.join(' L')} L${lower.join(' L')} Z`, fill: 'ink' });
    dot(x1, surface(x1) - thickness / 2 + 3, thickness / 2, 'ink');
    dot(x2, surface(x2) - thickness / 2 + 3, thickness / 2, 'ink');
  };
  // The outermost x on one side of the body over a band of rows: what a
  // strip of hair hanging beside the face has to reach to touch it.
  const flank = (from: number, to: number): [number, number] => {
    let left = Infinity;
    let right = -Infinity;
    for (let y = from; y <= to; y += 2) {
      const [l, r] = edgesAt(outline, y);
      left = Math.min(left, l);
      right = Math.max(right, r);
    }
    return [left, right];
  };
  switch (pick(['none', 'none', 'spikes', 'cap', 'bob', 'tuft', 'antenna', 'fringe', 'curls', 'mohawk', 'pigtails'])) {
    case 'spikes': {
      const count = pick([2, 3, 3, 4]);
      const width = between(4, 7);
      for (let i = 0; i < count; i++) {
        const x = cx - (count - 1) * 6 + i * 12;
        const rise = between(8, 15);
        rect(x - width / 2, surface(x) - rise + 3, width, rise, width / 2, 'ink');
      }
      break;
    }
    case 'cap':
      cap(between(0.55, 0.85));
      break;
    case 'bob': {
      cap(between(0.75, 0.95));
      const width = between(6, 10);
      const from = top + height * 0.12;
      const to = eyeY + between(4, 14);
      const [sideLeft, sideRight] = flank(from, to);
      rect(sideLeft - width + 3, from, width, to - from, width / 2, 'ink');
      rect(sideRight - 3, from, width, to - from, width / 2, 'ink');
      break;
    }
    case 'tuft': {
      const x = cx + between(-8, 8);
      dot(x, surface(x) - 1, between(4, 7), 'ink');
      break;
    }
    case 'antenna': {
      const stems = chance(0.4) ? [cx] : [cx - between(7, 13), cx + between(7, 13)];
      const length = between(9, 16);
      for (const x of stems) {
        const base = surface(x);
        rect(x - 1.25, base - length + 3, 2.5, length, 1.25, 'skin');
        dot(x, base - length + 2, between(2.5, 4.5), chance(0.7) ? 'skin' : 'ink');
      }
      break;
    }
    case 'fringe':
      cap(between(0.7, 0.9));
      for (const x of [cx - 15, cx + 6]) {
        const bx = x + between(-2, 2);
        rect(bx, surface(bx + 4.5) + 4, 9, between(5, 9), 3.5, 'ink');
      }
      break;
    case 'curls': {
      const count = pick([3, 4, 5]);
      const size = between(4.5, 7);
      for (let i = 0; i < count; i++) {
        const x = cx + (i - (count - 1) / 2) * size * 1.9;
        dot(x, surface(x) + (i % 2 === 0 ? 1 : -2), size, 'ink');
      }
      break;
    }
    case 'mohawk':
      rect(cx - 4, crownY - between(10, 16), 8, 20, 4, 'ink');
      break;
    case 'pigtails': {
      cap(between(0.7, 0.9));
      const size = between(5, 8);
      const tailY = top + height * between(0.15, 0.3);
      const [tailLeft, tailRight] = edgesAt(outline, tailY);
      dot(tailLeft - size + 3, tailY, size, 'ink');
      dot(tailRight + size - 3, tailY, size, 'ink');
      break;
    }
    default:
      break;
  }

  // Eyes: usually two, now and then one or three, in one of several styles.
  const eyeCount = pick([2, 2, 2, 2, 2, 2, 1, 3]);
  const eyeSize = between(0.8, 1.25);
  const spacing = Math.min(14, faceWidth * between(0.18, 0.28));
  const eyeXs =
    eyeCount === 1 ? [cx] : eyeCount === 2 ? [cx - spacing, cx + spacing] : [cx - spacing, cx, cx + spacing];
  const eyeStyle = pick(['dot', 'dot', 'big', 'big', 'sleepy', 'ring', 'happy', 'oval']);
  const brows = chance(0.3) ? pick(['flat', 'raised', 'worried']) : 'none';
  for (const ex of eyeXs) {
    const ey = eyeCount === 3 && ex === cx ? eyeY - 6 : eyeY;
    if (eyeStyle === 'dot') {
      dot(ex, ey, 3.5 * eyeSize, 'ink', 'eye');
    } else if (eyeStyle === 'big') {
      dot(ex, ey, 5.2 * eyeSize, 'ink', 'eye');
      dot(ex - 1.6 * eyeSize, ey - 1.6 * eyeSize, 1.7 * eyeSize, 'light', 'eye');
    } else if (eyeStyle === 'sleepy') {
      rect(ex - 4.5 * eyeSize, ey - 1, 9 * eyeSize, 3.6, 1.8, 'ink', 'eye');
    } else if (eyeStyle === 'ring') {
      dot(ex, ey, 5.6 * eyeSize, 'ink', 'eye');
      dot(ex, ey, 2.6 * eyeSize, 'light', 'eye');
    } else if (eyeStyle === 'happy') {
      stroke(`M${ex - 4.5 * eyeSize} ${ey + 1.5} Q${ex} ${ey - 5 * eyeSize} ${ex + 4.5 * eyeSize} ${ey + 1.5}`, 3, 'eye');
    } else {
      oval(ex, ey, 3.6 * eyeSize, 5.2 * eyeSize, 'ink', 'eye');
      dot(ex - 1.2 * eyeSize, ey - 2 * eyeSize, 1.4 * eyeSize, 'light', 'eye');
    }
    if (brows !== 'none' && (eyeCount !== 3 || ex !== cx)) {
      const lift = brows === 'raised' ? 3 : 0;
      const tilt = brows === 'worried' ? (ex < cx ? -2 : 2) : 0;
      const browY = ey - 7 * eyeSize - lift;
      stroke(`M${ex - 4} ${browY + tilt} L${ex + 4} ${browY - tilt}`, 2.4);
    }
  }
  if (chance(0.35)) {
    const blushX = Math.min(spacing + 7, faceWidth / 2 - 5);
    for (const bx of [cx - blushX, cx + blushX]) oval(bx, eyeY + 6, 4, 2.6, 'blush');
  }
  if (chance(0.25)) {
    // Freckles, or spots, across the brow or the cheeks.
    const y = chance(0.5) ? eyeY + 7 : top + height * 0.16;
    for (let i = 0; i < pick([3, 4, 5]); i++) {
      dot(cx + between(-faceWidth * 0.3, faceWidth * 0.3), y + between(-2, 2), between(1, 2), 'spot');
    }
  }

  // Neither talking nor listening: asleep. The mask says both at once, so
  // the zip and the fingers stay off a face that is already out.
  const asleep = mood.micOff === true && mood.deafened === true;

  // The mouth, under the eyes.
  const mouthWidth = Math.min(between(0.7, 1.3), faceWidth / 32);
  if (asleep) {
    dot(cx, mouthY + 1, 2.2, 'ink', 'mouth');
  } else if (mood.micOff) {
    // Zipped: a line with the teeth of a zip across it.
    rect(cx - 9, mouthY - 1.2, 18, 2.4, 1.2, 'ink', 'mouth');
    for (const dx of [-5, 0, 5]) {
      rect(cx + dx - 0.9, mouthY - 3.2, 1.8, 6.4, 0.9, 'ink', 'mouth');
    }
  } else {
    switch (pick(['line', 'smile', 'smile', 'o', 'grin', 'tongue', 'tiny', 'cat'])) {
      case 'line':
        rect(cx - 7 * mouthWidth, mouthY - 1.5, 14 * mouthWidth, 3, 1.5, 'ink', 'mouth');
        break;
      case 'smile':
        stroke(`M${cx - 8 * mouthWidth} ${mouthY - 2} Q${cx} ${mouthY + 8} ${cx + 8 * mouthWidth} ${mouthY - 2}`, 3.2, 'mouth');
        break;
      case 'o':
        oval(cx, mouthY + 1, 4 * mouthWidth, 4.5, 'ink', 'mouth');
        break;
      case 'grin':
        rect(cx - 10 * mouthWidth, mouthY - 2, 20 * mouthWidth, 8, 4, 'ink', 'mouth');
        rect(cx - 7 * mouthWidth, mouthY - 2, 14 * mouthWidth, 2.6, 0.8, 'light', 'mouth');
        break;
      case 'tongue':
        stroke(`M${cx - 8 * mouthWidth} ${mouthY - 2} Q${cx} ${mouthY + 8} ${cx + 8 * mouthWidth} ${mouthY - 2}`, 3.2, 'mouth');
        oval(cx + 3, mouthY + 3, 3.2, 3.6, 'blush', 'mouth');
        break;
      case 'tiny':
        dot(cx, mouthY + 1, 2, 'ink', 'mouth');
        break;
      default:
        // A cat's: two little bumps.
        stroke(`M${cx - 7} ${mouthY - 1} Q${cx - 3.5} ${mouthY + 4} ${cx} ${mouthY - 1} Q${cx + 3.5} ${mouthY + 4} ${cx + 7} ${mouthY - 1}`, 2.6, 'mouth');
        break;
    }
  }

  if (asleep) {
    // A sleep mask over the eyes, its strap round the back of the head,
    // and a few z's drifting off the crown.
    // The mask spans the face: two lobes with a dip for the nose, and a
    // soft sheen along the top. The strap goes round the back, so only its
    // two ends show, leaving the mask's corners and vanishing behind the
    // head just past the silhouette.
    const maskHalf = Math.min(faceWidth / 2 - 1, spacing + 11);
    const lobeR = Math.min(8.5, maskHalf / 2);
    oval(cx - maskHalf + lobeR, eyeY, lobeR, 7.5, 'solid');
    oval(cx + maskHalf - lobeR, eyeY, lobeR, 7.5, 'solid');
    rect(cx - maskHalf + lobeR, eyeY - 7.5, (maskHalf - lobeR) * 2, 11, 3, 'solid');
    shapes.push({ kind: 'path', d: `M${cx - maskHalf + 3} ${eyeY - 4} Q${cx} ${eyeY - 7} ${cx + maskHalf - 3} ${eyeY - 4}`, stroke: 'light', width: 1.4 });
    const strapLeft = Math.min(faceLeft, cx - maskHalf) - 5;
    const strapRight = Math.max(faceRight, cx + maskHalf) + 5;
    stroke(`M${cx - maskHalf + 2} ${eyeY - 3} Q${(cx - maskHalf + strapLeft) / 2} ${eyeY - 5} ${strapLeft} ${eyeY - 9}`, 2.4, undefined, 'solid');
    stroke(`M${cx + maskHalf - 2} ${eyeY - 3} Q${(cx + maskHalf + strapRight) / 2} ${eyeY - 5} ${strapRight} ${eyeY - 9}`, 2.4, undefined, 'solid');
    // Three z's, drawn at the temple; the room floats them up and away.
    const zx = faceRight - 2;
    const zy = eyeY - 12;
    stroke(`M${zx} ${zy} h6 l-6 6 h6`, 1.8, 'zzz', 'solid');
    stroke(`M${zx} ${zy} h6 l-6 6 h6`, 1.8, 'zzz', 'solid');
    stroke(`M${zx} ${zy} h6 l-6 6 h6`, 1.8, 'zzz', 'solid');
  } else if (mood.deafened) {
    // Fingers in the ears: an index finger comes in from each edge of the
    // frame and stops on the ear. Skin on skin would vanish, so each one is
    // outlined in ink, with a crease at the knuckle and a nail at the tip.
    const fingerY = eyeY + 1;
    const finger = (fromX: number, toX: number) => {
      const tipFirst = toX > fromX;
      const half = 5;
      const pts: Point[] = tipFirst
        ? [
            { x: fromX, y: fingerY - half },
            { x: toX, y: fingerY - half },
            { x: toX, y: fingerY + half },
            { x: fromX, y: fingerY + half },
          ]
        : [
            { x: toX, y: fingerY - half },
            { x: fromX, y: fingerY - half },
            { x: fromX, y: fingerY + half },
            { x: toX, y: fingerY + half },
          ];
      const tipRadii = tipFirst ? [0, half, half, 0] : [half, 0, 0, half];
      shapes.push({ kind: 'path', d: roundedPolygon(pts, tipRadii).d, fill: 'skin', stroke: 'ink', width: 2 });
      const knuckle = tipFirst ? toX - 13 : toX + 13;
      stroke(`M${knuckle} ${fingerY - 3} Q${knuckle + (tipFirst ? 1.5 : -1.5)} ${fingerY} ${knuckle} ${fingerY + 3}`, 1.6);
      const nail = tipFirst ? toX - 3.5 : toX + 3.5;
      oval(nail, fingerY, 2.2, 3, 'blush');
    };
    finger(-4, faceLeft + 4);
    finger(AVATAR_SIZE + 4, faceRight - 4);
  }

  return { ground, palette, shapes };
}
