// F&D — Tabuleiro: a MALDIÇÃO a disparar.
//
// Uma maldição é a única coisa do tabuleiro que já lá estava à espera: alguém a
// escondeu numa casa há dez minutos e ninguém sabia onde. Quando dispara, o
// momento é de quem a apanhou — e até aqui isso passava-se numa linha de texto
// no `lastEvent`, que a mesa lia depois de já ter passado à frente.
//
// Por isso tem encenação própria, e deliberadamente NÃO se parece com as outras
// duas cartas de ecrã inteiro que o jogo já tem:
//
//   EventoDaNoite  cai do céu sobre a mesa toda   → tempestade / raios de luz
//   RegraNova      instala-se e fica a valer      → carimbo, faixas, documento
//   Maldição       estava enterrada e acordou     → círculo de ritual + fumo a
//                                                   subir do fundo do ecrã
//
// O gesto é o contrário do evento: nada cai: sobe. O selo abre-se debaixo dos
// pés de quem parou na casa, e o emoji sai de dentro do fumo.
//
// Fecha-se sozinha (como as outras) e não recebe toques — o tabuleiro por baixo
// nunca fica trancado por causa da animação.

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { sfx } from '../../sfx.js';
import { haptic } from '../../confetti.js';
import { abana } from '../../mood.js';
import { MOLA, DUR, movimentoReduzido } from '../../motion.js';

const DURACAO_MS = 3600;
const COR = '#a3e635'; // verde-veneno: não colide com o roxo do evento nem com o âmbar da regra

export default function MaldicaoOverlay({ trap, onDone }) {
  const feito = useRef(false);

  useEffect(() => {
    // Relógio de saída primeiro e limpo sempre — mesma razão que no
    // EventoDaNoite.jsx: com o guarda à frente, o duplo-monte do StrictMode
    // deixava a carta presa no ecrã por cima do tabuleiro.
    const t = setTimeout(() => onDone?.(), DURACAO_MS);
    let t2 = null;
    if (!feito.current) {
      feito.current = true;
      try {
        sfx.shot();
        haptic([70, 50, 40, 40, 160]);
        abana('forte');
        t2 = setTimeout(() => abana('leve'), 700); // o eco do selo a abrir
      } catch {
        /* sem som lê-se na mesma; presa no ecrã é que não pode ficar */
      }
    }
    return () => {
      clearTimeout(t);
      if (t2) clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reduzido = movimentoReduzido();
  const dele = trap.self ?? false;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: DUR.rapida }}
      className="fixed inset-0 z-[70] pointer-events-none flex items-center justify-center px-6"
    >
      {/* Fundo: escurece de baixo para cima, como se a casa estivesse a abrir. */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          background:
            'radial-gradient(circle at 50% 78%, rgba(132,204,22,0.22) 0%, rgba(3,6,2,0.95) 58%)',
        }}
      />

      {!reduzido && <Selo />}
      {!reduzido && <Fumo />}

      <motion.div
        initial={{ opacity: 0, y: 34, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ ...MOLA.pesada, delay: 0.22 }}
        className="relative text-center max-w-sm rounded-3xl px-6 py-6 backdrop-blur-md"
        style={{
          background: 'rgba(4,7,3,0.84)',
          border: `1px solid ${COR}55`,
          boxShadow: `0 24px 70px -20px ${COR}, 0 0 0 1px rgba(255,255,255,0.04) inset`,
        }}
      >
        <p className="text-xs uppercase tracking-[0.3em] text-lime-300/70">
          Maldição · casa {trap.square}
        </p>

        {/* O emoji SOBE de dentro do fumo, não cai — é o gesto da casa a abrir. */}
        <motion.div
          initial={{ y: 60, scale: 0.4, opacity: 0, rotate: -14 }}
          animate={{ y: 0, scale: 1, opacity: 1, rotate: 0 }}
          transition={{ ...MOLA.salto, delay: 0.3 }}
          className="leading-none mt-1"
          style={{ fontSize: '4.5rem', filter: `drop-shadow(0 10px 34px ${COR})` }}
        >
          {trap.emoji}
        </motion.div>

        <p
          className="fd-title text-3xl font-extrabold mt-0.5"
          style={{ color: '#d9f99d', textShadow: `0 2px 24px ${COR}88` }}
        >
          {trap.victim}
        </p>
        {trap.text && <p className="text-base text-white/85 mt-1 leading-snug">{trap.text}</p>}

        {/* Quem a deixou. A piada da mecânica está aqui: metade das vezes a
            maldição rebenta na cara de quem a escondeu. */}
        <p className="text-sm mt-3 text-lime-200/80">
          {dele
            ? '💀 …e a maldição era dele/a próprio/a!'
            : trap.owner
              ? `👀 Escondida por ${trap.owner}`
              : '👀 Estava ali à espera.'}
        </p>
      </motion.div>
    </motion.div>
  );
}

/** Círculo de ritual: dois anéis a rodar em sentidos opostos + traços à volta. */
function Selo() {
  const tracos = Array.from({ length: 16 }, (_, i) => i);
  return (
    <motion.div
      className="absolute left-1/2 top-1/2"
      initial={{ opacity: 0, scale: 0.2 }}
      animate={{ opacity: [0, 0.9, 0.35], scale: [0.2, 1.15, 1] }}
      transition={{ duration: 1.1, ease: 'easeOut' }}
      style={{ width: 0, height: 0 }}
    >
      {[
        { d: 260, dur: 14, dir: 360 },
        { d: 180, dur: 9, dir: -360 },
      ].map((anel) => (
        <motion.div
          key={anel.d}
          className="absolute rounded-full"
          animate={{ rotate: anel.dir }}
          transition={{ duration: anel.dur, repeat: Infinity, ease: 'linear' }}
          style={{
            width: anel.d,
            height: anel.d,
            left: -anel.d / 2,
            top: -anel.d / 2,
            border: `1px dashed rgba(163,230,53,0.55)`,
            boxShadow: `0 0 40px rgba(163,230,53,0.25) inset`,
          }}
        />
      ))}
      {tracos.map((i) => (
        <div
          key={i}
          className="absolute"
          style={{
            width: '1px',
            height: '22px',
            left: 0,
            top: 0,
            background: 'linear-gradient(to bottom, transparent, rgba(163,230,53,0.7))',
            transformOrigin: 'top center',
            transform: `rotate(${(i * 360) / tracos.length}deg) translateY(150px)`,
          }}
        />
      ))}
    </motion.div>
  );
}

/** Fumo a subir do fundo — o contrário da chuva do Evento da Noite. */
function Fumo() {
  const baforadas = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    atraso: Math.random() * 1.4,
    duracao: 2.2 + Math.random() * 1.6,
    tamanho: 60 + Math.random() * 110,
  }));
  return (
    <div className="absolute inset-0 overflow-hidden">
      {baforadas.map((b) => (
        <motion.div
          key={b.id}
          className="absolute rounded-full"
          initial={{ y: '10vh', opacity: 0, scale: 0.5 }}
          animate={{ y: '-70vh', opacity: [0, 0.35, 0], scale: 1.6 }}
          transition={{ duration: b.duracao, delay: b.atraso, repeat: Infinity, ease: 'easeOut' }}
          style={{
            left: `${b.x}%`,
            bottom: 0,
            width: b.tamanho,
            height: b.tamanho,
            background: 'radial-gradient(circle, rgba(132,204,22,0.35) 0%, rgba(132,204,22,0) 70%)',
            filter: 'blur(6px)',
          }}
        />
      ))}
    </div>
  );
}
