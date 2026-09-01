import { describe, expect, it } from 'vitest';
import { RoomRegistry } from '../src/app/room-registry.js';
import {
  SignalingSession,
  parseClientMessage,
  sweepStalePeers,
} from '../src/app/signaling.js';
import { ROOM_LIMITS, type ServerMessage } from '../src/domain/room.js';

function connect(registry: RoomRegistry, slug: string, name: string) {
  const inbox: ServerMessage[] = [];
  const channel = { send: (m: ServerMessage) => inbox.push(m), closed: false, close() {} };
  channel.close = () => {
    channel.closed = true;
  };
  const session = new SignalingSession(registry, slug, name, channel);
  return { session, inbox, channel, last: () => inbox[inbox.length - 1] };
}

function setup(now?: () => number) {
  const registry = new RoomRegistry(now);
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

  it('ping é ecoado como pong só para quem perguntou', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');

    ana.session.handleMessage({ t: 'ping', ts: 1234 });
    expect(ana.last()).toEqual({ t: 'pong', ts: 1234 });
    expect(bia.inbox.some((m) => m.t === 'pong')).toBe(false);
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

describe('sweepStalePeers', () => {
  it('expulsa quem parou de dar sinal de vida, esvaziando a sala', () => {
    let clock = 0;
    const { registry, slug } = setup(() => clock);
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');

    clock = ROOM_LIMITS.peerTimeoutMs + 1;
    ana.session.handleMessage({ t: 'ping', ts: 1 });

    expect(sweepStalePeers(registry)).toBe(1);
    expect(bia.channel.closed).toBe(true);
    expect(ana.last()).toEqual({ t: 'peer-left', id: bia.session.peerId });
    expect(registry.summarize(slug).participantCount).toBe(1);

    // Sem ninguém dando sinal de vida, a sala esvazia e passa a expirar.
    clock += ROOM_LIMITS.peerTimeoutMs + 1;
    expect(sweepStalePeers(registry)).toBe(1);
    expect(registry.summarize(slug).participantCount).toBe(0);
    clock += ROOM_LIMITS.emptyTimeoutMs + 1;
    expect(registry.sweepExpired()).toBe(1);
  });

  it('libera o lock de tela de quem foi expulso', () => {
    let clock = 0;
    const { registry, slug } = setup(() => clock);
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');

    ana.session.handleMessage({ t: 'screen-request', streamId: 's-ana' });
    clock = ROOM_LIMITS.peerTimeoutMs + 1;
    bia.session.handleMessage({ t: 'ping', ts: 1 });
    sweepStalePeers(registry);

    expect(bia.inbox.map((m) => m.t)).toContain('screen-stopped');
    bia.session.handleMessage({ t: 'screen-request', streamId: 's-bia' });
    expect(bia.last()).toEqual({ t: 'screen-started', id: bia.session.peerId, streamId: 's-bia' });
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
    expect(parseClientMessage(JSON.stringify({ t: 'ping', ts: 42 }))).toEqual({ t: 'ping', ts: 42 });
    expect(parseClientMessage(JSON.stringify({ t: 'ping', ts: 'agora' }))).toBeNull();
  });
});
