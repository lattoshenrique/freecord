/**
 * Codec matching for passthrough.
 *
 * Forwarded bytes are never transcoded, so a child is only eligible when it
 * negotiated the SAME codec the upstream leg actually uses — same family
 * and same decode-relevant fmtp parameters. Payload type numbers differ per
 * negotiation and are irrelevant; so are transport params like rtx/red.
 *
 * H.264 compares the profile half of profile-level-id only: levels are
 * negotiated asymmetrically and a decoder at a higher level decodes lower
 * ones — matching the full id would reject working pairs.
 */

export interface CodecDescriptor {
  mimeType: string;
  clockRate?: number;
  channels?: number;
  sdpFmtpLine?: string;
}

/** RTP machinery, not media: never a passthrough target on its own. */
const AUXILIARY = new Set(['video/rtx', 'video/red', 'video/ulpfec', 'video/flexfec-03']);

export function isAuxiliaryCodec(mimeType: string): boolean {
  return AUXILIARY.has(mimeType.toLowerCase());
}

function fmtpParams(line: string | undefined): Map<string, string> {
  const params = new Map<string, string>();
  for (const part of (line ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) {
      params.set(part.slice(0, eq).trim().toLowerCase(), part.slice(eq + 1).trim().toLowerCase());
    }
  }
  return params;
}

/** Canonical decode-relevant fmtp signature; '' when only the mime matters (VP8). */
function fmtpSignature(mime: string, line: string | undefined): string {
  const params = fmtpParams(line);
  switch (mime) {
    case 'video/vp9':
      return `profile-id=${params.get('profile-id') ?? '0'}`;
    case 'video/av1':
      return `profile=${params.get('profile') ?? '0'}`;
    case 'video/h264': {
      const profile = (params.get('profile-level-id') ?? '42001f').slice(0, 4);
      return `profile=${profile};packetization-mode=${params.get('packetization-mode') ?? '0'}`;
    }
    default:
      return '';
  }
}

export function codecsMatch(a: CodecDescriptor, b: CodecDescriptor): boolean {
  const mime = a.mimeType.toLowerCase();
  if (mime !== b.mimeType.toLowerCase()) {
    return false;
  }
  if (
    typeof a.clockRate === 'number' &&
    typeof b.clockRate === 'number' &&
    a.clockRate !== b.clockRate
  ) {
    return false;
  }
  return fmtpSignature(mime, a.sdpFmtpLine) === fmtpSignature(mime, b.sdpFmtpLine);
}

/**
 * Reorders `capabilities` so the upstream's negotiated codecs come first, in
 * upstream order, with everything else appended — a PREFERENCE, not a hard
 * pin: if the child cannot do the upstream codec, negotiation still lands
 * somewhere workable and the caller falls back to re-encoding. Returns the
 * capability objects themselves, as setCodecPreferences requires. When
 * nothing recognizably overlaps, the default order comes back untouched.
 */
export function preferredCodecOrder<T extends CodecDescriptor>(
  upstream: CodecDescriptor[],
  capabilities: T[],
): T[] {
  const ordered: T[] = [];
  const used = new Set<T>();
  for (const codec of upstream) {
    if (isAuxiliaryCodec(codec.mimeType)) {
      continue;
    }
    for (const capability of capabilities) {
      if (!used.has(capability) && codecsMatch(codec, capability)) {
        ordered.push(capability);
        used.add(capability);
      }
    }
  }
  if (ordered.length === 0) {
    return capabilities;
  }
  for (const capability of capabilities) {
    if (!used.has(capability)) {
      ordered.push(capability);
    }
  }
  return ordered;
}
