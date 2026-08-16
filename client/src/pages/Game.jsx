import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Wheel from '../components/Wheel.jsx';
import { socket } from '../socket.js';

// Ordem ESTÁVEL dos tipos (a roda depende disto). Cores/emoji por tipo.
const TYPES = [
  { key: 'boca_calada', label: 'Boca Calada', color: '#ec4899', emoji: '🤐' },
  { key: 'desafio', label: 'Desafio', color: '#8b5cf6', emoji: '🔥' },
  { key: 'intrigas', label: 'Intrigas', color: '#f59e0b', emoji: '🗳️' },
  { key: 'segredos', label: 'Segredos', color: '#14b8a6', emoji: '🤫' },
];

export default function Game({
  room,
  youId,
  onAddQuestion,
  onBeginPlay,
  onSpin,
  onAction,
  onSkip,
  onEnd,
  onReset,
  onLeave,
}) {
  const [animatedRoundId, setAnimatedRoundId] = useState(null);
  const [flash, setFlash] = useState(null);
  const flashTimer = useRef(null);

  useEffect(() => {
    function onResult({ effect }) {
      setFlash({ ...effect, nonce: Math.random() });
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), 1500);
    }
    socket.on('action_result', onResult);
    return () => {
      socket.off('action_result', onResult);
      clearTimeout(flashTimer.current);
    };
  }, []);

  if (!room?.game) return null;

  const g = room.game;
  const you = room.players.find((p) => p.id === youId);
  const isHost = you?.isHost;

  if (g.phase === 'questions') {
    return (
      <QuestionsPhase
        room={room}
        youId={youId}
        isHost={isHost}
        onAddQuestion={onAddQuestion}
        onBeginPlay={onBeginPlay}
        onLeave={onLeave}
      />
    );
  }

  if (g.phase === 'gameover') {
    return <GameOver room={room} isHost={isHost} onReset={onReset} onLeave={onLeave} />;
  }

  const round = g.round;
  const spinning = g.phase === 'prompt' && round && round.id !== animatedRoundId;
  const revealed = g.phase === 'prompt' && round && round.id === animatedRoundId;
  const currentPlayer = room.players.find((p) => p.id === g.currentPlayerId);
  const isMyTurn = g.currentPlayerId === youId;
  const isBoca = round?.gameTypeKey === 'boca_calada';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col gap-3"
    >
      <PlayersStrip room={room} youId={youId} currentId={g.currentPlayerId} />

      <div className="flex items-center justify-between text-xs text-white/40">
        <span>Ronda {g.roundCount || 0}</span>
        <span className="uppercase tracking-wide">
          {g.intensity === 'picante' ? '🌶️ Picante' : '🍃 Leve'}
        </span>
      </div>

      <Wheel
        segments={TYPES}
        targetKey={round?.gameTypeKey}
        spinning={spinning}
        onDone={() => setAnimatedRoundId(round.id)}
      />

      {/* Fase: à espera que o jogador da vez gire a roda */}
      {g.phase === 'wheel' && (
        <div className="flex flex-col gap-3">
          {isMyTurn ? (
            <>
              <p className="text-center text-lg font-semibold">É a tua vez! 🎉</p>
              <button
                onClick={onSpin}
                className="rounded-xl bg-pink-600 py-4 text-lg font-semibold active:scale-95 transition"
              >
                🎡 Girar a roda
              </button>
            </>
          ) : (
            <p className="text-center text-white/50 py-4">
              Vez de <span className="font-bold text-white">{currentPlayer?.name}</span> — à
              espera que gire a roda…
            </p>
          )}
        </div>
      )}

      {/* Fase: desafio/pergunta revelado */}
      <AnimatePresence>
        {revealed && (
          <motion.div
            key={round.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl bg-white/10 p-5 flex flex-col gap-3 text-center"
          >
            <p className="text-sm font-semibold text-pink-400 uppercase tracking-wide">
              {TYPES.find((t) => t.key === round.gameTypeKey)?.emoji} {round.gameTypeLabel}
            </p>
            <p className="text-lg">{round.prompt?.text || '—'}</p>
            <p className="text-sm text-white/50">
              {isBoca ? 'Pergunta para ' : 'Vez de '}
              <span className="font-bold text-white">{round.currentPlayerName}</span>
            </p>

            {isMyTurn ? (
              <div className="flex gap-3 mt-1">
                {isBoca ? (
                  <>
                    <button
                      onClick={() => onAction('accept')}
                      className="flex-1 rounded-xl bg-emerald-600 py-4 font-semibold active:scale-95 transition"
                    >
                      🎤 Respondo
                    </button>
                    <button
                      onClick={() => onAction('refuse')}
                      className="flex-1 rounded-xl bg-rose-600 py-4 font-semibold active:scale-95 transition"
                    >
                      🤐 Boca Calada (bebo)
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => onAction('accept')}
                      className="flex-1 rounded-xl bg-emerald-600 py-4 font-semibold active:scale-95 transition"
                    >
                      ✅ Aceito
                    </button>
                    <button
                      onClick={() => onAction('refuse')}
                      className="flex-1 rounded-xl bg-rose-600 py-4 font-semibold active:scale-95 transition"
                    >
                      🍺 Recuso (bebo)
                    </button>
                  </>
                )}
              </div>
            ) : (
              <p className="text-sm text-white/40 mt-1">A aguardar {round.currentPlayerName}…</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controlos do host */}
      {isHost && (
        <div className="flex gap-2 mt-auto pt-2">
          <button
            onClick={onSkip}
            className="flex-1 rounded-xl bg-white/10 py-3 text-sm font-medium active:scale-95 transition"
          >
            ⏭️ Saltar vez
          </button>
          <button
            onClick={onEnd}
            className="flex-1 rounded-xl bg-white/10 py-3 text-sm font-medium text-rose-300 active:scale-95 transition"
          >
            Terminar jogo
          </button>
        </div>
      )}

      <AnimatePresence>
        {flash && <FlashOverlay key={flash.nonce} effect={flash} />}
      </AnimatePresence>
    </motion.div>
  );
}

function QuestionsPhase({ room, youId, isHost, onAddQuestion, onBeginPlay, onLeave }) {
  const others = room.players.filter((p) => p.id !== youId);
  const [target, setTarget] = useState(others[0]?.id || '');
  const [text, setText] = useState('');
  const byTarget = room.game.questionsByTarget || {};
  const total = room.game.questionCount || 0;
  const canPlay = room.players.filter((p) => p.connected).length >= 2;

  function submit(e) {
    e.preventDefault();
    const t = text.trim();
    if (!target || t.length < 3) return;
    onAddQuestion(target, t);
    setText('');
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col gap-4"
    >
      <header className="flex items-center justify-between">
        <button onClick={onLeave} className="text-sm text-white/50">
          ← Sair
        </button>
        <h1 className="font-bold">Perguntas 🤐</h1>
        <span className="w-10" />
      </header>

      <p className="text-sm text-white/60 text-center">
        Escreve perguntas embaraçosas dirigidas aos outros. Vão aparecer no{' '}
        <b>Boca Calada</b>: quem calhar responde… ou bebe! 🍺
      </p>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <p className="text-xs text-white/50 mb-2">Para quem?</p>
          <div className="flex flex-wrap gap-2">
            {others.map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => setTarget(p.id)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  target === p.id ? 'bg-pink-600' : 'bg-white/10'
                }`}
              >
                {p.name}
                {byTarget[p.id] ? (
                  <span className="ml-1 text-xs text-white/60">· {byTarget[p.id]}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Ex: "${others[0]?.name || 'Marta'}, quem achas mais feio/a na mesa?"`}
          maxLength={200}
          rows={2}
          className="rounded-xl bg-white/10 px-4 py-3 outline-none focus:ring-2 ring-pink-500 resize-none"
        />
        <button
          type="submit"
          className="rounded-xl bg-white/10 py-3 font-semibold active:scale-95 transition"
        >
          + Adicionar pergunta
        </button>
      </form>

      <p className="text-center text-sm text-white/40">
        {total === 0 ? 'Ainda não há perguntas.' : `${total} pergunta(s) no banco.`}
      </p>

      <div className="mt-auto">
        {isHost ? (
          <button
            onClick={onBeginPlay}
            disabled={!canPlay}
            className="w-full rounded-xl bg-pink-600 py-4 text-lg font-semibold active:scale-95 transition disabled:opacity-40"
          >
            {canPlay ? '🎡 Toca a jogar!' : 'Precisas de ≥2 jogadores'}
          </button>
        ) : (
          <p className="text-center text-sm text-white/40 py-4">
            Escreve perguntas enquanto o host não arranca o jogo…
          </p>
        )}
      </div>
    </motion.div>
  );
}

function PlayersStrip({ room, youId, currentId }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {room.players.map((p) => (
        <div
          key={p.id}
          className={`flex-shrink-0 rounded-xl px-3 py-2 text-center ${
            p.connected ? 'bg-white/10' : 'bg-white/5 opacity-50'
          } ${currentId === p.id ? 'ring-2 ring-pink-500' : ''}`}
        >
          <p className="text-xs font-medium whitespace-nowrap">
            {p.isHost && '👑 '}
            {p.name}
            {p.id === youId && <span className="text-white/40"> (tu)</span>}
          </p>
          <motion.p key={p.lives} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className="text-sm">
            {p.lives > 0 ? '❤️'.repeat(p.lives) : '💀'}
          </motion.p>
        </div>
      ))}
    </div>
  );
}

function FlashOverlay({ effect }) {
  const map = {
    accepted: { text: '🎉 Passou!', color: 'text-emerald-400' },
    vida_perdida: { text: '🍺 -1 vida!', color: 'text-rose-400' },
    shot: { text: '🥃 SHOT!', color: 'text-amber-400' },
  };
  const f = map[effect.type] || { text: '', color: '' };
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.5 }}
      className="fixed inset-0 flex items-center justify-center pointer-events-none z-50"
    >
      <span className={`text-5xl font-black ${f.color} drop-shadow-lg`}>{f.text}</span>
    </motion.div>
  );
}

function GameOver({ room, isHost, onReset, onLeave }) {
  const stats = room.game.finalStats;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 flex flex-col gap-4"
    >
      <h1 className="text-3xl font-black text-center mt-2">Fim de jogo! 🏁</h1>
      <p className="text-center text-white/50 text-sm">{stats?.roundCount || 0} rondas jogadas</p>

      <div className="grid grid-cols-2 gap-3">
        <Award title="Bebeu mais" emoji="🍺" who={stats?.mostDrinks} metric="drinks" unit="copos" />
        <Award title="Recusou mais" emoji="🙅" who={stats?.mostRefusals} metric="refusals" unit="vezes" />
      </div>

      <div className="rounded-xl bg-white/5 p-3">
        <h2 className="text-sm font-semibold text-white/60 mb-2">Placar</h2>
        <ul className="flex flex-col gap-1">
          {stats?.rows?.map((r) => (
            <li key={r.id} className="flex justify-between text-sm">
              <span>{r.name}</span>
              <span className="text-white/60">
                🍺 {r.drinks} · 🥃 {r.shots} · {r.lives > 0 ? '❤️'.repeat(r.lives) : '💀'}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2 mt-auto">
        {isHost && (
          <button
            onClick={onReset}
            className="rounded-xl bg-pink-600 py-4 font-semibold active:scale-95 transition"
          >
            🔄 Jogar outra vez
          </button>
        )}
        <button
          onClick={onLeave}
          className="rounded-xl bg-white/10 py-3 font-medium active:scale-95 transition"
        >
          Sair
        </button>
      </div>
    </motion.div>
  );
}

function Award({ title, emoji, who, metric, unit }) {
  return (
    <div className="rounded-xl bg-white/10 p-3 text-center">
      <p className="text-xs text-white/50">{title}</p>
      <p className="text-3xl my-1">{emoji}</p>
      <p className="font-bold truncate">{who?.name || '—'}</p>
      <p className="text-xs text-white/40">{who ? `${who[metric]} ${unit}` : ''}</p>
    </div>
  );
}
