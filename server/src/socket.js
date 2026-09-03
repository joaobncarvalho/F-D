import { RoomManager, serializeRoom, AppError } from './rooms.js';
import * as game from './game.js';
import * as board from './board.js';
import { sanitizeText, throttled, rateLimited } from './util.js';
import { log } from './log.js';
import * as bots from './bots.js';
import * as tournament from './tournament.js';
import { registerBoardHandlers } from './socket/boardHandlers.js';
import { registerTournamentHandlers } from './socket/tournamentHandlers.js';
import * as autoresolve from './autoresolve.js';
import * as director from './game/director.js';
import * as modificadores from './game/modificadores.js';
import * as snapshot from './snapshot.js';

const rooms = new RoomManager();
const botTicks = new Map(); // code -> intervalId (tick dos bots de playtest)

// Eventos permitidos com a sala em PAUSA (host foi à casa de banho, etc.).
// Tudo o resto é recusado pelo servidor — a pausa tem de ser real, não decorativa.
const ALLOWED_WHILE_PAUSED = new Set([
  'pause_game', 'rejoin_room', 'send_message', 'end_game', 'reset_game',
  'create_room', 'join_room', 'set_identity', 'watch_room',
]);

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
/**
 * Repõe as salas de um reinício anterior. Corre ANTES de o servidor começar a
 * ouvir (index.js) — um telemóvel a religar não pode chegar antes das salas.
 */
export async function restoreRooms() {
  const n = await snapshot.restore(rooms);
  snapshot.startAutosave(rooms); // só depois: senão gravava por cima com a memória vazia
  return n;
}

export function registerSocketHandlers(io) {
  startAutoResolveSweeper(io);

  io.on('connection', (socket) => {
    // Guardamos o contexto do jogador na própria socket.
    socket.data.code = null;
    socket.data.playerId = null;

    // A pausa é validada AQUI, antes de qualquer handler: assim não é preciso
    // repetir a verificação em cada um dos ~50 eventos (e não se esquece nenhum).
    socket.use(([event] = [], next) => {
      const room = rooms.getRoom(socket.data.code);
      if (room?.paused && !ALLOWED_WHILE_PAUSED.has(event)) {
        socket.emit('error_msg', { message: '⏸️ O jogo está em pausa.' });
        return; // pacote descartado de propósito (não chama next)
      }
      // O Diretor precisa de saber quem anda VIVO — e o sítio certo para isso é
      // aqui, não em cinquenta handlers. Qualquer toque que chegue do telemóvel
      // conta como presença; o que interessa é a diferença entre quem está a
      // jogar e quem já não pega no telemóvel há um quarto de hora.
      if (room && socket.data.playerId) director.registaAcao(room, socket.data.playerId);
      next();
    });

    socket.on('create_room', ({ name } = {}, ack) => {
      try {
        leavePreviousRoom(io, socket); // criar outra sala não pode deixar a anterior com um fantasma
        const { room, player } = rooms.createRoom(name);
        bindSocketToRoom(socket, room.code, player.id);
        respond(ack, socket, 'room_joined', {
          room: serializeRoom(room),
          you: player.id,
          token: player.token, // prova de identidade para o rejoin — só para este socket
        });
        broadcastState(io, room.code);
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('join_room', ({ code, name } = {}, ack) => {
      try {
        leavePreviousRoom(io, socket);
        const { room, player, latecomer } = rooms.joinRoom(code, name);
        // Entrou com o jogo a decorrer → o modo dá-lhe lugar (vidas, peão, feed).
        // O Torneio não entra aqui de propósito: o quadro já está sorteado, por
        // isso quem chega assiste e APOSTA (que é o que mantém a mesa dentro).
        if (latecomer) {
          if (room.mode === 'board') board.addLatecomer(room, player);
          // O Modo da Morte corre o mesmo motor da Roda, e quem chega entra vivo:
          // é mais uma pessoa a jogar, e a eliminação trata do resto.
          else if (room.mode === 'wheel' || room.mode === 'morte') game.addLatecomer(room, player);
        }
        bindSocketToRoom(socket, room.code, player.id);
        respond(ack, socket, 'room_joined', {
          room: serializeRoom(room),
          you: player.id,
          token: player.token,
        });
        broadcastState(io, room.code);
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    /**
     * Modo TV / espectador: um portátil ligado à televisão entra na sala em modo
     * SÓ-LEITURA. Não cria jogador nem ocupa lugar; recebe o mesmo `room_state`
     * que já é anonimizado para todos (segredos, mãos e papéis nunca lá vão).
     */
    socket.on('watch_room', ({ code } = {}, ack) => {
      try {
        const room = rooms.getRoom(code);
        if (!room) throw new AppError('Sala não encontrada.');
        leavePreviousRoom(io, socket); // estava a jogar e passou a ecrã? larga o lugar
        socket.data.code = room.code;
        socket.data.playerId = null; // espectador: não é jogador
        socket.data.spectator = true;
        socket.join(room.code);
        const payload = { room: serializeRoom(room), you: null };
        if (typeof ack === 'function') ack({ ok: true, ...payload });
        socket.emit('room_state', payload);
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('rejoin_room', ({ code, playerId, token } = {}, ack) => {
      try {
        const { room, player } = rooms.reconnect(code, playerId, token);
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
        // Desenho a decorrer: devolve a palavra privada a quem está a desenhar.
        if (room.game?.round?.gameTypeKey === 'desenho') {
          const w = game.desenhoWord(room, player.id);
          if (w) socket.emit('desenho_word', { roundId: room.game.round.id, ...w });
        }
        // "Quem Disse" a decorrer: quem escreveu a pergunta volta a saber que é sua.
        if (room.game?.round?.gameTypeKey === 'quem_disse' && room.game.round.authorId === player.id) {
          socket.emit('you_are_author', { roundId: room.game.round.id });
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

    socket.on('set_identity', ({ emoji, color } = {}, ack) => {
      try {
        const { code, playerId } = socket.data;
        rooms.setIdentity(code, playerId, { emoji, color });
        broadcastState(io, code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('set_night_length', ({ minutos } = {}, ack) => {
      try {
        const { code, playerId } = socket.data;
        rooms.setNightLength(code, playerId, minutos);
        broadcastState(io, code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('set_curve', ({ on } = {}, ack) => {
      try {
        const { code, playerId } = socket.data;
        rooms.setCurve(code, playerId, on);
        broadcastState(io, code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('set_modifiers', ({ modifiers } = {}, ack) => {
      try {
        const { code, playerId } = socket.data;
        rooms.setModifiers(code, playerId, modifiers);
        broadcastState(io, code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('pause_game', ({ paused } = {}, ack) => {
      try {
        const { code, playerId } = socket.data;
        const room = rooms.setPaused(code, playerId, paused);
        io.to(code).emit('paused_changed', { paused: room.paused });
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
          // `curve` vem do lobby (rooms.setCurve). Sem isto o motor ficava com o
          // seu valor por omissão (ligada) e o interruptor do host não fazia nada.
          game.initGame(room, {
            lives,
            intensity: intensityResult.intensity,
            curve: room.curve,
            duracaoMin: room.duracaoMin, // plano da noite → o Diretor monta o final
            modifiers: room.modifiers, // regras da noite (game/modificadores.js)
          }); // modo Roda
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

    // Palpite da plateia: enquanto um joga, os outros apostam no que vai
    // acontecer (game/palpites.js). É o que tira sete pessoas de espectadoras
    // numa mesa de oito.
    socket.on('dar_palpite', ({ escolha } = {}, ack) => {
      try {
        if (throttled(socket, 'submit', 150)) return void (typeof ack === 'function' && ack({ ok: true }));
        const room = requireRoom(socket);
        game.darPalpite(room, socket.data.playerId, escolha);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    // A Conta (game/divida.js). Adiar passa pelo `player_action` como qualquer
    // outra decisão da ronda; o que precisa de handler próprio é o que acontece
    // FORA da ronda: passar a conta a alguém e deixá-la a alguém ao sair.
    socket.on('divida_transfere', ({ paraId } = {}, ack) => {
      try {
        const room = requireRoom(socket);
        const res = game.transfereDivida(room, socket.data.playerId, paraId);
        if (res.vida) io.to(room.code).emit('action_result', { effect: res.vida });
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('heranca_escolhe', ({ herdeiroId } = {}, ack) => {
      try {
        const room = requireRoom(socket);
        game.escolheHerdeiro(room, socket.data.playerId, herdeiroId);
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
        // Modificador "Sem Anonimato": a razão vai para a mesa TODA no fim, quer
        // o acusado tenha ganho quer não. É o único sítio onde a promessa de
        // anonimato das Intrigas se quebra — e só porque o host a desligou.
        if (res.resolved && modificadores.revelaRazao(room)) {
          io.to(room.code).emit('intrigas_reason', {
            roundId: room.game.round.id,
            reason: res.reason,
            publica: true,
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

    // Fim do tempo: qualquer jogador pode dá-lo por terminado (o servidor
    // confirma pelo relógio) e abre-se o veredito da MESA.
    socket.on('relampago_timeup', (_payload, ack) => {
      try {
        const room = requireRoom(socket);
        game.relampagoTimeUp(room, socket.data.playerId);
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

    socket.on('mimica_timeup', (_payload, ack) => {
      try {
        const room = requireRoom(socket);
        game.mimicaTimeUp(room, socket.data.playerId);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    /**
     * Voto no veredito da mesa (Mímica / Relâmpago). Quando toda a gente vota,
     * fecha sozinho — e quem falhou perde uma vida, com a batida no ecrã.
     */
    socket.on('veredito_vota', ({ valor } = {}, ack) => {
      try {
        if (throttled(socket, 'submit', 150)) return void (typeof ack === 'function' && ack({ ok: true }));
        const room = requireRoom(socket);
        const res = game.votaVeredito(room, socket.data.playerId, valor);
        if (res.fechado && res.efeito) io.to(room.code).emit('action_result', { effect: res.efeito });
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

    socket.on('duelo_call', ({ call } = {}, ack) => {
      try {
        const room = requireRoom(socket);
        game.dueloCall(room, socket.data.playerId, call);
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

    // ----- Jogos de mesa inteira (Eu Nunca / Mais Provável / Termómetro / Quem Disse) -----
    socket.on('grupo_answer', ({ value } = {}, ack) => {
      try {
        if (throttled(socket, 'submit', 150)) return void (typeof ack === 'function' && ack({ ok: true }));
        const room = requireRoom(socket);
        game.grupoAnswer(room, socket.data.playerId, value);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('grupo_reveal', (_payload, ack) => {
      try {
        const room = requireRoom(socket);
        const p = room.players.get(socket.data.playerId);
        if (!p || (!p.isHost && socket.data.playerId !== room.game?.currentPlayerId))
          throw new AppError('Só o host ou quem girou pode revelar.');
        game.grupoForceReveal(room);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    // ----- Cascata -----
    const cascataEvents = {
      cascata_start: (room, pid) => game.cascataStart(room, pid),
      cascata_stop: (room, pid) => game.cascataStop(room, pid),
    };
    for (const [event, fn] of Object.entries(cascataEvents)) {
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

    // ----- Desenha e Adivinha -----
    socket.on('desenho_start', (_payload, ack) => {
      try {
        const room = requireRoom(socket);
        game.desenhoStart(room, socket.data.playerId);
        io.to(room.code).emit('draw_clear', {}); // tela limpa em todos os ecrãs
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('desenho_guess', ({ text } = {}, ack) => {
      try {
        if (throttled(socket, 'guess', 300)) return void (typeof ack === 'function' && ack({ ok: true }));
        const room = requireRoom(socket);
        game.desenhoGuess(room, socket.data.playerId, text);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('desenho_giveup', (_payload, ack) => {
      try {
        const room = requireRoom(socket);
        game.desenhoGiveUp(room, socket.data.playerId);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    // Traços do desenho: canal PRÓPRIO (dezenas de pontos por segundo não têm
    // nada que fazer no room_state). Só quem está a desenhar pode emitir.
    socket.on('draw_stroke', (stroke = {}) => {
      // Único canal sem limite de frequência. O corte a 200 pontos limita o
      // TAMANHO de cada lote, não o ritmo — sem isto um cliente manipulado (ou um
      // telemóvel a 120 Hz) enchia a sala de pacotes. Limite por janela e não por
      // espaçamento, de propósito: o cliente já junta os pontos em lotes de 12 e o
      // último lote de um traço curto sai colado ao anterior — travá-lo cortava o
      // desenho a meio. A desenhar a sério fazem-se ~5 lotes por segundo; 60 dá
      // uma folga de dez vezes e continua a travar um fluxo absurdo.
      if (rateLimited(socket, 'stroke', 60, 1000)) return;
      const room = rooms.getRoom(socket.data.code);
      const r = room?.game?.round;
      if (!r || r.gameTypeKey !== 'desenho' || r.substate !== 'drawing') return;
      if (r.currentPlayerId !== socket.data.playerId) return;
      const pts = Array.isArray(stroke.points) ? stroke.points.slice(0, 200) : null;
      if (!pts) return;
      socket.to(room.code).emit('draw_stroke', { points: pts, color: stroke.color, width: stroke.width });
    });

    socket.on('draw_clear', () => {
      const room = rooms.getRoom(socket.data.code);
      const r = room?.game?.round;
      if (!r || r.gameTypeKey !== 'desenho' || r.currentPlayerId !== socket.data.playerId) return;
      socket.to(room.code).emit('draw_clear', {});
    });

    // ----- Reação (Primeiro a Carregar) -----
    socket.on('reacao_tap', (_payload, ack) => {
      try {
        const room = requireRoom(socket);
        const res = game.reacaoTap(room, socket.data.playerId);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true, ...res });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    // ----- Modo da Morte: as ações de quem já saiu ----------------------------
    // É o que impede que ser eliminado signifique ficar a ver os outros
    // divertirem-se — o pior castigo possível numa festa.
    socket.on('fantasma_carta', ({ carta, alvoId } = {}, ack) => {
      try {
        const room = requireRoom(socket);
        const res = game.fantasmaJogaCarta(room, socket.data.playerId, carta, alvoId);
        for (const e of res.efeitos || []) io.to(room.code).emit('action_result', { effect: e });
        io.to(room.code).emit('fantasma_jogou', { emoji: res.emoji, texto: res.texto });
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('testamento', ({ texto } = {}, ack) => {
      try {
        const room = requireRoom(socket);
        game.deixaTestamento(room, socket.data.playerId, texto);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    // ----- Tipos da camada 3 --------------------------------------------------
    // Bomba-Relógio: o pavio vive no servidor e nunca vai no payload, por isso é
    // a passagem que descobre se já rebentou.
    socket.on('bomba_passa', (_payload, ack) => {
      try {
        const room = requireRoom(socket);
        const res = game.bombaPassa(room, socket.data.playerId);
        if (res.rebentou) {
          io.to(room.code).emit('bomba_rebentou', { quemId: res.round.result.quemId });
          if (res.efeito) io.to(room.code).emit('action_result', { effect: res.efeito });
        }
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('leilao_licita', ({ golos } = {}, ack) => {
      try {
        if (throttled(socket, 'submit', 150)) return void (typeof ack === 'function' && ack({ ok: true }));
        const room = requireRoom(socket);
        game.leilaoLicita(room, socket.data.playerId, golos);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('sincronia_responde', ({ escolhidoId } = {}, ack) => {
      try {
        if (throttled(socket, 'submit', 150)) return void (typeof ack === 'function' && ack({ ok: true }));
        const room = requireRoom(socket);
        game.sincroniaResponde(room, socket.data.playerId, escolhidoId);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('detetor_marca', ({ verdade } = {}, ack) => {
      try {
        const room = requireRoom(socket);
        game.detetorMarca(room, socket.data.playerId, verdade);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('detetor_vota', ({ valor } = {}, ack) => {
      try {
        if (throttled(socket, 'submit', 150)) return void (typeof ack === 'function' && ack({ ok: true }));
        const room = requireRoom(socket);
        const res = game.detetorVota(room, socket.data.playerId, valor);
        if (res.fechado && res.efeito) io.to(room.code).emit('action_result', { effect: res.efeito });
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('julgamento_ao_voto', (_payload, ack) => {
      try {
        const room = requireRoom(socket);
        game.julgamentoAoVoto(room, socket.data.playerId);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('contrato_escolhe', ({ parceiroId } = {}, ack) => {
      try {
        const room = requireRoom(socket);
        game.contratoEscolhe(room, socket.data.playerId, parceiroId);
        broadcastState(io, room.code);
        if (typeof ack === 'function') ack({ ok: true });
      } catch (err) {
        handleError(socket, ack, err);
      }
    });

    socket.on('contrato_assina', ({ aceita } = {}, ack) => {
      try {
        const room = requireRoom(socket);
        const res = game.contratoAssina(room, socket.data.playerId, aceita);
        for (const e of res.efeitos || []) io.to(room.code).emit('action_result', { effect: e });
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
      if (!code || !playerId || socket.data.spectator) return;
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

/**
 * Varre todas as salas à procura de rondas encravadas (ver autoresolve.js). Um
 * único temporizador para o servidor inteiro — não um por sala.
 */
function startAutoResolveSweeper(io) {
  if (!autoresolve.ENABLED) return;
  const id = setInterval(async () => {
    for (const room of [...rooms.rooms.values()]) {
      try {
        if (await autoresolve.sweep(room)) broadcastState(io, room.code);
      } catch (err) {
        log.error('erro no varrimento de auto-resolve', { code: room.code, message: err?.message });
      }
    }
  }, 3000);
  id.unref?.();
}

function requireRoom(socket) {
  const room = rooms.getRoom(socket.data.code);
  if (!room) throw new AppError('Sala não encontrada.');
  return room;
}

/**
 * Larga a sala anterior antes de entrar noutra.
 *
 * Sem isto, um socket que criasse/entrasse numa segunda sala deixava na primeira
 * um jogador eternamente `connected` — a sala nunca ficava "vazia", nunca era
 * limpa (fica em memória para sempre) e a rotação de vezes continuava a contar
 * com alguém que já lá não está. O `disconnect` só limpa a ÚLTIMA sala, porque é
 * a única que o socket ainda conhece.
 */
function leavePreviousRoom(io, socket) {
  const { code, playerId } = socket.data;
  if (!code || !playerId) return;
  try {
    rooms.handleDisconnect(code, playerId);
    const anterior = rooms.getRoom(code);
    if (anterior) {
      if (anterior.mode === 'board' && anterior.board) board.boardOnDisconnect(anterior, playerId);
      if (anterior.tournament) tournament.tournamentOnDisconnect(anterior, playerId);
      broadcastState(io, code);
    }
    socket.leave(code);
    socket.leave(playerId);
  } catch (err) {
    log.error('erro ao largar a sala anterior', { code, playerId, message: err?.message });
  }
  socket.data.code = null;
  socket.data.playerId = null;
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
  // Modo da Morte: a mão de cada fantasma é PRIVADA, pela mesma razão das cartas
  // do Tabuleiro — se a mesa soubesse que cartas andam por aí, jogava contra
  // elas em vez de jogar a ronda. O broadcast só leva quantas são.
  if (room.mode === 'morte' && room.game?.morte) {
    for (const p of room.players.values()) {
      if (!p.connected || p.isBot) continue;
      const cartas = game.maoFantasma(room, p.id);
      if (cartas) io.to(p.id).emit('fantasma_mao', { cartas });
    }
  }
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
  if (round.gameTypeKey === 'desenho') {
    const w = game.desenhoWord(room, round.currentPlayerId);
    if (w) io.to(round.currentPlayerId).emit('desenho_word', { roundId: round.id, ...w });
  }
  if (round.gameTypeKey === 'quem_disse' && round.authorId) {
    // O autor da pergunta sabe que é dele (e o cliente esconde-lhe os botões).
    io.to(round.authorId).emit('you_are_author', { roundId: round.id });
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
