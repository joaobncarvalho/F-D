// F&D — painel de definições rápidas (o botão ⚙️ do canto).
//
// Junta o que uma pessoa precisa de mexer a meio de uma festa, sem sair do jogo:
// som, música ambiente, legibilidade (bar às escuras) e as regras. Tudo local a
// cada telemóvel — nada disto mexe com a sala.

import { motion } from 'framer-motion';
import { sfx } from '../sfx.js';

function Toggle({ on, onClick, children }) {
  return (
    <button onClick={onClick} className={`fd-chip flex items-center justify-between w-full ${on ? 'fd-chip-on' : ''}`}>
      <span>{children}</span>
      <span className="text-xs opacity-80">{on ? 'ligado' : 'desligado'}</span>
    </button>
  );
}

export default function Settings({ muted, music, a11y, onToggleMute, onToggleMusic, onToggleA11y, onRules, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-5"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 20, scale: 0.96 }}
        animate={{ y: 0, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="fd-card p-5 w-full max-w-sm flex flex-col gap-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="fd-title text-xl font-extrabold">Definições</h2>
          <button onClick={onClose} className="text-white/50 text-lg">✕</button>
        </div>

        <Toggle on={!muted} onClick={() => { sfx.click(); onToggleMute(); }}>🔊 Efeitos sonoros</Toggle>
        <Toggle on={music} onClick={() => { sfx.click(); onToggleMusic(); }}>🎵 Música ambiente</Toggle>

        <p className="text-xs text-white/40 mt-1">Legibilidade — para bares às escuras</p>
        <Toggle on={a11y.big} onClick={() => { sfx.click(); onToggleA11y('big'); }}>🔠 Texto grande</Toggle>
        <Toggle on={a11y.contrast} onClick={() => { sfx.click(); onToggleA11y('contrast'); }}>◐ Alto contraste</Toggle>

        <button onClick={() => { sfx.click(); onRules(); }} className="fd-btn fd-btn-ghost mt-1">
          📖 Como se joga
        </button>
      </motion.div>
    </motion.div>
  );
}
