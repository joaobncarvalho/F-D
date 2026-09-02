// ----- Mímica / Desenho Rápido ----------------------------------------------
//
// O jogador da vez recebe uma palavra PRIVADA (canal `mimica_word`, como o Boca
// Calada faz com as perguntas dirigidas) e tem de a mimar ou desenhar fora da
// app. Se ninguém acertar, bebe. A palavra só entra no broadcast no fim — antes
// disso vazá-la estragava o jogo (mesma regra dos segredos/vasco).

import { AppError } from '../errors.js';
import { perdeVida } from './helpers.js';
import * as veredito from './veredito.js';

const SECONDS = 60;
const MODES = [
  { key: 'mimica', label: 'Mímica', hint: 'Só gestos — nem uma palavra, nem sons.' },
  { key: 'desenho', label: 'Desenho Rápido', hint: 'Desenha num papel (ou no vidro embaciado). Sem letras nem números.' },
];

export function setupMimica(round, prompt) {
  const mode = MODES[Math.floor(Math.random() * MODES.length)];
  round.secretWord = prompt?.text || 'Ressaca'; // NUNCA serializado antes do fim
  round.mode = mode.key;
  round.modeLabel = mode.label;
  round.modeHint = mode.hint;
  round.seconds = SECONDS;
  round.substate = 'ready'; // ready → running → veredito → result
  round.result = null;
}

/** Palavra privada — só para quem está a mimar (entrega pelo socket). */
export function mimicaWord(room, playerId) {
  const r = room.game?.round;
  if (!r || r.gameTypeKey !== 'mimica' || r.currentPlayerId !== playerId) return null;
  return { word: r.secretWord, mode: r.mode, modeLabel: r.modeLabel, modeHint: r.modeHint };
}

function requireMimica(room, playerId, substate) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'mimica' || !r) throw new AppError('Não há mímica ativa.');
  if (r.substate !== substate) throw new AppError('Não é altura disso.');
  const p = room.players.get(playerId);
  if (!p || playerId !== r.currentPlayerId)
    throw new AppError('Só quem está à vez pode fazer isso.');
  return r;
}

export function mimicaStart(room, playerId) {
  const r = requireMimica(room, playerId, 'ready');
  r.substate = 'running';
  return r;
}

/**
 * Acabou o tempo → abre o veredito da MESA.
 *
 * Qualquer jogador pode dar o tempo por terminado, e não só quem está a mimar:
 * quem está a atuar tem as mãos ocupadas e o telemóvel na mesa. Não é uma
 * decisão — é só dizer que o cronómetro chegou ao fim, e o servidor confirma-o
 * pelo relógio antes de aceitar.
 */
export function mimicaTimeUp(room, playerId) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'mimica' || !r) throw new AppError('Não há mímica ativa.');
  if (r.substate !== 'running') throw new AppError('Não é altura disso.');
  if (!room.players.get(playerId)) throw new AppError('Jogador inválido.');
  // Quem está a mimar pode desistir antes do tempo; os outros só depois do fim.
  const decorrido = (Date.now() - (r.startedAt || 0)) / 1000;
  if (playerId !== r.currentPlayerId && decorrido < r.seconds)
    throw new AppError('O tempo ainda não acabou.');

  r.substate = 'veredito';
  veredito.abre(r, [r.currentPlayerId], 'A mesa percebeu a mímica?');
  return r;
}

/**
 * Fecha o veredito e aplica-o. Falhar custa uma VIDA (não uns goles): é isso
 * que faz o cronómetro meter medo — antes, falhar uma mímica saía mais barato
 * do que recusar um desafio, e por isso ninguém se esforçava.
 */
export function mimicaVeredito(room) {
  const r = room.game?.round;
  if (!r?.veredito || r.veredito.fechado) return null;
  const res = veredito.fecha(room);
  const efeito = res.conseguiu ? null : perdeVida(room, r.currentPlayerId, { motivo: 'falhou a mímica' });
  r.substate = 'result';
  r.status = 'resolved';
  r.result = { guessed: res.conseguiu, word: r.secretWord, sim: res.sim, nao: res.nao, perdeuVida: !res.conseguiu };
  return { ...res, efeito, atorId: r.currentPlayerId };
}

export function serializeMimica(base, r) {
  base.mode = r.mode;
  base.modeLabel = r.modeLabel;
  base.modeHint = r.modeHint;
  base.seconds = r.seconds;
  base.substate = r.substate;
  base.veredito = veredito.serialize(r);
  base.result = r.substate === 'result' ? r.result : null; // a palavra só aparece no fim
}
