import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import QRCode from '../components/QRCode.jsx';
import { sfx } from '../sfx.js';

export default function Lobby({ room, youId, messages, error, onSendMessage, onStart, onLeave }) {
  const [draft, setDraft] = useState('');
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lives, setLives] = useState(3);
  const [intensity, setIntensity] = useState('leve');
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
            <div className="flex flex-col gap-2">
              <span className="text-sm text-white/60">Intensidade</span>
              <div className="flex gap-1 flex-wrap">
                {[
                  { key: 'leve', label: '🍃 Leve' },
                  { key: 'picante', label: '🌶️ Picante +18' },
                  { key: 'hardcore', label: '🔥 Hardcore' },
                ].map((it) => (
                  <button
                    key={it.key}
                    onClick={() => {
                      sfx.click();
                      setIntensity(it.key);
                    }}
                    className={`fd-chip ${intensity === it.key ? 'fd-chip-on' : ''}`}
                  >
                    {it.label}
                  </button>
                ))}
              </div>
              {intensity === 'hardcore' && (
                <p className="text-xs text-rose-300/80">🔥 Mesmo embaraçoso e sem filtros — só para grupos à vontade.</p>
              )}
            </div>
          </div>
          <button
            onClick={() => {
              sfx.click();
              onStart({ lives, intensity });
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
