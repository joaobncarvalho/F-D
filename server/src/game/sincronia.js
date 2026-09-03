// ----- Sincronia -------------------------------------------------------------
//
// Dois jogadores, a mesma pergunta, em segredo. Se derem a mesma resposta, é a
// MESA que bebe. Se derem respostas diferentes, bebem os dois.
//
// É o único tipo cooperativo do catálogo. Todos os outros são uma pessoa contra
// a mesa, ou a mesa contra uma pessoa; aqui há dois de um lado e o resto do outro
// — e o que se está mesmo a jogar é "até que ponto é que vocês se conhecem", com
// a mesa inteira a torcer contra.
//
// A resposta é sempre um JOGADOR, nunca texto livre. Comparar texto livre dava
// discussões sobre se "o Zé" e "Zé" são a mesma resposta, e a app teria de ser
// árbitro de uma coisa que não consegue julgar. Escolher uma cara resolve isso e
// mantém as perguntas viradas para dentro do grupo, que é onde este jogo vive.

import { AppError } from '../errors.js';
import { connectedOrder, drink, nameOf, shuffle } from './helpers.js';

/**
 * Monta a ronda. O par é quem girou + alguém sorteado.
 * @returns false se a mesa não der para o jogo (o chamador cai no Desafio).
 */
export function setupSincronia(room, round, prompt) {
  const outros = connectedOrder(room).filter((p) => p.id !== round.currentPlayerId);
  if (outros.length < 2) return false; // com 2 pessoas não há "mesa" para pagar
  const parceiro = shuffle([...outros])[0];
  round.pergunta = prompt?.text || 'Quem desta mesa é mais capaz de mentir na cara de alguém?';
  round.parId = parceiro.id;
  round.parName = parceiro.name;
  round.respostas = {}; // playerId -> playerId escolhido (SECRETO até fechar)
  round.substate = 'responder'; // responder → result
  round.result = null;
  return true;
}

const dupla = (r) => [r.currentPlayerId, r.parId];

export function sincroniaResponde(room, playerId, escolhidoId) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'sincronia' || !r) throw new AppError('Não há Sincronia ativa.');
  if (r.substate !== 'responder') throw new AppError('Já está decidido.');
  if (!dupla(r).includes(playerId)) throw new AppError('Não estás nesta dupla.');
  if (r.respostas[playerId]) throw new AppError('Já respondeste.');
  const alvo = room.players.get(escolhidoId);
  if (!alvo) throw new AppError('Escolhe um jogador válido.');
  r.respostas[playerId] = escolhidoId;

  if (dupla(r).every((id) => r.respostas[id])) return fecha(room);
  return { round: r, fechado: false };
}

export function fecha(room) {
  const g = room.game;
  const r = g.round;
  if (r.substate !== 'responder') return { round: r, fechado: false };
  const [aId, bId] = dupla(r);
  const a = r.respostas[aId];
  const b = r.respostas[bId];
  // Quem não respondeu a tempo conta como divergência: não se pode premiar o
  // silêncio num jogo cujo prémio é a mesa inteira beber.
  const bateu = !!a && a === b;

  const bebedores = [];
  if (bateu) {
    for (const p of connectedOrder(room)) {
      if (dupla(r).includes(p.id)) continue;
      drink(g, p.id, 1);
      bebedores.push({ id: p.id, name: p.name });
    }
  } else {
    for (const id of dupla(r)) {
      drink(g, id, 2);
      bebedores.push({ id, name: nameOf(room, id) });
    }
  }

  r.substate = 'result';
  r.status = 'resolved';
  r.result = {
    bateu,
    escolhas: dupla(r).map((id) => ({
      id,
      name: nameOf(room, id),
      escolhaId: r.respostas[id] || null,
      escolhaName: r.respostas[id] ? nameOf(room, r.respostas[id]) : null,
    })),
    bebedores,
  };
  return { round: r, fechado: true };
}

/** As escolhas só aparecem no reveal — a graça é as duas saírem ao mesmo tempo. */
export function serializeSincronia(base, r) {
  base.pergunta = r.pergunta;
  base.parId = r.parId;
  base.parName = r.parName;
  base.dupla = dupla(r);
  base.jaResponderam = Object.keys(r.respostas || {});
  base.substate = r.substate;
  base.result = r.substate === 'result' ? r.result : null;
  return base;
}
