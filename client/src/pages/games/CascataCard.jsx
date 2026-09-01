// F&D — Cascata. A corrente desce pela ordem da mesa: só podes parar depois de
// quem está à tua frente. O ecrã mostra a fila inteira para toda a gente saber
// de quem está à espera (é isso que faz o barulho).

import { motion } from 'framer-motion';
import { CardShell, Avatar } from './shared.jsx';
import { sfx } from '../../sfx.js';

export function CascataCard({ round, room, youId, canControl, onStart, onStop, onContinue }) {
  const ordem = round.order || [];
  const parados = round.stopped || [];
  const vezDe = ordem[parados.length];
  const souEu = vezDe?.id === youId;
  const jogador = (id) => room.players.find((p) => p.id === id);

  return (
    <CardShell typeKey="cascata">
      <p className="text-sm text-white/60">🌊 <b>Cascata</b></p>

      {round.substate === 'ready' && (
        <>
          <p className="text-lg leading-snug">
            Começam <b>todos a beber ao mesmo tempo</b>. Só podes parar depois de quem está à tua
            frente na fila — o último bebe muito mais.
          </p>
          <div className="flex flex-wrap gap-1.5 justify-center">
            {ordem.map((o, i) => (
              <span key={o.id} className="fd-chip flex items-center gap-1.5 text-sm">
                <b className="text-white/40">{i + 1}</b>
                <Avatar player={jogador(o.id)} size={20} /> {o.name}
              </span>
            ))}
          </div>
          {canControl ? (
            <button onClick={() => { sfx.click(); onStart(); }} className="fd-btn fd-btn-primary text-xl py-4">
              🍺 Toda a gente a beber… JÁ!
            </button>
          ) : (
            <p className="text-sm text-white/50">À espera do arranque…</p>
          )}
        </>
      )}

      {round.substate === 'running' && (
        <>
          <motion.p
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 1.1, repeat: Infinity }}
            className="text-3xl font-extrabold"
          >
            🍺 A BEBER!
          </motion.p>
          <div className="flex flex-col gap-1.5">
            {ordem.map((o, i) => {
              const parou = i < parados.length;
              const eDele = i === parados.length;
              return (
                <div
                  key={o.id}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 ${
                    parou ? 'bg-emerald-500/15' : eDele ? 'bg-pink-500/25 ring-2 ring-pink-400' : 'bg-white/5'
                  }`}
                >
                  <Avatar player={jogador(o.id)} size={24} />
                  <span className="font-semibold flex-1">{o.name}</span>
                  <span className="text-sm">
                    {parou ? `parou · 🍺 ${i + 1}` : eDele ? 'é a vez dele!' : 'a beber…'}
                  </span>
                </div>
              );
            })}
          </div>
          {souEu ? (
            <button onClick={() => { sfx.click(); onStop(); }} className="fd-btn fd-btn-success text-xl py-4">
              ✋ PAREI!
            </button>
          ) : (
            <p className="text-sm text-white/50">
              Continua a beber — só paras quando <b className="text-white">{vezDe?.name}</b> parar.
            </p>
          )}
        </>
      )}

      {round.substate === 'result' && round.result && (
        <>
          <p className="text-xl font-extrabold text-rose-300">
            🌊 {round.result.last.name} ficou no fim da cascata!
          </p>
          <div className="flex flex-col gap-1">
            {round.result.rows.map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-sm">
                <Avatar player={jogador(r.id)} size={20} />
                <span className="flex-1">{r.name}</span>
                <span className="text-white/60">🍺 {r.golos}</span>
              </div>
            ))}
          </div>
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
