import { expect, test } from '@playwright/test';
import { createRoom } from '../../helpers/http';
import { ProtoClient, cleanup } from '../../helpers/ws-client';
test('audio generation is coordinated, resumes unchanged and withdraws without oscillation', async () => {
  const { slug } = await createRoom('audio-coordination');
  const peers: ProtoClient[] = [];
  try {
    const a = await ProtoClient.join(slug, 'a'), b = await ProtoClient.join(slug, 'b'); peers.push(a, b);
    for (const peer of peers) peer.send({ t: 'audio-capability', capability: { publicKey: 'B'.repeat(87), streamId: peer.selfId } });
    const prepared = await a.expectWhere(m => m.t === 'audio-plan' && m.plan.mode === 'sparse', 'sparse plan');
    const generation = prepared.plan.generation;
    a.send({ t: 'audio-ready', generation });
    await a.expectSilence(m => m.t === 'audio-commit' && m.generation === generation, 150);
    b.send({ t: 'audio-ready', generation });
    expect((await a.expect('audio-commit')).generation).toBe(generation);
    const token = a.welcome!.resumeToken; a.close(); await a.whenClosed();
    const resumed = await ProtoClient.resume(slug, token); peers.push(resumed);
    expect((await resumed.expect('audio-plan')).plan).toEqual(prepared.plan);
    expect((await resumed.expect('audio-commit')).generation).toBe(generation);
    b.send({ t: 'audio-capability', capability: null });
    const fallback = await resumed.expect('audio-plan'); expect(fallback.plan.mode).toBe('mesh');
    b.send({ t: 'audio-capability', capability: { publicKey: 'B'.repeat(87), streamId: b.selfId } });
    await resumed.expectSilence(m => m.t === 'audio-plan');
  } finally { await cleanup(peers); }
});
