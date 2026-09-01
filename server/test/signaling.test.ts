import { describe, expect, it } from 'vitest';
import { RoomRegistry } from '../src/app/room-registry.js';
import { SignalingSession, parseClientMessage } from '../src/app/signaling.js';
import type { ServerMessage } from '../src/domain/room.js';

function connect(registry: RoomRegistry, slug: string, name: string) {
  const inbox: ServerMessage[] = [];
  const session = new SignalingSession(registry, slug, name, (m) => inbox.push(m));
  return { session, inbox, last: () => inbox[inbox.length - 1] };
}

function setup() {
  const registry = new RoomRegistry();
  const { slug } = registry.createRoom('Sala');
  return { registry, slug };
}

describe('SignalingSession', () => {
  it('welcome traz os pares existentes; entrada é anunciada aos demais', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');

    const welcome = bia.inbox[0]!;
    expect(welcome.t).toBe('welcome');
    if (welcome.t === 'welcome') {
      expect(welcome.peers).toEqual([{ id: ana.session.peerId, name: 'Ana' }]);
    }
    expect(ana.last()).toEqual({
      t: 'peer-joined',
      peer: { id: bia.session.peerId, name: 'Bia' },
    });
  });

  it('relay de signal chega só ao destinatário', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');
    const carla = connect(registry, slug, 'Carla');

    ana.session.handleMessage({ t: 'signal', to: bia.session.peerId, data: { sdp: 'x' } });
    expect(bia.last()).toEqual({ t: 'signal', from: ana.session.peerId, data: { sdp: 'x' } });
    expect(carla.inbox.some((m) => m.t === 'signal')).toBe(false);
  });

  it('chat é broadcast para todos, inclusive quem enviou', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');

    ana.session.handleMessage({ t: 'chat', text: '  oi!  ' });
    const received = bia.last();
    expect(received.t).toBe('chat');
    if (received.t === 'chat') {
      expect(received.text).toBe('oi!');
      expect(received.from.name).toBe('Ana');
    }
    expect(ana.last().t).toBe('chat');
  });

  it('lock de tela: um por vez, negado ao segundo, liberado ao parar', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');

    ana.session.handleMessage({ t: 'screen-request', streamId: 's-ana' });
    expect(bia.last()).toEqual({ t: 'screen-started', id: ana.session.peerId, streamId: 's-ana' });

    bia.session.handleMessage({ t: 'screen-request', streamId: 's-bia' });
    expect(bia.last()).toEqual({ t: 'screen-denied' });

    ana.session.handleMessage({ t: 'screen-stop' });
    expect(bia.last()).toEqual({ t: 'screen-stopped' });

    bia.session.handleMessage({ t: 'screen-request', streamId: 's-bia' });
    expect(ana.last()).toEqual({ t: 'screen-started', id: bia.session.peerId, streamId: 's-bia' });
  });

  it('desconexão libera o lock de tela e anuncia a saída', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');

    ana.session.handleMessage({ t: 'screen-request', streamId: 's-ana' });
    ana.session.close();

    expect(bia.inbox.map((m) => m.t)).toContain('screen-stopped');
    expect(bia.last()).toEqual({ t: 'peer-left', id: ana.session.peerId });
    expect(registry.summarize(slug).participantCount).toBe(1);

    bia.session.handleMessage({ t: 'screen-request', streamId: 's-bia' });
    expect(bia.inbox.some((m) => m.t === 'screen-started')).toBe(true);
  });
});

describe('parseClientMessage', () => {
  it('aceita apenas o protocolo fechado', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'chat', text: 'oi' }))).toEqual({
      t: 'chat',
      text: 'oi',
    });
    expect(parseClientMessage(JSON.stringify({ t: 'signal', to: 'x', data: 1 }))).toEqual({
      t: 'signal',
      to: 'x',
      data: 1,
    });
    expect(parseClientMessage('not-json')).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'hack' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'chat' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ t: 'signal', to: 7, data: 1 }))).toBeNull();
  });
});
