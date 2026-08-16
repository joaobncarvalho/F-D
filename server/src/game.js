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

function advanceTurn(room) {
  const g = room.game;
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

// ---------------------------------------------------------------------------

export function initGame(room, { lives = DEFAULT_LIVES, intensity = 'leve' } = {}) {
  const n = Math.max(MIN_LIVES, Math.min(MAX_LIVES, Number(lives) || DEFAULT_LIVES));
  for (const p of room.players.values()) p.lives = n;

  room.game = {
    phase: 'prep',
    intensity: intensity === 'picante' ? 'picante' : 'leve',
    startingLives: n,
    questions: [], // { id, targetPlayerId, authorPlayerId, text, used }
    secrets: [], // { id, authorPlayerId, text, used }
    round: null,
    roundCount: 0,
    currentPlayerId: null,
    stats: {},
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
  const gt = types[Math.floor(Math.random() * types.length)];

  const round = {
    id: randomUUID(),
    gameTypeKey: gt.key,
    gameTypeLabel: gt.label,
    currentPlayerId: playerId,
    currentPlayerName: player.name,
    prompt: null,
    status: 'pending',
  };

  if (gt.key === 'boca_calada') {
    const q = pickQuestion(g, playerId) || (await repo.getRandomPrompt('boca_calada', g.intensity));
    round.prompt = q ? { text: q.text } : null;
    g.phase = 'prompt';
  } else if (gt.key === 'desafio') {
    const p = await repo.getRandomPrompt('desafio', g.intensity);
    round.prompt = p ? { text: p.text } : null;
    g.phase = 'prompt';
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

  advanceTurn(room);
  g.phase = 'wheel';
  return { round: g.round, effect };
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
  else throw new AppError('Nada para revelar.');
  return g.round;
}

/** Avança para a próxima vez (após reveal de Intrigas/Segredos). */
export function continueRound(room, playerId) {
  const g = room.game;
  if (!g) throw new AppError('O jogo ainda não começou.');
  const p = room.players.get(playerId);
  if (!p || (!p.isHost && playerId !== g.currentPlayerId))
    throw new AppError('Só o host ou quem girou pode continuar.');
  if (!['intrigas', 'guessing'].includes(g.phase)) throw new AppError('Nada a continuar.');
  advanceTurn(room);
  g.round = null;
  g.phase = 'wheel';
  return g;
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
  };
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
    round: serializeRound(g),
    questionCount: g.questions.length,
    questionsByTarget: g.questions.reduce((m, q) => {
      m[q.targetPlayerId] = (m[q.targetPlayerId] || 0) + 1;
      return m;
    }, {}),
    secretCount: g.secrets.length,
  };
}
