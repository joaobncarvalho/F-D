import { motion } from 'framer-motion';
import { sfx } from '../../sfx.js';
import { Avatar } from '../games/shared.jsx';
import VereditoBand from '../games/VereditoBand.jsx';
import Timer from '../../components/Timer.jsx';
import { MOLA } from '../../motion.js';

/**
 * ⚖️ Tribunal da Injustiça, no Tabuleiro (ver server/src/board/tribunal.js).
 *
 * Ir preso deixa de ser uma sentença e passa a ser uma acusação: o preso tem 90
 * segundos para defender uma tese indefensável e a mesa decide se ele safa.
 *
 * Ocupa o topo do ecrã e TRANCA a jogada — de propósito. Um julgamento não é a
 * vez de ninguém: é a mesa inteira parada a ouvir, e o tabuleiro por baixo tem
 * de parecer suspenso enquanto isso dura.
 *
 * A pena que está em jogo nunca aparece antes do veredito. Se o júri soubesse o
 * que ele arrisca, votava por pena e não por defesa — e o servidor não a manda,
 * por isso este ecrã nem a poderia mostrar.
 */
export default function TribunalBand({ tribunal: t, room, youId, onAoVoto, onVota, onFecha }) {
  if (!t) return null;
  const reu = room.players.find((p) => p.id === t.reuId);
  const souReu = t.reuId === youId;

  if (t.substate === 'result') {
    const r = t.result;
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={MOLA.pop}
        className="fd-card p-4 flex flex-col items-center gap-2 text-center"
        style={{ borderColor: r.absolvido ? 'rgba(52,211,153,0.6)' : 'rgba(244,63,94,0.6)' }}
      >
        <p className="text-xs text-white/45 leading-snug">"{t.tese}"</p>
        <p className={`fd-title text-2xl font-extrabold ${r.absolvido ? 'text-emerald-300' : 'text-rose-300'}`}>
          {r.absolvido ? '⚖️ ABSOLVIDO' : '🔨 CONDENADO'}
        </p>
        <p className="text-sm text-white/55">
          {r.absolvicoes} a favor · {r.condenacoes} contra
        </p>
        <p className="text-sm text-white/70">
          {r.absolvido ? `${r.reuName} sai em liberdade.` : `${r.reuName}: ${r.pena}`}
        </p>
        <button onClick={() => { sfx.click(); onFecha(); }} className="fd-btn fd-btn-primary mt-1">
          ➡️ Continuar o jogo
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOLA.pop}
      className="fd-card p-4 flex flex-col items-center gap-2 text-center"
      style={{ borderColor: 'rgba(245,158,11,0.6)' }}
    >
      <p className="text-xs uppercase tracking-[0.25em] text-amber-300/80">⚖️ Tribunal da Injustiça</p>
      <div className="flex items-center gap-2">
        {reu && <Avatar player={reu} size={34} ring />}
        <span className="text-sm text-white/60">
          <b className="text-white">{t.reuName}</b> — acusado de {t.razao}
        </span>
      </div>

      <p className="text-[11px] uppercase tracking-widest text-white/35 mt-1">Tem de defender que…</p>
      <p className="fd-title text-lg font-extrabold leading-snug text-amber-200">{t.tese}</p>

      {t.substate === 'defesa' ? (
        <>
          <Timer seconds={t.segundos || 90} runKey={t.abertoEm} size={64} />
          <p className="text-sm text-white/55 leading-snug">
            {souReu
              ? 'Convence-os. Se conseguires, não cumpres pena nenhuma.'
              : 'Ouçam. A seguir são vocês a decidir se ele cumpre pena.'}
          </p>
          <button onClick={() => { sfx.click(); onAoVoto(); }} className="fd-btn fd-btn-primary">
            ⚖️ Já chega — ao voto
          </button>
        </>
      ) : (
        <div className="w-full">
          <VereditoBand veredito={t.veredito} room={room} youId={youId} onVota={onVota} />
          <p className="text-[11px] text-white/35 mt-1">
            Absolvido, escapa à pena. Condenado, cumpre-a — e ninguém sabe qual é.
          </p>
        </div>
      )}
    </motion.div>
  );
}
