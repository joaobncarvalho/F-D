import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { sfx } from '../sfx.js';
import { confetti, haptic } from '../confetti.js';

const KIND_ICON = { partida: '🏁', evento: '❓', gamble: '🎲' };
const GAME_EMOJI = {
  boca_calada: '🤐',
  desafio: '🔥',
  intrigas: '🗳️',
  segredos: '🤫',
  piramide: '🔺',
  vasco: '🕵️',
  isto_ou_aquilo: '⚖️',
};
const squareIcon = (sq) => (sq.kind === 'mini' ? GAME_EMOJI[sq.gameKey] || '🎮' : KIND_ICON[sq.kind] || '⬜');
const ADVANCE = [
  { n: 1, golos: 2 },
  { n: 2, golos: 4 },
  { n: 3, golos: 6 },
];

// ---------- Casa ?? : 3 cartas viradas ao contrário + flip da escolhida ----------
function EventoOverlay({ pending, reveal, isMyTurn, currentName, onPick }) {
  const [picked, setPicked] = useState(null); // índice escolhido (otimista, à espera do servidor)
  const [visibleReveal, setVisibleReveal] = useState(null);
  const lastKey = useRef(null);

  const revealKey = reveal ? `${reveal.pickedIndex}|${reveal.title}|${reveal.desc}` : null;

  // Nova revelação chegou: mostra o flip, som/confetti, e auto-esconde.
  useEffect(() => {
    if (!revealKey || revealKey === lastKey.current) return;
    lastKey.current = revealKey;
    setVisibleReveal(reveal);
    setPicked(reveal.pickedIndex);
    sfx.reveal();
    haptic([25, 40, 70]);
    if (reveal.emoji === '🚀' || reveal.card) confetti({ count: 90, power: 13 });
    const t = setTimeout(() => setVisibleReveal(null), 3600);
    return () => clearTimeout(t);
  }, [revealKey, reveal]);

  // Novo mistério a começar: limpa a escolha otimista.
  useEffect(() => {
    if (pending) setPicked(null);
  }, [pending]);

  const mode = pending ? 'pick' : visibleReveal ? 'reveal' : null;
  if (!mode) return null;

  const handleTap = (i) => {
    if (mode !== 'pick' || !isMyTurn || picked !== null) return;
    sfx.click();
    haptic(15);
    setPicked(i);
    onPick(i);
  };

  return (
    <motion.div
      key="evento-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center px-6"
      style={{ background: 'rgba(6,6,12,0.72)', backdropFilter: 'blur(6px)' }}
    >
      <div className="w-full max-w-sm flex flex-col items-center gap-5">
        <motion.div
          initial={{ scale: 0.6, opacity: 0, y: -14 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 16 }}
          className="text-center"
        >
          <p className="text-4xl font-extrabold fd-neon">❓ Casa Mistério</p>
          <p className="text-sm text-white/60 mt-1">
            {mode === 'reveal'
              ? 'A carta virou-se…'
              : isMyTurn
                ? 'Escolhe UMA das 3 cartas'
                : `${currentName || 'O jogador'} está a escolher…`}
          </p>
        </motion.div>

        <div className="flex gap-3 justify-center">
          {[0, 1, 2].map((i) => {
            const isRevealed = mode === 'reveal' && i === visibleReveal.pickedIndex;
            const dimmed = mode === 'reveal' && i !== visibleReveal.pickedIndex;
            const optimistic = mode === 'pick' && picked === i;
            const tappable = mode === 'pick' && isMyTurn && picked === null;
            const front = isRevealed ? visibleReveal : null;
            return (
              <motion.button
                key={i}
                disabled={!tappable}
                onClick={() => handleTap(i)}
                className="relative"
                style={{ width: 92, height: 130, perspective: 800 }}
                initial={{ opacity: 0, y: 30, rotate: -8 + i * 8 }}
                animate={
                  mode === 'pick' && !optimistic
                    ? { opacity: 1, y: [0, -6, 0], rotate: 0, scale: 1 }
                    : { opacity: dimmed ? 0.3 : 1, y: 0, rotate: 0, scale: optimistic || isRevealed ? 1.08 : 1 }
                }
                transition={
                  mode === 'pick' && !optimistic
                    ? { y: { duration: 2.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.18 }, opacity: { duration: 0.3 }, default: { duration: 0.35 } }
                    : { type: 'spring', stiffness: 240, damping: 18 }
                }
                whileTap={tappable ? { scale: 0.93 } : undefined}
              >
                <motion.div
                  className="absolute inset-0"
                  style={{ transformStyle: 'preserve-3d' }}
                  animate={{ rotateY: isRevealed ? 180 : 0 }}
                  transition={{ duration: 0.65, ease: 'easeInOut' }}
                >
                  {/* Verso (?) */}
                  <div
                    className="absolute inset-0 rounded-2xl grid place-items-center text-4xl font-black"
                    style={{
                      backfaceVisibility: 'hidden',
                      WebkitBackfaceVisibility: 'hidden',
                      background: 'linear-gradient(150deg, #9b5cff, #ff3d8b)',
                      border: '2px solid rgba(255,255,255,0.25)',
                      boxShadow: optimistic ? '0 0 26px 2px rgba(255,61,139,0.8)' : '0 12px 26px -10px rgba(0,0,0,0.7)',
                    }}
                  >
                    ?
                  </div>
                  {/* Frente (revelação) */}
                  <div
                    className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center gap-1 px-2 text-center"
                    style={{
                      backfaceVisibility: 'hidden',
                      WebkitBackfaceVisibility: 'hidden',
                      transform: 'rotateY(180deg)',
                      background: 'linear-gradient(160deg, rgba(255,255,255,0.16), rgba(255,255,255,0.06))',
                      border: '2px solid rgba(255,255,255,0.35)',
                      boxShadow: '0 12px 30px -8px rgba(0,0,0,0.7)',
                    }}
                  >
                    {front && (
                      <>
                        <span className="text-4xl leading-none">{front.emoji}</span>
                        <span className="text-sm font-extrabold leading-tight">{front.title}</span>
                        <span className="text-[10px] text-white/70 leading-tight">{front.desc}</span>
                      </>
                    )}
                  </div>
                </motion.div>
              </motion.button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          {mode === 'reveal' && (
            <motion.p
              key="reveal-text"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.5 }}
              className="text-center text-base font-semibold text-amber-200"
            >
              {reveal?.card ? '🎴 Carta nova!' : visibleReveal?.title}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default function Board({ room, youId, onPickPawn, onRoll, onAdvance, onResolve, onGamble, onEventoPick, onPlayCard, onReset, onLeave }) {
  const b = room.board;
  const you = room.players.find((p) => p.id === youId);
  const isHost = you?.isHost;
  const [selCard, setSelCard] = useState(null); // carta selecionada p/ jogar (à espera de alvo)

  // Efeitos por evento (vitória / prisão / passo).
  const wonRef = useRef(false);
  const moveRef = useRef(null);
  useEffect(() => {
    if (b?.phase === 'over' && !wonRef.current) {
      wonRef.current = true;
      sfx.win();
      confetti({ count: 130, power: 16 });
    }
  }, [b?.phase]);
  useEffect(() => {
    const lm = b?.lastMove;
    if (!lm) return;
    const key = lm.playerId + ':' + lm.squares + ':' + lm.golos + ':' + lm.toPrison;
    if (moveRef.current === key) return;
    moveRef.current = key;
    if (lm.toPrison) {
      sfx.shot();
      haptic([80, 50, 120]);
    } else {
      sfx.drink();
      haptic(20);
    }
  }, [b?.lastMove]);

  if (!b) return null;
  const rows = room.players.map((p) => ({ ...p, ...(b.players[p.id] || {}) }));
  const currentPlayer = room.players.find((p) => p.id === b.currentPlayerId);
  const isMyTurn = b.currentPlayerId === youId;

  const Header = ({ children, sub }) => (
    <header className="flex items-center justify-between">
      <button onClick={onLeave} className="text-sm text-white/50">← Sair</button>
      <div className="text-center">
        <h1 className="fd-title font-extrabold text-lg">{children}</h1>
        {sub && <p className="text-xs text-white/40">{sub}</p>}
      </div>
      <span className="w-10" />
    </header>
  );

  // ---------- Escolher peão ----------
  if (b.phase === 'pawn') {
    const taken = rows.map((r) => r.pawn).filter(Boolean);
    const mine = b.players[youId]?.pawn;
    const picked = rows.filter((r) => r.pawn).length;
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col gap-4">
        <Header sub={`${picked}/${rows.filter((r) => r.connected).length} escolheram`}>🎲 Escolhe o teu peão</Header>
        <div className="grid grid-cols-4 gap-2">
          {b.pawns.map((pw, idx) => {
            const isTaken = taken.includes(pw);
            const isMine = mine === pw;
            return (
              <motion.button
                key={pw}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.02, type: 'spring', stiffness: 300, damping: 18 }}
                whileTap={{ scale: 0.9 }}
                disabled={isTaken && !isMine}
                onClick={() => {
                  sfx.click();
                  onPickPawn(pw);
                }}
                className={`fd-card grid place-items-center text-3xl py-3 ${isMine ? 'ring-2 ring-pink-500' : ''} ${
                  isTaken && !isMine ? 'opacity-30' : ''
                }`}
              >
                {pw}
              </motion.button>
            );
          })}
        </div>
        {mine && <p className="text-center text-sm text-emerald-300">Escolheste {mine}! À espera dos outros…</p>}
      </motion.div>
    );
  }

  // ---------- Lançar o dado (ordem) ----------
  if (b.phase === 'order') {
    const myDie = b.dice[youId];
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col gap-4">
        <Header sub="Maior valor joga primeiro">🎲 Lança o dado</Header>
        <div className="fd-card p-4 flex flex-col gap-2">
          {rows
            .filter((r) => r.connected)
            .map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span>
                  {r.pawn} <b>{r.name}</b>
                  {r.id === youId && <span className="text-white/40"> (tu)</span>}
                </span>
                {b.dice[r.id] != null ? (
                  <motion.span
                    key={b.dice[r.id]}
                    initial={{ rotate: -180, scale: 0.3, opacity: 0 }}
                    animate={{ rotate: 0, scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 14 }}
                    className="text-lg"
                  >
                    🎲 {b.dice[r.id]}
                  </motion.span>
                ) : (
                  <span className="text-lg text-white/30">…</span>
                )}
              </div>
            ))}
        </div>
        {myDie == null ? (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              sfx.spin();
              onRoll();
            }}
            className="fd-btn fd-btn-primary text-lg"
          >
            🎲 Lançar o dado
          </motion.button>
        ) : (
          <p className="text-center text-sm text-emerald-300">Tiraste {myDie}! À espera dos outros…</p>
        )}
      </motion.div>
    );
  }

  // ---------- Fim ----------
  if (b.phase === 'over') {
    const board = [...rows].sort((a, c) => c.pos - a.pos);
    const mostGolos = [...rows].sort((a, c) => c.golos - a.golos)[0];
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col gap-4">
        <motion.h1
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 12 }}
          className="fd-title fd-neon text-3xl font-extrabold text-center mt-2"
        >
          Fim da corrida! 🏁
        </motion.h1>
        {b.winner && (
          <div className="fd-card p-3 text-center" style={{ background: 'rgba(31,211,182,0.12)' }}>
            <p className="text-sm text-white/60">🏆 Deu a volta primeiro</p>
            <p className="text-2xl font-extrabold text-emerald-300">
              {b.players[b.winner.id]?.pawn} {b.winner.name}
            </p>
          </div>
        )}
        <div className="fd-card p-3">
          <h2 className="text-sm font-semibold text-white/60 mb-2">Classificação</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {board.map((r, i) => (
              <li key={r.id} className="flex justify-between">
                <span>
                  {i + 1}. {r.pawn} {r.name}
                </span>
                <span className="text-white/60">
                  {r.pos}/{b.size} · 🍺 {r.golos}
                </span>
              </li>
            ))}
          </ul>
          {mostGolos?.golos > 0 && (
            <p className="text-xs text-amber-300 mt-2">🍺 Bebeu mais: {mostGolos.pawn} {mostGolos.name} ({mostGolos.golos} golos)</p>
          )}
        </div>
        <div className="flex flex-col gap-2 mt-auto">
          {isHost && (
            <button onClick={() => { sfx.click(); onReset(); }} className="fd-btn fd-btn-primary">
              🔄 Jogar outra vez
            </button>
          )}
          <button onClick={onLeave} className="fd-btn fd-btn-ghost">Sair</button>
        </div>
      </motion.div>
    );
  }

  // ---------- A jogar ----------
  const leaderboard = [...rows].sort((a, c) => c.pos - a.pos);
  const lm = b.lastMove;
  const ev = b.lastEvent;
  const meta = b.cardMeta || {};
  const myCards = b.players[youId]?.cards || [];
  const pending = b.pending;
  const eventoPending = pending?.kind === 'evento' ? pending : null;
  const targets = room.players.filter((p) => p.connected && p.id !== youId);
  const selMeta = selCard ? meta[selCard.key] : null;
  const needsTarget = selMeta && selCard.key !== 'shield';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col gap-3">
      <Header sub={`corrida até dar a volta (${b.size} casas)`}>
        {isMyTurn ? '🎯 É a tua vez!' : `Vez de ${currentPlayer?.pawn} ${currentPlayer?.name || ''}`}
      </Header>

      {/* Casa ?? — overlay de 3 cartas viradas + flip */}
      <AnimatePresence>
        {(eventoPending || ev?.evento) && (
          <EventoOverlay
            pending={eventoPending}
            reveal={ev?.evento || null}
            isMyTurn={isMyTurn}
            currentName={currentPlayer?.name}
            onPick={onEventoPick}
          />
        )}
      </AnimatePresence>

      {/* Pista (com respiro no topo, não colada à margem) */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="fd-card p-2.5 mt-1"
      >
        <p className="text-[10px] uppercase tracking-widest text-white/35 mb-1.5 px-1">Pista</p>
        <div className="flex gap-1 overflow-x-auto pb-1.5 px-0.5">
          {b.squares.map((sq) => {
            const here = rows.filter((r) => r.pos === sq.i && r.pawn);
            const isCur = b.players[b.currentPlayerId]?.pos === sq.i;
            return (
              <motion.div
                key={sq.i}
                className={`relative flex-shrink-0 w-11 rounded-lg text-center py-1.5 ${
                  sq.kind === 'partida' ? 'bg-pink-500/25' : sq.kind === 'evento' ? 'bg-fuchsia-500/15' : sq.kind === 'gamble' ? 'bg-amber-500/15' : 'bg-white/5'
                } ${isCur ? 'ring-2 ring-pink-500' : ''}`}
                animate={
                  isCur
                    ? { boxShadow: ['0 0 0 0 rgba(255,61,139,0)', '0 0 14px 3px rgba(255,61,139,0.55)', '0 0 0 0 rgba(255,61,139,0)'] }
                    : { boxShadow: '0 0 0 0 rgba(255,61,139,0)' }
                }
                transition={isCur ? { duration: 1.7, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
              >
                <div className="text-lg leading-none">{squareIcon(sq)}</div>
                <div className="text-[9px] text-white/30">{sq.i}</div>
                <div className="text-sm leading-tight min-h-[20px] flex flex-wrap justify-center gap-0.5">
                  {here.map((r) => (
                    <motion.span
                      key={r.id}
                      layoutId={'pawn-' + r.id}
                      transition={{ type: 'spring', stiffness: 480, damping: 30 }}
                      className={r.id === b.currentPlayerId ? 'drop-shadow-[0_0_6px_rgba(255,61,139,0.95)]' : ''}
                    >
                      {r.pawn}
                    </motion.span>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Classificação + cartas (públicas) */}
      <div className="fd-card p-2.5 flex flex-col gap-1">
        {leaderboard.map((r) => (
          <div key={r.id} className={`flex items-center justify-between text-xs ${r.id === b.currentPlayerId ? 'text-pink-300 font-semibold' : ''}`}>
            <span>
              {r.pawn} {r.name}
              {r.shield && ' 🛡️'}
              {r.skipTurns > 0 && <span className="text-rose-300"> 🚔</span>}
            </span>
            <span className="text-white/60">
              {(r.cards || []).map((c) => meta[c.key]?.emoji).join('')} {r.pos}/{b.size} · 🍺 {r.golos}
            </span>
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {ev ? (
          <motion.p
            key={ev.text}
            initial={{ opacity: 0, scale: 0.85, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            className="text-center text-sm text-amber-200"
          >
            {ev.text}
          </motion.p>
        ) : lm ? (
          <motion.p key={'lm' + (moveRef.current || '')} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-xs text-white/50">
            {lm.name} andou {lm.squares} casa{lm.squares > 1 ? 's' : ''} (🍺 {lm.golos})
          </motion.p>
        ) : null}
      </AnimatePresence>

      {/* Resolver a casa onde caiu (mini / gamble — o ?? tem overlay próprio) */}
      {pending && !eventoPending && isMyTurn && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 20 }}
          className="fd-card p-4 flex flex-col gap-3 text-center"
          style={{ boxShadow: '0 10px 30px -12px #ffb02099' }}
        >
          {pending.kind === 'mini' && pending.variant === 'dare' && (
            <>
              <p className="text-xs font-bold uppercase tracking-wide text-white/50">{pending.gameLabel}</p>
              <p className="text-base">{pending.text}</p>
              <div className="flex gap-2">
                <button onClick={() => { sfx.click(); onResolve({ action: 'do' }); }} className="fd-btn fd-btn-success flex-1">✅ Faço!</button>
                <button onClick={() => { sfx.click(); onResolve({ action: 'drink' }); }} className="fd-btn fd-btn-danger flex-1">🍺 Bebo 3</button>
              </div>
            </>
          )}
          {pending.kind === 'mini' && pending.variant === 'choice' && (
            <>
              <p className="text-xs font-bold uppercase tracking-wide text-white/50">⚖️ Isto ou Aquilo?</p>
              {pending.options.map((o, i) => (
                <button key={i} onClick={() => { sfx.click(); onResolve({ choice: i }); }} className="fd-btn fd-btn-ghost text-left py-3">
                  {i === 0 ? '👈 ' : '👉 '}{o}
                </button>
              ))}
            </>
          )}
          {pending.kind === 'gamble' && (
            <>
              <p className="text-lg font-bold text-amber-300">🎲 Gamble!</p>
              <p className="text-sm text-white/60">Aposta 2 golos: 50/50 → avanças 2 ou recuas 2. Passar = ficas.</p>
              <div className="flex gap-2">
                <button onClick={() => { sfx.click(); onGamble(true); }} className="fd-btn fd-btn-amber flex-1">🎲 Apostar</button>
                <button onClick={() => { sfx.click(); onGamble(false); }} className="fd-btn fd-btn-ghost flex-1">Passar</button>
              </div>
            </>
          )}
        </motion.div>
      )}
      {pending && !eventoPending && !isMyTurn && (
        <p className="text-center text-sm text-white/40">{currentPlayer?.name} está a resolver a casa…</p>
      )}

      {/* Cartas + avançar (só a vez, sem casa pendente) */}
      {isMyTurn && !pending && (
        <div className="mt-auto flex flex-col gap-2">
          {myCards.length > 0 && (
            <div className="fd-card p-2.5 flex flex-col gap-2">
              <p className="text-xs text-white/60">🎴 As tuas cartas — joga uma antes de andar:</p>
              <div className="flex flex-wrap gap-2">
                {myCards.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { sfx.click(); setSelCard(selCard?.id === c.id ? null : c); }}
                    className={`fd-chip ${selCard?.id === c.id ? 'fd-chip-on' : ''}`}
                  >
                    {meta[c.key]?.emoji} {meta[c.key]?.name}
                  </button>
                ))}
              </div>
              {selCard && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-white/50">{selMeta?.desc}</p>
                  {needsTarget ? (
                    <div className="flex flex-wrap gap-2">
                      {targets.map((p) => (
                        <button key={p.id} onClick={() => { sfx.click(); onPlayCard(selCard.id, p.id); setSelCard(null); }} className="fd-chip">
                          {b.players[p.id]?.pawn} {p.name}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button onClick={() => { sfx.click(); onPlayCard(selCard.id, null); setSelCard(null); }} className="fd-btn fd-btn-primary py-2 text-sm">
                      Ativar {selMeta?.name}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <p className="text-center text-sm text-white/60">Quanto queres andar? (bebes e avanças)</p>
          <div className="flex gap-2">
            {ADVANCE.map((a) => (
              <motion.button key={a.n} whileTap={{ scale: 0.94 }} onClick={() => { sfx.click(); onAdvance(a.n); }} className="fd-btn fd-btn-primary flex-1 flex flex-col py-3">
                <span className="text-lg font-extrabold">{a.n} casa{a.n > 1 ? 's' : ''}</span>
                <span className="text-xs opacity-80">🍺 {a.golos} golos</span>
              </motion.button>
            ))}
          </div>
          <p className="text-center text-[11px] text-white/35">Andar só 1 casa 3× seguidas → prisão 🚔</p>
        </div>
      )}
      {!isMyTurn && !pending && (
        <p className="text-center text-white/40 py-3 mt-auto">À espera de <b className="text-white">{currentPlayer?.name}</b>…</p>
      )}
    </motion.div>
  );
}
