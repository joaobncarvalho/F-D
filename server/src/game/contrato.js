// ----- Contrato --------------------------------------------------------------
//
// Dois jogadores fazem um pacto por umas jogadas. Quem gira escolhe o parceiro,
// o jogo propõe o pacto, e os dois têm de aceitar. Se aceitarem, ganham os dois
// uma vida e o pacto fica no ecrã de toda a gente até expirar. Se um recusar, é
// esse que bebe.
//
// O QUE ISTO É, DE FACTO
//
// O Buddy que já existe ("bebes junto comigo") é um pacto de um lado só, imposto
// e imediato. Isto é o Buddy com as duas coisas que lhe faltavam: dura, e é
// preciso os dois quererem. Passa a haver aliados numa mesa que até aqui só
// tinha vítimas e plateia — e o pacto ser público é o que faz a mesa passar a
// ronda seguinte a tentar apanhá-los em falta.
//
// PORQUE É QUE ACEITAR PAGA
//
// Uma vida cada. Sem prémio, o cálculo era trivial (um pacto é sempre um risco
// acrescido, logo recusa-se sempre) e o tipo não existia. Com prémio, aceitar é
// uma aposta na outra pessoa — e é essa aposta que se quer ver a acontecer.
//
// CUMPRIR É POR HONRA
//
// Não há botão de "ele quebrou". É de propósito, e é a mesma regra das regras com
// duração que já existem no jogo (`activeRules`): a app enuncia, a mesa fiscaliza.
// Um botão de denúncia convidava ao troll, exigia uma votação para o validar, e
// punha a app a arbitrar uma coisa que só quem está na sala consegue ver.

import { AppError } from '../errors.js';
import { connectedOrder, drink, ganhaVida, nameOf } from './helpers.js';

/** Quantas jogadas dura um pacto aceite. */
export const DURACAO = 5;

/** Quanto bebe quem se recusa a assinar. */
export const CUSTO_RECUSA = 2;

/**
 * Monta a ronda. @returns false se não houver com quem pactuar.
 */
export function setupContrato(room, round, prompt) {
  const outros = connectedOrder(room).filter((p) => p.id !== round.currentPlayerId);
  if (!outros.length) return false;
  round.pacto = prompt?.text || 'Bebem sempre ao mesmo tempo: se um bebe, o outro acompanha.';
  round.parceiroId = null;
  round.parceiroName = null;
  round.assinaturas = {}; // playerId -> true | false
  round.substate = 'escolher'; // escolher → assinar → result
  round.result = null;
  return true;
}

function requireContrato(room, substate) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'contrato' || !r) throw new AppError('Não há contrato ativo.');
  if (substate && r.substate !== substate) throw new AppError('Não é altura disso.');
  return r;
}

/** Passo 1: quem girou escolhe com quem quer pactuar. */
export function contratoEscolhe(room, playerId, parceiroId) {
  const r = requireContrato(room, 'escolher');
  if (r.currentPlayerId !== playerId) throw new AppError('Só quem girou escolhe o parceiro.');
  const p = room.players.get(parceiroId);
  if (!p || !p.connected || p.eliminated) throw new AppError('Escolhe um jogador válido.');
  if (parceiroId === playerId) throw new AppError('Escolhe outra pessoa.');
  r.parceiroId = parceiroId;
  r.parceiroName = p.name;
  r.substate = 'assinar';
  return r;
}

const dupla = (r) => [r.currentPlayerId, r.parceiroId];

/** Passo 2: os dois assinam (ou não). Basta um recusar para o pacto cair. */
export function contratoAssina(room, playerId, aceita) {
  const r = requireContrato(room, 'assinar');
  if (!dupla(r).includes(playerId)) throw new AppError('Este contrato não é contigo.');
  if (r.assinaturas[playerId] !== undefined) throw new AppError('Já decidiste.');
  r.assinaturas[playerId] = !!aceita;

  if (dupla(r).every((id) => r.assinaturas[id] !== undefined)) return fecha(room);
  return { round: r, fechado: false };
}

/**
 * Auto-resolve: acabou o tempo. Quem não decidiu, recusou — e fecha-se.
 *
 * Existe como função própria (em vez de o autoresolve.js chamar `assina` duas
 * vezes) porque `assina` rejeita quem já decidiu, e o caso comum é justamente
 * um ter assinado e o outro não. Aqui a intenção fica escrita uma vez.
 */
export function contratoExpira(room) {
  const r = requireContrato(room, 'assinar');
  for (const id of dupla(r)) {
    if (r.assinaturas[id] === undefined) r.assinaturas[id] = false;
  }
  return fecha(room);
}

/**
 * Fecha o contrato.
 *
 * @returns { round, fechado, efeitos, regra } — `regra` é o texto a pôr nas
 *          `activeRules` (o game.js é que lá mexe: as regras ativas são dele).
 */
export function fecha(room) {
  const g = room.game;
  const r = g.round;
  if (r.substate !== 'assinar') return { round: r, fechado: false, efeitos: [], regra: null };
  const [aId, bId] = dupla(r);
  // Quem não decidiu a tempo recusou: um pacto que entra em vigor por silêncio
  // não é um pacto — e o auto-resolve não deve poder amarrar ninguém a nada.
  const assinaram = dupla(r).filter((id) => r.assinaturas[id] === true);
  const feito = assinaram.length === 2;

  const efeitos = [];
  const recusaram = [];
  if (feito) {
    for (const id of dupla(r)) {
      const e = ganhaVida(room, id);
      if (e) efeitos.push(e);
    }
  } else {
    for (const id of dupla(r)) {
      if (r.assinaturas[id] === true) continue; // quem assinou não paga a recusa do outro
      drink(g, id, CUSTO_RECUSA);
      recusaram.push({ id, name: nameOf(room, id) });
    }
  }

  r.substate = 'result';
  r.status = 'resolved';
  r.result = {
    feito,
    pacto: r.pacto,
    entre: dupla(r).map((id) => ({ id, name: nameOf(room, id) })),
    recusaram,
    custo: CUSTO_RECUSA,
    duracao: DURACAO,
  };
  return {
    round: r,
    fechado: true,
    efeitos,
    regra: feito ? { texto: `🤝 ${nameOf(room, aId)} + ${nameOf(room, bId)}: ${r.pacto}`, jogadas: DURACAO } : null,
  };
}

export function serializeContrato(base, r) {
  base.pacto = r.pacto;
  base.parceiroId = r.parceiroId || null;
  base.parceiroName = r.parceiroName || null;
  base.dupla = r.parceiroId ? dupla(r) : [];
  base.jaAssinaram = Object.keys(r.assinaturas || {}); // quem já decidiu, não o quê
  base.substate = r.substate;
  base.duracao = DURACAO;
  base.custoRecusa = CUSTO_RECUSA;
  base.result = r.substate === 'result' ? r.result : null;
  return base;
}
