// ----- ⚖️ Tribunal da Injustiça ----------------------------------------------
//
// O réu tem 90 segundos para defender, em voz alta e a sério, uma tese
// indefensável. A mesa é o júri e decide se ele safa ou se leva a sentença.
//
// O QUE ISTO TRAZ QUE NÃO HAVIA
//
// É a primeira coisa no jogo que pede a alguém para FALAR BEM durante um bocado.
// Todos os outros tipos se resolvem numa frase, num toque ou num voto; este
// obriga a construir um argumento — e a graça está inteira em ver uma pessoa a
// defender com cara séria uma coisa que não se defende.
//
// PORQUE 90 SEGUNDOS
//
// A ideia trazia três minutos. Três minutos é uma pessoa a falar e sete a ouvir,
// que é exatamente o que o Diretor passa a vida a evitar (a Pirâmide e o Vasco
// são os tipos que mais cansam, e são os mais longos). Noventa segundos ainda
// dão para uma tese com princípio, meio e fim, e obrigam a defesa a ser densa —
// que é onde está a piada. Quem acabar antes não tem de esperar: a mesa fecha.
//
// O REGISTO DAS TESES
//
// Indefensáveis e INOFENSIVAS: sobre comportamentos, manias e regras inventadas,
// nunca sobre o que as pessoas são. Ver o comentário do tipo `tribunal` em
// content/prompts.data.js — é lá que está o teste a aplicar ao escrever mais.
//
// A SENTENÇA
//
// A votação é o `veredito.js` de sempre (com outros rótulos), pela mesma razão de
// sempre: um segundo sistema de votação seria um segundo sítio onde a regra do
// empate podia divergir. O empate ABSOLVE, como em todo o lado.
//
// O custo existe dos dois lados, senão condenar era grátis e condenava-se sempre:
//
//   condenado    perde uma vida (na Roda) / cumpre a pena da prisão (no Tabuleiro)
//   absolvido    quem votou culpado bebe 2
//
// No Tabuleiro este mesmo módulo é a metade "julgamento" da prisão — ver
// board/tribunal.js, que reutiliza a votação e só troca a sentença.

import { AppError } from '../errors.js';
import { connectedOrder, drink, perdeVida, nameOf } from './helpers.js';
import * as veredito from './veredito.js';

export const SEGUNDOS_DEFESA = 90;
export const CUSTO_CONDENAR_MAL = 2;

export const ROTULOS = {
  sim: '⚖️ Absolvido',
  nao: '🔨 Condenado',
  aviso: 'Se for absolvido, quem condenou bebe',
};

/**
 * Monta o tribunal. @returns false se não houver júri (é preciso pelo menos um
 * jurado além do réu) — o chamador cai no Desafio.
 */
export function setupTribunal(room, round, prompt) {
  const outros = connectedOrder(room).filter((p) => p.id !== round.currentPlayerId);
  if (!outros.length) return false;
  round.tese = prompt?.text || 'Defende que esta mesa tomou todas as decisões erradas desde que se sentou.';
  round.reuId = round.currentPlayerId;
  round.reuName = nameOf(room, round.currentPlayerId);
  round.segundos = SEGUNDOS_DEFESA;
  round.defesaAbertaEm = Date.now();
  round.substate = 'defesa'; // defesa → votar → result
  round.result = null;
  return true;
}

function requireTribunal(room, substate) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'tribunal' || !r) throw new AppError('Não há tribunal a decorrer.');
  if (substate && r.substate !== substate) throw new AppError('Não é altura disso.');
  return r;
}

/**
 * Acabou a defesa → abre a votação do júri.
 *
 * Qualquer um pode dar a defesa por terminada (quem está a falar está a olhar
 * para a mesa, não para o telemóvel), como no Julgamento e no Relâmpago. O
 * auto-resolve faz o mesmo quando os 90s acabam sem ninguém carregar.
 */
export function tribunalAoVoto(room, playerId) {
  const r = requireTribunal(room, 'defesa');
  if (playerId && !room.players.get(playerId)) throw new AppError('Jogador inválido.');
  r.substate = 'votar';
  veredito.abre(r, [r.reuId], `${r.reuName}: "${r.tese}"`, ROTULOS);
  return r;
}

/**
 * Fecha o tribunal. Chamado pelo `fechaVeredito` do game.js quando o júri acaba
 * de votar (ou quando o auto-resolve fecha com quem já votou).
 */
export function tribunalVeredito(room) {
  const g = room.game;
  const r = g?.round;
  if (!r?.veredito || r.veredito.fechado) return null;
  const res = veredito.fecha(room); // 'sim' = absolvido (o empate absolve)
  const absolvido = res.conseguiu;

  let efeito = null;
  const pagantes = [];
  if (absolvido) {
    for (const [id, v] of Object.entries(r.veredito.votos)) {
      if (v !== 'nao') continue;
      drink(g, id, CUSTO_CONDENAR_MAL);
      pagantes.push({ id, name: nameOf(room, id) });
    }
  } else {
    efeito = perdeVida(room, r.reuId, { motivo: 'condenado pelo tribunal', emoji: '🔨' });
  }

  r.substate = 'result';
  r.status = 'resolved';
  r.result = {
    absolvido,
    reuId: r.reuId,
    reuName: r.reuName,
    absolvicoes: res.sim,
    condenacoes: res.nao,
    pagantes,
    custo: CUSTO_CONDENAR_MAL,
  };
  return {
    ...res,
    efeito,
    atorId: r.reuId,
    frase: absolvido
      ? `⚖️ ${r.reuName} convenceu o júri (${res.sim}-${res.nao}) — quem condenou bebe ${CUSTO_CONDENAR_MAL}`
      : `🔨 ${r.reuName} não convenceu ninguém (${res.nao}-${res.sim}) — menos uma vida`,
  };
}

export function serializeTribunal(base, r) {
  base.tese = r.tese;
  base.reuId = r.reuId;
  base.reuName = r.reuName;
  base.segundos = r.segundos || SEGUNDOS_DEFESA;
  base.substate = r.substate;
  base.veredito = veredito.serialize(r);
  base.custoCondenarMal = CUSTO_CONDENAR_MAL;
  base.result = r.substate === 'result' ? r.result : null;
  return base;
}
