import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Wheel from '../components/Wheel.jsx';
import { socket } from '../socket.js';
import { sfx } from '../sfx.js';
import { confetti, haptic } from '../confetti.js';

const TYPES = [
  { key: 'boca_calada', label: 'Boca Calada', color: '#ff3d8b', emoji: '🤐' },
  { key: 'desafio', label: 'Desafio', color: '#9b5cff', emoji: '🔥' },
  { key: 'intrigas', label: 'Intrigas', color: '#ffb020', emoji: '🗳️' },
  { key: 'segredos', label: 'Segredos', color: '#1fd3b6', emoji: '🤫' },
];
const SPIN_PHASES = ['prompt', 'intrigas', 'guessing'];

export default function Game(props) {
  const { room, youId, authorRoundId } = props;
  const g = room?.game;
  const round = g?.round;

  const [animatedRoundId, setAnimatedRoundId] = useState(null);
  const [flash, setFlash] = useState(null);
  const flashTimer = useRef(null);
  const spunRef = useRef(null);
  const revealedRef = useRef(null);

  useEffect(() => {
    function onResult({ effect }) {
      setFlash({ ...effect, nonce: Math.random() });
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), 1500);
      if (effect.type === 'vida_perdida') {
        sfx.drink();
        haptic([40, 30]);
      } else if (effect.type === 'shot') {
        sfx.shot();
        haptic([60, 40, 60]);
      } else {
        sfx.reveal();
      }
    }
    socket.on('action_result', onResult);
    return () => {
      socket.off('action_result', onResult);
      clearTimeout(flashTimer.current);
    };
  }, []);

  // Som ao girar a roda (para todos).
  useEffect(() => {
    if (round && SPIN_PHASES.includes(g?.phase) && spunRef.current !== round.id) {
      spunRef.current = round.id;
      sfx.spin();
      haptic(20);
    }
  }, [round?.id, g?.phase]);

  // Som + confetti no reveal de Intrigas/Segredos.
  useEffect(() => {
    const isReveal = round && (round.revealed || round.substate === 'reveal');
    if (isReveal && revealedRef.current !== round.id) {
      revealedRef.current = round.id;
      sfx.reveal();
      confetti({ count: 70, power: 12 });
      haptic([30, 40, 30]);
      if (round.result?.drinker || round.result?.drinkers?.length) {
        setTimeout(() => sfx.drink(), 250);
      }
    }
  }, [round?.id, round?.revealed, round?.substate]);

  if (!g) return null;

  const you = room.players.find((p) => p.id === youId);
  const isHost = you?.isHost;
  const isSpinner = g.currentPlayerId === youId;

  if (g.phase === 'prep') {
    return <PrepPhase {...props} />;
  }
  if (g.phase === 'gameover') {
    return <GameOver room={room} isHost={isHost} onReset={props.onReset} onLeave={props.onLeave} />;
  }

  const inSpin = SPIN_PHASES.includes(g.phase) && !!round;
  const spinning = inSpin && round.id !== animatedRoundId;
  const revealed = inSpin && round.id === animatedRoundId;
  const currentPlayer = room.players.find((p) => p.id === g.currentPlayerId);
  // Razão do Intrigas, entregue em privado (só a tenho se o servidor ma enviou).
  const intrigasReason =
    props.intrigasReason?.roundId === round?.id ? props.intrigasReason.reason : null;

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

      {(g.phase === 'wheel' || spinning) && (
        <Wheel
          segments={TYPES}
          targetKey={round?.gameTypeKey}
          spinning={spinning}
          onDone={() => setAnimatedRoundId(round.id)}
        />
      )}

      {g.phase === 'wheel' && !spinning && (
        <div className="flex flex-col gap-3">
          {isSpinner ? (
            <>
              <p className="text-center text-lg font-semibold">É a tua vez! 🎉</p>
              <button
                onClick={() => {
                  sfx.click();
                  props.onSpin();
                }}
                className="fd-btn fd-btn-primary text-lg"
              >
                🎡 Girar a roda
              </button>
            </>
          ) : (
            <p className="text-center text-white/50 py-4">
              Vez de <span className="font-bold text-white">{currentPlayer?.name}</span> — à espera
              que gire a roda…
            </p>
          )}
        </div>
      )}

      <AnimatePresence mode="wait">
        {revealed && g.phase === 'prompt' && (
          <PromptCard
            key={round.id}
            round={round}
            isMyTurn={round.currentPlayerId === youId}
            onAction={props.onAction}
          />
        )}
        {revealed && g.phase === 'intrigas' && (
          <IntrigasCard
            key={round.id}
            round={round}
            room={room}
            youId={youId}
            reason={intrigasReason}
            isAccuser={round.currentPlayerId === youId}
            isAccused={round.accusedId === youId}
            canControl={isHost || isSpinner}
            onChooseTarget={props.onChooseTarget}
            onSubmitRps={props.onSubmitRps}
            onContinue={props.onContinue}
          />
        )}
        {revealed && g.phase === 'guessing' && (
          <GuessingCard
            key={round.id}
            round={round}
            room={room}
            youId={youId}
            isAuthor={authorRoundId === round.id}
            canControl={isHost || isSpinner}
            onGuess={props.onGuess}
            onReveal={props.onReveal}
            onContinue={props.onContinue}
          />
        )}
      </AnimatePresence>

      {isHost && (
        <div className="flex gap-2 mt-auto pt-2">
          <button onClick={props.onSkip} className="fd-btn fd-btn-ghost flex-1 py-3 text-sm">
            ⏭️ Saltar vez
          </button>
          <button
            onClick={props.onEnd}
            className="fd-btn fd-btn-ghost flex-1 py-3 text-sm text-rose-300"
          >
            Terminar
          </button>
        </div>
      )}

      <AnimatePresence>{flash && <FlashOverlay key={flash.nonce} effect={flash} />}</AnimatePresence>
    </motion.div>
  );
}

/* ---------------- Fase de preparação (perguntas + segredos) ---------------- */

function PrepPhase({ room, youId, onAddQuestion, onAddSecret, onBeginPlay, onLeave }) {
  const others = room.players.filter((p) => p.id !== youId);
  const [target, setTarget] = useState(others[0]?.id || '');
  const [qText, setQText] = useState('');
  const [sText, setSText] = useState('');
  const g = room.game;
  const byTarget = g.questionsByTarget || {};
  const canPlay = room.players.filter((p) => p.connected).length >= 2;
  const isHost = room.players.find((p) => p.id === youId)?.isHost;

  function submitQuestion(e) {
    e.preventDefault();
    const t = qText.trim();
    if (!target || t.length < 3) return;
    sfx.click();
    onAddQuestion(target, t);
    setQText('');
  }
  function submitSecret(e) {
    e.preventDefault();
    const t = sText.trim();
    if (t.length < 3) return;
    sfx.click();
    onAddSecret(t);
    setSText('');
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
        <h1 className="fd-title font-extrabold text-xl">Preparação 🎭</h1>
        <span className="w-10" />
      </header>

      {/* Perguntas (Boca Calada) */}
      <section className="fd-card p-4 flex flex-col gap-3">
        <div>
          <h2 className="font-bold flex items-center gap-2">🤐 Perguntas</h2>
          <p className="text-xs text-white/50 mt-1">
            Dirigidas a outros — aparecem no <b>Boca Calada</b>. Ex.: "quem achas mais feio/a na
            mesa?"
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {others.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                sfx.click();
                setTarget(p.id);
              }}
              className={`fd-chip ${target === p.id ? 'fd-chip-on' : ''}`}
            >
              {p.name}
              {byTarget[p.id] ? <span className="ml-1 text-xs opacity-70">· {byTarget[p.id]}</span> : null}
            </button>
          ))}
        </div>
        <form onSubmit={submitQuestion} className="flex flex-col gap-2">
          <textarea
            value={qText}
            onChange={(e) => setQText(e.target.value)}
            placeholder={`Pergunta para ${others.find((p) => p.id === target)?.name || '…'}`}
            maxLength={200}
            rows={2}
            className="fd-input resize-none"
          />
          <button type="submit" className="fd-btn fd-btn-ghost py-2 text-sm">
            + Adicionar pergunta
          </button>
        </form>
      </section>

      {/* Segredos */}
      <section className="fd-card p-4 flex flex-col gap-3">
        <div>
          <h2 className="font-bold flex items-center gap-2">🤫 Segredos</h2>
          <p className="text-xs text-white/50 mt-1">
            Anónimos — no <b>Segredos</b> o grupo tenta adivinhar de quem é. Ninguém vê que és tu.
          </p>
        </div>
        <form onSubmit={submitSecret} className="flex flex-col gap-2">
          <textarea
            value={sText}
            onChange={(e) => setSText(e.target.value)}
            placeholder="Um segredo teu…"
            maxLength={200}
            rows={2}
            className="fd-input resize-none"
          />
          <button type="submit" className="fd-btn fd-btn-ghost py-2 text-sm">
            + Adicionar segredo ({g.secretCount || 0})
          </button>
        </form>
      </section>

      <div className="mt-auto">
        {isHost ? (
          <button
            onClick={() => {
              sfx.click();
              onBeginPlay();
            }}
            disabled={!canPlay}
            className="fd-btn fd-btn-primary w-full text-lg"
          >
            {canPlay ? '🎡 Toca a jogar!' : 'Precisas de ≥2 jogadores'}
          </button>
        ) : (
          <p className="text-center text-sm text-white/40 py-4">
            Escreve enquanto o host não arranca o jogo…
          </p>
        )}
      </div>
    </motion.div>
  );
}

/* ---------------- Cartas de ronda ---------------- */

function CardShell({ children, typeKey }) {
  const t = TYPES.find((x) => x.key === typeKey);
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0 }}
      className="fd-card p-5 flex flex-col gap-3 text-center"
      style={{ boxShadow: `0 12px 40px -14px ${t?.color}99` }}
    >
      <p className="text-sm font-bold uppercase tracking-wide" style={{ color: t?.color }}>
        {t?.emoji} {t?.label}
      </p>
      {children}
    </motion.div>
  );
}

function PromptCard({ round, isMyTurn, onAction }) {
  const isBoca = round.gameTypeKey === 'boca_calada';
  return (
    <CardShell typeKey={round.gameTypeKey}>
      <p className="text-lg leading-snug">{round.prompt?.text || '—'}</p>
      <p className="text-sm text-white/50">
        {isBoca ? 'Pergunta para ' : 'Vez de '}
        <span className="font-bold text-white">{round.currentPlayerName}</span>
      </p>
      {isMyTurn ? (
        <div className="flex gap-3 mt-1">
          <button
            onClick={() => {
              sfx.click();
              onAction('accept');
            }}
            className="fd-btn fd-btn-success flex-1"
          >
            {isBoca ? '🎤 Respondo' : '✅ Aceito'}
          </button>
          <button
            onClick={() => {
              sfx.click();
              onAction('refuse');
            }}
            className="fd-btn fd-btn-danger flex-1"
          >
            {isBoca ? '🤐 Boca Calada' : '🍺 Recuso'}
          </button>
        </div>
      ) : (
        <p className="text-sm text-white/40 mt-1">A aguardar {round.currentPlayerName}…</p>
      )}
    </CardShell>
  );
}

const RPS = [
  ['pedra', '✊'],
  ['papel', '✋'],
  ['tesoura', '✌️'],
];

function IntrigasCard({
  round,
  room,
  youId,
  reason,
  isAccuser,
  isAccused,
  canControl,
  onChooseTarget,
  onSubmitRps,
  onContinue,
}) {
  const connected = room.players.filter((p) => p.connected);
  const iSubmitted = round.rpsSubmitted?.includes(youId);
  const inDuel = isAccuser || isAccused;

  // Passo 1 — o acusador escolhe quem
  if (round.substate === 'choosing') {
    if (isAccuser) {
      return (
        <CardShell typeKey="intrigas">
          <p className="text-lg leading-snug">{reason || '…'}</p>
          <p className="text-xs text-white/50">
            Quem é mais provável? A pessoa não vai saber porquê 😏
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {connected
              .filter((p) => p.id !== youId)
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    sfx.click();
                    onChooseTarget(p.id);
                  }}
                  className="fd-chip"
                >
                  {p.name}
                </button>
              ))}
          </div>
        </CardShell>
      );
    }
    return (
      <CardShell typeKey="intrigas">
        <p className="text-base text-white/70">
          🤫 <b>{round.currentPlayerName}</b> recebeu uma pergunta secreta e está a escolher
          alguém…
        </p>
      </CardShell>
    );
  }

  // Passo 2 — pedra-papel-tesoura
  if (round.substate === 'rps') {
    return (
      <CardShell typeKey="intrigas">
        {round.ties > 0 && (
          <p className="text-xs text-amber-300 font-semibold">Empate! Joguem outra vez ({round.ties}) ✊✋✌️</p>
        )}
        {isAccused ? (
          <p className="text-base">
            Foste escolhido/a por <b>{round.currentPlayerName}</b>! Ganha o pedra-papel-tesoura para
            saberes porquê 👀
          </p>
        ) : (
          <>
            {reason && <p className="text-lg leading-snug">{reason}</p>}
            <p className="text-sm text-white/60">
              {round.currentPlayerName} escolheu <b>{round.accusedName}</b>
            </p>
          </>
        )}

        {inDuel ? (
          iSubmitted ? (
            <p className="text-sm text-emerald-300 font-semibold">Jogaste! À espera do outro…</p>
          ) : (
            <div className="flex gap-3 justify-center">
              {RPS.map(([m, e]) => (
                <button
                  key={m}
                  onClick={() => {
                    sfx.click();
                    onSubmitRps(m);
                  }}
                  className="fd-chip text-3xl px-4 py-3"
                >
                  {e}
                </button>
              ))}
            </div>
          )
        ) : (
          <p className="text-xs text-white/50">
            Duelo em curso… {round.rpsSubmitted?.length || 0}/2 jogaram
          </p>
        )}
      </CardShell>
    );
  }

  // Passo 3 — reveal
  const r = round.result;
  return (
    <CardShell typeKey="intrigas">
      {reason ? (
        <p className="text-lg leading-snug">{reason}</p>
      ) : (
        <p className="text-base text-white/50">Pergunta secreta 🤐</p>
      )}
      {r?.accusedWon ? (
        <p className="text-base font-bold text-emerald-300">
          🎉 {round.accusedName} ganhou e fica a saber!
        </p>
      ) : (
        <p className="text-base font-bold text-amber-300">
          😈 {round.accusedName} perde, bebe e nunca vai saber porquê!
        </p>
      )}
      {isAccused && r && !r.accusedLearns && (
        <p className="text-sm text-white/50">Bebe um copo… e boa sorte a descobrir 😏🍺</p>
      )}
      {canControl && (
        <button onClick={onContinue} className="fd-btn fd-btn-primary mt-1">
          Continuar →
        </button>
      )}
    </CardShell>
  );
}

function GuessingCard({ round, room, youId, isAuthor, canControl, onGuess, onReveal, onContinue }) {
  const [guessed, setGuessed] = useState(round.guessers?.includes(youId));
  const connected = room.players.filter((p) => p.connected);
  const eligible = connected.length - (round.hasAuthor ? 1 : 0);

  if (round.revealed) {
    const r = round.result;
    return (
      <CardShell typeKey="segredos">
        <p className="text-base italic text-white/80">"{round.prompt?.text}"</p>
        <p className="text-lg font-bold">
          🎭 Era do/a <span className="text-teal-300">{r?.authorName || '—'}</span>!
        </p>
        {r?.drinkers?.length > 0 ? (
          <p className="text-sm font-semibold text-amber-300">
            🍺 Bebe{r.drinkers.length > 1 ? 'm' : ''}: {r.drinkers.map((d) => d.name).join(', ')}
          </p>
        ) : (
          <p className="text-sm text-white/50">Ninguém bebe desta vez.</p>
        )}
        {canControl && (
          <button onClick={onContinue} className="fd-btn fd-btn-primary mt-1">
            Continuar →
          </button>
        )}
      </CardShell>
    );
  }

  return (
    <CardShell typeKey="segredos">
      <p className="text-lg italic leading-snug">"{round.prompt?.text}"</p>
      {isAuthor ? (
        <p className="text-sm text-teal-300 font-semibold">
          🤫 É o teu segredo! Fica calado e vê os outros a adivinhar…
        </p>
      ) : (
        <>
          <p className="text-xs text-white/50">
            De quem é? {round.guessers?.length || 0}/{eligible} adivinharam
          </p>
          {guessed ? (
            <p className="text-sm text-emerald-300 font-semibold">Adivinhaste! ✓ A aguardar…</p>
          ) : (
            <div className="flex flex-wrap gap-2 justify-center">
              {connected
                .filter((p) => p.id !== youId)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      sfx.click();
                      setGuessed(true);
                      onGuess(p.id);
                    }}
                    className="fd-chip"
                  >
                    {p.name}
                  </button>
                ))}
            </div>
          )}
        </>
      )}
      {canControl && (
        <button onClick={onReveal} className="fd-btn fd-btn-ghost py-2 text-sm mt-1">
          Revelar autor
        </button>
      )}
    </CardShell>
  );
}

/* ---------------- Auxiliares ---------------- */

function PlayersStrip({ room, youId, currentId }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {room.players.map((p) => (
        <div
          key={p.id}
          className={`flex-shrink-0 fd-card px-3 py-2 text-center ${
            p.connected ? '' : 'opacity-50'
          } ${currentId === p.id ? 'ring-2 ring-pink-500' : ''}`}
        >
          <p className="text-xs font-semibold whitespace-nowrap">
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
    accepted: { text: '🎉 Passou!', color: 'text-emerald-300' },
    vida_perdida: { text: '🍺 -1 vida!', color: 'text-rose-300' },
    shot: { text: '🥃 SHOT!', color: 'text-amber-300' },
  };
  const f = map[effect.type] || { text: '', color: '' };
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.6 }}
      className="fixed inset-0 flex items-center justify-center pointer-events-none z-50"
    >
      <span className={`fd-title text-6xl font-extrabold ${f.color} drop-shadow-lg`}>{f.text}</span>
    </motion.div>
  );
}

function GameOver({ room, isHost, onReset, onLeave }) {
  const stats = room.game.finalStats;
  useEffect(() => {
    sfx.win();
    confetti({ count: 130, power: 16 });
  }, []);
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-1 flex flex-col gap-4"
    >
      <h1 className="fd-title fd-neon text-3xl font-extrabold text-center mt-2">Fim de jogo! 🏁</h1>
      <p className="text-center text-white/50 text-sm">{stats?.roundCount || 0} rondas jogadas</p>

      <div className="grid grid-cols-2 gap-3">
        <Award title="Bebeu mais" emoji="🍺" who={stats?.mostDrinks} metric="drinks" unit="copos" />
        <Award title="Recusou mais" emoji="🙅" who={stats?.mostRefusals} metric="refusals" unit="vezes" />
      </div>

      <div className="fd-card p-3">
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
            onClick={() => {
              sfx.click();
              onReset();
            }}
            className="fd-btn fd-btn-primary"
          >
            🔄 Jogar outra vez
          </button>
        )}
        <button onClick={onLeave} className="fd-btn fd-btn-ghost">
          Sair
        </button>
      </div>
    </motion.div>
  );
}

function Award({ title, emoji, who, metric, unit }) {
  return (
    <div className="fd-card p-3 text-center">
      <p className="text-xs text-white/50">{title}</p>
      <p className="text-3xl my-1">{emoji}</p>
      <p className="font-bold truncate">{who?.name || '—'}</p>
      <p className="text-xs text-white/40">{who ? `${who[metric]} ${unit}` : ''}</p>
    </div>
  );
}
