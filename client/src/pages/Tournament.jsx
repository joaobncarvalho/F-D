// F&D — Modo Torneio: bracket eliminatório com os mini-jogos rápidos da Roda.
// Segue o padrão do Board.jsx: uma página por fase (bracket / duelo / campeão).

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { sfx } from '../sfx.js';
import { confetti, haptic } from '../confetti.js';
import { TYPES } from './games/shared.jsx';
import { BotaoReacao } from './games/ReacaoCard.jsx';
import Feed, { ShareResult } from '../components/Feed.jsx';

const typeMeta = (key) => TYPES.find((t) => t.key === key) || { emoji: '🎮', label: 'Duelo', color: '#ff3d8b' };

export default function Tournament({ room, youId, onNext, onAction, onChoose, onVote, onTap, onContinue, onSkip, onEnd, onReset, onLeave }) {
  const t = room?.tournament;
  const you = room?.players.find((p) => p.id === youId);
  const isHost = you?.isHost;
  const crownedRef = useRef(false);
  const [showBracket, setShowBracket] = useState(false);

  useEffect(() => {
    if (t?.phase === 'over' && !crownedRef.current) {
      crownedRef.current = true;
      sfx.win();
      confetti({ count: 150, power: 17 });
      haptic([40, 60, 40]);
    }
  }, [t?.phase]);

  if (!t) return null;

  const Header = ({ children, sub }) => (
    <header className="flex items-center justify-between">
      <button onClick={onLeave} className="text-sm text-white/50">← Sair</button>
      <div className="text-center">
        <h1 className="fd-title font-extrabold text-lg">{children}</h1>
        {sub && <p className="text-xs text-white/40">{sub}</p>}
      </div>
      <span className="w-10" />
    </header>
  );

  // ---------- Campeão ----------
  if (t.phase === 'over') {
    const ranking = [...(t.stats || [])].sort((a, b) => b.wins - a.wins || b.drinks - a.drinks);
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col gap-4">
        <motion.h1
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 12 }}
          className="fd-title fd-neon text-3xl font-extrabold text-center mt-2"
        >
          Fim do torneio! 🏆
        </motion.h1>
        {t.champion && (
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 220, damping: 14 }}
            className="fd-card p-5 text-center"
            style={{ background: 'rgba(255,176,32,0.14)', boxShadow: '0 12px 34px -14px rgba(255,176,32,0.8)' }}
          >
            <p className="text-sm text-white/60">👑 Rei/Rainha da noite</p>
            <motion.p
              className="text-4xl font-extrabold text-amber-300 leading-tight mt-1"
              animate={{ scale: [1, 1.07, 1] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            >
              {t.champion.name}
            </motion.p>
          </motion.div>
        )}

        <div className="fd-card p-3">
          <h2 className="text-sm font-semibold text-white/60 mb-2">Placar</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {ranking.map((r, i) => (
              <motion.li
                key={r.id}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.07 }}
                className={`flex justify-between ${r.id === t.champion?.id ? 'text-amber-300 font-semibold' : ''}`}
              >
                <span>{r.id === t.champion?.id ? '👑 ' : `${i + 1}. `}{r.name}</span>
                <span className="text-white/60">🏆 {r.wins} · ⚔️ {r.duels} · 🍺 {r.drinks}</span>
              </motion.li>
            ))}
          </ul>
        </div>

        <Bracket t={t} youId={youId} />

        <div className="flex flex-col gap-2 mt-auto">
          <ShareResult
            data={() => ({
              title: 'F&D — o torneio',
              subtitle: `${t.roundIdx + 1} rondas de eliminação direta`,
              awards: [t.champion && { emoji: '👑', label: 'Rei/Rainha da noite', name: t.champion.name }].filter(Boolean),
              rows: ranking.map((r) => ({
                emoji: room.players.find((p) => p.id === r.id)?.emoji || '🙂',
                name: r.name,
                detail: `🏆 ${r.wins} · 🍺 ${r.drinks}`,
                highlight: r.id === t.champion?.id,
              })),
            })}
          />
          {isHost && (
            <button onClick={() => { sfx.click(); onReset(); }} className="fd-btn fd-btn-primary">
              🔄 Jogar outra vez
            </button>
          )}
          <button onClick={onLeave} className="fd-btn fd-btn-ghost">Sair</button>
        </div>
      </motion.div>
    );
  }

  // ---------- Duelo a decorrer ----------
  if (t.phase === 'duel' && t.duel) {
    const d = t.duel;
    const meta = typeMeta(d.gameTypeKey);
    const isDuelist = d.aId === youId || d.bId === youId;
    const iPlayed = d.substate === 'daring' ? d.played.includes(youId) : d.played.includes(youId);
    const canContinue = isHost || isDuelist;

    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col gap-3">
        <Header sub={`Ronda ${t.roundIdx + 1} · eliminação direta`}>⚔️ Duelo</Header>

        <Feed feed={room.feed} />

        <div className="fd-card p-3 flex items-center justify-around text-center">
          <span className={`font-extrabold ${d.result?.winnerId === d.aId ? 'text-emerald-300' : ''}`}>{d.aName}</span>
          <motion.span animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 1.4, repeat: Infinity }} className="text-2xl">
            ⚔️
          </motion.span>
          <span className={`font-extrabold ${d.result?.winnerId === d.bId ? 'text-emerald-300' : ''}`}>{d.bName}</span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 14, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="fd-card p-5 flex flex-col gap-3 text-center"
          style={{ boxShadow: `0 12px 40px -14px ${meta.color}99` }}
        >
          <p className="text-sm font-bold uppercase tracking-wide" style={{ color: meta.color }}>
            {meta.emoji} {meta.label}
          </p>

          {d.substate === 'daring' && (
            <>
              <p className="text-lg leading-snug">{d.text}</p>
              <p className="text-xs text-white/40">
                Os dois decidem em segredo. Quem recusar sozinho está FORA (e bebe). Se decidirem o
                mesmo, os dois bebem e a moeda decide.
              </p>
              {isDuelist && !iPlayed ? (
                <div className="flex gap-3 mt-1">
                  <button onClick={() => { sfx.click(); onAction('accept'); }} className="fd-btn fd-btn-success flex-1">
                    ✅ Aceito
                  </button>
                  <button onClick={() => { sfx.click(); onAction('refuse'); }} className="fd-btn fd-btn-danger flex-1">
                    🍺 Recuso
                  </button>
                </div>
              ) : (
                <p className="text-sm text-white/40">
                  {iPlayed ? 'Jogaste! À espera do adversário…' : `Duelo em curso… ${d.played.length}/2 jogaram`}
                </p>
              )}
            </>
          )}

          {d.substate === 'racing' && d.reaction && (
            <>
              <p className="text-lg leading-snug">{d.text}</p>
              {isDuelist ? (
                <BotaoReacao
                  goAt={d.reaction.goAt}
                  jaCarreguei={d.reaction.tapped?.includes(youId)}
                  falso={d.reaction.falseStarts?.includes(youId)}
                  onTap={onTap}
                />
              ) : (
                <p className="text-sm text-white/40">
                  🍿 Dois dedos, um sinal. {d.reaction.tapped.length + d.reaction.falseStarts.length}/2 já carregaram.
                </p>
              )}
            </>
          )}

          {d.substate === 'choosing' && (
            <>
              <p className="text-xs text-white/40">Cada duelista escolhe em segredo; a mesa julga quem teve mais coragem.</p>
              {isDuelist && !iPlayed ? (
                <div className="flex flex-col gap-2">
                  {d.options?.map((o, i) => (
                    <button key={i} onClick={() => { sfx.click(); onChoose(i); }} className="fd-btn fd-btn-ghost text-left py-3">
                      {i === 0 ? '👈 ' : '👉 '}{o}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-1 text-sm text-white/60">
                    {d.options?.map((o, i) => <p key={i}>{i === 0 ? '👈 ' : '👉 '}{o}</p>)}
                  </div>
                  <p className="text-sm text-white/40">
                    {iPlayed ? 'Escolheste! À espera do adversário…' : `${d.played.length}/2 já escolheram`}
                  </p>
                </>
              )}
            </>
          )}

          {d.substate === 'judging' && (
            <>
              <div className="flex flex-col gap-1 text-sm">
                <p>
                  <b>{d.aName}</b>: {d.options?.[d.actions?.[d.aId]] || '—'}
                </p>
                <p>
                  <b>{d.bName}</b>: {d.options?.[d.actions?.[d.bId]] || '—'}
                </p>
              </div>
              {isDuelist ? (
                <p className="text-sm text-white/40">A mesa está a votar quem teve mais coragem… 👀</p>
              ) : d.voters.includes(youId) ? (
                <p className="text-sm text-emerald-300">Votaste! À espera dos outros…</p>
              ) : (
                <div className="flex gap-2 mt-1">
                  <button onClick={() => { sfx.click(); onVote(d.aId); }} className="fd-btn fd-btn-ghost flex-1">
                    {d.aName}
                  </button>
                  <button onClick={() => { sfx.click(); onVote(d.bId); }} className="fd-btn fd-btn-ghost flex-1">
                    {d.bName}
                  </button>
                </div>
              )}
            </>
          )}

          {d.substate === 'result' && (
            <>
              <p className="text-xl font-extrabold text-emerald-300">🏆 {d.result.winnerName} avança!</p>
              <p className="text-base text-rose-300">
                💀 {d.result.loserName} está eliminado/a
                {d.result.how === 'recusou' ? ' (recusou)' : d.result.how === 'sorteio' ? ' (à sorte)' : d.result.how === 'desistiu' ? ' (saiu)' : ' (votação da mesa)'}.
              </p>
              {canContinue && (
                <button onClick={() => { sfx.click(); onContinue(); }} className="fd-btn fd-btn-primary mt-1">
                  Continuar →
                </button>
              )}
            </>
          )}
        </motion.div>

        <button onClick={() => setShowBracket((v) => !v)} className="fd-btn fd-btn-ghost py-2 text-sm">
          {showBracket ? 'Esconder quadro' : '📋 Ver o quadro'}
        </button>
        <AnimatePresence>{showBracket && <Bracket t={t} youId={youId} />}</AnimatePresence>

        {isHost && (
          <div className="flex gap-2 mt-auto pt-2">
            <button onClick={() => { sfx.click(); onSkip(); }} className="fd-btn fd-btn-ghost flex-1 py-3 text-sm">
              ⏭️ Resolver à sorte
            </button>
            <button onClick={() => { sfx.click(); onEnd(); }} className="fd-btn fd-btn-ghost flex-1 py-3 text-sm text-rose-300">
              Terminar
            </button>
          </div>
        )}
      </motion.div>
    );
  }

  // ---------- Quadro (entre duelos) ----------
  const round = t.rounds[t.roundIdx] || [];
  const pending = round.filter((m) => !m.winnerId);
  const next = pending[0];
  const iAmNext = next && (next.a?.id === youId || next.b?.id === youId);
  const amEliminated = t.eliminated.some((e) => e.id === youId);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col gap-3">
      <Header sub={`Ronda ${t.roundIdx + 1} · ${pending.length} duelo(s) por jogar`}>🏆 Torneio</Header>

      {t.lastResult && (
        <motion.p
          key={t.lastResult.loserId + t.lastResult.winnerId}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center text-sm text-amber-200"
        >
          🏆 {t.lastResult.winnerName} eliminou {t.lastResult.loserName}
        </motion.p>
      )}

      <Bracket t={t} youId={youId} />

      <div className="mt-auto flex flex-col gap-2">
        {next ? (
          <>
            <p className="text-center text-sm text-white/60">
              A seguir: <b className="text-white">{next.a?.name}</b> vs <b className="text-white">{next.b?.name}</b>
              {iAmNext && <span className="text-pink-300"> — és tu! 😬</span>}
            </p>
            <button onClick={() => { sfx.click(); onNext(); }} className="fd-btn fd-btn-primary text-lg">
              ⚔️ Começar o duelo
            </button>
          </>
        ) : (
          <button onClick={() => { sfx.click(); onNext(); }} className="fd-btn fd-btn-primary text-lg">
            ➡️ Próxima ronda
          </button>
        )}
        {amEliminated && <p className="text-center text-xs text-white/40">Estás fora — mas continuas a votar nos duelos. 🍿</p>}
        {isHost && (
          <button onClick={() => { sfx.click(); onEnd(); }} className="fd-btn fd-btn-ghost py-2 text-sm text-rose-300">
            Terminar torneio
          </button>
        )}
      </div>
    </motion.div>
  );
}

/** Quadro do torneio: uma coluna por ronda, com os confrontos e os vencedores. */
function Bracket({ t, youId }) {
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="fd-card p-2.5 overflow-hidden">
      <p className="text-[10px] uppercase tracking-widest text-white/35 mb-2 px-1">Quadro</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {t.rounds.map((round, ri) => (
          <div key={ri} className="flex-shrink-0 w-36 flex flex-col gap-1.5">
            <p className={`text-[10px] text-center ${ri === t.roundIdx ? 'text-pink-300 font-bold' : 'text-white/35'}`}>
              {ri === t.rounds.length - 1 && round.length === 1 ? 'Final' : `Ronda ${ri + 1}`}
            </p>
            {round.map((m) => (
              <div key={m.id} className={`rounded-lg p-1.5 text-[11px] flex flex-col gap-0.5 ${m.winnerId ? 'bg-white/5' : 'bg-pink-500/10 ring-1 ring-pink-500/30'}`}>
                <Slot p={m.a} winner={m.winnerId === m.a?.id} done={!!m.winnerId} youId={youId} />
                {m.bye ? (
                  <span className="text-white/30 italic">bye ✈️</span>
                ) : (
                  <Slot p={m.b} winner={m.winnerId === m.b?.id} done={!!m.winnerId} youId={youId} />
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function Slot({ p, winner, done, youId }) {
  if (!p) return <span className="text-white/25">—</span>;
  return (
    <span className={`truncate ${winner ? 'text-emerald-300 font-semibold' : done ? 'text-white/30 line-through' : ''}`}>
      {winner && '🏆 '}
      {p.name}
      {p.id === youId && <span className="text-white/40"> (tu)</span>}
    </span>
  );
}
