// Casa ?? ("mistério"): 3 cartas viradas ao contrário. Cada uma esconde um efeito
// tipado do banco `evento` (b.banks.events). O conteúdo fica escondido no payload
// (serializePending) até o jogador escolher — surpresa real. Se o efeito for
// "card", resolve-se já uma carta concreta (para a revelação mostrar qual é).
// Extraído do board.js (comportamento idêntico). Depende só de ./core.js.

import { randomUUID } from 'node:crypto';
import { AppError } from '../errors.js';
import { requireBoard, nameOf, checkWin, applyPrison, advanceBoardTurn, weightedSample, weightedPick, KNOWN_CARD_KEYS } from './core.js';

export function openEvento(room, playerId) {
  const b = room.board;
  const chosen = weightedSample(b.banks.events, 3).map((e) => {
    if (e.effect === 'card') {
      const pool = b.banks.cards.filter((c) => KNOWN_CARD_KEYS.includes(c.key));
      const c = pool.length ? weightedPick(pool) : null;
      return c
        ? { effect: 'card', card: c.key, emoji: c.emoji, title: c.name, desc: c.desc }
        : { effect: 'advance', value: 2, emoji: '🚀', title: 'Sorte!', desc: 'Avanças 2 casas' };
    }
    return { effect: e.effect, value: e.value, emoji: e.emoji, title: e.title, desc: e.desc };
  });
  b.pending = { kind: 'evento', playerId, cards: chosen };
}

// Aplica um efeito tipado do ?? ao jogador; devolve o texto de revelação.
function applyEventoEffect(room, playerId, ev) {
  const b = room.board;
  const me = b.players[playerId];
  const nm = nameOf(room, playerId);
  switch (ev.effect) {
    case 'advance':
      me.pos = Math.min(b.size, me.pos + (ev.value || 0));
      checkWin(room, playerId);
      return `🚀 ${nm} teve sorte — avança ${ev.value} casa${ev.value > 1 ? 's' : ''}!`;
    case 'back':
      me.pos = Math.max(0, me.pos - (ev.value || 0));
      return `💨 ${nm} azar — recua ${ev.value} casa${ev.value > 1 ? 's' : ''}!`;
    case 'drink':
      me.golos += ev.value || 0;
      return `🍺 ${nm} bebe ${ev.value} golos!`;
    case 'others_drink':
      for (const oid of Object.keys(b.players)) if (oid !== playerId) b.players[oid].golos += ev.value || 0;
      return `👯 Todos menos ${nm} bebem ${ev.value} golos!`;
    case 'card': {
      // A carta concreta já foi decidida em openEvento (ev.card); dá exatamente essa.
      const meta = b.banks.cards.find((c) => c.key === ev.card);
      if (meta) me.cards.push({ id: randomUUID(), key: meta.key });
      return `🎴 ${nm} ganhou a carta ${meta?.name || 'sorte'}!`;
    }
    case 'prison':
      applyPrison(room, playerId, 'sorte tramada'); // escreve o lastEvent detalhado
      return b.lastEvent.text;
    default:
      return `${nm} não teve nada.`;
  }
}

/** Casa ??: revela a carta escolhida (0-2), aplica o efeito e passa a vez. */
export function boardEventoPick(room, playerId, index) {
  const b = requireBoard(room, ['playing']);
  if (!b.pending || b.pending.kind !== 'evento') throw new AppError('Nada para revelar.');
  if (b.currentPlayerId !== playerId) throw new AppError('Não é a tua vez.');
  const i = Number(index);
  const chosen = b.pending.cards[i];
  if (!chosen) throw new AppError('Escolha inválida.');
  const text = applyEventoEffect(room, playerId, chosen); // muta o estado
  b.pending = null;
  b.lastEvent = {
    text,
    evento: { pickedIndex: i, emoji: chosen.emoji, title: chosen.title, desc: chosen.desc, card: chosen.card || null },
  };
  if (b.phase !== 'over') advanceBoardTurn(room);
  return b;
}
