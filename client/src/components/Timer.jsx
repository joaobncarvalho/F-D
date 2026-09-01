import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { sfx } from '../sfx.js';
import { elapsedSince } from '../clock.js';

/**
 * Timer visual reutilizável (anel SVG) com contagem decrescente, tiques nos
 * últimos 5s e buzina no fim. É PRESSÃO, não regra — puramente cliente; o
 * servidor continua a ser a autoridade (não força ações). Reutilizável em
 * qualquer jogo com tempo (Boca Calada e futuros).
 *
 * Props:
 *   seconds  — duração total (default 20)
 *   runKey   — muda para REINICIAR (ex.: id da ronda). Sempre que muda, recomeça.
 *   onExpire — callback opcional ao chegar a 0 (disparado uma só vez)
 *   size     — diâmetro em px (default 88)
 *
 * O tempo decorrido vem do relógio partilhado (clock.js), que PARA enquanto o
 * host tiver o jogo em pausa — um intervalo não pode custar a ronda a ninguém.
 */
export default function Timer({ seconds = 20, runKey, onExpire, size = 88 }) {
  const [left, setLeft] = useState(seconds);
  const firedRef = useRef(false);
  const lastTickRef = useRef(null);

  useEffect(() => {
    setLeft(seconds);
    firedRef.current = false;
    lastTickRef.current = null;
    const start = Date.now();
    const id = setInterval(() => {
      const remaining = Math.max(0, seconds - elapsedSince(start) / 1000);
      setLeft(remaining);
      const whole = Math.ceil(remaining);
      if (remaining > 0 && remaining <= 5 && lastTickRef.current !== whole) {
        lastTickRef.current = whole; // um tique por segundo nos últimos 5s
        sfx.tick(remaining <= 3);
      }
      if (remaining <= 0 && !firedRef.current) {
        firedRef.current = true;
        sfx.timeout();
        onExpire?.();
        clearInterval(id);
      }
    }, 100);
    return () => clearInterval(id);
    // recomeça sempre que muda a ronda (runKey) ou a duração
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runKey, seconds]);

  const frac = Math.max(0, Math.min(1, left / seconds));
  const r = size / 2 - 6;
  const circ = 2 * Math.PI * r;
  const danger = left <= 5;
  const color = danger ? '#ff3d5a' : left <= seconds * 0.4 ? '#ffb020' : '#39d98a';

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
          animate={danger ? { opacity: [1, 0.35, 1] } : { opacity: 1 }}
          transition={danger ? { duration: 0.6, repeat: Infinity } : { duration: 0.1 }}
        />
      </svg>
      <span
        className="absolute font-extrabold tabular-nums"
        style={{ color, fontSize: size * 0.3 }}
      >
        {Math.ceil(left)}
      </span>
    </div>
  );
}
