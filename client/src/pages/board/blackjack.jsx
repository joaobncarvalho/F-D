// F&D — Blackjack do Modo Tabuleiro: carta, valor da mão e revelação animada.
// Extraído do Board.jsx (comportamento idêntico). PlayingCard e BlackjackReveal
// são reutilizados pelo Board (mesa de blackjack + revelação).

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { sfx } from '../../sfx.js';
import { confetti, haptic } from '../../confetti.js';

// ---------- Carta de baralho (Blackjack) ----------
export function PlayingCard({ card, hidden, small }) {
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
export function BlackjackReveal({ data, text }) {
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
