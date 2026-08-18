import { randomUUID } from 'node:crypto';
import * as repo from './repo.js';
import { AppError } from './errors.js';

// Motor de jogo. Opera sobre `room.game` (criado por initGame).
//
// Fases:
//   'prep'     — jogadores escrevem perguntas dirigidas (Boca Calada) e segredos (Segredos)
//   'wheel'    — é a vez de um jogador; ELE gira a roda (não o host)
//   'prompt'   — Boca Calada / Desafio: o jogador da vez aceita ou recusa (bebe)
//   'voting'   — Intrigas: TODOS votam anonimamente; mais votado bebe
//   'guessing' — Segredos: mostra segredo anónimo; todos adivinham o autor
//   'gameover'
//
// Vidas: só se perdem em recusas (Boca Calada / Desafio). Intrigas/Segredos dão
// "goles" (contam para estatísticas) mas não tiram vidas.

const DEFAULT_LIVES = 3;
const MIN_LIVES = 1;
const MAX_LIVES = 5;
// Leve · Picante (+18/festa) · Hardcore (mesmo embaraçoso) · Caos (expose/drama).
const INTENSITIES = ['leve', 'picante', 'hardcore', 'caos'];

function connectedOrder(room) {
  return [...room.players.values()]
    .filter((p) => p.connected)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
}

function statsFor(game, playerId) {
  return (game.stats[playerId] ||= { drinks: 0, refusals: 0, shots: 0 });
}

function drink(game, playerId, n = 1) {
  statsFor(game, playerId).drinks += n;
}

function nameOf(room, id) {
  return room.players.get(id)?.name;
}

// Regras com duração: cada avanço de vez é uma "jogada" → decrementa e limpa.
function decrementRules(game) {
  if (!game.activeRules?.length) return;
  for (const rule of game.activeRules) rule.remaining -= 1;
  game.activeRules = game.activeRules.filter((rule) => rule.remaining > 0);
}

function addRule(room, playerId, text, remaining) {
  room.game.activeRules.push({
    id: randomUUID(),
    playerId,
    playerName: nameOf(room, playerId),
    text,
    remaining,
  });
}

function advanceTurn(room) {
  const g = room.game;
  decrementRules(g); // uma jogada passou
  const order = connectedOrder(room);
  if (!order.length) {
    g.currentPlayerId = null;
    return;
  }
  let idx = 0;
  if (g.currentPlayerId) {
    const cur = order.findIndex((p) => p.id === g.currentPlayerId);
    idx = cur === -1 ? 0 : (cur + 1) % order.length;
  }
  g.currentPlayerId = order[idx].id;
}

function pickQuestion(game, targetId) {
  let pool = game.questions.filter((q) => q.targetPlayerId === targetId && !q.used);
  if (!pool.length) {
    const all = game.questions.filter((q) => q.targetPlayerId === targetId);
    if (!all.length) return null;
    all.forEach((q) => (q.used = false));
    pool = all;
  }
  const q = pool[Math.floor(Math.random() * pool.length)];
  q.used = true;
  return { text: q.text };
}

function pickSecret(game, excludeAuthorId) {
  const unusedOther = game.secrets.filter((s) => !s.used && s.authorPlayerId !== excludeAuthorId);
  const unusedAny = game.secrets.filter((s) => !s.used);
  let pool = unusedOther.length ? unusedOther : unusedAny;
  if (!pool.length) {
    if (!game.secrets.length) return null;
    game.secrets.forEach((s) => (s.used = false)); // reciclar
    pool = game.secrets.filter((s) => s.authorPlayerId !== excludeAuthorId);
    if (!pool.length) pool = game.secrets;
  }
  const s = pool[Math.floor(Math.random() * pool.length)];
  s.used = true;
  return s;
}

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

// A Piramide é um mini-jogo longo → sai menos vezes. Fica com uma fração-alvo
// fixa da roda; o resto (90%) é distribuído POR IGUAL pelos outros tipos, seja
// qual for o número deles. Afina-se só aqui.
const PIRAMIDE_SHARE = 0.1; // ≈ 10% das voltas

function pickWeightedType(types) {
  const piramide = types.find((t) => t.key === 'piramide');
  const others = types.filter((t) => t.key !== 'piramide');
  if (!others.length) return piramide || types[0];
  if (piramide && Math.random() < PIRAMIDE_SHARE) return piramide;
  return others[Math.floor(Math.random() * others.length)];
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

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
function dealPiramide(room, round) {
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

// ----- Jogo do Vasco (Impostor) ---------------------------------------------
//
// O grupo partilha uma PALAVRA secreta (uma de 9 num quadro visível a todos). O
// (ou os) "Vasco(s)" são impostores que NÃO sabem qual é e têm de a adivinhar
// pelas pistas que o resto vai dando à vez. No fim cada Vasco escolhe uma palavra
// do quadro: acerta → +1 vida; falha → bebe 5 golos. A palavra secreta e QUEM é
// Vasco nunca vão no broadcast até ao reveal (entrega privada por `vasco_role`).

const VASCO_GOLOS = 5;

async function dealVasco(room, round) {
  const board = await repo.getRandomVascoBoard();
  const words = board?.words ? [...board.words] : [];
  const secret = words[Math.floor(Math.random() * words.length)];
  const order = connectedOrder(room).map((p) => p.id);
  const k = order.length >= 6 ? 2 : 1;
  const nImp = Math.min(k, Math.max(1, order.length - 1)); // pelo menos 1 do grupo não-Vasco
  const impostorIds = shuffle([...order]).slice(0, nImp);

  round.board = { theme: board?.theme || '—', words }; // só o TEMA é público; words fica no servidor
  round.secretWord = secret; // PRIVADO (só o grupo o recebe por vasco_role)
  round.impostorIds = impostorIds; // PRIVADO durante reveal/clues
  round.impostorInfo = impostorIds.map((id) => ({ id, name: nameOf(room, id) })); // revelado no guessing
  round.clueOrder = order;
  round.clueIdx = 0;
  round.votes = {}; // voterId -> suspectId (votação de quem é o Vasco)
  round.accusedId = null; // mais votado (definido no tally)
  round.accusedName = null;
  round.redemption = null; // { by:{id,name}, word, correct } se o Vasco apanhado tentar a palavra
  round.result = null;
  round.substate = 'reveal';
}

function requireVasco(room, substates) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'vasco' || !r || r.gameTypeKey !== 'vasco')
    throw new AppError('Não há Jogo do Vasco ativo.');
  if (substates && !substates.includes(r.substate)) throw new AppError('Não é altura disso.');
  return r;
}

/** Papel PRIVADO de um jogador: é Vasco? qual a palavra (só o grupo a vê)? */
export function vascoRole(room, playerId) {
  const r = room.game?.round;
  if (!r || r.gameTypeKey !== 'vasco') return null;
  const isImpostor = r.impostorIds.includes(playerId);
  return { isImpostor, word: isImpostor ? null : r.secretWord };
}

function skipToConnectedClue(room) {
  const r = room.game.round;
  while (r.clueIdx < r.clueOrder.length && !room.players.get(r.clueOrder[r.clueIdx])?.connected) {
    r.clueIdx += 1;
  }
  if (r.clueIdx >= r.clueOrder.length) r.substate = 'voting'; // fim das pistas → votação
}

/** Reveal → começa a ronda de pistas (host ou quem girou). */
export function vascoStartClues(room, playerId) {
  const r = requireVasco(room, ['reveal']);
  const p = room.players.get(playerId);
  if (!p || (!p.isHost && playerId !== room.game.currentPlayerId))
    throw new AppError('Só o host ou quem girou pode começar.');
  r.substate = 'clues';
  r.clueIdx = 0;
  skipToConnectedClue(room);
  return r;
}

/** O jogador da vez (ou host/quem girou) marca que já deu a sua pista. */
export function vascoClueDone(room, playerId) {
  const r = requireVasco(room, ['clues']);
  const cur = r.clueOrder[r.clueIdx];
  const p = room.players.get(playerId);
  if (!p || (playerId !== cur && !p.isHost && playerId !== room.game.currentPlayerId))
    throw new AppError('Não é a tua vez de dar pista.');
  r.clueIdx += 1;
  skipToConnectedClue(room);
  return r;
}

/** Votação: cada jogador vota em quem acha que é o Vasco (não em si). Todos → tally. */
export function vascoVote(room, voterId, suspectId) {
  const r = requireVasco(room, ['voting']);
  const voter = room.players.get(voterId);
  if (!voter || !voter.connected) throw new AppError('Jogador inválido.');
  if (suspectId === voterId) throw new AppError('Não podes votar em ti próprio.');
  if (!room.players.get(suspectId)) throw new AppError('Escolhe um jogador válido.');
  r.votes[voterId] = suspectId;

  const allVoted = connectedOrder(room).every((p) => r.votes[p.id] !== undefined);
  if (allVoted) return tallyVascoVotes(room);
  return { round: r, finalized: false, winners: [] };
}

/** Apura os votos. Se o mais votado for Vasco → redenção; senão → resolve (Vascos escapam). */
function tallyVascoVotes(room) {
  const r = room.game.round;
  const tally = {};
  for (const s of Object.values(r.votes)) tally[s] = (tally[s] || 0) + 1;
  const max = Object.values(tally).reduce((m, n) => Math.max(m, n), 0);
  const top = Object.keys(tally).filter((id) => tally[id] === max);
  r.accusedId = top.length === 1 ? top[0] : null; // empate → sem acusado claro
  r.accusedName = r.accusedId ? nameOf(room, r.accusedId) : null;

  if (r.accusedId && r.impostorIds.includes(r.accusedId)) {
    r.substate = 'redemption'; // Vasco apanhado → última hipótese (adivinhar a palavra)
    return { round: r, finalized: false, winners: [] };
  }
  const winners = buildVascoResult(room); // ninguém apanhado → Vascos escapam
  return { round: r, finalized: true, winners };
}

/** Redenção: o Vasco apanhado escolhe a palavra do quadro. Acerta → safa-se (+1 vida). */
export function vascoRedeem(room, playerId, word) {
  const r = requireVasco(room, ['redemption']);
  if (playerId !== r.accusedId) throw new AppError('Só o Vasco apanhado pode adivinhar.');
  if (!r.board.words.includes(word)) throw new AppError('Escolhe uma palavra do quadro.');
  r.redemption = { by: { id: playerId, name: nameOf(room, playerId) }, word, correct: word === r.secretWord };
  const winners = buildVascoResult(room);
  return { round: r, finalized: true, winners };
}

function buildVascoResult(room) {
  const g = room.game;
  const r = g.round;
  const impostors = r.impostorIds.map((id) => {
    const caught = id === r.accusedId; // o acusado (se for Vasco)
    // Escapou → +1 vida. Apanhado → redenção: acerta = +1 vida, falha = 5 golos.
    const correct = caught ? !!(r.redemption && r.redemption.correct) : false;
    const outcome = !caught || correct ? 'vida' : 'golos';
    return { id, name: nameOf(room, id), caught, correct, outcome, golos: outcome === 'golos' ? VASCO_GOLOS : 0 };
  });
  const winners = [];
  for (const imp of impostors) {
    const p = room.players.get(imp.id);
    if (imp.outcome === 'vida') {
      if (p) p.lives += 1;
      winners.push({ id: imp.id, name: imp.name });
    } else {
      drink(g, imp.id, 1); // 5 golos
    }
  }
  const voteTally = Object.entries(
    Object.values(r.votes).reduce((m, s) => ((m[s] = (m[s] || 0) + 1), m), {})
  )
    .map(([id, n]) => ({ id, name: nameOf(room, id), votes: n }))
    .sort((a, b) => b.votes - a.votes);

  r.result = {
    secretWord: r.secretWord,
    theme: r.board.theme,
    golos: VASCO_GOLOS,
    accusedId: r.accusedId,
    accusedName: r.accusedName,
    redemption: r.redemption,
    voteTally,
    impostors,
  };
  r.substate = 'result';
  return winners;
}

// ---------------------------------------------------------------------------

/**
 * Apura a votação de intensidade do lobby. Maioria simples ganha; empate (ou
 * sem votos) → sorteia entre as empatadas (o "randomizer" que o cliente anima).
 */
export function tallyIntensity(room) {
  const counts = { leve: 0, picante: 0, hardcore: 0, caos: 0 };
  for (const v of Object.values(room.intensityVotes || {})) {
    if (counts[v] !== undefined) counts[v] += 1;
  }
  const max = Math.max(...Object.values(counts));
  let candidates = INTENSITIES.filter((k) => counts[k] === max && max > 0);
  if (!candidates.length) candidates = [...INTENSITIES]; // ninguém votou → sorteia entre todas
  const randomized = candidates.length > 1;
  const intensity = candidates[Math.floor(Math.random() * candidates.length)];
  return { intensity, randomized, candidates, counts };
}

export function initGame(room, { lives = DEFAULT_LIVES, intensity = 'leve' } = {}) {
  const n = Math.max(MIN_LIVES, Math.min(MAX_LIVES, Number(lives) || DEFAULT_LIVES));
  for (const p of room.players.values()) p.lives = n;

  room.game = {
    phase: 'prep',
    intensity: INTENSITIES.includes(intensity) ? intensity : 'leve',
    startingLives: n,
    questions: [], // { id, targetPlayerId, authorPlayerId, text, used }
    secrets: [], // { id, authorPlayerId, text, used }
    round: null,
    roundCount: 0,
    currentPlayerId: null,
    stats: {},
    activeRules: [], // regras com duração: { id, playerId, playerName, text, remaining }
    finalStats: null,
  };
  return room.game;
}

export function addQuestion(room, authorId, targetPlayerId, text) {
  const g = room.game;
  if (!g || g.phase !== 'prep') throw new AppError('Não é altura de escrever perguntas.');
  const author = room.players.get(authorId);
  const target = room.players.get(targetPlayerId);
  if (!author) throw new AppError('Jogador inválido.');
  if (!target) throw new AppError('Escolhe um jogador válido.');
  if (targetPlayerId === authorId) throw new AppError('Escolhe outro jogador (não tu).');
  const clean = String(text || '').trim().slice(0, 200);
  if (clean.length < 3) throw new AppError('Escreve uma pergunta.');
  g.questions.push({ id: randomUUID(), targetPlayerId, authorPlayerId: authorId, text: clean, used: false });
  return g.questions.length;
}

export function addSecret(room, authorId, text) {
  const g = room.game;
  if (!g || g.phase !== 'prep') throw new AppError('Não é altura de escrever segredos.');
  const author = room.players.get(authorId);
  if (!author) throw new AppError('Jogador inválido.');
  const clean = String(text || '').trim().slice(0, 200);
  if (clean.length < 3) throw new AppError('Escreve um segredo.');
  g.secrets.push({ id: randomUUID(), authorPlayerId: authorId, text: clean, used: false });
  return g.secrets.length;
}

export function beginPlay(room, playerId) {
  const g = room.game;
  const host = room.players.get(playerId);
  if (!host || !host.isHost) throw new AppError('Só o host pode começar a jogar.');
  if (!g || g.phase !== 'prep') throw new AppError('Não é altura de começar.');
  const order = connectedOrder(room);
  if (order.length < 2) throw new AppError('São precisos pelo menos 2 jogadores ligados.');
  g.currentPlayerId = order[0].id;
  g.phase = 'wheel';
  return g;
}

/** O jogador da vez gira a roda: decide o TIPO e prepara a mecânica. */
export async function spinWheel(room, playerId) {
  const g = room.game;
  if (!g) throw new AppError('O jogo ainda não começou.');
  if (g.phase !== 'wheel') throw new AppError('Não é altura de girar a roda.');
  if (g.currentPlayerId !== playerId) throw new AppError('Só quem está à vez pode girar a roda.');

  const player = room.players.get(playerId);
  const types = await repo.getGameTypes();
  const gt = pickWeightedType(types);

  const round = {
    id: randomUUID(),
    gameTypeKey: gt.key,
    gameTypeLabel: gt.label,
    currentPlayerId: playerId,
    currentPlayerName: player.name,
    prompt: null,
    status: 'pending',
    needsBuddy: false, // prompt de buddy → o jogador escolhe alguém que bebe junto
    buddyId: null,
    buddyName: null,
    ruleDuration: null, // se aceitar um prompt com duração → cria regra ativa
  };

  if (gt.key === 'boca_calada') {
    const q = pickQuestion(g, playerId) || (await repo.getRandomPrompt('boca_calada', g.intensity));
    round.prompt = q ? { text: q.text } : null;
    round.needsBuddy = !!q?.buddy;
    round.ruleDuration = q?.duration || null;
    g.phase = 'prompt';
  } else if (gt.key === 'desafio') {
    const p = await repo.getRandomPrompt('desafio', g.intensity);
    round.prompt = p ? { text: p.text } : null;
    round.needsBuddy = !!p?.buddy;
    round.ruleDuration = p?.duration || null;
    g.phase = 'prompt';
  } else if (gt.key === 'isto_ou_aquilo') {
    const p = await repo.getRandomPrompt('isto_ou_aquilo', g.intensity);
    const parts = String(p?.text || '||').split('||');
    round.options = [(parts[0] || '—').trim(), (parts[1] || '—').trim()];
    round.chosen = null;
    round.needsBuddy = !!p?.buddy;
    g.phase = 'choice';
  } else if (gt.key === 'intrigas') {
    const p = await repo.getRandomPrompt('intrigas', g.intensity);
    round.reason = p ? p.text : 'Quem é mais provável?'; // SERVER-SIDE (nunca no broadcast)
    round.prompt = null;
    round.substate = 'choosing'; // 'choosing' | 'rps' | 'reveal'
    round.accusedId = null;
    round.accusedName = null;
    round.rps = {}; // playerId -> 'pedra'|'papel'|'tesoura'
    round.ties = 0;
    round.result = null;
    g.phase = 'intrigas';
  } else if (gt.key === 'segredos') {
    const secret = pickSecret(g, playerId);
    if (secret) {
      round.prompt = { text: secret.text };
      round.secretAuthorId = secret.authorPlayerId; // NUNCA serializado antes do reveal
      round.guesses = {};
      round.revealed = false;
      round.result = null;
      g.phase = 'guessing';
    } else {
      // Sem segredos submetidos → confissão simples (aceita/recusa).
      const p = await repo.getRandomPrompt('segredos', g.intensity);
      round.prompt = p ? { text: p.text } : null;
      g.phase = 'prompt';
    }
  } else if (gt.key === 'piramide') {
    round.prompt = null;
    dealPiramide(room, round); // dá as mãos (privadas) e monta a pirâmide
    g.phase = 'piramide';
  } else if (gt.key === 'vasco') {
    round.prompt = null;
    await dealVasco(room, round); // escolhe palavra + impostor(es), papéis privados
    g.phase = 'vasco';
  }

  g.round = round;
  g.roundCount += 1;
  return round;
}

/** Boca Calada / Desafio: aceitar (passa) ou recusar (bebe → vida/shot). */
export function resolveAction(room, playerId, action) {
  const g = room.game;
  if (!g || g.phase !== 'prompt' || !g.round) throw new AppError('Não há ronda ativa.');
  if (g.round.currentPlayerId !== playerId) throw new AppError('Não é a tua vez.');
  if (g.round.needsBuddy && !g.round.buddyId) throw new AppError('Escolhe primeiro o teu buddy 🤝.');

  const player = room.players.get(playerId);
  const st = statsFor(g, playerId);
  let effect;

  if (action === 'refuse') {
    st.refusals += 1;
    st.drinks += 1;
    if (player.lives > 0) {
      player.lives -= 1;
      effect = { type: 'vida_perdida', playerId, lives: player.lives };
    } else {
      st.shots += 1;
      effect = { type: 'shot', playerId, lives: 0 };
    }
    g.round.status = 'refused';
  } else {
    effect = { type: 'accepted', playerId };
    g.round.status = 'resolved';
  }

  // Aceitar um desafio com duração → passa a regra ativa (N jogadas).
  const dur = action !== 'refuse' ? g.round.ruleDuration : null;
  const ruleText = g.round.prompt?.text;
  advanceTurn(room); // decrementa regras existentes...
  if (dur && ruleText) addRule(room, playerId, ruleText, dur); // ...e adiciona a nova com duração cheia
  g.phase = 'wheel';
  return { round: g.round, effect };
}

/** Buddy: quem tem o desafio escolhe outro jogador que "bebe junto". */
export function chooseBuddy(room, playerId, buddyId) {
  const g = room.game;
  const r = g?.round;
  if (!g || !r || !r.needsBuddy) throw new AppError('Não há buddy a escolher.');
  if (r.currentPlayerId !== playerId) throw new AppError('Só quem tem o desafio escolhe o buddy.');
  if (r.buddyId) throw new AppError('Já escolheste o buddy.');
  const buddy = room.players.get(buddyId);
  if (!buddy || !buddy.connected) throw new AppError('Escolhe um jogador válido.');
  if (buddyId === playerId) throw new AppError('Escolhe outra pessoa.');
  r.buddyId = buddyId;
  r.buddyName = buddy.name;
  return r;
}

/** Isto ou Aquilo: o jogador da vez escolhe a opção 0 ou 1. Mostra e espera "continuar". */
export function chooseOption(room, playerId, index) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'choice' || !r) throw new AppError('Não há escolha ativa.');
  if (r.currentPlayerId !== playerId) throw new AppError('Não é a tua vez.');
  if (r.needsBuddy && !r.buddyId) throw new AppError('Escolhe primeiro o teu buddy 🤝.');
  const i = Number(index);
  if (i !== 0 && i !== 1) throw new AppError('Escolha inválida.');
  r.chosen = i;
  r.status = 'resolved';
  return r;
}

/**
 * Intrigas — passo 1: quem girou (acusador) escolhe o "acusado".
 * O acusado NÃO sabe a razão. Passa a pedra-papel-tesoura.
 */
export function chooseTarget(room, accuserId, accusedId) {
  const g = room.game;
  if (!g || g.phase !== 'intrigas' || !g.round) throw new AppError('Não há Intrigas ativa.');
  if (g.round.substate !== 'choosing') throw new AppError('Já escolheste.');
  if (accuserId !== g.round.currentPlayerId) throw new AppError('Só quem girou pode escolher.');
  const accused = room.players.get(accusedId);
  if (!accused || !accused.connected) throw new AppError('Escolhe um jogador válido.');
  if (accusedId === accuserId) throw new AppError('Escolhe outra pessoa.');

  g.round.accusedId = accusedId;
  g.round.accusedName = accused.name;
  g.round.substate = 'rps';
  return g.round;
}

const RPS_BEATS = { pedra: 'tesoura', papel: 'pedra', tesoura: 'papel' };

/**
 * Intrigas — passo 2: acusador e acusado jogam pedra-papel-tesoura.
 * Empate → repete. Acusado ganha → fica a saber a razão. Acusado perde → bebe
 * e nunca saberá. Devolve metadados para o socket.js tratar da entrega privada.
 */
export function submitRps(room, playerId, move) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'intrigas' || !r) throw new AppError('Não há Intrigas ativa.');
  if (r.substate !== 'rps') throw new AppError('Não é altura de jogar.');
  if (playerId !== r.currentPlayerId && playerId !== r.accusedId)
    throw new AppError('Não estás neste duelo.');
  if (!RPS_BEATS[move]) throw new AppError('Jogada inválida.');

  r.rps[playerId] = move;
  const aMove = r.rps[r.currentPlayerId]; // acusador
  const bMove = r.rps[r.accusedId]; // acusado
  if (!aMove || !bMove) return { round: r, resolved: false };

  if (aMove === bMove) {
    r.rps = {}; // empate → repete
    r.ties = (r.ties || 0) + 1;
    return { round: r, resolved: false, tie: true };
  }

  const accusedWon = RPS_BEATS[bMove] === aMove;
  r.substate = 'reveal';
  if (accusedWon) {
    r.result = { accusedWon: true, accusedLearns: true, drinker: null };
  } else {
    drink(g, r.accusedId, 1);
    r.result = { accusedWon: false, accusedLearns: false, drinker: { id: r.accusedId, name: r.accusedName } };
  }
  return { round: r, resolved: true, accusedWon, accusedId: r.accusedId, reason: r.reason };
}

/** Segredos: um jogador (não o autor) adivinha. Auto-revela quando todos adivinharem. */
export function castGuess(room, guesserId, guessedId) {
  const g = room.game;
  if (!g || g.phase !== 'guessing' || !g.round) throw new AppError('Não há adivinha ativa.');
  if (g.round.revealed) throw new AppError('Já foi revelado.');
  if (guesserId === g.round.secretAuthorId) throw new AppError('É o teu segredo — fica calado! 🤫');
  const guesser = room.players.get(guesserId);
  const guessed = room.players.get(guessedId);
  if (!guesser || !guessed) throw new AppError('Escolhe um jogador válido.');

  g.round.guesses[guesserId] = guessedId;

  const eligible = connectedOrder(room)
    .map((p) => p.id)
    .filter((id) => id !== g.round.secretAuthorId);
  if (eligible.length && eligible.every((id) => g.round.guesses[id] !== undefined)) {
    revealSegredos(room);
  }
  return g.round;
}

function revealSegredos(room) {
  const g = room.game;
  const r = g.round;
  const authorId = r.secretAuthorId;
  const entries = Object.entries(r.guesses); // [guesserId, guessedId]
  const correct = entries.filter(([, gid]) => gid === authorId).map(([id]) => id);
  const wrong = entries.filter(([, gid]) => gid !== authorId).map(([id]) => id);

  let drinkers;
  if (authorId && entries.length > 0 && wrong.length === 0) {
    drinkers = [authorId]; // todos acertaram → autor foi apanhado, bebe
    drink(g, authorId, 1);
  } else {
    drinkers = wrong; // quem errou bebe
    wrong.forEach((id) => drink(g, id, 1));
  }

  r.result = {
    authorId,
    authorName: authorId ? nameOf(room, authorId) : null,
    correct: correct.map((id) => ({ id, name: nameOf(room, id) })),
    wrong: wrong.map((id) => ({ id, name: nameOf(room, id) })),
    drinkers: drinkers.map((id) => ({ id, name: nameOf(room, id) })),
  };
  r.revealed = true;
}

/** Força o reveal do Segredos (host ou quem girou), sem todos terem adivinhado. */
export function revealResult(room, playerId) {
  const g = room.game;
  if (!g || !g.round) throw new AppError('Nada para revelar.');
  const p = room.players.get(playerId);
  if (!p || (!p.isHost && playerId !== g.currentPlayerId))
    throw new AppError('Só o host ou quem girou pode revelar.');
  if (g.phase === 'guessing' && !g.round.revealed) revealSegredos(room);
  else if (g.phase === 'vasco' && g.round.substate === 'voting') tallyVascoVotes(room);
  else if (g.phase === 'vasco' && g.round.substate === 'redemption') buildVascoResult(room); // força: sem redenção → falha
  else throw new AppError('Nada para revelar.');
  return g.round;
}

/** Avança para a próxima vez (após reveal de Intrigas/Segredos ou fim da Piramide). */
export function continueRound(room, playerId) {
  const g = room.game;
  if (!g) throw new AppError('O jogo ainda não começou.');
  const p = room.players.get(playerId);
  if (!p || (!p.isHost && playerId !== g.currentPlayerId))
    throw new AppError('Só o host ou quem girou pode continuar.');

  // Piramide: só se fecha no resumo final; aí aplica o prémio (+1 vida a quem fez beber mais).
  if (g.phase === 'piramide') {
    if (g.round?.substate !== 'summary') throw new AppError('A pirâmide ainda não terminou.');
    const winners = g.round.summary?.winners || [];
    for (const w of winners) {
      const winner = room.players.get(w.id);
      if (winner) winner.lives += 1;
    }
    advanceTurn(room);
    g.round = null;
    g.phase = 'wheel';
    return { game: g, rewarded: winners };
  }

  // Jogo do Vasco: fecha-se no resultado (prémio +1 vida já aplicado no reveal).
  if (g.phase === 'vasco') {
    if (g.round?.substate !== 'result') throw new AppError('O Jogo do Vasco ainda não terminou.');
    advanceTurn(room);
    g.round = null;
    g.phase = 'wheel';
    return { game: g, rewarded: [] };
  }

  // Isto ou Aquilo: avança depois de a escolha estar feita.
  if (g.phase === 'choice') {
    if (g.round?.status !== 'resolved') throw new AppError('Escolhe uma opção primeiro.');
    advanceTurn(room);
    g.round = null;
    g.phase = 'wheel';
    return { game: g, rewarded: [] };
  }

  if (!['intrigas', 'guessing'].includes(g.phase)) throw new AppError('Nada a continuar.');
  advanceTurn(room);
  g.round = null;
  g.phase = 'wheel';
  return { game: g, rewarded: [] };
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

export function skipTurn(room, playerId) {
  const host = room.players.get(playerId);
  if (!host || !host.isHost) throw new AppError('Só o host pode saltar.');
  const g = room.game;
  if (!g || g.phase === 'prep' || g.phase === 'gameover')
    throw new AppError('Não há vez para saltar.');
  advanceTurn(room);
  g.round = null;
  g.phase = 'wheel';
  return g;
}

export function endGame(room, playerId) {
  const host = room.players.get(playerId);
  if (!host || !host.isHost) throw new AppError('Só o host pode terminar.');
  if (!room.game) throw new AppError('O jogo ainda não começou.');
  const stats = buildStats(room);
  room.game.phase = 'gameover';
  room.game.finalStats = stats;
  room.status = 'ended';
  return stats;
}

export function resetToLobby(room, playerId) {
  const host = room.players.get(playerId);
  if (!host || !host.isHost) throw new AppError('Só o host pode voltar ao lobby.');
  room.game = null;
  room.status = 'lobby';
  room.intensityVotes = {}; // nova votação de intensidade
  return room;
}

function buildStats(room) {
  const g = room.game;
  const rows = [...room.players.values()]
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
    .map((p) => {
      const s = g.stats[p.id] || { drinks: 0, refusals: 0, shots: 0 };
      return { id: p.id, name: p.name, lives: p.lives, drinks: s.drinks, refusals: s.refusals, shots: s.shots };
    });
  const top = (key) =>
    rows.reduce((best, r) => (r[key] > (best?.[key] ?? -1) && r[key] > 0 ? r : best), null);
  return { rows, roundCount: g.roundCount, mostDrinks: top('drinks'), mostRefusals: top('refusals') };
}

/** Serializa a ronda para a rede — anonimiza votos/segredos até ao reveal. */
function serializeRound(g) {
  const r = g.round;
  if (!r) return null;
  const base = {
    id: r.id,
    gameTypeKey: r.gameTypeKey,
    gameTypeLabel: r.gameTypeLabel,
    currentPlayerId: r.currentPlayerId,
    currentPlayerName: r.currentPlayerName,
    prompt: r.prompt,
    status: r.status,
    needsBuddy: !!r.needsBuddy,
    buddyId: r.buddyId || null,
    buddyName: r.buddyName || null,
  };
  if (r.gameTypeKey === 'isto_ou_aquilo') {
    base.options = r.options || [];
    base.chosen = r.chosen ?? null;
  }
  if (r.gameTypeKey === 'intrigas') {
    base.substate = r.substate; // 'choosing' | 'rps' | 'reveal'
    base.accusedId = r.accusedId || null;
    base.accusedName = r.accusedName || null;
    base.rpsSubmitted = Object.keys(r.rps || {}); // quem já jogou (não o quê)
    base.ties = r.ties || 0;
    base.result = r.substate === 'reveal' ? r.result : null;
    // base.prompt fica null — a razão nunca vai no broadcast (entrega privada)
  }
  if (r.gameTypeKey === 'segredos') {
    base.guessers = Object.keys(r.guesses || {});
    base.hasAuthor = !!r.secretAuthorId; // se false, é confissão sem autor
    base.revealed = !!r.revealed;
    base.result = r.revealed ? r.result : null; // autor só aqui
  }
  if (r.gameTypeKey === 'piramide') {
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
  if (r.gameTypeKey === 'vasco') {
    base.substate = r.substate; // reveal | clues | voting | redemption | result
    base.theme = r.board.theme; // só o TEMA é público (a pista do Vasco); as 9 palavras NÃO vão em clues
    base.clueOrder = r.clueOrder;
    base.clueIdx = r.clueIdx;
    base.clueCurrentId = r.substate === 'clues' ? r.clueOrder[r.clueIdx] || null : null;
    base.impostorCount = r.impostorIds.length; // quantos Vascos (não quem)
    base.voterIds = Object.keys(r.votes || {}); // quem já votou (não em quem)
    // O acusado só é revelado a partir da redenção; identidades no result.
    base.accused =
      ['redemption', 'result'].includes(r.substate) && r.accusedId
        ? { id: r.accusedId, name: r.accusedName }
        : null;
    base.boardWords = ['redemption', 'result'].includes(r.substate) ? r.board.words : null; // p/ a redenção
    base.result = r.substate === 'result' ? r.result : null; // palavra/Vascos/votos só aqui
  }
  return base;
}

/** Serializa o estado de jogo para o payload de rede. */
export function serializeGame(room) {
  const g = room.game;
  if (!g) return null;
  return {
    phase: g.phase,
    intensity: g.intensity,
    startingLives: g.startingLives,
    roundCount: g.roundCount,
    currentPlayerId: g.currentPlayerId,
    finalStats: g.finalStats,
    activeRules: (g.activeRules || []).map((r) => ({
      id: r.id,
      playerId: r.playerId,
      playerName: r.playerName,
      text: r.text,
      remaining: r.remaining,
    })),
    round: serializeRound(g),
    questionCount: g.questions.length,
    questionsByTarget: g.questions.reduce((m, q) => {
      m[q.targetPlayerId] = (m[q.targetPlayerId] || 0) + 1;
      return m;
    }, {}),
    secretCount: g.secrets.length,
  };
}
