import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

export default function Home({ error, onCreate, onJoin }) {
  const [mode, setMode] = useState(null); // null | 'create' | 'join'
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  // Entrada por link/QR: ?join=CÓDIGO → abre já o modo "juntar" pré-preenchido.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const j = params.get('join');
    if (j) {
      setMode('join');
      setCode(j.toUpperCase().slice(0, 4));
    }
  }, []);

  function submit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (mode === 'create') onCreate(trimmed);
    else onJoin(code.trim().toUpperCase(), trimmed);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="flex-1 flex flex-col justify-center gap-8"
    >
      <header className="text-center">
        <h1 className="text-5xl font-black tracking-tight">
          F<span className="text-pink-500">&amp;</span>D
        </h1>
        <p className="mt-2 text-sm text-white/60">Friends and Drinking</p>
      </header>

      {!mode && (
        <div className="flex flex-col gap-3">
          <Big onClick={() => setMode('create')} className="bg-pink-600">
            Criar Jogo
          </Big>
          <Big onClick={() => setMode('join')} className="bg-white/10">
            Juntar a Jogo
          </Big>
        </div>
      )}

      {mode && (
        <form onSubmit={submit} className="flex flex-col gap-3">
          {mode === 'join' && (
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="CÓDIGO"
              maxLength={4}
              className="text-center text-2xl tracking-[0.4em] font-bold uppercase rounded-xl bg-white/10 px-4 py-3 outline-none focus:ring-2 ring-pink-500"
            />
          )}
          <input
            autoFocus={mode === 'create'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="O teu nome"
            maxLength={20}
            className="rounded-xl bg-white/10 px-4 py-3 outline-none focus:ring-2 ring-pink-500"
          />
          <Big type="submit" className="bg-pink-600">
            {mode === 'create' ? 'Criar sala' : 'Entrar'}
          </Big>
          <button
            type="button"
            onClick={() => setMode(null)}
            className="text-sm text-white/50 py-2"
          >
            ← Voltar
          </button>
        </form>
      )}

      {error && (
        <p className="text-center text-sm text-red-400 bg-red-500/10 rounded-lg py-2 px-3">
          {error}
        </p>
      )}

      <p className="text-center text-xs text-white/30 mt-4">
        Joguem com moderação, tenham água por perto. 💧
      </p>
    </motion.div>
  );
}

function Big({ className = '', ...props }) {
  return (
    <button
      {...props}
      className={`rounded-xl py-4 text-lg font-semibold active:scale-95 transition ${className}`}
    />
  );
}
