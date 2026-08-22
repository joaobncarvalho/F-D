// ----- Intrigas -------------------------------------------------------------
//
// Sai Intrigas → pergunta secreta só no ecrã de quem girou (acusador). Ele escolhe
// alguém (o acusado NÃO sabe a razão) → pedra-papel-tesoura → acusado perde bebe e
// nunca sabe; ganha e fica a saber. A razão nunca vai no broadcast (entrega privada).
//
// Extraído do game.js (comportamento idêntico). Depende só de ./helpers.js.

import { AppError } from '../errors.js';
import { drink } from './helpers.js';

const RPS_BEATS = { pedra: 'tesoura', papel: 'pedra', tesoura: 'papel' };

/** Prepara a ronda Intrigas no `round` (a razão é SERVER-SIDE, nunca no broadcast). */
export function setupIntrigas(round, reasonText) {
  round.reason = reasonText || 'Quem é mais provável?'; // SERVER-SIDE (nunca no broadcast)
  round.prompt = null;
  round.substate = 'choosing'; // 'choosing' | 'rps' | 'reveal'
  round.accusedId = null;
  round.accusedName = null;
  round.rps = {}; // playerId -> 'pedra'|'papel'|'tesoura'
  round.ties = 0;
  round.result = null;
}

/**
 * Intrigas — passo 1: quem girou (acusador) escolhe o "acusado".
 * O acusado NÃO sabe a razão. Passa a pedra-papel-tesoura.
 */
export function chooseTarget(room, accuserId, accusedId) {
  const g = room.game;
  if (!g || g.phase !== 'intrigas' || !g.round) throw new AppError('Não há Intrigas ativa.');
  if (g.round.substate !== 'choosing') throw new AppError('Já escolheste.');
  if (accuserId !== g.round.currentPlayerId) throw new AppError('Só quem girou pode escolher.');
  const accused = room.players.get(accusedId);
  if (!accused || !accused.connected || accused.eliminated) throw new AppError('Escolhe um jogador válido.');
  if (accusedId === accuserId) throw new AppError('Escolhe outra pessoa.');

  g.round.accusedId = accusedId;
  g.round.accusedName = accused.name;
  g.round.substate = 'rps';
  return g.round;
}

/**
 * Intrigas — passo 2: acusador e acusado jogam pedra-papel-tesoura.
 * Empate → repete. Acusado ganha → fica a saber a razão. Acusado perde → bebe
 * e nunca saberá. Devolve metadados para o socket.js tratar da entrega privada.
 */
export function submitRps(room, playerId, move) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'intrigas' || !r) throw new AppError('Não há Intrigas ativa.');
  if (r.substate !== 'rps') throw new AppError('Não é altura de jogar.');
  if (playerId !== r.currentPlayerId && playerId !== r.accusedId)
    throw new AppError('Não estás neste duelo.');
  if (!RPS_BEATS[move]) throw new AppError('Jogada inválida.');

  r.rps[playerId] = move;
  const aMove = r.rps[r.currentPlayerId]; // acusador
  const bMove = r.rps[r.accusedId]; // acusado
  if (!aMove || !bMove) return { round: r, resolved: false };

  if (aMove === bMove) {
    r.rps = {}; // empate → repete
    r.ties = (r.ties || 0) + 1;
    return { round: r, resolved: false, tie: true };
  }

  const accusedWon = RPS_BEATS[bMove] === aMove;
  r.substate = 'reveal';
  if (accusedWon) {
    r.result = { accusedWon: true, accusedLearns: true, drinker: null };
  } else {
    drink(g, r.accusedId, 1);
    r.result = { accusedWon: false, accusedLearns: false, drinker: { id: r.accusedId, name: r.accusedName } };
  }
  return { round: r, resolved: true, accusedWon, accusedId: r.accusedId, reason: r.reason };
}

/** Preenche `base` com os campos públicos de Intrigas (a razão nunca vai no broadcast). */
export function serializeIntrigas(base, r) {
  base.substate = r.substate; // 'choosing' | 'rps' | 'reveal'
  base.accusedId = r.accusedId || null;
  base.accusedName = r.accusedName || null;
  base.rpsSubmitted = Object.keys(r.rps || {}); // quem já jogou (não o quê)
  base.ties = r.ties || 0;
  base.result = r.substate === 'reveal' ? r.result : null;
  // base.prompt fica null — a razão nunca vai no broadcast (entrega privada)
}
