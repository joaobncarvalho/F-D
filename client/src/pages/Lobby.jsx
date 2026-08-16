import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import QRCode from '../components/QRCode.jsx';

export default function Lobby({
  room,
  youId,
  messages,
  error,
  onSendMessage,
  onStart,
  onLeave,
}) {
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
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indisponível — ignora */
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
          <p className="text-xs text-white/40">
            {copied ? 'Copiado!' : 'Código (toca p/ copiar)'}
          </p>
          <p className="text-2xl font-black tracking-[0.3em]">{room.code}</p>
        </button>
        <button
          onClick={() => setShowQR((v) => !v)}
          className="text-xl w-10"
          title="Mostrar QR code"
        >
          {showQR ? '✕' : '⬛'}
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
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`flex items-center justify-between rounded-xl px-4 py-3 ${
                  p.connected ? 'bg-white/10' : 'bg-white/5 opacity-50'
                }`}
              >
                <span className="font-medium">
                  {p.name}
                  {p.id === youId && <span className="text-white/40"> (tu)</span>}
                  {!p.connected && (
                    <span className="text-amber-400/70 text-xs"> · offline</span>
                  )}
                </span>
                <span className="flex items-center gap-2 text-sm">
                  {p.isHost && <span title="Host">👑</span>}
                  <span>{'❤️'.repeat(p.lives)}</span>
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </section>

      <section className="flex-1 flex flex-col min-h-40">
        <h2 className="text-sm font-semibold text-white/60 mb-2">Chat</h2>
        <div className="flex-1 overflow-y-auto rounded-xl bg-white/5 p-3 flex flex-col gap-1">
          {messages.length === 0 && (
            <p className="text-sm text-white/30">Ainda não há mensagens.</p>
          )}
          {messages.map((m, i) => (
            <p key={i} className="text-sm">
              <span className="font-semibold text-pink-400">{m.name}:</span>{' '}
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
            className="flex-1 rounded-xl bg-white/10 px-4 py-2 outline-none focus:ring-2 ring-pink-500"
          />
          <button
            type="submit"
            className="rounded-xl bg-white/10 px-4 font-semibold active:scale-95 transition"
          >
            ➤
          </button>
        </form>
      </section>

      {isHost ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl bg-white/5 p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">Vidas por jogador</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setLives(n)}
                    className={`w-8 h-8 rounded-lg text-sm font-bold transition ${
                      lives === n ? 'bg-pink-600' : 'bg-white/10'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">Intensidade</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setIntensity('leve')}
                  className={`px-3 h-8 rounded-lg text-sm font-medium transition ${
                    intensity === 'leve' ? 'bg-emerald-600' : 'bg-white/10'
                  }`}
                >
                  🍃 Leve
                </button>
                <button
                  onClick={() => setIntensity('picante')}
                  className={`px-3 h-8 rounded-lg text-sm font-medium transition ${
                    intensity === 'picante' ? 'bg-rose-600' : 'bg-white/10'
                  }`}
                >
                  🌶️ Picante
                </button>
              </div>
            </div>
          </div>
          <button
            onClick={() => onStart({ lives, intensity })}
            disabled={!canStart}
            className="rounded-xl bg-pink-600 py-4 text-lg font-semibold active:scale-95 transition disabled:opacity-40 disabled:active:scale-100"
          >
            {canStart ? 'Começar' : 'Precisas de ≥2 jogadores'}
          </button>
        </div>
      ) : (
        <p className="text-center text-sm text-white/40 py-4">
          À espera que o host comece o jogo…
        </p>
      )}

      {error && <p className="text-center text-sm text-red-400">{error}</p>}
    </motion.div>
  );
}
