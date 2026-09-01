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

    ana.session.handleMessage({ t: 'screen-request', streamId: 's-ana', quality: 'equilibrada' });
    expect(bia.inbox.map((m) => m.t)).toContain('screen-started');
    expect(bia.inbox.at(-2)).toEqual({
      t: 'screen-started',
      id: ana.session.peerId,
      streamId: 's-ana',
    });

    bia.session.handleMessage({ t: 'screen-request', streamId: 's-bia', quality: 'equilibrada' });
    expect(bia.last()).toEqual({ t: 'screen-denied' });

    ana.session.handleMessage({ t: 'screen-stop' });
    expect(bia.last()).toEqual({ t: 'screen-stopped' });

    bia.session.handleMessage({ t: 'screen-request', streamId: 's-bia', quality: 'equilibrada' });
    expect(ana.inbox.some((m) => m.t === 'screen-started' && m.id === bia.session.peerId)).toBe(
      true,
    );
  });

  it('desconexão libera o lock de tela e anuncia a saída', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');

    ana.session.handleMessage({ t: 'screen-request', streamId: 's-ana', quality: 'equilibrada' });
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

    ana.session.handleMessage({ t: 'screen-request', streamId: 's-ana', quality: 'equilibrada' });
    clock = ROOM_LIMITS.peerTimeoutMs + 1;
    bia.session.handleMessage({ t: 'ping', ts: 1 });
    sweepStalePeers(registry);

    expect(bia.inbox.map((m) => m.t)).toContain('screen-stopped');
    bia.session.handleMessage({ t: 'screen-request', streamId: 's-bia', quality: 'equilibrada' });
    expect(bia.inbox.some((m) => m.t === 'screen-started' && m.id === bia.session.peerId)).toBe(
      true,
    );
  });
});

describe('árvore de retransmissão da tela', () => {
  function routesOf(inbox: ServerMessage[]) {
    return inbox.filter((m) => m.t === 'screen-route');
  }

  it('sharer recebe os filhos; com fanout sobrando, todos são filhos diretos', () => {
    const { registry, slug } = setup();
    const ana = connect(registry, slug, 'Ana');
    const bia = connect(registry, slug, 'Bia');
    const carla = connect(registry, slug, 'Carla');

    ana.session.handleMessage({ t: 'screen-request', streamId: 's-ana', quality: 'nitida' });

    const anaRoute = routesOf(ana.inbox).at(-1)!;
    expect(anaRoute.t).toBe('screen-route');
    if (anaRoute.t === 'screen-route') {
      expect(anaRoute.source).toBeNull();
      expect(anaRoute.quality).toBe('nitida');
      expect([...anaRoute.children].sort()).toEqual(
        [bia.session.peerId, carla.session.peerId].sort(),
      );
    }
    const biaRoute = routesOf(bia.inbox).at(-1)!;
    if (biaRoute.t === 'screen-route') {
      expect(biaRoute.children).toEqual([]);
      expect(biaRoute.source).toEqual({ id: ana.session.peerId, streamId: 's-ana' });
    }
  });

  it('com sala cheia, um relay recebe filhos e o report atualiza o source deles', () => {
    const { registry, slug } = setup();
    const sharer = connect(registry, slug, 'Sharer');
    const others = ['B', 'C', 'D', 'E'].map((name) => connect(registry, slug, name));

    sharer.session.handleMessage({ t: 'screen-request', streamId: 's-1', quality: 'equilibrada' });

    // 4 espectadores, fanout 3: um deles é relay do quarto.
    const sharerRoute = routesOf(sharer.inbox).at(-1)!;
    if (sharerRoute.t !== 'screen-route') throw new Error('sem rota do sharer');
    expect(sharerRoute.children).toHaveLength(3);

    const byId = new Map(others.map((o) => [o.session.peerId, o]));
    const relayId = [...byId.keys()].sort()[0]!; // BFS em ordem lexicográfica
    const relay = byId.get(relayId)!;
    const relayRoute = routesOf(relay.inbox).at(-1)!;
    if (relayRoute.t !== 'screen-route') throw new Error('sem rota do relay');
    expect(relayRoute.children).toHaveLength(1);
    const leafId = relayRoute.children[0]!;
    const leaf = byId.get(leafId)!;

    // Antes do report do relay, a folha não sabe de onde receber.
    const leafBefore = routesOf(leaf.inbox).at(-1)!;
    if (leafBefore.t === 'screen-route') {
      expect(leafBefore.source).toBeNull();
    }

    relay.session.handleMessage({ t: 'screen-relay', streamId: 'fwd-1' });
    const leafAfter = routesOf(leaf.inbox).at(-1)!;
    if (leafAfter.t === 'screen-route') {
      expect(leafAfter.source).toEqual({ id: relayId, streamId: 'fwd-1' });
    }
  });

  it('folha não pode se anunciar como relay', () => {
    const { registry, slug } = setup();
    const sharer = connect(registry, slug, 'Sharer');
    const bia = connect(registry, slug, 'Bia');

    sharer.session.handleMessage({ t: 'screen-request', streamId: 's-1', quality: 'equilibrada' });
    const before = routesOf(bia.inbox).length;
    bia.session.handleMessage({ t: 'screen-relay', streamId: 'forjado' });
    // Sem filhos na árvore, o report é ignorado: nenhuma rota nova sai.
    expect(routesOf(bia.inbox).length).toBe(before);
  });

  it('saída de um relay reroteia os órfãos', () => {
    const { registry, slug } = setup();
    const sharer = connect(registry, slug, 'Sharer');
    const others = ['B', 'C', 'D', 'E'].map((name) => connect(registry, slug, name));

    sharer.session.handleMessage({ t: 'screen-request', streamId: 's-1', quality: 'equilibrada' });
    const byId = new Map(others.map((o) => [o.session.peerId, o]));
    const relayId = [...byId.keys()].sort()[0]!;
    const relay = byId.get(relayId)!;

    relay.session.close();

    // Com 3 espectadores restantes, todos viram filhos diretos do sharer.
    const sharerRoute = routesOf(sharer.inbox).at(-1)!;
    if (sharerRoute.t !== 'screen-route') throw new Error('sem rota do sharer');
    expect([...sharerRoute.children].sort()).toEqual(
      [...byId.keys()].filter((id) => id !== relayId).sort(),
    );
    for (const [id, other] of byId) {
      if (id === relayId) continue;
      const route = routesOf(other.inbox).at(-1)!;
      if (route.t === 'screen-route') {
        expect(route.source).toEqual({ id: sharer.session.peerId, streamId: 's-1' });
        expect(route.children).toEqual([]);
      }
    }
  });

  it('quem entra durante a tela recebe rota', () => {
    const { registry, slug } = setup();
    const sharer = connect(registry, slug, 'Sharer');
    sharer.session.handleMessage({ t: 'screen-request', streamId: 's-1', quality: 'fluida' });

    const late = connect(registry, slug, 'Zoe');
    const route = routesOf(late.inbox).at(-1)!;
    expect(route.t).toBe('screen-route');
    if (route.t === 'screen-route') {
      expect(route.source).toEqual({ id: sharer.session.peerId, streamId: 's-1' });
      expect(route.quality).toBe('fluida');
    }
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

  it('screen-request sem qualidade válida cai no padrão; screen-relay é validado', () => {
    expect(parseClientMessage(JSON.stringify({ t: 'screen-request', streamId: 's' }))).toEqual({
      t: 'screen-request',
      streamId: 's',
      quality: 'equilibrada',
    });
    expect(
      parseClientMessage(JSON.stringify({ t: 'screen-request', streamId: 's', quality: 'nitida' })),
    ).toEqual({ t: 'screen-request', streamId: 's', quality: 'nitida' });
    expect(
      parseClientMessage(JSON.stringify({ t: 'screen-request', streamId: 's', quality: '4k' })),
    ).toEqual({ t: 'screen-request', streamId: 's', quality: 'equilibrada' });
    expect(parseClientMessage(JSON.stringify({ t: 'screen-relay', streamId: 'fwd' }))).toEqual({
      t: 'screen-relay',
      streamId: 'fwd',
    });
    expect(parseClientMessage(JSON.stringify({ t: 'screen-relay', streamId: 7 }))).toBeNull();
  });
});
