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
  // O cara-ou-coroa joga-se DENTRO da app (a moeda é lançada aqui); os outros
  // resolvem-se à mesa e a app só regista quem ganhou.
  round.substate = duel.key === 'cara_coroa' ? 'calling' : 'duelling'; // → result
  round.coin = null;
  round.result = null;
  return true;
}

/** Fecha o duelo: quem perde bebe. Partilhado pelo veredicto manual e pela moeda. */
function fecharDuelo(room, r, winnerId) {
  const g = room.game;
  const loserId = [r.currentPlayerId, r.opponentId].find((id) => id !== winnerId);
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

/**
 * Cara ou Coroa: quem está à vez escolhe a face, a app lança a moeda.
 * Acertar ganha; falhar dá a vitória ao adversário — sem discussões à mesa.
 */
export function dueloCall(room, playerId, call) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'duelo' || !r) throw new AppError('Não há duelo ativo.');
  if (r.substate !== 'calling') throw new AppError('Não é altura de escolher.');
  if (playerId !== r.currentPlayerId) throw new AppError('Escolhe quem lançou o duelo.');
  if (!['cara', 'coroa'].includes(call)) throw new AppError('Escolhe cara ou coroa.');

  const face = Math.random() < 0.5 ? 'cara' : 'coroa';
  const winnerId = face === call ? r.currentPlayerId : r.opponentId;
  r.coin = { call, face, callerId: r.currentPlayerId };
  return fecharDuelo(room, r, winnerId);
}

/** Regista o vencedor do duelo (só os duelistas ou o host). O perdedor bebe. */
export function dueloResult(room, playerId, winnerId) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'duelo' || !r) throw new AppError('Não há duelo ativo.');
  if (r.substate === 'calling') throw new AppError('Falta escolher cara ou coroa.');
  if (r.substate !== 'duelling') throw new AppError('O duelo já terminou.');
  const p = room.players.get(playerId);
  const duelists = [r.currentPlayerId, r.opponentId];
  // Só os duelistas registam o resultado. O host tem "saltar vez" se isto
  // encravar — o que não pode é decidir um duelo em que não está.
  if (!p || !duelists.includes(playerId))
    throw new AppError('Só os duelistas registam o resultado.');
  if (!duelists.includes(winnerId)) throw new AppError('O vencedor tem de ser um dos duelistas.');

  return fecharDuelo(room, r, winnerId);
}

export function serializeDuelo(base, r) {
  base.opponentId = r.opponentId || null;
  base.opponentName = r.opponentName || null;
  base.duel = r.duel || null;
  base.substate = r.substate;
  base.coin = r.coin || null; // { call, face } — o cliente anima a moeda até esta face
  base.result = r.result || null;
}
