/**
 * @heavy — a real full room, one browser context per seat. Skipped unless
 * E2E_HEAVY=1 (twenty headless pages × a 20-peer WebRTC mesh is a
 * workstation-sized job):
 *   npm run test:heavy --workspace e2e
 */
import { expect, test, type Browser } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { ROOM_LIMITS } from '../../../server/src/domain/room.js';
import { createRoom, getRoom } from '../../helpers/http';
import {
  closeAll,
  expectSeatCount,
  joinRoomPage,
  occupiedTiles,
  type RoomPageHandle,
} from '../../helpers/pages';

const MAX = ROOM_LIMITS.maxParticipants;

test.describe('full room @heavy', () => {
  let handles: RoomPageHandle[] = [];
  let ownedBrowsers: Browser[] = [];

  test.afterEach(async () => {
    try { await closeAll(handles); }
    finally {
      handles = [];
      for (const browser of ownedBrowsers) await browser.close();
      ownedBrowsers = [];
    }
  });

  test(`${MAX} guests fill the room and it tears down clean`, async ({ browser }, testInfo) => {
    test.skip(!process.env.E2E_HEAVY, `set E2E_HEAVY=1 to run the ${MAX}-context room`);
    test.setTimeout(600_000);

    const browserCount = Number(process.env.E2E_HEAVY_BROWSERS ?? 1);
    expect(Number.isInteger(browserCount) && browserCount >= 1 && browserCount <= MAX).toBe(true);
    for (let i = 1; i < browserCount; i++) {
      ownedBrowsers.push(await browser.browserType().launch(testInfo.project.use.launchOptions));
    }
    const browsers = [browser, ...ownedBrowsers];

    const { slug } = await createRoom('full-house');
    for (let i = 0; i < MAX; i++) {
      handles.push(await joinRoomPage(browsers[i % browsers.length], slug, `guest-${i}`, {
        prepare: async page => { await page.addInitScript(() => {
          const state = window as unknown as { researchConnections: RTCPeerConnection[] };
          state.researchConnections = [];
          window.RTCPeerConnection = new Proxy(window.RTCPeerConnection, {
            construct(Target, args) {
              const pc = new Target(args[0]);
              state.researchConnections.push(pc);
              return pc;
            },
          });
        }); },
      }));
    }

    // Everyone agrees the room is full.
    for (const { page } of handles) {
      await expectSeatCount(page, MAX);
      await expect(occupiedTiles(page)).toHaveCount(MAX, { timeout: 120_000 });
    }
    expect((await getRoom(slug)).participantCount).toBe(MAX);

    // Presence alone does not prove a working mesh. Keep the same deadline
    // when splitting browser instances: this is an explicit host-layout control.
    for (const { page } of handles) await expect.poll(() => page.evaluate(() =>
      (window as unknown as { researchConnections: RTCPeerConnection[] }).researchConnections
        .filter(pc => pc.connectionState === 'connected').length), { timeout: 60_000 }).toBe(MAX - 1);
    const snapshot = () => Promise.all(handles.map(({ page }) => page.evaluate(async () => {
      const pcs = (window as unknown as { researchConnections: RTCPeerConnection[] }).researchConnections
        .filter(pc => pc.connectionState !== 'closed');
      const reports = await Promise.all(pcs.map(pc => pc.getStats()));
      const audio = reports.flatMap(report => [...report.values()].filter(s => s.kind === 'audio' &&
        (s.type === 'inbound-rtp' || s.type === 'outbound-rtp')));
      return { at: performance.now(), connections: pcs.length,
        inbound: audio.filter(s => s.type === 'inbound-rtp').map(s => ({ id: s.id, packets: s.packetsReceived })),
        outboundBytes: audio.filter(s => s.type === 'outbound-rtp').reduce((n, s) => n + s.bytesSent, 0) };
    })));
    const before = await snapshot();
    // A fixed measurement interval, not a wait masking a missing connection.
    await new Promise(resolve => setTimeout(resolve, 2000));
    const after = await snapshot();
    for (let i = 0; i < MAX; i++) {
      expect(after[i].connections).toBe(MAX - 1);
      expect(after[i].inbound).toHaveLength(MAX - 1);
      for (const inbound of after[i].inbound) {
        expect(inbound.packets).toBeGreaterThan(before[i].inbound.find(old => old.id === inbound.id)?.packets ?? 0);
      }
    }
    const baseline = { participants: MAX, browserInstances: browserCount, muted: true,
      conditions: 'Actual built room UI, Chromium fake microphone, 2 s interval. RTP payload; no acoustic latency measurement.',
      peers: after.map((sample, i) => ({ connections: sample.connections, incomingSources: sample.inbound.length,
        outgoingKbps: (sample.outboundBytes - before[i].outboundBytes) * 8 / (sample.at - before[i].at) })) };
    await writeFile(testInfo.outputPath('mesh-baseline.json'), JSON.stringify(baseline, null, 2));

    // Nobody crashed getting here.
    for (const { page } of handles) {
      expect(page.isClosed()).toBe(false);
      await expect(page.locator('.seat-count')).toBeVisible();
    }

    // Teardown: closing contexts sends the pagehide goodbye; the room empties.
    await closeAll(handles);
    handles = [];
    await expect
      .poll(async () => (await getRoom(slug)).participantCount, { timeout: 60_000 })
      .toBe(0);
  });
});
