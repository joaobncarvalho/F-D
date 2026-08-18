import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Wheel from './Wheel.jsx';
import { sfx } from '../sfx.js';
import { confetti, haptic } from '../confetti.js';

// Roleta que revela a intensidade decidida pela votação (empate → "randomizer").
const SEGMENTS = [
  { key: 'leve', label: 'Leve', color: '#1fd3b6', emoji: '🍃' },
  { key: 'picante', label: 'Picante', color: '#ffb020', emoji: '🌶️' },
  { key: 'hardcore', label: 'Hardcore', color: '#ff4d6d', emoji: '🔥' },
  { key: 'caos', label: 'Caos', color: '#c04cff', emoji: '💥' },
];
const LABELS = { leve: '🍃 Leve', picante: '🌶️ Picante +18', hardcore: '🔥 Hardcore', caos: '💥 Caos' };

export default function IntensityReveal({ result, onDone }) {
  const [landed, setLanded] = useState(false);

  // Sem resultado (cliente antigo / sem votos) → segue direto.
  useEffect(() => {
    if (!result?.intensity) {
      const t = setTimeout(() => onDone?.(), 80);
      return () => clearTimeout(t);
    }
    sfx.spin();
    haptic(20);
  }, []);

  useEffect(() => {
    if (!landed) return;
    sfx.reveal();
    confetti({ count: 90, power: 14 });
    haptic([30, 40, 30]);
    const t = setTimeout(() => onDone?.(), 1600);
    return () => clearTimeout(t);
  }, [landed]);

  if (!result?.intensity) return null;
  const total = Object.values(result.counts || {}).reduce((a, b) => a + b, 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex flex-col items-center justify-center gap-5 py-6"
    >
      <h1 className="fd-title text-2xl font-extrabold text-center px-4">
        {result.randomized ? '🎲 Empate! A sorte decide…' : '🗳️ A intensidade votada é…'}
      </h1>
      <Wheel segments={SEGMENTS} targetKey={result.intensity} spinning onDone={() => setLanded(true)} />
      {landed ? (
        <motion.p
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 16 }}
          className="fd-title fd-neon text-3xl font-extrabold text-center"
        >
          {LABELS[result.intensity] || result.intensity}!
        </motion.p>
      ) : (
        <p className="text-sm text-white/50">{total > 0 ? `${total} voto(s)` : 'Sem votos — à sorte!'}</p>
      )}
    </motion.div>
  );
}
