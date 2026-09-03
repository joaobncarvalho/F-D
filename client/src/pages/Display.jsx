// F&D — Modo TV / espectador.
//
// Um portátil ligado à televisão abre `/?tv=CODIGO` e passa a mostrar a sala em
// grande: quem está a jogar, o que saiu na roda, o resultado da ronda e o feed.
// Os telemóveis deixam de ser "o jogo" e passam a ser o COMANDO — que é o que
// transforma isto de app de telemóvel em jogo de sala.
//
// É só-leitura: liga-se por `watch_room` (não cria jogador) e nunca emite ações.
// O `room_state` que recebe é o mesmo dos jogadores, já anonimizado — nenhum
// segredo, mão ou papel privado passa por aqui.

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { socket } from '../socket.js';
import QRCode from '../components/QRCode.jsx';
import Wheel from '../components/Wheel.jsx';
import { TYPES, typeMeta } from './games/shared.jsx';

export default function Display({ code }) {
  const [room, setRoom] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    function onState({ room }) {
      setRoom(room);
      setErro(null);
    }
    function onErro({ message }) {
      setErro(message);
    }
    socket.on('room_state', onState);
    socket.on('error_msg', onErro);
    socket.connect();
    const pedir = () => socket.emit('watch_room', { code });
    socket.on('connect', pedir);
    if (socket.connected) pedir();
    return () => {
      socket.off('room_state', onState);
      socket.off('error_msg', onErro);
      socket.off('connect', pedir);
    };
  }, [code]);

  if (erro) {
    return (
      <div className="fd-tv min-h-screen grid place-items-center text-center">
        <div>
          <p className="fd-tv-title fd-title font-extrabold">🙈</p>
          <p className="fd-tv-big text-white/70 mt-4">{erro}</p>
          <p className="fd-tv-mid text-white/40 mt-2">Confirma o código na barra de endereço.</p>
        </div>
      </div>
    );
  }
  if (!room) {
    return (
      <div className="fd-tv min-h-screen grid place-items-center">
        <p className="fd-tv-big text-white/50">A ligar à sala {code}…</p>
      </div>
    );
  }

  const joinUrl = `${window.location.origin}/?join=${room.code}`;
  const g = room.game;
  const b = room.board;
  const t = room.tournament;

  return (
    <div className="fd-tv min-h-screen flex flex-col gap-[2vh]">
      <header className="flex items-center justify-between gap-6">
        <div>
          <p className="fd-tv-mid text-white/40">Entra em {window.location.host} com o código</p>
          <p className="fd-title fd-neon fd-tv-title font-extrabold tracking-[0.15em] text-pink-300">{room.code}</p>
        </div>
        {room.paused && (
          <motion.p
            animate={{ opacity: [1, 0.4, 1] }}
            transition={{ duration: 1.4, repeat: Infinity }}
            className="fd-tv-big font-extrabold text-amber-300"
          >
            ⏸️ EM PAUSA
          </motion.p>
        )}
        <div className="bg-white p-3 rounded-2xl">
          <QRCode value={joinUrl} size={140} />
        </div>
      </header>

      {/* Jogadores — a informação que a mesa consulta mais vezes. */}
      <section className="flex flex-wrap gap-[1.2vw]">
        {room.players.map((p) => {
          const emJogo =
            g?.currentPlayerId === p.id || b?.currentPlayerId === p.id ||
            t?.duel?.aId === p.id || t?.duel?.bId === p.id;
          return (
            <motion.div
              key={p.id}
              layout
              className="fd-card px-[1.4vw] py-[1.2vh] flex items-center gap-3"
              style={{
                outline: emJogo ? `4px solid ${p.color || '#ff3d8b'}` : 'none',
                opacity: p.connected && !p.eliminated ? 1 : 0.4,
              }}
            >
              <span style={{ fontSize: 'clamp(1.6rem,3vw,3rem)' }}>{p.emoji || '🙂'}</span>
              <div>
                <p className="fd-tv-mid font-extrabold leading-tight">{p.name}</p>
                <p className="fd-tv-mid text-white/60 leading-tight">
                  {b ? `🍺 ${b.players?.[p.id]?.golos ?? 0} · casa ${b.players?.[p.id]?.pos ?? 0}` : p.lives > 0 ? '❤️'.repeat(p.lives) : '💀'}
                </p>
              </div>
            </motion.div>
          );
        })}
      </section>

      <main className="flex-1 grid place-items-center text-center">
        <AnimatePresence mode="wait">
          {room.status === 'lobby' && (
            <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <p className="fd-tv-title fd-title font-extrabold">A juntar gente… 🍻</p>
              <p className="fd-tv-big text-white/50 mt-3">{room.players.length} na sala</p>
            </motion.div>
          )}

          {g && <PainelRoda key={`g-${g.phase}-${g.round?.id}`} room={room} g={g} />}
          {b && <PainelTabuleiro key="b" b={b} room={room} />}
          {t && <PainelTorneio key="t" t={t} />}
        </AnimatePresence>
      </main>

      {!!room.feed?.length && (
        <footer className="fd-card px-[1.5vw] py-[1vh]">
          <p className="fd-tv-mid text-white/70">
            {room.feed[room.feed.length - 1].emoji} {room.feed[room.feed.length - 1].text}
          </p>
        </footer>
      )}
    </div>
  );
}

function PainelRoda({ room, g }) {
  const r = g.round;
  const meta = r ? typeMeta(r.gameTypeKey) : null;
  const atual = room.players.find((p) => p.id === g.currentPlayerId);

  if (g.phase === 'prep') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <p className="fd-tv-title fd-title font-extrabold">Preparação 🎭</p>
        <p className="fd-tv-big text-white/60 mt-3">
          {g.questionCount} perguntas · {g.secretCount} segredos escritos
        </p>
      </motion.div>
    );
  }

  if (g.phase === 'gameover') {
    const s = g.finalStats;
    return (
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <p className="fd-tv-title fd-title fd-neon font-extrabold">Fim de jogo! 🏁</p>
        <div className="flex gap-[2vw] justify-center mt-[3vh]">
          {s?.survivor && <Premio emoji="🏆" label="Último de pé" nome={s.survivor.name} />}
          {s?.mostDrinks && <Premio emoji="🍺" label="Bebeu mais" nome={s.mostDrinks.name} />}
          {s?.mostRefusals && <Premio emoji="🙅" label="Recusou mais" nome={s.mostRefusals.name} />}
        </div>
      </motion.div>
    );
  }

  if (g.phase === 'wheel' || !r) {
    return (
      <motion.div key="wheel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-[2vh]">
        <Wheel segments={TYPES} targetKey={null} spinning={false} onDone={() => {}} />
        <p className="fd-tv-big font-extrabold">
          Vez de <span style={{ color: atual?.color || '#fff' }}>{atual?.emoji} {atual?.name}</span>
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full max-w-[80vw]">
      <p className="fd-tv-big font-extrabold" style={{ color: meta.color }}>
        {meta.emoji} {meta.label}
      </p>
      {/* Os tipos "hardcore" não guardam o texto em `prompt`: cada um tem o seu
          campo (o tema da Bomba, o desafio do Leilão…). O ecrã grande quer só a
          frase que a mesa está a ler, venha ela de onde vier. */}
      {(() => {
        const texto = r.prompt?.text || r.tema || r.desafio || r.pergunta || r.acusacao || r.pacto;
        if (!texto) return null;
        return <p className="fd-tv-title fd-title font-extrabold mt-[2vh] leading-tight">{texto}</p>;
      })()}
      {r.options && (
        <div className="flex gap-[2vw] justify-center mt-[3vh]">
          {r.options.map((o, i) => (
            <div key={i} className={`fd-card p-[2vh] flex-1 ${r.chosen === i ? 'ring-4 ring-pink-400' : ''}`}>
              <p className="fd-tv-big font-bold">{o}</p>
            </div>
          ))}
        </div>
      )}
      <p className="fd-tv-big text-white/60 mt-[2vh]">
        {atual?.emoji} {r.currentPlayerName}
      </p>
    </motion.div>
  );
}

function PainelTabuleiro({ b, room }) {
  const lider = Object.entries(b.players || {}).sort((a, c) => (c[1].pos || 0) - (a[1].pos || 0))[0];
  const nome = lider ? room.players.find((p) => p.id === lider[0])?.name : null;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
      <p className="fd-tv-big text-white/50">🎲 Tabuleiro — {b.size} casas</p>
      {b.lastEvent?.text && <p className="fd-tv-title fd-title font-extrabold mt-[2vh] leading-tight">{b.lastEvent.text}</p>}
      {nome && <p className="fd-tv-big text-white/60 mt-[2vh]">🥇 Na frente: {nome} (casa {lider[1].pos})</p>}
    </motion.div>
  );
}

function PainelTorneio({ t }) {
  const d = t.duel;
  if (t.phase === 'over') {
    return (
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
        <p className="fd-tv-title fd-title fd-neon font-extrabold">👑 Campeão da noite</p>
        <p className="fd-tv-title font-extrabold mt-[2vh]">{t.champion?.name || '—'}</p>
      </motion.div>
    );
  }
  if (!d) {
    return <p className="fd-tv-title fd-title font-extrabold">🏆 Quadro do torneio</p>;
  }
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
      <p className="fd-tv-title fd-title font-extrabold">
        {d.aName} <span className="text-pink-300">vs</span> {d.bName}
      </p>
      {d.text && <p className="fd-tv-big text-white/70 mt-[2vh] max-w-[70vw] mx-auto">{d.text}</p>}
      {d.result && (
        <p className="fd-tv-big font-extrabold text-emerald-300 mt-[2vh]">
          🏅 {d.result.winnerName} passa ({d.result.how})
        </p>
      )}
    </motion.div>
  );
}

function Premio({ emoji, label, nome }) {
  return (
    <div className="fd-card p-[2vh] min-w-[16vw]">
      <p style={{ fontSize: 'clamp(2rem,5vw,4rem)' }}>{emoji}</p>
      <p className="fd-tv-mid text-white/50">{label}</p>
      <p className="fd-tv-big font-extrabold">{nome}</p>
    </div>
  );
}
