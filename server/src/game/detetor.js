// ----- Detetor de Mentiras ---------------------------------------------------
//
// Pergunta forte ao jogador da vez. Ele responde EM VOZ ALTA e pode mentir à
// vontade — o que marca no telemóvel é se aquilo era verdade ou não, e essa
// marca fica no servidor. Depois a mesa vota: acreditou ou não.
//
// O QUE ISTO ACRESCENTA
//
// É o primeiro tipo em que MENTIR é uma jogada legítima e premiada. Em todos os
// outros, a app assume que as pessoas dizem a verdade e limita-se a distribuir
// castigos; aqui a app sabe a verdade, não a diz a ninguém, e paga a quem
// enganar a mesa. Isso muda a forma como se fala à volta da mesa durante um
// minuto inteiro — que é o que se anda a tentar comprar.
//
// A CONTA
//
//   quem vota mal          bebe 2
//   enganou a mesa TODA    +1 vida (é preciso ser bom)
//   a mesa TODA acertou    perde 1 vida (foi transparente de mais)
//
// Os dois extremos existem para o jogo não recompensar sempre a mesma jogada:
// mentir bem paga, mas ser lido por toda a gente custa — e no meio, que é onde
// quase todas as rondas caem, só a mesa é que paga os enganos.
//
// A marca (`verdade`) NUNCA vai no payload antes do reveal. É a regra de ouro do
// anonimato deste projeto aplicada a outra coisa: o que o servidor sabe e o
// cliente não pode saber.

import { AppError } from '../errors.js';
import { connectedOrder, drink, perdeVida, ganhaVida, nameOf } from './helpers.js';

export const CUSTO_VOTO_ERRADO = 2;

export function setupDetetor(round, prompt) {
  round.pergunta = prompt?.text || 'Conta a maior mentira que já disseste a alguém desta mesa.';
  round.verdade = null; // true = era verdade · SERVER-SIDE até ao reveal
  round.votos = {}; // playerId -> 'acredito' | 'mentira' (secreto até fechar)
  round.substate = 'responder'; // responder → votar → result
  round.result = null;
}

function requireDetetor(room, substate) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'detetor' || !r) throw new AppError('Não há Detetor ativo.');
  if (substate && r.substate !== substate) throw new AppError('Não é altura disso.');
  return r;
}

/**
 * Quem está à vez marca, em segredo, se o que disse era verdade. Só depois disto
 * é que a mesa vota — se votassem primeiro, ele podia marcar para dar jeito.
 */
export function detetorMarca(room, playerId, eraVerdade) {
  const r = requireDetetor(room, 'responder');
  if (r.currentPlayerId !== playerId) throw new AppError('Não é a tua vez.');
  r.verdade = !!eraVerdade;
  r.substate = 'votar';
  return r;
}

/** Quem pode votar: a mesa toda menos quem respondeu. */
export function eleitores(room, r) {
  return connectedOrder(room).filter((p) => p.id !== r.currentPlayerId);
}

export function detetorVota(room, playerId, valor) {
  const r = requireDetetor(room, 'votar');
  if (playerId === r.currentPlayerId) throw new AppError('Não podes votar em ti próprio.');
  const p = room.players.get(playerId);
  if (!p || p.eliminated) throw new AppError('Estás fora — só a ver.');
  if (r.votos[playerId]) throw new AppError('Já votaste.');
  r.votos[playerId] = valor === 'acredito' ? 'acredito' : 'mentira';

  if (eleitores(room, r).every((e) => r.votos[e.id])) return fecha(room);
  return { round: r, fechado: false };
}

export function fecha(room) {
  const g = room.game;
  const r = g.round;
  if (r.substate !== 'votar') return { round: r, fechado: false };
  const atorId = r.currentPlayerId;
  const certo = r.verdade ? 'acredito' : 'mentira';

  const acertaram = [];
  const falharam = [];
  for (const [id, v] of Object.entries(r.votos)) {
    const alvo = v === certo ? acertaram : falharam;
    alvo.push({ id, name: nameOf(room, id) });
  }
  for (const f of falharam) drink(g, f.id, CUSTO_VOTO_ERRADO);

  // Os extremos. Só contam se ALGUÉM votou — com a mesa em silêncio não há
  // proeza nenhuma a premiar nem transparência nenhuma a castigar.
  const votaram = acertaram.length + falharam.length;
  let efeito = null;
  let extremo = null;
  if (votaram > 0 && acertaram.length === 0) {
    efeito = ganhaVida(room, atorId);
    extremo = 'enganou_todos';
  } else if (votaram > 0 && falharam.length === 0) {
    efeito = perdeVida(room, atorId, { motivo: 'a mesa leu-o todo', emoji: '🔍' });
    extremo = 'lido_por_todos';
  }

  r.substate = 'result';
  r.status = 'resolved';
  r.result = {
    eraVerdade: !!r.verdade, // só AGORA
    atorId,
    atorName: nameOf(room, atorId),
    acertaram,
    falharam,
    custo: CUSTO_VOTO_ERRADO,
    extremo,
  };
  return { round: r, fechado: true, efeito };
}

/** A marca do ator nunca sai daqui antes do reveal — só quem já votou. */
export function serializeDetetor(base, r) {
  base.pergunta = r.pergunta;
  base.substate = r.substate;
  base.jaVotaram = Object.keys(r.votos || {});
  base.custoVotoErrado = CUSTO_VOTO_ERRADO;
  base.result = r.substate === 'result' ? r.result : null;
  return base;
}
