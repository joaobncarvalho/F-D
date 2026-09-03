import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { sfx } from '../../sfx.js';
import { Avatar } from './shared.jsx';
import { MOLA, LISTA, ITEM_LISTA } from '../../motion.js';

/**
 * A Conta (modificador 📿) — ver server/src/game/divida.js.
 *
 * Três coisas num sítio só, porque são a mesma coisa vista de ângulos
 * diferentes: quem deve o quê (sempre à vista — uma conta escondida não se
 * negoceia), o botão de passar a conta a alguém, e a herança de quem sai.
 *
 * A herança tem prioridade sobre tudo: é um momento, não um estado, e enquanto
 * dura é a única coisa que interessa no ecrã.
 */
export default function DividaBand({ divida, room, youId, onTransfere, onHerdeiro }) {
  const [aPassar, setAPassar] = useState(false);
  if (!divida) return null;

  const jogador = (id) => room.players.find((p) => p.id === id);
  const minha = divida.contas.find((c) => c.id === youId);
  const h = divida.heranca;

  // ----- Herança: quem saiu escolhe a quem deixa a conta ------------------------
  if (h) {
    const souEu = h.deId === youId;
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={MOLA.pop}
        className="fd-card px-4 py-3 flex flex-col gap-2"
        style={{ borderColor: 'rgba(255,176,32,0.55)' }}
      >
        <p className="text-xs uppercase tracking-widest text-amber-300/80 text-center">👑 Herança</p>
        <p className="text-center text-sm">
          <b>{h.deName}</b> saiu a dever <b>{h.golos}</b> goles.{' '}
          {souEu ? 'A quem os deixas?' : 'Está a escolher a quem os deixa.'}
        </p>
        {souEu && (
          <motion.div variants={LISTA} initial="initial" animate="animate" className="flex flex-wrap gap-2">
            {h.candidatos.map((id) => {
              const p = jogador(id);
              if (!p) return null;
              return (
                <motion.button
                  key={id}
                  variants={ITEM_LISTA}
                  onClick={() => {
                    sfx.click();
                    onHerdeiro(id);
                  }}
                  className="fd-chip flex items-center gap-2"
                >
                  <Avatar player={p} size={22} />
                  {p.name}
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </motion.div>
    );
  }

  if (!divida.contas.length) return null;

  // ----- Contas abertas ---------------------------------------------------------
  return (
    <div className="fd-card p-2.5 flex flex-col gap-1.5">
      <p className="text-xs font-bold text-amber-300">📿 A Conta</p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {divida.contas.map((c) => {
          const p = jogador(c.id);
          return (
            <span key={c.id} className="text-xs text-white/70 flex items-center gap-1">
              {p && <Avatar player={p} size={16} />}
              <b className="text-white">{c.name}</b> deve {c.golos}
            </span>
          );
        })}
      </div>

      {/* Passar a conta é uma NEGOCIAÇÃO: quem assume ganha uma vida. O preço
          está escrito para os dois lados o lerem antes de alguém tocar em nada. */}
      {minha && (
        <>
          <button
            onClick={() => {
              sfx.click();
              setAPassar((v) => !v);
            }}
            className="fd-chip text-xs mt-0.5"
          >
            {aPassar ? '✖️ Deixa estar' : `🤝 Passar os meus ${minha.golos} goles a alguém`}
          </button>
          <AnimatePresence>
            {aPassar && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-col gap-1.5 overflow-hidden"
              >
                <p className="text-[11px] text-white/40 leading-tight">
                  Quem aceitar fica com os {minha.golos} goles e ganha uma vida. Convençam-se em voz alta.
                </p>
                <div className="flex flex-wrap gap-2">
                  {room.players
                    .filter((p) => p.connected && !p.eliminated && p.id !== youId)
                    .map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          sfx.click();
                          setAPassar(false);
                          onTransfere(p.id);
                        }}
                        className="fd-chip flex items-center gap-1.5 text-xs"
                      >
                        <Avatar player={p} size={18} />
                        {p.name}
                      </button>
                    ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
