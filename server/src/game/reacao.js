// ----- Reação (Primeiro a Carregar) ------------------------------------------
//
// Motor PURO e partilhado pelos três modos: a Roda (mesa toda), o Torneio (duelo
// 1v1) e o Tabuleiro (casa de duelo). Não conhece `room` nem estatísticas — só
// gere a corrida: arma-se com um atraso ALEATÓRIO (para ninguém antecipar), abre
// o "GO!" e regista a ordem dos toques.
//
// Regras: quem carrega antes do GO comete falso arranque e cai automaticamente
// para último. Quem for último bebe. O relógio é do servidor (autoridade); os
// clientes só recebem `goAt` e animam.

const MIN_DELAY_MS = 2000;
const MAX_DELAY_MS = 6000;
const WINDOW_MS = 5000; // depois do GO, quem não carregar conta como último

/** Cria o estado da corrida para um conjunto de jogadores. */
export function createReaction(playerIds) {
  return {
    playerIds: [...playerIds],
    armedAt: Date.now(),
    goAt: Date.now() + MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS)),
    taps: {}, // playerId -> ms desde o GO (ou null se falso arranque)
    falseStarts: [], // ids que carregaram cedo demais
    done: false,
  };
}

/**
 * Regista um toque.
 * @returns { ok, early, ms } — `early` = falso arranque
 */
export function tapReaction(state, playerId) {
  if (state.done) return { ok: false };
  if (!state.playerIds.includes(playerId)) return { ok: false };
  if (state.taps[playerId] !== undefined || state.falseStarts.includes(playerId)) return { ok: false };
  const now = Date.now();
  if (now < state.goAt) {
    state.falseStarts.push(playerId);
    maybeFinish(state);
    return { ok: true, early: true, ms: null };
  }
  const ms = now - state.goAt;
  state.taps[playerId] = ms;
  maybeFinish(state);
  return { ok: true, early: false, ms };
}

function maybeFinish(state) {
  const respondidos = Object.keys(state.taps).length + state.falseStarts.length;
  if (respondidos >= state.playerIds.length) state.done = true;
}

/** Fecha a corrida à força (tempo esgotado / alguém saiu). */
export function finishReaction(state) {
  state.done = true;
  return state;
}

/** Já passou a janela depois do GO? (usado pelo auto-resolve) */
export function reactionExpired(state) {
  return !state.done && Date.now() > state.goAt + WINDOW_MS;
}

/**
 * Classificação final: mais rápido primeiro; quem não carregou ou fez falso
 * arranque fica no fim (falsos arranques por último de todos).
 * @returns [{ id, ms, early, missed }] — o último do array é quem paga
 */
export function reactionRanking(state) {
  const tapped = Object.entries(state.taps)
    .map(([id, ms]) => ({ id, ms, early: false, missed: false }))
    .sort((a, b) => a.ms - b.ms);
  const missed = state.playerIds
    .filter((id) => state.taps[id] === undefined && !state.falseStarts.includes(id))
    .map((id) => ({ id, ms: null, early: false, missed: true }));
  const early = state.falseStarts.map((id) => ({ id, ms: null, early: true, missed: false }));
  return [...tapped, ...missed, ...early];
}

/** Serializa para a rede — as marcas só interessam no fim, o `goAt` sempre. */
export function serializeReaction(state) {
  if (!state) return null;
  return {
    goAt: state.goAt,
    done: !!state.done,
    tapped: Object.keys(state.taps),
    falseStarts: state.falseStarts,
  };
}

// ----- Ligação ao modo Roda --------------------------------------------------
// (o Torneio e o Tabuleiro usam o motor puro acima com as suas próprias regras)

import { connectedOrder, drink, nameOf } from './helpers.js';
import { AppError } from '../errors.js';

const GOLOS_ULTIMO = 2;
const GOLOS_FALSO_ARRANQUE = 2;

export function setupReacaoRoda(room, round) {
  const ids = connectedOrder(room).map((p) => p.id);
  if (ids.length < 2) return false;
  round.reaction = createReaction(ids);
  round.substate = 'racing'; // racing → result
  round.result = null;
  return true;
}

/** Um toque na Roda. Quando todos responderem, resolve sozinho. */
export function reacaoTap(room, playerId) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'reacao' || !r) throw new AppError('Não há corrida ativa.');
  if (r.substate !== 'racing') throw new AppError('A corrida já acabou.');
  const res = tapReaction(r.reaction, playerId);
  if (!res.ok) throw new AppError('Já carregaste (ou não estás na corrida).');
  if (r.reaction.done) resolveReacaoRoda(room);
  return res;
}

/** Fecha a corrida: o último paga; os falsos arranques também. Idempotente. */
export function resolveReacaoRoda(room) {
  const g = room.game;
  const r = g.round;
  if (!r || r.substate === 'result') return r;
  finishReaction(r.reaction);
  const ranking = reactionRanking(r.reaction);
  const named = (id) => ({ id, name: nameOf(room, id) });

  const punished = new Set(r.reaction.falseStarts);
  const last = ranking[ranking.length - 1];
  if (last && !punished.has(last.id)) punished.add(last.id);
  for (const id of punished) {
    drink(g, id, r.reaction.falseStarts.includes(id) ? GOLOS_FALSO_ARRANQUE : GOLOS_ULTIMO);
  }

  r.substate = 'result';
  r.status = 'resolved';
  r.result = {
    ranking: ranking.map((x) => ({ ...named(x.id), ms: x.ms, early: x.early, missed: x.missed })),
    winner: ranking[0] && !ranking[0].early && !ranking[0].missed ? named(ranking[0].id) : null,
    drinkers: [...punished].map(named),
  };
  return r;
}

export function serializeReacaoRoda(base, r) {
  base.substate = r.substate;
  base.reaction = serializeReaction(r.reaction);
  base.result = r.result || null;
}
