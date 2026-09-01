// F&D — casa "Beer Pinga" (beer pong): medidor de força → fila → copo revela.
// Extraído do Board.jsx, comportamento idêntico.

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { sfx } from '../../sfx.js';
import { confetti, haptic } from '../../confetti.js';

const BP_ROWS = [
  { count: 3, y: 58, size: 34, spacing: 18 }, // frente
  { count: 2, y: 39, size: 29, spacing: 15 }, // meio
  { count: 1, y: 23, size: 24, spacing: 0 }, // trás
];

// Tempo que o medidor demora a fazer uma passagem completa (0 → 1). Era ~0,55 s
// e ninguém conseguia apontar; a 2,4 s dá para mirar sem a mesa adormecer.
const SWEEP_MS = 2400;

export function Beerpong({ pending, reveal, isMyTurn, currentLabel, onShoot }) {
  const [power, setPower] = useState(0.5);
  const powerRef = useRef(0.5); // valor no instante do disparo (o estado pode ir atrasado)
  const rafRef = useRef(0);
  const [locked, setLocked] = useState(false);
  const [landed, setLanded] = useState(false);
  const shownRef = useRef(null);

  const aiming = !!pending && isMyTurn && !reveal && !locked;

  // Casa nova (outro jogador, ou o mesmo outra vez) → destrancar. Sem isto, quem
  // caísse aqui a seguir a outro ficava com o ecrã trancado do tiro anterior.
  useEffect(() => {
    if (!pending) return;
    setLocked(false);
    setLanded(false);
    setPower(0.5);
    powerRef.current = 0.5;
  }, [pending?.playerId]);

  // Medidor a oscilar (só quem está a apontar). Baseado no RELÓGIO e não no
  // número de frames — senão a 120 Hz oscila ao dobro da velocidade.
  useEffect(() => {
    if (!aiming) return;
    const t0 = performance.now();
    const loop = (t) => {
      // Onda triangular: sobe de 0 a 1 e volta, em 2×SWEEP_MS.
      const fase = ((t - t0) % (SWEEP_MS * 2)) / SWEEP_MS;
      const p = fase <= 1 ? fase : 2 - fase;
      powerRef.current = p;
      setPower(p);
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
    onShoot(powerRef.current); // o valor exato do instante do toque
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
