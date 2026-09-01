import { describe, expect, it } from 'vitest';
import { codecsMatch, isAuxiliaryCodec, preferredCodecOrder } from '../src/codec';

describe('codecsMatch', () => {
  it('VP8 matches on the mime alone', () => {
    expect(
      codecsMatch({ mimeType: 'video/VP8', clockRate: 90000 }, { mimeType: 'video/vp8' }),
    ).toBe(true);
  });

  it('different families never match', () => {
    expect(codecsMatch({ mimeType: 'video/VP8' }, { mimeType: 'video/VP9' })).toBe(false);
  });

  it('VP9: an absent profile-id is profile 0', () => {
    expect(
      codecsMatch(
        { mimeType: 'video/VP9', sdpFmtpLine: 'profile-id=0' },
        { mimeType: 'video/VP9' },
      ),
    ).toBe(true);
    expect(
      codecsMatch(
        { mimeType: 'video/VP9', sdpFmtpLine: 'profile-id=2' },
        { mimeType: 'video/VP9' },
      ),
    ).toBe(false);
  });

  it('H.264: level differences are asymmetric and ignored; profile and packetization are not', () => {
    expect(
      codecsMatch(
        { mimeType: 'video/H264', sdpFmtpLine: 'profile-level-id=42001f;packetization-mode=1' },
        { mimeType: 'video/H264', sdpFmtpLine: 'profile-level-id=42002a;packetization-mode=1' },
      ),
    ).toBe(true);
    expect(
      codecsMatch(
        { mimeType: 'video/H264', sdpFmtpLine: 'profile-level-id=42001f;packetization-mode=1' },
        { mimeType: 'video/H264', sdpFmtpLine: 'profile-level-id=64001f;packetization-mode=1' },
      ),
    ).toBe(false);
    expect(
      codecsMatch(
        { mimeType: 'video/H264', sdpFmtpLine: 'profile-level-id=42001f;packetization-mode=1' },
        { mimeType: 'video/H264', sdpFmtpLine: 'profile-level-id=42001f' },
      ),
    ).toBe(false);
  });

  it('mismatched clock rates never match', () => {
    expect(
      codecsMatch(
        { mimeType: 'video/VP8', clockRate: 90000 },
        { mimeType: 'video/VP8', clockRate: 48000 },
      ),
    ).toBe(false);
  });
});

describe('preferredCodecOrder', () => {
  const vp8 = { mimeType: 'video/VP8', clockRate: 90000 };
  const vp9 = { mimeType: 'video/VP9', clockRate: 90000, sdpFmtpLine: 'profile-id=0' };
  const rtx = { mimeType: 'video/rtx', clockRate: 90000, sdpFmtpLine: 'apt=96' };

  it('puts the upstream codec first and keeps the rest', () => {
    const ordered = preferredCodecOrder([vp9], [vp8, vp9, rtx]);
    expect(ordered[0]).toBe(vp9);
    expect(ordered).toHaveLength(3);
    expect(ordered).toContain(vp8);
    expect(ordered).toContain(rtx);
  });

  it('auxiliary upstream entries never lead the order', () => {
    const ordered = preferredCodecOrder([rtx, vp9], [vp8, vp9, rtx]);
    expect(ordered[0]).toBe(vp9);
  });

  it('no recognizable overlap: the default order comes back untouched', () => {
    const capabilities = [vp8, vp9];
    expect(preferredCodecOrder([{ mimeType: 'video/AV1' }], capabilities)).toBe(capabilities);
  });
});

describe('isAuxiliaryCodec', () => {
  it('flags RTP machinery, not media', () => {
    expect(isAuxiliaryCodec('video/rtx')).toBe(true);
    expect(isAuxiliaryCodec('video/ulpfec')).toBe(true);
    expect(isAuxiliaryCodec('video/VP9')).toBe(false);
  });
});
