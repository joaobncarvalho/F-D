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
      'Corrida à volta do tabuleiro: avanças 1, 2 ou 3 casas bebendo 2, 4 ou 6 golos. Ganha quem der a volta primeiro. Andar devagar três vezes seguidas = prisão — e ir preso é quase sempre ir a ⚖️ julgamento primeiro, com hipótese de escapar. As cartas jogam-se contra os outros na tua vez.',
  },
  tournament: {
    titulo: '🏆 Torneio',
    texto:
      'Eliminação direta: duelos 1v1 até sobrar uma pessoa. Quem perde bebe e sai do quadro. Não há vidas — há eliminação.',
  },
  morte: {
    titulo: '💀 Última Ronda',
    texto:
      'Os mesmos jogos da Roda, com três regras a mais. (1) NÃO HÁ RECUSAR: ou fazes, ou sais — recusar não tira uma vida, põe-te fora. (2) QUEM SAI GANHA PODER: voltas como fantasma, com cartas que mexem em quem ficou (marcar o próximo alvo, condenar a ronda, ressuscitar alguém, trocar vidas) e um testamento — uma regra tua que vale até ao fim. Só se joga uma carta por ronda. (3) O RELÓGIO ENCURTA a cada eliminação. Restando dois, a noite acaba num duelo. Sair não obriga a beber mais: o castigo é a saída.',
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
  duelo: 'Dois jogadores, um mini-duelo sorteado de onze (pedra-papel-tesoura, olhares, braço de ferro, memória…). Quem perde bebe — no Modo da Morte perde uma vida, e no duelo final sai.',
  eu_nunca: 'Todos respondem ao mesmo tempo: "já fiz" ou "nunca". Quem já fez, bebe.',
  mais_provavel: 'Todos votam na pessoa mais provável de fazer aquilo. O mais votado bebe um golo por voto.',
  termometro: 'Cada um escolhe 0 a 10 em segredo. Revela-se tudo: os extremos bebem.',
  quem_disse: 'Mostra-se uma pergunta escrita na preparação. Adivinha quem a escreveu — quem erra bebe.',
  cascata: 'Todos começam a beber. Só podes parar depois de quem está à tua frente. O último bebe muito mais.',
  desenho: 'Desenhas a palavra no telemóvel; os outros adivinham. Ninguém acerta = bebes tu.',
  reacao: 'Assim que o ecrã ficar verde: carrega. O último bebe. Carregar antes do sinal também.',
  bomba: 'Diz um item do tema e passa. O pavio é secreto — quem a tiver na mão quando rebentar perde uma vida ❤️',
  leilao: 'Ninguém quer o desafio. Licitam-se goles EM SEGREDO para escapar: quem licitar menos, fá-lo (e não bebe). Os outros bebem o que licitaram.',
  sincronia: 'Dois respondem à mesma pergunta em segredo. Se derem a mesma resposta, bebe a mesa toda; se não, bebem os dois.',
  detetor: 'Respondes em voz alta e podes mentir. A mesa vota se acreditou. Quem vota mal bebe 2; enganar toda a gente dá uma vida ❤️ e ser lido por todos tira uma.',
  julgamento: 'A mesa acusa-te; sorteia-se um advogado de defesa. Condenado, perdes uma vida ❤️ Absolvido, quem te condenou bebe 2 e o advogado ganha uma vida.',
  contrato: 'Um pacto entre dois, por 5 jogadas. Se assinarem os dois, ganham uma vida cada ❤️ Quem recusar bebe 2. Cumprir é por honra — a mesa fiscaliza.',
  tribunal:
    'Só em Hardcore para cima. Tens 90 segundos para defender, a sério e em voz alta, uma tese indefensável. A mesa é o júri: se convenceres, quem votou contra bebe 2; se não, perdes uma vida ❤️ No Tabuleiro é o que acontece a quem vai preso — na maior parte das vezes há julgamento antes da sentença, e uma absolvição livra-te dela.',
};

// Regras da noite. Não se escolhem: CALHAM, ponderadas pela intensidade votada,
// e algumas caem a meio da noite. Nenhuma manda beber mais — mexem em vidas, em
// vez e em exposição. Ver server/src/game/modificadores.js.
const MODIFICADORES_REGRAS = {
  '⛓️ Sem Escape': 'Recusar custa duas vidas em vez de uma.',
  '🎯 Alvo Marcado': 'Quem perde uma vida volta a ser o alvo na ronda seguinte (no máximo duas vezes seguidas).',
  '🔁 Dobro ou Nada': 'Depois de aceitares, podes dobrar: a mesa julga. Consegues, ganhas uma vida; falhas, perdes a que estava em jogo.',
  '🔒 Sem Anonimato': 'A razão das Intrigas é sempre revelada a toda a mesa no fim.',
  '📿 A Conta': 'Podes adiar o gole e ficar a dever, com juro. A conta passa-se a quem a aceitar (e ganha uma vida por isso), herda-se de quem sai, e fecha no fim da noite.',
  '💀 Morte Súbita': 'A partir do último terço da noite, recusar elimina-te em vez de tirar uma vida.',
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

        {/* Os modificadores mudam as REGRAS da noite, e por isso vêm antes dos
            mini-jogos: quem abre isto a meio do jogo quer perceber porque é que
            recusar lhe custou duas vidas, e a resposta não está em nenhum jogo. */}
        <p className="text-sm font-semibold text-white/60 mt-1">
          ⚡ Regras da noite{' '}
          <span className="text-white/35">— calham durante o jogo; podem sair mais do que uma</span>
        </p>
        <div className="fd-card p-4 flex flex-col gap-2">
          {Object.entries(MODIFICADORES_REGRAS).map(([nome, texto]) => (
            <p key={nome} className="text-xs text-white/70 leading-snug">
              <b className="text-white">{nome}</b> — {texto}
            </p>
          ))}
          <p className="text-[11px] text-white/40 leading-snug">
            Quantas saem depende da intensidade votada, e o host pode vetar no lobby o que a mesa não
            quiser. Nenhuma manda beber mais do que o jogo normal: mexem em vidas, em vez e em
            exposição.
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
