// ----- Categoria Relâmpago --------------------------------------------------
//
// Mostra uma categoria; o jogador da vez despeja itens em voz alta (fora da app)
// enquanto o cronómetro corre. No fim, ele (ou o host) marca se aguentou ou se
// travou — travar custa golos. O cronómetro é do CLIENTE (pressão visual); o
// servidor só guarda o arranque e o veredicto, como no resto do jogo.

import { AppError } from '../errors.js';
import { drink } from './helpers.js';

const SECONDS = 8; // janela curta o suficiente para dar pânico e não arrastar a mesa
const TRAVOU_GOLOS = 2;

export function setupRelampago(round, prompt) {
  round.category = prompt?.text || 'Coisas que se bebem';
  round.seconds = SECONDS;
  round.substate = 'ready'; // ready → running → result
  round.result = null;
}

function requireRelampago(room, playerId, substate) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'relampago' || !r) throw new AppError('Não há categoria ativa.');
  if (r.substate !== substate) throw new AppError('Não é altura disso.');
  const p = room.players.get(playerId);
  if (!p || (!p.isHost && playerId !== r.currentPlayerId))
    throw new AppError('Só quem está à vez (ou o host) pode fazer isso.');
  return r;
}

/** Arranca a contagem — todos os ecrãs acendem o cronómetro ao mesmo tempo. */
export function relampagoStart(room, playerId) {
  const r = requireRelampago(room, playerId, 'ready');
  r.substate = 'running';
  r.startedAt = Date.now();
  return r;
}

/** Veredicto: aguentou (nada) ou travou (bebe). */
export function relampagoResolve(room, playerId, survived) {
  const r = requireRelampago(room, playerId, 'running');
  const ok = !!survived;
  if (!ok) drink(room.game, r.currentPlayerId, TRAVOU_GOLOS);
  r.substate = 'result';
  r.status = 'resolved';
  r.result = { survived: ok, golos: ok ? 0 : TRAVOU_GOLOS };
  return r;
}

export function serializeRelampago(base, r) {
  base.category = r.category;
  base.seconds = r.seconds;
  base.substate = r.substate;
  base.result = r.result || null;
}
