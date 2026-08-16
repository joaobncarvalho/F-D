import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Transição "vamos começar": 3 → 2 → 1 → Vamos! → onDone().
 * Puramente visual (cliente); o servidor já mudou o estado para 'playing'.
 */
export default function Countdown({ onDone }) {
  const steps = ['3', '2', '1', 'Vamos!'];
  const [i, setI] = useState(0);

  useEffect(() => {
    if (i >= steps.length) {
      const t = setTimeout(onDone, 400);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setI((v) => v + 1), i === steps.length - 1 ? 700 : 900);
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
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
          className="text-7xl font-black text-pink-500 text-center"
        >
          {steps[Math.min(i, steps.length - 1)]}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
