import { RoomManager, serializeRoom, AppError } from './rooms.js';
import * as game from './game.js';
import * as board from './board.js';
import { sanitizeText, throttled } from './util.js';
import { log } from './log.js';
import * as bots from './bots.js';
import * as tournament from './tournament.js';
import { registerBoardHandlers } from './socket/boardHandlers.js';
import { registerTournamentHandlers } from './socket/tournamentHandlers.js';

const rooms = new RoomManager();
const botTicks = new Map(); // code -> intervalId (tick dos bots de playtest)

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
        if (room.mode === 'board' && room.board) board.boardOnReconnect(room); // devolve o turno se ficou sem dono
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
        // Mímica a decorrer: devolve a palavra privada a quem está a mimar.
        if (room.game?.round?.gameTypeKey === 'mimica') {
          const w = game.mimicaWord(room, player.id);
          if (w) socket.emit('mimica_word', { roundId: room.game.round.id, ...w });
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

    socket.on('vote_intensity', ({ intensity } = {}, ack) => {
      try {
        const { code, playerId } = socket.data;
        rooms.voteIntensity(code, playerId, intensity);
        broadcastState(io, code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('set_mode', ({ mode } = {}, ack) => {
      try {
        const { code, playerId } = socket.data;
        rooms.setMode(code, playerId, mode);
        broadcastState(io, code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    // Bots de PLAYTEST (dev) — só se ENABLE_DEV_BOTS=1 no servidor.
    socket.on('dev_add_bots', ({ count = 1 } = {}, ack) => {
      try {
        if (!bots.ENABLED) throw new AppError('Bots de dev não estão ativos no servidor.');
        const room = requireRoom(socket);
        const n = Math.max(1, Math.min(7, Number(count) || 1));
        for (let i = 0; i < n; i++) rooms.addBot(room.code);
        ensureBotTick(io, room.code);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('start_game', async ({ lives } = {}, ack) => {
      try {
        const { code, playerId } = socket.data;
        const room = rooms.startGame(code, playerId);
        // Intensidade decidida pela VOTAÇÃO (maioria; empate → sorteio/randomizer).
        const intensityResult = game.tallyIntensity(room);
        if (room.mode === 'board') {
          await board.initBoard(room, { intensity: intensityResult.intensity }); // modo Tabuleiro
        } else if (room.mode === 'tournament') {
          tournament.initTournament(room, { intensity: intensityResult.intensity }); // modo Torneio
        } else {
          game.initGame(room, { lives, intensity: intensityResult.intensity }); // modo Roda
        }
        io.to(code).emit('game_started', { mode: room.mode, intensityResult });
        broadcastState(io, code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    // Handlers do Modo Tabuleiro (em ./socket/boardHandlers.js).
    registerBoardHandlers(socket, { io, requireRoom, broadcastState, handleError });
    // Handlers do Modo Torneio (em ./socket/tournamentHandlers.js).
    registerTournamentHandlers(socket, { io, requireRoom, broadcastState, handleError });

    socket.on('add_question', ({ targetPlayerId, text } = {}, ack) => {
      try {
        if (throttled(socket, 'submit', 150)) return void (typeof ack === 'function' && ack({ ok: true })); // ignora duplo-toque/loop
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
        if (throttled(socket, 'submit', 150)) return void (typeof ack === 'function' && ack({ ok: true })); // ignora duplo-toque/loop
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
        announceSpin(io, room, round); // round_started + entregas privadas
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('player_action', ({ action } = {}, ack) => {
      try {
        const room = requireRoom(socket);
        const { effect, gameOver } = game.resolveAction(room, socket.data.playerId, action);
        io.to(room.code).emit('action_result', { effect });
        if (gameOver) io.to(room.code).emit('game_over', { stats: gameOver }); // último de pé
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
        announceIntrigasReason(io, room, round); // razão privada aos espectadores
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

    socket.on('vasco_vote', ({ suspectId } = {}, ack) => {
      try {
        const room = requireRoom(socket);
        const { finalized, winners } = game.vascoVote(room, socket.data.playerId, suspectId);
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

    socket.on('vasco_redeem', ({ word } = {}, ack) => {
      try {
        const room = requireRoom(socket);
        const { winners } = game.vascoRedeem(room, socket.data.playerId, word);
        for (const w of winners) {
          io.to(room.code).emit('action_result', { effect: { type: 'vida_extra', playerId: w.id, name: w.name } });
        }
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    // ----- Categoria Relâmpago / Mímica / Roleta Russa / Duelo 1v1 -----
    socket.on('relampago_start', (_payload, ack) => {
      try {
        const room = requireRoom(socket);
        game.relampagoStart(room, socket.data.playerId);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('relampago_resolve', ({ survived } = {}, ack) => {
      try {
        const room = requireRoom(socket);
        game.relampagoResolve(room, socket.data.playerId, survived);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('mimica_start', (_payload, ack) => {
      try {
        const room = requireRoom(socket);
        game.mimicaStart(room, socket.data.playerId);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('mimica_resolve', ({ guessed } = {}, ack) => {
      try {
        const room = requireRoom(socket);
        game.mimicaResolve(room, socket.data.playerId, guessed);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('roleta_answer', (_payload, ack) => {
      try {
        const room = requireRoom(socket);
        game.roletaAnswer(room, socket.data.playerId);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('roleta_pass', async (_payload, ack) => {
      try {
        const room = requireRoom(socket);
        await game.roletaPass(room, socket.data.playerId); // async: sorteia pergunta nova
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('duelo_result', ({ winnerId } = {}, ack) => {
      try {
        const room = requireRoom(socket);
        game.dueloResult(room, socket.data.playerId, winnerId);
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
      if (throttled(socket, 'chat', 400)) return; // anti-spam: no máx. ~1 msg / 0,4s
      const room = rooms.getRoom(code);
      const player = room?.players.get(playerId);
      const clean = sanitizeText(text, 300);
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
      try {
        rooms.handleDisconnect(code, playerId);
        // Tabuleiro: se quem saiu estava a jogar, não deixar o turno preso.
        const room = rooms.getRoom(code);
        if (room && room.mode === 'board' && room.board) board.boardOnDisconnect(room, playerId);
        // Torneio: quem sai a meio de um duelo perde por W.O. (não prender o quadro).
        if (room && room.tournament) tournament.tournamentOnDisconnect(room, playerId);
        broadcastState(io, code);
      } catch (err) {
        // Um erro no disconnect não pode partir o servidor nem prender a sala.
        log.error('erro no disconnect', { code, playerId, message: err?.message });
      }
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
  // Tabuleiro: as cartas são PRIVADAS — entrega a cada jogador ligado a SUA mão
  // (o broadcast só leva a contagem). Cobre advance/jogar carta/ganhar/reconexão.
  if (room.mode === 'board' && room.board) {
    for (const p of room.players.values()) {
      if (!p.connected) continue;
      // As maldições escondidas seguem a mesma regra das cartas: só o dono sabe onde estão.
      io.to(p.id).emit('board_hand', {
        cards: board.boardHand(room, p.id) || [],
        traps: board.boardTraps(room, p.id),
      });
    }
  }
}

/** Anuncia uma volta da roda: tipo (p/ animação) + entregas PRIVADAS (mãos,
 *  papéis, autor do segredo, razão da intriga). Usado por humanos e por bots. */
function announceSpin(io, room, round) {
  if (round.gameTypeKey === 'segredos' && round.secretAuthorId) {
    io.to(round.secretAuthorId).emit('you_are_author', { roundId: round.id });
  }
  if (round.gameTypeKey === 'intrigas') {
    io.to(round.currentPlayerId).emit('intrigas_reason', { roundId: round.id, reason: round.reason });
  }
  if (round.gameTypeKey === 'piramide') {
    for (const p of room.players.values()) {
      if (!p.connected || p.isBot) continue;
      const cards = game.piramideHand(room, p.id);
      if (cards) io.to(p.id).emit('piramide_hand', { roundId: round.id, cards });
    }
  }
  if (round.gameTypeKey === 'vasco') {
    for (const p of room.players.values()) {
      if (!p.connected || p.isBot) continue;
      const role = game.vascoRole(room, p.id);
      if (role) io.to(p.id).emit('vasco_role', { roundId: round.id, ...role });
    }
  }
  if (round.gameTypeKey === 'mimica') {
    const w = game.mimicaWord(room, round.currentPlayerId);
    if (w) io.to(round.currentPlayerId).emit('mimica_word', { roundId: round.id, ...w });
  }
  io.to(room.code).emit('round_started', { gameTypeKey: round.gameTypeKey });
}

/** Intrigas: entrega a razão (privada) aos espectadores — nem acusador nem acusado. */
function announceIntrigasReason(io, room, round) {
  for (const p of room.players.values()) {
    if (p.connected && !p.isBot && p.id !== round.currentPlayerId && p.id !== round.accusedId) {
      io.to(p.id).emit('intrigas_reason', { roundId: round.id, reason: round.reason });
    }
  }
}

/** Arranca (se ainda não existir) o tick que faz os bots de playtest jogar. */
function ensureBotTick(io, code) {
  if (botTicks.has(code)) return;
  const id = setInterval(async () => {
    const room = rooms.getRoom(code);
    const hasBots = room && [...room.players.values()].some((p) => p.isBot && p.connected);
    if (!hasBots) {
      clearInterval(id);
      botTicks.delete(code);
      return;
    }
    try {
      const changed = await bots.driveBots(room, {
        onSpin: (round) => announceSpin(io, room, round),
        onIntrigasTarget: (round) => announceIntrigasReason(io, room, round),
      });
      if (changed) broadcastState(io, code);
    } catch (err) {
      log.error('erro no tick dos bots', { code, message: err?.message });
    }
  }, 850);
  id.unref?.();
  botTicks.set(code, id);
}

function respond(ack, socket, event, payload) {
  if (typeof ack === 'function') ack({ ok: true, ...payload });
  socket.emit(event, payload);
}

function handleError(socket, ack, err) {
  const message =
    err instanceof AppError ? err.message : 'Ocorreu um erro inesperado.';
  // AppError é erro "de negócio" (esperado) → não polui os logs. O resto é bug.
  if (!(err instanceof AppError)) {
    log.error('erro num handler de socket', {
      code: socket.data?.code,
      playerId: socket.data?.playerId,
      message: err?.message,
      stack: err?.stack,
    });
  }
  if (typeof ack === 'function') ack({ ok: false, message });
  socket.emit('error_msg', { message });
}
