import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Wheel from '../components/Wheel.jsx';
import BrokenScreen from '../components/BrokenScreen.jsx';
import { socket } from '../socket.js';
import { sfx } from '../sfx.js';
import { confetti, haptic } from '../confetti.js';

const TYPES = [
  { key: 'boca_calada', label: 'Boca Calada', color: '#ff3d8b', emoji: '🤐' },
  { key: 'desafio', label: 'Desafio', color: '#9b5cff', emoji: '🔥' },
  { key: 'intrigas', label: 'Intrigas', color: '#ffb020', emoji: '🗳️' },
  { key: 'segredos', label: 'Segredos', color: '#1fd3b6', emoji: '🤫' },
  { key: 'piramide', label: 'Piramide', color: '#5b8cff', emoji: '🔺' },
  { key: 'vasco', label: 'Vasco', color: '#ff8c42', emoji: '🕵️' },
  { key: 'isto_ou_aquilo', label: 'Isto/Aquilo', color: '#4ade80', emoji: '⚖️' },
];
const SPIN_PHASES = ['prompt', 'intrigas', 'guessing', 'piramide', 'vasco', 'choice'];

// Sugestões para os indecisos na preparação (banco curado — offline, sem custo).
// Trocável por geração com a API da Anthropic quando houver ANTHROPIC_API_KEY.
const QUESTION_SUGGESTIONS = [
  'Qual foi a maior vergonha que passaste em público?',
  'Quem desta mesa levarias para uma ilha deserta?',
  'Qual foi a mentira mais parva que já contaste para te safares?',
  'Qual é a coisa mais embaraçosa que tens no telemóvel?',
  'Já ficaste com alguém e te arrependeste na hora? Conta.',
  'Qual foi o pior encontro da tua vida?',
  'Se pudesses apagar uma noite da tua vida, qual era?',
  'Qual é o hábito mais nojento que tens quando estás sozinho/a?',
  'Quem foi o teu pior beijo?',
  'Qual é a app que mais escondes de toda a gente?',
  'Já espiaste o telemóvel de alguém? De quem?',
  'Qual é a tua maior obsessão parva?',
  'Se tivesses de trocar de vida com alguém aqui, quem seria?',
  'Qual foi a coisa mais atrevida que já fizeste?',
];
const SECRET_SUGGESTIONS = [
  'Já fingi estar doente para faltar a um plano com este grupo.',
  'Tenho um talento escondido que ninguém aqui conhece.',
  'Uma vez chorei a ver um anúncio parvo na TV.',
  'Já stalkei o ex de um/a amigo/a nas redes.',
  'Guardo uma mentira que contei a alguém desta mesa.',
  'Já finji que adorei uma prenda que odiei.',
  'Tenho uma playlist secreta que morreria de vergonha se vissem.',
  'Uma vez fugi de um encontro pela casa de banho.',
  'Já mandei mensagem à pessoa errada sobre alguém.',
  'Tenho um crush improvável por um/a famoso/a.',
  'Já comi comida que caiu no chão e não disse a ninguém.',
  'Tenho um medo irracional de uma coisa muito parva.',
];
const suggest = (arr) => arr[Math.floor(Math.random() * arr.length)];

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
      } else if (effect.type === 'vida_extra') {
        sfx.win();
        confetti({ count: 60, power: 12 });
        haptic([30, 40, 30]);
      } else if (effect.type === 'eliminated') {
        sfx.shot();
        haptic([80, 50, 80, 50, 140]);
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
  // (O Vasco usa substate 'reveal' para MOSTRAR O PAPEL — não é clímax; a sua
  //  celebração é feita no VascoCard, na fase 'result'. Por isso excluímo-lo aqui.)
  useEffect(() => {
    const isReveal =
      round &&
      round.gameTypeKey !== 'vasco' &&
      (round.revealed || round.substate === 'reveal');
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
  // Quem "está à vez": na Piramide é o flipper; no Vasco (pistas) é quem dá a pista.
  const highlightId =
    g.phase === 'piramide' && round
      ? round.currentPlayerId
      : g.phase === 'vasco' && round?.substate === 'clues'
        ? round.clueCurrentId
        : g.currentPlayerId;
  // Razão do Intrigas, entregue em privado (só a tenho se o servidor ma enviou).
  const intrigasReason =
    round && props.intrigasReason?.roundId === round.id ? props.intrigasReason.reason : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col gap-3"
    >
      <PlayersStrip room={room} youId={youId} currentId={highlightId} />

      <div className="flex items-center justify-between text-xs text-white/40">
        <span>Ronda {g.roundCount || 0}</span>
        <span className="uppercase tracking-wide">
          {{ leve: '🍃 Leve', picante: '🌶️ Picante +18', hardcore: '🔥 Hardcore', caos: '💥 Caos' }[
            g.intensity
          ] || '🍃 Leve'}
        </span>
      </div>

      {g.activeRules?.length > 0 && (
        <div className="fd-card p-2.5 flex flex-col gap-1">
          <p className="text-xs font-bold text-amber-300">🎵 Regras ativas</p>
          {g.activeRules.map((r) => (
            <p key={r.id} className="text-xs text-white/70 leading-snug">
              <b className="text-white">{r.playerName}</b>: {r.text}{' '}
              <span className="text-amber-300 whitespace-nowrap">
                · resta{r.remaining > 1 ? 'm' : ''} {r.remaining}
              </span>
            </p>
          ))}
        </div>
      )}

      {(g.phase === 'wheel' || spinning) && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 py-2">
          <Wheel
            segments={TYPES}
            targetKey={round?.gameTypeKey}
            spinning={spinning}
            onDone={() => setAnimatedRoundId(round.id)}
          />

          {g.phase === 'wheel' && !spinning && (
            <div className="flex flex-col gap-3 w-full">
              {isSpinner ? (
                <>
                  <p className="text-center text-2xl font-extrabold">É a tua vez! 🎉</p>
                  <button
                    onClick={() => {
                      sfx.click();
                      props.onSpin();
                    }}
                    className="fd-btn fd-btn-primary text-xl py-4"
                  >
                    🎡 Girar a roda
                  </button>
                </>
              ) : (
                <p className="text-center text-white/60 py-2 text-lg">
                  Vez de <span className="font-bold text-white">{currentPlayer?.name}</span> — à
                  espera que gire a roda…
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <AnimatePresence mode="wait">
        {revealed && g.phase === 'prompt' && (
          <PromptCard
            key={round.id}
            round={round}
            room={room}
            youId={youId}
            isMyTurn={round.currentPlayerId === youId}
            onAction={props.onAction}
            onChooseBuddy={props.onChooseBuddy}
          />
        )}
        {revealed && g.phase === 'choice' && (
          <ChoiceCard
            key={round.id}
            round={round}
            room={room}
            youId={youId}
            canControl={isHost || isSpinner}
            onChooseBuddy={props.onChooseBuddy}
            onChooseOption={props.onChooseOption}
            onContinue={props.onContinue}
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
        {revealed && g.phase === 'piramide' && (
          <PiramideCard
            key={round.id}
            round={round}
            room={room}
            youId={youId}
            hand={props.piramideHand?.roundId === round.id ? props.piramideHand.cards : null}
            canControl={isHost || isSpinner}
            onReady={props.onPiramideReady}
            onFlip={props.onPiramideFlip}
            onAssign={props.onPiramideAssign}
            onPass={props.onPiramidePass}
            onRespond={props.onPiramideRespond}
            onNext={props.onPiramideNext}
            onContinue={props.onContinue}
          />
        )}
        {revealed && g.phase === 'vasco' && (
          <VascoCard
            key={round.id}
            round={round}
            room={room}
            youId={youId}
            role={props.vascoRole?.roundId === round.id ? props.vascoRole : null}
            canControl={isHost || isSpinner}
            onStartClues={props.onVascoStartClues}
            onClueDone={props.onVascoClueDone}
            onVote={props.onVascoVote}
            onRedeem={props.onVascoRedeem}
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
      {you?.eliminated && <BrokenScreen />}
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
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                sfx.click();
                setQText(suggest(QUESTION_SUGGESTIONS));
              }}
              className="fd-btn fd-btn-ghost py-2 text-sm flex-1"
              title="Sugestão para indecisos"
            >
              💡 Sugerir
            </button>
            <button type="submit" className="fd-btn fd-btn-ghost py-2 text-sm flex-1">
              + Adicionar
            </button>
          </div>
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
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                sfx.click();
                setSText(suggest(SECRET_SUGGESTIONS));
              }}
              className="fd-btn fd-btn-ghost py-2 text-sm flex-1"
              title="Sugestão para indecisos"
            >
              💡 Sugerir
            </button>
            <button type="submit" className="fd-btn fd-btn-ghost py-2 text-sm flex-1">
              + Adicionar ({g.secretCount || 0})
            </button>
          </div>
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

// Passo/badge do Buddy — partilhado pelo PromptCard e ChoiceCard.
function BuddyBlock({ round, room, youId, isMyTurn, onChooseBuddy }) {
  if (!round.needsBuddy) return null;
  if (round.buddyId) {
    return (
      <p className="text-sm font-bold text-cyan-300">
        🤝 Buddy: {round.buddyName} — bebe sempre que {round.currentPlayerName} beber!
      </p>
    );
  }
  if (isMyTurn) {
    const others = room.players.filter((p) => p.connected && p.id !== youId);
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-cyan-300 font-semibold">🤝 Escolhe o teu Buddy (bebe sempre que tu bebes):</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {others.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                sfx.click();
                onChooseBuddy(p.id);
              }}
              className="fd-chip"
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return <p className="text-sm text-white/50">🤝 {round.currentPlayerName} está a escolher o buddy…</p>;
}

export function PromptCard({ round, room, youId, isMyTurn, onAction, onChooseBuddy }) {
  const isBoca = round.gameTypeKey === 'boca_calada';
  const buddyPending = round.needsBuddy && !round.buddyId;
  return (
    <CardShell typeKey={round.gameTypeKey}>
      <p className="text-lg leading-snug">{round.prompt?.text || '—'}</p>
      <p className="text-sm text-white/50">
        {isBoca ? 'Pergunta para ' : 'Vez de '}
        <span className="font-bold text-white">{round.currentPlayerName}</span>
      </p>
      <BuddyBlock round={round} room={room} youId={youId} isMyTurn={isMyTurn} onChooseBuddy={onChooseBuddy} />
      {isMyTurn && !buddyPending ? (
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
      ) : !isMyTurn ? (
        <p className="text-sm text-white/40 mt-1">A aguardar {round.currentPlayerName}…</p>
      ) : null}
    </CardShell>
  );
}

export function ChoiceCard({ round, room, youId, canControl, onChooseBuddy, onChooseOption, onContinue }) {
  const isMyTurn = round.currentPlayerId === youId;
  const buddyPending = round.needsBuddy && !round.buddyId;
  const resolved = round.status === 'resolved' && round.chosen != null;
  const opts = round.options || [];
  return (
    <CardShell typeKey="isto_ou_aquilo">
      <p className="text-sm text-white/50">
        Vez de <span className="font-bold text-white">{round.currentPlayerName}</span> — Isto ou Aquilo?
      </p>
      <BuddyBlock round={round} room={room} youId={youId} isMyTurn={isMyTurn} onChooseBuddy={onChooseBuddy} />
      <div className="flex flex-col gap-2 mt-1">
        {opts.map((o, i) => {
          const arrow = i === 0 ? '👈 ' : '👉 ';
          if (isMyTurn && !resolved && !buddyPending) {
            return (
              <button
                key={i}
                onClick={() => {
                  sfx.click();
                  onChooseOption(i);
                }}
                className="fd-btn fd-btn-ghost text-left py-3"
              >
                {arrow}
                {o}
              </button>
            );
          }
          const chosen = resolved && round.chosen === i;
          const dim = resolved && round.chosen !== i;
          return (
            <div
              key={i}
              className={`fd-card p-3 text-left text-sm ${
                chosen ? 'ring-2 ring-emerald-400 text-emerald-200 font-semibold' : dim ? 'opacity-40' : ''
              }`}
            >
              {arrow}
              {o}
              {chosen ? ' ✓' : ''}
            </div>
          );
        })}
      </div>
      {resolved ? (
        <>
          <p className="text-sm font-bold text-emerald-300">{round.currentPlayerName} escolheu! 🎉</p>
          {canControl && (
            <button onClick={onContinue} className="fd-btn fd-btn-primary mt-1">
              Continuar →
            </button>
          )}
        </>
      ) : !isMyTurn && !buddyPending ? (
        <p className="text-sm text-white/40">A aguardar a escolha de {round.currentPlayerName}…</p>
      ) : null}
    </CardShell>
  );
}

const RPS = [
  ['pedra', '✊'],
  ['papel', '✋'],
  ['tesoura', '✌️'],
];

export function IntrigasCard({
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
  const connected = room.players.filter((p) => p.connected && !p.eliminated);
  const eligible = connected.length - (round.hasAuthor ? 1 : 0);
  const youElim = room.players.find((p) => p.id === youId)?.eliminated;

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
          {youElim ? (
            <p className="text-sm text-white/50">Estás fora — só a ver 🍿</p>
          ) : guessed ? (
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

/* ---------------- Piramide (Desconfia) ---------------- */

const RED_SUITS = ['♥', '♦'];

function PlayingCard({ rank, suit, faceDown, highlight, size = 'md' }) {
  const dims = size === 'sm' ? 'w-9 h-12 text-sm' : 'w-14 h-20 text-xl';
  if (faceDown) {
    return (
      <div
        className={`${dims} rounded-lg grid place-items-center font-bold shrink-0`}
        style={{
          background: 'linear-gradient(135deg,#3a2a6a,#5b8cff)',
          boxShadow: highlight ? '0 0 0 2px #fff, 0 0 16px #5b8cff' : 'inset 0 0 0 1px rgba(255,255,255,.15)',
        }}
      >
        <span className="opacity-80">🔺</span>
      </div>
    );
  }
  const red = RED_SUITS.includes(suit);
  return (
    <motion.div
      initial={{ rotateY: 90, opacity: 0 }}
      animate={{ rotateY: 0, opacity: 1 }}
      className={`${dims} rounded-lg grid place-items-center font-extrabold bg-white shrink-0`}
      style={{ boxShadow: highlight ? '0 0 0 2px #ffb020' : '0 2px 8px rgba(0,0,0,.4)' }}
    >
      <span className={red ? 'text-rose-600' : 'text-neutral-900'}>
        {rank}
        {suit}
      </span>
    </motion.div>
  );
}

function PyramidBoard({ round }) {
  const nextIdx = round.pyramid.findIndex((c) => !c.flipped);
  const byLevel = {};
  round.pyramid.forEach((c, idx) => {
    (byLevel[c.level] ||= []).push({ ...c, idx });
  });
  const levels = Object.keys(byLevel)
    .map(Number)
    .sort((a, b) => b - a); // topo (nível alto) → base
  return (
    <div className="flex flex-col items-center gap-1.5">
      {levels.map((lvl) => {
        const cards = byLevel[lvl];
        return (
          <div key={lvl} className="flex items-center gap-1.5">
            {cards.map((c) => (
              <PlayingCard
                key={c.id}
                rank={c.rank}
                suit={c.suit}
                faceDown={!c.flipped}
                highlight={c.idx === nextIdx}
                size="sm"
              />
            ))}
            <span className="text-[10px] text-white/40 ml-1 w-10">{cards[0].golos} golos</span>
          </div>
        );
      })}
    </div>
  );
}

function PiramideCard({
  round,
  room,
  youId,
  hand,
  canControl,
  onReady,
  onFlip,
  onAssign,
  onPass,
  onRespond,
  onNext,
  onContinue,
}) {
  const [readied, setReadied] = useState(false);
  const connected = room.players.filter((p) => p.connected);
  const isFlipper = round.currentPlayerId === youId;
  const flipperName = room.players.find((p) => p.id === round.currentPlayerId)?.name || '…';
  const fc = round.flippedCard;

  // Sons pontuais por transição.
  const subRef = useRef(null);
  useEffect(() => {
    const key = `${round.substate}:${fc?.id || ''}`;
    if (subRef.current === key) return;
    subRef.current = key;
    if (round.substate === 'flipping' && fc) sfx.reveal();
    else if (round.substate === 'resolved') {
      sfx.drink();
      haptic([30, 30]);
    } else if (round.substate === 'summary') {
      sfx.win();
      confetti({ count: 90, power: 14 });
    }
  }, [round.substate, fc?.id]);

  // --- Memorização ---
  if (round.substate === 'memorize') {
    return (
      <CardShell typeKey="piramide">
        <p className="text-lg font-bold">🧠 Memoriza as tuas cartas!</p>
        <p className="text-xs text-white/50">
          Vais precisar de te lembrar delas. Depois ficam escondidas e alguém pode desconfiar de ti…
        </p>
        {hand ? (
          <div className="flex justify-center gap-2 my-2">
            {hand.map((c, i) => (
              <PlayingCard key={i} rank={c.rank} suit={c.suit} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-white/40 my-3">A receber cartas…</p>
        )}
        {readied ? (
          <p className="text-sm text-emerald-300 font-semibold">
            Pronto! À espera dos outros… {round.readyCount}/{connected.length}
          </p>
        ) : (
          <button
            onClick={() => {
              sfx.click();
              setReadied(true);
              onReady();
            }}
            className="fd-btn fd-btn-primary"
          >
            ✅ Já memorizei ({round.readyCount}/{connected.length})
          </button>
        )}
      </CardShell>
    );
  }

  // --- Resumo final ---
  if (round.substate === 'summary') {
    const rows = [...(round.summary?.rows || [])].sort((a, b) => b.made - a.made || b.golosGiven - a.golosGiven);
    const winners = round.summary?.winners || [];
    const winnerIds = new Set(winners.map((w) => w.id));
    return (
      <CardShell typeKey="piramide">
        <p className="text-lg font-bold">🔺 Fim da pirâmide!</p>
        {winners.length ? (
          <p className="text-base font-bold text-emerald-300">
            🏆 {winners.map((w) => w.name).join(', ')} fez beber mais — +1 vida!
          </p>
        ) : (
          <p className="text-sm text-white/50">Ninguém fez ninguém beber… sem prémio 🤷</p>
        )}
        <ul className="flex flex-col gap-1 text-sm mt-1">
          {rows.map((r) => (
            <li
              key={r.id}
              className={`flex justify-between ${winnerIds.has(r.id) ? 'text-emerald-300 font-semibold' : ''}`}
            >
              <span>
                {winnerIds.has(r.id) && '🏆 '}
                {r.name}
              </span>
              <span className="text-white/60">
                fez beber {r.made}× · 🍺 {r.golosDrunk}g · 🤨 {r.caught}
              </span>
            </li>
          ))}
        </ul>
        {canControl && (
          <button onClick={onContinue} className="fd-btn fd-btn-primary mt-1">
            Voltar à roda →
          </button>
        )}
      </CardShell>
    );
  }

  // --- Jogo (flipping / challenge / resolved) ---
  const isTarget = round.assign?.targetId === youId;
  const rv = round.reveal;

  return (
    <CardShell typeKey="piramide">
      <PyramidBoard round={round} />

      {fc && (
        <p className="text-sm text-white/60">
          Carta virada:{' '}
          <span className={RED_SUITS.includes(fc.suit) ? 'text-rose-400 font-bold' : 'text-white font-bold'}>
            {fc.rank}
            {fc.suit}
          </span>{' '}
          · nível {fc.level} · <b>{fc.golos} golos</b>
        </p>
      )}

      {/* FLIPPING */}
      {round.substate === 'flipping' &&
        (isFlipper ? (
          !fc ? (
            <button
              onClick={() => {
                sfx.click();
                onFlip();
              }}
              className="fd-btn fd-btn-primary"
            >
              🃏 Virar carta
            </button>
          ) : (
            <>
              <p className="text-sm text-white/60">
                Faz alguém beber (afirma que tens um <b>{fc.rank}</b>) ou passa:
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {connected
                  .filter((p) => p.id !== youId)
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        sfx.click();
                        onAssign(p.id);
                      }}
                      className="fd-chip"
                    >
                      🍺 {p.name}
                    </button>
                  ))}
              </div>
              <button onClick={onPass} className="fd-btn fd-btn-ghost py-2 text-sm">
                Passar (não faço ninguém beber)
              </button>
            </>
          )
        ) : (
          <p className="text-sm text-white/50">
            Vez de <b className="text-white">{flipperName}</b> —{' '}
            {fc ? 'a escolher quem bebe…' : 'a virar carta…'}
          </p>
        ))}

      {/* CHALLENGE */}
      {round.substate === 'challenge' &&
        (isTarget ? (
          <>
            <p className="text-base">
              <b>{round.assign.flipperName}</b> diz ter um <b>{fc.rank}</b> e manda-te beber{' '}
              <b>{fc.golos} golos</b>. Acreditas?
            </p>
            <div className="flex gap-3 mt-1">
              <button
                onClick={() => {
                  sfx.click();
                  onRespond('aceitar');
                }}
                className="fd-btn fd-btn-danger flex-1"
              >
                🍺 Bebo ({fc.golos})
              </button>
              <button
                onClick={() => {
                  sfx.click();
                  onRespond('desconfiar');
                }}
                className="fd-btn fd-btn-success flex-1"
              >
                🤨 Desconfio!
              </button>
            </div>
            <p className="text-[11px] text-white/40">
              Se desconfiares e ele tiver mesmo, bebes o <b>dobro</b> ({fc.golos * 2}).
            </p>
          </>
        ) : (
          <p className="text-sm text-white/60">
            <b className="text-white">{round.assign?.flipperName}</b> mandou{' '}
            <b className="text-white">{round.assign?.targetName}</b> beber {fc.golos} golos — aceita ou desconfia?
          </p>
        ))}

      {/* RESOLVED */}
      {round.substate === 'resolved' && rv && (
        <>
          {rv.decision === 'aceitar' ? (
            <p className="text-base font-bold text-amber-300">
              🍺 {rv.drinkerName} aceitou e bebeu {rv.golos} golos.
            </p>
          ) : rv.hadIt ? (
            <p className="text-base font-bold text-amber-300">
              😅 Tinha mesmo{rv.matchedCard ? ` (${rv.matchedCard.rank}${rv.matchedCard.suit})` : ''}! {rv.drinkerName}{' '}
              desconfiou mal e bebe o dobro: {rv.golos} golos.
            </p>
          ) : (
            <p className="text-base font-bold text-emerald-300">
              😈 Bluff apanhado! {rv.drinkerName} não tinha nada e bebe o dobro: {rv.golos} golos.
            </p>
          )}
          {(isFlipper || canControl) && (
            <button onClick={onNext} className="fd-btn fd-btn-primary mt-1">
              Próxima carta →
            </button>
          )}
        </>
      )}
    </CardShell>
  );
}

/* ---------------- Jogo do Vasco (Impostor) ---------------- */

function VascoCard({ round, room, youId, role, canControl, onStartClues, onClueDone, onVote, onRedeem, onReveal, onContinue }) {
  const theme = round.theme;
  const isImpostor = role?.isImpostor;
  const secretWord = role?.word || null; // só o grupo tem a palavra
  const sub = round.substate;
  const activeCount = room.players.filter((p) => p.connected && !p.eliminated).length;
  const youElim = room.players.find((p) => p.id === youId)?.eliminated;

  // Som no resultado.
  const doneRef = useRef(null);
  useEffect(() => {
    if (sub === 'result' && doneRef.current !== round.id) {
      doneRef.current = round.id;
      sfx.reveal();
      confetti({ count: 80, power: 13 });
      haptic([30, 40, 30]);
    }
  }, [sub, round.id]);

  // --- Reveal do papel ---
  if (sub === 'reveal') {
    return (
      <CardShell typeKey="vasco">
        {role ? (
          isImpostor ? (
            <>
              <p className="text-4xl">🕵️</p>
              <p className="text-xl font-extrabold text-orange-300">És o VASCO!</p>
              <p className="text-sm text-white/60">
                Não sabes a palavra. A tua única pista é o tema — ouve as pistas dos outros e
                descobre-a.
              </p>
              <p className="text-lg">
                Tema: <b className="text-teal-300">{theme}</b>
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-white/60">A palavra do grupo é:</p>
              <p className="text-3xl font-extrabold text-teal-300">{secretWord}</p>
              <p className="text-sm">
                Tema (o Vasco só sabe isto): <b className="text-teal-300">{theme}</b>
              </p>
              <p className="text-xs text-white/50">
                Há {round.impostorCount} Vasco(s) infiltrado(s) 🕵️ — dá pistas sem entregar a
                palavra!
              </p>
            </>
          )
        ) : (
          <p className="text-sm text-white/40">A receber o teu papel…</p>
        )}
        {canControl && (
          <button onClick={onStartClues} className="fd-btn fd-btn-primary mt-1">
            Toca a dar pistas →
          </button>
        )}
      </CardShell>
    );
  }

  // --- Ronda de pistas ---
  if (sub === 'clues') {
    const cur = room.players.find((p) => p.id === round.clueCurrentId);
    const isMyTurn = round.clueCurrentId === youId;
    return (
      <CardShell typeKey="vasco">
        <p className="text-base">
          Tema: <b className="text-teal-300">{theme}</b>
        </p>
        {!isImpostor && secretWord && (
          <p className="text-sm text-white/60">
            Palavra: <b className="text-teal-300">{secretWord}</b>
          </p>
        )}
        <p className="text-base mt-1">
          Pista de <b className="text-white">{cur?.name || '…'}</b>
          {isMyTurn && <span className="text-orange-300"> (és tu!)</span>}
        </p>
        <p className="text-xs text-white/50">Diz em voz alta UMA palavra ligada à palavra secreta.</p>
        {isMyTurn || canControl ? (
          <button
            onClick={() => {
              sfx.click();
              onClueDone();
            }}
            className="fd-btn fd-btn-primary"
          >
            ✅ Dei a minha pista →
          </button>
        ) : (
          <p className="text-xs text-white/40">à espera de {cur?.name}…</p>
        )}
      </CardShell>
    );
  }

  // --- Votação: quem é o Vasco? (todos votam; o host não arbitra) ---
  if (sub === 'voting') {
    const voted = round.voterIds?.includes(youId);
    const others = room.players.filter((p) => p.connected && !p.eliminated && p.id !== youId);
    return (
      <CardShell typeKey="vasco">
        <p className="text-lg font-bold text-orange-300">🗳️ Quem é o Vasco?</p>
        <p className="text-sm text-white/60">
          Tema: <b className="text-teal-300">{theme}</b> — votem no infiltrado que não sabia a palavra.
        </p>
        {youElim ? (
          <p className="text-sm text-white/50">Estás fora — só a ver 🍿 ({round.voterIds.length}/{activeCount})</p>
        ) : voted ? (
          <p className="text-sm text-emerald-300 font-semibold">
            Votaste! À espera dos outros… {round.voterIds.length}/{activeCount}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2 justify-center">
            {others.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  sfx.click();
                  onVote(p.id);
                }}
                className="fd-chip"
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
        {canControl && (
          <button onClick={onReveal} className="fd-btn fd-btn-ghost py-2 text-sm">
            Fechar votação
          </button>
        )}
      </CardShell>
    );
  }

  // --- Redenção: o Vasco apanhado tenta adivinhar a palavra ---
  if (sub === 'redemption') {
    const accused = round.accused;
    const iAmAccused = accused?.id === youId;
    const words = round.boardWords || [];
    return (
      <CardShell typeKey="vasco">
        <p className="text-lg font-bold text-orange-300">🎯 Apanhado!</p>
        <p className="text-base">
          <b>{accused?.name}</b> é o Vasco! Última hipótese para se safar: adivinhar a palavra do grupo.
        </p>
        <p className="text-sm">
          Tema: <b className="text-teal-300">{theme}</b>
        </p>
        {iAmAccused ? (
          <div className="grid grid-cols-3 gap-1.5">
            {words.map((w) => (
              <button
                key={w}
                onClick={() => {
                  sfx.click();
                  onRedeem(w);
                }}
                className="rounded-lg px-2 py-2 text-center text-sm bg-white/5 hover:bg-white/15 active:scale-95 transition"
              >
                {w}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-white/50">{accused?.name} está a tentar adivinhar… 👀</p>
        )}
      </CardShell>
    );
  }

  // --- Resultado ---
  const r = round.result;
  const caughtRight = r?.accusedId && r.impostors?.some((i) => i.id === r.accusedId);
  return (
    <CardShell typeKey="vasco">
      <p className="text-sm text-white/60">A palavra era:</p>
      <p className="text-3xl font-extrabold text-teal-300">{r?.secretWord}</p>
      {r?.accusedName ? (
        <p className="text-sm text-white/70">
          O grupo acusou <b>{r.accusedName}</b> {caughtRight ? '— e acertou! 🎯' : '— mas falhou 🙈'}
        </p>
      ) : (
        <p className="text-sm text-white/70">O grupo não chegou a acordo (empate).</p>
      )}
      {r?.redemption && (
        <p className="text-sm text-white/70">
          Redenção: {r.redemption.by.name} disse “{r.redemption.word}” —{' '}
          {r.redemption.correct ? 'acertou e safou-se! 😎' : 'falhou 😖'}
        </p>
      )}
      <ul className="flex flex-col gap-1 text-sm mt-1">
        {r?.impostors?.map((imp) => (
          <li key={imp.id} className={imp.outcome === 'vida' ? 'text-emerald-300 font-semibold' : 'text-amber-300'}>
            🕵️ <b>{imp.name}</b> —{' '}
            {imp.outcome === 'vida'
              ? imp.caught
                ? 'safou-se! +1 vida 💚'
                : 'escapou! +1 vida 💚'
              : `apanhado, bebe ${r.golos} golos 🍺`}
          </li>
        ))}
      </ul>
      {canControl && (
        <button onClick={onContinue} className="fd-btn fd-btn-primary mt-1">
          Voltar à roda →
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
            p.connected && !p.eliminated ? '' : 'opacity-45'
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
    vida_extra: { text: '💚 +1 vida!', color: 'text-emerald-300' },
    eliminated: { text: '💀 Sem vidas!', color: 'text-rose-400' },
  };
  const f = map[effect.type] || { text: '', color: '' };
  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.7 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -14, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="fixed inset-x-0 top-[12vh] flex justify-center pointer-events-none z-50 px-4"
    >
      <span
        className={`fd-title text-4xl sm:text-5xl font-extrabold ${f.color} drop-shadow-lg text-center`}
        style={{ textShadow: '0 2px 18px rgba(0,0,0,0.7)' }}
      >
        {f.text}
      </span>
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

      {stats?.survivor && (
        <div className="fd-card p-3 text-center" style={{ background: 'rgba(31,211,182,0.12)' }}>
          <p className="text-sm text-white/60">🏆 Último de pé</p>
          <p className="text-2xl font-extrabold text-emerald-300">{stats.survivor.name}</p>
        </div>
      )}

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
