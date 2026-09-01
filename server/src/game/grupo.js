// ----- Jogos de GRUPO da Roda ------------------------------------------------
//
// Quatro mini-jogos que partilham a mesma forma: TODA a mesa responde ao mesmo
// tempo, em segredo, e depois revela-se tudo de uma vez. É o que faltava à Roda
// (quase todos os outros tipos giravam à volta do jogador da vez).
//
//   eu_nunca       — "Eu nunca…": respondes "já" ou "nunca". Quem já fez, bebe.
//   mais_provavel  — "Quem é mais provável de…": votas num jogador; o mais votado bebe.
//   termometro     — escala 0–10 em segredo; os EXTREMOS bebem.
//   quem_disse     — mostra uma pergunta escrita na preparação; adivinha quem a
//                    escreveu. Quem erra bebe; se todos acertarem, o autor bebe.
//
// Invariante: as respostas (e, no quem_disse, o AUTOR) nunca entram no payload
// de rede antes do reveal — só a lista de quem já respondeu.

import { AppError } from '../errors.js';
import { connectedOrder, drink, nameOf } from './helpers.js';

export const GRUPO_KEYS = ['eu_nunca', 'mais_provavel', 'termometro', 'quem_disse'];

const GOLOS = {
  eu_nunca: 1, // por cada "já"
  mais_provavel: 1, // por voto recebido (com teto)
  termometro: 2, // extremos
  quem_disse: 1, // por erro
};
const MAIS_PROVAVEL_MAX = 3; // teto de golos para não destruir ninguém numa mesa grande
const QUEM_DISSE_AUTOR = 2; // se toda a gente acertar, o autor paga

/** Quem tem direito a responder nesta ronda (o autor do quem_disse não vota). */
export function grupoVoters(room) {
  const r = room.game?.round;
  return connectedOrder(room).filter((p) => p.id !== r?.authorId);
}

/**
 * Prepara a ronda. Para o `quem_disse` o prompt vem das perguntas da preparação
 * (conteúdo grátis e sempre pessoal); devolve false se ainda não houver nenhuma.
 */
export function setupGrupo(room, round, kind, prompt) {
  round.substate = 'collecting';
  round.answers = {}; // playerId -> resposta (PRIVADO até revelar)
  round.revealed = false;
  round.result = null;

  if (kind === 'quem_disse') {
    const g = room.game;
    const pool = g.questions.filter((q) => !q.usedAsQuemDisse);
    const source = pool.length ? pool : g.questions;
    if (!source.length) return false; // ninguém escreveu perguntas → o chamador troca de tipo
    const q = source[Math.floor(Math.random() * source.length)];
    q.usedAsQuemDisse = true;
    round.authorId = q.authorPlayerId; // NUNCA serializado antes do reveal
    round.prompt = { text: q.text };
    return true;
  }

  round.prompt = { text: prompt?.text || '—' };
  return true;
}

function requireGrupo(room) {
  const g = room.game;
  const r = g?.round;
  if (!g || !GRUPO_KEYS.includes(r?.gameTypeKey)) throw new AppError('Não há ronda de grupo ativa.');
  return r;
}

/** Uma resposta de um jogador. Quando todos responderem, revela sozinho. */
export function grupoAnswer(room, playerId, value) {
  const r = requireGrupo(room);
  if (r.substate !== 'collecting') throw new AppError('As respostas já fecharam.');
  const voters = grupoVoters(room);
  if (!voters.some((p) => p.id === playerId)) throw new AppError('Não podes responder nesta ronda.');
  if (r.answers[playerId] !== undefined) throw new AppError('Já respondeste.');

  const kind = r.gameTypeKey;
  let clean;
  if (kind === 'eu_nunca') {
    if (!['ja', 'nunca'].includes(value)) throw new AppError('Resposta inválida.');
    clean = value;
  } else if (kind === 'termometro') {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 10) throw new AppError('Escolhe um valor de 0 a 10.');
    clean = n;
  } else {
    // mais_provavel / quem_disse → o valor é um jogador
    const target = room.players.get(value);
    if (!target) throw new AppError('Escolhe um jogador válido.');
    if (kind === 'quem_disse' && value === playerId) throw new AppError('Não podes votar em ti.');
    clean = value;
  }

  r.answers[playerId] = clean;
  if (voters.every((p) => r.answers[p.id] !== undefined)) revealGrupo(room);
  return r;
}

/** Fecha a ronda e aplica os golos. Idempotente. */
export function revealGrupo(room) {
  const g = room.game;
  const r = g.round;
  if (!r || r.revealed) return r;
  const kind = r.gameTypeKey;
  const answers = r.answers;
  const named = (id) => ({ id, name: nameOf(room, id) });

  if (kind === 'eu_nunca') {
    const drinkers = Object.entries(answers).filter(([, v]) => v === 'ja').map(([id]) => id);
    for (const id of drinkers) drink(g, id, GOLOS.eu_nunca);
    r.result = { kind, answers, drinkers: drinkers.map(named), golos: GOLOS.eu_nunca };
  } else if (kind === 'mais_provavel') {
    const tally = {};
    for (const v of Object.values(answers)) tally[v] = (tally[v] || 0) + 1;
    const max = Math.max(0, ...Object.values(tally));
    const winners = Object.keys(tally).filter((id) => tally[id] === max);
    const golos = Math.min(MAIS_PROVAVEL_MAX, max);
    for (const id of winners) drink(g, id, golos);
    r.result = { kind, answers, tally, winners: winners.map(named), golos };
  } else if (kind === 'termometro') {
    const vals = Object.values(answers);
    const hi = Math.max(...vals, -1);
    const lo = Math.min(...vals, 11);
    const hottest = Object.keys(answers).filter((id) => answers[id] === hi);
    const coldest = Object.keys(answers).filter((id) => answers[id] === lo);
    // Se toda a gente escolheu o mesmo não há extremos — ninguém bebe.
    const drinkers = hi === lo ? [] : [...new Set([...hottest, ...coldest])];
    for (const id of drinkers) drink(g, id, GOLOS.termometro);
    r.result = {
      kind,
      answers,
      hi: vals.length ? hi : null,
      lo: vals.length ? lo : null,
      hottest: hi === lo ? [] : hottest.map(named),
      coldest: hi === lo ? [] : coldest.map(named),
      golos: GOLOS.termometro,
    };
  } else {
    // quem_disse
    const wrong = Object.keys(answers).filter((id) => answers[id] !== r.authorId);
    const allRight = Object.keys(answers).length > 0 && wrong.length === 0;
    if (allRight) drink(g, r.authorId, QUEM_DISSE_AUTOR);
    else for (const id of wrong) drink(g, id, GOLOS.quem_disse);
    r.result = {
      kind,
      answers,
      authorId: r.authorId,
      authorName: nameOf(room, r.authorId),
      wrong: wrong.map(named),
      allRight,
      golos: allRight ? QUEM_DISSE_AUTOR : GOLOS.quem_disse,
    };
  }

  r.revealed = true;
  r.substate = 'reveal';
  r.status = 'resolved';
  return r;
}

/** Reveal forçado pelo host/spinner (alguém saiu, alguém não responde). */
export function grupoForceReveal(room) {
  const r = requireGrupo(room);
  if (r.revealed) throw new AppError('Já foi revelado.');
  return revealGrupo(room);
}

export function serializeGrupo(base, r) {
  base.substate = r.substate;
  base.revealed = !!r.revealed;
  // Antes do reveal só se sabe QUEM já respondeu — nunca o quê (nem o autor).
  base.answeredIds = Object.keys(r.answers || {});
  base.result = r.revealed ? r.result : null;
}
