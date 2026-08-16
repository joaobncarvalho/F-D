import { useEffect, useState, useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { socket } from './socket.js';
import { sfx } from './sfx.js';
import Home from './pages/Home.jsx';
import Lobby from './pages/Lobby.jsx';
import Game from './pages/Game.jsx';
import Countdown from './components/Countdown.jsx';

const SESSION_KEY = 'fd_session';

function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
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
  const [muted, setMuted] = useState(sfx.isMuted());

  const sessionRef = useRef(loadSession());

  function saveSession(s) {
    sessionRef.current = s;
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
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
    function onGameStarted() {
      setAuthorRoundId(null);
      setScreen('countdown');
    }
    function onBackToLobby() {
      setAuthorRoundId(null);
      setScreen('lobby');
    }
    function onYouAreAuthor({ roundId }) {
      setAuthorRoundId(roundId);
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
    socket.on('error_msg', onError);
    socket.on('session_invalid', onSessionInvalid);

    return () => {
      socket.off('room_joined', onRoomJoined);
      socket.off('room_state', onRoomState);
      socket.off('chat_message', onChatMessage);
      socket.off('game_started', onGameStarted);
      socket.off('back_to_lobby', onBackToLobby);
      socket.off('you_are_author', onYouAreAuthor);
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
  const addQuestion = useCallback(
    (targetPlayerId, text) => socket.emit('add_question', { targetPlayerId, text }),
    []
  );
  const addSecret = useCallback((text) => socket.emit('add_secret', { text }), []);
  const beginPlay = useCallback(() => socket.emit('begin_play'), []);
  const spinWheel = useCallback(() => socket.emit('spin_wheel'), []);
  const playerAction = useCallback((action) => socket.emit('player_action', { action }), []);
  const castVote = useCallback((targetPlayerId) => socket.emit('cast_vote', { targetPlayerId }), []);
  const castGuess = useCallback(
    (guessedPlayerId) => socket.emit('cast_guess', { guessedPlayerId }),
    []
  );
  const revealResult = useCallback(() => socket.emit('reveal_result'), []);
  const continueRound = useCallback(() => socket.emit('continue_round'), []);
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
            onLeave={leaveRoom}
          />
        )}
        {screen === 'countdown' && <Countdown key="countdown" onDone={() => setScreen('game')} />}
        {screen === 'game' && (
          <Game
            key="game"
            room={room}
            youId={youId}
            authorRoundId={authorRoundId}
            onAddQuestion={addQuestion}
            onAddSecret={addSecret}
            onBeginPlay={beginPlay}
            onSpin={spinWheel}
            onAction={playerAction}
            onVote={castVote}
            onGuess={castGuess}
            onReveal={revealResult}
            onContinue={continueRound}
            onSkip={skipTurn}
            onEnd={endGame}
            onReset={resetGame}
            onLeave={leaveRoom}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
