// F&D — cartão do jogo "Piramide (Desconfia)" + auxiliares de cartas.
// Extraído do Game.jsx, comportamento idêntico.

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { sfx } from '../../sfx.js';
import { confetti, haptic } from '../../confetti.js';
import { CardShell } from './shared.jsx';

const RED_SUITS = ['♥', '♦'];

function PlayingCard({ rank, suit, faceDown, highlight, size = 'md' }) {
  const dims = size === 'sm' ? 'w-9 h-12 text-sm' : 'w-14 h-20 text-xl';
  if (faceDown) {
    return (
      <div
        className={`${dims} rounded-lg grid place-items-center font-bold shrink-0`}
        style={{
          background: 'linear-gradient(135deg,#3a2a6a,#5b8cff)',
          boxShadow: highlight ? '0 0 0 2px #fff, 0 0 16px #5b8cff' : 'inset 0 0 0 1px rgba(255,255,255,.15)',
        }}
      >
        <span className="opacity-80">🔺</span>
      </div>
    );
  }
  const red = RED_SUITS.includes(suit);
  return (
    <motion.div
      initial={{ rotateY: 90, opacity: 0 }}
      animate={{ rotateY: 0, opacity: 1 }}
      className={`${dims} rounded-lg grid place-items-center font-extrabold bg-white shrink-0`}
      style={{ boxShadow: highlight ? '0 0 0 2px #ffb020' : '0 2px 8px rgba(0,0,0,.4)' }}
    >
      <span className={red ? 'text-rose-600' : 'text-neutral-900'}>
        {rank}
        {suit}
      </span>
    </motion.div>
  );
}

function PyramidBoard({ round }) {
  const nextIdx = round.pyramid.findIndex((c) => !c.flipped);
  const byLevel = {};
  round.pyramid.forEach((c, idx) => {
    (byLevel[c.level] ||= []).push({ ...c, idx });
  });
  const levels = Object.keys(byLevel)
    .map(Number)
    .sort((a, b) => b - a); // topo (nível alto) → base
  return (
    <div className="flex flex-col items-center gap-1.5">
      {levels.map((lvl) => {
        const cards = byLevel[lvl];
        return (
          <div key={lvl} className="flex items-center gap-1.5">
            {cards.map((c) => (
              <PlayingCard
                key={c.id}
                rank={c.rank}
                suit={c.suit}
                faceDown={!c.flipped}
                highlight={c.idx === nextIdx}
                size="sm"
              />
            ))}
            <span className="text-[10px] text-white/40 ml-1 w-10">{cards[0].golos} golos</span>
          </div>
        );
      })}
    </div>
  );
}

export function PiramideCard({
  round,
  room,
  youId,
  hand,
  canControl,
  onReady,
  onFlip,
  onAssign,
  onPass,
  onRespond,
  onNext,
  onContinue,
}) {
  const [readied, setReadied] = useState(false);
  const connected = room.players.filter((p) => p.connected);
  const isFlipper = round.currentPlayerId === youId;
  const flipperName = room.players.find((p) => p.id === round.currentPlayerId)?.name || '…';
  const fc = round.flippedCard;

  // Sons pontuais por transição.
  const subRef = useRef(null);
  useEffect(() => {
    const key = `${round.substate}:${fc?.id || ''}`;
    if (subRef.current === key) return;
    subRef.current = key;
    if (round.substate === 'flipping' && fc) sfx.reveal();
    else if (round.substate === 'resolved') {
      sfx.drink();
      haptic([30, 30]);
    } else if (round.substate === 'summary') {
      sfx.win();
      confetti({ count: 90, power: 14 });
    }
  }, [round.substate, fc?.id]);

  // --- Memorização ---
  if (round.substate === 'memorize') {
    return (
      <CardShell typeKey="piramide">
        <p className="text-lg font-bold">🧠 Memoriza as tuas cartas!</p>
        <p className="text-xs text-white/50">
          Vais precisar de te lembrar delas. Depois ficam escondidas e alguém pode desconfiar de ti…
        </p>
        {hand ? (
          <div className="flex justify-center gap-2 my-2">
            {hand.map((c, i) => (
              <PlayingCard key={i} rank={c.rank} suit={c.suit} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-white/40 my-3">A receber cartas…</p>
        )}
        {readied ? (
          <p className="text-sm text-emerald-300 font-semibold">
            Pronto! À espera dos outros… {round.readyCount}/{connected.length}
          </p>
        ) : (
          <button
            onClick={() => {
              sfx.click();
              setReadied(true);
              onReady();
            }}
            className="fd-btn fd-btn-primary"
          >
            ✅ Já memorizei ({round.readyCount}/{connected.length})
          </button>
        )}
      </CardShell>
    );
  }

  // --- Resumo final ---
  if (round.substate === 'summary') {
    const rows = [...(round.summary?.rows || [])].sort((a, b) => b.made - a.made || b.golosGiven - a.golosGiven);
    const winners = round.summary?.winners || [];
    const winnerIds = new Set(winners.map((w) => w.id));
    return (
      <CardShell typeKey="piramide">
        <p className="text-lg font-bold">🔺 Fim da pirâmide!</p>
        {winners.length ? (
          <p className="text-base font-bold text-emerald-300">
            🏆 {winners.map((w) => w.name).join(', ')} fez beber mais — +1 vida!
          </p>
        ) : (
          <p className="text-sm text-white/50">Ninguém fez ninguém beber… sem prémio 🤷</p>
        )}
        <ul className="flex flex-col gap-1 text-sm mt-1">
          {rows.map((r) => (
            <li
              key={r.id}
              className={`flex justify-between ${winnerIds.has(r.id) ? 'text-emerald-300 font-semibold' : ''}`}
            >
              <span>
                {winnerIds.has(r.id) && '🏆 '}
                {r.name}
              </span>
              <span className="text-white/60">
                fez beber {r.made}× · 🍺 {r.golosDrunk}g · 🤨 {r.caught}
              </span>
            </li>
          ))}
        </ul>
        {canControl && (
          <button onClick={onContinue} className="fd-btn fd-btn-primary mt-1">
            Voltar à roda →
          </button>
        )}
      </CardShell>
    );
  }

  // --- Jogo (flipping / challenge / resolved) ---
  const isTarget = round.assign?.targetId === youId;
  const rv = round.reveal;

  return (
    <CardShell typeKey="piramide">
      <PyramidBoard round={round} />

      {fc && (
        <p className="text-sm text-white/60">
          Carta virada:{' '}
          <span className={RED_SUITS.includes(fc.suit) ? 'text-rose-400 font-bold' : 'text-white font-bold'}>
            {fc.rank}
            {fc.suit}
          </span>{' '}
          · nível {fc.level} · <b>{fc.golos} golos</b>
        </p>
      )}

      {/* FLIPPING */}
      {round.substate === 'flipping' &&
        (isFlipper ? (
          !fc ? (
            <button
              onClick={() => {
                sfx.click();
                onFlip();
              }}
              className="fd-btn fd-btn-primary"
            >
              🃏 Virar carta
            </button>
          ) : (
            <>
              <p className="text-sm text-white/60">
                Faz alguém beber (afirma que tens um <b>{fc.rank}</b>) ou passa:
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {connected
                  .filter((p) => p.id !== youId)
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        sfx.click();
                        onAssign(p.id);
                      }}
                      className="fd-chip"
                    >
                      🍺 {p.name}
                    </button>
                  ))}
              </div>
              <button onClick={onPass} className="fd-btn fd-btn-ghost py-2 text-sm">
                Passar (não faço ninguém beber)
              </button>
            </>
          )
        ) : (
          <p className="text-sm text-white/50">
            Vez de <b className="text-white">{flipperName}</b> —{' '}
            {fc ? 'a escolher quem bebe…' : 'a virar carta…'}
          </p>
        ))}

      {/* CHALLENGE */}
      {round.substate === 'challenge' &&
        (isTarget ? (
          <>
            <p className="text-base">
              <b>{round.assign.flipperName}</b> diz ter um <b>{fc.rank}</b> e manda-te beber{' '}
              <b>{fc.golos} golos</b>. Acreditas?
            </p>
            <div className="flex gap-3 mt-1">
              <button
                onClick={() => {
                  sfx.click();
                  onRespond('aceitar');
                }}
                className="fd-btn fd-btn-danger flex-1"
              >
                🍺 Bebo ({fc.golos})
              </button>
              <button
                onClick={() => {
                  sfx.click();
                  onRespond('desconfiar');
                }}
                className="fd-btn fd-btn-success flex-1"
              >
                🤨 Desconfio!
              </button>
            </div>
            <p className="text-[11px] text-white/40">
              Se desconfiares e ele tiver mesmo, bebes o <b>dobro</b> ({fc.golos * 2}).
            </p>
          </>
        ) : (
          <p className="text-sm text-white/60">
            <b className="text-white">{round.assign?.flipperName}</b> mandou{' '}
            <b className="text-white">{round.assign?.targetName}</b> beber {fc.golos} golos — aceita ou desconfia?
          </p>
        ))}

      {/* RESOLVED */}
      {round.substate === 'resolved' && rv && (
        <>
          {rv.decision === 'aceitar' ? (
            <p className="text-base font-bold text-amber-300">
              🍺 {rv.drinkerName} aceitou e bebeu {rv.golos} golos.
            </p>
          ) : rv.hadIt ? (
            <p className="text-base font-bold text-amber-300">
              😅 Tinha mesmo{rv.matchedCard ? ` (${rv.matchedCard.rank}${rv.matchedCard.suit})` : ''}! {rv.drinkerName}{' '}
              desconfiou mal e bebe o dobro: {rv.golos} golos.
            </p>
          ) : (
            <p className="text-base font-bold text-emerald-300">
              😈 Bluff apanhado! {rv.drinkerName} não tinha nada e bebe o dobro: {rv.golos} golos.
            </p>
          )}
          {(isFlipper || canControl) && (
            <button onClick={onNext} className="fd-btn fd-btn-primary mt-1">
              Próxima carta →
            </button>
          )}
        </>
      )}
    </CardShell>
  );
}
