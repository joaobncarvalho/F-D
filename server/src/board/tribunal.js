// ----- ⚖️ Tribunal da Injustiça (Tabuleiro) ----------------------------------
//
// Ir preso deixa de ser um RESULTADO e passa a ser uma ACUSAÇÃO.
//
// Até aqui, a prisão era a única coisa do tabuleiro à qual ninguém podia reagir:
// tirava-se uma pena do banco, lia-se, e pronto. Agora, na maior parte das
// vezes, há primeiro julgamento: o preso tem 90 segundos para defender uma tese
// indefensável e a mesa decide se ele safa. Os outros 20% são o azar de sempre —
// condenação direta, sem direito a falar.
//
//   80%  ⚖️  julgamento — defende-se, e pode escapar
//   20%  🚔  condenação direta
//
// A hipótese é o que faz isto valer: se o julgamento nunca absolvesse, era
// teatro, e ao fim de duas vezes a mesa carregava para o despachar.
//
// PORQUE É QUE ISTO NÃO ESTÁ NO `pending`
//
// O `b.pending` é da CASA onde alguém parou, e há três sítios que lhe fazem
// `= null` logo a seguir a mandar alguém preso (o beerpong e a casa ??, por
// exemplo). Um julgamento guardado lá era apagado sem se dar por isso. Vive no
// seu próprio `b.tribunal`, e o que bloqueia a mesa é ele — de propósito: um
// julgamento não é a vez de ninguém, é a mesa inteira parada a ouvir. Por isso
// também não mexe na ordem das vezes: quando acaba, a vez está onde estava.
//
// A votação é o `game/veredito.js` de sempre, com o `holder` a apontar para
// aqui. Um segundo sistema de votação seria um segundo sítio onde a regra do
// empate podia divergir — e o empate ABSOLVE, aqui como em todo o lado.

import { AppError } from '../errors.js';
import { pushFeed } from '../feed.js';
import * as veredito from '../game/veredito.js';
import { ROTULOS, SEGUNDOS_DEFESA } from '../game/tribunal.js';

// Definido aqui e não importado do core.js: é o core que importa ESTE ficheiro
// (o applyPrison abre o julgamento), e uma linha repetida vale mais do que um
// ciclo de imports entre os dois.
const nameOf = (room, id) => room.players.get(id)?.name;

// A probabilidade de haver julgamento. O João pediu 80/20 e é o número certo:
// com menos, o julgamento passava a raridade e não valia a pena ensiná-lo à
// mesa; com mais, a condenação direta deixava de meter medo.
export const HIPOTESE_JULGAMENTO = 0.8;

// Desliga-se com TRIBUNAL=0, como o EVENTOS e o SNAPSHOT. Serve os testes do
// tabuleiro que contam com a prisao a aplicar-se JA: com julgamento pelo meio,
// a mesa fica trancada a espera de um veredito e o teste deixa de ser sobre o
// que estava a testar.
export const ENABLED = process.env.TRIBUNAL !== '0';

/** Há gente para ser júri? (o réu não vota em si próprio) */
export function haJuri(room, reuId) {
  return [...room.players.values()].some((p) => p.connected && p.id !== reuId);
}

/**
 * Abre o julgamento. Chamado pelo `applyPrison` quando o sorteio calha nele.
 * A pena fica GUARDADA (`pena`) e só se aplica se a mesa condenar.
 */
export function abreTribunal(room, reuId, reason, pena, tese) {
  const b = room.board;
  const nm = nameOf(room, reuId);
  b.tribunal = {
    reuId,
    reuName: nm,
    razao: reason,
    tese,
    pena, // a sentença sorteada do banco `prisao`, à espera do veredito
    segundos: SEGUNDOS_DEFESA,
    abertoEm: Date.now(),
    substate: 'defesa', // defesa → votar → result
    result: null,
  };
  b.lastEvent = { text: `⚖️ ${nm} vai a julgamento (${reason}) — tem ${SEGUNDOS_DEFESA}s para se defender.` };
  pushFeed(room, '⚖️', `${nm} foi acusado (${reason}) e vai a julgamento.`);
  return b.tribunal;
}

function requireTribunal(room, substate) {
  const t = room.board?.tribunal;
  if (!t) throw new AppError('Não há julgamento a decorrer.');
  if (substate && t.substate !== substate) throw new AppError('Não é altura disso.');
  return t;
}

/**
 * Acabou a defesa → abre a votação. Qualquer um pode fechá-la: quem está a
 * falar está a olhar para a mesa, não para o telemóvel.
 */
export function boardTribunalAoVoto(room, playerId) {
  const t = requireTribunal(room, 'defesa');
  if (playerId && !room.players.get(playerId)) throw new AppError('Jogador inválido.');
  t.substate = 'votar';
  veredito.abre(t, [t.reuId], `${t.reuName}: "${t.tese}"`, ROTULOS);
  return t;
}

/** Um voto do júri. Fecha sozinho quando toda a gente que podia já votou. */
export function boardTribunalVota(room, playerId, valor) {
  const t = requireTribunal(room, 'votar');
  veredito.vota(room, playerId, valor, t);
  if (veredito.completo(room, t)) fechaTribunal(room);
  return t;
}

/**
 * Fecha o julgamento e aplica (ou não) a sentença.
 *
 * NÃO passa a vez: a vez nunca chegou a ser deste julgamento — ficou onde o
 * fluxo normal a deixou quando o preso foi acusado.
 */
export function fechaTribunal(room) {
  const b = room.board;
  const t = b?.tribunal;
  if (!t || t.veredito?.fechado) return null;
  const res = veredito.fecha(room, t); // 'sim' = absolvido (o empate absolve)
  const absolvido = res.conseguiu;
  const me = b.players[t.reuId];
  const nm = t.reuName;

  if (!absolvido && me) {
    // A sentença é a MESMA que teria levado sem julgamento — sai do banco
    // `prisao` (board_items), sorteada no momento da acusação. O julgamento
    // decide SE se cumpre, não inventa penas novas.
    const p = t.pena;
    me.slowStreak = 0;
    me.prisonCount += 1;
    if (p.skipTurns) me.skipTurns += p.skipTurns;
    if (p.drink) me.golos += p.drink;
    if (p.back) me.pos = Math.max(0, me.pos - p.back);
    if (p.loseCard && me.cards.length) me.cards.shift();
  }

  t.substate = 'result';
  t.result = {
    absolvido,
    reuId: t.reuId,
    reuName: nm,
    absolvicoes: res.sim,
    condenacoes: res.nao,
    pena: absolvido ? null : t.pena.note,
  };
  b.lastEvent = {
    text: absolvido
      ? `⚖️ ${nm} convenceu o júri (${res.sim}-${res.nao}) — sai em liberdade!`
      : `🔨 ${nm} foi condenado (${res.nao}-${res.sim}): ${t.pena.note}`,
  };
  pushFeed(room, absolvido ? '⚖️' : '🔨', b.lastEvent.text.replace(/^[⚖️🔨]\s*/u, ''));
  return t.result;
}

/**
 * Tira o julgamento do caminho (a mesa já leu o resultado).
 * É o que desbloqueia as jogadas — ver `requireBoard`/`rollDice`.
 */
export function limpaTribunal(room) {
  const b = room.board;
  if (!b?.tribunal) return null;
  if (b.tribunal.substate !== 'result') fechaTribunal(room);
  b.tribunal = null;
  return b;
}

/**
 * Para o payload: os votos são secretos até fechar (o `veredito.serialize`
 * trata disso). A `pena` que está à espera NUNCA sai — saber de antemão o que
 * se arrisca mudava o voto de quem julga, e é meio jogo.
 */
export function serializeTribunal(t) {
  if (!t) return null;
  return {
    reuId: t.reuId,
    reuName: t.reuName,
    razao: t.razao,
    tese: t.tese,
    segundos: t.segundos,
    abertoEm: t.abertoEm,
    substate: t.substate,
    veredito: veredito.serialize(t),
    result: t.substate === 'result' ? t.result : null,
  };
}
