// F&D — peças partilhadas pelos cartões dos mini-jogos da Roda.
// Extraído do Game.jsx (monólito) para modularização gradual — sem alterar
// comportamento. TYPES é a fonte única dos tipos da roda (cor/emoji/label).

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { sfx } from '../../sfx.js';
import { ENTRA, ITEM_LISTA, LISTA, MOLA, suavizado } from '../../motion.js';

export const TYPES = [
  { key: 'boca_calada', label: 'Boca Calada', color: '#ff3d8b', emoji: '🤐' },
  { key: 'desafio', label: 'Desafio', color: '#9b5cff', emoji: '🔥' },
  { key: 'intrigas', label: 'Intrigas', color: '#ffb020', emoji: '🗳️' },
  { key: 'segredos', label: 'Segredos', color: '#1fd3b6', emoji: '🤫' },
  { key: 'piramide', label: 'Piramide', color: '#5b8cff', emoji: '🔺' },
  { key: 'vasco', label: 'Vasco', color: '#ff8c42', emoji: '🕵️' },
  { key: 'isto_ou_aquilo', label: 'Isto/Aquilo', color: '#4ade80', emoji: '⚖️' },
  { key: 'categoria_relampago', label: 'Relâmpago', color: '#facc15', emoji: '⚡' },
  { key: 'mimica', label: 'Mímica', color: '#f472b6', emoji: '🎭' },
  { key: 'roleta_russa', label: 'Roleta Russa', color: '#ef4444', emoji: '🎯' },
  { key: 'duelo', label: 'Duelo 1v1', color: '#38bdf8', emoji: '⚔️' },
  // Jogos de MESA INTEIRA — toda a gente joga ao mesmo tempo.
  { key: 'eu_nunca', label: 'Eu Nunca', color: '#a78bfa', emoji: '🙈' },
  { key: 'mais_provavel', label: 'Mais Provável', color: '#fb923c', emoji: '👉' },
  { key: 'termometro', label: 'Termómetro', color: '#f87171', emoji: '🌡️' },
  { key: 'quem_disse', label: 'Quem Disse', color: '#22d3ee', emoji: '💬' },
  { key: 'cascata', label: 'Cascata', color: '#60a5fa', emoji: '🌊' },
  { key: 'desenho', label: 'Desenha', color: '#34d399', emoji: '🎨' },
  { key: 'reacao', label: 'Reação', color: '#fde047', emoji: '⚡' },
  // Tipos "hardcore": sobem a aposta em consequência (quem decide, quanto custa
  // decidir mal, e o que sobra depois da ronda) e não em volume de bebida.
  { key: 'bomba', label: 'Bomba', color: '#f43f5e', emoji: '💣' },
  { key: 'leilao', label: 'Leilão', color: '#eab308', emoji: '🔨' },
  { key: 'sincronia', label: 'Sincronia', color: '#2dd4bf', emoji: '🔗' },
  { key: 'detetor', label: 'Detetor', color: '#c084fc', emoji: '🕵️‍♂️' },
  { key: 'julgamento', label: 'Julgamento', color: '#94a3b8', emoji: '⚖️' },
  { key: 'contrato', label: 'Contrato', color: '#fb7185', emoji: '🤝' },
  // ⚖️ Tribunal da Injustiça (2026-09-04): só sai em hardcore/caos, e no
  // Tabuleiro é o que acontece a quem vai preso.
  { key: 'tribunal', label: 'Tribunal', color: '#f59e0b', emoji: '⚖️' },
];

/**
 * Modificadores da noite (espelho de server/src/game/modificadores.js).
 *
 * Aqui só para o rótulo curto do HUD durante o jogo: o catálogo completo, com as
 * descrições, chega pela rede no `room.modifiers.catalogo` e é esse que o lobby
 * mostra. Se um dia aparecer uma chave nova, o HUD ignora-a em silêncio em vez
 * de partir a ronda a meio.
 */
export const MODIFICADORES = {
  sem_escape: { emoji: '⛓️', label: 'Sem Escape', desc: 'Recusar custa duas vidas.' },
  alvo_marcado: { emoji: '🎯', label: 'Alvo Marcado', desc: 'Quem perde vida fica na mira.' },
  dobro_ou_nada: { emoji: '🔁', label: 'Dobro ou Nada', desc: 'Aceitar pode valer o dobro.' },
  sem_anonimato: { emoji: '🔒', label: 'Sem Anonimato', desc: 'As Intrigas revelam sempre a razão.' },
  morte_subita: { emoji: '💀', label: 'Morte Súbita', desc: 'No fim da noite, recusar elimina.' },
};

/** Cor/emoji/label de um tipo — com um fallback seguro para tipos desconhecidos. */
export function typeMeta(key) {
  return TYPES.find((t) => t.key === key) || { key, label: key, color: '#9b5cff', emoji: '🎲' };
}

/** Avatar do jogador (emoji + cor escolhidos no lobby). Transversal aos 3 modos. */
export function Avatar({ player, size = 30, ring = false }) {
  if (!player) return null;
  return (
    <span
      className="inline-grid place-items-center rounded-full flex-shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.58,
        background: `${player.color || '#9b5cff'}33`,
        border: `2px solid ${ring ? player.color || '#9b5cff' : 'transparent'}`,
      }}
      title={player.name}
    >
      {player.emoji || '🙂'}
    </span>
  );
}

/**
 * Transição entre PASSOS dentro da mesma carta.
 *
 * O `CardShell` já animava a carta a ENTRAR, mas um jogo como as Intrigas tem
 * três passos (escolher → pedra-papel-tesoura → reveal) dentro do MESMO tipo:
 * o React reutiliza o mesmo `motion.div`, a carta não remonta, e o conteúdo
 * trocava de um frame para o outro sem nada a marcar a passagem. Quem estava a
 * olhar para o telemóvel do lado nem dava por a ronda ter avançado.
 *
 * `mode="wait"` de propósito: os passos são exclusivos e o que sai não se deve
 * cruzar com o que entra — numa carta estreita isso lê-se como uma falha.
 */
const PASSO = suavizado({
  initial: { opacity: 0, x: 18 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -18 },
  transition: MOLA.suave,
});

export function CardShell({ children, typeKey, passo = null }) {
  const t = TYPES.find((x) => x.key === typeKey);
  return (
    <motion.div
      {...suavizado(ENTRA)}
      className="fd-card p-5 flex flex-col gap-3 text-center"
      style={{ boxShadow: `0 12px 40px -14px ${t?.color}99` }}
    >
      <p className="text-sm font-bold uppercase tracking-wide" style={{ color: t?.color }}>
        {t?.emoji} {t?.label}
      </p>
      {/* Sem `passo`, o conteúdo entra direto como sempre entrou — as cartas
          sem sub-estados não pagam nada por isto. */}
      {passo == null ? (
        children
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={passo} {...PASSO} className="flex flex-col gap-3">
            {children}
          </motion.div>
        </AnimatePresence>
      )}
    </motion.div>
  );
}

/**
 * Fila de fichas de jogador (escolher alguém: buddy, acusado, voto, palpite).
 * É o gesto mais repetido da noite e estava escrito à mão em quatro sítios,
 * sempre estático. Entram escalonadas — a mesa vê a lista a formar-se em vez de
 * a encontrar já feita.
 */
export function Fichas({ players, onPick, rotulo = (p) => p.name, disabled = false }) {
  return (
    <motion.div
      className="flex flex-wrap gap-2 justify-center"
      variants={LISTA}
      initial="initial"
      animate="animate"
    >
      {players.map((p) => (
        <motion.button
          key={p.id}
          variants={suavizado(ITEM_LISTA)}
          whileTap={{ scale: 0.94 }}
          disabled={disabled}
          onClick={() => {
            sfx.click();
            onPick(p.id);
          }}
          className="fd-chip"
        >
          {rotulo(p)}
        </motion.button>
      ))}
    </motion.div>
  );
}

// Passo/badge do Buddy — partilhado pelo PromptCard e ChoiceCard.
export function BuddyBlock({ round, room, youId, isMyTurn, onChooseBuddy }) {
  if (!round.needsBuddy) return null;
  if (round.buddyId) {
    return (
      <p className="text-sm font-bold text-cyan-300">
        🤝 Buddy: {round.buddyName} — bebe sempre que {round.currentPlayerName} beber!
      </p>
    );
  }
  if (isMyTurn) {
    const others = room.players.filter((p) => p.connected && p.id !== youId);
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-cyan-300 font-semibold">🤝 Escolhe o teu Buddy (bebe sempre que tu bebes):</p>
        <Fichas players={others} onPick={onChooseBuddy} />
      </div>
    );
  }
  return <p className="text-sm text-white/50">🤝 {round.currentPlayerName} está a escolher o buddy…</p>;
}

// ----- A batida dos resultados ------------------------------------------------
//
// Os resultados da Roda revelavam tudo no mesmo frame: quem ganhou o leilão, o
// veredito do júri, se a dupla bateu certo — tudo já lá estava antes de alguém
// ter tempo de perguntar. Isso não é falta de brilho, é falta de PERGUNTA antes
// da resposta. No Tabuleiro isto já existia (o dado do Gamble a rodar, as cartas
// do Blackjack a virarem-se); na Roda não.
//
// A regra, e é curta: a carta mostra logo o que levou ali (as licitações, as
// duas escolhas, a contagem dos votos) e segura só o DESFECHO — um elemento por
// carta, o que é o pagamento da ronda — por ~600 ms.
//
// O teto de tempo é deliberado. Um resultado acontece todas as rondas, 20 a 30
// vezes por noite: a encenação que encanta à primeira é um imposto à trigésima.
// É a mesma regra do motion.js — quem espera, espera pouco.

const ESPERA_MS = 600;

/** O gesto do desfecho: salta uma vez e assenta. */
const POP_DESFECHO = {
  initial: { scale: 0.55, opacity: 0, rotate: -4 },
  animate: { scale: 1, opacity: 1, rotate: 0 },
  transition: MOLA.salto,
};

/**
 * `true` quando chega a hora de mostrar o desfecho. Recomeça sempre que `ativo`
 * volta a ficar verdadeiro (a carta não remonta entre sub-estados: sem isto, o
 * relógio disparava no início da ronda e o resultado nascia já revelado).
 */
export function useRevelacao(ativo, espera = ESPERA_MS) {
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    if (!ativo) {
      setPronto(false);
      return undefined;
    }
    const t = setTimeout(() => setPronto(true), espera);
    return () => clearTimeout(t);
  }, [ativo, espera]);
  return pronto;
}

/**
 * O desfecho da ronda. Enquanto não é hora, ocupa o mesmo espaço com três pontos
 * a pulsar — reservar a altura é o que evita a carta a saltar por baixo do dedo
 * de quem está a ler.
 */
export function Desfecho({ pronto, children, som = true }) {
  useEffect(() => {
    if (pronto && som) {
      try {
        sfx.reveal();
      } catch {
        /* sem som lê-se na mesma */
      }
    }
  }, [pronto, som]);

  return (
    <div className="min-h-[2.75rem] grid place-items-center">
      <AnimatePresence mode="wait" initial={false}>
        {pronto ? (
          <motion.div key="desfecho" {...suavizado(POP_DESFECHO)}>
            {children}
          </motion.div>
        ) : (
          <motion.div
            key="espera"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.25, 0.7, 0.25] }}
            // A SAÍDA leva transição própria. Sem ela herdava o `repeat:
            // Infinity` da entrada, nunca terminava, e o AnimatePresence em
            // `mode="wait"` ficava à espera dela para sempre: o desfecho não
            // chegava a entrar e ficava um buraco no meio da carta.
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            transition={{ opacity: { duration: 1.1, repeat: Infinity } }}
            className="text-2xl tracking-[0.3em] text-white/50 leading-none"
          >
            •••
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * As peças que EXPLICAM o desfecho (as licitações, as escolhas da dupla) entram
 * uma a uma antes dele. Curto de propósito: é o compasso, não o número.
 */
export function EntraEmFila({ children, className = '' }) {
  return (
    <motion.div variants={LISTA} initial="initial" animate="animate" className={className}>
      {children}
    </motion.div>
  );
}

/** Um item da fila acima. */
export function ItemDaFila({ children, className = '' }) {
  return (
    <motion.div variants={suavizado(ITEM_LISTA)} className={className}>
      {children}
    </motion.div>
  );
}
