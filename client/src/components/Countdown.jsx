import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { sfx } from '../sfx.js';
import { haptic } from '../confetti.js';

export default function Countdown({ onDone }) {
  const steps = ['3', '2', '1', 'BORA! 🍻'];
  const [i, setI] = useState(0);

  useEffect(() => {
    if (i >= steps.length) {
      const t = setTimeout(onDone, 400);
      return () => clearTimeout(t);
    }
    if (i === steps.length - 1) {
      sfx.reveal();
      haptic([30, 40, 30]);
    } else {
      sfx.click();
      haptic(15);
    }
    const t = setTimeout(() => setI((v) => v + 1), i === steps.length - 1 ? 800 : 850);
    return () => clearTimeout(t);
  }, [i]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1 flex items-center justify-center"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          initial={{ scale: 0.3, opacity: 0, rotate: -15 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 1.8, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16 }}
          className="fd-title fd-neon text-7xl font-extrabold text-pink-400 text-center"
        >
          {steps[Math.min(i, steps.length - 1)]}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
