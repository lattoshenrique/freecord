import { expect, test } from '@playwright/test';
import { createRoom } from '../../helpers/http';
import { closeAll, joinRoomPage, leaveRoom, type RoomPageHandle } from '../../helpers/pages';
test('chat records timed joins, signaling outages, recovery and departure once', async ({ browser }) => {
  const handles: RoomPageHandle[] = [];
  try {
    const { slug } = await createRoom('room-events');
    const alice = await joinRoomPage(browser, slug, 'alice'); handles.push(alice);
    await alice.page.locator('button[data-key="C"]').click();
    const bob = await joinRoomPage(browser, slug, 'bob', { prepare: async page => { await page.addInitScript(() => {
      const host = window as unknown as { __roomSockets: WebSocket[] }; host.__roomSockets = [];
      const Native = WebSocket;
      window.WebSocket = new Proxy(Native, { construct(target, args) {
        const socket = Reflect.construct(target, args) as WebSocket; host.__roomSockets.push(socket); return socket;
      } });
    }); } }); handles.push(bob);
    const joined = alice.page.locator('[data-room-event="joined"]').filter({ hasText: 'bob' });
    await expect(joined).toHaveCount(1);
    await expect(joined.locator('time')).toHaveText(/\d{1,2}:\d{2}:\d{2}/);
    expect(await joined.locator('time').getAttribute('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await bob.page.evaluate(() => {
      const sockets = (window as unknown as { __roomSockets: WebSocket[] }).__roomSockets;
      sockets.at(-1)!.close();
    });
    await expect(alice.page.locator('[data-room-event="connectionLost"]').filter({ hasText: 'bob' })).toHaveCount(1);
    await expect(alice.page.locator('[data-room-event="connectionRestored"]').filter({ hasText: 'bob' })).toHaveCount(1);
    await expect(joined).toHaveCount(1);
    await expect(alice.page.locator('[data-room-event="left"]').filter({ hasText: 'bob' })).toHaveCount(0);
    await leaveRoom(bob); handles.pop();
    await expect(alice.page.locator('[data-room-event="left"]').filter({ hasText: 'bob' })).toHaveCount(1);
  } finally { await closeAll(handles); }
});
