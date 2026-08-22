// ----- Piramide (Desconfia) -------------------------------------------------
//
// Cartas DIGITAIS: o servidor dá 3 cartas a cada jogador (mão PRIVADA, nunca no
// broadcast) que ele memoriza. Monta-se uma pirâmide de 15 cartas (base → topo:
// 5/4/3/2/1) com golos crescentes por nível (2/4/6/8/10). À vez, quem está a
// jogar VIRA a carta seguinte e ou ATRIBUI a alguém (afirmando ter no baralho
// uma carta do mesmo número) ou PASSA. O alvo ACEITA (bebe os golos do nível) ou
// DESCONFIA — e aí revela-se só o veredicto do número reclamado (não a mão toda):
//   • o jogador TINHA a carta  → o alvo enganou-se e bebe o DOBRO;
//   • o jogador NÃO tinha (bluff) → o jogador é apanhado e bebe o DOBRO.
// Match por NÚMERO (rank), independente do naipe. No fim, quem fez beber mais
// leva +1 vida para o jogo principal.
//
// Extraído do game.js (comportamento idêntico). Depende só de ./helpers.js.

import { randomUUID } from 'node:crypto';
import { AppError } from '../errors.js';
import { connectedOrder, nameOf, drink, shuffle } from './helpers.js';

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];
// Base → topo: nº de cartas por nível e golos correspondentes.
const PYRAMID_LEVELS = [
  { count: 5, golos: 2 },
  { count: 4, golos: 4 },
  { count: 3, golos: 6 },
  { count: 2, golos: 8 },
  { count: 1, golos: 10 },
];
const PYRAMID_SIZE = PYRAMID_LEVELS.reduce((n, l) => n + l.count, 0); // 15

/** Baralho com cópias suficientes para `need` cartas (52 por baralho). Match por número. */
function buildDeck(need) {
  const deck = [];
  const copies = Math.max(1, Math.ceil(need / (RANKS.length * SUITS.length)));
  for (let c = 0; c < copies; c++) {
    for (const rank of RANKS) for (const suit of SUITS) deck.push({ rank, suit });
  }
  return shuffle(deck);
}

/** Prepara a ronda Piramide: dá 3 cartas a cada jogador ligado + monta a pirâmide. */
export function dealPiramide(room, round) {
  const order = connectedOrder(room).map((p) => p.id);
  const deck = buildDeck(order.length * 3 + PYRAMID_SIZE);

  const hands = {};
  for (const id of order) hands[id] = deck.splice(0, 3);

  const pyramid = [];
  PYRAMID_LEVELS.forEach((lvl, li) => {
    for (let i = 0; i < lvl.count; i++) {
      const card = deck.pop();
      pyramid.push({ id: randomUUID(), rank: card.rank, suit: card.suit, level: li + 1, golos: lvl.golos, flipped: false });
    }
  });

  round.hands = hands; // PRIVADO — nunca serializado
  round.pyramid = pyramid;
  round.order = order;
  round.turnIdx = 0;
  round.flipIdx = 0;
  round.flippedCard = null;
  round.assign = null;
  round.reveal = null;
  round.ready = {};
  round.made = {}; // fez beber (métrica do prémio)
  round.golosGiven = {}; // golos que fez os outros beber (desempate)
  round.golosDrunk = {}; // golos que bebeu (estatística)
  round.caught = {}; // desconfianças bem-sucedidas
  round.summary = null;
  round.substate = 'memorize';
}

/** Escolhe o próximo flipper ligado a partir de turnIdx (salta desligados). */
function setFlipper(room) {
  const r = room.game.round;
  const order = r.order;
  for (let tries = 0; tries < order.length; tries++) {
    const id = order[r.turnIdx % order.length];
    const p = room.players.get(id);
    if (p && p.connected) {
      r.currentPlayerId = id;
      r.currentPlayerName = p.name;
      return;
    }
    r.turnIdx++;
  }
  r.currentPlayerId = null;
  r.currentPlayerName = null;
}

function beginFlipping(room) {
  const r = room.game.round;
  r.turnIdx = 0;
  r.substate = 'flipping';
  setFlipper(room);
}

/** Avança para a carta seguinte (após atribuição resolvida ou passe). */
function advanceFlip(room) {
  const r = room.game.round;
  r.flipIdx += 1;
  r.flippedCard = null;
  r.assign = null;
  r.reveal = null;
  if (r.flipIdx >= r.pyramid.length) {
    buildPiramideSummary(room);
    return;
  }
  r.turnIdx += 1;
  r.substate = 'flipping';
  setFlipper(room);
}

function buildPiramideSummary(room) {
  const r = room.game.round;
  const rows = r.order.map((id) => ({
    id,
    name: nameOf(room, id),
    made: r.made[id] || 0,
    golosGiven: r.golosGiven[id] || 0,
    golosDrunk: r.golosDrunk[id] || 0,
    caught: r.caught[id] || 0,
  }));
  const maxMade = rows.reduce((m, x) => Math.max(m, x.made), 0);
  const winners = maxMade > 0 ? rows.filter((x) => x.made === maxMade).map((x) => ({ id: x.id, name: x.name })) : [];
  r.summary = { rows, winners, maxMade };
  r.substate = 'summary';
}

// ----- Piramide: ações da ronda ---------------------------------------------

function requirePiramide(room, substates) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'piramide' || !r || r.gameTypeKey !== 'piramide')
    throw new AppError('Não há Piramide ativa.');
  if (substates && !substates.includes(r.substate)) throw new AppError('Não é altura disso.');
  return r;
}

/** Memorização: cada jogador marca-se pronto. Todos os ligados prontos → começa a virar. */
export function piramideReady(room, playerId) {
  const r = requirePiramide(room, ['memorize']);
  const p = room.players.get(playerId);
  if (!p) throw new AppError('Jogador inválido.');
  r.ready[playerId] = true;
  const allReady = connectedOrder(room).every((pl) => r.ready[pl.id]);
  if (allReady) beginFlipping(room);
  return r;
}

/** O jogador da vez vira a carta seguinte da pirâmide. */
export function piramideFlip(room, playerId) {
  const r = requirePiramide(room, ['flipping']);
  if (r.currentPlayerId !== playerId) throw new AppError('Só quem está à vez pode virar.');
  if (r.flippedCard) throw new AppError('Já viraste — atribui ou passa.');
  const card = r.pyramid[r.flipIdx];
  card.flipped = true;
  r.flippedCard = { id: card.id, rank: card.rank, suit: card.suit, level: card.level, golos: card.golos };
  return r;
}

/** O jogador da vez atribui a bebida a outro (afirma ter o número no baralho). */
export function piramideAssign(room, playerId, targetId) {
  const r = requirePiramide(room, ['flipping']);
  if (r.currentPlayerId !== playerId) throw new AppError('Não é a tua vez.');
  if (!r.flippedCard) throw new AppError('Vira uma carta primeiro.');
  const target = room.players.get(targetId);
  if (!target || !target.connected) throw new AppError('Escolhe um jogador válido.');
  if (targetId === playerId) throw new AppError('Escolhe outra pessoa.');
  r.assign = {
    flipperId: playerId,
    flipperName: nameOf(room, playerId),
    targetId,
    targetName: target.name,
    rank: r.flippedCard.rank,
  };
  r.substate = 'challenge';
  return r;
}

/** O jogador da vez passa (não faz ninguém beber nesta carta). */
export function piramidePass(room, playerId) {
  const r = requirePiramide(room, ['flipping']);
  if (r.currentPlayerId !== playerId) throw new AppError('Não é a tua vez.');
  if (!r.flippedCard) throw new AppError('Vira uma carta primeiro.');
  advanceFlip(room);
  return r;
}

/** O alvo decide: 'aceitar' (bebe os golos) ou 'desconfiar' (revela o veredicto). */
export function piramideRespond(room, playerId, decision) {
  const r = requirePiramide(room, ['challenge']);
  if (!r.assign || r.assign.targetId !== playerId) throw new AppError('Não és o alvo.');
  const g = room.game;
  const golos = r.flippedCard.golos;
  const flipperId = r.assign.flipperId;
  const hand = r.hands[flipperId] || [];
  const matched = hand.find((c) => c.rank === r.flippedCard.rank) || null;
  const hadIt = !!matched;

  if (decision === 'aceitar') {
    r.made[flipperId] = (r.made[flipperId] || 0) + 1;
    r.golosGiven[flipperId] = (r.golosGiven[flipperId] || 0) + golos;
    r.golosDrunk[playerId] = (r.golosDrunk[playerId] || 0) + golos;
    drink(g, playerId, 1);
    // Aceitou → nunca se revela se era bluff (o mistério fica).
    r.reveal = {
      decision: 'aceitar',
      hadIt: null,
      matchedCard: null,
      golos,
      drinkerId: playerId,
      drinkerName: nameOf(room, playerId),
      caughtBluff: false,
    };
  } else if (decision === 'desconfiar') {
    const total = golos * 2;
    if (hadIt) {
      // Tinha mesmo → quem desconfiou enganou-se e bebe o dobro.
      r.made[flipperId] = (r.made[flipperId] || 0) + 1;
      r.golosGiven[flipperId] = (r.golosGiven[flipperId] || 0) + total;
      r.golosDrunk[playerId] = (r.golosDrunk[playerId] || 0) + total;
      drink(g, playerId, 1);
      r.reveal = {
        decision: 'desconfiar',
        hadIt: true,
        matchedCard: matched,
        golos: total,
        drinkerId: playerId,
        drinkerName: nameOf(room, playerId),
        caughtBluff: false,
      };
    } else {
      // Bluff apanhado → o jogador da vez bebe o dobro; desconfiança bem-sucedida.
      r.golosDrunk[flipperId] = (r.golosDrunk[flipperId] || 0) + total;
      drink(g, flipperId, 1);
      r.caught[playerId] = (r.caught[playerId] || 0) + 1;
      r.reveal = {
        decision: 'desconfiar',
        hadIt: false,
        matchedCard: null,
        golos: total,
        drinkerId: flipperId,
        drinkerName: r.assign.flipperName,
        caughtBluff: true,
      };
    }
  } else {
    throw new AppError('Decisão inválida.');
  }
  r.substate = 'resolved';
  return r;
}

/** Mão PRIVADA de um jogador (entregue por socket direto ao próprio, nunca em broadcast). */
export function piramideHand(room, playerId) {
  const r = room.game?.round;
  if (!r || r.gameTypeKey !== 'piramide') return null;
  const cards = r.hands?.[playerId];
  return cards ? cards.map((c) => ({ rank: c.rank, suit: c.suit })) : null;
}

/** Após uma carta resolvida, o flipper ou o host avança para a carta seguinte. */
export function piramideNext(room, playerId) {
  const r = requirePiramide(room, ['resolved']);
  const p = room.players.get(playerId);
  if (!p || (!p.isHost && playerId !== r.currentPlayerId))
    throw new AppError('Só quem virou ou o host pode continuar.');
  advanceFlip(room);
  return r;
}

/** Preenche `base` com os campos públicos da Piramide (as mãos nunca vão na rede). */
export function serializePiramide(base, r) {
  base.substate = r.substate; // memorize | flipping | challenge | resolved | summary
  base.levels = PYRAMID_LEVELS.map((l, i) => ({ level: i + 1, golos: l.golos, count: l.count }));
  // Pirâmide pública: só o número/naipe de cartas JÁ viradas (as mãos nunca vão na rede).
  base.pyramid = r.pyramid.map((c) => ({
    id: c.id,
    level: c.level,
    golos: c.golos,
    flipped: c.flipped,
    rank: c.flipped ? c.rank : null,
    suit: c.flipped ? c.suit : null,
  }));
  base.flippedCard = r.flippedCard;
  base.assign = r.assign
    ? { flipperId: r.assign.flipperId, flipperName: r.assign.flipperName, targetId: r.assign.targetId, targetName: r.assign.targetName }
    : null;
  base.reveal = r.substate === 'resolved' ? r.reveal : null;
  base.readyCount = Object.keys(r.ready || {}).length;
  base.summary = r.substate === 'summary' ? r.summary : null;
  // currentPlayerId/Name já refletem o FLIPPER da vez (não o spinner).
  base.currentPlayerId = r.currentPlayerId;
  base.currentPlayerName = r.currentPlayerName;
}
