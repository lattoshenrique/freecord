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

export const AVATAR_GRID = 5;

export interface AvatarSeed {
  /** Base hue of the ground; the gradient's second stop is derived from it. */
  hue: number;
  /** Row-major grid, mirrored around the middle column. */
  cells: boolean[];
}

/**
 * One hash gives everything: the low 15 bits fill the left half of a 5×5 grid
 * (mirrored into the right half, which is what makes the glyph read as a face
 * rather than as noise) and the high bits pick the hue.
 */
export function avatarFrom(name: string): AvatarSeed {
  const hash = hashString(name);
  const half = Math.ceil(AVATAR_GRID / 2);
  let bits = hash & 0x7fff;
  // An almost blank glyph looks like a failure to draw one: invert instead.
  if (popcount(bits) < 4) {
    bits = ~bits & 0x7fff;
  }

  const cells = new Array<boolean>(AVATAR_GRID * AVATAR_GRID).fill(false);
  for (let row = 0; row < AVATAR_GRID; row++) {
    for (let col = 0; col < half; col++) {
      const on = ((bits >>> (row * half + col)) & 1) === 1;
      cells[row * AVATAR_GRID + col] = on;
      cells[row * AVATAR_GRID + (AVATAR_GRID - 1 - col)] = on;
    }
  }

  return { hue: (hash >>> 17) % 360, cells };
}

function popcount(value: number): number {
  let count = 0;
  for (let bits = value; bits !== 0; bits >>>= 1) {
    count += bits & 1;
  }
  return count;
}
