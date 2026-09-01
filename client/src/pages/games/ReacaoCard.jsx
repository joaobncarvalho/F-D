// F&D — Reação (Primeiro a Carregar).
//
// O instante do GO é decidido pelo SERVIDOR (`goAt`) e é o mesmo para todos os
// telemóveis — só assim a corrida é justa. Aqui limitamo-nos a acender o ecrã na
// hora certa e a impedir batota visual: antes do GO o botão está vermelho, e
// carregar nele é falso arranque.

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CardShell, Avatar } from './shared.jsx';
import { sfx } from '../../sfx.js';

/** Botão gigante partilhado pelos três modos (Roda, Torneio e casa do Tabuleiro). */
export function BotaoReacao({ goAt, disabled, jaCarreguei, falso, onTap }) {
  const [aberto, setAberto] = useState(Date.now() >= goAt);

  useEffect(() => {
    setAberto(Date.now() >= goAt);
    if (Date.now() >= goAt) return;
    const id = setTimeout(() => {
      setAberto(true);
      sfx.reveal();
      if (navigator.vibrate) navigator.vibrate(40);
    }, goAt - Date.now());
    return () => clearTimeout(id);
  }, [goAt]);

  if (falso) {
    return (
      <div className="fd-card p-6 text-center bg-rose-500/20">
        <p className="text-3xl font-extrabold text-rose-300">🚨 Falso arranque!</p>
        <p className="text-sm text-white/60 mt-1">Carregaste antes do sinal.</p>
      </div>
    );
  }
  if (jaCarreguei) {
    return (
      <div className="fd-card p-6 text-center bg-emerald-500/15">
        <p className="text-3xl font-extrabold text-emerald-300">✓ Carregaste!</p>
        <p className="text-sm text-white/60 mt-1">A ver quem foi mais rápido…</p>
      </div>
    );
  }

  return (
    <motion.button
      disabled={disabled}
      onClick={onTap}
      animate={aberto ? { scale: [1, 1.04, 1] } : { scale: 1 }}
      transition={aberto ? { duration: 0.45, repeat: Infinity } : {}}
      className="fd-btn w-full text-3xl font-extrabold"
      style={{
        padding: '3rem 1rem',
        background: aberto
          ? 'linear-gradient(135deg,#22c55e,#15803d)'
          : 'linear-gradient(135deg,#ef4444,#7f1d1d)',
      }}
    >
      {aberto ? '⚡ CARREGA!' : '✋ Espera pelo verde…'}
    </motion.button>
  );
}

export function ReacaoCard({ round, room, youId, canControl, onTap, onContinue }) {
  const reac = round.reaction;
  const naCorrida = !!reac && !round.result;
  const jaCarreguei = reac?.tapped?.includes(youId);
  const falso = reac?.falseStarts?.includes(youId);
  const jogador = (id) => room.players.find((p) => p.id === id);

  return (
    <CardShell typeKey="reacao">
      <p className="text-sm text-white/60">
        ⚡ <b>Primeiro a carregar.</b> O último bebe — e carregar antes do sinal também.
      </p>

      {naCorrida && (
        <>
          <BotaoReacao
            goAt={reac.goAt}
            jaCarreguei={jaCarreguei}
            falso={falso}
            onTap={() => {
              if (navigator.vibrate) navigator.vibrate(20);
              onTap();
            }}
          />
          <div className="flex flex-wrap gap-1.5 justify-center">
            {room.players
              .filter((p) => p.connected && !p.eliminated)
              .map((p) => {
                const done = reac.tapped.includes(p.id) || reac.falseStarts.includes(p.id);
                return (
                  <span key={p.id} className={`text-lg ${done ? '' : 'opacity-25 grayscale'}`} title={p.name}>
                    {p.emoji || '🙂'}
                  </span>
                );
              })}
          </div>
        </>
      )}

      {round.result && (
        <>
          <div className="flex flex-col gap-1">
            {round.result.ranking.map((r, i) => (
              <div
                key={r.id}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
                  i === 0 && !r.early && !r.missed ? 'bg-emerald-500/20' : i === round.result.ranking.length - 1 ? 'bg-rose-500/20' : 'bg-white/5'
                }`}
              >
                <span className="w-5 text-white/40 font-bold">{i + 1}</span>
                <Avatar player={jogador(r.id)} size={22} />
                <span className="flex-1 font-semibold">{jogador(r.id)?.name}</span>
                <span className="text-white/60">
                  {r.early ? '🚨 cedo demais' : r.missed ? '💤 não carregou' : `${r.ms} ms`}
                </span>
              </div>
            ))}
          </div>
          <p className="text-lg font-extrabold text-rose-300">
            🍺 Bebem: {round.result.drinkers.map((d) => d.name).join(' · ')}
          </p>
          {canControl && (
            <button onClick={() => { sfx.click(); onContinue(); }} className="fd-btn fd-btn-primary">
              Continuar →
            </button>
          )}
        </>
      )}
    </CardShell>
  );
}
