// F&D — núcleo partilhado do Modo Tabuleiro. Helpers usados TANTO pelo board.js
// (fluxo) COMO pelos motores das casas (blackjack/beerpong/??). Fica aqui para
// evitar imports circulares (board.js ↔ motores). Sem dependências do board.js.

import { randomUUID } from 'node:crypto';
import { AppError } from '../errors.js';
import { pushFeed } from '../feed.js';

/** Garante que há tabuleiro (e, opcionalmente, a fase certa). */
export function requireBoard(room, phases) {
  const b = room.board;
  if (!b) throw new AppError('Não há tabuleiro ativo.');
  if (phases && !phases.includes(b.phase)) throw new AppError('Não é altura disso.');
  return b;
}

export const MINI_DRINK = 3; // golos se "beber" em vez de fazer o desafio
// Mecânica das cartas jogáveis (o CATÁLOGO — emoji/nome/desc — vem dos bancos/BD).
// Só estas keys podem ser distribuídas; uma carta na admin com key desconhecida
// nunca entra no baralho (defensivo).
export const CURSE_CARD_KEYS = ['curse_drink', 'curse_back', 'curse_prison'];
export const KNOWN_CARD_KEYS = ['swap', 'back2', 'prison', 'skip', 'shield', 'drink3', 'steal', ...CURSE_CARD_KEYS];
export const isCurseCard = (key) => CURSE_CARD_KEYS.includes(key);

export const nameOf = (room, id) => room.players.get(id)?.name;

/**
 * Golos por EFEITO DE CASA (?? , prisão, mini-jogo, ganância, maldição). Passa
 * pela Aliança: quem estiver ligado ao bebedor bebe metade (arredondada p/ cima).
 * Os golos de andar (preço do avanço) e das cartas jogadas NÃO passam por aqui —
 * a aliança é sobre o azar das casas, não sobre escolhas próprias.
 */
export function drinkFromSquare(room, playerId, n) {
  const b = room.board;
  const me = b.players[playerId];
  if (!me || n <= 0) return null;
  me.golos += n;
  const allyId = me.allianceWith;
  const ally = allyId ? b.players[allyId] : null;
  if (!ally || !me.allianceTurnsLeft) return null;
  const half = Math.ceil(n / 2);
  ally.golos += half;
  return { allyId, allyName: nameOf(room, allyId), golos: half };
}

/** Corta uma aliança nos dois lados (fim do prazo, saída de jogador…). */
export function breakAlliance(b, playerId) {
  const me = b.players[playerId];
  if (!me) return;
  const other = me.allianceWith ? b.players[me.allianceWith] : null;
  if (other && other.allianceWith === playerId) {
    other.allianceWith = null;
    other.allianceTurnsLeft = 0;
  }
  me.allianceWith = null;
  me.allianceTurnsLeft = 0;
}

/** Escolha ponderada (pesos ≥1) de 1 item. */
export function weightedPick(items) {
  const total = items.reduce((s, it) => s + Math.max(1, it.weight || 1), 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= Math.max(1, it.weight || 1);
    if (r < 0) return it;
  }
  return items[items.length - 1];
}

/** Amostra ponderada SEM reposição de n itens distintos. */
export function weightedSample(items, n) {
  const pool = items.slice();
  const out = [];
  while (out.length < n && pool.length) {
    const pick = weightedPick(pool);
    out.push(pick);
    pool.splice(pool.indexOf(pick), 1);
  }
  return out;
}

/** Dá uma carta aleatória do catálogo (só keys com mecânica). Devolve a meta. */
export function giveRandomCard(b, player) {
  const pool = b.banks.cards.filter((c) => KNOWN_CARD_KEYS.includes(c.key));
  if (!pool.length) return null;
  const c = weightedPick(pool);
  player.cards.push({ id: randomUUID(), key: c.key });
  return c;
}

/** Chegou ao fim (deu a volta)? Marca vitória e termina. */
export function checkWin(room, playerId) {
  const b = room.board;
  const me = b.players[playerId];
  if (me.pos >= b.size) {
    me.pos = b.size;
    me.finished = true;
    b.winnerId = playerId;
    b.phase = 'over';
    pushFeed(room, '🏁', `${nameOf(room, playerId)} deu a volta ao tabuleiro e ganhou!`);
    return true;
  }
  return false;
}

/** Prisão: consequência aleatória do banco (salta vezes / bebe / recua / perde carta). */
export function applyPrison(room, playerId, reason = 'prisão') {
  const b = room.board;
  const me = b.players[playerId];
  const nm = nameOf(room, playerId);
  me.slowStreak = 0;
  me.prisonCount += 1;
  const p = weightedPick(b.banks.prison);
  if (p.skipTurns) me.skipTurns += p.skipTurns;
  if (p.drink) drinkFromSquare(room, playerId, p.drink);
  if (p.back) me.pos = Math.max(0, me.pos - p.back);
  if (p.loseCard && me.cards.length) me.cards.shift();
  b.lastEvent = { text: `🚔 ${nm} foi PRESO (${reason}): ${p.note}` };
  pushFeed(room, '🚔', `${nm} foi preso (${reason}) — ${p.note}`);
}

/** IDs ativos na corrida (ligados, não terminados), por ordem. */
export function activeIds(room) {
  const b = room.board;
  return b.order.filter((id) => room.players.get(id)?.connected && b.players[id] && !b.players[id].finished);
}

// Uma jogada passou: gasta o prazo da aliança de quem jogou e das regras ativas.
function tickDurations(room) {
  const b = room.board;
  const me = b.currentPlayerId ? b.players[b.currentPlayerId] : null;
  if (me?.allianceTurnsLeft > 0) {
    me.allianceTurnsLeft -= 1;
    if (me.allianceTurnsLeft <= 0) breakAlliance(b, b.currentPlayerId);
  }
  if (b.activeRules?.length) {
    for (const r of b.activeRules) r.remaining -= 1;
    b.activeRules = b.activeRules.filter((r) => r.remaining > 0);
  }
}

/** Passa a vez ao próximo ativo, respeitando "salta vez" (prisão). */
export function advanceBoardTurn(room) {
  const b = room.board;
  tickDurations(room);
  const order = activeIds(room);
  if (!order.length) {
    b.currentPlayerId = null;
    return;
  }
  // idx = -1 se o jogador da vez já não está ativo (saiu/expulso) → começa no primeiro.
  let idx = order.indexOf(b.currentPlayerId);
  for (let step = 0; step < order.length; step++) {
    idx = (idx + 1 + order.length) % order.length;
    const id = order[idx];
    if (b.players[id].skipTurns > 0) {
      b.players[id].skipTurns -= 1;
      continue;
    }
    b.currentPlayerId = id;
    return;
  }
  b.currentPlayerId = order[0]; // todos tinham salta-vez → recomeça no primeiro
}
