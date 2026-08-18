import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

/**
 * Roda de seleção do tipo de jogo (SVG animado).
 * O servidor é a autoridade: recebe `targetKey` e a roda anima até lá parar.
 *
 * Tamanho RESPONSIVO: acompanha a largura do ecrã (min(86vw, 400px)) — a SVG
 * usa viewBox fixo (0..200), por isso escala sem distorcer.
 *
 * props:
 *   segments  [{ key, label, color, emoji }]  (ordem estável!)
 *   targetKey string | null   — tipo escolhido pelo servidor
 *   spinning  bool            — quando true, gira até targetKey
 *   onDone    ()=>void        — chamado quando a animação termina
 */
export default function Wheel({ segments, targetKey, spinning, onDone }) {
  const [rot, setRot] = useState(0);
  const rotRef = useRef(0);
  const seg = 360 / segments.length;
  const R = 96;
  const C = 100;

  useEffect(() => {
    if (!spinning || !targetKey) return;
    const i = segments.findIndex((s) => s.key === targetKey);
    if (i < 0) return;
    const targetCenter = i * seg + seg / 2; // ângulo do centro do segmento (0 = topo, sentido horário)
    const desiredMod = (360 - targetCenter) % 360;
    const currentMod = ((rotRef.current % 360) + 360) % 360;
    const delta = (desiredMod - currentMod + 360) % 360;
    const next = rotRef.current + 360 * 4 + delta; // 4 voltas + alinhamento
    rotRef.current = next;
    setRot(next);
  }, [spinning, targetKey]);

  return (
    <div className="relative mx-auto" style={{ width: 'min(86vw, 400px)', aspectRatio: '1 / 1' }}>
      {/* Halo com brilho */}
      <div
        className="absolute inset-[-12px] rounded-full"
        style={{
          zIndex: 0,
          background:
            'conic-gradient(from 0deg, #ff3d8b, #9b5cff, #ffb020, #1fd3b6, #ff3d8b)',
          filter: 'blur(16px)',
          opacity: 0.5,
        }}
      />
      {/* Ponteiro fixo no topo */}
      <div
        className="absolute left-1/2 -translate-x-1/2 -top-1 z-10"
        style={{
          width: 0,
          height: 0,
          borderLeft: '15px solid transparent',
          borderRight: '15px solid transparent',
          borderTop: '26px solid #ffffff',
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
        }}
      />
      <motion.div
        animate={{ rotate: rot }}
        transition={{ duration: spinning ? 3.4 : 0, ease: [0.16, 1, 0.3, 1] }}
        onAnimationComplete={() => spinning && onDone?.()}
        style={{ position: 'relative', zIndex: 1, width: '100%', height: '100%', transformOrigin: 'center' }}
      >
        <svg viewBox="0 0 200 200" width="100%" height="100%" style={{ display: 'block' }}>
          {segments.map((s, i) => {
            const a0 = (-90 + i * seg) * (Math.PI / 180);
            const a1 = (-90 + (i + 1) * seg) * (Math.PI / 180);
            const x0 = C + R * Math.cos(a0);
            const y0 = C + R * Math.sin(a0);
            const x1 = C + R * Math.cos(a1);
            const y1 = C + R * Math.sin(a1);
            const large = seg > 180 ? 1 : 0;
            const mid = (-90 + i * seg + seg / 2) * (Math.PI / 180);
            const lx = C + R * 0.66 * Math.cos(mid);
            const ly = C + R * 0.66 * Math.sin(mid);
            return (
              <g key={s.key}>
                <path
                  d={`M${C},${C} L${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} Z`}
                  fill={s.color}
                  stroke="#0f0f14"
                  strokeWidth="1.5"
                />
                {/* Só o ícone (maior, centrado): com 7+ fatias os nomes transbordavam. */}
                <text x={lx} y={ly} fontSize="17" textAnchor="middle" dominantBaseline="central">
                  {s.emoji}
                </text>
              </g>
            );
          })}
          <circle cx={C} cy={C} r="15" fill="#0f0f14" stroke="#f5f5f7" strokeWidth="2" />
        </svg>
      </motion.div>
    </div>
  );
}
