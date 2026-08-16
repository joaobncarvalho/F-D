import { useEffect, useState, useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { socket } from './socket.js';
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
  const [screen, setScreen] = useState('home'); // home | lobby | countdown | game
  const [room, setRoom] = useState(null);
  const [youId, setYouId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [conn, setConn] = useState('online'); // online | reconnecting

  // Sessão para reconexão (código + playerId). Persistida para sobreviver a refresh.
  const sessionRef = useRef(loadSession());

  function saveSession(s) {
    sessionRef.current = s;
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  }

  // --- Eventos de domínio (registados uma vez) ---
  useEffect(() => {
    function onRoomJoined({ room, you }) {
      setRoom(room);
      setYouId(you);
      setError(null);
      saveSession({ code: room.code, playerId: you, name: room.players.find((p) => p.id === you)?.name });
      // Se o jogo já começou (ex.: reconexão a meio), vai direto para o jogo.
      setScreen(room.status === 'playing' ? 'game' : 'lobby');
    }
    function onRoomState({ room }) {
      setRoom(room);
    }
    function onChatMessage(msg) {
      setMessages((prev) => [...prev, msg]);
    }
    function onGameStarted() {
      setScreen('countdown');
    }
    function onBackToLobby() {
      setScreen('lobby');
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
    socket.on('error_msg', onError);
    socket.on('session_invalid', onSessionInvalid);

    return () => {
      socket.off('room_joined', onRoomJoined);
      socket.off('room_state', onRoomState);
      socket.off('chat_message', onChatMessage);
      socket.off('game_started', onGameStarted);
      socket.off('back_to_lobby', onBackToLobby);
      socket.off('error_msg', onError);
      socket.off('session_invalid', onSessionInvalid);
    };
  }, []);

  // --- Ciclo de vida da ligação + reconexão ---
  useEffect(() => {
    function onConnect() {
      setConn('online');
      // Se já tínhamos sessão, isto é uma reconexão → religar à sala.
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

    // Restaurar sessão após refresh.
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

  const sendMessage = useCallback((text) => {
    socket.emit('send_message', { text });
  }, []);

  const startGame = useCallback((config) => {
    socket.emit('start_game', config);
  }, []);

  const addQuestion = useCallback(
    (targetPlayerId, text) => socket.emit('add_question', { targetPlayerId, text }),
    []
  );
  const beginPlay = useCallback(() => socket.emit('begin_play'), []);
  const spinWheel = useCallback(() => socket.emit('spin_wheel'), []);
  const playerAction = useCallback((action) => socket.emit('player_action', { action }), []);
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
    setScreen('home');
  }, []);

  return (
    <div className="min-h-full mx-auto max-w-md px-5 py-6 flex flex-col">
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
        {screen === 'countdown' && (
          <Countdown key="countdown" onDone={() => setScreen('game')} />
        )}
        {screen === 'game' && (
          <Game
            key="game"
            room={room}
            youId={youId}
            onAddQuestion={addQuestion}
            onBeginPlay={beginPlay}
            onSpin={spinWheel}
            onAction={playerAction}
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
