// F&D — A Conta: dívida, transferência e herança.
//
// O PROBLEMA
//
// Tudo no F&D resolve-se dentro da ronda. Aceitas ou recusas, bebes ou não
// bebes, e na ronda seguinte não sobra nada — a não ser um número nas
// estatísticas que ninguém vê antes do fim. Não há NADA que uma pessoa carregue
// consigo pela noite fora, e por isso não há dívidas, favores nem contas por
// ajustar: as três coisas de que uma mesa de amigos vive.
//
// A IDEIA
//
// Um gole que se pode adiar. Quem não quer beber agora fica a DEVER — com juro —
// e a dívida fica à vista de toda a gente, no ecrã, a noite inteira. A partir daí
// há três movimentos, e é a existência dos três que faz disto um sistema em vez
// de um contador:
//
//   ADIAR       não bebes agora; deves mais do que devias (o juro).
//   TRANSFERIR  alguém assume a tua conta e ganha uma vida por isso. É uma
//               troca real — vida contra goles — por isso há mesmo negociação
//               na mesa, e não uma esmola.
//   HERDAR      quem é eliminado escolhe a quem deixa a conta. É o último ato
//               de quem sai, e resolve o pior momento de um jogo de eliminação:
//               a pessoa que sai deixa de ser irrelevante no instante em que sai.
//
// A CONTA FECHA
//
// Uma dívida que nunca vence é decoração. Fecha em dois sítios: no fim da noite
// (o ecrã final mostra a conta de cada um) e sempre que cair o evento do
// Cobrador. Sem isto, adiar seria uma forma gratuita de nunca beber.
//
// SEGURANÇA
//
// Adiar NUNCA aumenta o que se bebe naquele momento — é o contrário, adia. O
// juro existe para adiar ter um preço, mas o preço é pago no fim, com o grupo
// a olhar, e uma dívida grande é para ser negociada (transferida, herdada), não
// para ser bebida de uma vez. É por isso que a transferência dá uma VIDA a quem
// assume: o sistema empurra as contas para quem está inteiro.

import { AppError } from '../errors.js';
import { drink, ganhaVida, nameOf, connectedOrder } from './helpers.js';

/** Quanto custa adiar um gole: o gole em si mais o juro. */
export const JURO = 2;

/** Teto da conta de uma pessoa. Acima disto, adiar deixa de estar disponível. */
export const TETO = 10;

/** A conta de um jogador (0 se não deve nada). */
export function deve(game, playerId) {
  return game?.dividas?.[playerId] || 0;
}

/** Todas as contas em aberto, já com nome, do maior devedor para o menor. */
export function contas(room) {
  const g = room.game;
  return Object.entries(g?.dividas || {})
    .filter(([, n]) => n > 0)
    .map(([id, golos]) => ({ id, name: nameOf(room, id) || '—', golos }))
    .sort((a, b) => b.golos - a.golos);
}

function soma(game, playerId, n) {
  const d = (game.dividas ||= {});
  d[playerId] = Math.max(0, (d[playerId] || 0) + n);
  if (!d[playerId]) delete d[playerId];
  return d[playerId] || 0;
}

/** Pode este jogador adiar agora? (o teto existe para a conta não virar piada) */
export function podeAdiar(room, playerId) {
  const g = room.game;
  if (!g?.modifiers?.includes('divida')) return false;
  return deve(g, playerId) + JURO <= TETO;
}

/**
 * Adia o gole desta ronda. Devolve o que ficou a dever.
 *
 * Não mexe em vidas nem no estado da ronda de propósito: quem chama (o
 * `resolveAction`) é que sabe que isto é uma recusa, e a regra do custo da
 * recusa vive no modificadores.js. Aqui trata-se só da conta.
 */
export function adia(room, playerId) {
  const g = room.game;
  if (!podeAdiar(room, playerId)) throw new AppError('Não podes adiar mais — a conta está cheia.');
  return soma(g, playerId, JURO);
}

/**
 * Transfere a conta inteira de A para B. B ganha uma vida por a assumir.
 *
 * A transferência é sempre TOTAL. Deixar negociar metades transformava cada
 * ronda numa reunião — e a graça está em alguém dizer "eu levo com isso" em voz
 * alta, não em regatear números num telemóvel.
 */
export function transfere(room, deId, paraId) {
  const g = room.game;
  if (!g?.modifiers?.includes('divida')) throw new AppError('A Conta não está ligada nesta noite.');
  const golos = deve(g, deId);
  if (!golos) throw new AppError('Não tens conta nenhuma para passar.');
  if (deId === paraId) throw new AppError('Escolhe outra pessoa.');
  const para = room.players.get(paraId);
  if (!para || !para.connected || para.eliminated) throw new AppError('Escolhe um jogador válido.');
  if (deve(g, paraId) + golos > TETO) throw new AppError('A conta dessa pessoa não aguenta mais.');

  soma(g, deId, -golos);
  soma(g, paraId, golos);
  const vida = ganhaVida(room, paraId); // a troca: uma vida por assumir a conta
  return { golos, deName: nameOf(room, deId), paraName: para.name, vida };
}

/**
 * Alguém saiu com a conta por pagar → abre a HERANÇA.
 *
 * Devolve o estado a mostrar no ecrã, ou null se não houver nada a herdar (nem
 * conta, nem gente viva para a receber). É o chamador que decide quando o faz —
 * `abre` é puro no que toca a tempo.
 */
export function abreHeranca(room, deId) {
  const g = room.game;
  if (!g?.modifiers?.includes('divida')) return null;
  const golos = deve(g, deId);
  if (!golos) return null;
  const vivos = connectedOrder(room).filter((p) => p.id !== deId);
  if (!vivos.length) {
    soma(g, deId, -golos); // não sobrou ninguém: a conta morre com quem saiu
    return null;
  }
  g.heranca = {
    deId,
    deName: nameOf(room, deId),
    golos,
    candidatos: vivos.map((p) => p.id),
    herdeiroId: null,
  };
  return g.heranca;
}

/**
 * Quem saiu escolhe o herdeiro. Se `escolhidoId` vier vazio (auto-resolve),
 * sorteia-se entre os vivos — nunca se deixa a conta pendurada, porque um estado
 * aberto à espera de alguém que já saiu da sala trava a mesa toda.
 */
export function escolheHerdeiro(room, playerId, escolhidoId) {
  const g = room.game;
  const h = g?.heranca;
  if (!h) throw new AppError('Não há herança a decidir.');
  if (playerId && playerId !== h.deId) throw new AppError('Só quem saiu decide a herança.');
  let alvo = escolhidoId;
  if (!alvo || !h.candidatos.includes(alvo)) {
    alvo = h.candidatos[Math.floor(Math.random() * h.candidatos.length)];
  }
  soma(g, h.deId, -h.golos);
  soma(g, alvo, h.golos);
  h.herdeiroId = alvo;
  const resultado = { ...h, herdeiroName: nameOf(room, alvo) };
  g.heranca = null;
  return resultado;
}

/**
 * Fecha a conta de alguém: o que devia bebe-se agora e entra nas estatísticas.
 * @returns golos cobrados (0 se não devia nada)
 */
export function cobra(room, playerId) {
  const g = room.game;
  const golos = deve(g, playerId);
  if (!golos) return 0;
  soma(g, playerId, -golos);
  drink(g, playerId, golos);
  return golos;
}

/** Fecha as contas todas (evento do Cobrador, fim da noite). */
export function cobraTudo(room) {
  const antes = contas(room);
  for (const c of antes) cobra(room, c.id);
  return antes;
}

/** Para o payload de rede. */
export function serialize(room) {
  const g = room.game;
  if (!g?.modifiers?.includes('divida')) return null;
  return {
    juro: JURO,
    teto: TETO,
    contas: contas(room),
    heranca: g.heranca || null,
  };
}
