// ----- Roleta Russa de Perguntas --------------------------------------------
//
// Pergunta embaraçosa ao jogador da vez. Pode responder (paga só o que já
// acumulou) ou passar — e cada passe custa mais que o anterior (1, 2, 3 golos),
// com pergunta nova a seguir. Ao terceiro passe a roleta "dispara": paga tudo e
// a ronda acaba na mesma.

import { AppError } from '../errors.js';
import * as repo from '../repo.js';
import { drink } from './helpers.js';

const MAX_PASSES = 3;

export function setupRoleta(round, prompt) {
  round.question = prompt?.text || 'Confessa a maior mentira que já contaste.';
  round.passes = 0;
  round.tab = 0; // golos acumulados pelos passes
  round.substate = 'asking'; // asking → result
  round.result = null;
}

function requireRoleta(room, playerId) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'roleta' || !r) throw new AppError('Não há pergunta ativa.');
  if (r.substate !== 'asking') throw new AppError('A roleta já parou.');
  if (r.currentPlayerId !== playerId) throw new AppError('Não é a tua vez.');
  return r;
}

function finish(room, r, outcome) {
  if (r.tab > 0) drink(room.game, r.currentPlayerId, r.tab);
  r.substate = 'result';
  r.status = 'resolved';
  r.result = { outcome, golos: r.tab, passes: r.passes, question: r.question };
  return r;
}

/** Responde à pergunta: paga o que acumulou nos passes e acaba. */
export function roletaAnswer(room, playerId) {
  const r = requireRoleta(room, playerId);
  return finish(room, r, 'respondeu');
}

/** Passa: o preço sobe (1, 2, 3…) e sai pergunta nova — até a roleta disparar. */
export async function roletaPass(room, playerId) {
  const r = requireRoleta(room, playerId);
  r.passes += 1;
  r.tab += r.passes; // o passe nº N custa N golos
  if (r.passes >= MAX_PASSES) return finish(room, r, 'estourou');
  const next = await repo.getRandomPrompt('roleta_russa', room.game.intensity);
  if (next?.text) r.question = next.text;
  return r;
}

export function serializeRoleta(base, r) {
  base.question = r.question;
  base.passes = r.passes;
  base.tab = r.tab;
  base.nextCost = r.passes + 1;
  base.maxPasses = MAX_PASSES;
  base.substate = r.substate;
  base.result = r.result || null;
}
