// F&D — cartão do "Jogo do Vasco (Impostor)". Extraído do Game.jsx, comportamento idêntico.

import { useEffect, useRef } from 'react';
import { sfx } from '../../sfx.js';
import { confetti, haptic } from '../../confetti.js';
import { CardShell } from './shared.jsx';

export function VascoCard({ round, room, youId, role, canControl, onStartClues, onClueDone, onVote, onRedeem, onReveal, onContinue }) {
  const theme = round.theme;
  const isImpostor = role?.isImpostor;
  const secretWord = role?.word || null; // só o grupo tem a palavra
  const sub = round.substate;
  const activeCount = room.players.filter((p) => p.connected && !p.eliminated).length;
  const youElim = room.players.find((p) => p.id === youId)?.eliminated;

  // Som no resultado.
  const doneRef = useRef(null);
  useEffect(() => {
    if (sub === 'result' && doneRef.current !== round.id) {
      doneRef.current = round.id;
      sfx.reveal();
      confetti({ count: 80, power: 13 });
      haptic([30, 40, 30]);
    }
  }, [sub, round.id]);

  // --- Reveal do papel ---
  if (sub === 'reveal') {
    return (
      <CardShell typeKey="vasco">
        {role ? (
          isImpostor ? (
            <>
              <p className="text-4xl">🕵️</p>
              <p className="text-xl font-extrabold text-orange-300">És o VASCO!</p>
              <p className="text-sm text-white/60">
                Não sabes a palavra. A tua única pista é o tema — ouve as pistas dos outros e
                descobre-a.
              </p>
              <p className="text-lg">
                Tema: <b className="text-teal-300">{theme}</b>
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-white/60">A palavra do grupo é:</p>
              <p className="text-3xl font-extrabold text-teal-300">{secretWord}</p>
              <p className="text-sm">
                Tema (o Vasco só sabe isto): <b className="text-teal-300">{theme}</b>
              </p>
              <p className="text-xs text-white/50">
                Há {round.impostorCount} Vasco(s) infiltrado(s) 🕵️ — dá pistas sem entregar a
                palavra!
              </p>
            </>
          )
        ) : (
          <p className="text-sm text-white/40">A receber o teu papel…</p>
        )}
        {canControl && (
          <button onClick={onStartClues} className="fd-btn fd-btn-primary mt-1">
            Toca a dar pistas →
          </button>
        )}
      </CardShell>
    );
  }

  // --- Ronda de pistas ---
  if (sub === 'clues') {
    const cur = room.players.find((p) => p.id === round.clueCurrentId);
    const isMyTurn = round.clueCurrentId === youId;
    return (
      <CardShell typeKey="vasco">
        <p className="text-base">
          Tema: <b className="text-teal-300">{theme}</b>
        </p>
        {!isImpostor && secretWord && (
          <p className="text-sm text-white/60">
            Palavra: <b className="text-teal-300">{secretWord}</b>
          </p>
        )}
        <p className="text-base mt-1">
          Pista de <b className="text-white">{cur?.name || '…'}</b>
          {isMyTurn && <span className="text-orange-300"> (és tu!)</span>}
        </p>
        <p className="text-xs text-white/50">Diz em voz alta UMA palavra ligada à palavra secreta.</p>
        {isMyTurn || canControl ? (
          <button
            onClick={() => {
              sfx.click();
              onClueDone();
            }}
            className="fd-btn fd-btn-primary"
          >
            ✅ Dei a minha pista →
          </button>
        ) : (
          <p className="text-xs text-white/40">à espera de {cur?.name}…</p>
        )}
      </CardShell>
    );
  }

  // --- Votação: quem é o Vasco? (todos votam; o host não arbitra) ---
  if (sub === 'voting') {
    const voted = round.voterIds?.includes(youId);
    const others = room.players.filter((p) => p.connected && !p.eliminated && p.id !== youId);
    return (
      <CardShell typeKey="vasco">
        <p className="text-lg font-bold text-orange-300">🗳️ Quem é o Vasco?</p>
        <p className="text-sm text-white/60">
          Tema: <b className="text-teal-300">{theme}</b> — votem no infiltrado que não sabia a palavra.
        </p>
        {youElim ? (
          <p className="text-sm text-white/50">Estás fora — só a ver 🍿 ({round.voterIds.length}/{activeCount})</p>
        ) : voted ? (
          <p className="text-sm text-emerald-300 font-semibold">
            Votaste! À espera dos outros… {round.voterIds.length}/{activeCount}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2 justify-center">
            {others.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  sfx.click();
                  onVote(p.id);
                }}
                className="fd-chip"
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
        {canControl && (
          <button onClick={onReveal} className="fd-btn fd-btn-ghost py-2 text-sm">
            Fechar votação
          </button>
        )}
      </CardShell>
    );
  }

  // --- Redenção: o Vasco apanhado tenta adivinhar a palavra ---
  if (sub === 'redemption') {
    const accused = round.accused;
    const iAmAccused = accused?.id === youId;
    const words = round.boardWords || [];
    return (
      <CardShell typeKey="vasco">
        <p className="text-lg font-bold text-orange-300">🎯 Apanhado!</p>
        <p className="text-base">
          <b>{accused?.name}</b> é o Vasco! Última hipótese para se safar: adivinhar a palavra do grupo.
        </p>
        <p className="text-sm">
          Tema: <b className="text-teal-300">{theme}</b>
        </p>
        {iAmAccused ? (
          <div className="grid grid-cols-3 gap-1.5">
            {words.map((w) => (
              <button
                key={w}
                onClick={() => {
                  sfx.click();
                  onRedeem(w);
                }}
                className="rounded-lg px-2 py-2 text-center text-sm bg-white/5 hover:bg-white/15 active:scale-95 transition"
              >
                {w}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-white/50">{accused?.name} está a tentar adivinhar… 👀</p>
        )}
      </CardShell>
    );
  }

  // --- Resultado ---
  const r = round.result;
  const caughtRight = r?.accusedId && r.impostors?.some((i) => i.id === r.accusedId);
  return (
    <CardShell typeKey="vasco">
      <p className="text-sm text-white/60">A palavra era:</p>
      <p className="text-3xl font-extrabold text-teal-300">{r?.secretWord}</p>
      {r?.accusedName ? (
        <p className="text-sm text-white/70">
          O grupo acusou <b>{r.accusedName}</b> {caughtRight ? '— e acertou! 🎯' : '— mas falhou 🙈'}
        </p>
      ) : (
        <p className="text-sm text-white/70">O grupo não chegou a acordo (empate).</p>
      )}
      {r?.redemption && (
        <p className="text-sm text-white/70">
          Redenção: {r.redemption.by.name} disse “{r.redemption.word}” —{' '}
          {r.redemption.correct ? 'acertou e safou-se! 😎' : 'falhou 😖'}
        </p>
      )}
      <ul className="flex flex-col gap-1 text-sm mt-1">
        {r?.impostors?.map((imp) => (
          <li key={imp.id} className={imp.outcome === 'vida' ? 'text-emerald-300 font-semibold' : 'text-amber-300'}>
            🕵️ <b>{imp.name}</b> —{' '}
            {imp.outcome === 'vida'
              ? imp.caught
                ? 'safou-se! +1 vida 💚'
                : 'escapou! +1 vida 💚'
              : `apanhado, bebe ${r.golos} golos 🍺`}
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
