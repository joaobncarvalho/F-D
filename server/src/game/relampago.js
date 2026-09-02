// ----- Categoria Relâmpago --------------------------------------------------
//
// Mostra uma categoria; o jogador da vez despeja itens em voz alta (fora da app)
// enquanto o cronómetro corre. No fim, ele (ou o host) marca se aguentou ou se
// travou — travar custa golos. O cronómetro é do CLIENTE (pressão visual); o
// servidor só guarda o arranque e o veredicto, como no resto do jogo.

import { AppError } from '../errors.js';
import { perdeVida } from './helpers.js';
import * as palpites from './palpites.js';
import * as veredito from './veredito.js';

const SECONDS = 8; // janela curta o suficiente para dar pânico e não arrastar a mesa

export function setupRelampago(round, prompt) {
  round.category = prompt?.text || 'Coisas que se bebem';
  round.seconds = SECONDS;
  round.substate = 'ready'; // ready → running → veredito → result
  round.result = null;
}

function requireRelampago(room, playerId, substate) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'relampago' || !r) throw new AppError('Não há categoria ativa.');
  if (r.substate !== substate) throw new AppError('Não é altura disso.');
  const p = room.players.get(playerId);
  if (!p || playerId !== r.currentPlayerId)
    throw new AppError('Só quem está à vez pode fazer isso.');
  return r;
}

/** Arranca a contagem — todos os ecrãs acendem o cronómetro ao mesmo tempo. */
export function relampagoStart(room, playerId) {
  const r = requireRelampago(room, playerId, 'ready');
  r.substate = 'running';
  r.startedAt = Date.now();
  return r;
}

/**
 * Acabou o tempo → a MESA decide se ele aguentou.
 *
 * Qualquer jogador pode dar o tempo por terminado (quem está a despejar itens
 * está a olhar para a mesa, não para o ecrã), mas o servidor confirma pelo
 * relógio — só quem está à vez pode fechar antes do tempo, para desistir.
 */
export function relampagoTimeUp(room, playerId) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'relampago' || !r) throw new AppError('Não há categoria ativa.');
  if (r.substate !== 'running') throw new AppError('Não é altura disso.');
  if (!room.players.get(playerId)) throw new AppError('Jogador inválido.');
  const decorrido = (Date.now() - (r.startedAt || 0)) / 1000;
  if (playerId !== r.currentPlayerId && decorrido < r.seconds)
    throw new AppError('O tempo ainda não acabou.');

  r.substate = 'veredito';
  veredito.abre(r, [r.currentPlayerId], 'Aguentou até ao fim?');
  return r;
}

/** Fecha o veredito. Travar custa uma VIDA — o cronómetro tem de doer. */
export function relampagoVeredito(room) {
  const r = room.game?.round;
  if (!r?.veredito || r.veredito.fechado) return null;
  const res = veredito.fecha(room);
  const efeito = res.conseguiu ? null : perdeVida(room, r.currentPlayerId, { motivo: 'travou na categoria' });
  r.substate = 'result';
  r.status = 'resolved';
  palpites.resolve(room, res.conseguiu ? 'aguenta' : 'trava'); // fecha a aposta da plateia
  r.result = { survived: res.conseguiu, sim: res.sim, nao: res.nao, perdeuVida: !res.conseguiu };
  return { ...res, efeito, atorId: r.currentPlayerId };
}

export function serializeRelampago(base, r) {
  base.category = r.category;
  base.seconds = r.seconds;
  base.substate = r.substate;
  base.veredito = veredito.serialize(r);
  base.result = r.result || null;
}
