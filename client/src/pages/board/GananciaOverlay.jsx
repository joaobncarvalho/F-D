// F&D — Tabuleiro: o 🐍 AZAR DA GANÂNCIA.
//
// Andar 3 casas duas vezes seguidas é a única jogada do tabuleiro em que o
// jogador escolhe o próprio castigo: bebe-se mais para andar mais depressa, e a
// certa altura a mesa cobra. O momento tinha aviso ("cuidado: outra de 3 casas
// seguidas e a ganância castiga-te") mas não tinha PAGAMENTO — a fatura chegava
// numa linha cor-de-rosa por baixo da pista.
//
// O gesto é a quarta linguagem das cartas de ecrã inteiro, e é de propósito que
// nenhuma se parece com as outras:
//
//   EventoDaNoite      cai do céu sobre a mesa      → tempestade, tudo desce
//   RegraNova          instala-se e fica a valer    → carimbo, faixas
//   MaldicaoOverlay    estava enterrada e acordou   → fumo a subir
//   GananciaOverlay    **aperta**                   → duas mandíbulas a fechar
//
// O 1% que escapa recebe o MESMO gesto ao contrário: as mandíbulas fecham, não
// apanham nada, e voltam a abrir. É a mesma armadilha — o que muda é o fim.
//
// Fecha-se sozinha e não recebe toques.

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { sfx } from '../../sfx.js';
import { confetti, haptic } from '../../confetti.js';
import { abana } from '../../mood.js';
import { MOLA, DUR, movimentoReduzido } from '../../motion.js';

const DURACAO_MS = 3200;

export default function GananciaOverlay({ greed, onDone }) {
  const feito = useRef(false);
  const escapou = !!greed.escapou;

  useEffect(() => {
    // Relógio de saída primeiro e limpo sempre — ver EventoDaNoite.jsx.
    const t = setTimeout(() => onDone?.(), DURACAO_MS);
    let t2 = null;
    if (!feito.current) {
      feito.current = true;
      try {
        if (escapou) {
          sfx.reveal();
          confetti({ count: 70, power: 12 });
          haptic([25, 40, 25]);
        } else {
          // O abanão vem no INSTANTE em que as mandíbulas se juntam (~0,45 s),
          // não à entrada: é o fecho que tem de se sentir, não a carta a abrir.
          sfx.shot();
          t2 = setTimeout(() => {
            haptic([110, 50, 150]);
            abana('forte');
          }, 450);
        }
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

  const cor = escapou ? '#4ade80' : '#f43f5e';
  const reduzido = movimentoReduzido();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: DUR.rapida }}
      className="fixed inset-0 z-[70] pointer-events-none flex items-center justify-center px-6"
    >
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          background: escapou
            ? 'radial-gradient(circle at 50% 45%, rgba(74,222,128,0.20) 0%, rgba(3,8,5,0.90) 60%)'
            : 'radial-gradient(circle at 50% 45%, rgba(244,63,94,0.22) 0%, rgba(9,2,4,0.94) 58%)',
        }}
      />

      {!reduzido && <Mandibulas escapou={escapou} cor={cor} />}

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ ...MOLA.pesada, delay: 0.45 }} // entra QUANDO a armadilha fecha
        className="relative text-center max-w-sm rounded-3xl px-6 py-6 backdrop-blur-md"
        style={{
          background: escapou ? 'rgba(3,10,6,0.84)' : 'rgba(10,3,5,0.85)',
          border: `1px solid ${cor}55`,
          boxShadow: `0 24px 70px -20px ${cor}, 0 0 0 1px rgba(255,255,255,0.04) inset`,
        }}
      >
        <p className="text-xs uppercase tracking-[0.3em] text-white/45">
          {escapou ? 'Abusou da ganância' : 'Andaste depressa de mais'}
        </p>

        <motion.div
          initial={{ scale: 0.3, rotate: escapou ? 10 : -14 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ ...MOLA.pop, delay: 0.58 }}
          className="leading-none mt-1"
          style={{ fontSize: '4.5rem', filter: `drop-shadow(0 10px 30px ${cor})` }}
        >
          {greed.emoji}
        </motion.div>

        <p
          className="fd-title text-3xl font-extrabold mt-0.5"
          style={{ color: escapou ? '#86efac' : '#fda4af', textShadow: `0 2px 24px ${cor}88` }}
        >
          {greed.titulo}
        </p>
        {greed.victim && <p className="text-base text-white/80 mt-1">{greed.victim}</p>}
        <p className="text-lg font-bold text-white/90 mt-1 leading-snug">{greed.texto}</p>
      </motion.div>
    </motion.div>
  );
}

/**
 * Duas mandíbulas a fechar sobre o centro do ecrã.
 *
 * Castigo: entram, juntam-se e FICAM (a armadilha apanhou).
 * Escape:  entram, juntam-se e voltam a abrir — passou entre os dentes.
 */
function Mandibulas({ escapou, cor }) {
  // Fecham a 50% do ecrã (juntas ao centro); no escape recuam para 66%.
  const x = escapou ? ['-100%', '-52%', '-52%', '-100%'] : ['-100%', '-50%', '-48%', '-50%'];
  const tempos = escapou ? [0, 0.28, 0.42, 0.85] : [0, 0.3, 0.38, 1];

  return (
    <div className="absolute inset-0 overflow-hidden">
      {[-1, 1].map((lado) => (
        <motion.div
          key={lado}
          className="absolute top-0 bottom-0"
          style={{
            [lado === -1 ? 'left' : 'right']: 0,
            width: '100%',
            background:
              lado === -1
                ? `linear-gradient(to right, rgba(2,1,3,0.96) 58%, ${cor}22 92%, ${cor}77 100%)`
                : `linear-gradient(to left, rgba(2,1,3,0.96) 58%, ${cor}22 92%, ${cor}77 100%)`,
          }}
          initial={{ x: lado === -1 ? '-100%' : '100%' }}
          animate={{ x: lado === -1 ? x : x.map((v) => v.replace('-', '')) }}
          transition={{ duration: 1.5, times: tempos, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}
