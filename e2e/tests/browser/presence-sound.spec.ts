import { expect, test } from '@playwright/test';
import { createRoom } from '../../helpers/http';
import { closeAll, joinRoomPage, leaveRoom, type RoomPageHandle } from '../../helpers/pages';

/**
 * The door cues. Arrival and departure have to be told apart without
 * looking, so the test asserts the shape of each — rising for a join,
 * falling for a leave — rather than the exact notes, which are the sound
 * designer's business.
 *
 * The oscillator is the only place the cue is observable headless: nothing
 * reaches the speakers on a CI runner. Patching `createOscillator` records
 * the frequencies the page asks for; the analysers the speaking detector
 * builds never create one, so the readings are the cues alone.
 */
interface ToneSpy {
  __tones: number[];
}

function installToneSpy(): void {
  const spied = window as unknown as Window & ToneSpy;
  spied.__tones = [];
  const create = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function patched(this: AudioContext) {
    const oscillator = create.call(this);
    const setValue = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
    oscillator.frequency.setValueAtTime = (value: number, when: number) => {
      spied.__tones.push(value);
      return setValue(value, when);
    };
    return oscillator;
  };
}

const readTones = () => (window as unknown as Window & ToneSpy).__tones;
const clearTones = () => {
  (window as unknown as Window & ToneSpy).__tones = [];
};

test.describe('presence sounds', () => {
  let handles: RoomPageHandle[] = [];

  test.afterEach(async () => {
    await closeAll(handles);
    handles = [];
  });

  test('a join rises, a leave falls', async ({ browser }) => {
    const { slug } = await createRoom('presence-sound');
    const watcher = await joinRoomPage(browser, slug, 'watcher');
    handles = [watcher];
    await watcher.page.evaluate(installToneSpy);

    const guest = await joinRoomPage(browser, slug, 'guest');
    handles.push(guest);
    await expect.poll(() => watcher.page.evaluate(readTones), { timeout: 20_000 }).toHaveLength(2);
    const join = await watcher.page.evaluate(readTones);
    expect(join[0]!).toBeLessThan(join[1]!);

    await watcher.page.evaluate(clearTones);
    await leaveRoom(handles.pop()!);
    await expect.poll(() => watcher.page.evaluate(readTones), { timeout: 20_000 }).toHaveLength(2);
    const leave = await watcher.page.evaluate(readTones);
    expect(leave[0]!).toBeGreaterThan(leave[1]!);
    // Two different events must not make the same sound.
    expect(leave).not.toEqual(join);
  });
});
