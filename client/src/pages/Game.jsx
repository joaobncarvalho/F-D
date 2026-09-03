import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Wheel from '../components/Wheel.jsx';
import Beat from '../components/Beat.jsx';
import PalpiteBand from './games/PalpiteBand.jsx';
import DividaBand from './games/DividaBand.jsx';
import { MOLA, PULSA } from '../motion.js';
import BrokenScreen from '../components/BrokenScreen.jsx';
import { TYPES, MODIFICADORES } from './games/shared.jsx';
import { PromptCard, ChoiceCard, IntrigasCard } from './games/cards.jsx';
import { GuessingCard } from './games/GuessingCard.jsx';
import { PiramideCard } from './games/PiramideCard.jsx';
import { VascoCard } from './games/VascoCard.jsx';
import { RelampagoCard, MimicaCard, RoletaCard, DueloCard } from './games/quickCards.jsx';
import { GrupoCard } from './games/grupoCards.jsx';
import { CascataCard } from './games/CascataCard.jsx';
import { DesenhoCard } from './games/DesenhoCard.jsx';
import { ReacaoCard } from './games/ReacaoCard.jsx';
import Feed, { ShareResult } from '../components/Feed.jsx';
import { Avatar } from './games/shared.jsx';
import { socket } from '../socket.js';
import { sfx } from '../sfx.js';
import { confetti, haptic } from '../confetti.js';

// TYPES + CardShell/BuddyBlock/cartas reutilizáveis vivem agora em ./games/*.
const SPIN_PHASES = [
  'prompt',
  'intrigas',
  'guessing',
  'piramide',
  'vasco',
  'choice',
  'relampago',
  'mimica',
  'roleta',
  'duelo',
  'grupo', // eu_nunca · mais_provavel · termometro · quem_disse
  'cascata',
  'desenho',
  'reacao',
];

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
      flashTimer.current = setTimeout(() => setFlash(null), 1250);
      if (effect.type === 'vida_perdida') {
        sfx.drink();
        haptic([40, 30]);
      } else if (effect.type === 'shot') {
        sfx.shot();
        haptic([60, 40, 60]);
      } else if (effect.type === 'vida_extra') {
        sfx.win();
        confetti({ count: 70, power: 13 });
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

  // O som e a vibração da roda passaram a viver DENTRO da Wheel: os tiques têm
  // de estar sincronizados com a rotação real, e o arranque tem de soar depois
  // do recuo, não quando a ronda chega do servidor. Aqui só se marca a ronda
  // como já anunciada, para o efeito não disparar duas vezes.
  useEffect(() => {
    if (round && SPIN_PHASES.includes(g?.phase) && spunRef.current !== round.id) {
      spunRef.current = round.id;
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

      {/* A ÚLTIMA RONDA.
          O anúncio é metade da coisa: uma noite que acaba sem aviso acaba em
          anticlímax, e o jogo passa a ter fim em vez de simplesmente parar. */}
      <AnimatePresence>
        {g.finale && (
          <motion.div
            initial={{ opacity: 0, y: -14, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={MOLA.pop}
            className="fd-card px-4 py-3 text-center"
            style={{
              borderColor: 'rgba(255,176,32,0.55)',
              boxShadow: '0 0 34px -10px rgba(255,176,32,0.75)',
            }}
          >
            <motion.p {...PULSA} className="fd-title text-lg font-extrabold text-amber-300">
              🎬 Última ronda da noite
            </motion.p>
            <p className="text-xs text-white/55 mt-0.5">Façam com que conte — a seguir são as contas.</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between text-xs text-white/40">
        <span>
          Ronda {g.roundCount || 0}
          {g.duracaoMin && !g.finale && (
            <span className="text-white/25">
              {' '}
              · {{ aquecimento: 'aquecimento', meio: '', final: 'reta final' }[g.faseNoite] || ''}
            </span>
          )}
        </span>
        <button onClick={props.onShowRules} className="text-white/40 underline decoration-dotted">
          📖 regras
        </button>
        <span className="uppercase tracking-wide">
          {{ leve: '🍃 Leve', picante: '🌶️ Picante +18', hardcore: '🔥 Hardcore', caos: '💥 Caos' }[
            g.intensity
          ] || '🍃 Leve'}
          {/* A curva sobe a intensidade ao longo da noite: mostra-se o teto votado. */}
          {g.curve && g.intensityCeiling !== g.intensity && (
            <span className="text-white/25"> → {{ picante: '🌶️', hardcore: '🔥', caos: '💥' }[g.intensityCeiling]}</span>
          )}
        </span>
      </div>

      <Feed feed={room.feed} />

      {/* Modificadores em vigor. Uma regra que muda o custo de recusar tem de
          estar à vista de quem vai decidir recusar — não só no lobby, onde foi
          ligada há uma hora. A Morte Súbita destaca-se quando começa a valer. */}
      {g.modifiers?.length > 0 && (
        <div
          className="fd-card p-2.5 flex flex-wrap items-center gap-x-3 gap-y-1"
          style={g.morteSubita ? { borderColor: 'rgba(244,63,94,0.55)' } : undefined}
        >
          {g.modifiers.map((k) => {
            const m = MODIFICADORES[k];
            if (!m) return null;
            const aVigorar = k !== 'morte_subita' || g.morteSubita;
            return (
              <span
                key={k}
                className={`text-xs whitespace-nowrap ${aVigorar ? 'text-white/75' : 'text-white/30'}`}
                title={m.desc}
              >
                {m.emoji} {m.label}
                {k === 'morte_subita' && !g.morteSubita && ' (ainda não)'}
              </span>
            );
          })}
          {g.morteSubita && (
            <span className="text-xs font-bold text-rose-300 w-full">
              💀 Morte Súbita a valer: recusar põe-te fora.
            </span>
          )}
        </div>
      )}

      <DividaBand
        divida={g.divida}
        room={room}
        youId={youId}
        onTransfere={props.onTransfereDivida}
        onHerdeiro={props.onEscolheHerdeiro}
      />

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
            canControl={isHost || isSpinner}
            podeDobrar={!!g.podeDobrar}
            podeAdiar={!!g.podeAdiar}
            morteSubita={!!g.morteSubita}
            onAction={props.onAction}
            onChooseBuddy={props.onChooseBuddy}
            onVota={props.onVotaVeredito}
            onContinue={props.onContinue}
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
        {revealed && g.phase === 'relampago' && (
          <RelampagoCard
            key={round.id}
            round={round}
            room={room}
            youId={youId}
            canControl={isHost || isSpinner}
            onStart={props.onRelampagoStart}
            onTimeUp={props.onRelampagoTimeUp}
            onVota={props.onVotaVeredito}
            onContinue={props.onContinue}
          />
        )}
        {revealed && g.phase === 'mimica' && (
          <MimicaCard
            key={round.id}
            round={round}
            room={room}
            youId={youId}
            word={props.mimicaWord?.roundId === round.id ? props.mimicaWord : null}
            canControl={isHost || isSpinner}
            onStart={props.onMimicaStart}
            onTimeUp={props.onMimicaTimeUp}
            onVota={props.onVotaVeredito}
            onContinue={props.onContinue}
          />
        )}
        {revealed && g.phase === 'roleta' && (
          <RoletaCard
            key={round.id}
            round={round}
            youId={youId}
            canControl={isHost || isSpinner}
            onAnswer={props.onRoletaAnswer}
            onPass={props.onRoletaPass}
            onContinue={props.onContinue}
          />
        )}
        {revealed && g.phase === 'grupo' && (
          <GrupoCard
            key={round.id}
            round={round}
            room={room}
            youId={youId}
            isAuthor={authorRoundId === round.id}
            canControl={isHost || isSpinner}
            onAnswer={props.onGrupoAnswer}
            onReveal={props.onGrupoReveal}
            onContinue={props.onContinue}
          />
        )}
        {revealed && g.phase === 'cascata' && (
          <CascataCard
            key={round.id}
            round={round}
            room={room}
            youId={youId}
            canControl={isHost || isSpinner}
            onStart={props.onCascataStart}
            onStop={props.onCascataStop}
            onContinue={props.onContinue}
          />
        )}
        {revealed && g.phase === 'desenho' && (
          <DesenhoCard
            key={round.id}
            round={round}
            room={room}
            youId={youId}
            word={props.desenhoWord?.roundId === round.id ? props.desenhoWord : null}
            canControl={isHost || isSpinner}
            onStart={props.onDesenhoStart}
            onGuess={props.onDesenhoGuess}
            onGiveUp={props.onDesenhoGiveUp}
            onContinue={props.onContinue}
          />
        )}
        {revealed && g.phase === 'reacao' && (
          <ReacaoCard
            key={round.id}
            round={round}
            room={room}
            youId={youId}
            canControl={isHost || isSpinner}
            onTap={props.onReacaoTap}
            onContinue={props.onContinue}
          />
        )}
        {revealed && g.phase === 'duelo' && (
          <DueloCard
            key={round.id}
            round={round}
            youId={youId}
            canControl={isHost || isSpinner}
            onResult={props.onDueloResult}
            onCall={props.onDueloCall}
            onContinue={props.onContinue}
          />
        )}
      </AnimatePresence>

      {/* A segunda camada da ronda: enquanto um joga, a mesa aposta. Vive por
          BAIXO da carta de propósito — quem está a jogar continua a ver o seu
          desafio em grande, e a plateia ganha o que fazer no tempo de espera. */}
      <AnimatePresence>
        {revealed && round?.palpite && (
          <PalpiteBand
            key={`palpite-${round.id}`}
            palpite={round.palpite}
            room={room}
            youId={youId}
            onPalpite={props.onPalpite}
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

      <AnimatePresence>{flash && <Beat key={flash.nonce} effect={flash} />}</AnimatePresence>
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
          <p className="text-xs font-semibold whitespace-nowrap flex items-center gap-1 justify-center">
            <Avatar player={p} size={20} ring={currentId === p.id} />
            {p.isHost && '👑'}
            {p.name}
            {p.id === youId && <span className="text-white/40">(tu)</span>}
          </p>
          <motion.p key={p.lives} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className="text-sm">
            {p.lives > 0 ? '❤️'.repeat(p.lives) : '💀'}
          </motion.p>
        </div>
      ))}
    </div>
  );
}

/** Dados do cartão de resultados da Roda (o botão vive em components/Feed.jsx). */
function ShareButton({ room, stats }) {
  if (!stats?.rows?.length) return null;
  const jogador = (id) => room.players.find((p) => p.id === id);
  return (
    <ShareResult
      data={() => ({
        title: 'F&D — a nossa noite',
        subtitle: `${stats.roundCount || 0} rondas · ${room.players.length} jogadores`,
        awards: [
          stats.survivor && { emoji: '🏆', label: 'Último de pé', name: stats.survivor.name },
          stats.mostDrinks && { emoji: '🍺', label: 'Bebeu mais', name: stats.mostDrinks.name },
          stats.mostRefusals && { emoji: '🙅', label: 'Recusou mais', name: stats.mostRefusals.name },
        ].filter(Boolean),
        rows: [...stats.rows]
          .sort((a, b) => b.drinks - a.drinks)
          .map((r) => ({
            emoji: jogador(r.id)?.emoji || '🙂',
            name: r.name,
            detail: `🍺 ${r.drinks} · 🥃 ${r.shots}`,
            highlight: r.id === stats.survivor?.id,
          })),
      })}
    />
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

      <ShareButton room={room} stats={stats} />

      {stats?.survivor && (
        <div className="fd-card p-3 text-center" style={{ background: 'rgba(31,211,182,0.12)' }}>
          <p className="text-sm text-white/60">🏆 Último de pé</p>
          <p className="text-2xl font-extrabold text-emerald-300">{stats.survivor.name}</p>
        </div>
      )}

      {/* A Conta fechou. Quem adiou a noite toda vê aqui o que estava a adiar —
          é o momento em que o sistema deixa de ser um número no HUD. */}
      {stats?.contaFinal?.length > 0 && (
        <div className="fd-card p-3">
          <h2 className="text-sm font-semibold text-amber-300 mb-1">📿 A conta fechou</h2>
          <p className="text-xs text-white/50 mb-2">O que ficou por beber venceu no fim da noite.</p>
          <ul className="flex flex-col gap-1">
            {stats.contaFinal.map((c) => (
              <li key={c.id} className="flex justify-between text-sm">
                <span>{c.name}</span>
                <span className="text-amber-300/90">{c.golos} goles</span>
              </li>
            ))}
          </ul>
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
