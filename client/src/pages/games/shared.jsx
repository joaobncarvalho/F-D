// F&D — peças partilhadas pelos cartões dos mini-jogos da Roda.
// Extraído do Game.jsx (monólito) para modularização gradual — sem alterar
// comportamento. TYPES é a fonte única dos tipos da roda (cor/emoji/label).

import { motion } from 'framer-motion';
import { sfx } from '../../sfx.js';
import { ENTRA } from '../../motion.js';

export const TYPES = [
  { key: 'boca_calada', label: 'Boca Calada', color: '#ff3d8b', emoji: '🤐' },
  { key: 'desafio', label: 'Desafio', color: '#9b5cff', emoji: '🔥' },
  { key: 'intrigas', label: 'Intrigas', color: '#ffb020', emoji: '🗳️' },
  { key: 'segredos', label: 'Segredos', color: '#1fd3b6', emoji: '🤫' },
  { key: 'piramide', label: 'Piramide', color: '#5b8cff', emoji: '🔺' },
  { key: 'vasco', label: 'Vasco', color: '#ff8c42', emoji: '🕵️' },
  { key: 'isto_ou_aquilo', label: 'Isto/Aquilo', color: '#4ade80', emoji: '⚖️' },
  { key: 'categoria_relampago', label: 'Relâmpago', color: '#facc15', emoji: '⚡' },
  { key: 'mimica', label: 'Mímica', color: '#f472b6', emoji: '🎭' },
  { key: 'roleta_russa', label: 'Roleta Russa', color: '#ef4444', emoji: '🎯' },
  { key: 'duelo', label: 'Duelo 1v1', color: '#38bdf8', emoji: '⚔️' },
  // Jogos de MESA INTEIRA — toda a gente joga ao mesmo tempo.
  { key: 'eu_nunca', label: 'Eu Nunca', color: '#a78bfa', emoji: '🙈' },
  { key: 'mais_provavel', label: 'Mais Provável', color: '#fb923c', emoji: '👉' },
  { key: 'termometro', label: 'Termómetro', color: '#f87171', emoji: '🌡️' },
  { key: 'quem_disse', label: 'Quem Disse', color: '#22d3ee', emoji: '💬' },
  { key: 'cascata', label: 'Cascata', color: '#60a5fa', emoji: '🌊' },
  { key: 'desenho', label: 'Desenha', color: '#34d399', emoji: '🎨' },
  { key: 'reacao', label: 'Reação', color: '#fde047', emoji: '⚡' },
];

/** Cor/emoji/label de um tipo — com um fallback seguro para tipos desconhecidos. */
export function typeMeta(key) {
  return TYPES.find((t) => t.key === key) || { key, label: key, color: '#9b5cff', emoji: '🎲' };
}

/** Avatar do jogador (emoji + cor escolhidos no lobby). Transversal aos 3 modos. */
export function Avatar({ player, size = 30, ring = false }) {
  if (!player) return null;
  return (
    <span
      className="inline-grid place-items-center rounded-full flex-shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.58,
        background: `${player.color || '#9b5cff'}33`,
        border: `2px solid ${ring ? player.color || '#9b5cff' : 'transparent'}`,
      }}
      title={player.name}
    >
      {player.emoji || '🙂'}
    </span>
  );
}

export function CardShell({ children, typeKey }) {
  const t = TYPES.find((x) => x.key === typeKey);
  return (
    <motion.div
      {...ENTRA}
      className="fd-card p-5 flex flex-col gap-3 text-center"
      style={{ boxShadow: `0 12px 40px -14px ${t?.color}99` }}
    >
      <p className="text-sm font-bold uppercase tracking-wide" style={{ color: t?.color }}>
        {t?.emoji} {t?.label}
      </p>
      {children}
    </motion.div>
  );
}

// Passo/badge do Buddy — partilhado pelo PromptCard e ChoiceCard.
export function BuddyBlock({ round, room, youId, isMyTurn, onChooseBuddy }) {
  if (!round.needsBuddy) return null;
  if (round.buddyId) {
    return (
      <p className="text-sm font-bold text-cyan-300">
        🤝 Buddy: {round.buddyName} — bebe sempre que {round.currentPlayerName} beber!
      </p>
    );
  }
  if (isMyTurn) {
    const others = room.players.filter((p) => p.connected && p.id !== youId);
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-cyan-300 font-semibold">🤝 Escolhe o teu Buddy (bebe sempre que tu bebes):</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {others.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                sfx.click();
                onChooseBuddy(p.id);
              }}
              className="fd-chip"
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return <p className="text-sm text-white/50">🤝 {round.currentPlayerName} está a escolher o buddy…</p>;
}
