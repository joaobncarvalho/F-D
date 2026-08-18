// F&D — Modo Tabuleiro ("Monopólio de bebida"). SEM vidas. Ganha quem dá a volta.
//
// Fluxo: escolher peão → lançar dado (ordem) → jogar. Na tua vez podes jogar
// CARTAS contra outros e depois AVANÇAR 1/2/3 casas (2/4/6 golos, máx 3). A casa
// onde cais resolve-se: mini-jogo (desafio rápido) · ?? (sorte) · Gamble (aposta).
// Prisão (perde vez + consequência aleatória) por ABUSO (andar 1 casa 3× seguidas),
// por ?? ou por carta "Denúncia". Vitória: dar a volta (pos ≥ 45).
import { randomUUID } from 'node:crypto';
import * as repo from './repo.js';
import { AppError } from './errors.js';

const BOARD_SIZE = 45;
const GOLOS_PER_SQUARE = 2;
const SLOW_LIMIT = 3;
const N_EVENTO = 5;
const N_GAMBLE = 3;
const MINI_DRINK = 3; // golos se "beber" em vez de fazer o desafio
const PAWNS = ['🦊', '🐸', '🐵', '🦄', '🐙', '🐝', '🦁', '🐨', '🐼', '🐷', '🐧', '🐢', '🐔', '🦖'];
// Casas de mini-jogo: só os jogos RÁPIDOS single-player (os de grupo ficam na Roda).
const BOARD_MINI_TYPES = ['boca_calada', 'desafio', 'isto_ou_aquilo'];

export const CARD_META = {
  swap: { emoji: '🔁', name: 'Troca', desc: 'Trocas de casa com um jogador' },
  back2: { emoji: '⬅️', name: 'Empurrão', desc: 'Mandas alguém recuar 2 casas' },
  prison: { emoji: '⛓️', name: 'Denúncia', desc: 'Mandas alguém para a prisão' },
  skip: { emoji: '⏭️', name: 'Salta-vez', desc: 'Um jogador perde a próxima vez' },
  shield: { emoji: '🛡️', name: 'Escudo', desc: 'Bloqueia a próxima carta contra ti' },
  drink3: { emoji: '🍺', name: 'Ronda', desc: 'Obrigas alguém a beber 3 golos' },
  steal: { emoji: '🎁', name: 'Roubo', desc: 'Roubas uma carta a alguém' },
};
const CARD_KEYS = Object.keys(CARD_META);

const nameOf = (room, id) => room.players.get(id)?.name;
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

async function generateSquares() {
  const types = await repo.getGameTypes();
  const miniPool = BOARD_MINI_TYPES.map((k) => types.find((t) => t.key === k) || { key: k, label: k }).filter(Boolean);
  const bag = [];
  for (let i = 0; i < N_EVENTO; i++) bag.push({ kind: 'evento' });
  for (let i = 0; i < N_GAMBLE; i++) bag.push({ kind: 'gamble' });
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
  const players = {};
  for (const p of room.players.values()) {
    players[p.id] = { pawn: null, pos: 0, golos: 0, slowStreak: 0, skipTurns: 0, finished: false, cards: [], shield: false };
  }
  room.mode = 'board';
  room.board = {
    phase: 'pawn', // pawn | order | playing | over
    intensity: ['picante', 'hardcore', 'caos'].includes(intensity) ? intensity : 'leve',
    size: BOARD_SIZE,
    squares,
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

function requireBoard(room, phases) {
  const b = room.board;
  if (!b) throw new AppError('Não há tabuleiro ativo.');
  if (phases && !phases.includes(b.phase)) throw new AppError('Não é altura disso.');
  return b;
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

function checkWin(room, playerId) {
  const b = room.board;
  const me = b.players[playerId];
  if (me.pos >= b.size) {
    me.pos = b.size;
    me.finished = true;
    b.winnerId = playerId;
    b.phase = 'over';
    return true;
  }
  return false;
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
  let toPrison = false;
  if (n === 1) {
    me.slowStreak += 1;
    if (me.slowStreak >= SLOW_LIMIT) toPrison = true;
  } else me.slowStreak = 0;

  b.lastMove = { playerId, name: nameOf(room, playerId), squares: n, golos: n * GOLOS_PER_SQUARE, toPrison, landedKind: null };
  b.lastEvent = null;

  if (checkWin(room, playerId)) return { board: b, over: true };

  if (toPrison) {
    applyPrison(room, playerId, 'abuso de bebida');
    advanceBoardTurn(room);
    return { board: b, over: false };
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
  if (sq.kind === 'evento') {
    applyEvento(room, playerId);
    if (b.phase !== 'over') advanceBoardTurn(room);
    return { board: b, over: b.phase === 'over' };
  }
  advanceBoardTurn(room); // partida
  return { board: b, over: false };
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
      b.lastEvent = { text: `🎲 ${nm} apostou e GANHOU — avança 2 (bebe 4)! 🎉` };
    } else {
      me.pos = Math.max(0, me.pos - 2);
      b.lastEvent = { text: `🎲 ${nm} apostou e PERDEU — recua 2! 😬` };
    }
  } else {
    b.lastEvent = { text: `🎲 ${nm} não apostou — fica na mesma.` };
  }
  b.pending = null;
  if (!checkWin(room, playerId)) advanceBoardTurn(room);
  return b;
}

function giveCard(room, playerId) {
  const key = CARD_KEYS[Math.floor(Math.random() * CARD_KEYS.length)];
  room.board.players[playerId].cards.push({ id: randomUUID(), key });
}

function applyEvento(room, playerId) {
  const b = room.board;
  const me = b.players[playerId];
  const nm = nameOf(room, playerId);
  switch (Math.floor(Math.random() * 6)) {
    case 0:
      me.pos = Math.min(b.size, me.pos + 2);
      b.lastEvent = { text: `❓ ${nm} teve sorte — avança 2 casas!` };
      checkWin(room, playerId);
      break;
    case 1:
      me.pos = Math.max(0, me.pos - 2);
      b.lastEvent = { text: `❓ ${nm} azar — recua 2 casas!` };
      break;
    case 2:
      me.golos += 3;
      b.lastEvent = { text: `❓ ${nm} bebe 3 golos!` };
      break;
    case 3:
      giveCard(room, playerId);
      b.lastEvent = { text: `❓ ${nm} ganhou uma carta! 🎴` };
      break;
    case 4:
      applyPrison(room, playerId, 'sorte tramada');
      break;
    case 5:
      for (const id of Object.keys(b.players)) if (id !== playerId) b.players[id].golos += 2;
      b.lastEvent = { text: `❓ Todos menos ${nm} bebem 2 golos!` };
      break;
  }
}

function applyPrison(room, playerId, reason = 'prisão') {
  const b = room.board;
  const me = b.players[playerId];
  const nm = nameOf(room, playerId);
  me.slowStreak = 0;
  let note;
  switch (Math.floor(Math.random() * 5)) {
    case 0:
      me.skipTurns += 1;
      note = 'perde 1 vez';
      break;
    case 1:
      me.skipTurns += 2;
      note = 'perde 2 vezes';
      break;
    case 2:
      me.golos += 4;
      me.skipTurns += 1;
      note = 'bebe 4 golos + perde 1 vez';
      break;
    case 3:
      me.pos = Math.max(0, me.pos - 3);
      me.skipTurns += 1;
      note = 'recua 3 + perde 1 vez';
      break;
    case 4:
      if (me.cards.length) me.cards.shift();
      me.skipTurns += 1;
      note = 'perde 1 carta + 1 vez';
      break;
  }
  b.lastEvent = { text: `🚔 ${nm} foi PRESO (${reason}): ${note}` };
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
  const meta = CARD_META[card.key];
  const nm = nameOf(room, playerId);

  if (card.key === 'shield') {
    me.shield = true;
    me.cards.splice(idx, 1);
    b.lastEvent = { text: `🛡️ ${nm} ativou um Escudo` };
    return b;
  }

  const target = b.players[targetId];
  if (!target || targetId === playerId || !room.players.get(targetId)?.connected)
    throw new AppError('Escolhe um alvo válido.');
  me.cards.splice(idx, 1); // consome
  const tnm = nameOf(room, targetId);

  if (target.shield) {
    target.shield = false;
    b.lastEvent = { text: `🛡️ ${tnm} bloqueou a ${meta.name} de ${nm}!` };
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
  return b;
}

function advanceBoardTurn(room) {
  const b = room.board;
  const order = b.order.filter((id) => room.players.get(id)?.connected && !b.players[id].finished);
  if (!order.length) {
    b.currentPlayerId = null;
    return;
  }
  let idx = Math.max(0, order.indexOf(b.currentPlayerId));
  for (let step = 0; step < order.length; step++) {
    idx = (idx + 1) % order.length;
    const id = order[idx];
    if (b.players[id].skipTurns > 0) {
      b.players[id].skipTurns -= 1;
      continue;
    }
    b.currentPlayerId = id;
    return;
  }
  b.currentPlayerId = order[(order.indexOf(b.currentPlayerId) + 1) % order.length];
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
    cardMeta: CARD_META,
    players: Object.fromEntries(
      Object.entries(b.players).map(([id, p]) => [
        id,
        {
          pawn: p.pawn,
          pos: p.pos,
          golos: p.golos,
          slowStreak: p.slowStreak,
          skipTurns: p.skipTurns,
          finished: p.finished,
          shield: p.shield,
          cards: p.cards, // públicas (MVP)
        },
      ])
    ),
    dice: b.dice,
    order: b.order,
    currentPlayerId: b.currentPlayerId,
    pending: b.pending,
    lastMove: b.lastMove,
    lastEvent: b.lastEvent,
    winner: b.winnerId ? { id: b.winnerId, name: nameOf(room, b.winnerId) } : null,
  };
}
