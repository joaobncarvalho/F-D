// F&D — "Como se joga", acessível DURANTE o jogo.
//
// Em qualquer festa há sempre alguém que chega a meio ou que nunca jogou. Sem
// isto, a resposta é sempre a mesma: alguém deixa de jogar para explicar. Aqui
// está tudo a um toque, por modo e por mini-jogo.

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TYPES } from '../pages/games/shared.jsx';
import { sfx } from '../sfx.js';

const MODOS = {
  wheel: {
    titulo: '🎡 Roda',
    texto:
      'Cada um, à sua vez, gira a roda. O tipo que sair decide o mini-jogo. Recusar um desafio custa uma vida ❤️ e um copo; sem vidas, levas um shot e ficas a ver. De tempos a tempos cai um Evento da Noite sobre a mesa toda — pode salvar-te ou arrasar-te.',
  },
  board: {
    titulo: '🎲 Tabuleiro',
    texto:
      'Corrida à volta do tabuleiro: avanças 1, 2 ou 3 casas bebendo 2, 4 ou 6 golos. Ganha quem der a volta primeiro. Andar devagar três vezes seguidas = prisão. As cartas jogam-se contra os outros na tua vez.',
  },
  tournament: {
    titulo: '🏆 Torneio',
    texto:
      'Eliminação direta: duelos 1v1 até sobrar uma pessoa. Quem perde bebe e sai do quadro. Não há vidas — há eliminação.',
  },
};

const JOGOS = {
  boca_calada: 'Respondes à pergunta que te escreveram… ou dizes "boca calada" e bebes.',
  desafio: 'Fazes o desafio ou recusas — recusar custa uma vida.',
  isto_ou_aquilo: 'Dilema com duas opções. Escolhes uma. Não há terceira via.',
  intrigas: 'Quem gira acusa alguém em segredo. Pedra-papel-tesoura decide: se o acusado ganhar, fica a saber a razão; se perder, bebe e nunca saberá.',
  segredos: 'Mostra-se um segredo anónimo; o grupo adivinha o autor. Quem erra bebe — se todos acertarem, bebe o autor.',
  piramide: 'Memorizas as tuas cartas. Vira-se a pirâmide: atribuis golos a alguém e essa pessoa pode desconfiar — quem se engana bebe a dobrar.',
  vasco: 'Todos sabem a palavra secreta menos o Vasco. Dão-se pistas e vota-se. O Vasco ainda se pode redimir adivinhando.',
  categoria_relampago: 'Uma categoria, oito segundos, itens em voz alta. No fim a MESA vota se aguentaste — se não, perdes uma vida ❤️',
  mimica: 'Mimas a palavra que só tu vês. No fim a MESA vota se percebeu — se não, perdes uma vida ❤️ (empate conta a teu favor).',
  roleta_russa: 'Pergunta embaraçosa: respondes ou passas — e cada passe fica mais caro.',
  duelo: 'Dois jogadores, um mini-duelo presencial. Quem perde bebe.',
  eu_nunca: 'Todos respondem ao mesmo tempo: "já fiz" ou "nunca". Quem já fez, bebe.',
  mais_provavel: 'Todos votam na pessoa mais provável de fazer aquilo. O mais votado bebe um golo por voto.',
  termometro: 'Cada um escolhe 0 a 10 em segredo. Revela-se tudo: os extremos bebem.',
  quem_disse: 'Mostra-se uma pergunta escrita na preparação. Adivinha quem a escreveu — quem erra bebe.',
  cascata: 'Todos começam a beber. Só podes parar depois de quem está à tua frente. O último bebe muito mais.',
  desenho: 'Desenhas a palavra no telemóvel; os outros adivinham. Ninguém acerta = bebes tu.',
  reacao: 'Assim que o ecrã ficar verde: carrega. O último bebe. Carregar antes do sinal também.',
};

export default function Rules({ mode = 'wheel', onClose }) {
  const [aberto, setAberto] = useState(null);
  const modo = MODOS[mode] || MODOS.wheel;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 20, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="mx-auto max-w-md p-5 flex flex-col gap-3"
      >
        <div className="flex items-center justify-between">
          <h2 className="fd-title text-2xl font-extrabold">Como se joga</h2>
          <button onClick={onClose} className="fd-card w-10 h-10 grid place-items-center text-lg">✕</button>
        </div>

        <div className="fd-card p-4">
          <p className="font-bold">{modo.titulo}</p>
          <p className="text-sm text-white/70 mt-1 leading-snug">{modo.texto}</p>
        </div>

        <div className="fd-card p-4">
          <p className="font-bold mb-1">🍻 Regra de ouro</p>
          <p className="text-sm text-white/70 leading-snug">
            Bebe-se com moderação e há sempre água na mesa. Se alguém não estiver bem, o host pausa o
            jogo — o botão ⏸️ está no topo.
          </p>
        </div>

        <p className="text-sm font-semibold text-white/60 mt-1">Mini-jogos</p>
        <div className="flex flex-col gap-1.5">
          {TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                sfx.click();
                setAberto(aberto === t.key ? null : t.key);
              }}
              className="fd-card px-3 py-2.5 text-left"
            >
              <span className="font-bold text-sm" style={{ color: t.color }}>
                {t.emoji} {t.label}
              </span>
              <AnimatePresence>
                {aberto === t.key && (
                  <motion.p
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="text-xs text-white/70 leading-snug overflow-hidden mt-1"
                  >
                    {JOGOS[t.key] || '—'}
                  </motion.p>
                )}
              </AnimatePresence>
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
