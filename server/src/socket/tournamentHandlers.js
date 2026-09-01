// F&D — handlers de Socket.io do Modo Torneio. Mesmo padrão do boardHandlers.js:
// recebe os helpers partilhados por `ctx` e limita-se a chamar o motor + rebroadcast.

import * as tournament from '../tournament.js';

export function registerTournamentHandlers(socket, { io, requireRoom, broadcastState, handleError }) {
  socket.on('tournament_next', async (_payload, ack) => {
    try {
      const room = requireRoom(socket);
      await tournament.tournamentNext(room, socket.data.playerId); // async: sorteia o prompt do duelo
      broadcastState(io, room.code);
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      handleError(socket, ack, err);
    }
  });

  socket.on('tournament_action', ({ action } = {}, ack) => {
    try {
      const room = requireRoom(socket);
      tournament.tournamentAction(room, socket.data.playerId, action);
      broadcastState(io, room.code);
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      handleError(socket, ack, err);
    }
  });

  socket.on('tournament_choose', ({ index } = {}, ack) => {
    try {
      const room = requireRoom(socket);
      tournament.tournamentChoose(room, socket.data.playerId, index);
      broadcastState(io, room.code);
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      handleError(socket, ack, err);
    }
  });

  socket.on('tournament_vote', ({ duelistId } = {}, ack) => {
    try {
      const room = requireRoom(socket);
      tournament.tournamentVote(room, socket.data.playerId, duelistId);
      broadcastState(io, room.code);
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      handleError(socket, ack, err);
    }
  });

  const noArg = {
    tournament_continue: (room, pid) => tournament.tournamentContinue(room, pid),
    tournament_skip: (room, pid) => tournament.tournamentSkip(room, pid), // host
    tournament_end: (room, pid) => tournament.tournamentEnd(room, pid), // host
  };
  for (const [event, fn] of Object.entries(noArg)) {
    socket.on(event, (_payload, ack) => {
      try {
        const room = requireRoom(socket);
        fn(room, socket.data.playerId);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });
  }
}
