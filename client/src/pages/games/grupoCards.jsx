// F&D — cartas dos jogos de MESA INTEIRA (Eu Nunca · Mais Provável · Termómetro
// · Quem Disse). Partilham o mesmo ritmo: respondes em segredo, vês quantos já
// responderam, e quando o último responde revela-se tudo de uma vez.
//
// O servidor nunca manda as respostas antes do reveal — aqui só sabemos quem já
// respondeu (`round.answeredIds`).

import { motion, AnimatePresence } from 'framer-motion';
import { CardShell, Avatar } from './shared.jsx';
import { sfx } from '../../sfx.js';

/** Bolinhas de progresso: quem já respondeu acende. */
function Progresso({ room, answeredIds, hiddenId }) {
  const votantes = room.players.filter((p) => p.connected && !p.eliminated && p.id !== hiddenId);
  return (
    <div className="flex flex-wrap gap-1.5 justify-center">
      {votantes.map((p) => {
        const done = answeredIds.includes(p.id);
        return (
          <span
            key={p.id}
            className={`text-lg transition ${done ? 'opacity-100' : 'opacity-25 grayscale'}`}
            title={done ? `${p.name} já respondeu` : `à espera de ${p.name}`}
          >
            {p.emoji || '🙂'}
          </span>
        );
      })}
      <span className="text-xs text-white/40 self-center ml-1">
        {answeredIds.length}/{votantes.length}
      </span>
    </div>
  );
}

function Bebem({ titulo, lista, golos }) {
  if (!lista?.length) {
    return <p className="text-sm text-emerald-300 font-semibold">Ninguém bebe desta vez. 😌</p>;
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-white/50">{titulo}</p>
      <p className="text-lg font-extrabold text-rose-300">
        🍺 {lista.map((d) => d.name).join(' · ')}
        {golos ? <span className="text-white/60 text-sm font-semibold"> — {golos} {golos === 1 ? 'golo' : 'golos'}</span> : null}
      </p>
    </div>
  );
}

export function GrupoCard({ round, room, youId, isAuthor, canControl, onAnswer, onReveal, onContinue }) {
  const kind = round.gameTypeKey;
  const answered = round.answeredIds || [];
  const jaRespondi = answered.includes(youId);
  const podeResponder = !round.revealed && !jaRespondi && !isAuthor;
  const outros = room.players.filter((p) => p.connected && !p.eliminated && p.id !== youId);

  const cabecalho = {
    eu_nunca: <>🙈 <b>Eu nunca…</b></>,
    mais_provavel: <>👉 <b>Quem é mais provável de…</b></>,
    termometro: <>🌡️ <b>De 0 a 10:</b></>,
    quem_disse: <>💬 <b>Quem escreveu isto?</b></>,
  }[kind];

  return (
    <CardShell typeKey={kind}>
      <p className="text-sm text-white/60">{cabecalho}</p>
      <p className="text-xl font-bold leading-snug">{round.prompt?.text || '—'}</p>

      {isAuthor && !round.revealed && (
        <p className="text-sm text-amber-300 font-semibold">✍️ Esta pergunta é tua — fica caladinho. 🤫</p>
      )}

      {!round.revealed && (
        <>
          <Progresso room={room} answeredIds={answered} hiddenId={kind === 'quem_disse' ? undefined : null} />

          {podeResponder && kind === 'eu_nunca' && (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { sfx.click(); onAnswer('ja'); }} className="fd-btn fd-btn-danger py-4 text-lg">
                🙋 Já fiz
              </button>
              <button onClick={() => { sfx.click(); onAnswer('nunca'); }} className="fd-btn fd-btn-success py-4 text-lg">
                😇 Nunca
              </button>
            </div>
          )}

          {podeResponder && (kind === 'mais_provavel' || kind === 'quem_disse') && (
            <div className="flex flex-wrap gap-2 justify-center">
              {outros.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { sfx.click(); onAnswer(p.id); }}
                  className="fd-chip flex items-center gap-2"
                >
                  <Avatar player={p} size={22} /> {p.name}
                </button>
              ))}
              {kind === 'mais_provavel' && (
                <button onClick={() => { sfx.click(); onAnswer(youId); }} className="fd-chip">
                  🙋 Eu próprio/a
                </button>
              )}
            </div>
          )}

          {podeResponder && kind === 'termometro' && (
            <div className="grid grid-cols-6 gap-1.5">
              {Array.from({ length: 11 }, (_, n) => (
                <button
                  key={n}
                  onClick={() => { sfx.click(); onAnswer(n); }}
                  className="fd-chip h-11 grid place-items-center font-extrabold"
                  style={{ background: `hsl(${200 - n * 20} 80% 45% / 0.35)` }}
                >
                  {n}
                </button>
              ))}
            </div>
          )}

          {jaRespondi && <p className="text-sm text-emerald-300 font-semibold">Resposta trancada ✓ à espera dos outros…</p>}

          {canControl && answered.length > 0 && (
            <button onClick={() => { sfx.click(); onReveal(); }} className="fd-btn fd-btn-ghost py-2 text-sm">
              👀 Revelar já (com quem respondeu)
            </button>
          )}
        </>
      )}

      <AnimatePresence>
        {round.revealed && round.result && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col gap-3"
          >
            <Resultado round={round} room={room} />
            {canControl && (
              <button onClick={() => { sfx.click(); onContinue(); }} className="fd-btn fd-btn-primary">
                Continuar →
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </CardShell>
  );
}

function Resultado({ round, room }) {
  const res = round.result;
  const nome = (id) => room.players.find((p) => p.id === id)?.name || '—';
  const jogador = (id) => room.players.find((p) => p.id === id);

  if (res.kind === 'eu_nunca') {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2 justify-center">
          {Object.entries(res.answers).map(([id, v]) => (
            <span key={id} className={`fd-chip ${v === 'ja' ? 'text-rose-300' : 'text-emerald-300'}`}>
              {v === 'ja' ? '🙋' : '😇'} {nome(id)}
            </span>
          ))}
        </div>
        <Bebem titulo="Já fizeram — bebem:" lista={res.drinkers} golos={res.golos} />
      </div>
    );
  }

  if (res.kind === 'mais_provavel') {
    const max = Math.max(1, ...Object.values(res.tally));
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          {Object.entries(res.tally)
            .sort((a, b) => b[1] - a[1])
            .map(([id, n]) => (
              <div key={id} className="flex items-center gap-2">
                <Avatar player={jogador(id)} size={24} />
                <span className="text-sm w-24 truncate">{nome(id)}</span>
                <div className="flex-1 h-3 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(n / max) * 100}%` }}
                    className="h-full rounded-full"
                    style={{ background: 'linear-gradient(90deg,#fb923c,#ff3d8b)' }}
                  />
                </div>
                <span className="text-sm font-bold w-6 text-right">{n}</span>
              </div>
            ))}
        </div>
        <Bebem titulo="Mais votado(s):" lista={res.winners} golos={res.golos} />
      </div>
    );
  }

  if (res.kind === 'termometro') {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2 justify-center">
          {Object.entries(res.answers)
            .sort((a, b) => b[1] - a[1])
            .map(([id, v]) => (
              <span key={id} className="fd-chip flex items-center gap-1.5">
                <Avatar player={jogador(id)} size={20} />
                {nome(id)} <b className="text-lg">{v}</b>
              </span>
            ))}
        </div>
        <Bebem
          titulo={`Extremos (${res.lo} e ${res.hi}) — bebem:`}
          lista={[...(res.coldest || []), ...(res.hottest || [])]}
          golos={res.golos}
        />
      </div>
    );
  }

  // quem_disse
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-white/60">Era do…</p>
      <p className="text-2xl font-extrabold text-cyan-300 flex items-center gap-2 justify-center">
        <Avatar player={jogador(res.authorId)} size={30} /> {res.authorName}
      </p>
      <div className="flex flex-wrap gap-2 justify-center">
        {Object.entries(res.answers).map(([id, v]) => (
          <span key={id} className={`fd-chip text-xs ${v === res.authorId ? 'text-emerald-300' : 'text-rose-300'}`}>
            {nome(id)} → {nome(v)}
          </span>
        ))}
      </div>
      {res.allRight ? (
        <p className="text-lg font-extrabold text-rose-300">
          😳 Toda a gente acertou — {res.authorName} bebe {res.golos}!
        </p>
      ) : (
        <Bebem titulo="Erraram — bebem:" lista={res.wrong} golos={res.golos} />
      )}
    </div>
  );
}
