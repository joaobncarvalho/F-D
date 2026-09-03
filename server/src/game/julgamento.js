// ----- Julgamento ------------------------------------------------------------
//
// A mesa acusa alguém de uma coisa. Sorteia-se um ADVOGADO de defesa entre os
// outros, os dois têm meio minuto para se explicar em voz alta, e a mesa vota.
//
// PORQUE É QUE ISTO NÃO É "MAIS UMA VOTAÇÃO"
//
// Porque dá papel a três pessoas ao mesmo tempo, e nenhum dos outros tipos faz
// isso: há o réu, há alguém obrigado a defendê-lo (que pode nem gostar dele — é
// metade da graça), e há a mesa como júri. A defesa sorteada é o que impede que
// isto seja um linchamento: alguém TEM de argumentar do outro lado.
//
// O CUSTO É DOS DOIS LADOS
//
//   culpado    o réu perde uma vida
//   inocente   quem votou culpado bebe 2, e o advogado ganha uma vida
//
// Sem a segunda metade, votar "culpado" era grátis e votava-se sempre culpado.
// Assim há mesmo um risco em condenar — que é o que faz a defesa valer a pena
// ouvir. O advogado ser pago pela absolvição é o que o faz defender a sério.
//
// A votação reutiliza o veredito.js (mesmo módulo dos jogos a tempo), só com
// outras palavras nos botões: um segundo sistema de votação era código a mais
// para o mesmo problema — e um sítio a mais onde a regra do empate podia divergir.

import { AppError } from '../errors.js';
import { connectedOrder, drink, perdeVida, ganhaVida, nameOf, shuffle } from './helpers.js';
import * as veredito from './veredito.js';

export const CUSTO_CONDENAR_MAL = 2;

/**
 * Monta o julgamento. @returns false se não houver gente para os três papéis
 * (réu, advogado e pelo menos um jurado) — o chamador cai no Desafio.
 */
export function setupJulgamento(room, round, prompt) {
  const outros = connectedOrder(room).filter((p) => p.id !== round.currentPlayerId);
  if (outros.length < 2) return false;
  const advogado = shuffle([...outros])[0];
  round.acusacao = prompt?.text || 'É acusado de ser quem mais estraga os planos do grupo.';
  round.reuId = round.currentPlayerId;
  round.reuName = nameOf(room, round.currentPlayerId);
  round.advogadoId = advogado.id;
  round.advogadoName = advogado.name;
  round.substate = 'defesa'; // defesa → votar → result
  round.result = null;
  return true;
}

function requireJulgamento(room, substate) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'julgamento' || !r) throw new AppError('Não há julgamento ativo.');
  if (substate && r.substate !== substate) throw new AppError('Não é altura disso.');
  return r;
}

/**
 * Acabou a defesa → abre a votação do júri.
 *
 * Qualquer um pode dar a defesa por terminada (quem está a falar está a olhar
 * para a mesa, não para o telemóvel), tal como no Categoria Relâmpago.
 */
export function julgamentoAoVoto(room, playerId) {
  const r = requireJulgamento(room, 'defesa');
  if (!room.players.get(playerId)) throw new AppError('Jogador inválido.');
  r.substate = 'votar';
  veredito.abre(r, [r.reuId, r.advogadoId], `${r.reuName}: ${r.acusacao}`, {
    sim: '⚖️ Inocente',
    nao: '🔨 Culpado',
    aviso: 'Se for absolvido, quem votou culpado bebe',
  });
  return r;
}

/**
 * Fecha o julgamento. Chamado pelo `fechaVeredito` do game.js quando o júri
 * acaba de votar (ou quando o auto-resolve fecha com quem votou).
 */
export function julgamentoVeredito(room) {
  const g = room.game;
  const r = g?.round;
  if (!r?.veredito || r.veredito.fechado) return null;
  const res = veredito.fecha(room); // 'sim' = inocente (o empate absolve)
  const inocente = res.conseguiu;

  let efeito = null;
  const pagantes = [];
  if (inocente) {
    // Quem condenou paga a condenação. O advogado é pago pela absolvição.
    for (const [id, v] of Object.entries(r.veredito.votos)) {
      if (v !== 'nao') continue;
      drink(g, id, CUSTO_CONDENAR_MAL);
      pagantes.push({ id, name: nameOf(room, id) });
    }
    efeito = ganhaVida(room, r.advogadoId);
  } else {
    efeito = perdeVida(room, r.reuId, { motivo: 'condenado pela mesa', emoji: '🔨' });
  }

  r.substate = 'result';
  r.status = 'resolved';
  r.result = {
    inocente,
    reuId: r.reuId,
    reuName: r.reuName,
    advogadoId: r.advogadoId,
    advogadoName: r.advogadoName,
    inocentes: res.sim,
    culpados: res.nao,
    pagantes,
    custo: CUSTO_CONDENAR_MAL,
  };
  return {
    ...res,
    efeito,
    atorId: r.reuId,
    frase: inocente
      ? `⚖️ ${r.reuName} foi absolvido (${res.sim}-${res.nao}) — quem condenou bebe ${CUSTO_CONDENAR_MAL}`
      : `🔨 ${r.reuName} foi condenado (${res.nao}-${res.sim}) — menos uma vida`,
  };
}

export function serializeJulgamento(base, r) {
  base.acusacao = r.acusacao;
  base.reuId = r.reuId;
  base.reuName = r.reuName;
  base.advogadoId = r.advogadoId;
  base.advogadoName = r.advogadoName;
  base.substate = r.substate;
  base.veredito = veredito.serialize(r);
  base.custoCondenarMal = CUSTO_CONDENAR_MAL;
  base.result = r.substate === 'result' ? r.result : null;
  return base;
}
