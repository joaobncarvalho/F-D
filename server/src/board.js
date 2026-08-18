// F&D — Modo Tabuleiro ("Monopólio de bebida"). SEM vidas. Ganha quem dá a volta.
//
// FASE 1 (esta): escolher peão → lançar dado (ordem) → jogar: avançar 1/2/3 casas
// (= 2/4/6 golos, máx 3), completar a volta = vitória. Prisão por ABUSO (andar só
// 1 casa 3× seguidas → perde a próxima vez). As casas especiais (mini-jogo/??/
// Gamble) são geradas e mostradas já, mas os seus EFEITOS entram nas Fases 2/3.
import * as repo from './repo.js';
import { pickWeightedType } from './game.js';
import { AppError } from './errors.js';

const BOARD_SIZE = 45;
const GOLOS_PER_SQUARE = 2; // 2 golos = 1 casa
const SLOW_LIMIT = 3; // 3× andar 1 casa → prisão
const N_EVENTO = 5; // casas "??" (mais raras)
const N_GAMBLE = 3; // casas "Gamble"
const PAWNS = ['🦊', '🐸', '🐵', '🦄', '🐙', '🐝', '🦁', '🐨', '🐼', '🐷', '🐧', '🐢', '🐔', '🦖'];

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const nameOf = (room, id) => room.players.get(id)?.name;
function activeOrder(room) {
  return [...room.players.values()]
    .filter((p) => p.connected)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
}

/** Gera as 45 casas: 1 Partida + 5 ?? + 3 Gamble + 36 mini-jogo (peso da roda). */
async function generateSquares() {
  const types = await repo.getGameTypes();
  const bag = [];
  for (let i = 0; i < N_EVENTO; i++) bag.push({ kind: 'evento' });
  for (let i = 0; i < N_GAMBLE; i++) bag.push({ kind: 'gamble' });
  const miniCount = BOARD_SIZE - 1 - bag.length;
  for (let i = 0; i < miniCount; i++) {
    const gt = pickWeightedType(types) || { key: 'desafio', label: 'Desafio' };
    bag.push({ kind: 'mini', gameKey: gt.key, gameLabel: gt.label });
  }
  shuffle(bag);
  return [{ kind: 'partida' }, ...bag].map((s, i) => ({ i, ...s }));
}

export async function initBoard(room, { intensity = 'leve' } = {}) {
  const squares = await generateSquares();
  const players = {};
  for (const p of room.players.values()) {
    players[p.id] = { pawn: null, pos: 0, golos: 0, slowStreak: 0, skipTurns: 0, finished: false };
  }
  room.mode = 'board';
  room.board = {
    phase: 'pawn', // pawn | order | playing | over
    intensity: intensity === 'picante' || intensity === 'hardcore' || intensity === 'caos' ? intensity : 'leve',
    size: BOARD_SIZE,
    squares,
    players,
    dice: {}, // pid -> 1..6 (ordem inicial)
    order: [],
    currentPlayerId: null,
    lastMove: null,
    winnerId: null,
  };
  return room.board;
}

function requireBoard(room, phases) {
  const b = room.board;
  if (!b) throw new AppError('Não há tabuleiro ativo.');
  if (phases && !phases.includes(b.phase)) throw new AppError('Não é altura disso.');
  return b;
}

/** Escolher peão (único). Todos escolheram → passa a lançar dados. */
export function pickPawn(room, playerId, pawn) {
  const b = requireBoard(room, ['pawn']);
  if (!PAWNS.includes(pawn)) throw new AppError('Peão inválido.');
  if (!b.players[playerId]) throw new AppError('Jogador inválido.');
  const taken = Object.entries(b.players).some(([id, pl]) => id !== playerId && pl.pawn === pawn);
  if (taken) throw new AppError('Esse peão já está escolhido.');
  b.players[playerId].pawn = pawn;
  if (activeOrder(room).every((p) => b.players[p.id]?.pawn)) b.phase = 'order';
  return b;
}

/** Lançar o dado da ordem. Todos lançaram → define a ordem (maior primeiro). */
export function rollOrder(room, playerId) {
  const b = requireBoard(room, ['order']);
  if (!b.players[playerId]) throw new AppError('Jogador inválido.');
  if (b.dice[playerId] != null) throw new AppError('Já lançaste o dado.');
  b.dice[playerId] = 1 + Math.floor(Math.random() * 6);
  const active = activeOrder(room);
  if (active.every((p) => b.dice[p.id] != null)) {
    b.order = active
      .slice()
      .sort((a, c) => b.dice[c.id] - b.dice[a.id] || a.joinedAt.localeCompare(c.joinedAt))
      .map((p) => p.id);
    b.currentPlayerId = b.order[0];
    b.phase = 'playing';
  }
  return b;
}

/** Avançar 1/2/3 casas (bebe 2/4/6 golos). Volta completa = vitória; abuso = prisão. */
export function advance(room, playerId, squares) {
  const b = requireBoard(room, ['playing']);
  if (b.currentPlayerId !== playerId) throw new AppError('Não é a tua vez.');
  const n = Number(squares);
  if (![1, 2, 3].includes(n)) throw new AppError('Escolhe 1, 2 ou 3 casas.');
  const me = b.players[playerId];

  me.golos += n * GOLOS_PER_SQUARE;
  me.pos += n;

  let toPrison = false;
  if (n === 1) {
    me.slowStreak += 1;
    if (me.slowStreak >= SLOW_LIMIT) {
      toPrison = true;
      me.slowStreak = 0;
      me.skipTurns += 1; // perde a próxima vez
    }
  } else {
    me.slowStreak = 0;
  }

  b.lastMove = {
    playerId,
    name: nameOf(room, playerId),
    squares: n,
    golos: n * GOLOS_PER_SQUARE,
    toPrison,
    landedKind: null,
  };

  if (me.pos >= b.size) {
    me.pos = b.size;
    me.finished = true;
    b.winnerId = playerId;
    b.phase = 'over';
    return { board: b, over: true };
  }

  b.lastMove.landedKind = b.squares[me.pos]?.kind || null;
  advanceBoardTurn(room);
  return { board: b, over: false };
}

function advanceBoardTurn(room) {
  const b = room.board;
  const order = b.order.filter((id) => room.players.get(id)?.connected && !b.players[id].finished);
  if (!order.length) {
    b.currentPlayerId = null;
    return;
  }
  let idx = order.indexOf(b.currentPlayerId);
  for (let step = 0; step < order.length; step++) {
    idx = (idx + 1) % order.length;
    const id = order[idx];
    if (b.players[id].skipTurns > 0) {
      b.players[id].skipTurns -= 1; // preso → perde esta vez
      continue;
    }
    b.currentPlayerId = id;
    return;
  }
  b.currentPlayerId = order[(Math.max(0, order.indexOf(b.currentPlayerId)) + 1) % order.length];
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
    players: Object.fromEntries(
      Object.entries(b.players).map(([id, p]) => [
        id,
        { pawn: p.pawn, pos: p.pos, golos: p.golos, slowStreak: p.slowStreak, skipTurns: p.skipTurns, finished: p.finished },
      ])
    ),
    dice: b.dice,
    order: b.order,
    currentPlayerId: b.currentPlayerId,
    lastMove: b.lastMove,
    winner: b.winnerId ? { id: b.winnerId, name: nameOf(room, b.winnerId) } : null,
  };
}
