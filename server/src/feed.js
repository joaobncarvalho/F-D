// F&D — feed de eventos da sala ("o Zé foi preso", "a Ana bebeu 12 golos").
//
// Serve dois problemas reais de festa: quem chega tarde não faz ideia do que se
// passou, e quem se distrai perde o fio. Vive na sala (não no modo), por isso
// sobrevive a mudar de jogo e vai no `room_state` como qualquer outro estado.

const MAX = 40; // só o histórico recente interessa (e o payload tem de ser leve)

/**
 * Acrescenta uma linha ao feed da sala.
 * @param room
 * @param emoji ícone curto (🍺 🚔 🎴 …)
 * @param text  frase já pronta para ler (server-side: nomes resolvidos)
 */
export function pushFeed(room, emoji, text) {
  if (!room || !text) return;
  const feed = (room.feed ||= []);
  feed.push({ id: (room.feedSeq = (room.feedSeq || 0) + 1), emoji, text, at: Date.now() });
  if (feed.length > MAX) feed.splice(0, feed.length - MAX);
}

export function clearFeed(room) {
  room.feed = [];
  room.feedSeq = 0;
}

export function serializeFeed(room) {
  return room.feed || [];
}
