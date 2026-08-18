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
        // Piramide a decorrer: devolve-lhe a mão privada (perdida na queda).
        if (room.game?.round?.gameTypeKey === 'piramide') {
          const cards = game.piramideHand(room, player.id);
          if (cards) socket.emit('piramide_hand', { roundId: room.game.round.id, cards });
        }
        // Vasco a decorrer: devolve-lhe o papel privado (palavra ou "és o Vasco").
        if (room.game?.round?.gameTypeKey === 'vasco') {
          const role = game.vascoRole(room, player.id);
          if (role) socket.emit('vasco_role', { roundId: room.game.round.id, ...role });
        }
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

    socket.on('add_secret', ({ text } = {}, ack) => {
      try {
        const room = requireRoom(socket);
        game.addSecret(room, socket.data.playerId, text);
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
        // Aviso PRIVADO ao autor do segredo (nunca vai no broadcast).
        if (round.gameTypeKey === 'segredos' && round.secretAuthorId) {
          io.to(round.secretAuthorId).emit('you_are_author', { roundId: round.id });
        }
        // Intrigas: a pergunta só vai (privada) para quem girou; o acusado nunca a vê.
        if (round.gameTypeKey === 'intrigas') {
          io.to(round.currentPlayerId).emit('intrigas_reason', {
            roundId: round.id,
            reason: round.reason,
          });
        }
        // Piramide: entrega a cada jogador a SUA mão (privada, nunca em broadcast).
        if (round.gameTypeKey === 'piramide') {
          for (const p of room.players.values()) {
            if (!p.connected) continue;
            const cards = game.piramideHand(room, p.id);
            if (cards) io.to(p.id).emit('piramide_hand', { roundId: round.id, cards });
          }
        }
        // Vasco: entrega a cada jogador o SEU papel (privado). O grupo recebe a
        // palavra; o(s) Vasco(s) recebem só "és o Vasco" (word: null).
        if (round.gameTypeKey === 'vasco') {
          for (const p of room.players.values()) {
            if (!p.connected) continue;
            const role = game.vascoRole(room, p.id);
            if (role) io.to(p.id).emit('vasco_role', { roundId: round.id, ...role });
          }
        }
        // Só o tipo (para animações) — o resto vai no room_state já anonimizado.
        io.to(room.code).emit('round_started', { gameTypeKey: round.gameTypeKey });
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

    socket.on('choose_buddy', ({ buddyId } = {}, ack) => {
      try {
        const room = requireRoom(socket);
        game.chooseBuddy(room, socket.data.playerId, buddyId);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('choose_option', ({ index } = {}, ack) => {
      try {
        const room = requireRoom(socket);
        game.chooseOption(room, socket.data.playerId, index);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('choose_target', ({ accusedPlayerId } = {}, ack) => {
      try {
        const room = requireRoom(socket);
        const round = game.chooseTarget(room, socket.data.playerId, accusedPlayerId);
        // A razão vai (privada) para os espectadores — todos menos acusador e acusado.
        for (const p of room.players.values()) {
          if (p.connected && p.id !== round.currentPlayerId && p.id !== round.accusedId) {
            io.to(p.id).emit('intrigas_reason', { roundId: round.id, reason: round.reason });
          }
        }
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('submit_rps', ({ move } = {}, ack) => {
      try {
        const room = requireRoom(socket);
        const res = game.submitRps(room, socket.data.playerId, move);
        // Se o acusado ganhou, entrega-lhe agora a razão (privada).
        if (res.resolved && res.accusedWon) {
          io.to(res.accusedId).emit('intrigas_reason', {
            roundId: room.game.round.id,
            reason: res.reason,
          });
        }
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('cast_guess', ({ guessedPlayerId } = {}, ack) => {
      try {
        const room = requireRoom(socket);
        game.castGuess(room, socket.data.playerId, guessedPlayerId);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('reveal_result', (_payload, ack) => {
      try {
        const room = requireRoom(socket);
        game.revealResult(room, socket.data.playerId);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('continue_round', (_payload, ack) => {
      try {
        const room = requireRoom(socket);
        const { rewarded } = game.continueRound(room, socket.data.playerId);
        // Piramide: flash de "+1 vida" a quem fez beber mais.
        for (const w of rewarded || []) {
          io.to(room.code).emit('action_result', { effect: { type: 'vida_extra', playerId: w.id, name: w.name } });
        }
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    // ----- Piramide (Desconfia) -----
    const piramideEvents = {
      piramide_ready: (room, pid) => game.piramideReady(room, pid),
      piramide_flip: (room, pid) => game.piramideFlip(room, pid),
      piramide_pass: (room, pid) => game.piramidePass(room, pid),
      piramide_next: (room, pid) => game.piramideNext(room, pid),
    };
    for (const [event, fn] of Object.entries(piramideEvents)) {
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

    socket.on('piramide_assign', ({ targetId } = {}, ack) => {
      try {
        const room = requireRoom(socket);
        game.piramideAssign(room, socket.data.playerId, targetId);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('piramide_respond', ({ decision } = {}, ack) => {
      try {
        const room = requireRoom(socket);
        game.piramideRespond(room, socket.data.playerId, decision);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    // ----- Jogo do Vasco (Impostor) -----
    const vascoNoArg = {
      vasco_start_clues: (room, pid) => game.vascoStartClues(room, pid),
      vasco_clue_done: (room, pid) => game.vascoClueDone(room, pid),
    };
    for (const [event, fn] of Object.entries(vascoNoArg)) {
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

    socket.on('vasco_judge', ({ impostorId, correct } = {}, ack) => {
      try {
        const room = requireRoom(socket);
        const { finalized, winners } = game.vascoJudge(room, socket.data.playerId, impostorId, correct);
        // Se resolveu, flash de "+1 vida" a cada Vasco que acertou.
        if (finalized) {
          for (const w of winners) {
            io.to(room.code).emit('action_result', { effect: { type: 'vida_extra', playerId: w.id, name: w.name } });
          }
        }
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
  socket.join(playerId); // sala privada do jogador (ex.: aviso "és o autor do segredo")
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
