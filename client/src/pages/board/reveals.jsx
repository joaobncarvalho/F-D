// F&D — pequenas revelações animadas do Modo Tabuleiro (Gamble, carta usada, ordem).
// Extraído do Board.jsx, comportamento idêntico.

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { sfx } from '../../sfx.js';
import { confetti, haptic } from '../../confetti.js';

// ---------- Gamble: dado a girar antes de revelar o resultado ----------
export function GambleReveal({ result, text }) {
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
export function CardPlayReveal({ card }) {
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

// ---------- Revelação da ordem (todos veem os dados + quem começa) ----------
// Corrige o "salto" para o tabuleiro no instante do último lançamento: dá a todos
// (sobretudo ao último a rodar) o momento de ver o dado antes da corrida começar.
export function OrderReveal({ data, players, boardPlayers, onClose }) {
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
