// F&D — Modo Tabuleiro ("Monopólio de bebida"). SEM vidas. Ganha quem dá a volta.
//
// Fluxo: escolher peão → lançar dado (ordem) → jogar. Na tua vez podes jogar
// CARTAS contra outros e depois AVANÇAR 1/2/3 casas (2/4/6 golos, máx 3). A casa
// onde cais resolve-se: mini-jogo (desafio rápido) · ?? (sorte) · Gamble (aposta) ·
// Blackjack (bate a "casa" → recompensa positiva). Prisão (perde vez + consequência
// aleatória) por ABUSO (andar 1 casa 3× seguidas), por ?? ou por carta "Denúncia".
// GANÂNCIA: andar 3 casas 2× seguidas → evento de azar quase garantido.
// Vitória: dar a volta (pos ≥ 60).
//
// CONTEÚDO EM DADOS: os bancos ?? / prisão / cartas vêm do repo (BD ou fallback em
// código, ver content/board.data.js) e são "fotografados" para `b.banks` no
// initBoard — assim os handlers síncronos leem-nos sem `await`. As cartas são
// PRIVADAS: o broadcast só leva a contagem; a mão vai por canal privado.
import * as repo from './repo.js';
import { AppError } from './errors.js';
import { requireBoard, nameOf, checkWin, advanceBoardTurn, applyPrison, activeIds, MINI_DRINK } from './board/core.js';
import { openBlackjack, handValue } from './board/blackjack.js';
import { openEvento } from './board/evento.js';
// Ações das casas chamadas diretamente pelo socket.js/bots.js — re-exportadas daqui.
export { boardBlackjack } from './board/blackjack.js';
export { boardBeerpong } from './board/beerpong.js';
export { boardEventoPick } from './board/evento.js';

const BOARD_SIZE = 60;
const GOLOS_PER_SQUARE = 2;
const SLOW_LIMIT = 3; // andar 1 casa Nx seguidas → prisão (abuso de bebida)
const FAST_LIMIT = 2; // andar 3 casas Nx seguidas → azar da ganância
const N_EVENTO = 6;
const N_GAMBLE = 4;
const N_BLACKJACK = 3;
const N_BEERPONG = 3;
export const PAWNS = ['🦊', '🐸', '🐵', '🦄', '🐙', '🐝', '🦁', '🐨', '🐼', '🐷', '🐧', '🐢', '🐔', '🦖'];
// Casas de mini-jogo: só os jogos RÁPIDOS single-player (os de grupo ficam na Roda).
const BOARD_MINI_TYPES = ['boca_calada', 'desafio', 'isto_ou_aquilo'];

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function activeOrder(room) {
  return [...room.players.values()]
    .filter((p) => p.connected)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
}

// ----- Bancos (?? / prisão / cartas) -----------------------------------------
// `b.banks` é o snapshot lido no initBoard. Estas helpers leem sempre dele.

/** Mapa key→{emoji,name,desc} para o cliente desenhar as cartas. */
function cardMeta(b) {
  const meta = {};
  for (const c of b.banks.cards) meta[c.key] = { emoji: c.emoji, name: c.name, desc: c.desc };
  return meta;
}
async function generateSquares() {
  const types = await repo.getGameTypes();
  const miniPool = BOARD_MINI_TYPES.map((k) => types.find((t) => t.key === k) || { key: k, label: k }).filter(Boolean);
  const bag = [];
  for (let i = 0; i < N_EVENTO; i++) bag.push({ kind: 'evento' });
  for (let i = 0; i < N_GAMBLE; i++) bag.push({ kind: 'gamble' });
  for (let i = 0; i < N_BLACKJACK; i++) bag.push({ kind: 'blackjack' });
  for (let i = 0; i < N_BEERPONG; i++) bag.push({ kind: 'beerpong' });
  const miniCount = BOARD_SIZE - 1 - bag.length;
  for (let i = 0; i < miniCount; i++) {
    const gt = miniPool[Math.floor(Math.random() * miniPool.length)];
    bag.push({ kind: 'mini', gameKey: gt.key, gameLabel: gt.label });
  }
  shuffle(bag);
  return [{ kind: 'partida' }, ...bag].map((s, i) => ({ i, ...s }));
}

export async function initBoard(room, { intensity = 'leve' } = {}) {
  const squares = await generateSquares();
  const banks = await repo.getBoardBanks(); // { events, prison, cards } — snapshot p/ os handlers síncronos
  const players = {};
  for (const p of room.players.values()) {
    players[p.id] = {
      pawn: null, pos: 0, golos: 0, slowStreak: 0, fastStreak: 0, skipTurns: 0,
      finished: false, cards: [], shield: false,
      prisonCount: 0, cardsPlayed: 0, // estatísticas do fim
    };
  }
  room.mode = 'board';
  room.board = {
    phase: 'pawn', // pawn | order | playing | over
    intensity: ['picante', 'hardcore', 'caos'].includes(intensity) ? intensity : 'leve',
    size: BOARD_SIZE,
    squares,
    banks,
    players,
    dice: {},
    order: [],
    currentPlayerId: null,
    pending: null, // { kind:'mini'|'gamble', ... } — bloqueia o fim da vez até resolver
    lastMove: null,
    lastEvent: null, // feedback de ?? / prisão / cartas / gamble
    winnerId: null,
  };
  return room.board;
}

export function pickPawn(room, playerId, pawn) {
  const b = requireBoard(room, ['pawn']);
  if (!PAWNS.includes(pawn)) throw new AppError('Peão inválido.');
  if (!b.players[playerId]) throw new AppError('Jogador inválido.');
  if (Object.entries(b.players).some(([id, pl]) => id !== playerId && pl.pawn === pawn))
    throw new AppError('Esse peão já está escolhido.');
  b.players[playerId].pawn = pawn;
  if (activeOrder(room).every((p) => b.players[p.id]?.pawn)) b.phase = 'order';
  return b;
}

export function rollOrder(room, playerId) {
  const b = requireBoard(room, ['order']);
  if (!b.players[playerId]) throw new AppError('Jogador inválido.');
  if (b.dice[playerId] != null) throw new AppError('Já lançaste o dado.');
  b.dice[playerId] = 1 + Math.floor(Math.random() * 6);
  const active = activeOrder(room);
  if (active.length && active.every((p) => b.dice[p.id] != null)) finalizeOrder(room);
  return b;
}

// Ordena por dado (desempate por ordem de entrada) e arranca a corrida.
function finalizeOrder(room) {
  const b = room.board;
  const active = activeOrder(room);
  b.order = active
    .slice()
    .sort((a, c) => b.dice[c.id] - b.dice[a.id] || a.joinedAt.localeCompare(c.joinedAt))
    .map((p) => p.id);
  b.currentPlayerId = b.order[0];
  b.phase = 'playing';
}

/** Avançar 1/2/3 casas (bebe 2/4/6 golos). Resolve a casa; volta = vitória. Async (conteúdo). */
export async function advance(room, playerId, squares) {
  const b = requireBoard(room, ['playing']);
  if (b.pending) throw new AppError('Resolve a casa primeiro.');
  if (b.currentPlayerId !== playerId) throw new AppError('Não é a tua vez.');
  const n = Number(squares);
  if (![1, 2, 3].includes(n)) throw new AppError('Escolhe 1, 2 ou 3 casas.');
  const me = b.players[playerId];

  me.golos += n * GOLOS_PER_SQUARE;
  me.pos += n;
  // Sequências: andar sempre 1 (abuso) → prisão; andar sempre 3 (ganância) → azar.
  let toPrison = false;
  let greedy = false;
  if (n === 1) {
    me.slowStreak += 1;
    me.fastStreak = 0;
    if (me.slowStreak >= SLOW_LIMIT) toPrison = true;
  } else if (n === 3) {
    me.fastStreak += 1;
    me.slowStreak = 0;
    if (me.fastStreak >= FAST_LIMIT) greedy = true;
  } else {
    me.slowStreak = 0;
    me.fastStreak = 0;
  }

  b.lastMove = { playerId, name: nameOf(room, playerId), squares: n, golos: n * GOLOS_PER_SQUARE, toPrison, greedy, landedKind: null };
  b.lastEvent = null;

  if (checkWin(room, playerId)) return { board: b, over: true };

  if (toPrison) {
    applyPrison(room, playerId, 'abuso de bebida');
    advanceBoardTurn(room);
    return { board: b, over: false };
  }

  // Ganância: 3 casas 2× seguidas → evento de azar (99% mau, 1% escapa). Ignora a casa onde caiu.
  if (greedy) {
    me.fastStreak = 0;
    applyGreed(room, playerId);
    if (b.phase !== 'over') advanceBoardTurn(room);
    return { board: b, over: b.phase === 'over' };
  }

  const sq = b.squares[me.pos];
  b.lastMove.landedKind = sq.kind;
  if (sq.kind === 'mini') {
    await openMini(room, sq); // define b.pending; a vez só passa ao resolver
    return { board: b, over: false };
  }
  if (sq.kind === 'gamble') {
    b.pending = { kind: 'gamble', playerId };
    return { board: b, over: false };
  }
  if (sq.kind === 'blackjack') {
    openBlackjack(room, playerId); // define b.pending; resolve-se com hit/stand
    return { board: b, over: false };
  }
  if (sq.kind === 'beerpong') {
    room.board.pending = { kind: 'beerpong', playerId }; // resolve-se com o lançamento (força)
    return { board: b, over: false };
  }
  if (sq.kind === 'evento') {
    openEvento(room, playerId); // 3 cartas viradas ao contrário; a vez só passa ao escolher (board_evento_pick)
    return { board: b, over: false };
  }
  advanceBoardTurn(room); // partida
  return { board: b, over: false };
}

// Azar da ganância: 99% algo mau, 1% escapa. Punição direta (não é escolha).
function applyGreed(room, playerId) {
  const b = room.board;
  const me = b.players[playerId];
  const nm = nameOf(room, playerId);
  if (Math.random() < 0.01) {
    b.lastEvent = { text: `😅 ${nm} abusou da ganância… mas escapou por um triz! Fica na mesma.`, greed: true };
    return;
  }
  switch (Math.floor(Math.random() * 4)) {
    case 0:
      me.pos = Math.max(0, me.pos - 3);
      b.lastEvent = { text: `🐍 Ganância castigada — ${nm} recua 3 casas!`, greed: true };
      break;
    case 1:
      me.golos += 4;
      b.lastEvent = { text: `🐍 Ganância castigada — ${nm} bebe 4 golos!`, greed: true };
      break;
    case 2:
      me.golos += 6;
      b.lastEvent = { text: `🐍 Ganância castigada — ${nm} vira 6 golos de uma vez! 🥴`, greed: true };
      break;
    case 3:
      applyPrison(room, playerId, 'ganância');
      if (b.lastEvent) b.lastEvent.greed = true;
      break;
  }
}

async function openMini(room, sq) {
  const b = room.board;
  if (sq.gameKey === 'isto_ou_aquilo') {
    const p = await repo.getRandomPrompt('isto_ou_aquilo', b.intensity);
    const parts = String(p?.text || '||').split('||');
    b.pending = { kind: 'mini', variant: 'choice', gameKey: sq.gameKey, gameLabel: sq.gameLabel, options: [(parts[0] || '—').trim(), (parts[1] || '—').trim()] };
  } else {
    const p = await repo.getRandomPrompt(sq.gameKey, b.intensity);
    b.pending = { kind: 'mini', variant: 'dare', gameKey: sq.gameKey, gameLabel: sq.gameLabel, text: p?.text || '—' };
  }
}

/** Resolver o mini-jogo da casa (fazer o desafio ou beber; ou escolher no Isto/Aquilo). */
export function boardResolve(room, playerId, { action, choice } = {}) {
  const b = requireBoard(room, ['playing']);
  if (!b.pending || b.pending.kind !== 'mini') throw new AppError('Nada para resolver.');
  if (b.currentPlayerId !== playerId) throw new AppError('Não é a tua vez.');
  const nm = nameOf(room, playerId);
  const p = b.pending;
  if (p.variant === 'dare') {
    if (action === 'drink') {
      b.players[playerId].golos += MINI_DRINK;
      b.lastEvent = { text: `🍺 ${nm} bebeu ${MINI_DRINK} golos em vez do desafio` };
    } else {
      b.lastEvent = { text: `✅ ${nm} fez o desafio!` };
    }
  } else {
    const i = Number(choice);
    if (i !== 0 && i !== 1) throw new AppError('Escolha inválida.');
    b.lastEvent = { text: `⚖️ ${nm} escolheu: ${p.options[i]}` };
  }
  b.pending = null;
  advanceBoardTurn(room);
  return b;
}

/** Casa Gamble: apostar golos p/ avançar 2, ou arriscar recuar 2. Não apostar = fica. */
export function boardGamble(room, playerId, bet) {
  const b = requireBoard(room, ['playing']);
  if (!b.pending || b.pending.kind !== 'gamble') throw new AppError('Nada para apostar.');
  if (b.currentPlayerId !== playerId) throw new AppError('Não é a tua vez.');
  const me = b.players[playerId];
  const nm = nameOf(room, playerId);
  if (bet) {
    if (Math.random() < 0.5) {
      me.pos = Math.min(b.size, me.pos + 2);
      me.golos += 4;
      b.lastEvent = { text: `🎲 ${nm} apostou e GANHOU — avança 2 (bebe 4)! 🎉`, gamble: { result: 'win' } };
    } else {
      me.pos = Math.max(0, me.pos - 2);
      b.lastEvent = { text: `🎲 ${nm} apostou e PERDEU — recua 2! 😬`, gamble: { result: 'lose' } };
    }
  } else {
    b.lastEvent = { text: `🎲 ${nm} não apostou — fica na mesma.`, gamble: { result: 'pass' } };
  }
  b.pending = null;
  if (!checkWin(room, playerId)) advanceBoardTurn(room);
  return b;
}

/** Jogar uma carta na tua vez (antes de avançar). */
export function playCard(room, playerId, cardId, targetId) {
  const b = requireBoard(room, ['playing']);
  if (b.currentPlayerId !== playerId) throw new AppError('Só jogas cartas na tua vez.');
  if (b.pending) throw new AppError('Resolve a casa primeiro.');
  const me = b.players[playerId];
  const idx = me.cards.findIndex((c) => c.id === cardId);
  if (idx < 0) throw new AppError('Não tens essa carta.');
  const card = me.cards[idx];
  const meta = cardMeta(b)[card.key] || { emoji: '🎴', name: 'Carta', desc: '' };
  const nm = nameOf(room, playerId);

  // Info para a animação de "carta a ser usada" (mostrada a todos).
  const cardInfo = { key: card.key, emoji: meta.emoji, name: meta.name, by: nm };

  if (card.key === 'shield') {
    me.shield = true;
    me.cards.splice(idx, 1);
    me.cardsPlayed += 1;
    b.lastEvent = { text: `🛡️ ${nm} ativou um Escudo`, card: { ...cardInfo, target: null } };
    return b;
  }

  const target = b.players[targetId];
  if (!target || targetId === playerId || !room.players.get(targetId)?.connected)
    throw new AppError('Escolhe um alvo válido.');
  me.cards.splice(idx, 1); // consome
  me.cardsPlayed += 1;
  const tnm = nameOf(room, targetId);

  if (target.shield) {
    target.shield = false;
    b.lastEvent = { text: `🛡️ ${tnm} bloqueou a ${meta.name} de ${nm}!`, card: { ...cardInfo, target: tnm, blocked: true } };
    return b;
  }

  switch (card.key) {
    case 'swap': {
      const tmp = me.pos;
      me.pos = target.pos;
      target.pos = tmp;
      b.lastEvent = { text: `🔁 ${nm} trocou de casa com ${tnm}` };
      break;
    }
    case 'back2':
      target.pos = Math.max(0, target.pos - 2);
      b.lastEvent = { text: `⬅️ ${nm} empurrou ${tnm} 2 casas atrás` };
      break;
    case 'prison':
      applyPrison(room, targetId, `denúncia de ${nm}`);
      break;
    case 'skip':
      target.skipTurns += 1;
      b.lastEvent = { text: `⏭️ ${nm} fez ${tnm} perder a próxima vez` };
      break;
    case 'drink3':
      target.golos += 3;
      b.lastEvent = { text: `🍺 ${nm} obrigou ${tnm} a beber 3 golos` };
      break;
    case 'steal':
      if (target.cards.length) {
        me.cards.push(target.cards.pop());
        b.lastEvent = { text: `🎁 ${nm} roubou uma carta a ${tnm}` };
      } else {
        b.lastEvent = { text: `🎁 ${tnm} não tinha cartas para roubar` };
      }
      break;
  }
  // Anexa a info da carta ao evento (applyPrison já escreveu o texto no caso 'prison').
  if (b.lastEvent) b.lastEvent.card = { ...cardInfo, target: tnm };
  return b;
}

// Garante que há um jogador da vez válido (ligado e não terminado). Usado após
// desconexões/reconexões/expulsões para o tabuleiro nunca ficar preso.
function boardEnsureCurrent(room) {
  const b = room.board;
  if (!b || b.phase !== 'playing') return;
  const active = activeIds(room);
  if (!active.length) { b.currentPlayerId = null; return; }
  if (!b.currentPlayerId || !active.includes(b.currentPlayerId)) b.currentPlayerId = active[0];
}

/** Desconexão: nunca deixar o tabuleiro preso (em qualquer fase). */
export function boardOnDisconnect(room, playerId) {
  const b = room.board;
  if (!b) return;
  if (b.phase === 'pawn') {
    const act = activeOrder(room);
    if (act.length && act.every((p) => b.players[p.id]?.pawn)) b.phase = 'order';
    return;
  }
  if (b.phase === 'order') {
    const act = activeOrder(room);
    if (act.length && act.every((p) => b.dice[p.id] != null)) finalizeOrder(room);
    return;
  }
  if (b.phase === 'playing') {
    if (b.currentPlayerId === playerId) {
      b.pending = null; // limpa a casa pendente de quem saiu (senão bloqueia todos)
      b.lastEvent = { text: `👋 ${nameOf(room, playerId) || 'Um jogador'} saiu — a vez passa.` };
      advanceBoardTurn(room);
    }
    boardEnsureCurrent(room);
  }
}

/** Reconexão: se o turno tinha ficado sem dono, entrega-o a alguém ligado. */
export function boardOnReconnect(room) {
  boardEnsureCurrent(room);
}

function requireHost(room, playerId) {
  const p = room.players.get(playerId);
  if (!p || !p.isHost) throw new AppError('Só o host pode fazer isso.');
}

/** Host: salta a vez do jogador atual (AFK / preso numa casa). */
export function boardHostSkip(room, hostId) {
  const b = requireBoard(room, ['playing']);
  requireHost(room, hostId);
  const who = nameOf(room, b.currentPlayerId);
  b.pending = null;
  b.lastEvent = { text: `⏭️ O host saltou a vez${who ? ' de ' + who : ''}.` };
  advanceBoardTurn(room);
  boardEnsureCurrent(room);
  return b;
}

/** Host: termina o jogo já (vencedor = quem está mais à frente). */
export function boardHostEnd(room, hostId) {
  const b = requireBoard(room);
  requireHost(room, hostId);
  let winner = null;
  for (const id of Object.keys(b.players)) {
    if (!room.players.get(id)) continue;
    if (winner === null || b.players[id].pos > b.players[winner].pos) winner = id;
  }
  b.pending = null;
  b.winnerId = winner;
  b.phase = 'over';
  return b;
}

/** Host: expulsa um jogador que JÁ saiu (desligado) — remove-o da sala e da corrida. */
export function boardHostKick(room, hostId, targetId) {
  const b = requireBoard(room);
  requireHost(room, hostId);
  const target = room.players.get(targetId);
  if (!target) throw new AppError('Jogador não encontrado.');
  if (target.connected) throw new AppError('Só podes expulsar quem já saiu.');
  const wasCurrent = b.currentPlayerId === targetId;
  room.players.delete(targetId);
  delete b.players[targetId];
  b.order = b.order.filter((id) => id !== targetId);
  if (wasCurrent) {
    b.pending = null;
    advanceBoardTurn(room);
  }
  boardEnsureCurrent(room);
  return b;
}

/** Mão privada de um jogador (nunca vai no broadcast — entregue por canal próprio). */
export function boardHand(room, playerId) {
  const b = room.board;
  if (!b || !b.players[playerId]) return null;
  return b.players[playerId].cards;
}

// Serializa o pending escondendo o que não pode vazar:
//  - ?? : só o número de cartas (o conteúdo é surpresa até escolher).
//  - blackjack: a carta tapada do dealer fica escondida enquanto o jogador decide.
function serializePending(pending) {
  if (!pending) return null;
  if (pending.kind === 'evento') {
    return { kind: 'evento', playerId: pending.playerId, count: pending.cards.length };
  }
  if (pending.kind === 'blackjack') {
    const revealDealer = pending.stage !== 'player';
    return {
      kind: 'blackjack',
      playerId: pending.playerId,
      stage: pending.stage,
      player: pending.player,
      pv: handValue(pending.player),
      dealer: revealDealer ? pending.dealer : [pending.dealer[0]],
      dv: revealDealer ? handValue(pending.dealer) : handValue([pending.dealer[0]]),
      dealerHidden: !revealDealer,
    };
  }
  return pending;
}

export function serializeBoard(room) {
  const b = room.board;
  if (!b) return null;
  return {
    phase: b.phase,
    size: b.size,
    intensity: b.intensity,
    squares: b.squares,
    pawns: PAWNS,
    cardMeta: cardMeta(b),
    players: Object.fromEntries(
      Object.entries(b.players).map(([id, p]) => [
        id,
        {
          pawn: p.pawn,
          pos: p.pos,
          golos: p.golos,
          slowStreak: p.slowStreak,
          fastStreak: p.fastStreak,
          skipTurns: p.skipTurns,
          finished: p.finished,
          shield: p.shield,
          cardCount: p.cards.length, // cartas PRIVADAS: só a contagem no broadcast
          prisonCount: p.prisonCount,
          cardsPlayed: p.cardsPlayed,
        },
      ])
    ),
    dice: b.dice,
    order: b.order,
    currentPlayerId: b.currentPlayerId,
    pending: serializePending(b.pending),
    lastMove: b.lastMove,
    lastEvent: b.lastEvent,
    winner: b.winnerId ? { id: b.winnerId, name: nameOf(room, b.winnerId) } : null,
  };
}
