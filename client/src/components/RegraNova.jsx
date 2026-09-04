import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { sfx } from '../sfx.js';
import { haptic } from '../confetti.js';
import { abana } from '../mood.js';
import { MOLA, DUR, movimentoReduzido } from '../motion.js';

/**
 * A REGRA NOVA — a encenação de um modificador que cai a meio da noite.
 *
 * O servidor sorteia (server/src/game/modificadores.js) e manda a carta em
 * `game.ultimoModificador`. Aqui trata-se de a fazer PARAR a mesa.
 *
 * Porque não reutiliza o Evento da Noite (EventoDaNoite.jsx), que já é uma carta
 * de ecrã inteiro: um evento ACONTECE e passa — perdeste uma vida, ganhaste uma
 * vida, acabou. Uma regra nova não acontece, INSTALA-SE: vale a partir de agora
 * e para toda a gente. Se as duas coisas se lessem igual, a mesa aprendia a
 * deixar passar a carta que era preciso ler com atenção.
 *
 * Daí a linguagem ser outra: nada de tempestade nem de confetti, mas um carimbo
 * a bater no ecrã — o gesto de uma regra a ser escrita, não de algo a cair.
 * Fecha-se sozinha, como o evento: ninguém tem de carregar em nada.
 */

const DURACAO_MS = 4200;

export default function RegraNova({ regra, onDone }) {
  const feito = useRef(false);

  useEffect(() => {
    // O relógio de saída primeiro, e sempre — pela mesma razão explicada no
    // EventoDaNoite.jsx: a saída não pode depender do guarda nem do som.
    const t = setTimeout(() => onDone?.(), DURACAO_MS);
    if (!feito.current) {
      feito.current = true;
      try {
        sfx.shot();
        haptic([60, 40, 140]);
        abana('forte');
      } catch {
        /* a regra tem de se ler à mesma; presa no ecrã é que não pode ficar */
      }
    }
    return () => clearTimeout(t);
  }, []);

  const cor = '#f59e0b';
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
          background:
            'radial-gradient(circle at 50% 42%, rgba(245,158,11,0.22) 0%, rgba(4,3,1,0.93) 60%)',
        }}
      />

      {/* Faixas de "documento oficial" a atravessar o ecrã: dá o ar de uma regra
          afixada na parede, e não de uma coisa que caiu do céu. */}
      {!reduzido && <Faixas cor={cor} />}

      <motion.div
        initial={{ opacity: 0, scale: 1.35, rotate: -3 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ ...MOLA.pesada, delay: 0.1 }}
        className="relative text-center max-w-sm rounded-3xl px-6 py-6 backdrop-blur-md"
        style={{
          background: 'rgba(8,6,2,0.85)',
          border: `1px solid ${cor}66`,
          boxShadow: `0 24px 70px -20px ${cor}, 0 0 0 1px rgba(255,255,255,0.04) inset`,
        }}
      >
        <p className="text-xs uppercase tracking-[0.3em] text-amber-300/70">Regra nova</p>

        <motion.div
          initial={{ scale: 0.3, rotate: 10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ ...MOLA.pop, delay: 0.22 }}
          className="leading-none mt-1"
          style={{ fontSize: '4.5rem', filter: `drop-shadow(0 10px 30px ${cor})` }}
        >
          {regra.emoji}
        </motion.div>

        <p
          className="fd-title text-3xl font-extrabold mt-0.5"
          style={{ color: '#fcd34d', textShadow: `0 2px 24px ${cor}88` }}
        >
          {regra.titulo}
        </p>
        <p className="text-base text-white/85 mt-2 leading-snug">{regra.desc}</p>

        {/* Quanto tempo dura. Sem isto, uma regra com prazo lia-se como
            definitiva — e a mesa jogava os próximos vinte minutos com medo de
            uma coisa que já tinha acabado. */}
        <p className="text-sm font-bold mt-3 text-amber-200/90">
          {regra.rondas
            ? `⏳ Durante ${regra.rondas} rondas.`
            : '📌 Vale até ao fim da noite.'}
        </p>

        {(regra.avisos || []).map((a) => (
          <p key={a} className="text-xs text-amber-300/70 mt-2 leading-tight">
            {a}
          </p>
        ))}
      </motion.div>
    </motion.div>
  );
}

/** Duas faixas a varrer o ecrã, como um carimbo a ser aplicado. */
function Faixas({ cor }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {[0, 1].map((i) => (
        <motion.div
          key={i}
          className="absolute left-[-20%] right-[-20%]"
          style={{
            top: `${i === 0 ? 30 : 62}%`,
            height: '2px',
            background: `linear-gradient(to right, transparent, ${cor}, transparent)`,
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: [0, 0.9, 0.25] }}
          transition={{ duration: 0.7, delay: i * 0.12, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}
