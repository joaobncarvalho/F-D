// ----- Leilão ----------------------------------------------------------------
//
// Sai um desafio pesado. Ninguém o recebe: a mesa LICITA para não o fazer.
//
// Cada um escreve, em segredo, quantos goles está disposto a beber para escapar.
// Quem licitar MENOS ficou provado que não queria assim tanto escapar — é ele que
// faz o desafio, e não bebe nada. Todos os outros bebem exatamente o que
// licitaram.
//
// PORQUE É QUE ISTO FUNCIONA
//
// É o primeiro tipo do jogo em que a decisão de toda a gente conta ao mesmo tempo
// e em que o custo é escolhido pelo próprio. Não há "a vez de alguém": há oito
// pessoas a tentar adivinhar-se umas às outras. E o desafio, que normalmente
// seria um castigo, passa a ser a saída barata — o que inverte a leitura da mesa
// toda e é exatamente o que faz uma mesa gritar.
//
// A licitação é SECRETA até fechar, pela mesma razão dos palpites e do veredito:
// se o primeiro número se visse, os outros alinhavam por ele e o leilão acabava.
//
// Empates no mínimo resolvem-se à sorte entre os empatados. Podia ser "faz quem
// licitou mais cedo", mas isso premiava quem carrega depressa em vez de quem
// arriscou — e a mesa não vê a diferença.

import { AppError } from '../errors.js';
import { connectedOrder, drink, nameOf } from './helpers.js';

export const MAX_LICITACAO = 5;

export function setupLeilao(room, round, prompt) {
  round.desafio = prompt?.text || 'Faz uma imitação de alguém desta mesa até adivinharem quem é.';
  round.licitacoes = {}; // playerId -> goles (SECRETO até fechar)
  round.substate = 'licitar'; // licitar → result
  round.result = null;
  round.participantes = connectedOrder(room).map((p) => p.id);
  return round;
}

/** Quem ainda pode licitar (ligado, não eliminado e no leilão). */
export function licitantes(room, r) {
  return connectedOrder(room).filter((p) => r.participantes.includes(p.id));
}

export function leilaoLicita(room, playerId, golos) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'leilao' || !r) throw new AppError('Não há leilão ativo.');
  if (r.substate !== 'licitar') throw new AppError('O leilão já fechou.');
  if (!r.participantes.includes(playerId)) throw new AppError('Não estás neste leilão.');
  if (r.licitacoes[playerId] !== undefined) throw new AppError('Já licitaste.');
  const n = Number(golos);
  if (!Number.isInteger(n) || n < 0 || n > MAX_LICITACAO) throw new AppError('Licitação inválida.');
  r.licitacoes[playerId] = n;

  if (licitantes(room, r).every((p) => r.licitacoes[p.id] !== undefined)) return fecha(room);
  return { round: r, fechado: false };
}

/**
 * Fecha o leilão. Quem licitou menos faz o desafio (e não bebe); os outros
 * bebem o que licitaram.
 */
export function fecha(room) {
  const g = room.game;
  const r = g.round;
  if (r.substate !== 'licitar') return { round: r, fechado: false };
  const entradas = Object.entries(r.licitacoes);
  if (!entradas.length) {
    // Ninguém licitou (auto-resolve com a mesa toda distraída): não se inventa
    // um perdedor — o leilão deu em nada, como daria à mesa.
    r.substate = 'result';
    r.status = 'resolved';
    r.result = { vazio: true, executorId: null, executorName: null, pagantes: [], desafio: r.desafio };
    return { round: r, fechado: true };
  }

  const minimo = Math.min(...entradas.map(([, n]) => n));
  const empatados = entradas.filter(([, n]) => n === minimo).map(([id]) => id);
  const executorId = empatados[Math.floor(Math.random() * empatados.length)];

  const pagantes = [];
  for (const [id, n] of entradas) {
    if (id === executorId || n <= 0) continue;
    drink(g, id, n);
    pagantes.push({ id, name: nameOf(room, id), golos: n });
  }

  r.substate = 'result';
  r.status = 'resolved';
  r.result = {
    vazio: false,
    executorId,
    executorName: nameOf(room, executorId),
    minimo,
    empate: empatados.length > 1,
    pagantes,
    desafio: r.desafio,
  };
  return { round: r, fechado: true };
}

/** As licitações NÃO vão no payload antes de fechar — só quem já licitou. */
export function serializeLeilao(base, r) {
  base.desafio = r.desafio;
  base.substate = r.substate;
  base.maxLicitacao = MAX_LICITACAO;
  base.jaLicitaram = Object.keys(r.licitacoes || {});
  base.participantes = r.participantes || [];
  base.result = r.substate === 'result' ? r.result : null;
  return base;
}
