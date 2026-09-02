// ----- Cascata ---------------------------------------------------------------
//
// O clássico: toda a gente começa a beber ao mesmo tempo, mas só podes parar
// depois de quem está à tua frente na fila ter parado. Quem está no fim da
// cascata bebe muito mais — e toda a mesa vê a corrente a descer.
//
// A app não mede tempo de bebida (não é fiável nem interessa): o que conta é a
// POSIÇÃO na corrente. Quem para em 1.º paga 1 golo, o 2.º paga 2, e assim por
// diante. O servidor é a autoridade sobre a ordem — não dá para furar a fila.

import { AppError } from '../errors.js';
import { connectedOrder, drink, nameOf } from './helpers.js';

export function setupCascata(room, round) {
  const order = connectedOrder(room);
  round.order = order.map((p) => ({ id: p.id, name: p.name }));
  round.stopped = []; // ids por ordem de paragem (é sempre a ordem da fila)
  round.substate = 'ready'; // ready → running → result
  round.result = null;
  return round.order.length >= 2;
}

function requireCascata(room, substate) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'cascata' || !r) throw new AppError('Não há cascata ativa.');
  if (substate && r.substate !== substate) throw new AppError('Não é altura disso.');
  return r;
}

/** Arranca a corrente — todos os ecrãs acendem ao mesmo tempo. */
export function cascataStart(room, playerId) {
  const r = requireCascata(room, 'ready');
  const p = room.players.get(playerId);
  if (!p || playerId !== r.currentPlayerId)
    throw new AppError('Só quem está à vez pode arrancar a cascata.');
  r.substate = 'running';
  r.startedAt = Date.now();
  return r;
}

/** "Parei". Só vale se for mesmo a tua vez na corrente. */
export function cascataStop(room, playerId) {
  const r = requireCascata(room, 'running');
  const expected = r.order[r.stopped.length];
  if (!expected) throw new AppError('A cascata já acabou.');
  if (expected.id !== playerId)
    throw new AppError(`Ainda não! Espera pelo ${expected.name}.`);

  r.stopped.push(playerId);
  const golos = r.stopped.length; // 1.º paga 1, 2.º paga 2, …
  drink(room.game, playerId, golos);

  if (r.stopped.length >= r.order.length) {
    r.substate = 'result';
    r.status = 'resolved';
    const last = r.order[r.order.length - 1];
    r.result = {
      rows: r.order.map((o, i) => ({ id: o.id, name: o.name, golos: i + 1 })),
      last: { id: last.id, name: nameOf(room, last.id) || last.name },
    };
  }
  return r;
}

export function serializeCascata(base, r) {
  base.substate = r.substate;
  base.order = r.order || [];
  base.stopped = r.stopped || [];
  base.result = r.result || null;
}
