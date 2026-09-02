import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { sfx } from '../sfx.js';
import { MOLA } from '../motion.js';
import { loadProfile, saveProfile } from '../device.js';

// Traduz o erro do servidor num painel amigável (emoji + dica de o que fazer).
function friendlyError(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('cheia'))
    return { emoji: '🚪', title: 'A sala está cheia', hint: 'Podem abrir o jogo num ecrã grande (modo TV) e acompanhar daí.' };
  if (m.includes('terminou'))
    return { emoji: '🏁', title: 'O jogo terminou', hint: 'Peçam ao anfitrião para voltar ao lobby — depois entras com o mesmo código.' };
  if (m.includes('sessão inválida'))
    return { emoji: '🔑', title: 'Sessão expirada', hint: 'Entra outra vez com o código da sala e o teu nome.' };
  if (m.includes('nome'))
    return { emoji: '🙋', title: 'Esse nome já está ocupado', hint: 'Escolhe outro nome para esta sala.' };
  if (m.includes('não encontrada') || m.includes('não existe'))
    return { emoji: '🔍', title: 'Sala não encontrada', hint: 'Confirma o código (4 letras/números, sem espaços).' };
  return { emoji: '⚠️', title: msg, hint: null };
}

export default function Home({ error, onCreate, onJoin }) {
  const [mode, setMode] = useState(null); // null | 'create' | 'join'
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  // Perfil local (device.js): nome, emoji/cor e últimas salas deste telemóvel.
  // Não é login nem conta — é só não obrigar a escrever tudo outra vez.
  const [profile] = useState(loadProfile);

  useEffect(() => {
    if (profile?.name) setName(profile.name);
    const params = new URLSearchParams(window.location.search);
    const j = params.get('join');
    if (j) {
      setMode('join');
      setCode(j.toUpperCase().slice(0, 4));
    }
  }, [profile]);

  function submit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    sfx.click();
    saveProfile({ ...(loadProfile() || {}), name: trimmed });
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
      <motion.header
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={MOLA.salto}
        className="text-center"
      >
        <div className="text-7xl mb-1">🍻</div>
        <h1 className="fd-title fd-neon text-6xl font-extrabold tracking-tight">
          F<span className="text-pink-500">&amp;</span>D
        </h1>
        <p className="mt-2 text-sm text-white/60 font-medium">Friends &amp; Drinking</p>
      </motion.header>

      {!mode && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col gap-3"
        >
          <button
            onClick={() => {
              sfx.click();
              setMode('create');
            }}
            className="fd-btn fd-btn-primary text-lg py-4"
          >
            🎉 Criar Jogo
          </button>
          <button
            onClick={() => {
              sfx.click();
              setMode('join');
            }}
            className="fd-btn fd-btn-ghost text-lg py-4"
          >
            🚪 Juntar a Jogo
          </button>

          {/* Voltar a jogar com o mesmo grupo: um toque em vez de código + nome. */}
          {!!profile?.recentRooms?.length && profile?.name && (
            <div className="flex flex-col gap-2 mt-1">
              <p className="text-xs text-white/30 text-center">Voltar a uma sala recente</p>
              <div className="flex gap-2 justify-center flex-wrap">
                {profile.recentRooms.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      sfx.click();
                      onJoin(c, profile.name);
                    }}
                    className="fd-chip tracking-[0.2em] font-bold"
                  >
                    {profile.emoji || '🚪'} {c}
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {mode && (
        <motion.form
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={submit}
          className="flex flex-col gap-3"
        >
          {mode === 'join' && (
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="CÓDIGO"
              maxLength={4}
              className="fd-input text-center text-3xl tracking-[0.4em] font-bold uppercase"
            />
          )}
          <input
            autoFocus={mode === 'create'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="O teu nome"
            maxLength={20}
            className="fd-input"
          />
          <button type="submit" className="fd-btn fd-btn-primary text-lg">
            {mode === 'create' ? 'Criar sala' : 'Entrar'}
          </button>
          <button
            type="button"
            onClick={() => {
              sfx.click();
              setMode(null);
            }}
            className="text-sm text-white/50 py-2"
          >
            ← Voltar
          </button>
        </motion.form>
      )}

      {error && (() => {
        const fe = friendlyError(error);
        return (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center bg-red-500/10 border border-red-500/20 rounded-xl py-3 px-4"
          >
            <div className="text-2xl mb-1">{fe.emoji}</div>
            <p className="text-sm font-semibold text-red-200">{fe.title}</p>
            {fe.hint && <p className="mt-1 text-xs text-red-200/70">{fe.hint}</p>}
          </motion.div>
        );
      })()}

      <p className="text-center text-xs text-white/30 mt-2">
        Joguem com moderação, tenham água por perto. 💧
      </p>
    </motion.div>
  );
}
