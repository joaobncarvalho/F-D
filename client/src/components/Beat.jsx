import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { MOLA, movimentoReduzido } from '../motion.js';
import { abana, grau } from '../mood.js';

/**
 * Batidas — os momentos em que o jogo dá uma resposta ao ecrã inteiro.
 *
 * Antes isto era uma linha de texto a cair do topo ("🍺 -1 vida!"), igual para
 * perder uma vida, levar um shot ou ser eliminado. Funcionava como notificação
 * e falhava como jogo: o momento mais duro da noite tinha o mesmo peso visual
 * que um aviso de sistema.
 *
 * Agora cada tipo tem uma batida própria, com três camadas que chegam por ordem:
 *
 *   1. TINTA    — o ecrã inteiro apanha a cor do acontecimento por um instante.
 *                 É o que faz o corpo reagir antes de o cérebro ler.
 *   2. ÍCONE    — grande, ao centro, com um gesto que diz o que aconteceu (o
 *                 coração parte-se, o copo bate, a vida nova cresce).
 *   3. PALAVRA  — só depois, e curta.
 *
 * Duram menos de 1,2 s de propósito. Isto acontece dezenas de vezes por noite:
 * um momento bonito que atrasa o jogo passa a ser um momento irritante à
 * terceira vez. Nada aqui apanha toques (`pointer-events-none`) — o jogo
 * continua a andar por baixo.
 */

const BATIDAS = {
  accepted: {
    icone: '✅',
    texto: 'Passou!',
    cor: '#4ade80',
    tinta: 'rgba(74, 222, 128, 0.16)',
    gesto: { rotate: [0, -8, 0], scale: [0.4, 1.15, 1] },
    abanao: null,
  },
  vida_perdida: {
    icone: '💔',
    texto: '-1 vida',
    cor: '#ff4d6d',
    tinta: 'rgba(255, 77, 109, 0.22)',
    // O coração cai e treme: perde-se qualquer coisa, e nota-se.
    gesto: { scale: [0.5, 1.25, 1.05], y: [-30, 8, 0], rotate: [0, -6, 4, 0] },
    abanao: 'leve',
  },
  shot: {
    icone: '🥃',
    texto: 'SHOT!',
    cor: '#ffb020',
    tinta: 'rgba(255, 176, 32, 0.26)',
    // O copo bate na mesa: desce depressa, salta, assenta.
    gesto: { scale: [0.3, 1.4, 1.1], y: [-60, 12, 0], rotate: [-14, 6, 0] },
    abanao: 'forte',
  },
  vida_extra: {
    icone: '❤️',
    texto: '+1 vida',
    cor: '#4ade80',
    tinta: 'rgba(74, 222, 128, 0.2)',
    // Cresce do nada e pulsa: ganhou-se qualquer coisa.
    gesto: { scale: [0, 1.35, 1], rotate: [0, 0, 0] },
    abanao: null,
  },
  eliminated: {
    icone: '💀',
    texto: 'Sem vidas',
    cor: '#ff4d6d',
    tinta: 'rgba(255, 61, 139, 0.3)',
    gesto: { scale: [0.4, 1.3, 1.1], rotate: [0, -10, 6, 0] },
    abanao: 'forte',
  },
};

export default function Beat({ effect }) {
  const b = BATIDAS[effect?.type];

  useEffect(() => {
    if (b?.abanao) abana(b.abanao);
  }, []);

  if (!b) return null;

  const reduzido = movimentoReduzido();
  // Em Caos o ícone vem maior: o mesmo acontecimento pesa mais às três da manhã.
  const escala = 1 + grau() * 0.06;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
      {/* 1. Tinta — o ecrã inteiro apanha a cor, e larga-a logo. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 0.55, times: [0, 0.18, 1], ease: 'easeOut' }}
        className="absolute inset-0"
        style={{ background: b.tinta }}
      />

      <div className="relative flex flex-col items-center gap-1">
        {/* Halo por trás do ícone — dá-lhe corpo sobre qualquer fundo. */}
        <motion.div
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: [0, 0.75, 0], scale: [0.4, 1.6, 2] }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="absolute rounded-full"
          style={{
            width: '9rem',
            height: '9rem',
            background: `radial-gradient(circle, ${b.cor} 0%, transparent 68%)`,
            filter: 'blur(14px)',
          }}
        />

        {/* 2. Ícone */}
        <motion.div
          initial={{ opacity: 0, scale: 0.4 }}
          animate={
            reduzido
              ? { opacity: 1, scale: escala }
              : { opacity: 1, ...b.gesto, scale: (b.gesto.scale || [1]).map((s) => s * escala) }
          }
          exit={{ opacity: 0, scale: 0.85 }}
          transition={
            reduzido
              ? { duration: 0.2 }
              : {
                  duration: 0.62,
                  times: [0, 0.45, 1],
                  ease: 'easeOut',
                  // A opacidade tem de ter curva PRÓPRIA. Partilhando os `times` do
                  // gesto (3 fotogramas para uma propriedade que só tem 2), o ícone
                  // ainda ia em 60% de opacidade quando o salto já estava no auge —
                  // via-se um copo translúcido em vez de uma pancada.
                  opacity: { duration: 0.12, ease: 'easeOut' },
                }
          }
          className="relative leading-none"
          style={{ fontSize: '5.5rem', filter: `drop-shadow(0 8px 26px ${b.cor}88)` }}
        >
          {b.icone}
        </motion.div>

        {/* 3. Palavra — chega depois do ícone, nunca ao mesmo tempo. */}
        <motion.p
          initial={{ opacity: 0, y: 10, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ ...MOLA.pop, delay: 0.16 }}
          className="fd-title font-extrabold text-3xl text-center"
          style={{ color: b.cor, textShadow: `0 2px 20px ${b.cor}66, 0 2px 10px rgba(0,0,0,0.8)` }}
        >
          {b.texto}
        </motion.p>

        {/* De quem foi, quando o servidor manda o nome (ex.: +1 vida do Vasco). */}
        {effect.name && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.28 }}
            className="text-sm font-bold text-white/80"
            style={{ textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}
          >
            {effect.name}
          </motion.p>
        )}
      </div>
    </div>
  );
}
