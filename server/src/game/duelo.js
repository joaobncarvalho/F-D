// ----- Duelo 1v1 -------------------------------------------------------------
//
// A roda escolhe o jogador da vez e sorteia-lhe um adversário; sorteia também um
// mini-duelo simbólico (par-ímpar / cara-ou-coroa / braço-de-ferro). O duelo
// joga-se à mesa; a app só regista o vencedor — qualquer um dos dois duelistas
// (ou o host) marca. Quem perde bebe.

import { AppError } from '../errors.js';
import { DUELO_GAMES } from '../content/prompts.data.js';
import { connectedOrder, drink, nameOf } from './helpers.js';

const PERDEDOR_GOLOS = 3;

/** Sorteia adversário + mini-duelo. Devolve false se não houver adversário. */
export function setupDuelo(room, round) {
  const rivals = connectedOrder(room).filter((p) => p.id !== round.currentPlayerId);
  if (!rivals.length) return false;
  const rival = rivals[Math.floor(Math.random() * rivals.length)];
  const duel = DUELO_GAMES[Math.floor(Math.random() * DUELO_GAMES.length)];
  round.opponentId = rival.id;
  round.opponentName = rival.name;
  round.duel = { key: duel.key, emoji: duel.emoji, label: duel.label, desc: duel.desc };
  round.substate = 'duelling'; // duelling → result
  round.result = null;
  return true;
}

/** Regista o vencedor do duelo (só os duelistas ou o host). O perdedor bebe. */
export function dueloResult(room, playerId, winnerId) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'duelo' || !r) throw new AppError('Não há duelo ativo.');
  if (r.substate !== 'duelling') throw new AppError('O duelo já terminou.');
  const p = room.players.get(playerId);
  const duelists = [r.currentPlayerId, r.opponentId];
  if (!p || (!p.isHost && !duelists.includes(playerId)))
    throw new AppError('Só os duelistas (ou o host) registam o resultado.');
  if (!duelists.includes(winnerId)) throw new AppError('O vencedor tem de ser um dos duelistas.');

  const loserId = duelists.find((id) => id !== winnerId);
  drink(g, loserId, PERDEDOR_GOLOS);
  r.substate = 'result';
  r.status = 'resolved';
  r.result = {
    winnerId,
    winnerName: nameOf(room, winnerId),
    loserId,
    loserName: nameOf(room, loserId),
    golos: PERDEDOR_GOLOS,
  };
  return r;
}

export function serializeDuelo(base, r) {
  base.opponentId = r.opponentId || null;
  base.opponentName = r.opponentName || null;
  base.duel = r.duel || null;
  base.substate = r.substate;
  base.result = r.result || null;
}
