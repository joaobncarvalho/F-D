// F&D — cartões dos mini-jogos reutilizáveis (Roda). Extraídos do Game.jsx para
// modularização gradual e para o showroom (Demo.jsx) os reutilizar sem drift.
// Comportamento idêntico ao original.

import { sfx } from '../../sfx.js';
import Timer from '../../components/Timer.jsx';
import { CardShell, BuddyBlock } from './shared.jsx';
import VereditoBand from './VereditoBand.jsx';

export function PromptCard({
  round, room, youId, isMyTurn, canControl, podeDobrar, podeAdiar, morteSubita,
  onAction, onChooseBuddy, onVota, onContinue,
}) {
  const isBoca = round.gameTypeKey === 'boca_calada';
  const buddyPending = round.needsBuddy && !round.buddyId;
  // Modificador "Dobro ou Nada": ele aceitou e foi a dobrar — a ronda fica aberta
  // enquanto a mesa julga, com a mesma faixa de veredito dos jogos a tempo.
  const emJulgamento = !!round.dobro;
  return (
    <CardShell typeKey={round.gameTypeKey}>
      <p className="text-lg leading-snug">{round.prompt?.text || '—'}</p>
      <p className="text-sm text-white/50">
        {isBoca ? 'Pergunta para ' : 'Vez de '}
        <span className="font-bold text-white">{round.currentPlayerName}</span>
      </p>
      <BuddyBlock round={round} room={room} youId={youId} isMyTurn={isMyTurn} onChooseBuddy={onChooseBuddy} />
      {/* Boca Calada: timer de pressão só no ecrã de quem tem de responder.
          É social/visual — não força ação (o servidor continua autoridade). */}
      {isBoca && isMyTurn && !buddyPending && (
        <div className="flex flex-col items-center gap-1 mt-1">
          <Timer seconds={20} runKey={round.id} size={80} />
          <p className="text-xs text-white/40">Responde antes que toque… ou bebe! 🍺</p>
        </div>
      )}
      {emJulgamento ? (
        <div className="flex flex-col gap-2 mt-1">
          <VereditoBand veredito={round.veredito} room={room} youId={youId} onVota={onVota} />
          {round.dobro.resultado && canControl && (
            <button onClick={() => { sfx.click(); onContinue(); }} className="fd-btn fd-btn-primary">
              ➡️ Continuar
            </button>
          )}
        </div>
      ) : isMyTurn && !buddyPending ? (
        <div className="flex flex-col gap-2 mt-1">
          <div className="flex gap-3">
            <button
              onClick={() => {
                sfx.click();
                onAction('accept');
              }}
              className="fd-btn fd-btn-success flex-1"
            >
              {isBoca ? '🎤 Respondo' : '✅ Aceito'}
            </button>
            <button
              onClick={() => {
                sfx.click();
                onAction('refuse');
              }}
              className="fd-btn fd-btn-danger flex-1"
            >
              {morteSubita ? '💀 Recuso (saio)' : isBoca ? '🤐 Boca Calada' : '🍺 Recuso'}
            </button>
          </div>
          {/* A Conta: adiar não é escapar. A vida custa o mesmo que recusar — o
              que muda é que o gole fica a dever, com juro, à vista da mesa. */}
          {podeAdiar && (
            <button
              onClick={() => {
                sfx.click();
                onAction('adiar');
              }}
              className="fd-btn fd-btn-ghost text-sm"
              style={{ borderColor: 'rgba(255,176,32,0.4)' }}
            >
              📿 Adiar — não bebes agora, mas ficas a dever (a vida custa o mesmo)
            </button>
          )}
          {/* Dobro ou Nada: o preço está escrito no botão — ninguém deve dobrar
              sem saber que a vida que pode ganhar é a mesma que pode perder. */}
          {podeDobrar && (
            <button
              onClick={() => {
                sfx.click();
                onAction('double');
              }}
              className="fd-btn fd-btn-ghost text-sm"
              style={{ borderColor: 'rgba(255,176,32,0.5)' }}
            >
              🔁 Dobro ou nada — a mesa julga: +1 vida se conseguires, −1 se falhares
            </button>
          )}
        </div>
      ) : !isMyTurn ? (
        <p className="text-sm text-white/40 mt-1">A aguardar {round.currentPlayerName}…</p>
      ) : null}
    </CardShell>
  );
}

export function ChoiceCard({ round, room, youId, canControl, onChooseBuddy, onChooseOption, onContinue }) {
  const isMyTurn = round.currentPlayerId === youId;
  const buddyPending = round.needsBuddy && !round.buddyId;
  const resolved = round.status === 'resolved' && round.chosen != null;
  const opts = round.options || [];
  return (
    <CardShell typeKey="isto_ou_aquilo">
      <p className="text-sm text-white/50">
        Vez de <span className="font-bold text-white">{round.currentPlayerName}</span> — Isto ou Aquilo?
      </p>
      <BuddyBlock round={round} room={room} youId={youId} isMyTurn={isMyTurn} onChooseBuddy={onChooseBuddy} />
      <div className="flex flex-col gap-2 mt-1">
        {opts.map((o, i) => {
          const arrow = i === 0 ? '👈 ' : '👉 ';
          if (isMyTurn && !resolved && !buddyPending) {
            return (
              <button
                key={i}
                onClick={() => {
                  sfx.click();
                  onChooseOption(i);
                }}
                className="fd-btn fd-btn-ghost text-left py-3"
              >
                {arrow}
                {o}
              </button>
            );
          }
          const chosen = resolved && round.chosen === i;
          const dim = resolved && round.chosen !== i;
          return (
            <div
              key={i}
              className={`fd-card p-3 text-left text-sm ${
                chosen ? 'ring-2 ring-emerald-400 text-emerald-200 font-semibold' : dim ? 'opacity-40' : ''
              }`}
            >
              {arrow}
              {o}
              {chosen ? ' ✓' : ''}
            </div>
          );
        })}
      </div>
      {resolved ? (
        <>
          <p className="text-sm font-bold text-emerald-300">{round.currentPlayerName} escolheu! 🎉</p>
          {canControl && (
            <button onClick={onContinue} className="fd-btn fd-btn-primary mt-1">
              Continuar →
            </button>
          )}
        </>
      ) : !isMyTurn && !buddyPending ? (
        <p className="text-sm text-white/40">A aguardar a escolha de {round.currentPlayerName}…</p>
      ) : null}
    </CardShell>
  );
}

const RPS = [
  ['pedra', '✊'],
  ['papel', '✋'],
  ['tesoura', '✌️'],
];

export function IntrigasCard({
  round,
  room,
  youId,
  reason,
  isAccuser,
  isAccused,
  canControl,
  onChooseTarget,
  onSubmitRps,
  onContinue,
}) {
  const connected = room.players.filter((p) => p.connected);
  const iSubmitted = round.rpsSubmitted?.includes(youId);
  const inDuel = isAccuser || isAccused;

  // Passo 1 — o acusador escolhe quem
  if (round.substate === 'choosing') {
    if (isAccuser) {
      return (
        <CardShell typeKey="intrigas">
          <p className="text-lg leading-snug">{reason || '…'}</p>
          <p className="text-xs text-white/50">
            Quem é mais provável? A pessoa não vai saber porquê 😏
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {connected
              .filter((p) => p.id !== youId)
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    sfx.click();
                    onChooseTarget(p.id);
                  }}
                  className="fd-chip"
                >
                  {p.name}
                </button>
              ))}
          </div>
        </CardShell>
      );
    }
    return (
      <CardShell typeKey="intrigas">
        <p className="text-base text-white/70">
          🤫 <b>{round.currentPlayerName}</b> recebeu uma pergunta secreta e está a escolher
          alguém…
        </p>
      </CardShell>
    );
  }

  // Passo 2 — pedra-papel-tesoura
  if (round.substate === 'rps') {
    return (
      <CardShell typeKey="intrigas">
        {round.ties > 0 && (
          <p className="text-xs text-amber-300 font-semibold">Empate! Joguem outra vez ({round.ties}) ✊✋✌️</p>
        )}
        {isAccused ? (
          <p className="text-base">
            Foste escolhido/a por <b>{round.currentPlayerName}</b>! Ganha o pedra-papel-tesoura para
            saberes porquê 👀
          </p>
        ) : (
          <>
            {reason && <p className="text-lg leading-snug">{reason}</p>}
            <p className="text-sm text-white/60">
              {round.currentPlayerName} escolheu <b>{round.accusedName}</b>
            </p>
          </>
        )}

        {inDuel ? (
          iSubmitted ? (
            <p className="text-sm text-emerald-300 font-semibold">Jogaste! À espera do outro…</p>
          ) : (
            <div className="flex gap-3 justify-center">
              {RPS.map(([m, e]) => (
                <button
                  key={m}
                  onClick={() => {
                    sfx.click();
                    onSubmitRps(m);
                  }}
                  className="fd-chip text-3xl px-4 py-3"
                >
                  {e}
                </button>
              ))}
            </div>
          )
        ) : (
          <p className="text-xs text-white/50">
            Duelo em curso… {round.rpsSubmitted?.length || 0}/2 jogaram
          </p>
        )}
      </CardShell>
    );
  }

  // Passo 3 — reveal
  const r = round.result;
  return (
    <CardShell typeKey="intrigas">
      {reason ? (
        <p className="text-lg leading-snug">{reason}</p>
      ) : (
        <p className="text-base text-white/50">Pergunta secreta 🤐</p>
      )}
      {r?.accusedWon ? (
        <p className="text-base font-bold text-emerald-300">
          🎉 {round.accusedName} ganhou e fica a saber!
        </p>
      ) : (
        <p className="text-base font-bold text-amber-300">
          😈 {round.accusedName} perde, bebe e nunca vai saber porquê!
        </p>
      )}
      {isAccused && r && !r.accusedLearns && (
        <p className="text-sm text-white/50">Bebe um copo… e boa sorte a descobrir 😏🍺</p>
      )}
      {canControl && (
        <button onClick={onContinue} className="fd-btn fd-btn-primary mt-1">
          Continuar →
        </button>
      )}
    </CardShell>
  );
}
