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
import { randomUUID } from 'node:crypto';
import {
  requireBoard,
  nameOf,
  checkWin,
  advanceBoardTurn,
  applyPrison,
  activeIds,
  drinkFromSquare,
  breakAlliance,
  isCurseCard,
  MINI_DRINK,
} from './board/core.js';
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
const N_LEILAO = 3;
const AUCTION_SQUARES = 3; // casas que o vencedor do leilão avança
const MAX_BID = 6;
const RULE_FAIL_GOLOS = 2;
// Maldições presas a uma casa (cartas curse_*): disparam em QUEM lá parar.
const CURSE_EFFECTS = {
  curse_drink: { emoji: '☠️', text: 'bebe 4 golos', apply: (room, id) => drinkFromSquare(room, id, 4) },
  curse_back: {
    emoji: '🕳️',
    text: 'recua 3 casas',
    apply: (room, id) => {
      const p = room.board.players[id];
      p.pos = Math.max(0, p.pos - 3);
    },
  },
  curse_prison: { emoji: '👻', text: 'vai preso', apply: (room, id) => applyPrison(room, id, 'maldição') },
};
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
  for (let i = 0; i < N_LEILAO; i++) bag.push({ kind: 'leilao' });
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
      allianceWith: null, allianceTurnsLeft: 0, // Casa Aliança (bebe metade pelo parceiro)
      mirrorOf: null, // Casa Espelho: o próximo ?? deste jogador também me acerta
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
    activeRules: [], // Roleta de Regras: { id, text, remaining, byId, byName }
    trapCards: [], // maldições escondidas: { id, key, square, ownerId, ownerName }
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

  // Maldição escondida nesta casa? Dispara antes de a casa se resolver — é a
  // surpresa: quem a pôs pode até ser a vítima.
  if (fireTrap(room, playerId)) {
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
  if (sq.kind === 'leilao') {
    openAuction(room, playerId); // licitações secretas; resolve quando todos licitarem
    return { board: b, over: false };
  }
  advanceBoardTurn(room); // partida
  return { board: b, over: false };
}

/** Dispara (e consome) a maldição escondida na casa onde o jogador parou. */
function fireTrap(room, playerId) {
  const b = room.board;
  const me = b.players[playerId];
  const idx = b.trapCards.findIndex((t) => t.square === me.pos);
  if (idx < 0) return false;
  const trap = b.trapCards[idx];
  b.trapCards.splice(idx, 1);
  const fx = CURSE_EFFECTS[trap.key];
  if (!fx) return false;
  fx.apply(room, playerId);
  const nm = nameOf(room, playerId);
  const own = trap.ownerId === playerId ? ' — e a maldição era dele/a próprio/a! 💀' : ` (deixada por ${trap.ownerName})`;
  b.lastEvent = {
    text: `${fx.emoji} MALDIÇÃO na casa ${trap.square}: ${nm} ${fx.text}${own}`,
    trap: { key: trap.key, emoji: fx.emoji, square: trap.square, victim: nm, owner: trap.ownerName },
  };
  return true;
}

// ----- Casa Leilão -----------------------------------------------------------
// Todos licitam golos EM SEGREDO pelo direito de avançar 3 casas. Quem licitar
// mais avança e bebe o que licitou; empate → sorteio entre os empatados. As
// licitações só aparecem no payload depois de resolvidas (serializePending).

function openAuction(room, playerId) {
  const b = room.board;
  b.pending = { kind: 'auction', playerId, squares: AUCTION_SQUARES, maxBid: MAX_BID, bids: {} };
}

/** Licitar (0..MAX_BID). Quando todos os ativos licitarem, resolve sozinho. */
export function boardBid(room, playerId, amount) {
  const b = requireBoard(room, ['playing']);
  if (!b.pending || b.pending.kind !== 'auction') throw new AppError('Não há leilão a decorrer.');
  if (!b.players[playerId] || !room.players.get(playerId)?.connected)
    throw new AppError('Não estás no leilão.');
  if (b.pending.bids[playerId] != null) throw new AppError('Já licitaste.');
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0 || n > MAX_BID) throw new AppError(`Licita entre 0 e ${MAX_BID} golos.`);
  b.pending.bids[playerId] = Math.floor(n);
  const eligible = activeIds(room);
  if (eligible.length && eligible.every((id) => b.pending.bids[id] != null)) resolveAuction(room);
  return b;
}

function resolveAuction(room) {
  const b = room.board;
  const bids = b.pending.bids;
  const entries = Object.entries(bids).filter(([id]) => b.players[id]);
  const top = entries.reduce((m, [, v]) => Math.max(m, v), -1);
  const tied = entries.filter(([, v]) => v === top).map(([id]) => id);
  const winnerId = tied[Math.floor(Math.random() * tied.length)];
  const detail = entries
    .map(([id, v]) => `${nameOf(room, id)} ${v}`)
    .join(' · ');
  b.pending = null;

  if (!winnerId || top <= 0) {
    b.lastEvent = { text: `🔨 Leilão sem licitações a sério (${detail}) — ninguém avança.`, auction: { bids, winnerId: null } };
    advanceBoardTurn(room);
    return b;
  }
  const w = b.players[winnerId];
  drinkFromSquare(room, winnerId, top);
  w.pos = Math.min(b.size, w.pos + AUCTION_SQUARES);
  b.lastEvent = {
    text: `🔨 LEILÃO: ${nameOf(room, winnerId)} arrematou por ${top} golos e avança ${AUCTION_SQUARES} casas!${tied.length > 1 ? ' (sorteio entre empatados)' : ''} — ${detail}`,
    auction: { bids, winnerId, amount: top, tie: tied.length > 1 },
  };
  if (!checkWin(room, winnerId)) advanceBoardTurn(room);
  return b;
}

/** Roleta de Regras: qualquer jogador marca quem falhou — o falhado bebe. */
export function boardRuleFail(room, reporterId, ruleId, targetId) {
  const b = requireBoard(room, ['playing']);
  const rule = b.activeRules.find((r) => r.id === ruleId);
  if (!rule) throw new AppError('Essa regra já não está ativa.');
  if (!room.players.get(reporterId)) throw new AppError('Jogador inválido.');
  const target = b.players[targetId];
  if (!target || !room.players.get(targetId)) throw new AppError('Escolhe um jogador válido.');
  drinkFromSquare(room, targetId, RULE_FAIL_GOLOS);
  b.lastEvent = {
    text: `📜 ${nameOf(room, targetId)} falhou a regra "${rule.text}" — ${RULE_FAIL_GOLOS} golos! (marcado por ${nameOf(room, reporterId)})`,
    ruleFail: { ruleId, targetId, golos: RULE_FAIL_GOLOS },
  };
  return b;
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
      drinkFromSquare(room, playerId, 4);
      b.lastEvent = { text: `🐍 Ganância castigada — ${nm} bebe 4 golos!`, greed: true };
      break;
    case 2:
      drinkFromSquare(room, playerId, 6);
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
      const ally = drinkFromSquare(room, playerId, MINI_DRINK);
      b.lastEvent = {
        text: `🍺 ${nm} bebeu ${MINI_DRINK} golos em vez do desafio${ally ? ` · 🤝 ${ally.allyName} bebe ${ally.golos}` : ''}`,
      };
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

/** Jogar uma carta na tua vez (antes de avançar). `squareIndex` só p/ maldições. */
export function playCard(room, playerId, cardId, targetId, squareIndex) {
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

  // Maldição: não se joga contra ninguém — esconde-se numa casa à FRENTE e fica
  // à espera de quem lá parar (o dono incluído).
  if (isCurseCard(card.key)) {
    const sq = Number(squareIndex);
    if (!Number.isInteger(sq) || sq <= me.pos || sq >= b.size)
      throw new AppError('Escolhe uma casa à tua frente (antes da meta).');
    if (b.trapCards.some((t) => t.square === sq)) throw new AppError('Já há uma maldição nessa casa.');
    me.cards.splice(idx, 1);
    me.cardsPlayed += 1;
    b.trapCards.push({ id: randomUUID(), key: card.key, square: sq, ownerId: playerId, ownerName: nm });
    b.lastEvent = {
      text: `${meta.emoji} ${nm} escondeu uma maldição algures no tabuleiro… 👀`,
      card: { ...cardInfo, target: null },
    };
    return b;
  }

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
      target.golos += 3; // carta é escolha de quem joga, não azar de casa → sem aliança
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
    } else if (b.pending?.kind === 'auction') {
      // Sem quem faltava licitar, o leilão fechava-se sozinho — força a apuração.
      const eligible = activeIds(room);
      if (eligible.length && eligible.every((id) => b.pending.bids[id] != null)) resolveAuction(room);
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
  breakAlliance(b, targetId); // não deixar o parceiro ligado a um fantasma
  for (const pl of Object.values(b.players)) if (pl.mirrorOf === targetId) pl.mirrorOf = null;
  b.trapCards = b.trapCards.filter((t) => t.ownerId !== targetId);
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

/** Maldições que ESTE jogador escondeu — privadas (para os outros são surpresa). */
export function boardTraps(room, playerId) {
  const b = room.board;
  if (!b) return [];
  return b.trapCards.filter((t) => t.ownerId === playerId).map((t) => ({ id: t.id, key: t.key, square: t.square }));
}

// Serializa o pending escondendo o que não pode vazar:
//  - ?? : só o número de cartas (o conteúdo é surpresa até escolher).
//  - blackjack: a carta tapada do dealer fica escondida enquanto o jogador decide.
function serializePending(pending) {
  if (!pending) return null;
  if (pending.kind === 'evento') {
    return { kind: 'evento', playerId: pending.playerId, count: pending.cards.length };
  }
  // Leilão: as licitações são SECRETAS até todos licitarem — só vai quem já licitou.
  if (pending.kind === 'auction') {
    return {
      kind: 'auction',
      playerId: pending.playerId,
      squares: pending.squares,
      maxBid: pending.maxBid,
      bidders: Object.keys(pending.bids),
    };
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
          allianceWith: p.allianceWith || null,
          allianceTurnsLeft: p.allianceTurnsLeft || 0,
          mirrorOf: p.mirrorOf || null,
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
    activeRules: (b.activeRules || []).map((r) => ({ id: r.id, text: r.text, remaining: r.remaining, byName: r.byName })),
    // As maldições são SURPRESA: no broadcast vai só quantas estão no tabuleiro
    // (cada dono recebe as suas por canal privado, com board_hand).
    trapCount: (b.trapCards || []).length,
    lastMove: b.lastMove,
    lastEvent: b.lastEvent,
    winner: b.winnerId ? { id: b.winnerId, name: nameOf(room, b.winnerId) } : null,
  };
}
