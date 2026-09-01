// F&D — feed de eventos da sala.
//
// Duas pessoas precisam disto numa festa: quem chega a meio ("o que é que eu
// perdi?") e quem se distraiu a discutir a ronda anterior. Fica fechado por
// defeito para não roubar ecrã; o badge mostra quantas coisas aconteceram desde
// a última espreitadela.

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { sfx } from '../sfx.js';
import { shareResultCard } from '../share.js';

/**
 * Botão "partilhar resultado" — usado pelos três modos. Vive aqui, ao lado do
 * Feed, por ser a outra peça pequena e transversal dos ecrãs de fim.
 */
export function ShareResult({ data }) {
  const [estado, setEstado] = useState('idle');
  return (
    <button
      onClick={async () => {
        setEstado('a-gerar');
        const ok = await shareResultCard(typeof data === 'function' ? data() : data);
        setEstado(ok ? 'feito' : 'idle');
      }}
      className="fd-btn fd-btn-ghost text-sm py-2.5"
    >
      {estado === 'a-gerar' ? 'A preparar…' : estado === 'feito' ? '✓ Guardado' : '📸 Partilhar resultado'}
    </button>
  );
}

export default function Feed({ feed = [] }) {
  const [aberto, setAberto] = useState(false);
  const [vistoAte, setVistoAte] = useState(0);
  const fim = useRef(null);

  const ultimo = feed.length ? feed[feed.length - 1].id : 0;
  const novos = feed.filter((f) => f.id > vistoAte).length;

  useEffect(() => {
    if (aberto) {
      setVistoAte(ultimo);
      fim.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [aberto, ultimo]);

  if (!feed.length) return null;

  return (
    <div className="flex flex-col">
      <button
        onClick={() => {
          sfx.click();
          setAberto((v) => !v);
        }}
        className="fd-card px-3 py-2 flex items-center gap-2 text-left"
      >
        <span className="text-sm">📜</span>
        <span className="text-xs text-white/60 flex-1 truncate">
          {aberto ? 'O que aconteceu' : `${feed[feed.length - 1].emoji} ${feed[feed.length - 1].text}`}
        </span>
        {!aberto && novos > 0 && (
          <span className="text-[0.65rem] font-bold bg-pink-500 rounded-full px-1.5 py-0.5">{novos}</span>
        )}
        <span className="text-xs text-white/40">{aberto ? '▲' : '▼'}</span>
      </button>

      <AnimatePresence>
        {aberto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="fd-card mt-1 p-3 max-h-52 overflow-y-auto flex flex-col gap-1">
              {feed.map((f) => (
                <p key={f.id} className="text-xs text-white/70 leading-snug">
                  <span className="mr-1">{f.emoji}</span>
                  {f.text}
                </p>
              ))}
              <div ref={fim} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
