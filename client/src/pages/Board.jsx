import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { sfx } from '../sfx.js';
import { confetti, haptic } from '../confetti.js';

const KIND_ICON = { partida: '🏁', evento: '❓', gamble: '🎲' };
const GAME_EMOJI = {
  boca_calada: '🤐',
  desafio: '🔥',
  intrigas: '🗳️',
  segredos: '🤫',
  piramide: '🔺',
  vasco: '🕵️',
  isto_ou_aquilo: '⚖️',
};
const squareIcon = (sq) => (sq.kind === 'mini' ? GAME_EMOJI[sq.gameKey] || '🎮' : KIND_ICON[sq.kind] || '⬜');
const ADVANCE = [
  { n: 1, golos: 2 },
  { n: 2, golos: 4 },
  { n: 3, golos: 6 },
];

export default function Board({ room, youId, onPickPawn, onRoll, onAdvance, onResolve, onGamble, onPlayCard, onReset, onLeave }) {
  const b = room.board;
  const you = room.players.find((p) => p.id === youId);
  const isHost = you?.isHost;
  const [selCard, setSelCard] = useState(null); // carta selecionada p/ jogar (à espera de alvo)

  // Efeitos por evento (vitória / prisão / passo).
  const wonRef = useRef(false);
  const moveRef = useRef(null);
  useEffect(() => {
    if (b?.phase === 'over' && !wonRef.current) {
      wonRef.current = true;
      sfx.win();
      confetti({ count: 130, power: 16 });
    }
  }, [b?.phase]);
  useEffect(() => {
    const lm = b?.lastMove;
    if (!lm) return;
    const key = lm.playerId + ':' + lm.squares + ':' + lm.golos + ':' + lm.toPrison;
    if (moveRef.current === key) return;
    moveRef.current = key;
    if (lm.toPrison) {
      sfx.shot();
      haptic([80, 50, 120]);
    } else {
      sfx.drink();
      haptic(20);
    }
  }, [b?.lastMove]);

  if (!b) return null;
  const rows = room.players.map((p) => ({ ...p, ...(b.players[p.id] || {}) }));
  const currentPlayer = room.players.find((p) => p.id === b.currentPlayerId);
  const isMyTurn = b.currentPlayerId === youId;

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

  // ---------- Escolher peão ----------
  if (b.phase === 'pawn') {
    const taken = rows.map((r) => r.pawn).filter(Boolean);
    const mine = b.players[youId]?.pawn;
    const picked = rows.filter((r) => r.pawn).length;
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col gap-4">
        <Header sub={`${picked}/${rows.filter((r) => r.connected).length} escolheram`}>🎲 Escolhe o teu peão</Header>
        <div className="grid grid-cols-4 gap-2">
          {b.pawns.map((pw) => {
            const isTaken = taken.includes(pw);
            const isMine = mine === pw;
            return (
              <button
                key={pw}
                disabled={isTaken && !isMine}
                onClick={() => {
                  sfx.click();
                  onPickPawn(pw);
                }}
                className={`fd-card grid place-items-center text-3xl py-3 ${isMine ? 'ring-2 ring-pink-500' : ''} ${
                  isTaken && !isMine ? 'opacity-30' : ''
                }`}
              >
                {pw}
              </button>
            );
          })}
        </div>
        {mine && <p className="text-center text-sm text-emerald-300">Escolheste {mine}! À espera dos outros…</p>}
      </motion.div>
    );
  }

  // ---------- Lançar o dado (ordem) ----------
  if (b.phase === 'order') {
    const myDie = b.dice[youId];
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col gap-4">
        <Header sub="Maior valor joga primeiro">🎲 Lança o dado</Header>
        <div className="fd-card p-4 flex flex-col gap-2">
          {rows
            .filter((r) => r.connected)
            .map((r) => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span>
                  {r.pawn} <b>{r.name}</b>
                  {r.id === youId && <span className="text-white/40"> (tu)</span>}
                </span>
                <span className="text-lg">{b.dice[r.id] != null ? `🎲 ${b.dice[r.id]}` : '…'}</span>
              </div>
            ))}
        </div>
        {myDie == null ? (
          <button
            onClick={() => {
              sfx.spin();
              onRoll();
            }}
            className="fd-btn fd-btn-primary text-lg"
          >
            🎲 Lançar o dado
          </button>
        ) : (
          <p className="text-center text-sm text-emerald-300">Tiraste {myDie}! À espera dos outros…</p>
        )}
      </motion.div>
    );
  }

  // ---------- Fim ----------
  if (b.phase === 'over') {
    const board = [...rows].sort((a, c) => c.pos - a.pos);
    const mostGolos = [...rows].sort((a, c) => c.golos - a.golos)[0];
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col gap-4">
        <h1 className="fd-title fd-neon text-3xl font-extrabold text-center mt-2">Fim da corrida! 🏁</h1>
        {b.winner && (
          <div className="fd-card p-3 text-center" style={{ background: 'rgba(31,211,182,0.12)' }}>
            <p className="text-sm text-white/60">🏆 Deu a volta primeiro</p>
            <p className="text-2xl font-extrabold text-emerald-300">
              {b.players[b.winner.id]?.pawn} {b.winner.name}
            </p>
          </div>
        )}
        <div className="fd-card p-3">
          <h2 className="text-sm font-semibold text-white/60 mb-2">Classificação</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {board.map((r, i) => (
              <li key={r.id} className="flex justify-between">
                <span>
                  {i + 1}. {r.pawn} {r.name}
                </span>
                <span className="text-white/60">
                  {r.pos}/{b.size} · 🍺 {r.golos}
                </span>
              </li>
            ))}
          </ul>
          {mostGolos?.golos > 0 && (
            <p className="text-xs text-amber-300 mt-2">🍺 Bebeu mais: {mostGolos.pawn} {mostGolos.name} ({mostGolos.golos} golos)</p>
          )}
        </div>
        <div className="flex flex-col gap-2 mt-auto">
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

  // ---------- A jogar ----------
  const leaderboard = [...rows].sort((a, c) => c.pos - a.pos);
  const lm = b.lastMove;
  const ev = b.lastEvent;
  const meta = b.cardMeta || {};
  const myCards = b.players[youId]?.cards || [];
  const pending = b.pending;
  const targets = room.players.filter((p) => p.connected && p.id !== youId);
  const selMeta = selCard ? meta[selCard.key] : null;
  const needsTarget = selMeta && selCard.key !== 'shield';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col gap-3">
      <Header sub={`corrida até dar a volta (${b.size} casas)`}>
        {isMyTurn ? '🎯 É a tua vez!' : `Vez de ${currentPlayer?.pawn} ${currentPlayer?.name || ''}`}
      </Header>

      {/* Pista */}
      <div className="flex gap-1 overflow-x-auto pb-2 -mx-1 px-1">
        {b.squares.map((sq) => {
          const here = rows.filter((r) => r.pos === sq.i && r.pawn);
          const isCur = b.players[b.currentPlayerId]?.pos === sq.i;
          return (
            <div
              key={sq.i}
              className={`flex-shrink-0 w-11 rounded-lg text-center py-1.5 ${
                sq.kind === 'partida' ? 'bg-pink-500/25' : sq.kind === 'evento' ? 'bg-fuchsia-500/15' : sq.kind === 'gamble' ? 'bg-amber-500/15' : 'bg-white/5'
              } ${isCur ? 'ring-2 ring-pink-500' : ''}`}
            >
              <div className="text-lg leading-none">{squareIcon(sq)}</div>
              <div className="text-[9px] text-white/30">{sq.i}</div>
              <div className="text-sm leading-tight min-h-[18px]">{here.map((r) => r.pawn).join('')}</div>
            </div>
          );
        })}
      </div>

      {/* Classificação + cartas (públicas) */}
      <div className="fd-card p-2.5 flex flex-col gap-1">
        {leaderboard.map((r) => (
          <div key={r.id} className={`flex items-center justify-between text-xs ${r.id === b.currentPlayerId ? 'text-pink-300 font-semibold' : ''}`}>
            <span>
              {r.pawn} {r.name}
              {r.shield && ' 🛡️'}
              {r.skipTurns > 0 && <span className="text-rose-300"> 🚔</span>}
            </span>
            <span className="text-white/60">
              {(r.cards || []).map((c) => meta[c.key]?.emoji).join('')} {r.pos}/{b.size} · 🍺 {r.golos}
            </span>
          </div>
        ))}
      </div>

      {ev ? (
        <p className="text-center text-sm text-amber-200">{ev.text}</p>
      ) : lm ? (
        <p className="text-center text-xs text-white/50">
          {lm.name} andou {lm.squares} casa{lm.squares > 1 ? 's' : ''} (🍺 {lm.golos})
        </p>
      ) : null}

      {/* Resolver a casa onde caiu */}
      {pending && isMyTurn && (
        <div className="fd-card p-4 flex flex-col gap-3 text-center" style={{ boxShadow: '0 10px 30px -12px #ffb02099' }}>
          {pending.kind === 'mini' && pending.variant === 'dare' && (
            <>
              <p className="text-xs font-bold uppercase tracking-wide text-white/50">{pending.gameLabel}</p>
              <p className="text-base">{pending.text}</p>
              <div className="flex gap-2">
                <button onClick={() => { sfx.click(); onResolve({ action: 'do' }); }} className="fd-btn fd-btn-success flex-1">✅ Faço!</button>
                <button onClick={() => { sfx.click(); onResolve({ action: 'drink' }); }} className="fd-btn fd-btn-danger flex-1">🍺 Bebo 3</button>
              </div>
            </>
          )}
          {pending.kind === 'mini' && pending.variant === 'choice' && (
            <>
              <p className="text-xs font-bold uppercase tracking-wide text-white/50">⚖️ Isto ou Aquilo?</p>
              {pending.options.map((o, i) => (
                <button key={i} onClick={() => { sfx.click(); onResolve({ choice: i }); }} className="fd-btn fd-btn-ghost text-left py-3">
                  {i === 0 ? '👈 ' : '👉 '}{o}
                </button>
              ))}
            </>
          )}
          {pending.kind === 'gamble' && (
            <>
              <p className="text-lg font-bold text-amber-300">🎲 Gamble!</p>
              <p className="text-sm text-white/60">Aposta 2 golos: 50/50 → avanças 2 ou recuas 2. Passar = ficas.</p>
              <div className="flex gap-2">
                <button onClick={() => { sfx.click(); onGamble(true); }} className="fd-btn fd-btn-amber flex-1">🎲 Apostar</button>
                <button onClick={() => { sfx.click(); onGamble(false); }} className="fd-btn fd-btn-ghost flex-1">Passar</button>
              </div>
            </>
          )}
        </div>
      )}
      {pending && !isMyTurn && (
        <p className="text-center text-sm text-white/40">{currentPlayer?.name} está a resolver a casa…</p>
      )}

      {/* Cartas + avançar (só a vez, sem casa pendente) */}
      {isMyTurn && !pending && (
        <div className="mt-auto flex flex-col gap-2">
          {myCards.length > 0 && (
            <div className="fd-card p-2.5 flex flex-col gap-2">
              <p className="text-xs text-white/60">🎴 As tuas cartas — joga uma antes de andar:</p>
              <div className="flex flex-wrap gap-2">
                {myCards.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { sfx.click(); setSelCard(selCard?.id === c.id ? null : c); }}
                    className={`fd-chip ${selCard?.id === c.id ? 'fd-chip-on' : ''}`}
                  >
                    {meta[c.key]?.emoji} {meta[c.key]?.name}
                  </button>
                ))}
              </div>
              {selCard && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-white/50">{selMeta?.desc}</p>
                  {needsTarget ? (
                    <div className="flex flex-wrap gap-2">
                      {targets.map((p) => (
                        <button key={p.id} onClick={() => { sfx.click(); onPlayCard(selCard.id, p.id); setSelCard(null); }} className="fd-chip">
                          {b.players[p.id]?.pawn} {p.name}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button onClick={() => { sfx.click(); onPlayCard(selCard.id, null); setSelCard(null); }} className="fd-btn fd-btn-primary py-2 text-sm">
                      Ativar {selMeta?.name}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <p className="text-center text-sm text-white/60">Quanto queres andar? (bebes e avanças)</p>
          <div className="flex gap-2">
            {ADVANCE.map((a) => (
              <button key={a.n} onClick={() => { sfx.click(); onAdvance(a.n); }} className="fd-btn fd-btn-primary flex-1 flex flex-col py-3">
                <span className="text-lg font-extrabold">{a.n} casa{a.n > 1 ? 's' : ''}</span>
                <span className="text-xs opacity-80">🍺 {a.golos} golos</span>
              </button>
            ))}
          </div>
          <p className="text-center text-[11px] text-white/35">Andar só 1 casa 3× seguidas → prisão 🚔</p>
        </div>
      )}
      {!isMyTurn && !pending && (
        <p className="text-center text-white/40 py-3 mt-auto">À espera de <b className="text-white">{currentPlayer?.name}</b>…</p>
      )}
    </motion.div>
  );
}
