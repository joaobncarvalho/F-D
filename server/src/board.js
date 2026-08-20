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
import { randomUUID } from 'node:crypto';
import * as repo from './repo.js';
import { AppError } from './errors.js';

const BOARD_SIZE = 60;
const GOLOS_PER_SQUARE = 2;
const SLOW_LIMIT = 3; // andar 1 casa Nx seguidas → prisão (abuso de bebida)
const FAST_LIMIT = 2; // andar 3 casas Nx seguidas → azar da ganância
const N_EVENTO = 6;
const N_GAMBLE = 4;
const N_BLACKJACK = 3;
const N_BEERPONG = 3;
const MINI_DRINK = 3; // golos se "beber" em vez de fazer o desafio
const PAWNS = ['🦊', '🐸', '🐵', '🦄', '🐙', '🐝', '🦁', '🐨', '🐼', '🐷', '🐧', '🐢', '🐔', '🦖'];
// Casas de mini-jogo: só os jogos RÁPIDOS single-player (os de grupo ficam na Roda).
const BOARD_MINI_TYPES = ['boca_calada', 'desafio', 'isto_ou_aquilo'];

// Mecânica das cartas jogáveis (o CATÁLOGO — emoji/nome/desc — vem dos bancos/BD).
// Só estas keys podem ser distribuídas; uma carta na admin com key desconhecida
// nunca entra no baralho (defensivo).
const KNOWN_CARD_KEYS = ['swap', 'back2', 'prison', 'skip', 'shield', 'drink3', 'steal'];

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

// ----- Bancos (?? / prisão / cartas) -----------------------------------------
// `b.banks` é o snapshot lido no initBoard. Estas helpers leem sempre dele.

/** Mapa key→{emoji,name,desc} para o cliente desenhar as cartas. */
function cardMeta(b) {
  const meta = {};
  for (const c of b.banks.cards) meta[c.key] = { emoji: c.emoji, name: c.name, desc: c.desc };
  return meta;
}
/** Escolha ponderada (pesos ≥1) de 1 item. */
function weightedPick(items) {
  const total = items.reduce((s, it) => s + Math.max(1, it.weight || 1), 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= Math.max(1, it.weight || 1);
    if (r < 0) return it;
  }
  return items[items.length - 1];
}
/** Amostra ponderada SEM reposição de n itens distintos. */
function weightedSample(items, n) {
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
function giveRandomCard(b, player) {
  const pool = b.banks.cards.filter((c) => KNOWN_CARD_KEYS.includes(c.key));
  if (!pool.length) return null;
  const c = weightedPick(pool);
  player.cards.push({ id: randomUUID(), key: c.key });
  return c;
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

// ---------- Casa Blackjack: bate a "casa" (dealer) → recompensa positiva ----------
const BJ_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const BJ_SUITS = ['♠', '♥', '♦', '♣'];
function drawCard() {
  return { rank: BJ_RANKS[Math.floor(Math.random() * BJ_RANKS.length)], suit: BJ_SUITS[Math.floor(Math.random() * BJ_SUITS.length)] };
}
function handValue(cards) {
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

function openBlackjack(room, playerId) {
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

// ---------- Casa Beer Pinga (beer pong) — acerta sempre; a força escolhe a fila ----------
// Mais força = fila mais atrás = maior risco/prémio. NENHUM copo é neutro: bebe-se
// sempre a "base" (cresce com a distância) e o copo pode agravar/recompensar.
const BEERPONG_BASE = [2, 3, 4]; // golos base por fila: frente · meio · trás
const BEERPONG_OUTCOMES = [
  // Fila da frente (fácil de acertar) — consequências suaves
  [
    { emoji: '😮‍💨', title: 'Escapou barato', desc: 'só a base', type: 'none', good: true },
    { emoji: '🚀', title: 'Impulso', desc: 'avança 1 casa', type: 'advance', value: 1, good: true },
    { emoji: '🍻', title: 'Ronda leve', desc: 'os outros bebem 2', type: 'others', value: 2, good: true },
    { emoji: '🍺', title: 'Golo a mais', desc: '+2 golos', type: 'drink', value: 2, good: false },
  ],
  // Fila do meio — médio
  [
    { emoji: '🚀', title: 'Salto', desc: 'avança 2 casas', type: 'advance', value: 2, good: true },
    { emoji: '🎴', title: 'Carta!', desc: 'ganhas uma carta', type: 'card', good: true },
    { emoji: '🍺', title: 'Duplo shot', desc: '+3 golos', type: 'drink', value: 3, good: false },
    { emoji: '⬅️', title: 'Mão trémula', desc: 'recua 2 casas', type: 'back', value: 2, good: false },
    { emoji: '🍻', title: 'Ronda', desc: 'os outros bebem 3', type: 'others', value: 3, good: true },
  ],
  // Fila de trás (difícil) — extremo
  [
    { emoji: '🏆', title: 'JACKPOT', desc: 'avança 3 + carta', type: 'jackpot', good: true },
    { emoji: '🥴', title: 'Afogado', desc: '+6 golos', type: 'drink', value: 6, good: false },
    { emoji: '🚔', title: 'Copo maldito', desc: 'vais preso', type: 'prison', good: false },
    { emoji: '🍻', title: 'Ronda dupla', desc: 'os outros bebem 4', type: 'others', value: 4, good: true },
    { emoji: '⬅️', title: 'Ressaca', desc: 'recua 3 casas', type: 'back', value: 3, good: false },
  ],
];
function beerpongRow(power) {
  const p = Math.max(0, Math.min(1, Number(power) || 0));
  if (p < 0.45) return 0; // frente (pouca força)
  if (p < 0.8) return 1; // meio
  return 2; // trás (muita força, timing preciso)
}

/** Casa Beer Pinga: a força (0..1) escolhe a fila; acerta sempre num copo dessa fila. */
export function boardBeerpong(room, playerId, power) {
  const b = requireBoard(room, ['playing']);
  if (!b.pending || b.pending.kind !== 'beerpong') throw new AppError('Nada de Beer Pinga.');
  if (b.currentPlayerId !== playerId) throw new AppError('Não é a tua vez.');
  const row = beerpongRow(power);
  const pool = BEERPONG_OUTCOMES[row];
  const cupIdx = Math.floor(Math.random() * pool.length);
  const cup = pool[cupIdx];
  const base = BEERPONG_BASE[row];
  const me = b.players[playerId];
  const nm = nameOf(room, playerId);
  me.golos += base; // toda a gente bebe a base — nunca neutro

  switch (cup.type) {
    case 'advance':
      me.pos = Math.min(b.size, me.pos + cup.value);
      checkWin(room, playerId);
      break;
    case 'back':
      me.pos = Math.max(0, me.pos - cup.value);
      break;
    case 'drink':
      me.golos += cup.value;
      break;
    case 'others':
      for (const oid of Object.keys(b.players)) if (oid !== playerId) b.players[oid].golos += cup.value;
      break;
    case 'card':
      giveRandomCard(b, me);
      break;
    case 'jackpot':
      me.pos = Math.min(b.size, me.pos + 3);
      giveRandomCard(b, me);
      checkWin(room, playerId);
      break;
    case 'prison':
      applyPrison(room, playerId, 'copo maldito');
      break;
    default:
      break;
  }

  const rowName = ['frente', 'meio', 'trás'][row];
  b.lastEvent = {
    text: `🍺 ${nm} acertou no copo (${rowName}) — bebe ${base} · ${cup.desc}!`,
    beerpong: { row, cupIdx, cupCount: pool.length, base, emoji: cup.emoji, title: cup.title, desc: cup.desc, good: !!cup.good },
  };
  b.pending = null;
  if (b.phase !== 'over') advanceBoardTurn(room);
  return b;
}

// Casa ?? ("mistério"): 3 cartas viradas ao contrário. Cada uma esconde um efeito
// tipado do banco `evento` (b.banks.events). O conteúdo fica escondido no payload
// (serializePending) até o jogador escolher — surpresa real. Se o efeito for
// "card", resolve-se já uma carta concreta (para a revelação mostrar qual é).
function openEvento(room, playerId) {
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

function applyPrison(room, playerId, reason = 'prisão') {
  const b = room.board;
  const me = b.players[playerId];
  const nm = nameOf(room, playerId);
  me.slowStreak = 0;
  me.prisonCount += 1;
  const p = weightedPick(b.banks.prison);
  if (p.skipTurns) me.skipTurns += p.skipTurns;
  if (p.drink) me.golos += p.drink;
  if (p.back) me.pos = Math.max(0, me.pos - p.back);
  if (p.loseCard && me.cards.length) me.cards.shift();
  b.lastEvent = { text: `🚔 ${nm} foi PRESO (${reason}): ${p.note}` };
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

function activeIds(room) {
  const b = room.board;
  return b.order.filter((id) => room.players.get(id)?.connected && b.players[id] && !b.players[id].finished);
}

function advanceBoardTurn(room) {
  const b = room.board;
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
