// F&D — casa "??" (Mistério): 3 cartas viradas + flip da escolhida.
// Extraído do Board.jsx, comportamento idêntico.

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { sfx } from '../../sfx.js';
import { confetti, haptic } from '../../confetti.js';

export function EventoOverlay({ pending, reveal, isMyTurn, currentName, onPick }) {
  const [picked, setPicked] = useState(null); // índice escolhido (otimista, à espera do servidor)
  const [visibleReveal, setVisibleReveal] = useState(null);
  const shownKey = useRef(null);
  const wasPending = useRef(false);

  const revealKey = reveal ? `${reveal.pickedIndex}|${reveal.title}|${reveal.desc}` : null;

  // Nova revelação: mostra flip, som/confetti e auto-esconde. Depende SÓ de revealKey
  // (string estável) — assim os broadcasts do room_state não re-armam/limpam o timer.
  //
  // O RELÓGIO QUE ESCONDE É ARMADO SEMPRE, e o guarda `shownKey` serve só ao som.
  // Antes o guarda vinha primeiro e levava o relógio com ele: o React monta o
  // efeito, limpa-o e volta a montá-lo (StrictMode, em dev — que é como se
  // fazem os playtests), e a segunda passagem saía pelo guarda sem voltar a
  // armar o relógio que a limpeza da primeira já tinha apagado. A carta do ??
  // ficava no ecrã para sempre, por cima do tabuleiro. Mesmo defeito que o
  // EventoDaNoite.jsx tinha — ver lá a explicação completa.
  useEffect(() => {
    if (!revealKey) return;
    setVisibleReveal(reveal);
    setPicked(reveal.pickedIndex);
    const t = setTimeout(() => setVisibleReveal(null), 3600);

    if (shownKey.current !== revealKey) {
      shownKey.current = revealKey;
      try {
        sfx.reveal();
        haptic([25, 40, 70]);
        if (reveal.emoji === '🚀' || reveal.card) confetti({ count: 90, power: 13 });
      } catch {
        /* sem som a carta lê-se na mesma; presa no ecrã é que não pode ficar */
      }
    }
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
