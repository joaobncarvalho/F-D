// F&D — moeda a ser lançada ao ar (3D, CSS).
//
// Antes o "cara ou coroa" era só texto: a app dizia "atirem uma moeda" e alguém
// marcava o vencedor à mão. O momento do jogo é ver a moeda a rodar — é isso que
// faz a mesa calar-se e olhar para o telemóvel.
//
// O RESULTADO vem sempre do servidor (`face`); isto é só a apresentação. A
// animação aterra na face certa: o número de voltas é inteiro para a moeda parar
// virada para cima, mais meia volta quando calha coroa.

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { sfx } from '../sfx.js';

const VOLTAS = 5; // voltas completas antes de aterrar
export const FLIP_MS = 2100;

/**
 * @param face    'cara' | 'coroa' — decidido pelo servidor
 * @param flipKey muda para relançar (ex.: id da ronda)
 * @param onDone  chamado quando a moeda assenta
 * @param size    diâmetro em px
 */
export default function Coin({ face, flipKey, onDone, size = 128 }) {
  const [aVoar, setAVoar] = useState(true);

  useEffect(() => {
    setAVoar(true);
    sfx.spin();
    const t = setTimeout(() => {
      setAVoar(false);
      sfx.reveal();
      if (navigator.vibrate) navigator.vibrate([30, 40, 60]);
      onDone?.();
    }, FLIP_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipKey, face]);

  // Meia volta a mais quando é coroa → assenta com a face certa para cima.
  const rotacaoFinal = VOLTAS * 360 + (face === 'coroa' ? 180 : 0);

  return (
    <div className="grid place-items-center" style={{ perspective: 900, height: size * 1.5 }}>
      <motion.div
        initial={{ rotateX: 0, y: 0, scale: 1 }}
        animate={{
          rotateX: rotacaoFinal,
          y: [0, -size * 0.75, -size * 0.9, 0], // sobe, flutua, cai
          scale: [1, 1.12, 1.12, 1],
        }}
        transition={{
          rotateX: { duration: FLIP_MS / 1000, ease: [0.25, 0.6, 0.3, 1] },
          y: { duration: FLIP_MS / 1000, times: [0, 0.4, 0.6, 1], ease: 'easeOut' },
          scale: { duration: FLIP_MS / 1000, times: [0, 0.4, 0.6, 1] },
        }}
        style={{ transformStyle: 'preserve-3d', width: size, height: size, position: 'relative' }}
      >
        <Face size={size} texto="👑" legenda="CARA" cor="#ffb020" />
        <Face size={size} texto="🍺" legenda="COROA" cor="#9b5cff" atras />
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: aVoar ? 0 : 1, scale: aVoar ? 0.8 : 1 }}
        className="mt-2 text-xl font-extrabold"
        style={{ color: face === 'cara' ? '#ffb020' : '#9b5cff' }}
      >
        {face === 'cara' ? '👑 CARA' : '🍺 COROA'}
      </motion.p>
    </div>
  );
}

function Face({ size, texto, legenda, cor, atras = false }) {
  return (
    <div
      className="absolute inset-0 rounded-full grid place-items-center"
      style={{
        backfaceVisibility: 'hidden',
        transform: atras ? 'rotateX(180deg)' : 'none',
        background: `radial-gradient(circle at 35% 30%, ${cor}, ${cor}88 55%, ${cor}44)`,
        border: `${Math.max(3, size * 0.045)}px solid rgba(255,255,255,0.75)`,
        boxShadow: `0 10px 30px -8px ${cor}cc, inset 0 -6px 14px rgba(0,0,0,0.35)`,
      }}
    >
      <span style={{ fontSize: size * 0.38, lineHeight: 1 }}>{texto}</span>
      <span
        className="absolute font-extrabold tracking-widest"
        style={{ bottom: size * 0.12, fontSize: size * 0.11, color: 'rgba(255,255,255,0.85)' }}
      >
        {legenda}
      </span>
    </div>
  );
}
