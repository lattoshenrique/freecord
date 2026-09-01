/**
 * Árvore de retransmissão do compartilhamento de tela.
 *
 * No mesh puro a tela sobe N−1 vezes de quem compartilha — o teto de
 * qualidade cai conforme a sala enche. Aqui o sharer envia para até
 * `SCREEN_FANOUT` pares e cada um deles reencaminha o track recebido para
 * até `SCREEN_FANOUT` outros: o upload de qualquer participante fica
 * limitado a `SCREEN_FANOUT` cópias, independente do tamanho da sala, e o
 * servidor continua sem tocar mídia.
 *
 * O custo é um salto extra de reencode para quem está além do primeiro
 * nível (~100–200 ms e uma geração de compressão) — com 8 participantes a
 * profundidade máxima é 2.
 */

/** Máximo de cópias da tela que qualquer par envia. */
export const SCREEN_FANOUT = 3;

export interface ScreenRoute {
  /** Para quem este par envia a tela. */
  children: string[];
  /** De quem este par recebe a tela (null para o sharer). */
  parentId: string | null;
}

/**
 * Calcula a árvore: BFS a partir do sharer, preenchendo até `fanout`
 * filhos por nó. Os demais pares entram em ordem lexicográfica de id —
 * determinística nas duas bordas (Node e Durable Object), independente da
 * ordem de conexão.
 */
export function computeScreenTree(
  sharerId: string,
  peerIds: Iterable<string>,
  fanout: number = SCREEN_FANOUT,
): Map<string, ScreenRoute> {
  const viewers = [...peerIds].filter((id) => id !== sharerId).sort();
  const routes = new Map<string, ScreenRoute>();
  routes.set(sharerId, { children: [], parentId: null });

  const queue = [sharerId];
  let next = 0;
  while (queue.length > 0 && next < viewers.length) {
    const parentId = queue.shift()!;
    const children = viewers.slice(next, next + fanout);
    next += children.length;
    routes.get(parentId)!.children = children;
    for (const child of children) {
      routes.set(child, { children: [], parentId });
      queue.push(child);
    }
  }
  return routes;
}
