import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { sfx } from '../sfx.js';
import { confetti, haptic } from '../confetti.js';
import { PlayingCard, BlackjackReveal } from './board/blackjack.jsx';
import { GambleReveal, CardPlayReveal, OrderReveal } from './board/reveals.jsx';
import { Beerpong } from './board/Beerpong.jsx';
import { EventoOverlay } from './board/EventoOverlay.jsx';

const KIND_ICON = { partida: '🏁', evento: '❓', gamble: '🎲', blackjack: '🃏', beerpong: '🏓' };
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

export default function Board({ room, youId, myHand, onPickPawn, onRoll, onAdvance, onResolve, onGamble, onEventoPick, onBlackjack, onBeerpong, onPlayCard, onSkip, onEnd, onKick, onReset, onLeave }) {
  const b = room.board;
  const you = room.players.find((p) => p.id === youId);
  const isHost = you?.isHost;
  const [selCard, setSelCard] = useState(null); // carta selecionada p/ jogar (à espera de alvo)
  const [orderReveal, setOrderReveal] = useState(null); // { dice, order } — revelação da ordem

  // Efeitos por evento (vitória / prisão / passo / blackjack).
  const wonRef = useRef(false);
  const moveRef = useRef(null);
  const trackRef = useRef(null);
  const prevPhaseRef = useRef(b?.phase);
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
    const key = lm.playerId + ':' + lm.squares + ':' + lm.golos + ':' + lm.toPrison + ':' + lm.greedy;
    if (moveRef.current === key) return;
    moveRef.current = key;
    if (lm.toPrison || lm.greedy) {
      sfx.shot();
      haptic([80, 50, 120]);
    } else {
      sfx.drink();
      haptic(20);
    }
  }, [b?.lastMove]);
  // (o som/confetti do Blackjack disparam no fim da revelação animada — ver BlackjackReveal)
  // Segue o ritmo: centra a casa do jogador da vez na tira (scroll SÓ da tira, nunca
  // da página). Acede à célula pelo índice (track.children[pos]) — robusto, sem refs
  // por célula (partilhar 1 ref entre células dava current=null às vezes).
  const curPos = b?.players?.[b?.currentPlayerId]?.pos;
  useEffect(() => {
    const track = trackRef.current;
    if (!track || curPos == null) return;
    let raf = 0;
    const doScroll = () => {
      const cell = track.children[curPos];
      if (!cell) return;
      const target = cell.offsetLeft - (track.clientWidth - cell.offsetWidth) / 2;
      const max = track.scrollWidth - track.clientWidth;
      track.scrollTo({ left: Math.max(0, Math.min(target, max)), behavior: 'smooth' });
    };
    // rAF: garante que corre depois do layout/animação de posição assentar.
    raf = requestAnimationFrame(doScroll);
    return () => cancelAnimationFrame(raf);
  }, [curPos, b?.currentPlayerId, b?.phase]);

  // Revelação da ordem: quando a fase salta order → playing, mostra os dados + quem
  // começa por ~2,8s. Depende só de b.phase (edge) → broadcasts não re-armam o timer.
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = b?.phase;
    if (prev === 'order' && b?.phase === 'playing' && b?.order?.length) {
      setOrderReveal({ dice: { ...b.dice }, order: [...b.order] });
      sfx.spin();
      const t = setTimeout(() => setOrderReveal(null), 2800);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b?.phase]);

  if (!b) return null;
  const rows = room.players.map((p) => ({ ...p, ...(b.players[p.id] || {}) }));
  const currentPlayer = room.players.find((p) => p.id === b.currentPlayerId);
  // O peão vive no estado do TABULEIRO (b.players), não em room.players — senão dava "undefined".
  const currentPawn = b.players?.[b.currentPlayerId]?.pawn || '';
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
    // "Prémios" da corrida — só mostramos os que fazem sentido (valor > 0).
    const top = (key) => [...rows].filter((r) => (r[key] || 0) > 0).sort((a, c) => (c[key] || 0) - (a[key] || 0))[0];
    const mostGolos = top('golos');
    const mostPrison = top('prisonCount');
    const mostCards = top('cardsPlayed');
    const awards = [
      mostGolos && { emoji: '🍺', title: 'Rei da Golada', who: mostGolos, val: `${mostGolos.golos} golos` },
      mostPrison && { emoji: '🚔', title: 'Preso Habitual', who: mostPrison, val: `${mostPrison.prisonCount}× preso` },
      mostCards && { emoji: '🎴', title: 'Maquiavélico', who: mostCards, val: `${mostCards.cardsPlayed} cartas` },
    ].filter(Boolean);
    const medal = ['🥇', '🥈', '🥉'];
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative z-10 flex-1 flex flex-col gap-4">
        <motion.h1
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 12 }}
          className="fd-title fd-neon text-3xl font-extrabold text-center mt-2"
        >
          Fim da corrida! 🏁
        </motion.h1>
        {b.winner && (
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 220, damping: 14 }}
            className="fd-card p-4 text-center"
            style={{ background: 'rgba(31,211,182,0.12)', boxShadow: '0 12px 34px -14px rgba(31,211,182,0.7)' }}
          >
            <p className="text-sm text-white/60">🏆 Deu a volta primeiro</p>
            <motion.p
              className="text-3xl font-extrabold text-emerald-300 leading-tight mt-1"
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            >
              <motion.span
                className="inline-block"
                animate={{ rotate: [0, -12, 12, 0] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              >
                {b.players[b.winner.id]?.pawn}
              </motion.span>{' '}
              {b.winner.name}
            </motion.p>
          </motion.div>
        )}

        {awards.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {awards.map((a, i) => (
              <motion.div
                key={a.title}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.12, type: 'spring', stiffness: 260, damping: 18 }}
                className="fd-card p-2.5 text-center"
              >
                <div className="text-2xl leading-none">{a.emoji}</div>
                <p className="text-[10px] text-white/50 mt-1 leading-tight">{a.title}</p>
                <p className="text-xs font-bold leading-tight mt-0.5">{a.who.pawn} {a.who.name}</p>
                <p className="text-[10px] text-amber-300/90">{a.val}</p>
              </motion.div>
            ))}
          </div>
        )}

        <div className="fd-card p-3">
          <h2 className="text-sm font-semibold text-white/60 mb-2">Classificação final</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {board.map((r, i) => (
              <motion.li
                key={r.id}
                initial={{ opacity: 0, x: -18 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.07 }}
                className={`flex justify-between ${i === 0 ? 'text-emerald-300 font-semibold' : ''}`}
              >
                <span>
                  {medal[i] || `${i + 1}.`} {r.pawn} {r.name}
                </span>
                <span className="text-white/60">
                  {r.pos}/{b.size} · 🍺 {r.golos}
                </span>
              </motion.li>
            ))}
          </ul>
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
  // Cartas PRIVADAS: a minha mão chega por canal próprio (myHand). Fallback ao
  // estado do board para o showroom/demo (que injeta cards diretamente).
  const myCards = myHand ?? b.players[youId]?.cards ?? [];
  const cardCountOf = (r) => r.cardCount ?? (r.cards?.length || 0);
  const myFastStreak = b.players[youId]?.fastStreak || 0;
  const pending = b.pending;
  const eventoPending = pending?.kind === 'evento' ? pending : null;
  const bjPending = pending?.kind === 'blackjack' ? pending : null;
  const beerpongPending = pending?.kind === 'beerpong' ? pending : null;
  const miniGamblePending =
    pending && pending.kind !== 'evento' && pending.kind !== 'blackjack' && pending.kind !== 'beerpong' ? pending : null;
  const targets = room.players.filter((p) => p.connected && p.id !== youId);
  const selMeta = selCard ? meta[selCard.key] : null;
  const needsTarget = selMeta && selCard.key !== 'shield';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col gap-3">
      <Header sub={`corrida até dar a volta (${b.size} casas)`}>
        {isMyTurn ? '🎯 É a tua vez!' : b.currentPlayerId ? `Vez de ${currentPawn} ${currentPlayer?.name || ''}`.trim() : '⏳ À espera de jogadores…'}
      </Header>

      {/* Casa ?? — overlay de 3 cartas viradas + flip */}
      <EventoOverlay
        pending={eventoPending}
        reveal={ev?.evento || null}
        isMyTurn={isMyTurn}
        currentName={currentPlayer?.name}
        onPick={onEventoPick}
      />

      {/* Carta a ser usada — banner flutuante para todos (não bloqueia toques) */}
      {ev?.card && !pending && <CardPlayReveal key={'card' + ev.text} card={ev.card} />}

      {/* Revelação da ordem (breve, no arranque da corrida) */}
      <AnimatePresence>
        {orderReveal && (
          <OrderReveal
            data={orderReveal}
            players={room.players}
            boardPlayers={b.players}
            onClose={() => setOrderReveal(null)}
          />
        )}
      </AnimatePresence>

      {/* Pista em linha — tira horizontal que faz auto-scroll a seguir o jogador da vez */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="fd-card p-2.5 mt-1">
        <p className="text-[10px] uppercase tracking-widest text-white/35 mb-1.5 px-1">Pista</p>
        <div ref={trackRef} className="relative flex gap-1 overflow-x-auto pb-1.5 px-0.5">
          {b.squares.map((sq) => {
            const here = rows.filter((r) => r.pos === sq.i && r.pawn);
            const isCur = b.players[b.currentPlayerId]?.pos === sq.i;
            return (
              <motion.div
                key={sq.i}
                className={`relative flex-shrink-0 w-14 rounded-xl text-center py-2 ${
                  sq.kind === 'partida'
                    ? 'bg-pink-500/25'
                    : sq.kind === 'evento'
                      ? 'bg-fuchsia-500/15'
                      : sq.kind === 'gamble'
                        ? 'bg-amber-500/15'
                        : sq.kind === 'blackjack'
                          ? 'bg-emerald-500/15'
                          : sq.kind === 'beerpong'
                            ? 'bg-sky-500/15'
                            : 'bg-white/5'
                } ${isCur ? 'ring-2 ring-pink-500' : ''}`}
                animate={
                  isCur
                    ? { boxShadow: ['0 0 0 0 rgba(255,61,139,0)', '0 0 16px 4px rgba(255,61,139,0.55)', '0 0 0 0 rgba(255,61,139,0)'] }
                    : { boxShadow: '0 0 0 0 rgba(255,61,139,0)' }
                }
                transition={isCur ? { duration: 1.7, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
              >
                <div className="text-2xl leading-none">{squareIcon(sq)}</div>
                <div className="text-[10px] text-white/30">{sq.i}</div>
                <div className="text-base leading-tight min-h-[20px] flex flex-wrap justify-center gap-0.5">
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
          <div key={r.id} className={`flex items-center justify-between text-xs ${r.id === b.currentPlayerId ? 'text-pink-300 font-semibold' : ''} ${r.connected === false ? 'opacity-40' : ''}`}>
            <span className="flex items-center gap-1">
              {r.pawn} {r.name}
              {r.connected === false && ' 📴'}
              {r.shield && ' 🛡️'}
              {r.skipTurns > 0 && <span className="text-rose-300"> 🚔</span>}
              {isHost && r.connected === false && r.id !== youId && (
                <button onClick={() => { sfx.click(); onKick(r.id); }} className="ml-1 text-rose-300 underline underline-offset-2">expulsar</button>
              )}
            </span>
            <span className="text-white/60">
              {cardCountOf(r) > 0 && <span title="cartas na mão">🎴{cardCountOf(r)} </span>}{r.pos}/{b.size} · 🍺 {r.golos}
            </span>
          </div>
        ))}
        {isHost && (
          <div className="flex gap-2 mt-1.5 pt-1.5" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <button onClick={() => { sfx.click(); onSkip(); }} className="fd-btn fd-btn-ghost flex-1 py-1.5 text-[11px]">⏭️ Saltar vez</button>
            <button onClick={() => { sfx.click(); if (window.confirm('Terminar o jogo agora?')) onEnd(); }} className="fd-btn fd-btn-ghost flex-1 py-1.5 text-[11px]">🏁 Terminar</button>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {ev && !ev.blackjack && !ev.gamble && !ev.beerpong ? (
          <motion.p
            key={ev.text}
            initial={{ opacity: 0, scale: 0.85, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            className={`text-center text-sm ${ev.greed ? 'text-rose-300 font-semibold' : 'text-amber-200'}`}
          >
            {ev.text}
          </motion.p>
        ) : lm && !ev ? (
          <motion.p key={'lm' + (moveRef.current || '')} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-xs text-white/50">
            {lm.name} andou {lm.squares} casa{lm.squares > 1 ? 's' : ''} (🍺 {lm.golos})
          </motion.p>
        ) : null}
      </AnimatePresence>

      {/* Blackjack — mesa (jogador da vez joga; os outros veem). Inline (nunca bloqueia o ecrã). */}
      {bjPending && (
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 20 }}
          className="fd-card p-3.5 flex flex-col gap-2.5 text-center"
          style={{ boxShadow: '0 10px 30px -12px #1fd3b699' }}
        >
          <p className="text-sm font-bold uppercase tracking-wide text-emerald-300">🃏 Blackjack contra a casa</p>
          <div>
            <p className="text-[11px] text-white/40 mb-1">🏠 Casa</p>
            <div className="flex gap-1.5 justify-center">
              {bjPending.dealer.map((c, i) => <PlayingCard key={i} card={c} />)}
              {bjPending.dealerHidden && <PlayingCard hidden />}
            </div>
          </div>
          <div>
            <p className="text-[11px] text-white/40 mb-1">{isMyTurn ? '🫵 Tu' : `${currentPawn} ${currentPlayer?.name || ''}`.trim()} · {bjPending.pv}</p>
            <div className="flex gap-1.5 justify-center flex-wrap">
              {bjPending.player.map((c, i) => <PlayingCard key={i} card={c} />)}
            </div>
          </div>
          {isMyTurn ? (
            <div className="flex gap-2 mt-1">
              <button onClick={() => { sfx.click(); onBlackjack('hit'); }} className="fd-btn fd-btn-primary flex-1">🃏 Mais uma</button>
              <button onClick={() => { sfx.click(); onBlackjack('stand'); }} className="fd-btn fd-btn-ghost flex-1">✋ Plantar</button>
            </div>
          ) : (
            <p className="text-xs text-white/40">{currentPlayer?.name} está a jogar…</p>
          )}
          <p className="text-[11px] text-white/35">Bate a casa (≤21 e mais que o dealer) → avanças + recompensa da sorte 🍀</p>
        </motion.div>
      )}

      {/* Resultado do Blackjack — revelação animada (vira e puxa cartas até ao desfecho) */}
      {ev?.blackjack && !bjPending && (
        <BlackjackReveal key={'bjres' + ev.text} data={ev.blackjack} text={ev.text} />
      )}

      {/* Gamble — dado a girar antes de revelar */}
      {ev?.gamble && !pending && <GambleReveal key={'gam' + ev.text} result={ev.gamble.result} text={ev.text} />}

      {/* Beer Pinga — mesa interativa (apontar/atirar) + revelação do copo */}
      {(beerpongPending || ev?.beerpong) && (
        <Beerpong
          pending={beerpongPending}
          reveal={ev?.beerpong || null}
          isMyTurn={isMyTurn}
          currentLabel={`${currentPawn} ${currentPlayer?.name || ''}`.trim()}
          onShoot={onBeerpong}
        />
      )}

      {/* Resolver a casa onde caiu (mini / gamble — o ?? e o Blackjack têm UI própria) */}
      {miniGamblePending && isMyTurn && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 20 }}
          className="fd-card p-4 flex flex-col gap-3 text-center"
          style={{ boxShadow: '0 10px 30px -12px #ffb02099' }}
        >
          {miniGamblePending.kind === 'mini' && miniGamblePending.variant === 'dare' && (
            <>
              <p className="text-xs font-bold uppercase tracking-wide text-white/50">{miniGamblePending.gameLabel}</p>
              <p className="text-base">{miniGamblePending.text}</p>
              <div className="flex gap-2">
                <button onClick={() => { sfx.click(); onResolve({ action: 'do' }); }} className="fd-btn fd-btn-success flex-1">✅ Faço!</button>
                <button onClick={() => { sfx.click(); onResolve({ action: 'drink' }); }} className="fd-btn fd-btn-danger flex-1">🍺 Bebo 3</button>
              </div>
            </>
          )}
          {miniGamblePending.kind === 'mini' && miniGamblePending.variant === 'choice' && (
            <>
              <p className="text-xs font-bold uppercase tracking-wide text-white/50">⚖️ Isto ou Aquilo?</p>
              {miniGamblePending.options.map((o, i) => (
                <button key={i} onClick={() => { sfx.click(); onResolve({ choice: i }); }} className="fd-btn fd-btn-ghost text-left py-3">
                  {i === 0 ? '👈 ' : '👉 '}{o}
                </button>
              ))}
            </>
          )}
          {miniGamblePending.kind === 'gamble' && (
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
      {miniGamblePending && !isMyTurn && (
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
          {myFastStreak >= 1 && (
            <p className="text-center text-[11px] text-rose-300">🐍 Cuidado: outra de 3 casas seguidas e a ganância castiga-te!</p>
          )}
          <p className="text-center text-[11px] text-white/35">Andar só 1 casa 3× seguidas → prisão 🚔 · andar 3 casas 2× seguidas → azar 🐍</p>
        </div>
      )}
      {!isMyTurn && !pending && (
        <p className="text-center text-white/40 py-3 mt-auto">À espera de <b className="text-white">{currentPlayer?.name}</b>…</p>
      )}
    </motion.div>
  );
}
