import { expect, test, type Page } from '@playwright/test';
import { createRoom } from '../../helpers/http';
import { closeAll, expectSeatCount, joinRoomPage, type RoomPageHandle } from '../../helpers/pages';
import { ProtoClient } from '../../helpers/ws-client';

/** Every frame that crossed a page's signaling socket, either way. */
interface Wire {
  sent: string[];
  received: string[];
}

/**
 * Installs, before the page loads, a recorder on the signaling socket and a
 * shim that keeps every data channel the mesh creates reachable from the
 * test (the UI has no indicator for a channel being open — the shim is the
 * only way to wait for the mesh instead of guessing with a sleep).
 */
async function prepare(page: Page, wire: Wire): Promise<void> {
  page.on('websocket', (socket) => {
    socket.on('framesent', (frame) => wire.sent.push(String(frame.payload)));
    socket.on('framereceived', (frame) => wire.received.push(String(frame.payload)));
  });
  await page.addInitScript(() => {
    const channels: unknown[] = [];
    (window as unknown as { __dataChannels: unknown[] }).__dataChannels = channels;
    const proto = (window as unknown as { RTCPeerConnection: { prototype: any } }).RTCPeerConnection
      .prototype;
    const create = proto.createDataChannel;
    proto.createDataChannel = function (this: unknown, ...args: unknown[]) {
      const channel = create.apply(this, args);
      channels.push(channel);
      return channel;
    };
  });
}

function openChatChannels(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      (window as unknown as { __dataChannels: Array<{ label: string; readyState: string }> }).__dataChannels.filter(
        (channel) => channel.label === 'chat' && channel.readyState === 'open',
      ).length,
  );
}

/** Resolves once every page has an open chat channel to every other seat. */
async function waitForMesh(handles: RoomPageHandle[]): Promise<void> {
  for (const handle of handles) {
    await expect
      .poll(() => openChatChannels(handle.page), { timeout: 20_000 })
      .toBe(handles.length - 1);
  }
}

function isChatFrame(frame: string): boolean {
  try {
    return (JSON.parse(frame) as { t?: string }).t === 'chat';
  } catch {
    return false;
  }
}

async function say(handle: RoomPageHandle, text: string): Promise<void> {
  const box = handle.page.locator('.chat-panel textarea');
  await box.fill(text);
  await box.press('Enter');
}

/**
 * Text crosses the room on the mesh's own chat channel: two real Chromium
 * peers, the signaling socket recorded on both, and not one chat frame on
 * it. The fallback is proven with a seat that is in the room but not on
 * the mesh — a raw protocol client that never answers an offer — which
 * turns the same message into a server relay until it leaves.
 */
test.describe('peer-to-peer chat', () => {
  let handles: RoomPageHandle[] = [];
  const wires = new Map<string, Wire>();

  test.afterEach(async () => {
    await closeAll(handles);
    handles = [];
    wires.clear();
  });

  async function join(browser: Parameters<typeof joinRoomPage>[0], slug: string, name: string) {
    const wire: Wire = { sent: [], received: [] };
    wires.set(name, wire);
    return joinRoomPage(browser, slug, name, { prepare: (page) => prepare(page, wire) });
  }

  test('text rides the mesh, fans out to a later seat, and never touches the socket', async ({ browser }) => {
    const { slug } = await createRoom('p2p-chat');
    handles = [await join(browser, slug, 'alice'), await join(browser, slug, 'bob')];
    const [alice, bob] = handles;
    await waitForMesh(handles);

    await alice.page.locator('button[data-key="C"]').click();
    await bob.page.locator('button[data-key="C"]').click();
    await say(alice, 'hello over the mesh');

    // The sender echoes its own line (no server to echo it back)…
    await expect(alice.page.locator('.chat-bubble.mine')).toContainText('hello over the mesh');
    // …and the receiver has it, attributed to the right seat.
    const bobBubble = bob.page.locator('.chat-bubble');
    await expect(bobBubble).toContainText('hello over the mesh', { timeout: 20_000 });
    await expect(bobBubble).toContainText('alice');
    await expect(bobBubble).not.toHaveClass(/mine/);

    // A third seat joins later: its channels come up and the fan-out covers it.
    handles.push(await join(browser, slug, 'carol'));
    const carol = handles[2]!;
    await waitForMesh(handles);
    await carol.page.locator('button[data-key="C"]').click();
    await say(alice, 'three of us now');
    await expect(carol.page.locator('.chat-bubble')).toContainText('three of us now', { timeout: 20_000 });
    await expect(bobBubble.last()).toContainText('three of us now');
    await expect(bobBubble).toHaveCount(2);

    // The recorder was live (it saw the SDP go by) and no chat rode the socket.
    expect(wires.get('alice')!.sent.some((frame) => frame.includes('"t":"signal"'))).toBe(true);
    for (const [name, wire] of wires) {
      expect(wire.sent.filter(isChatFrame), `${name} sent chat over the socket`).toEqual([]);
      expect(wire.received.filter(isChatFrame), `${name} received chat over the socket`).toEqual([]);
    }
    await bob.page.screenshot({ path: 'test-results/chat-p2p-received.png' });
  });

  test('relays through the server while a seat is not on the mesh, and returns to the mesh after', async ({
    browser,
  }) => {
    const { slug } = await createRoom('p2p-chat-fallback');
    handles = [await join(browser, slug, 'alice'), await join(browser, slug, 'bob')];
    const [alice, bob] = handles;
    await waitForMesh(handles);
    await alice.page.locator('button[data-key="C"]').click();
    await bob.page.locator('button[data-key="C"]').click();

    // A seat that never answers an offer: in the roster, never on the mesh.
    const ghost = await ProtoClient.join(slug, 'ghost');
    await expectSeatCount(alice.page, 3);

    await say(alice, 'is anyone out there');
    const relayed = await ghost.expect('chat');
    expect(relayed.text).toBe('is anyone out there');
    expect(relayed.from.name).toBe('alice');
    await expect(bob.page.locator('.chat-bubble')).toContainText('is anyone out there', { timeout: 20_000 });
    await expect(alice.page.locator('.chat-bubble.mine')).toContainText('is anyone out there');
    const aliceWire = wires.get('alice')!;
    expect(aliceWire.sent.filter(isChatFrame)).toHaveLength(1);

    // The ghost leaves: the room is whole on the mesh again.
    ghost.leave();
    await expectSeatCount(alice.page, 2);
    await say(alice, 'back on the mesh');
    await expect(bob.page.locator('.chat-bubble').last()).toContainText('back on the mesh', { timeout: 20_000 });
    await expect(alice.page.locator('.chat-bubble.mine').last()).toContainText('back on the mesh');
    expect(aliceWire.sent.filter(isChatFrame)).toHaveLength(1);
    expect(wires.get('bob')!.received.filter(isChatFrame)).toHaveLength(1);
  });
});
