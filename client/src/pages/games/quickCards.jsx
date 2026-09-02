// F&D — cartões dos mini-jogos RÁPIDOS da Roda (jogam-se à mesa; a app dá o
// conteúdo, o cronómetro e o botão de veredicto): Categoria Relâmpago, Mímica,
// Roleta Russa e Duelo 1v1. Mesmo padrão dos cards.jsx.

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Coin from '../../components/Coin.jsx';
import { sfx } from '../../sfx.js';
import Timer from '../../components/Timer.jsx';
import { CardShell } from './shared.jsx';
import { MOLA } from '../../motion.js';

function ContinueButton({ show, onContinue }) {
  if (!show) return null;
  return (
    <button onClick={() => { sfx.click(); onContinue(); }} className="fd-btn fd-btn-primary mt-1">
      Continuar →
    </button>
  );
}

export function RelampagoCard({ round, youId, canControl, onStart, onResolve, onContinue }) {
  const isMine = round.currentPlayerId === youId;
  const canMark = isMine || canControl;

  return (
    <CardShell typeKey="categoria_relampago">
      <p className="text-sm text-white/50">
        Vez de <span className="font-bold text-white">{round.currentPlayerName}</span> — diz itens em
        voz alta até o tempo acabar!
      </p>
      <motion.p
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={MOLA.salto}
        className="text-2xl font-extrabold leading-tight text-amber-300"
      >
        ⚡ {round.category}
      </motion.p>

      {round.substate === 'ready' && (
        <>
          <p className="text-xs text-white/40">
            {round.seconds}s a debitar sem repetir nem travar. Se travares, bebes {2} golos.
          </p>
          {canMark ? (
            <button onClick={() => { sfx.click(); onStart(); }} className="fd-btn fd-btn-primary">
              ⏱️ Começar!
            </button>
          ) : (
            <p className="text-sm text-white/40">À espera do arranque…</p>
          )}
        </>
      )}

      {round.substate === 'running' && (
        <div className="flex flex-col items-center gap-2">
          <Timer seconds={round.seconds} runKey={round.id} size={96} />
          {canMark ? (
            <div className="flex gap-2 w-full mt-1">
              <button onClick={() => { sfx.click(); onResolve(true); }} className="fd-btn fd-btn-success flex-1">
                💪 Aguentou
              </button>
              <button onClick={() => { sfx.click(); onResolve(false); }} className="fd-btn fd-btn-danger flex-1">
                🍺 Travou
              </button>
            </div>
          ) : (
            <p className="text-sm text-white/40">A debitar… 👀</p>
          )}
        </div>
      )}

      {round.substate === 'result' && (
        <>
          <p className={`text-lg font-bold ${round.result?.survived ? 'text-emerald-300' : 'text-rose-300'}`}>
            {round.result?.survived
              ? `🎉 ${round.currentPlayerName} aguentou!`
              : `🍺 ${round.currentPlayerName} travou — ${round.result?.golos} golos!`}
          </p>
          <ContinueButton show={canControl} onContinue={onContinue} />
        </>
      )}
    </CardShell>
  );
}

export function MimicaCard({ round, youId, word, canControl, onStart, onResolve, onContinue }) {
  const isMine = round.currentPlayerId === youId;
  const canMark = isMine || canControl;

  return (
    <CardShell typeKey="mimica">
      <p className="text-sm text-white/50">
        {round.modeLabel || 'Mímica'} de{' '}
        <span className="font-bold text-white">{round.currentPlayerName}</span>
      </p>

      {isMine && round.substate !== 'result' ? (
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="fd-card p-3"
          style={{ background: 'rgba(244,114,182,0.12)' }}
        >
          <p className="text-xs text-white/50">A tua palavra (só tu vês) 🤫</p>
          <p className="text-2xl font-extrabold text-pink-200">{word?.word || '…'}</p>
        </motion.div>
      ) : round.substate !== 'result' ? (
        <p className="text-lg">🎭 Adivinhem o que {round.currentPlayerName} está a fazer!</p>
      ) : null}

      {round.substate === 'ready' && (
        <>
          <p className="text-xs text-white/40">{round.modeHint}</p>
          {canMark ? (
            <button onClick={() => { sfx.click(); onStart(); }} className="fd-btn fd-btn-primary">
              ⏱️ Já percebi — começar!
            </button>
          ) : (
            <p className="text-sm text-white/40">A preparar…</p>
          )}
        </>
      )}

      {round.substate === 'running' && (
        <div className="flex flex-col items-center gap-2">
          <Timer seconds={round.seconds} runKey={round.id} size={96} />
          {canMark ? (
            <div className="flex gap-2 w-full mt-1">
              <button onClick={() => { sfx.click(); onResolve(true); }} className="fd-btn fd-btn-success flex-1">
                ✅ Acertaram
              </button>
              <button onClick={() => { sfx.click(); onResolve(false); }} className="fd-btn fd-btn-danger flex-1">
                🍺 Ninguém acertou
              </button>
            </div>
          ) : (
            <p className="text-sm text-white/40">Gritem palpites! 📣</p>
          )}
        </div>
      )}

      {round.substate === 'result' && (
        <>
          <p className="text-sm text-white/50">A palavra era…</p>
          <p className="text-2xl font-extrabold text-pink-200">{round.result?.word}</p>
          <p className={`text-base font-bold ${round.result?.guessed ? 'text-emerald-300' : 'text-rose-300'}`}>
            {round.result?.guessed
              ? '🎉 O grupo acertou!'
              : `🍺 Ninguém acertou — ${round.currentPlayerName} bebe ${round.result?.golos} golos!`}
          </p>
          <ContinueButton show={canControl} onContinue={onContinue} />
        </>
      )}
    </CardShell>
  );
}

export function RoletaCard({ round, youId, canControl, onAnswer, onPass, onContinue }) {
  const isMine = round.currentPlayerId === youId;

  return (
    <CardShell typeKey="roleta_russa">
      <p className="text-sm text-white/50">
        Vez de <span className="font-bold text-white">{round.currentPlayerName}</span>
      </p>

      {round.substate === 'asking' ? (
        <>
          <motion.p
            key={round.question}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-lg leading-snug"
          >
            {round.question}
          </motion.p>
          <p className="text-xs text-white/40">
            Passes: {round.passes}/{round.maxPasses} · conta corrente 🍺 {round.tab} golos
          </p>
          {isMine ? (
            <div className="flex gap-2 mt-1">
              <button onClick={() => { sfx.click(); onAnswer(); }} className="fd-btn fd-btn-success flex-1">
                🎤 Respondo
              </button>
              <button onClick={() => { sfx.click(); onPass(); }} className="fd-btn fd-btn-danger flex-1">
                🎯 Passo (+{round.nextCost})
              </button>
            </div>
          ) : (
            <p className="text-sm text-white/40">A decidir se responde ou se arrisca…</p>
          )}
        </>
      ) : (
        <>
          <p className="text-base leading-snug text-white/70">{round.result?.question}</p>
          <p className={`text-lg font-bold ${round.result?.outcome === 'respondeu' ? 'text-emerald-300' : 'text-rose-300'}`}>
            {round.result?.outcome === 'respondeu'
              ? round.result?.golos > 0
                ? `🎤 Respondeu — mas paga ${round.result.golos} golos pelos passes!`
                : '🎤 Respondeu à primeira, sem beber nada!'
              : `💥 A roleta disparou — ${round.currentPlayerName} bebe ${round.result?.golos} golos!`}
          </p>
          <ContinueButton show={canControl} onContinue={onContinue} />
        </>
      )}
    </CardShell>
  );
}

export function DueloCard({ round, youId, canControl, onResult, onCall, onContinue }) {
  const duelists = [
    { id: round.currentPlayerId, name: round.currentPlayerName },
    { id: round.opponentId, name: round.opponentName },
  ];
  const canMark = canControl || duelists.some((d) => d.id === youId);
  // O cara-ou-coroa joga-se dentro da app: a moeda tem de assentar antes de se
  // ver quem ganhou, senão o resultado aparecia com a moeda ainda no ar.
  const isMoeda = round.duel?.key === 'cara_coroa';
  const [moedaAssentou, setMoedaAssentou] = useState(false);
  useEffect(() => {
    setMoedaAssentou(false);
  }, [round.id, round.coin?.face]);
  const escondeResultado = isMoeda && round.coin && !moedaAssentou;

  return (
    <CardShell typeKey="duelo">
      <div className="flex items-center justify-center gap-3">
        <span className="font-extrabold text-lg">{round.currentPlayerName}</span>
        <motion.span
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          className="text-2xl"
        >
          ⚔️
        </motion.span>
        <span className="font-extrabold text-lg">{round.opponentName}</span>
      </div>

      <p className="text-2xl font-extrabold text-sky-300">
        {round.duel?.emoji} {round.duel?.label}
      </p>
      <p className="text-sm text-white/60 leading-snug">{round.duel?.desc}</p>

      {/* Cara ou Coroa: escolher a face → a moeda voa → o resultado. */}
      {isMoeda && round.substate === 'calling' && (
        youId === round.currentPlayerId ? (
          <div className="flex flex-col gap-2 mt-1">
            <p className="text-sm text-white/60">Escolhe a tua face — se sair a outra, perdes:</p>
            <div className="flex gap-3">
              <button onClick={() => { sfx.click(); onCall('cara'); }} className="fd-btn fd-btn-amber flex-1 py-4 text-lg">
                👑 Cara
              </button>
              <button onClick={() => { sfx.click(); onCall('coroa'); }} className="fd-btn fd-btn-primary flex-1 py-4 text-lg">
                🍺 Coroa
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-white/50">
            {round.currentPlayerName} está a escolher cara ou coroa…
          </p>
        )
      )}

      {isMoeda && round.coin && (
        <>
          <Coin face={round.coin.face} flipKey={round.id} onDone={() => setMoedaAssentou(true)} />
          <p className="text-xs text-white/40">
            {round.currentPlayerName} pediu {round.coin.call === 'cara' ? '👑 cara' : '🍺 coroa'}
          </p>
        </>
      )}

      {escondeResultado ? null : round.substate === 'duelling' ? (
        canMark ? (
          <div className="flex flex-col gap-2 mt-1">
            <p className="text-xs text-white/40">Quem ganhou?</p>
            {duelists.map((d) => (
              <button
                key={d.id}
                onClick={() => { sfx.click(); onResult(d.id); }}
                className="fd-btn fd-btn-ghost py-3"
              >
                🏆 {d.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-white/40">Duelo a decorrer… 👀</p>
        )
      ) : (
        <>
          <p className="text-lg font-bold text-emerald-300">🏆 {round.result?.winnerName} ganhou!</p>
          <p className="text-base text-rose-300">
            🍺 {round.result?.loserName} bebe {round.result?.golos} golos.
          </p>
          <ContinueButton show={canControl} onContinue={onContinue} />
        </>
      )}
    </CardShell>
  );
}
