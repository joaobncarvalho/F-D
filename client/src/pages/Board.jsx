import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { sfx } from '../sfx.js';
import { confetti, haptic } from '../confetti.js';

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

// ---------- Carta de baralho (Blackjack) ----------
function PlayingCard({ card, hidden, small }) {
  const size = small ? 'w-7 h-10 text-[11px]' : 'w-9 h-12 text-sm';
  if (hidden || !card) {
    return (
      <div
        className={`${size} rounded-md grid place-items-center font-black text-white`}
        style={{ background: 'linear-gradient(150deg,#9b5cff,#ff3d8b)', border: '1.5px solid rgba(255,255,255,0.3)' }}
      >
        ?
      </div>
    );
  }
  const red = card.suit === '♥' || card.suit === '♦';
  return (
    <div
      className={`${size} rounded-md flex flex-col items-center justify-center font-extrabold bg-white leading-none`}
      style={{ color: red ? '#d61f5c' : '#1a1a22', border: '1.5px solid rgba(0,0,0,0.15)' }}
    >
      <span>{card.rank}</span>
      <span>{card.suit}</span>
    </div>
  );
}

// Valor de uma mão de Blackjack (Ás vale 11 ou 1). Igual ao servidor — só p/ mostrar
// o total a subir à medida que as cartas viram.
function bjValue(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 'A') { total += 11; aces += 1; }
    else if (c.rank === 'K' || c.rank === 'Q' || c.rank === 'J' || c.rank === '10') total += 10;
    else total += Number(c.rank);
  }
  while (total > 21 && aces > 0) { total -= 10; aces -= 1; }
  return total;
}

// Carta do dealer que estava tapada e faz flip 3D quando é revelada.
function FlipDealerCard({ card, faceUp }) {
  const red = card.suit === '♥' || card.suit === '♦';
  return (
    <div style={{ width: 36, height: 48, perspective: 500 }} className="relative">
      <motion.div className="absolute inset-0" style={{ transformStyle: 'preserve-3d' }} animate={{ rotateY: faceUp ? 180 : 0 }} transition={{ duration: 0.5, ease: 'easeInOut' }}>
        <div
          className="absolute inset-0 rounded-md grid place-items-center font-black text-white text-sm"
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', background: 'linear-gradient(150deg,#9b5cff,#ff3d8b)', border: '1.5px solid rgba(255,255,255,0.3)' }}
        >
          ?
        </div>
        <div
          className="absolute inset-0 rounded-md flex flex-col items-center justify-center font-extrabold bg-white leading-none text-sm"
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)', color: red ? '#d61f5c' : '#1a1a22', border: '1.5px solid rgba(0,0,0,0.15)' }}
        >
          <span>{card.rank}</span>
          <span>{card.suit}</span>
        </div>
      </motion.div>
    </div>
  );
}

// Revelação animada do Blackjack: vira a carta tapada e vai puxando cartas uma a uma
// (o servidor já calculou a mão final) até ao resultado. Remonta a cada resultado (key).
function BlackjackReveal({ data, text }) {
  const { result, player, dealer, pv } = data;
  const [shown, setShown] = useState(1); // nº de cartas do dealer já reveladas (começa na upcard)
  const [done, setDone] = useState(false);
  const endedRef = useRef(false);

  const playEnd = () => {
    if (endedRef.current) return;
    endedRef.current = true;
    setDone(true);
    if (result === 'win') { sfx.win(); confetti({ count: 90, power: 13 }); haptic([20, 40, 80]); }
    else if (result === 'push') sfx.reveal();
    else { sfx.shot(); haptic([80, 50, 120]); }
  };

  useEffect(() => {
    const STEP = 750;
    const timers = [];
    for (let i = 2; i <= dealer.length; i++) {
      timers.push(setTimeout(() => { setShown(i); sfx.click(); haptic(10); }, (i - 1) * STEP));
    }
    timers.push(setTimeout(playEnd, Math.max(1, dealer.length - 1) * STEP + 450));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skip = () => { setShown(dealer.length); playEnd(); };
  const dealerVal = bjValue(dealer.slice(0, shown));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={skip}
      className="fd-card p-3 flex flex-col gap-2 text-center"
      style={{ boxShadow: done ? (result === 'win' ? '0 10px 30px -12px #1fd3b6cc' : result === 'push' ? '0 10px 30px -12px #ffffff44' : '0 10px 30px -12px #ff4d6d99') : '0 10px 30px -12px #1fd3b699' }}
    >
      <p className="text-sm font-bold">
        {done ? (result === 'win' ? '🏆 Bateste a casa!' : result === 'push' ? '🤝 Empate' : '🏠 A casa venceu') : '🃏 A casa vira as cartas…'}
      </p>
      <div>
        <p className="text-[11px] text-white/40 mb-1">🏠 Casa · {dealerVal}{!done && dealerVal < 17 ? '…' : ''}</p>
        <div className="flex gap-1.5 justify-center min-h-[48px] items-center">
          {dealer.map((c, i) => {
            const revealed = i < shown;
            if (i === 0) return <PlayingCard key={i} card={c} />;
            if (i === 1) return <FlipDealerCard key={i} card={c} faceUp={revealed} />;
            if (!revealed) return null; // hit ainda não distribuído
            return (
              <motion.div key={i} initial={{ opacity: 0, y: -16, scale: 0.6 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 18 }}>
                <PlayingCard card={c} />
              </motion.div>
            );
          })}
        </div>
      </div>
      <div>
        <p className="text-[11px] text-white/40 mb-1">🫵 Jogador · {pv}</p>
        <div className="flex gap-1.5 justify-center flex-wrap">
          {player.map((c, i) => <PlayingCard key={i} card={c} />)}
        </div>
      </div>
      <AnimatePresence>
        {done && (
          <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`text-xs ${result === 'win' ? 'text-emerald-300' : result === 'push' ? 'text-white/60' : 'text-rose-300'}`}>
            {text}
          </motion.p>
        )}
      </AnimatePresence>
      {!done && <p className="text-[10px] text-white/30">(toca para saltar)</p>}
    </motion.div>
  );
}

// ---------- Gamble: dado a girar antes de revelar o resultado ----------
function GambleReveal({ result, text }) {
  const [spinning, setSpinning] = useState(result !== 'pass');
  const [face, setFace] = useState('🎲');
  useEffect(() => {
    if (result === 'pass') return;
    sfx.spin();
    const faces = ['🎲', '🎰', '❓', '🪙'];
    let i = 0;
    const iv = setInterval(() => { i += 1; setFace(faces[i % faces.length]); }, 110);
    const t = setTimeout(() => {
      clearInterval(iv);
      setSpinning(false);
      if (result === 'win') { sfx.win(); confetti({ count: 70, power: 12 }); haptic([20, 40, 80]); }
      else { sfx.shot(); haptic([80, 50, 120]); }
    }, 1300);
    return () => { clearInterval(iv); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const win = result === 'win';
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="fd-card p-4 flex flex-col items-center gap-2 text-center"
      style={{ boxShadow: spinning ? '0 10px 30px -12px #ffb02099' : win ? '0 10px 30px -12px #1fd3b6cc' : result === 'pass' ? '0 10px 30px -12px #ffffff33' : '0 10px 30px -12px #ff4d6d99' }}
    >
      <p className="text-xs font-bold uppercase tracking-wide text-amber-300">🎲 Gamble</p>
      {spinning ? (
        <>
          <motion.div animate={{ rotate: 360, scale: [1, 1.15, 1] }} transition={{ rotate: { duration: 0.5, repeat: Infinity, ease: 'linear' }, scale: { duration: 0.5, repeat: Infinity } }} className="text-6xl leading-none">
            {face}
          </motion.div>
          <p className="text-sm text-white/50">A apostar…</p>
        </>
      ) : (
        <>
          <motion.div initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 12 }} className="text-6xl leading-none">
            {result === 'pass' ? '✋' : win ? '🎉' : '💥'}
          </motion.div>
          <p className={`text-sm font-semibold ${win ? 'text-emerald-300' : result === 'pass' ? 'text-white/60' : 'text-rose-300'}`}>{text}</p>
        </>
      )}
    </motion.div>
  );
}

// ---------- Carta a ser usada: banner flutuante para TODOS (não bloqueia toques) ----------
function CardPlayReveal({ card }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    sfx.reveal();
    haptic(15);
    const t = setTimeout(() => setVisible(false), 2100);
    return () => clearTimeout(t);
  }, []);
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, y: -30 }}
          className="fixed inset-x-0 top-[13vh] flex justify-center pointer-events-none z-50 px-4"
        >
          <motion.div
            initial={{ scale: 0.3, y: 24, rotate: -12 }}
            animate={{ scale: 1, y: 0, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 14 }}
            className="fd-card px-6 py-4 flex flex-col items-center gap-1 text-center"
            style={{ background: 'linear-gradient(160deg, rgba(155,92,255,0.3), rgba(255,61,139,0.22))', boxShadow: '0 16px 44px -10px rgba(0,0,0,0.7)' }}
          >
            <motion.span animate={{ rotate: [0, -10, 10, -6, 6, 0] }} transition={{ duration: 0.7, repeat: 1 }} className="text-5xl leading-none">
              {card.emoji}
            </motion.span>
            <span className="text-base font-extrabold">{card.name}</span>
            <span className="text-xs text-white/75">
              {card.blocked ? `🛡️ ${card.target} bloqueou!` : card.target ? `${card.by} → ${card.target}` : card.by}
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------- Beer Pinga (beer pong): medidor de força → fila → copo revela ----------
const BP_ROWS = [
  { count: 3, y: 58, size: 34, spacing: 18 }, // frente
  { count: 2, y: 39, size: 29, spacing: 15 }, // meio
  { count: 1, y: 23, size: 24, spacing: 0 }, // trás
];
function Beerpong({ pending, reveal, isMyTurn, currentLabel, onShoot }) {
  const [power, setPower] = useState(0.5);
  const dirRef = useRef(1);
  const rafRef = useRef(0);
  const [locked, setLocked] = useState(false);
  const [landed, setLanded] = useState(false);
  const shownRef = useRef(null);

  const aiming = !!pending && isMyTurn && !reveal && !locked;

  // Medidor a oscilar (só quem está a apontar).
  useEffect(() => {
    if (!aiming) return;
    const loop = () => {
      setPower((p) => {
        let np = p + dirRef.current * 0.03;
        if (np >= 1) { np = 1; dirRef.current = -1; }
        else if (np <= 0) { np = 0; dirRef.current = 1; }
        return np;
      });
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [aiming]);

  // Reveal: a bola voa até à fila e o copo abre.
  useEffect(() => {
    if (!reveal) return;
    const key = `${reveal.row}|${reveal.title}|${reveal.base}|${reveal.cupIdx}`;
    if (shownRef.current === key) return;
    shownRef.current = key;
    setLocked(true);
    setLanded(false);
    sfx.spin();
    const t = setTimeout(() => {
      setLanded(true);
      sfx.reveal();
      if (reveal.good) { confetti({ count: 70, power: 12 }); haptic([20, 40, 80]); }
      else { sfx.shot(); haptic([80, 50, 120]); }
    }, 820);
    return () => clearTimeout(t);
  }, [reveal]);

  const shoot = () => {
    if (!aiming) return;
    cancelAnimationFrame(rafRef.current);
    setLocked(true);
    sfx.spin();
    onShoot(power);
  };

  const targetRow = reveal ? reveal.row : null;
  const zone = power < 0.45 ? 0 : power < 0.8 ? 1 : 2;
  const zoneName = ['Perto', 'Médio', 'LONGE'][zone];

  return (
    <div className="fd-card p-3 flex flex-col gap-2" style={{ boxShadow: '0 10px 30px -12px #38bdf899' }}>
      <p className="text-sm font-bold uppercase tracking-wide text-sky-300 text-center">🏓 Beer Pinga</p>

      <div className="relative mx-auto w-full" style={{ height: 190, maxWidth: 300 }}>
        {/* tampo da mesa (perspetiva) */}
        <div className="absolute inset-x-0 bottom-0 top-3 rounded-xl" style={{ background: 'linear-gradient(180deg, rgba(56,189,248,0.12), rgba(56,189,248,0.02))', border: '1px solid rgba(255,255,255,0.08)', clipPath: 'polygon(16% 0, 84% 0, 100% 100%, 0 100%)' }} />
        {/* copos */}
        {BP_ROWS.map((rw, r) =>
          Array.from({ length: rw.count }).map((_, i) => {
            const left = 50 + (i - (rw.count - 1) / 2) * rw.spacing;
            const isHit = targetRow === r && landed && i === Math.floor(rw.count / 2);
            return (
              <div key={`${r}-${i}`} className="absolute -translate-x-1/2 -translate-y-1/2 grid place-items-center" style={{ left: `${left}%`, top: `${rw.y}%` }}>
                {isHit ? (
                  <motion.div
                    initial={{ scale: 0.3, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 12 }}
                    className={`grid place-items-center rounded-lg ${reveal?.good ? 'bg-emerald-500/30' : 'bg-rose-500/30'}`}
                    style={{ minWidth: rw.size + 16, minHeight: rw.size + 8 }}
                  >
                    <span className="text-2xl leading-none">{reveal.emoji}</span>
                  </motion.div>
                ) : (
                  <span style={{ fontSize: rw.size }} className={`leading-none ${targetRow === r ? 'opacity-95' : 'opacity-70'}`}>🥤</span>
                )}
              </div>
            );
          })
        )}
        {/* bola */}
        {reveal ? (
          <motion.div
            className="absolute -translate-x-1/2 -translate-y-1/2 text-lg"
            initial={{ left: '50%', top: '86%' }}
            animate={{ left: '50%', top: ['86%', '6%', `${BP_ROWS[reveal.row].y}%`] }}
            transition={{ duration: 0.82, times: [0, 0.55, 1], ease: 'easeOut' }}
          >
            ⚪
          </motion.div>
        ) : (
          <div className="absolute left-1/2 -translate-x-1/2 text-lg" style={{ top: '86%' }}>⚪</div>
        )}
      </div>

      {reveal && landed ? (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-center">
          <p className={`text-base font-extrabold ${reveal.good ? 'text-emerald-300' : 'text-rose-300'}`}>{reveal.emoji} {reveal.title}</p>
          <p className="text-xs text-white/60">bebe {reveal.base} · {reveal.desc}</p>
        </motion.div>
      ) : aiming ? (
        <>
          <div className="relative h-5 rounded-full overflow-hidden" style={{ background: 'linear-gradient(90deg, rgba(34,197,94,0.45) 0 45%, rgba(234,179,8,0.45) 45% 80%, rgba(239,68,68,0.55) 80% 100%)' }}>
            <motion.div className="absolute top-0 bottom-0 w-1.5 bg-white rounded-full shadow" style={{ left: `calc(${power * 100}% - 3px)` }} />
          </div>
          <div className="flex justify-between text-[10px] text-white/40 px-0.5">
            <span>Perto</span>
            <span>Médio</span>
            <span>Longe = risco/prémio</span>
          </div>
          <button onClick={shoot} className="fd-btn fd-btn-primary">🎯 Atirar — {zoneName}</button>
        </>
      ) : (
        <p className="text-center text-xs text-white/40">{locked ? 'A bola está no ar… 🎯' : `${currentLabel} está a apontar…`}</p>
      )}
    </div>
  );
}

// ---------- Revelação da ordem (todos veem os dados + quem começa) ----------
// Corrige o "salto" para o tabuleiro no instante do último lançamento: dá a todos
// (sobretudo ao último a rodar) o momento de ver o dado antes da corrida começar.
function OrderReveal({ data, players, boardPlayers, onClose }) {
  return (
    <motion.div
      key="order-reveal"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center px-6"
      style={{ background: 'rgba(6,6,12,0.75)', backdropFilter: 'blur(6px)' }}
    >
      <div className="w-full max-w-sm flex flex-col items-center gap-4">
        <motion.p
          initial={{ scale: 0.6, opacity: 0, y: -12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 16 }}
          className="text-3xl font-extrabold fd-neon text-center"
        >
          🎲 Ordem de jogo
        </motion.p>
        <div className="fd-card p-4 w-full flex flex-col gap-2.5">
          {data.order.map((id, i) => {
            const p = players.find((pp) => pp.id === id);
            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.35 }}
                className={`flex items-center justify-between ${i === 0 ? 'text-emerald-300 font-bold' : ''}`}
              >
                <span className="text-base">
                  {i === 0 ? '🥇' : `${i + 1}º`} {boardPlayers[id]?.pawn} {p?.name}
                </span>
                <motion.span
                  initial={{ rotate: -220, scale: 0.2, opacity: 0 }}
                  animate={{ rotate: 0, scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2 + i * 0.35, type: 'spring', stiffness: 240, damping: 12 }}
                  className="text-2xl"
                >
                  🎲 {data.dice[id]}
                </motion.span>
              </motion.div>
            );
          })}
        </div>
        <p className="text-xs text-white/45 text-center">
          Começa {boardPlayers[data.order[0]]?.pawn} {players.find((p) => p.id === data.order[0])?.name}! <span className="block text-white/30 mt-0.5">(toca para continuar)</span>
        </p>
      </div>
    </motion.div>
  );
}

// ---------- Casa ?? : 3 cartas viradas ao contrário + flip da escolhida ----------
function EventoOverlay({ pending, reveal, isMyTurn, currentName, onPick }) {
  const [picked, setPicked] = useState(null); // índice escolhido (otimista, à espera do servidor)
  const [visibleReveal, setVisibleReveal] = useState(null);
  const shownKey = useRef(null);
  const wasPending = useRef(false);

  const revealKey = reveal ? `${reveal.pickedIndex}|${reveal.title}|${reveal.desc}` : null;

  // Nova revelação: mostra flip, som/confetti e auto-esconde. Depende SÓ de revealKey
  // (string estável) — assim os broadcasts do room_state não re-armam/limpam o timer.
  useEffect(() => {
    if (!revealKey || shownKey.current === revealKey) return;
    shownKey.current = revealKey;
    setVisibleReveal(reveal);
    setPicked(reveal.pickedIndex);
    sfx.reveal();
    haptic([25, 40, 70]);
    if (reveal.emoji === '🚀' || reveal.card) confetti({ count: 90, power: 13 });
    const t = setTimeout(() => setVisibleReveal(null), 3600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealKey]);

  // Novo mistério a começar (transição de sem-pending → pending): limpa a escolha otimista.
  useEffect(() => {
    const active = !!pending;
    if (active && !wasPending.current) setPicked(null);
    wasPending.current = active;
  }, [pending]);

  const mode = pending ? 'pick' : visibleReveal ? 'reveal' : null;

  const handleTap = (i) => {
    if (mode !== 'pick' || !isMyTurn || picked !== null) return;
    sfx.click();
    haptic(15);
    setPicked(i);
    onPick(i);
  };

  return (
    <AnimatePresence>
      {mode && (
        <motion.div
          key="evento-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => mode === 'reveal' && setVisibleReveal(null)}
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
                    onClick={(e) => { e.stopPropagation(); handleTap(i); }}
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

            {mode === 'reveal' && (
              <motion.p
                key="reveal-text"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="text-center text-base font-semibold text-amber-200"
              >
                {visibleReveal?.card ? '🎴 Carta nova!' : visibleReveal?.title} <span className="block text-xs text-white/40 mt-1">(toca para continuar)</span>
              </motion.p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function Board({ room, youId, onPickPawn, onRoll, onAdvance, onResolve, onGamble, onEventoPick, onBlackjack, onBeerpong, onPlayCard, onReset, onLeave }) {
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
    const mostGolos = [...rows].sort((a, c) => c.golos - a.golos)[0];
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
        {isMyTurn ? '🎯 É a tua vez!' : `Vez de ${currentPawn} ${currentPlayer?.name || ''}`.trim()}
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
