import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { sfx } from '../sfx.js';
import { haptic } from '../confetti.js';

// Overlay de "telemóvel partido" para quem ficou sem vidas: vê o jogo através das
// fissuras (pointer-events-none), mas está fora. Vidro estilhaçado gerado em SVG.
const CX = 200;
const CY = 300;

// Fissuras radiais (com zigue-zague) a partir do ponto de impacto.
const rays = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2 + 0.35;
  const jig = i % 2 ? 34 : -30;
  const m1x = CX + Math.cos(a) * 120 + Math.cos(a + 1.6) * jig;
  const m1y = CY + Math.sin(a) * 120 + Math.sin(a + 1.6) * jig;
  const m2x = CX + Math.cos(a) * 320 + Math.cos(a + 1.6) * -jig;
  const m2y = CY + Math.sin(a) * 320 + Math.sin(a + 1.6) * -jig;
  const ex = CX + Math.cos(a) * 1000;
  const ey = CY + Math.sin(a) * 1000;
  return `${CX},${CY} ${m1x},${m1y} ${m2x},${m2y} ${ex},${ey}`;
});

// Anéis irregulares à volta do impacto (a teia).
const rings = [70, 150].map((r) => {
  const pts = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    const rr = r + (i % 2 ? 16 : -14);
    return `${(CX + Math.cos(a) * rr).toFixed(0)},${(CY + Math.sin(a) * rr).toFixed(0)}`;
  });
  return pts.join(' ');
});

export default function BrokenScreen() {
  useEffect(() => {
    sfx.shot?.();
    haptic([80, 40, 120, 40, 160]);
  }, []);

  return (
    <div className="fixed inset-0 z-40 pointer-events-none select-none">
      <motion.div
        initial={{ opacity: 0, scale: 1.06 }}
        animate={{ opacity: 1, scale: 1, x: [0, -7, 6, -4, 3, 0], y: [0, 5, -4, 2, 0] }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="w-full h-full"
      >
        <svg
          className="w-full h-full"
          viewBox="0 0 400 600"
          preserveAspectRatio="xMidYMid slice"
          style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.6))' }}
        >
          {/* brilho do impacto */}
          <circle cx={CX} cy={CY} r="26" fill="rgba(255,255,255,0.12)" />
          <g stroke="rgba(255,255,255,0.55)" fill="none" strokeLinejoin="round" strokeLinecap="round">
            {rays.map((p, i) => (
              <polyline key={'r' + i} points={p} strokeWidth={i % 3 === 0 ? 1.6 : 1} />
            ))}
            {rings.map((p, i) => (
              <polygon key={'g' + i} points={p} strokeWidth="1" />
            ))}
          </g>
          {/* realce fino por cima, para dar profundidade de vidro */}
          <g stroke="rgba(255,255,255,0.9)" fill="none" strokeWidth="0.4" strokeLinejoin="round">
            {rays.map((p, i) => (
              <polyline key={'h' + i} points={p} />
            ))}
          </g>
        </svg>
      </motion.div>

      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.35, type: 'spring', stiffness: 260, damping: 20 }}
        className="absolute inset-x-0 bottom-6 flex justify-center px-4"
      >
        <div className="fd-card px-4 py-2 text-center backdrop-blur">
          <p className="font-extrabold text-rose-300">💀 Ficaste sem vidas!</p>
          <p className="text-xs text-white/60">Estás fora — vê o resto da festa 🍿</p>
        </div>
      </motion.div>
    </div>
  );
}
