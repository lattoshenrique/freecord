import { describe, expect, it } from 'vitest';
import { isWatchController, watchControllerName } from './control';

const ana = { id: 'ana-id', name: 'Ana' };
const bia = { id: 'bia-id', name: 'Bia' };

describe('watch controller', () => {
  it('is only the participant who started the active watch', () => {
    expect(isWatchController(ana.id, ana)).toBe(true);
    expect(isWatchController(ana.id, bia)).toBe(false);
    expect(isWatchController(null, ana)).toBe(false);
  });

  it('is named from either this participant or the room roster', () => {
    expect(watchControllerName(ana.id, ana, [bia])).toBe('Ana');
    expect(watchControllerName(ana.id, bia, [ana])).toBe('Ana');
    expect(watchControllerName(ana.id, bia, [])).toBeNull();
  });
});
