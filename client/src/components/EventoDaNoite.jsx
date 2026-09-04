import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { sfx } from '../sfx.js';
import { confetti, haptic } from '../confetti.js';
import { abana } from '../mood.js';
import { MOLA, DUR, movimentoReduzido } from '../motion.js';

/**
 * O Evento da Noite — a encenação.
 *
 * O servidor decide o que aconteceu (server/src/game/eventos.js) e diz só se foi
 * BOM ou MAU. Aqui trata-se do resto, e a diferença entre os dois tem de se
 * sentir antes de se ler:
 *
 *   BOM       o ecrã abre — raios de luz a sair do centro, confetti, som de
 *             vitória. Parece que a sala ganhou alguma coisa.
 *   MAU       tempestade — o ecrã escurece, relâmpagos brancos a piscar, chuva
 *             a cair na diagonal, o ecrã abana. Parece que caiu alguma coisa.
 *
 * Ocupa o ecrã todo de propósito, ao contrário das batidas (Beat.jsx): um evento
 * acontece de cinco em cinco rondas ou mais, e o ponto é PARAR a mesa. As batidas
 * acontecem dezenas de vezes por noite e por isso vivem numa faixa no topo.
 *
 * Fecha-se sozinho — ninguém tem de carregar em nada para o jogo continuar.
 */

const DURACAO_MS = 3200;

export default function EventoDaNoite({ evento, onDone }) {
  const feito = useRef(false);

  useEffect(() => {
    // O RELÓGIO DE SAÍDA É O PRIMEIRO, e é agendado SEMPRE.
    //
    // Antes vinha no fim, depois do guarda `feito` e depois do som. Duas formas
    // de a carta ficar presa no ecrã por cima do jogo, e a mesa sem nada poder
    // fazer — porque nada aqui responde a toques (`pointer-events-none`):
    //
    //   1. o React monta o efeito, limpa-o e volta a montá-lo (StrictMode, em
    //      dev — e é em `npm run dev` que se fazem os playtests). A primeira
    //      passagem marcava o relógio, a limpeza apagava-o, e a segunda saía
    //      pelo guarda sem voltar a marcar nada. A carta nunca mais saía.
    //   2. se o som ou a vibração rebentassem num telemóvel qualquer, o efeito
    //      morria antes de chegar ao relógio — com o mesmo fim.
    //
    // Agendado primeiro e limpo sempre, a saída deixa de depender de tudo o que
    // vem a seguir lhe correr bem.
    const t = setTimeout(() => onDone?.(), DURACAO_MS);
    let t2 = null;

    // O guarda serve só ao que NÃO pode repetir-se: som, confetti e abanão.
    if (!feito.current) {
      feito.current = true;
      const bom = evento.tom === 'bom';
      try {
        if (bom) {
          sfx.win();
          confetti({ count: 140, power: 17 });
          haptic([30, 50, 30]);
        } else {
          sfx.shot();
          haptic([90, 60, 120, 60, 180]);
          abana('forte');
          // Segundo abanão a meio: uma tempestade que abana uma vez só parece um
          // soluço. Dois, espaçados, leem-se como trovoada.
          t2 = setTimeout(() => abana('forte'), 900);
        }
      } catch {
        /* sem som nem vibração a carta lê-se na mesma — presa é que não pode ficar */
      }
    }

    return () => {
      clearTimeout(t);
      if (t2) clearTimeout(t2);
    };
  }, []);

  const bom = evento.tom === 'bom';
  const cor = bom ? '#4ade80' : '#7c3aed';
  const reduzido = movimentoReduzido();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: DUR.rapida }}
      className="fixed inset-0 z-[70] pointer-events-none flex items-center justify-center px-6"
    >
      {/* Fundo: abre-se de luz (bom) ou fecha-se de escuro (mau). */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          background: bom
            ? 'radial-gradient(circle at 50% 45%, rgba(74,222,128,0.28) 0%, rgba(8,8,14,0.86) 62%)'
            : 'radial-gradient(circle at 50% 40%, rgba(124,58,237,0.24) 0%, rgba(2,2,6,0.94) 58%)',
        }}
      />

      {bom ? <Raios /> : <Tempestade reduzido={reduzido} />}

      {/* O que aconteceu.
          Leva fundo PRÓPRIO e não conta com o gradiente: o gradiente é escuro
          nas bordas e quase transparente no centro — justamente onde este texto
          fica. Sem isto lia-se a carta da ronda por trás das palavras. */}
      <motion.div
        initial={{ opacity: 0, y: 26, scale: 0.86 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ ...MOLA.pesada, delay: 0.18 }}
        className="relative text-center max-w-sm rounded-3xl px-6 py-6 backdrop-blur-md"
        style={{
          background: 'rgba(6,6,12,0.82)',
          border: `1px solid ${cor}55`,
          boxShadow: `0 24px 70px -20px ${cor}, 0 0 0 1px rgba(255,255,255,0.04) inset`,
        }}
      >
        <motion.div
          initial={{ scale: 0.3, rotate: bom ? -12 : 8 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ ...MOLA.pop, delay: 0.1 }}
          className="leading-none"
          style={{ fontSize: '4.5rem', filter: `drop-shadow(0 10px 30px ${cor})` }}
        >
          {evento.emoji}
        </motion.div>

        <p className="text-xs uppercase tracking-[0.3em] text-white/45 mt-2">
          {bom ? 'Evento da noite' : 'Cai sobre a mesa'}
        </p>
        <p
          className="fd-title text-3xl font-extrabold mt-0.5"
          style={{ color: bom ? '#86efac' : '#f0abfc', textShadow: `0 2px 24px ${cor}88` }}
        >
          {evento.titulo}
        </p>
        <p className="text-base text-white/85 mt-2 leading-snug">{evento.texto}</p>
      </motion.div>
    </motion.div>
  );
}

/** Raios de luz a sair do centro — a versão boa. */
function Raios() {
  const raios = Array.from({ length: 12 }, (_, i) => i);
  return (
    <motion.div
      className="absolute inset-0 overflow-hidden"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: [0, 0.55, 0.25], scale: [0.8, 1.1, 1] }}
      transition={{ duration: 1.6, ease: 'easeOut' }}
    >
      <motion.div
        className="absolute left-1/2 top-[45%]"
        animate={{ rotate: 360 }}
        transition={{ duration: 26, repeat: Infinity, ease: 'linear' }}
        style={{ width: 0, height: 0 }}
      >
        {raios.map((i) => (
          <div
            key={i}
            className="absolute"
            style={{
              width: '2px',
              height: '150vmax',
              background: 'linear-gradient(to top, transparent, rgba(190,255,210,0.5), transparent)',
              transformOrigin: 'top center',
              transform: `rotate(${(i * 360) / raios.length}deg) translateY(-75vmax)`,
            }}
          />
        ))}
      </motion.div>
    </motion.div>
  );
}

/** Relâmpagos + chuva na diagonal — a versão má. */
function Tempestade({ reduzido }) {
  const gotas = Array.from({ length: reduzido ? 0 : 44 }, (_, i) => ({
    id: i,
    x: Math.random() * 110 - 5,
    atraso: Math.random() * 1.2,
    duracao: 0.5 + Math.random() * 0.45,
    altura: 14 + Math.random() * 22,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Relâmpagos: dois clarões brancos, curtos e desencontrados. */}
      {!reduzido &&
        [0, 1].map((i) => (
          <motion.div
            key={i}
            className="absolute inset-0 bg-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.75, 0, 0.35, 0] }}
            transition={{ duration: 0.5, delay: i === 0 ? 0.12 : 1.15, times: [0, 0.1, 0.3, 0.45, 1] }}
          />
        ))}

      {gotas.map((g) => (
        <motion.div
          key={g.id}
          className="absolute"
          initial={{ y: '-15vh', opacity: 0 }}
          animate={{ y: '115vh', opacity: [0, 0.8, 0.8, 0] }}
          transition={{ duration: g.duracao, delay: g.atraso, repeat: Infinity, ease: 'linear' }}
          style={{
            left: `${g.x}%`,
            width: '2px',
            height: `${g.altura}px`,
            background: 'linear-gradient(to bottom, transparent, rgba(200,190,255,0.85))',
            transform: 'rotate(14deg)',
          }}
        />
      ))}
    </div>
  );
}
