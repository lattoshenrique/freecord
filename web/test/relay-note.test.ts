import { describe, expect, it } from 'vitest';
import { extractRelayNote, makeMissingNote, makeRelayNote } from '../src/lib/screen-relay';

describe('relay notes', () => {
  it('round-trips the stall note', () => {
    expect(extractRelayNote(makeRelayNote())).toEqual({ v: 1, kind: 'stall' });
  });

  it('round-trips the missing note with the tree it names', () => {
    expect(extractRelayNote(makeMissingNote('peer-7'))).toEqual({
      v: 1,
      kind: 'missing',
      of: 'peer-7',
    });
  });

  it('is not confused by the SDP and ICE the same envelope carries', () => {
    expect(extractRelayNote({ description: { type: 'offer', sdp: 'v=0' } })).toBeNull();
    expect(extractRelayNote({ candidate: { candidate: 'a=x' } })).toBeNull();
    expect(extractRelayNote({ screens: { v: 1, of: 'peer-7', on: true } })).toBeNull();
  });

  it('refuses a note it cannot read rather than guessing', () => {
    expect(extractRelayNote(null)).toBeNull();
    expect(extractRelayNote('stall')).toBeNull();
    expect(extractRelayNote({ relay: null })).toBeNull();
    // A future kind from a newer client: ignored, never half-applied.
    expect(extractRelayNote({ relay: { v: 1, kind: 'whatever' } })).toBeNull();
    // A version we do not speak, whatever else it carries.
    expect(extractRelayNote({ relay: { v: 2, kind: 'stall' } })).toBeNull();
    // `missing` without the tree is unanswerable: a peer may be a leaf in
    // one tree and a relay in another.
    expect(extractRelayNote({ relay: { v: 1, kind: 'missing' } })).toBeNull();
  });
});
