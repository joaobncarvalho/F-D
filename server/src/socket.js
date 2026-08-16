import { RoomManager, serializeRoom, AppError } from './rooms.js';
import * as game from './game.js';

const rooms = new RoomManager();

/**
 * Regista os handlers de Socket.io.
 *
 * Eventos cliente -> servidor:
 *   create_room { name }            -> cria sala, criador é host
 *   join_room   { code, name }      -> junta a sala (nome único na sala)
 *   send_message{ text }            -> chat de grupo (Semana 2, base já aqui)
 *
 * Eventos servidor -> cliente:
 *   room_joined { room, you }       -> confirmação (após criar OU juntar)
 *   room_state  { room }            -> estado atualizado (broadcast a toda a sala)
 *   chat_message{ ... }             -> nova mensagem de chat
 *   error_msg   { message }         -> erro legível para o utilizador
 */
export function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    // Guardamos o contexto do jogador na própria socket.
    socket.data.code = null;
    socket.data.playerId = null;

    socket.on('create_room', ({ name } = {}, ack) => {
      try {
        const { room, player } = rooms.createRoom(name);
        bindSocketToRoom(socket, room.code, player.id);
        respond(ack, socket, 'room_joined', {
          room: serializeRoom(room),
          you: player.id,
        });
        broadcastState(io, room.code);
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('join_room', ({ code, name } = {}, ack) => {
      try {
        const { room, player } = rooms.joinRoom(code, name);
        bindSocketToRoom(socket, room.code, player.id);
        respond(ack, socket, 'room_joined', {
          room: serializeRoom(room),
          you: player.id,
        });
        broadcastState(io, room.code);
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('rejoin_room', ({ code, playerId } = {}, ack) => {
      try {
        const { room, player } = rooms.reconnect(code, playerId);
        bindSocketToRoom(socket, room.code, player.id);
        respond(ack, socket, 'room_joined', {
          room: serializeRoom(room),
          you: player.id,
        });
        broadcastState(io, room.code);
      } catch (err) {
        // Falha de reconexão é terminal: a sessão guardada já não é válida.
        const message =
          err instanceof AppError ? err.message : 'Não foi possível religar.';
        if (typeof ack === 'function') ack({ ok: false, message });
        socket.emit('session_invalid', { message });
      }
    });

    socket.on('start_game', ({ lives, intensity } = {}, ack) => {
      try {
        const { code, playerId } = socket.data;
        const room = rooms.startGame(code, playerId);
        game.initGame(room, { lives, intensity });
        io.to(code).emit('game_started', {});
        broadcastState(io, code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('add_question', ({ targetPlayerId, text } = {}, ack) => {
      try {
        const room = requireRoom(socket);
        game.addQuestion(room, socket.data.playerId, targetPlayerId, text);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('begin_play', (_payload, ack) => {
      try {
        const room = requireRoom(socket);
        game.beginPlay(room, socket.data.playerId);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('spin_wheel', async (_payload, ack) => {
      try {
        const room = requireRoom(socket);
        const round = await game.spinWheel(room, socket.data.playerId);
        io.to(room.code).emit('round_started', { round });
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('player_action', ({ action } = {}, ack) => {
      try {
        const room = requireRoom(socket);
        const { effect } = game.resolveAction(room, socket.data.playerId, action);
        io.to(room.code).emit('action_result', { effect });
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('skip_turn', (_payload, ack) => {
      try {
        const room = requireRoom(socket);
        game.skipTurn(room, socket.data.playerId);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('end_game', (_payload, ack) => {
      try {
        const room = requireRoom(socket);
        const stats = game.endGame(room, socket.data.playerId);
        io.to(room.code).emit('game_over', { stats });
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('reset_game', (_payload, ack) => {
      try {
        const room = requireRoom(socket);
        game.resetToLobby(room, socket.data.playerId);
        io.to(room.code).emit('back_to_lobby', {});
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('send_message', ({ text } = {}) => {
      const { code, playerId } = socket.data;
      if (!code || !playerId) return;
      const room = rooms.getRoom(code);
      const player = room?.players.get(playerId);
      const clean = String(text || '').trim().slice(0, 300);
      if (!room || !player || !clean) return;
      io.to(code).emit('chat_message', {
        playerId,
        name: player.name,
        text: clean,
        at: new Date().toISOString(),
      });
    });

    socket.on('disconnect', () => {
      const { code, playerId } = socket.data;
      if (!code || !playerId) return;
      rooms.handleDisconnect(code, playerId);
      broadcastState(io, code);
    });
  });
}

function requireRoom(socket) {
  const room = rooms.getRoom(socket.data.code);
  if (!room) throw new AppError('Sala não encontrada.');
  return room;
}

function bindSocketToRoom(socket, code, playerId) {
  socket.data.code = code;
  socket.data.playerId = playerId;
  socket.join(code);
}

function broadcastState(io, code) {
  const room = rooms.getRoom(code);
  if (!room) return; // sala já foi removida (ficou vazia)
  io.to(code).emit('room_state', { room: serializeRoom(room) });
}

function respond(ack, socket, event, payload) {
  if (typeof ack === 'function') ack({ ok: true, ...payload });
  socket.emit(event, payload);
}

function handleError(socket, ack, err) {
  const message =
    err instanceof AppError ? err.message : 'Ocorreu um erro inesperado.';
  if (!(err instanceof AppError)) console.error(err);
  if (typeof ack === 'function') ack({ ok: false, message });
  socket.emit('error_msg', { message });
}
