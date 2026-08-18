import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import QRCode from '../components/QRCode.jsx';
import { sfx } from '../sfx.js';

const INTENSITY_OPTS = [
  { key: 'leve', label: '🍃 Leve' },
  { key: 'picante', label: '🌶️ Picante +18' },
  { key: 'hardcore', label: '🔥 Hardcore' },
  { key: 'caos', label: '💥 Caos' },
];

export default function Lobby({ room, youId, messages, error, onSendMessage, onStart, onVoteIntensity, onSetMode, onLeave }) {
  const [draft, setDraft] = useState('');
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lives, setLives] = useState(3);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!room) return null;

  const you = room.players.find((p) => p.id === youId);
  const isHost = you?.isHost;
  const canStart = room.players.filter((p) => p.connected).length >= 2;
  const joinUrl = `${window.location.origin}/?join=${room.code}`;

  function send(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSendMessage(text);
    setDraft('');
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      sfx.click();
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indisponível */
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="flex-1 flex flex-col gap-4"
    >
      <header className="flex items-center justify-between">
        <button onClick={onLeave} className="text-sm text-white/50">
          ← Sair
        </button>
        <button onClick={copyCode} className="text-center active:scale-95 transition">
          <p className="text-xs text-white/40">{copied ? 'Copiado! ✓' : 'toca p/ copiar'}</p>
          <p className="fd-title fd-neon text-3xl font-extrabold tracking-[0.25em] text-pink-300">
            {room.code}
          </p>
        </button>
        <button
          onClick={() => {
            sfx.click();
            setShowQR((v) => !v);
          }}
          className="fd-card w-10 h-10 grid place-items-center text-lg"
        >
          {showQR ? '✕' : '📷'}
        </button>
      </header>

      <AnimatePresence>
        {showQR && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-col items-center gap-2 overflow-hidden"
          >
            <QRCode value={joinUrl} size={160} />
            <p className="text-xs text-white/40">Aponta a câmara para juntar</p>
          </motion.div>
        )}
      </AnimatePresence>

      <section>
        <h2 className="text-sm font-semibold text-white/60 mb-2">
          Jogadores ({room.players.length})
        </h2>
        <ul className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {room.players.map((p) => (
              <motion.li
                key={p.id}
                layout
                initial={{ opacity: 0, scale: 0.9, x: -20 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`fd-card flex items-center justify-between px-4 py-3 ${
                  p.connected ? '' : 'opacity-50'
                }`}
              >
                <span className="font-semibold">
                  {p.isHost && '👑 '}
                  {p.name}
                  {p.id === youId && <span className="text-white/40"> (tu)</span>}
                  {!p.connected && <span className="text-amber-400/70 text-xs"> · offline</span>}
                </span>
                <span className="text-sm">{'❤️'.repeat(p.lives)}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </section>

      <section className="flex-1 flex flex-col min-h-36">
        <h2 className="text-sm font-semibold text-white/60 mb-2">Chat</h2>
        <div className="fd-card flex-1 overflow-y-auto p-3 flex flex-col gap-1">
          {messages.length === 0 && <p className="text-sm text-white/30">Ainda não há mensagens.</p>}
          {messages.map((m, i) => (
            <p key={i} className="text-sm">
              <span className="font-bold text-pink-300">{m.name}:</span>{' '}
              <span className="text-white/80">{m.text}</span>
            </p>
          ))}
          <div ref={chatEndRef} />
        </div>
        <form onSubmit={send} className="flex gap-2 mt-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Escreve algo…"
            maxLength={300}
            className="fd-input flex-1"
          />
          <button type="submit" className="fd-btn fd-btn-ghost px-4">
            ➤
          </button>
        </form>
      </section>

      {/* Modo de jogo — só o host escolhe; todos veem. */}
      <div className="fd-card p-3 flex flex-col gap-2">
        <span className="text-sm text-white/60">🎮 Modo de jogo</span>
        <div className="flex gap-2">
          {[
            { key: 'wheel', label: '🎡 Roda' },
            { key: 'board', label: '🎲 Tabuleiro' },
          ].map((m) => (
            <button
              key={m.key}
              disabled={!isHost}
              onClick={() => {
                sfx.click();
                onSetMode(m.key);
              }}
              className={`fd-chip flex-1 ${(room.mode || 'wheel') === m.key ? 'fd-chip-on' : ''} ${
                !isHost ? 'opacity-60' : ''
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {room.mode === 'board' && (
          <p className="text-xs text-emerald-300/80">
            🎲 Tabuleiro: corrida de bebida (dás a volta = ganhas). Sem vidas. <b>beta</b>
          </p>
        )}
        {!isHost && <p className="text-xs text-white/40">Só o host escolhe o modo.</p>}
      </div>

      {/* Votação da intensidade — TODOS votam (maioria; empate → randomizer). */}
      {(() => {
        const votes = room.intensityVotes || {};
        const myVote = votes[youId];
        const counts = { leve: 0, picante: 0, hardcore: 0, caos: 0 };
        for (const v of Object.values(votes)) if (counts[v] !== undefined) counts[v] += 1;
        return (
          <div className="fd-card p-3 flex flex-col gap-2">
            <span className="text-sm text-white/60">
              🗳️ Votem a intensidade{' '}
              <span className="text-white/40">— maioria ganha; empate → à sorte</span>
            </span>
            <div className="grid grid-cols-2 gap-2">
              {INTENSITY_OPTS.map((it) => (
                <button
                  key={it.key}
                  onClick={() => {
                    sfx.click();
                    onVoteIntensity(it.key);
                  }}
                  className={`fd-chip flex items-center justify-between ${myVote === it.key ? 'fd-chip-on' : ''}`}
                >
                  <span>{it.label}</span>
                  {counts[it.key] > 0 && <span className="text-xs opacity-70 ml-1">{counts[it.key]}</span>}
                </button>
              ))}
            </div>
            {myVote === 'caos' && (
              <p className="text-xs text-fuchsia-300/80">💥 Modo expose: constrangimento e drama à mesa. 😈</p>
            )}
          </div>
        );
      })()}

      {isHost ? (
        <div className="flex flex-col gap-3">
          <div className="fd-card p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">Vidas por jogador</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      sfx.click();
                      setLives(n);
                    }}
                    className={`fd-chip w-9 h-9 grid place-items-center ${lives === n ? 'fd-chip-on' : ''}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              sfx.click();
              onStart({ lives });
            }}
            disabled={!canStart}
            className="fd-btn fd-btn-primary text-lg"
          >
            {canStart ? '🎉 Começar' : 'Precisas de ≥2 jogadores'}
          </button>
        </div>
      ) : (
        <p className="text-center text-sm text-white/40 py-4">
          À espera que o host comece o jogo…
        </p>
      )}

      {error && <p className="text-center text-sm text-red-300">{error}</p>}
    </motion.div>
  );
}
