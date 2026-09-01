// F&D — handlers de Socket.io do Modo Tabuleiro. Extraído do socket.js (mesmos
// eventos, mesmos corpos). Recebe os helpers partilhados por `ctx` para não
// duplicar `rooms`/`broadcastState`/`handleError`.

import * as board from '../board.js';

/** Regista os handlers do Modo Tabuleiro nesta socket. */
export function registerBoardHandlers(socket, { io, requireRoom, broadcastState, handleError }) {
  // ----- Modo Tabuleiro -----
  const boardEvents = {
    board_roll: (room, pid) => board.rollOrder(room, pid),
    board_skip: (room, pid) => board.boardHostSkip(room, pid), // host: saltar vez
    board_end: (room, pid) => board.boardHostEnd(room, pid), // host: terminar jogo
  };
  for (const [event, fn] of Object.entries(boardEvents)) {
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

  // Duelo de reação (casa ⚡): qualquer um dos dois duelistas carrega.
  socket.on('board_reacao_tap', (_payload, ack) => {
    try {
      const room = requireRoom(socket);
      const res = board.boardReacao(room, socket.data.playerId);
      broadcastState(io, room.code);
      if (typeof ack === 'function') ack({ ok: true, ...res });
    } catch (err) {
      handleError(socket, ack, err);
    }
  });

  socket.on('board_pick_pawn', ({ pawn } = {}, ack) => {
    try {
      const room = requireRoom(socket);
      board.pickPawn(room, socket.data.playerId, pawn);
      broadcastState(io, room.code);
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      handleError(socket, ack, err);
    }
  });

  socket.on('board_advance', async ({ squares } = {}, ack) => {
    try {
      const room = requireRoom(socket);
      await board.advance(room, socket.data.playerId, squares); // async (conteúdo da casa)
      broadcastState(io, room.code);
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      handleError(socket, ack, err);
    }
  });

  socket.on('board_resolve', ({ action, choice } = {}, ack) => {
    try {
      const room = requireRoom(socket);
      board.boardResolve(room, socket.data.playerId, { action, choice });
      broadcastState(io, room.code);
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      handleError(socket, ack, err);
    }
  });

  socket.on('board_blackjack', ({ action } = {}, ack) => {
    try {
      const room = requireRoom(socket);
      board.boardBlackjack(room, socket.data.playerId, action);
      broadcastState(io, room.code);
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      handleError(socket, ack, err);
    }
  });

  socket.on('board_kick', ({ targetId } = {}, ack) => {
    try {
      const room = requireRoom(socket);
      board.boardHostKick(room, socket.data.playerId, targetId);
      broadcastState(io, room.code);
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      handleError(socket, ack, err);
    }
  });

  socket.on('board_beerpong', ({ power } = {}, ack) => {
    try {
      const room = requireRoom(socket);
      board.boardBeerpong(room, socket.data.playerId, power);
      broadcastState(io, room.code);
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      handleError(socket, ack, err);
    }
  });

  socket.on('board_evento_pick', ({ index } = {}, ack) => {
    try {
      const room = requireRoom(socket);
      board.boardEventoPick(room, socket.data.playerId, index);
      broadcastState(io, room.code);
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      handleError(socket, ack, err);
    }
  });

  socket.on('board_gamble', ({ bet } = {}, ack) => {
    try {
      const room = requireRoom(socket);
      board.boardGamble(room, socket.data.playerId, !!bet);
      broadcastState(io, room.code);
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      handleError(socket, ack, err);
    }
  });

  socket.on('board_bid', ({ amount } = {}, ack) => {
    try {
      const room = requireRoom(socket);
      board.boardBid(room, socket.data.playerId, amount);
      broadcastState(io, room.code);
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      handleError(socket, ack, err);
    }
  });

  socket.on('board_rule_fail', ({ ruleId, targetId } = {}, ack) => {
    try {
      const room = requireRoom(socket);
      board.boardRuleFail(room, socket.data.playerId, ruleId, targetId);
      broadcastState(io, room.code);
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      handleError(socket, ack, err);
    }
  });

  socket.on('board_play_card', ({ cardId, targetId, squareIndex } = {}, ack) => {
    try {
      const room = requireRoom(socket);
      board.playCard(room, socket.data.playerId, cardId, targetId, squareIndex);
      broadcastState(io, room.code);
      if (typeof ack === 'function') ack({ ok: true });
    } catch (err) {
      handleError(socket, ack, err);
    }
  });
}
