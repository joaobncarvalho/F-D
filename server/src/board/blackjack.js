// ---------- Casa Blackjack: bate a "casa" (dealer) → recompensa positiva ----------
// Extraído do board.js (comportamento idêntico). Depende só de ./core.js.

import { AppError } from '../errors.js';
import { requireBoard, nameOf, checkWin, advanceBoardTurn, giveRandomCard, MINI_DRINK } from './core.js';

const BJ_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const BJ_SUITS = ['♠', '♥', '♦', '♣'];
function drawCard() {
  return { rank: BJ_RANKS[Math.floor(Math.random() * BJ_RANKS.length)], suit: BJ_SUITS[Math.floor(Math.random() * BJ_SUITS.length)] };
}
export function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 'A') { total += 11; aces += 1; }
    else if (c.rank === 'K' || c.rank === 'Q' || c.rank === 'J' || c.rank === '10') total += 10;
    else total += Number(c.rank);
  }
  while (total > 21 && aces > 0) { total -= 10; aces -= 1; }
  return total;
}

export function openBlackjack(room, playerId) {
  room.board.pending = {
    kind: 'blackjack',
    playerId,
    stage: 'player', // player (a decidir hit/stand) | done
    player: [drawCard(), drawCard()],
    dealer: [drawCard(), drawCard()], // dealer[0] fica escondido até "stand"
  };
}

/** Recompensa POSITIVA por vencer a casa (equivalente ao ?? mas só coisas boas). */
function positiveReward(room, playerId) {
  const b = room.board;
  const me = b.players[playerId];
  switch (Math.floor(Math.random() * 3)) {
    case 0: {
      const c = giveRandomCard(b, me);
      if (c) return `ganha a carta ${c.name} ${c.emoji}`;
      me.pos = Math.min(b.size, me.pos + 1); // sem cartas no catálogo → avança na mesma
      return 'avança +1 casa extra 🚀';
    }
    case 1:
      for (const oid of Object.keys(b.players)) if (oid !== playerId) b.players[oid].golos += 2;
      return 'todos os outros bebem 2 🍻';
    default:
      me.pos = Math.min(b.size, me.pos + 1);
      return 'avança +1 casa extra 🚀';
  }
}

function resolveBlackjack(room, result) {
  const b = room.board;
  const p = b.pending;
  const id = p.playerId;
  const me = b.players[id];
  const nm = nameOf(room, id);
  let text;
  if (result === 'win') {
    me.pos = Math.min(b.size, me.pos + 2);
    const reward = positiveReward(room, id);
    text = `🃏 ${nm} venceu a casa no Blackjack — avança 2 e ${reward}!`;
    checkWin(room, id);
  } else if (result === 'push') {
    text = `🃏 ${nm} empatou com a casa — fica na mesma.`;
  } else if (result === 'bust') {
    me.golos += MINI_DRINK;
    text = `🃏 ${nm} rebentou (+21) — bebe ${MINI_DRINK} golos!`;
  } else {
    me.golos += MINI_DRINK;
    text = `🃏 ${nm} perdeu para a casa — bebe ${MINI_DRINK} golos!`;
  }
  b.lastEvent = {
    text,
    blackjack: { result, player: p.player, dealer: p.dealer, pv: handValue(p.player), dv: handValue(p.dealer) },
  };
  b.pending = null;
  if (b.phase !== 'over') advanceBoardTurn(room);
  return b;
}

/** Casa Blackjack: pedir carta (hit) ou plantar (stand). A casa saca até 17. */
export function boardBlackjack(room, playerId, action) {
  const b = requireBoard(room, ['playing']);
  if (!b.pending || b.pending.kind !== 'blackjack') throw new AppError('Nada de Blackjack.');
  if (b.currentPlayerId !== playerId) throw new AppError('Não é a tua vez.');
  const p = b.pending;
  if (p.stage !== 'player') throw new AppError('A mão já terminou.');
  if (action === 'hit') {
    p.player.push(drawCard());
    if (handValue(p.player) > 21) return resolveBlackjack(room, 'bust');
    if (handValue(p.player) === 21) return resolveBlackjack(room, standResult(p)); // 21 → planta sozinho
    return b;
  }
  if (action === 'stand') return resolveBlackjack(room, standResult(p));
  throw new AppError('Ação inválida.');
}

// A casa saca até 17 e compara. (Muta p.dealer para revelar a mão final.)
function standResult(p) {
  while (handValue(p.dealer) < 17) p.dealer.push(drawCard());
  const pv = handValue(p.player);
  const dv = handValue(p.dealer);
  if (dv > 21 || pv > dv) return 'win';
  if (pv < dv) return 'lose';
  return 'push';
}
