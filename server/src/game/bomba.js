// ----- Bomba-Relógio ---------------------------------------------------------
//
// O tipo que faltava ao catálogo: barulho físico.
//
// Dezoito tipos e quase todos se jogam com a mesa sentada a olhar para um ecrã.
// A Bomba é a única coisa que põe toda a gente a mexer ao mesmo tempo e a falar
// alto — passa-se o telemóvel (ou a vez) à volta, cada um diz um item do tema, e
// quem estiver com ela na mão quando rebentar perde uma vida.
//
// O PAVIO É SECRETO
//
// A duração está no servidor e nunca vai no payload. É a regra inteira do jogo:
// se a mesa soubesse quanto falta, isto era um cronómetro — e um cronómetro
// visível faz o contrário do que se quer, porque toda a gente espera pelo fim em
// vez de despachar. O que o cliente recebe é só "está a arder".
//
// QUEM SEGURA DEMAIS, REBENTA
//
// A explosão é verificada em cada passagem: se o pavio já acabou quando alguém
// passa, rebenta em quem a tinha. Não há tique do servidor a decidir sozinho —
// isso obrigava a timers por sala, e um timer que sobrevive a um reinício é uma
// classe de bugs que este projeto não precisa de ter. O auto-resolve trata do
// caso em que ninguém passa (`autoresolve.js`).

import { AppError } from '../errors.js';
import { connectedOrder, perdeVida, nameOf, shuffle } from './helpers.js';

// Janela do pavio. O mínimo tem de dar tempo a duas ou três passagens (senão
// rebenta sempre no primeiro e não há jogo); o máximo é o ponto a partir do qual
// a mesa começa a desconfiar de que se esqueceram dela.
export const PAVIO_MIN_MS = 18000;
export const PAVIO_MAX_MS = 62000;

export function setupBomba(round, prompt, room) {
  round.tema = prompt?.text || 'Marcas de cerveja';
  // Inteiro, e não o float que o `random` dá: `acesaEm` é calculado a partir de
  // `Date.now()` (na ordem dos 1e12) e um pavio fracionário perdia os bits de
  // baixo na subtração, deixando o "já rebentou?" a falhar por milésimos —
  // milésimos que, num tique de bots, davam voltas infinitas.
  round.pavioMs = Math.round(PAVIO_MIN_MS + Math.random() * (PAVIO_MAX_MS - PAVIO_MIN_MS)); // SERVER-SIDE
  round.acesaEm = Date.now();
  round.holderId = round.currentPlayerId;
  round.passagens = 0;
  round.ordem = shuffle(connectedOrder(room).map((p) => p.id)); // não é a ordem da mesa
  round.substate = 'a_arder'; // a_arder → rebentou
  round.result = null;
}

function requireBomba(room) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'bomba' || !r) throw new AppError('Não há bomba nenhuma.');
  return r;
}

function rebenta(room, r, quemId) {
  const efeito = perdeVida(room, quemId, { motivo: 'ficou com a bomba', emoji: '💣' });
  r.substate = 'rebentou';
  r.status = 'resolved';
  r.result = {
    quemId,
    quemName: nameOf(room, quemId),
    passagens: r.passagens,
    segundos: Math.round(r.pavioMs / 1000), // só AGORA se revela quanto era
  };
  return { round: r, rebentou: true, efeito };
}

/**
 * Passa a bomba ao próximo. Se o pavio já tinha acabado, rebenta em quem a
 * segurava — a verificação é aqui, no momento em que ele larga.
 */
export function bombaPassa(room, playerId) {
  const r = requireBomba(room);
  if (r.substate !== 'a_arder') throw new AppError('A bomba já rebentou.');
  if (r.holderId !== playerId) throw new AppError('A bomba não está contigo.');

  if (Date.now() - r.acesaEm >= r.pavioMs) return rebenta(room, r, playerId);

  const vivos = r.ordem.filter((id) => {
    const p = room.players.get(id);
    return p && p.connected && !p.eliminated;
  });
  if (vivos.length < 2) return rebenta(room, r, playerId); // ficou sozinho com ela
  const i = vivos.indexOf(playerId);
  r.holderId = vivos[(i + 1) % vivos.length];
  r.passagens += 1;
  return { round: r, rebentou: false };
}

/** O pavio já acabou? (para o auto-resolve rebentar em quem a tem na mão). */
export function bombaExpirou(room) {
  const r = room.game?.round;
  if (!r || room.game.phase !== 'bomba' || r.substate !== 'a_arder') return false;
  return Date.now() - r.acesaEm >= r.pavioMs;
}

/** Auto-resolve: ninguém passou e o pavio acabou. Rebenta em quem a segurava. */
export function bombaEstoira(room) {
  const r = requireBomba(room);
  if (r.substate !== 'a_arder') return null;
  return rebenta(room, r, r.holderId);
}

/** O pavio (`pavioMs`) NUNCA sai daqui — é a regra inteira do jogo. */
export function serializeBomba(base, r) {
  base.tema = r.tema;
  base.holderId = r.holderId;
  base.passagens = r.passagens;
  base.substate = r.substate;
  base.result = r.result || null;
  return base;
}
