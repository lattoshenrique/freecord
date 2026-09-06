import { describe, expect, it } from 'vitest';
import { RoomEvents } from '../src/lib/room-events';
describe('room event log', () => {
  it('timestamps membership once and preserves the departed name', () => {
    const events = new RoomEvents(() => 1234), peer = { id: 'a', name: 'Ana' };
    expect(events.join(peer)).toEqual({ kind: 'joined', peer, ts: 1234 });
    expect(events.join(peer)).toBeNull();
    expect(events.leave('a')).toEqual({ kind: 'left', peer, ts: 1234 });
    expect(events.leave('a')).toBeNull();
  });
  it('prunes membership missed offline without inventing event times', () => {
    const events = new RoomEvents(() => 555);
    events.remember([{ id: 'old', name: 'Old' }]); events.connection('old', false);
    events.remember([{ id: 'new', name: 'New' }]);
    expect(events.peer('old')).toBeUndefined();
    expect(events.connection('old', true)).toBeNull();
    expect(events.leave('new')).toEqual({ kind: 'left', peer: { id: 'new', name: 'New' }, ts: 555 });
  });
  it('distinguishes a transport interruption and recovery from membership', () => {
    const events = new RoomEvents(() => 9876), peer = { id: 'a', name: 'Ana' }; events.remember([peer]);
    expect(events.connection('a', true)).toBeNull();
    expect(events.connection('a', false)?.kind).toBe('connectionLost');
    expect(events.connection('a', false)).toBeNull();
    expect(events.connection('a', true)).toEqual({ kind: 'connectionRestored', peer, ts: 9876 });
    expect(events.connection('a', true)).toBeNull();
    expect(events.connection('unknown', false)).toBeNull();
  });
});
