import { randomUUID } from 'node:crypto';
import * as repo from './repo.js';
import { AppError } from './rooms.js';

// Motor de jogo. Opera sobre `room.game`, criado por initGame.
//
// Fluxo:
//   1. 'questions' — cada jogador escreve perguntas dirigidas a outros
//      (alimenta o Boca Calada). O host arranca com beginPlay().
//   2. 'wheel'     — é a vez de um jogador; ELE gira a roda (não o host).
//   3. 'prompt'    — mostra o desafio/pergunta; o jogador da vez resolve.
//   4. repete (rotação SEQUENCIAL) até o host terminar → 'gameover'.

const DEFAULT_LIVES = 3;
const MIN_LIVES = 1;
const MAX_LIVES = 5;

/** Jogadores ligados, por ordem de entrada (base da rotação). */
function connectedOrder(room) {
  return [...room.players.values()]
    .filter((p) => p.connected)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
}

function statsFor(game, playerId) {
  return (game.stats[playerId] ||= { drinks: 0, refusals: 0, shots: 0 });
}

/** Avança a vez para o próximo jogador ligado (sequencial). */
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

/** Escolhe uma pergunta dirigida ao jogador-alvo (recicla se esgotar). */
function pickQuestion(game, targetId) {
  let pool = game.questions.filter((q) => q.targetPlayerId === targetId && !q.used);
  if (!pool.length) {
    const all = game.questions.filter((q) => q.targetPlayerId === targetId);
    if (!all.length) return null; // sem perguntas para este jogador
    all.forEach((q) => (q.used = false)); // reciclar
    pool = all;
  }
  const q = pool[Math.floor(Math.random() * pool.length)];
  q.used = true;
  return { text: q.text, intensity: game.intensity };
}

/** Inicializa o estado de jogo e aplica a config do host. */
export function initGame(room, { lives = DEFAULT_LIVES, intensity = 'leve' } = {}) {
  const n = Math.max(MIN_LIVES, Math.min(MAX_LIVES, Number(lives) || DEFAULT_LIVES));
  for (const p of room.players.values()) p.lives = n;

  room.game = {
    phase: 'questions', // 'questions' | 'wheel' | 'prompt' | 'gameover'
    intensity: intensity === 'picante' ? 'picante' : 'leve',
    startingLives: n,
    questions: [], // { id, targetPlayerId, authorPlayerId, text, used }
    round: null,
    roundCount: 0,
    currentPlayerId: null,
    stats: {}, // playerId -> { drinks, refusals, shots }
    finalStats: null,
  };
  return room.game;
}

/** Um jogador escreve uma pergunta dirigida a outro (fase 'questions'). */
export function addQuestion(room, authorId, targetPlayerId, text) {
  const g = room.game;
  if (!g || g.phase !== 'questions') throw new AppError('Não é altura de escrever perguntas.');
  const author = room.players.get(authorId);
  const target = room.players.get(targetPlayerId);
  if (!author) throw new AppError('Jogador inválido.');
  if (!target) throw new AppError('Escolhe um jogador válido.');
  if (targetPlayerId === authorId) throw new AppError('Escolhe outro jogador (não tu).');

  const clean = String(text || '').trim().slice(0, 200);
  if (clean.length < 3) throw new AppError('Escreve uma pergunta.');

  g.questions.push({
    id: randomUUID(),
    targetPlayerId,
    authorPlayerId: authorId, // guardado no servidor, não exposto no payload
    text: clean,
    used: false,
  });
  return g.questions.length;
}

/** Host arranca a partida (fase 'questions' → 'wheel'). */
export function beginPlay(room, playerId) {
  const g = room.game;
  const host = room.players.get(playerId);
  if (!host || !host.isHost) throw new AppError('Só o host pode começar a jogar.');
  if (!g || g.phase !== 'questions') throw new AppError('Não é altura de começar.');
  const order = connectedOrder(room);
  if (order.length < 2) throw new AppError('São precisos pelo menos 2 jogadores ligados.');
  g.currentPlayerId = order[0].id;
  g.phase = 'wheel';
  return g;
}

/**
 * O jogador da VEZ gira a roda: escolhe o tipo de jogo e o desafio/pergunta.
 * A vez já está definida (g.currentPlayerId) — a roda só decide o TIPO.
 */
export async function spinWheel(room, playerId) {
  const g = room.game;
  if (!g) throw new AppError('O jogo ainda não começou.');
  if (g.phase !== 'wheel') throw new AppError('Não é altura de girar a roda.');
  if (g.currentPlayerId !== playerId)
    throw new AppError('Só quem está à vez pode girar a roda.');

  const player = room.players.get(playerId);
  const types = await repo.getGameTypes();
  const gt = types[Math.floor(Math.random() * types.length)];

  // Boca Calada usa perguntas dirigidas ao jogador; os outros usam o banco seed.
  let prompt;
  if (gt.key === 'boca_calada') {
    prompt = pickQuestion(g, playerId) || (await repo.getRandomPrompt('boca_calada', g.intensity));
  } else {
    prompt = await repo.getRandomPrompt(gt.key, g.intensity);
  }

  g.round = {
    id: randomUUID(),
    gameTypeKey: gt.key,
    gameTypeLabel: gt.label,
    currentPlayerId: playerId,
    currentPlayerName: player.name,
    prompt: prompt ? { text: prompt.text, intensity: prompt.intensity || g.intensity } : null,
    status: 'pending',
  };
  g.phase = 'prompt';
  g.roundCount += 1;
  return g.round;
}

/**
 * O jogador da vez resolve. Depois, a vez passa ao próximo.
 * - 'refuse' (inclui "Boca Calada"): bebe → perde vida / shot a 0.
 * - 'accept' (inclui "responder"): sem penalização, passa a vez.
 */
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

  advanceTurn(room); // próximo jogador
  g.phase = 'wheel';
  return { round: g.round, effect };
}

/** Host salta a vez do jogador atual (ex.: desligou), sem penalização. */
export function skipTurn(room, playerId) {
  const host = room.players.get(playerId);
  if (!host || !host.isHost) throw new AppError('Só o host pode saltar.');
  const g = room.game;
  if (!g || (g.phase !== 'prompt' && g.phase !== 'wheel'))
    throw new AppError('Não há vez para saltar.');
  advanceTurn(room);
  g.round = null;
  g.phase = 'wheel';
  return g;
}

/** Termina o jogo e calcula estatísticas finais. */
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

/** Volta ao lobby para jogar outra vez (host). */
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
      return {
        id: p.id,
        name: p.name,
        lives: p.lives,
        drinks: s.drinks,
        refusals: s.refusals,
        shots: s.shots,
      };
    });

  const top = (key) =>
    rows.reduce((best, r) => (r[key] > (best?.[key] ?? -1) && r[key] > 0 ? r : best), null);

  return {
    rows,
    roundCount: g.roundCount,
    mostDrinks: top('drinks'),
    mostRefusals: top('refusals'),
  };
}
