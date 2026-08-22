// F&D — cartão do jogo "Segredos" (adivinha o autor). Extraído do Game.jsx.
// Comportamento idêntico ao original.

import { useState } from 'react';
import { sfx } from '../../sfx.js';
import { CardShell } from './shared.jsx';

export function GuessingCard({ round, room, youId, isAuthor, canControl, onGuess, onReveal, onContinue }) {
  const [guessed, setGuessed] = useState(round.guessers?.includes(youId));
  const connected = room.players.filter((p) => p.connected && !p.eliminated);
  const eligible = connected.length - (round.hasAuthor ? 1 : 0);
  const youElim = room.players.find((p) => p.id === youId)?.eliminated;

  if (round.revealed) {
    const r = round.result;
    return (
      <CardShell typeKey="segredos">
        <p className="text-base italic text-white/80">"{round.prompt?.text}"</p>
        <p className="text-lg font-bold">
          🎭 Era do/a <span className="text-teal-300">{r?.authorName || '—'}</span>!
        </p>
        {r?.drinkers?.length > 0 ? (
          <p className="text-sm font-semibold text-amber-300">
            🍺 Bebe{r.drinkers.length > 1 ? 'm' : ''}: {r.drinkers.map((d) => d.name).join(', ')}
          </p>
        ) : (
          <p className="text-sm text-white/50">Ninguém bebe desta vez.</p>
        )}
        {canControl && (
          <button onClick={onContinue} className="fd-btn fd-btn-primary mt-1">
            Continuar →
          </button>
        )}
      </CardShell>
    );
  }

  return (
    <CardShell typeKey="segredos">
      <p className="text-lg italic leading-snug">"{round.prompt?.text}"</p>
      {isAuthor ? (
        <p className="text-sm text-teal-300 font-semibold">
          🤫 É o teu segredo! Fica calado e vê os outros a adivinhar…
        </p>
      ) : (
        <>
          <p className="text-xs text-white/50">
            De quem é? {round.guessers?.length || 0}/{eligible} adivinharam
          </p>
          {youElim ? (
            <p className="text-sm text-white/50">Estás fora — só a ver 🍿</p>
          ) : guessed ? (
            <p className="text-sm text-emerald-300 font-semibold">Adivinhaste! ✓ A aguardar…</p>
          ) : (
            <div className="flex flex-wrap gap-2 justify-center">
              {connected
                .filter((p) => p.id !== youId)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      sfx.click();
                      setGuessed(true);
                      onGuess(p.id);
                    }}
                    className="fd-chip"
                  >
                    {p.name}
                  </button>
                ))}
            </div>
          )}
        </>
      )}
      {canControl && (
        <button onClick={onReveal} className="fd-btn fd-btn-ghost py-2 text-sm mt-1">
          Revelar autor
        </button>
      )}
    </CardShell>
  );
}
