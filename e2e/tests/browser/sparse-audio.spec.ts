import { expect, test, type Browser } from '@playwright/test';
import { createECDH } from 'node:crypto';
import { ProtoClient, cleanup } from '../../helpers/ws-client';
import { createRoom } from '../../helpers/http';
import { closeAll, joinRoomPage, type RoomPageHandle } from '../../helpers/pages';

test('real room activates authenticated sparse audio and preserves individual mute', async ({ browser }) => {
  const handles: RoomPageHandle[] = [];
  try {
    const { slug } = await createRoom('sparse-audio');
    for (const name of ['alice', 'bob']) handles.push(await joinRoomPage(browser, slug, name));
    for (const handle of handles) await expect(handle.page.locator('.room-layout')).toHaveAttribute('data-audio-network', 'sparse');
    const [alice, bob] = handles as [RoomPageHandle, RoomPageHandle];
    await alice.page.getByRole('button', { name: /unmute microphone/i }).click();
    const remote = bob.page.locator('.tile').filter({ hasText: 'alice' });
    await expect(remote).toHaveAttribute('data-speaking', 'true');
    await alice.page.getByRole('button', { name: /mute microphone/i }).click();
    await expect(remote).not.toHaveAttribute('data-speaking', 'true');
    await expect.poll(async () => Number(await bob.page.locator('.room-layout').getAttribute('data-audio-decoded'))).toBeGreaterThan(10);
    await expect(bob.page.locator('.room-layout')).toHaveAttribute('data-audio-network', 'sparse');
  } finally { await closeAll(handles); }
});

const participants = Number(process.env.E2E_SPARSE_PEERS ?? 10);
test(`${participants} actual room participants converge to at most eight connected PCs each`, async ({ browser }, testInfo) => {
  expect(Number.isInteger(participants) && participants >= 10 && participants <= 20).toBe(true);
  const handles: RoomPageHandle[] = [], ownedBrowsers: Browser[] = [];
  const browserCount = Number(process.env.E2E_SPARSE_BROWSERS ?? 1);
  expect(Number.isInteger(browserCount) && browserCount >= 1 && browserCount <= 4).toBe(true);
  try {
    for (let i = 1; i < browserCount; i++) ownedBrowsers.push(await browser.browserType().launch(testInfo.project.use.launchOptions));
    const browsers = [browser, ...ownedBrowsers];
    const { slug } = await createRoom('sparse-room');
    for (let i = 0; i < participants; i++) handles.push(await joinRoomPage(browsers[i % browsers.length]!, slug, `listener-${i}`, {
      prepare: async page => { await page.addInitScript(() => {
        const host = window as unknown as { __audioPcs: RTCPeerConnection[] }; host.__audioPcs = [];
        const Native = RTCPeerConnection;
        window.RTCPeerConnection = new Proxy(Native, { construct(target, args) {
          const pc = Reflect.construct(target, args) as RTCPeerConnection; host.__audioPcs.push(pc);
          const errors: string[] = []; Object.assign(pc, { __errors: errors });
          for (const name of ['setLocalDescription', 'setRemoteDescription', 'addIceCandidate'] as const) {
            const method = pc[name].bind(pc) as (value: unknown) => Promise<void>;
            Object.assign(pc, { [name]: async (value: unknown) => {
              try { return await method(value); } catch (error) { errors.push(`${name}: ${String(error)}`); throw error; }
            } });
          }
          return pc;
        } });
      }); },
    }));
    for (const handle of handles) {
      await expect(handle.page.locator('.room-layout')).toHaveAttribute('data-audio-network', 'sparse');
      await expect.poll(() => handle.page.evaluate(() => (window as unknown as { __audioPcs: RTCPeerConnection[] })
        .__audioPcs.filter(pc => pc.connectionState !== 'closed').length)).toBeLessThanOrEqual(8);
      expect(await handle.page.evaluate(() => (window as unknown as { __audioPcs: RTCPeerConnection[] })
        .__audioPcs.filter(pc => pc.connectionState === 'connected').length)).toBeGreaterThan(0);
      expect(await handle.page.evaluate(() => (window as unknown as { __audioPcs: RTCPeerConnection[] })
        .__audioPcs.filter(pc => pc.connectionState !== 'closed').flatMap(pc => pc.getSenders())
        .filter(sender => sender.track?.kind === 'audio').length)).toBe(0);
    }
    await handles[0]!.page.getByRole('button', { name: /unmute microphone/i }).click();
    for (const handle of handles.slice(1)) await expect(handle.page.locator('.tile').filter({ hasText: 'listener-0' }))
      .toHaveAttribute('data-speaking', 'true');
    // All sources remain eligible: active-speaker optimization is not a cap.
    for (const handle of handles.slice(1)) await handle.page.getByRole('button', { name: /unmute microphone/i }).click();
    // Observe every listener over the same window. Chromium's synthetic mic
    // emits periodic tones; serial assertions would wait for separate cycles.
    for (const handle of handles) await handle.page.evaluate(() => {
      const heard = new Set<string>(); Object.assign(window, { __heardSources: heard });
      const sample = () => document.querySelectorAll('.tile[data-speaking="true"] .tile-name').forEach(name => heard.add(name.textContent?.trim() ?? ''));
      const observer = new MutationObserver(sample); observer.observe(document.querySelector('.room-layout')!,
        { subtree: true, attributes: true, attributeFilter: ['data-speaking'] }); sample();
    });
    for (const handle of handles) {
      const expected = handles.filter(source => source !== handle).map(source => source.name);
      await expect.poll(() => handle.page.evaluate(names => names.every(name =>
        (window as unknown as { __heardSources: Set<string> }).__heardSources.has(name)), expected)).toBe(true);
      await expect(handle.page.locator('.room-layout')).toHaveAttribute('data-audio-network', 'sparse');
    }
  } catch (error) {
    for (const handle of handles) console.log(handle.name, JSON.stringify(await handle.page.evaluate(() => ({
      attrs: [...document.querySelector('.room-layout')!.attributes].filter(a => a.name.startsWith('data-audio')).map(a => [a.name, a.value]),
      pcs: (window as unknown as { __audioPcs: RTCPeerConnection[] }).__audioPcs.map(pc => [pc.connectionState, pc.signalingState, pc.iceConnectionState, pc.localDescription?.type, pc.remoteDescription?.type, (pc as unknown as { __errors: string[] }).__errors, pc.sctp?.transport.state]),
    })), null, 2));
    throw error;
  } finally { await closeAll(handles); for (const owned of ownedBrowsers) await owned.close(); }
});

test('an unsupported newcomer returns a live sparse room to native P2P audio', async ({ browser }) => {
  const handles: RoomPageHandle[] = [];
  try {
    const { slug } = await createRoom('sparse-fallback');
    handles.push(await joinRoomPage(browser, slug, 'alice'), await joinRoomPage(browser, slug, 'bob'));
    await expect(handles[0]!.page.locator('.room-layout')).toHaveAttribute('data-audio-network', 'sparse');
    handles.push(await joinRoomPage(browser, slug, 'legacy', { prepare: async page => { await page.addInitScript(() => {
      Object.defineProperty(window, 'AudioEncoder', { value: undefined });
    }); } }));
    for (const handle of handles) await expect(handle.page.locator('.room-layout')).toHaveAttribute('data-audio-network', 'mesh');
    await handles[0]!.page.getByRole('button', { name: /unmute microphone/i }).click();
    for (const handle of handles.slice(1)) await expect(handle.page.locator('.tile').filter({ hasText: 'alice' })).toHaveAttribute('data-speaking', 'true');
  } finally { await closeAll(handles); }
});

test('a failed audio channel restores native voice and records the adjustment', async ({ browser }) => {
  const handles: RoomPageHandle[] = [];
  try {
    const { slug } = await createRoom('audio-channel-failure');
    const alice = await joinRoomPage(browser, slug, 'alice', { prepare: async page => { await page.addInitScript(() => {
      const host = window as unknown as { __voiceChannels: RTCDataChannel[] }; host.__voiceChannels = [];
      const create = RTCPeerConnection.prototype.createDataChannel;
      RTCPeerConnection.prototype.createDataChannel = function (label, options) {
        const channel = create.call(this, label, options);
        if (label === 'audio-v1') host.__voiceChannels.push(channel);
        return channel;
      };
    }); } }); handles.push(alice);
    const bob = await joinRoomPage(browser, slug, 'bob'); handles.push(bob);
    for (const handle of handles) await expect(handle.page.locator('.room-layout')).toHaveAttribute('data-audio-network', 'sparse');
    await alice.page.getByRole('button', { name: /unmute microphone/i }).click();
    await expect(bob.page.locator('.tile').filter({ hasText: 'alice' })).toHaveAttribute('data-speaking', 'true');
    await alice.page.evaluate(() => (window as unknown as { __voiceChannels: RTCDataChannel[] }).__voiceChannels.forEach(channel => channel.close()));
    for (const handle of handles) await expect(handle.page.locator('.room-layout')).toHaveAttribute('data-audio-network', 'mesh');
    await expect(bob.page.locator('.tile').filter({ hasText: 'alice' })).toHaveAttribute('data-speaking', 'true');
    // Either endpoint may detect the closed channel first; the adjustment
    // event describes that endpoint's local fallback, not a fabricated remote error.
    const failed = [];
    for (const handle of handles) if (await handle.page.locator('.room-layout').getAttribute('data-audio-fallback')) failed.push(handle);
    expect(failed.length).toBeGreaterThan(0);
    for (const handle of failed) {
      await handle.page.locator('button[data-key="C"]').click();
      await expect(handle.page.locator('[data-room-event="voiceFallback"]')).toHaveCount(1);
    }
  } finally { await closeAll(handles); }
});

test('tampered signatures and replayed datagrams cannot create another playable source', async ({ browser }) => {
  const handles: RoomPageHandle[] = [];
  try {
    const { slug } = await createRoom('audio-integrity');
    const alice = await joinRoomPage(browser, slug, 'alice', { prepare: async page => { await page.addInitScript(() => {
      const send = RTCDataChannel.prototype.send as (this: RTCDataChannel, data: string | Blob | ArrayBuffer | ArrayBufferView) => void;
      let injected = 0;
      RTCDataChannel.prototype.send = function (this: RTCDataChannel, data: string | Blob | ArrayBuffer | ArrayBufferView) {
        if (this.label === 'audio-v1' && data instanceof ArrayBuffer && injected++ < 10) {
          const corrupt = new Uint8Array(data.slice(0)); corrupt[corrupt.length - 1]! ^= 1;
          send.call(this, corrupt); send.call(this, data);
        }
        send.call(this, data);
      } as RTCDataChannel['send'];
    }); } }); handles.push(alice);
    const bob = await joinRoomPage(browser, slug, 'bob'); handles.push(bob);
    const state = bob.page.locator('.room-layout');
    await expect(state).toHaveAttribute('data-audio-network', 'sparse');
    await expect.poll(async () => Number(await state.getAttribute('data-audio-invalid'))).toBeGreaterThan(0);
    await expect.poll(async () => Number(await state.getAttribute('data-audio-duplicates'))).toBeGreaterThan(0);
    await alice.page.getByRole('button', { name: /unmute microphone/i }).click();
    const remote = bob.page.locator('.tile').filter({ hasText: 'alice' });
    await expect(remote).toHaveCount(1); await expect(remote).toHaveAttribute('data-speaking', 'true');
    await expect(state).toHaveAttribute('data-audio-network', 'sparse');
  } finally { await closeAll(handles); }
});

test('a disappeared participant cannot block other listeners returning to native voice', async ({ browser }) => {
  const handles: RoomPageHandle[] = [];
  try {
    const { slug } = await createRoom('audio-dead-seat');
    for (const name of ['alice', 'bob', 'gone']) handles.push(await joinRoomPage(browser, slug, name));
    for (const handle of handles) await expect(handle.page.locator('.room-layout')).toHaveAttribute('data-audio-network', 'sparse');
    const gone = handles.pop()!;
    await gone.page.evaluate(() => {
      const send = WebSocket.prototype.send;
      WebSocket.prototype.send = function (data) {
        if (typeof data === 'string' && JSON.parse(data).t === 'leave') return;
        send.call(this, data);
      };
    });
    await gone.context.close(); // No goodbye: the server retains this seat for its resume grace.
    for (const handle of handles) await expect(handle.page.locator('.room-layout')).toHaveAttribute('data-audio-network', 'mesh');
    const [alice, bob] = handles as [RoomPageHandle, RoomPageHandle];
    await alice.page.getByRole('button', { name: /unmute microphone/i }).click();
    await expect(bob.page.locator('.tile').filter({ hasText: 'alice' })).toHaveAttribute('data-speaking', 'true');
  } finally { await closeAll(handles); }
});

test('the stereo music profile retains native RTP while voice peers remain audible', async ({ browser }) => {
  const handles: RoomPageHandle[] = [];
  try {
    const { slug } = await createRoom('audio-music-profile');
    handles.push(await joinRoomPage(browser, slug, 'music', { prepare: async page => { await page.addInitScript(() => {
      localStorage.setItem('freecord:media-settings', JSON.stringify({ mic: { profile: 'music' } }));
    }); } }));
    handles.push(await joinRoomPage(browser, slug, 'listener'));
    for (const handle of handles) await expect(handle.page.locator('.room-layout')).toHaveAttribute('data-audio-network', 'mesh');
    await handles[0]!.page.getByRole('button', { name: /unmute microphone/i }).click();
    await expect(handles[1]!.page.locator('.tile').filter({ hasText: 'music' })).toHaveAttribute('data-speaking', 'true');
  } finally { await closeAll(handles); }
});


test('default activation declines an eleven-seat sparse plan before using its routes', async ({ browser }) => {
  const handles: RoomPageHandle[] = [], protocolPeers: ProtoClient[] = [];
  try {
    const { slug } = await createRoom('audio-validation-envelope');
    const listener = await joinRoomPage(browser, slug, 'listener'); handles.push(listener);
    const key = createECDH('prime256v1'); key.generateKeys();
    const publicKey = key.getPublicKey().toString('base64url');
    for (let i = 0; i < 10; i++) protocolPeers.push(await ProtoClient.join(slug, `capability-${i}`));
    for (const peer of protocolPeers) peer.send({ t: 'audio-capability', capability: { publicKey, streamId: peer.selfId } });
    await expect(listener.page.locator('.room-layout')).toHaveAttribute('data-audio-fallback', 'validation-envelope');
    await expect(listener.page.locator('.room-layout')).toHaveAttribute('data-audio-network', 'mesh');
  } finally { await cleanup(protocolPeers); await closeAll(handles); }
});
