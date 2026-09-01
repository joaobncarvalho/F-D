// ----- Mímica / Desenho Rápido ----------------------------------------------
//
// O jogador da vez recebe uma palavra PRIVADA (canal `mimica_word`, como o Boca
// Calada faz com as perguntas dirigidas) e tem de a mimar ou desenhar fora da
// app. Se ninguém acertar, bebe. A palavra só entra no broadcast no fim — antes
// disso vazá-la estragava o jogo (mesma regra dos segredos/vasco).

import { AppError } from '../errors.js';
import { drink } from './helpers.js';

const SECONDS = 60;
const FALHOU_GOLOS = 2;
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
  round.substate = 'ready'; // ready → running → result
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
  if (!p || (!p.isHost && playerId !== r.currentPlayerId))
    throw new AppError('Só quem está à vez (ou o host) pode fazer isso.');
  return r;
}

export function mimicaStart(room, playerId) {
  const r = requireMimica(room, playerId, 'ready');
  r.substate = 'running';
  return r;
}

/** Veredicto do grupo: acertaram ou não. Se ninguém acertou, o mimo bebe. */
export function mimicaResolve(room, playerId, guessed) {
  const r = requireMimica(room, playerId, 'running');
  const ok = !!guessed;
  if (!ok) drink(room.game, r.currentPlayerId, FALHOU_GOLOS);
  r.substate = 'result';
  r.status = 'resolved';
  r.result = { guessed: ok, word: r.secretWord, golos: ok ? 0 : FALHOU_GOLOS };
  return r;
}

export function serializeMimica(base, r) {
  base.mode = r.mode;
  base.modeLabel = r.modeLabel;
  base.modeHint = r.modeHint;
  base.seconds = r.seconds;
  base.substate = r.substate;
  base.result = r.substate === 'result' ? r.result : null; // a palavra só aparece no fim
}
