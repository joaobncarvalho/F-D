import { randomUUID } from 'node:crypto';
import * as repo from './repo.js';
import { AppError } from './errors.js';
import { sanitizeText } from './util.js';
import { connectedOrder, statsFor, drink, nameOf } from './game/helpers.js';
import { dealPiramide, serializePiramide } from './game/piramide.js';
import { dealVasco, tallyVascoVotes, buildVascoResult, serializeVasco } from './game/vasco.js';
import { setupIntrigas, serializeIntrigas } from './game/intrigas.js';
import { pickSecret, setupSegredos, revealSegredos, serializeSegredos } from './game/segredos.js';
import { setupRelampago, serializeRelampago } from './game/relampago.js';
import { setupMimica, serializeMimica } from './game/mimica.js';
import { setupRoleta, serializeRoleta } from './game/roleta.js';
import { setupDuelo, serializeDuelo } from './game/duelo.js';
// Ações dos mini-jogos chamadas diretamente pelo socket.js — re-exportadas daqui.
export {
  piramideReady,
  piramideFlip,
  piramideAssign,
  piramidePass,
  piramideRespond,
  piramideHand,
  piramideNext,
} from './game/piramide.js';
export {
  vascoRole,
  vascoStartClues,
  vascoClueDone,
  vascoVote,
  vascoRedeem,
} from './game/vasco.js';
export { chooseTarget, submitRps } from './game/intrigas.js';
export { castGuess } from './game/segredos.js';
export { relampagoStart, relampagoResolve } from './game/relampago.js';
export { mimicaWord, mimicaStart, mimicaResolve } from './game/mimica.js';
export { roletaAnswer, roletaPass } from './game/roleta.js';
export { dueloResult } from './game/duelo.js';

// Motor de jogo. Opera sobre `room.game` (criado por initGame).
//
// Fases:
//   'prep'     — jogadores escrevem perguntas dirigidas (Boca Calada) e segredos (Segredos)
//   'wheel'    — é a vez de um jogador; ELE gira a roda (não o host)
//   'prompt'   — Boca Calada / Desafio: o jogador da vez aceita ou recusa (bebe)
//   'voting'   — Intrigas: TODOS votam anonimamente; mais votado bebe
//   'guessing' — Segredos: mostra segredo anónimo; todos adivinham o autor
//   'relampago'— Categoria Relâmpago: cronómetro; travar custa golos
//   'mimica'   — Mímica/Desenho: palavra privada + cronómetro; ninguém acerta = bebe
//   'roleta'   — Roleta Russa: responder ou passar (o passe fica cada vez mais caro)
//   'duelo'    — Duelo 1v1: dois jogadores, mini-duelo presencial; quem perde bebe
//   'gameover'
//
// Vidas: só se perdem em recusas (Boca Calada / Desafio). Intrigas/Segredos dão
// "goles" (contam para estatísticas) mas não tiram vidas.

const DEFAULT_LIVES = 3;
const MIN_LIVES = 1;
const MAX_LIVES = 5;
// Leve · Picante (+18/festa) · Hardcore (mesmo embaraçoso) · Caos (expose/drama).
const INTENSITIES = ['leve', 'picante', 'hardcore', 'caos'];

// connectedOrder/statsFor/drink/nameOf/shuffle vivem em ./game/helpers.js.

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

// Piramide (Desconfia): o motor vive em ./game/piramide.js. Aqui fica só a
// fração-alvo da roda (é um mini-jogo longo → sai menos vezes).

// A Piramide é um mini-jogo longo → sai menos vezes. Fica com uma fração-alvo
// fixa da roda; o resto (90%) é distribuído POR IGUAL pelos outros tipos, seja
// qual for o número deles. Afina-se só aqui.
const PIRAMIDE_SHARE = 0.1; // ≈ 10% das voltas

export function pickWeightedType(types) {
  const piramide = types.find((t) => t.key === 'piramide');
  const others = types.filter((t) => t.key !== 'piramide');
  if (!others.length) return piramide || types[0];
  if (piramide && Math.random() < PIRAMIDE_SHARE) return piramide;
  return others[Math.floor(Math.random() * others.length)];
}

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
  for (const p of room.players.values()) {
    p.lives = n;
    p.eliminated = false; // novo jogo → todos voltam a jogar
  }

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
  const clean = sanitizeText(text, 200);
  if (clean.length < 3) throw new AppError('Escreve uma pergunta.');
  g.questions.push({ id: randomUUID(), targetPlayerId, authorPlayerId: authorId, text: clean, used: false });
  return g.questions.length;
}

export function addSecret(room, authorId, text) {
  const g = room.game;
  if (!g || g.phase !== 'prep') throw new AppError('Não é altura de escrever segredos.');
  const author = room.players.get(authorId);
  if (!author) throw new AppError('Jogador inválido.');
  const clean = sanitizeText(text, 200);
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
    setupIntrigas(round, p?.text); // razão SERVER-SIDE (nunca no broadcast)
    g.phase = 'intrigas';
  } else if (gt.key === 'segredos') {
    const secret = pickSecret(g, playerId);
    if (secret) {
      setupSegredos(round, secret); // autor privado até ao reveal
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
  } else if (gt.key === 'categoria_relampago') {
    const p = await repo.getRandomPrompt('categoria_relampago', g.intensity);
    setupRelampago(round, p);
    g.phase = 'relampago';
  } else if (gt.key === 'mimica') {
    const p = await repo.getRandomPrompt('mimica', g.intensity);
    setupMimica(round, p); // palavra privada (canal mimica_word)
    g.phase = 'mimica';
  } else if (gt.key === 'roleta_russa') {
    const p = await repo.getRandomPrompt('roleta_russa', g.intensity);
    setupRoleta(round, p);
    g.phase = 'roleta';
  } else if (gt.key === 'duelo') {
    if (setupDuelo(room, round)) {
      g.phase = 'duelo';
    } else {
      // Sem adversário disponível (todos os outros saíram) → desafio simples.
      const p = await repo.getRandomPrompt('desafio', g.intensity);
      round.gameTypeKey = 'desafio';
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
  if (g.round.needsBuddy && !g.round.buddyId) throw new AppError('Escolhe primeiro o teu buddy 🤝.');

  const player = room.players.get(playerId);
  const st = statsFor(g, playerId);
  let effect;

  if (action === 'refuse') {
    st.refusals += 1;
    st.drinks += 1;
    player.lives = Math.max(0, player.lives - 1);
    if (player.lives === 0) {
      player.eliminated = true; // sem vidas → fora (telemóvel partido)
      st.shots += 1; // o "shot" fatal
      effect = { type: 'eliminated', playerId };
    } else {
      effect = { type: 'vida_perdida', playerId, lives: player.lives };
    }
    g.round.status = 'refused';
  } else {
    effect = { type: 'accepted', playerId };
    g.round.status = 'resolved';
  }

  // Aceitar um desafio com duração → passa a regra ativa (N jogadas).
  const dur = action !== 'refuse' ? g.round.ruleDuration : null;
  const ruleText = g.round.prompt?.text;
  advanceTurn(room); // decrementa regras existentes... (já salta o eliminado)
  if (dur && ruleText) addRule(room, playerId, ruleText, dur); // ...e adiciona a nova com duração cheia
  g.phase = 'wheel';

  // Auto-fim: se sobrar ≤1 jogador ativo, o último de pé vence.
  let gameOver = null;
  if (player.eliminated && connectedOrder(room).length <= 1) {
    gameOver = buildStats(room);
    g.finalStats = gameOver;
    g.phase = 'gameover';
    room.status = 'ended';
  }
  return { round: g.round, effect, gameOver };
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

  // Tipos que se fecham com um veredicto simples (escolha / marcação manual):
  // só avançam depois de a ronda estar resolvida.
  if (['choice', 'relampago', 'mimica', 'roleta', 'duelo'].includes(g.phase)) {
    if (g.round?.status !== 'resolved') throw new AppError('Esta ronda ainda não terminou.');
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
  room.board = null; // limpa o tabuleiro (mantém o modo escolhido)
  room.tournament = null; // e o quadro do torneio
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
      return {
        id: p.id,
        name: p.name,
        lives: p.lives,
        eliminated: p.eliminated,
        drinks: s.drinks,
        refusals: s.refusals,
        shots: s.shots,
      };
    });
  const top = (key) =>
    rows.reduce((best, r) => (r[key] > (best?.[key] ?? -1) && r[key] > 0 ? r : best), null);
  const alive = rows.filter((r) => !r.eliminated);
  const survivor = alive.length === 1 ? alive[0] : null; // último de pé
  return { rows, roundCount: g.roundCount, mostDrinks: top('drinks'), mostRefusals: top('refusals'), survivor };
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
  if (r.gameTypeKey === 'intrigas') serializeIntrigas(base, r);
  if (r.gameTypeKey === 'segredos') serializeSegredos(base, r);
  if (r.gameTypeKey === 'piramide') serializePiramide(base, r);
  if (r.gameTypeKey === 'vasco') serializeVasco(base, r);
  if (r.gameTypeKey === 'categoria_relampago') serializeRelampago(base, r);
  if (r.gameTypeKey === 'mimica') serializeMimica(base, r);
  if (r.gameTypeKey === 'roleta_russa') serializeRoleta(base, r);
  if (r.gameTypeKey === 'duelo') serializeDuelo(base, r);
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
