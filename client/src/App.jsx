import { useEffect, useState, useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { socket } from './socket.js';
import { sfx } from './sfx.js';
import Home from './pages/Home.jsx';
import Lobby from './pages/Lobby.jsx';
import Game from './pages/Game.jsx';
import Countdown from './components/Countdown.jsx';
import IntensityReveal from './components/IntensityReveal.jsx';
import Board from './pages/Board.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

const SESSION_KEY = 'fd_session';

// Sessão: o sessionStorage é por-separador (2 separadores em dev = 2 jogadores)
// e sobrevive a recarregar. Mas se o browser MATAR o separador (comum no
// telemóvel em segundo plano) perde-se. Por isso espelhamos também em
// localStorage: ao reabrir sem sessionStorage, recuperamos de lá e auto-religamos.
// Em dev, cada separador escreve o SEU sessionStorage primeiro, por isso não
// colidem; a recuperação do localStorage só acontece quando o separador é novo.
function loadSession() {
  try {
    const fromTab = sessionStorage.getItem(SESSION_KEY);
    if (fromTab) return JSON.parse(fromTab);
    const fromDevice = localStorage.getItem(SESSION_KEY);
    if (fromDevice) {
      sessionStorage.setItem(SESSION_KEY, fromDevice); // adota para este separador
      return JSON.parse(fromDevice);
    }
    return null;
  } catch {
    return null;
  }
}

export default function App() {
  const [screen, setScreen] = useState('home');
  const [room, setRoom] = useState(null);
  const [youId, setYouId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [conn, setConn] = useState('online');
  const [authorRoundId, setAuthorRoundId] = useState(null);
  const [intrigasReason, setIntrigasReason] = useState(null); // { roundId, reason }
  const [piramideHand, setPiramideHand] = useState(null); // { roundId, cards } — PRIVADO
  const [vascoRole, setVascoRole] = useState(null); // { roundId, isImpostor, word } — PRIVADO
  const [boardHand, setBoardHand] = useState(null); // { cards } — mão de cartas do tabuleiro (PRIVADA)
  const [intensityResult, setIntensityResult] = useState(null); // { intensity, randomized, candidates, counts }
  const [muted, setMuted] = useState(sfx.isMuted());

  const sessionRef = useRef(loadSession());

  function saveSession(s) {
    sessionRef.current = s;
    try {
      if (s) {
        const str = JSON.stringify(s);
        sessionStorage.setItem(SESSION_KEY, str);
        localStorage.setItem(SESSION_KEY, str); // espelho p/ sobreviver ao separador ser morto
      } else {
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(SESSION_KEY);
      }
    } catch {
      /* modo privado / storage cheio — a sessão fica só em memória */
    }
  }

  // Desbloqueia o áudio no primeiro toque (política de autoplay dos browsers).
  useEffect(() => {
    const unlock = () => sfx.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  useEffect(() => {
    function onRoomJoined({ room, you }) {
      setRoom(room);
      setYouId(you);
      setError(null);
      saveSession({ code: room.code, playerId: you });
      setScreen(room.status === 'playing' ? 'game' : 'lobby');
      sfx.join();
    }
    function onRoomState({ room }) {
      setRoom(room);
    }
    function onChatMessage(msg) {
      setMessages((prev) => [...prev, msg]);
    }
    function onGameStarted({ mode, intensityResult } = {}) {
      setAuthorRoundId(null);
      setIntrigasReason(null);
      setPiramideHand(null);
      setVascoRole(null);
      setBoardHand(null);
      setIntensityResult(intensityResult || null);
      // Tabuleiro vai direto ao ecrã do jogo; a roda passa pela roleta + countdown.
      setScreen(mode === 'board' ? 'board' : 'intensity_reveal');
    }
    function onBackToLobby() {
      setAuthorRoundId(null);
      setIntrigasReason(null);
      setPiramideHand(null);
      setVascoRole(null);
      setBoardHand(null);
      setScreen('lobby');
    }
    function onYouAreAuthor({ roundId }) {
      setAuthorRoundId(roundId);
    }
    function onIntrigasReason({ roundId, reason }) {
      setIntrigasReason({ roundId, reason });
    }
    function onPiramideHand({ roundId, cards }) {
      setPiramideHand({ roundId, cards });
    }
    function onVascoRole({ roundId, isImpostor, word }) {
      setVascoRole({ roundId, isImpostor, word });
    }
    function onBoardHand({ cards }) {
      setBoardHand({ cards: cards || [] });
    }
    function onError({ message }) {
      setError(message);
    }
    function onSessionInvalid({ message }) {
      saveSession(null);
      setRoom(null);
      setYouId(null);
      setMessages([]);
      setScreen('home');
      setError(message || 'A sessão expirou.');
    }

    socket.on('room_joined', onRoomJoined);
    socket.on('room_state', onRoomState);
    socket.on('chat_message', onChatMessage);
    socket.on('game_started', onGameStarted);
    socket.on('back_to_lobby', onBackToLobby);
    socket.on('you_are_author', onYouAreAuthor);
    socket.on('intrigas_reason', onIntrigasReason);
    socket.on('piramide_hand', onPiramideHand);
    socket.on('vasco_role', onVascoRole);
    socket.on('board_hand', onBoardHand);
    socket.on('error_msg', onError);
    socket.on('session_invalid', onSessionInvalid);

    return () => {
      socket.off('room_joined', onRoomJoined);
      socket.off('room_state', onRoomState);
      socket.off('chat_message', onChatMessage);
      socket.off('game_started', onGameStarted);
      socket.off('back_to_lobby', onBackToLobby);
      socket.off('you_are_author', onYouAreAuthor);
      socket.off('intrigas_reason', onIntrigasReason);
      socket.off('piramide_hand', onPiramideHand);
      socket.off('vasco_role', onVascoRole);
      socket.off('board_hand', onBoardHand);
      socket.off('error_msg', onError);
      socket.off('session_invalid', onSessionInvalid);
    };
  }, []);

  useEffect(() => {
    function onConnect() {
      setConn('online');
      if (sessionRef.current) {
        socket.emit('rejoin_room', {
          code: sessionRef.current.code,
          playerId: sessionRef.current.playerId,
        });
      }
    }
    function onDisconnect() {
      if (sessionRef.current) setConn('reconnecting');
    }
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (sessionRef.current && !socket.connected) {
      setConn('reconnecting');
      socket.connect();
    }
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const ensureConnected = useCallback(() => {
    if (!socket.connected) socket.connect();
  }, []);

  const createRoom = useCallback(
    (name) => {
      setError(null);
      setMessages([]);
      ensureConnected();
      socket.emit('create_room', { name });
    },
    [ensureConnected]
  );
  const joinRoom = useCallback(
    (code, name) => {
      setError(null);
      setMessages([]);
      ensureConnected();
      socket.emit('join_room', { code, name });
    },
    [ensureConnected]
  );

  const sendMessage = useCallback((text) => socket.emit('send_message', { text }), []);
  const startGame = useCallback((config) => socket.emit('start_game', config), []);
  const voteIntensity = useCallback((intensity) => socket.emit('vote_intensity', { intensity }), []);
  const setMode = useCallback((mode) => socket.emit('set_mode', { mode }), []);
  const addBots = useCallback((count) => socket.emit('dev_add_bots', { count }), []); // playtest (dev)
  const boardPickPawn = useCallback((pawn) => socket.emit('board_pick_pawn', { pawn }), []);
  const boardRoll = useCallback(() => socket.emit('board_roll'), []);
  const boardAdvance = useCallback((squares) => socket.emit('board_advance', { squares }), []);
  const boardResolve = useCallback((payload) => socket.emit('board_resolve', payload || {}), []);
  const boardGamble = useCallback((bet) => socket.emit('board_gamble', { bet }), []);
  const boardEventoPick = useCallback((index) => socket.emit('board_evento_pick', { index }), []);
  const boardBlackjack = useCallback((action) => socket.emit('board_blackjack', { action }), []);
  const boardBeerpong = useCallback((power) => socket.emit('board_beerpong', { power }), []);
  const boardSkip = useCallback(() => socket.emit('board_skip'), []);
  const boardEnd = useCallback(() => socket.emit('board_end'), []);
  const boardKick = useCallback((targetId) => socket.emit('board_kick', { targetId }), []);
  const boardPlayCard = useCallback((cardId, targetId) => socket.emit('board_play_card', { cardId, targetId }), []);
  const addQuestion = useCallback(
    (targetPlayerId, text) => socket.emit('add_question', { targetPlayerId, text }),
    []
  );
  const addSecret = useCallback((text) => socket.emit('add_secret', { text }), []);
  const beginPlay = useCallback(() => socket.emit('begin_play'), []);
  const spinWheel = useCallback(() => socket.emit('spin_wheel'), []);
  const playerAction = useCallback((action) => socket.emit('player_action', { action }), []);
  const chooseBuddy = useCallback((buddyId) => socket.emit('choose_buddy', { buddyId }), []);
  const chooseOption = useCallback((index) => socket.emit('choose_option', { index }), []);
  const chooseTarget = useCallback(
    (accusedPlayerId) => socket.emit('choose_target', { accusedPlayerId }),
    []
  );
  const submitRps = useCallback((move) => socket.emit('submit_rps', { move }), []);
  const castGuess = useCallback(
    (guessedPlayerId) => socket.emit('cast_guess', { guessedPlayerId }),
    []
  );
  const revealResult = useCallback(() => socket.emit('reveal_result'), []);
  const continueRound = useCallback(() => socket.emit('continue_round'), []);
  const piramideReady = useCallback(() => socket.emit('piramide_ready'), []);
  const piramideFlip = useCallback(() => socket.emit('piramide_flip'), []);
  const piramideAssign = useCallback((targetId) => socket.emit('piramide_assign', { targetId }), []);
  const piramidePass = useCallback(() => socket.emit('piramide_pass'), []);
  const piramideRespond = useCallback((decision) => socket.emit('piramide_respond', { decision }), []);
  const piramideNext = useCallback(() => socket.emit('piramide_next'), []);
  const vascoStartClues = useCallback(() => socket.emit('vasco_start_clues'), []);
  const vascoClueDone = useCallback(() => socket.emit('vasco_clue_done'), []);
  const vascoVote = useCallback((suspectId) => socket.emit('vasco_vote', { suspectId }), []);
  const vascoRedeem = useCallback((word) => socket.emit('vasco_redeem', { word }), []);
  const skipTurn = useCallback(() => socket.emit('skip_turn'), []);
  const endGame = useCallback(() => socket.emit('end_game'), []);
  const resetGame = useCallback(() => socket.emit('reset_game'), []);

  const leaveRoom = useCallback(() => {
    saveSession(null);
    socket.disconnect();
    setRoom(null);
    setYouId(null);
    setMessages([]);
    setError(null);
    setAuthorRoundId(null);
    setIntrigasReason(null);
    setPiramideHand(null);
    setVascoRole(null);
    setBoardHand(null);
    setScreen('home');
  }, []);

  function toggleMute() {
    setMuted(sfx.toggleMute());
  }

  return (
    <div className="min-h-full mx-auto max-w-md px-5 py-6 flex flex-col relative">
      <button
        onClick={toggleMute}
        className="fixed top-3 right-3 z-40 fd-card w-10 h-10 grid place-items-center text-lg"
        title={muted ? 'Ligar som' : 'Silenciar'}
      >
        {muted ? '🔇' : '🔊'}
      </button>

      {conn === 'reconnecting' && screen !== 'home' && (
        <div className="mb-3 rounded-lg bg-amber-500/15 text-amber-300 text-center text-sm py-2">
          A religar…
        </div>
      )}

      <ErrorBoundary label={screen}>
      <AnimatePresence mode="wait">
        {screen === 'home' && (
          <Home key="home" error={error} onCreate={createRoom} onJoin={joinRoom} />
        )}
        {screen === 'lobby' && (
          <Lobby
            key="lobby"
            room={room}
            youId={youId}
            messages={messages}
            error={error}
            onSendMessage={sendMessage}
            onStart={startGame}
            onVoteIntensity={voteIntensity}
            onSetMode={setMode}
            onAddBots={addBots}
            onLeave={leaveRoom}
          />
        )}
        {screen === 'board' && (
          <Board
            key="board"
            room={room}
            youId={youId}
            myHand={boardHand?.cards}
            onPickPawn={boardPickPawn}
            onRoll={boardRoll}
            onAdvance={boardAdvance}
            onResolve={boardResolve}
            onGamble={boardGamble}
            onEventoPick={boardEventoPick}
            onBlackjack={boardBlackjack}
            onBeerpong={boardBeerpong}
            onPlayCard={boardPlayCard}
            onSkip={boardSkip}
            onEnd={boardEnd}
            onKick={boardKick}
            onReset={resetGame}
            onLeave={leaveRoom}
          />
        )}
        {screen === 'intensity_reveal' && (
          <IntensityReveal
            key="intensity"
            result={intensityResult}
            onDone={() => setScreen('countdown')}
          />
        )}
        {screen === 'countdown' && <Countdown key="countdown" onDone={() => setScreen('game')} />}
        {screen === 'game' && (
          <Game
            key="game"
            room={room}
            youId={youId}
            authorRoundId={authorRoundId}
            intrigasReason={intrigasReason}
            piramideHand={piramideHand}
            vascoRole={vascoRole}
            onAddQuestion={addQuestion}
            onAddSecret={addSecret}
            onBeginPlay={beginPlay}
            onSpin={spinWheel}
            onAction={playerAction}
            onChooseBuddy={chooseBuddy}
            onChooseOption={chooseOption}
            onChooseTarget={chooseTarget}
            onSubmitRps={submitRps}
            onGuess={castGuess}
            onReveal={revealResult}
            onContinue={continueRound}
            onPiramideReady={piramideReady}
            onPiramideFlip={piramideFlip}
            onPiramideAssign={piramideAssign}
            onPiramidePass={piramidePass}
            onPiramideRespond={piramideRespond}
            onPiramideNext={piramideNext}
            onVascoStartClues={vascoStartClues}
            onVascoClueDone={vascoClueDone}
            onVascoVote={vascoVote}
            onVascoRedeem={vascoRedeem}
            onSkip={skipTurn}
            onEnd={endGame}
            onReset={resetGame}
            onLeave={leaveRoom}
          />
        )}
      </AnimatePresence>
      </ErrorBoundary>
    </div>
  );
}
