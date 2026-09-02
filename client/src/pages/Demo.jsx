// F&D — Showroom de mini-jogos/eventos. Renderiza os COMPONENTES REAIS (Board e os
// cartões da roda) com dados fictícios, para confirmar o aspeto sem começar um jogo.
// Acede-se via ?demo na app; embebido na dashboard /admin.
import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import Board from './Board.jsx';
import { PromptCard, ChoiceCard, IntrigasCard } from './games/cards.jsx';
import { RelampagoCard, MimicaCard, RoletaCard, DueloCard } from './games/quickCards.jsx';
import Beat from '../components/Beat.jsx';
import PalpiteBand from './games/PalpiteBand.jsx';
import VereditoBand from './games/VereditoBand.jsx';
import EventoDaNoite from '../components/EventoDaNoite.jsx';
import { aplicaHumor, humorAtual, NIVEIS } from '../mood.js';
import { confetti } from '../confetti.js';

const PAWNS = ['🦊', '🐸', '🐵', '🦄', '🐙', '🐝', '🦁', '🐨', '🐼', '🐷', '🐧', '🐢', '🐔', '🦖'];
const CARD_META = {
  swap: { emoji: '🔁', name: 'Troca', desc: 'Trocas de casa com um jogador' },
  back2: { emoji: '⬅️', name: 'Empurrão', desc: 'Mandas alguém recuar 2 casas' },
  prison: { emoji: '⛓️', name: 'Denúncia', desc: 'Mandas alguém para a prisão' },
  skip: { emoji: '⏭️', name: 'Salta-vez', desc: 'Um jogador perde a próxima vez' },
  shield: { emoji: '🛡️', name: 'Escudo', desc: 'Bloqueia a próxima carta contra ti' },
  drink3: { emoji: '🍺', name: 'Ronda', desc: 'Obrigas alguém a beber 3 golos' },
  steal: { emoji: '🎁', name: 'Roubo', desc: 'Roubas uma carta a alguém' },
  curse_drink: { emoji: '☠️', name: 'Maldição da Golada', desc: 'Escondes numa casa: quem lá parar bebe 4 golos' },
};
const GAME_LABEL = { boca_calada: 'Boca Calada', desafio: 'Desafio', isto_ou_aquilo: 'Isto ou Aquilo' };

// Tabuleiro fictício de 60 casas com variedade.
const DEMO_SQUARES = Array.from({ length: 60 }, (_, i) => {
  if (i === 0) return { i, kind: 'partida' };
  if (i % 9 === 4) return { i, kind: 'evento' };
  if (i % 11 === 7) return { i, kind: 'gamble' };
  if (i % 13 === 5) return { i, kind: 'blackjack' };
  if (i % 14 === 9) return { i, kind: 'beerpong' };
  const g = ['boca_calada', 'desafio', 'isto_ou_aquilo'][i % 3];
  return { i, kind: 'mini', gameKey: g, gameLabel: GAME_LABEL[g] };
});

const mkPlayers = () => [
  { id: 'me', name: 'Tu', connected: true, isHost: true },
  { id: 'p2', name: 'Bea', connected: true, isHost: false },
  { id: 'p3', name: 'Rui', connected: false, isHost: false },
];
const mkBoardPlayers = () => ({
  me: { pawn: '🦊', pos: 12, golos: 8, slowStreak: 0, fastStreak: 1, skipTurns: 0, finished: false, shield: true, cardCount: 2, cards: [{ id: 'c1', key: 'swap' }, { id: 'c2', key: 'drink3' }], prisonCount: 1, cardsPlayed: 3 },
  p2: { pawn: '🐸', pos: 20, golos: 14, slowStreak: 0, fastStreak: 0, skipTurns: 0, finished: false, shield: false, cardCount: 1, cards: [], prisonCount: 0, cardsPlayed: 1 },
  p3: { pawn: '🐵', pos: 7, golos: 22, slowStreak: 0, fastStreak: 0, skipTurns: 1, finished: false, shield: false, cardCount: 0, cards: [], prisonCount: 3, cardsPlayed: 0 },
});

function boardMock(patch = {}) {
  return {
    code: 'DEMO',
    players: mkPlayers(),
    board: {
      phase: 'playing',
      size: 60,
      intensity: 'leve',
      squares: DEMO_SQUARES,
      pawns: PAWNS,
      cardMeta: CARD_META,
      players: mkBoardPlayers(),
      dice: { me: 5, p2: 3, p3: 6 },
      order: ['p3', 'me', 'p2'],
      currentPlayerId: 'me',
      pending: null,
      lastMove: null,
      lastEvent: null,
      winnerId: null,
      ...patch,
    },
  };
}
const noop = () => {};
const boardHandlers = (back) => ({
  onPickPawn: noop, onRoll: noop, onAdvance: noop, onResolve: noop, onGamble: noop,
  onEventoPick: noop, onBlackjack: noop, onBeerpong: noop, onPlayCard: noop,
  onBid: noop, onRuleFail: noop,
  onSkip: noop, onEnd: noop, onKick: noop, onReset: noop, onLeave: back,
});
const renderBoard = (patch) => (back) => <Board room={boardMock(patch)} youId="me" {...boardHandlers(back)} />;

const card = (rank, suit) => ({ rank, suit });

// Cada cena: componente real + dados fictícios.
const SCENARIOS = [
  // ---------- Tabuleiro ----------
  { id: 'b-pawn', kind: 'board', group: 'Tabuleiro', label: '🎲 Escolher peão', render: renderBoard({ phase: 'pawn' }) },
  { id: 'b-order', kind: 'board', group: 'Tabuleiro', label: '🎲 Lançar dado (ordem)', render: renderBoard({ phase: 'order' }) },
  { id: 'b-turn', kind: 'board', group: 'Tabuleiro', label: '🎯 A tua vez (cartas + avançar)', render: renderBoard({}) },
  { id: 'b-mini-dare', kind: 'board', group: 'Tabuleiro', label: '🔥 Casa: Desafio', render: renderBoard({ pending: { kind: 'mini', variant: 'dare', gameKey: 'desafio', gameLabel: 'Desafio', text: 'Faz a tua melhor imitação de outro jogador; se ninguém adivinhar, bebes 3.' } }) },
  { id: 'b-mini-choice', kind: 'board', group: 'Tabuleiro', label: '⚖️ Casa: Isto ou Aquilo', render: renderBoard({ pending: { kind: 'mini', variant: 'choice', gameKey: 'isto_ou_aquilo', gameLabel: 'Isto ou Aquilo', options: ['Beber 2 golos', 'Mandar mensagem a um ex'] } }) },
  { id: 'b-evento-pick', kind: 'board', group: 'Tabuleiro', label: '❓ Casa ?? — escolher (3 cartas)', render: renderBoard({ pending: { kind: 'evento', playerId: 'me', count: 3 } }) },
  { id: 'b-evento-sorte', kind: 'board', group: 'Tabuleiro', label: '❓ ?? revelado: Sorte 🚀', render: renderBoard({ lastEvent: { text: '🚀 Tu tiveste sorte — avança 2 casas!', evento: { pickedIndex: 1, emoji: '🚀', title: 'Sorte!', desc: 'Avanças 2 casas', card: null } } }) },
  { id: 'b-evento-carta', kind: 'board', group: 'Tabuleiro', label: '❓ ?? revelado: Carta 🎴', render: renderBoard({ lastEvent: { text: '🎴 Tu ganhaste a carta Roubo!', evento: { pickedIndex: 0, emoji: '🎁', title: 'Roubo', desc: 'Roubas uma carta a alguém', card: 'steal' } } }) },
  { id: 'b-evento-preso', kind: 'board', group: 'Tabuleiro', label: '❓ ?? revelado: Preso 🚔', render: renderBoard({ lastEvent: { text: '🚔 Tu foste PRESO!', evento: { pickedIndex: 2, emoji: '🚔', title: 'Preso!', desc: 'Vais para a prisão', card: null } } }) },
  { id: 'b-gamble', kind: 'board', group: 'Tabuleiro', label: '🎲 Gamble — apostar', render: renderBoard({ pending: { kind: 'gamble', playerId: 'me' } }) },
  { id: 'b-gamble-win', kind: 'board', group: 'Tabuleiro', label: '🎲 Gamble ganhou 🎉', render: renderBoard({ lastEvent: { text: '🎲 Tu apostaste e GANHOU — avança 2 (bebe 4)! 🎉', gamble: { result: 'win' } } }) },
  { id: 'b-gamble-lose', kind: 'board', group: 'Tabuleiro', label: '🎲 Gamble perdeu 😬', render: renderBoard({ lastEvent: { text: '🎲 Tu apostaste e PERDEU — recua 2! 😬', gamble: { result: 'lose' } } }) },
  { id: 'b-bj', kind: 'board', group: 'Tabuleiro', label: '🃏 Blackjack — mesa', render: renderBoard({ pending: { kind: 'blackjack', playerId: 'me', stage: 'player', player: [card('10', '♠'), card('7', '♥')], pv: 17, dealer: [card('K', '♣')], dv: 10, dealerHidden: true } }) },
  { id: 'b-bj-win', kind: 'board', group: 'Tabuleiro', label: '🃏 Blackjack ganhou 🏆', render: renderBoard({ lastEvent: { text: '🃏 Venceste a casa — avança 2 e ganha carta!', blackjack: { result: 'win', player: [card('10', '♠'), card('9', '♥')], dealer: [card('K', '♣'), card('7', '♦')], pv: 19, dv: 17 } } }) },
  { id: 'b-bj-lose', kind: 'board', group: 'Tabuleiro', label: '🃏 Blackjack perdeu', render: renderBoard({ lastEvent: { text: '🃏 Perdeste para a casa — bebe 3 golos!', blackjack: { result: 'lose', player: [card('10', '♠'), card('6', '♣')], dealer: [card('K', '♦'), card('9', '♠')], pv: 16, dv: 19 } } }) },
  { id: 'b-bp', kind: 'board', group: 'Tabuleiro', label: '🏓 Beer Pinga — apontar', render: renderBoard({ pending: { kind: 'beerpong', playerId: 'me' } }) },
  { id: 'b-bp-jack', kind: 'board', group: 'Tabuleiro', label: '🏓 Beer Pinga: JACKPOT 🏆', render: renderBoard({ lastEvent: { text: '🍺 Acertaste no copo (trás) — bebe 4 · avança 3 + carta!', beerpong: { row: 2, cupIdx: 0, cupCount: 5, base: 4, emoji: '🏆', title: 'JACKPOT', desc: 'avança 3 + carta', good: true } } }) },
  { id: 'b-bp-bad', kind: 'board', group: 'Tabuleiro', label: '🏓 Beer Pinga: Afogado 🥴', render: renderBoard({ lastEvent: { text: '🍺 Acertaste no copo (trás) — bebe 4 · +6 golos!', beerpong: { row: 2, cupIdx: 1, cupCount: 5, base: 4, emoji: '🥴', title: 'Afogado', desc: '+6 golos', good: false } } }) },
  { id: 'b-card', kind: 'board', group: 'Tabuleiro', label: '🔁 Carta usada (banner)', render: renderBoard({ lastEvent: { text: '🔁 Bea trocou de casa contigo', card: { key: 'swap', emoji: '🔁', name: 'Troca', by: 'Bea', target: 'Tu' } } }) },
  { id: 'b-greed', kind: 'board', group: 'Tabuleiro', label: '🐍 Ganância castigada', render: renderBoard({ lastEvent: { text: '🐍 Ganância castigada — recuas 3 casas!', greed: true } }) },
  { id: 'b-over', kind: 'board', group: 'Tabuleiro', label: '🏁 Ecrã de fim', render: renderBoard({ phase: 'over', winner: { id: 'p2', name: 'Bea' }, winnerId: 'p2', currentPlayerId: null }) },

  // ---------- Roda ----------
  {
    id: 'w-boca', kind: 'wheel', group: 'Roda', label: '🤐 Boca Calada',
    render: () => <PromptCard round={{ gameTypeKey: 'boca_calada', prompt: { text: 'Qual foi a coisa mais parva que fizeste bêbado/a?' }, currentPlayerName: 'Tu', currentPlayerId: 'me', needsBuddy: false }} room={{ players: mkPlayers() }} youId="me" isMyTurn onAction={noop} onChooseBuddy={noop} />,
  },
  {
    id: 'w-desafio', kind: 'wheel', group: 'Roda', label: '🔥 Desafio',
    render: () => <PromptCard round={{ gameTypeKey: 'desafio', prompt: { text: 'Liga a um contacto aleatório e canta os parabéns.' }, currentPlayerName: 'Tu', currentPlayerId: 'me', needsBuddy: false }} room={{ players: mkPlayers() }} youId="me" isMyTurn onAction={noop} onChooseBuddy={noop} />,
  },
  {
    id: 'w-iaq', kind: 'wheel', group: 'Roda', label: '⚖️ Isto ou Aquilo',
    render: () => <ChoiceCard round={{ gameTypeKey: 'isto_ou_aquilo', currentPlayerName: 'Tu', currentPlayerId: 'me', options: ['Beber 2 golos', 'Ligar a um ex'], status: 'active', chosen: null, needsBuddy: false }} room={{ players: mkPlayers() }} youId="me" canControl onChooseBuddy={noop} onChooseOption={noop} onContinue={noop} />,
  },
  {
    id: 'b-leilao', kind: 'board', group: 'Tabuleiro', label: '🔨 Casa Leilão (licitação secreta)',
    render: renderBoard({ pending: { kind: 'auction', playerId: 'me', squares: 3, maxBid: 6, bidders: ['p2'] } }),
  },
  {
    id: 'b-regras', kind: 'board', group: 'Tabuleiro', label: '📜 Roleta de Regras (regra ativa)',
    render: renderBoard({ activeRules: [{ id: 'r1', text: 'Ninguém pode dizer nomes próprios', remaining: 3, byName: 'Bea' }] }),
  },
  {
    id: 'b-maldicao', kind: 'board', group: 'Tabuleiro', label: '☠️ Maldição disparada',
    render: renderBoard({ trapCount: 1, lastEvent: { text: '☠️ MALDIÇÃO na casa 14: Tu bebes 4 golos (deixada por Bea)', trap: { key: 'curse_drink', emoji: '☠️', square: 14, victim: 'Tu', owner: 'Bea' } } }),
  },
  {
    id: 'w-intrigas', kind: 'wheel', group: 'Roda', label: '🗳️ Intrigas',
    render: () => <IntrigasCard round={{ gameTypeKey: 'intrigas', substate: 'choosing', currentPlayerName: 'Tu', currentPlayerId: 'me' }} room={{ players: mkPlayers() }} youId="me" reason="Quem é mais provável de acabar a noite a dormir no chão?" isAccuser isAccused={false} canControl onChooseTarget={noop} onSubmitRps={noop} onContinue={noop} />,
  },
  {
    id: 'w-relampago', kind: 'wheel', group: 'Roda', label: '⚡ Categoria Relâmpago',
    render: () => <RelampagoCard round={{ id: 'r1', gameTypeKey: 'categoria_relampago', currentPlayerId: 'me', currentPlayerName: 'Tu', category: 'Marcas de cerveja', seconds: 8, substate: 'ready', result: null }} room={{ players: mkPlayers() }} youId="me" canControl onStart={noop} onTimeUp={noop} onVota={noop} onContinue={noop} />,
  },
  {
    id: 'w-mimica', kind: 'wheel', group: 'Roda', label: '🎭 Mímica',
    render: () => <MimicaCard round={{ id: 'r2', gameTypeKey: 'mimica', currentPlayerId: 'me', currentPlayerName: 'Tu', modeLabel: 'Mímica', modeHint: 'Só gestos — nem uma palavra, nem sons.', seconds: 60, substate: 'ready', result: null }} room={{ players: mkPlayers() }} youId="me" word={{ word: 'Ressaca' }} canControl onStart={noop} onTimeUp={noop} onVota={noop} onContinue={noop} />,
  },
  {
    id: 'w-roleta', kind: 'wheel', group: 'Roda', label: '🎯 Roleta Russa',
    render: () => <RoletaCard round={{ id: 'r3', gameTypeKey: 'roleta_russa', currentPlayerId: 'me', currentPlayerName: 'Tu', question: 'Qual foi o encontro mais desastroso da tua vida?', passes: 1, tab: 1, nextCost: 2, maxPasses: 3, substate: 'asking', result: null }} youId="me" canControl onAnswer={noop} onPass={noop} onContinue={noop} />,
  },
  {
    id: 'w-moeda', kind: 'wheel', group: 'Roda', label: '🪙 Cara ou Coroa',
    // A moeda relança-se sempre que se abre a demo — dá para ver a animação sem
    // ter de montar um duelo a sério.
    render: () => {
      const face = Math.random() < 0.5 ? 'cara' : 'coroa';
      return (
        <DueloCard
          round={{
            id: 'r5-' + face + Math.random(), gameTypeKey: 'duelo',
            currentPlayerId: 'me', currentPlayerName: 'Tu', opponentId: 'p2', opponentName: 'Bea',
            duel: { key: 'cara_coroa', emoji: '🪙', label: 'Cara ou Coroa', desc: 'A moeda é lançada aqui na app.' },
            substate: 'result', coin: { call: 'cara', face },
            result: { winnerId: face === 'cara' ? 'me' : 'p2', winnerName: face === 'cara' ? 'Tu' : 'Bea', loserName: face === 'cara' ? 'Bea' : 'Tu', golos: 3 },
          }}
          youId="me" canControl onResult={noop} onCall={noop} onContinue={noop}
        />
      );
    },
  },
  {
    id: 'w-duelo', kind: 'wheel', group: 'Roda', label: '⚔️ Duelo 1v1',
    render: () => <DueloCard round={{ id: 'r4', gameTypeKey: 'duelo', currentPlayerId: 'me', currentPlayerName: 'Tu', opponentId: 'p2', opponentName: 'Bea', duel: { key: 'par_impar', emoji: '✌️', label: 'Par ou Ímpar', desc: 'Contagem até três e cada um mostra os dedos de uma mão.' }, substate: 'duelling', result: null }} youId="me" canControl onResult={noop} onCall={noop} onContinue={noop} />,
  },
];

/**
 * Palco do ambiente: humor da noite + batidas de reveal.
 *
 * Estas duas coisas são as únicas da app que NÃO se conseguem ver a pedido — o
 * humor só sobe ao fim de meia hora de jogo e uma batida obriga a perder uma
 * vida a sério. Sem isto, afinar as cores do Caos significava jogar meia hora de
 * cada vez que se mexia num valor. Aqui vê-se tudo em dois toques.
 *
 * Ao sair volta a pôr o humor onde estava: o showroom não pode deixar a app
 * pintada de Caos.
 */
/**
 * Palco dos palpites — os quatro estados da faixa, lado a lado.
 *
 * Numa noite a sério cada estado dura segundos e depende de ser a vez de outra
 * pessoa; a apanhá-los ao vivo perdia-se mais tempo do que a afiná-los. Aqui
 * vêem-se os quatro de uma vez.
 */
function PalcoPalpites({ onBack }) {
  // Mesa fictícia com toda a gente ligada — o showroom serve para ver a faixa,
  // não para simular quedas de rede.
  const room = { players: mkPlayers().map((p) => ({ ...p, eliminated: false, connected: true })) };
  const base = {
    pergunta: 'Aceita ou bebe?',
    opcoes: [
      { key: 'aceita', rotulo: '💪 Aceita', emoji: '💪' },
      { key: 'bebe', rotulo: '🍺 Bebe', emoji: '🍺' },
    ],
    excluidos: ['p2'],
    golos: 2,
  };
  const estados = [
    ['Por apostar (és plateia)', { ...base, jaApostaram: ['p3'], resolvido: false }, 'me'],
    ['Já apostaste', { ...base, jaApostaram: ['me', 'p3'], resolvido: false }, 'me'],
    ['És tu que estás a jogar', { ...base, jaApostaram: ['me', 'p3'], resolvido: false }, 'p2'],
    [
      'Resolvido',
      {
        ...base,
        jaApostaram: ['me', 'p3'],
        resolvido: true,
        resultado: 'bebe',
        certos: [{ id: 'me', name: 'Tu' }],
        errados: [{ id: 'p3', name: 'Rui' }],
      },
      'me',
    ],
  ];

  return (
    <div className="min-h-full mx-auto max-w-md px-5 py-6 flex flex-col gap-4">
      <button onClick={onBack} className="text-sm text-white/50 self-start">← voltar aos demos</button>
      <p className="text-xs text-white/45">
        A segunda camada de cada ronda: enquanto um joga, a mesa aposta. Aparece só nos tipos em
        que a plateia não tem mais nada que fazer.
      </p>
      {estados.map(([rotulo, palpite, youId]) => (
        <div key={rotulo} className="flex flex-col gap-1">
          <p className="text-[11px] uppercase tracking-widest text-white/35 px-1">{rotulo}</p>
          <PalpiteBand palpite={palpite} room={room} youId={youId} onPalpite={noop} />
        </div>
      ))}
    </div>
  );
}

/**
 * Palco do Evento da Noite e do veredito da mesa.
 *
 * O evento cai de cinco em cinco rondas ou mais, e o veredito exige uma mesa a
 * meio de uma mímica — nenhum dos dois se consegue ver a pedido durante o
 * desenvolvimento. Aqui disparam-se à vontade.
 */
function PalcoEventos({ onBack }) {
  const [evento, setEvento] = useState(null);
  const room = { players: mkPlayers().map((p) => ({ ...p, eliminated: false, connected: true })) };

  const dispara = (tom) =>
    setEvento(
      tom === 'bom'
        ? {
            em: Date.now(),
            tom: 'bom',
            emoji: '🍀',
            titulo: 'Ronda da casa',
            texto: 'A Bea estava a levar com tudo — a casa devolve-lhe uma vida.',
          }
        : {
            em: Date.now(),
            tom: 'mau',
            emoji: '⛈️',
            titulo: 'Tempestade',
            texto: 'Cai tudo ao mesmo tempo: menos uma vida para TODA a gente.',
          }
    );

  const baseVeredito = { pergunta: 'A mesa percebeu a mímica?', atores: ['p2'] };
  const estados = [
    ['Por votar', { ...baseVeredito, jaVotaram: ['p3'], fechado: false }, 'me'],
    ['Já votaste', { ...baseVeredito, jaVotaram: ['me', 'p3'], fechado: false }, 'me'],
    ['És tu que atuaste', { ...baseVeredito, jaVotaram: ['me'], fechado: false }, 'p2'],
    ['Fechado (falhou)', { ...baseVeredito, jaVotaram: ['me', 'p3'], fechado: true, resultado: 'nao', sim: 0, nao: 2 }, 'me'],
  ];

  return (
    <div className="min-h-full mx-auto max-w-md px-5 py-6 flex flex-col gap-4">
      <button onClick={onBack} className="text-sm text-white/50 self-start">← voltar aos demos</button>

      <div className="fd-card p-4 flex flex-col gap-3">
        <p className="text-sm font-bold">🌩️ Evento da Noite</p>
        <p className="text-xs text-white/50">
          Cai entre rondas, nos dois modos. O bom abre o ecrã de luz; o mau traz tempestade e
          abana (só do Hardcore para cima, ver o palco do humor).
        </p>
        <div className="flex gap-2">
          <button onClick={() => dispara('bom')} className="fd-btn fd-btn-success flex-1">
            🍀 Bom
          </button>
          <button onClick={() => dispara('mau')} className="fd-btn fd-btn-danger flex-1">
            ⛈️ Mau
          </button>
        </div>
      </div>

      <p className="text-xs text-white/45 mt-1">
        ⚖️ Veredito da mesa — quem decide se a pessoa conseguiu deixou de ser ela (ou o host).
      </p>
      {estados.map(([rotulo, veredito, youId]) => (
        <div key={rotulo} className="flex flex-col gap-1">
          <p className="text-[11px] uppercase tracking-widest text-white/35 px-1">{rotulo}</p>
          <VereditoBand veredito={veredito} room={room} youId={youId} onVota={noop} />
        </div>
      ))}

      <AnimatePresence>
        {evento && (
          <EventoDaNoite key={evento.em} evento={evento} onDone={() => setEvento(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function PalcoAmbiente({ onBack }) {
  const [humor, setHumor] = useState(humorAtual());
  const [batida, setBatida] = useState(null);

  useEffect(() => {
    const anterior = humorAtual();
    return () => aplicaHumor(anterior);
  }, []);

  function mudaHumor(nivel) {
    aplicaHumor(nivel);
    setHumor(nivel);
  }

  function dispara(type, name) {
    setBatida({ type, name, nonce: Math.random() });
    if (type === 'vida_extra') confetti({ count: 70, power: 13 });
    setTimeout(() => setBatida(null), 1250);
  }

  const BATIDAS = [
    ['accepted', '✅ Passou'],
    ['vida_perdida', '💔 -1 vida'],
    ['shot', '🥃 Shot'],
    ['vida_extra', '❤️ +1 vida'],
    ['eliminated', '💀 Eliminado'],
  ];
  const ROTULOS = { leve: '🍃 Leve', picante: '🌶️ Picante', hardcore: '🔥 Hardcore', caos: '💥 Caos' };

  return (
    <div className="min-h-full mx-auto max-w-md px-5 py-6 flex flex-col gap-4">
      <button onClick={onBack} className="text-sm text-white/50 self-start">← voltar aos demos</button>

      <div className="fd-card p-4 flex flex-col gap-3">
        <p className="text-sm font-bold">🌡️ Humor da noite</p>
        <p className="text-xs text-white/50">
          Muda o fundo, a velocidade dos halos, a vinheta e o brilho das cartas. Em jogo é
          automático (sobe com a curva de intensidade).
        </p>
        <div className="grid grid-cols-2 gap-2">
          {NIVEIS.map((n) => (
            <button
              key={n}
              onClick={() => mudaHumor(n)}
              className={`fd-chip ${humor === n ? 'fd-chip-on' : ''}`}
            >
              {ROTULOS[n]}
            </button>
          ))}
        </div>
      </div>

      <div className="fd-card p-4 flex flex-col gap-3">
        <p className="text-sm font-bold">💥 Batidas</p>
        <p className="text-xs text-white/50">
          O abanão do ecrã só existe do Hardcore para cima — experimenta a mesma batida em
          Leve e em Caos.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {BATIDAS.map(([type, rotulo]) => (
            <button key={type} onClick={() => dispara(type, 'Bea')} className="fd-chip">
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>{batida && <Beat key={batida.nonce} effect={batida} />}</AnimatePresence>
    </div>
  );
}

export default function Demo() {
  const [sel, setSel] = useState(null);
  const back = () => setSel(null);

  if (sel?.kind === 'ambiente') return <PalcoAmbiente onBack={back} />;
  if (sel?.kind === 'palpites') return <PalcoPalpites onBack={back} />;
  if (sel?.kind === 'eventos') return <PalcoEventos onBack={back} />;

  if (sel?.kind === 'board') {
    return <div className="min-h-full mx-auto max-w-md px-5 py-6 flex flex-col relative">{sel.render(back)}</div>;
  }
  if (sel?.kind === 'wheel') {
    return (
      <div className="min-h-full mx-auto max-w-md px-5 py-6 flex flex-col gap-4">
        <button onClick={back} className="text-sm text-white/50 self-start">← voltar aos demos</button>
        <p className="text-center text-xs uppercase tracking-widest text-white/40">Roda · {sel.label}</p>
        {sel.render()}
      </div>
    );
  }

  const groups = [...new Set(SCENARIOS.map((s) => s.group))];
  const ambiente = { id: 'ambiente', kind: 'ambiente', label: '🌡️ Humor da noite + batidas' };
  const palpitesDemo = { id: 'palpites', kind: 'palpites', label: '🎲 Palpites da mesa' };
  const eventosDemo = { id: 'eventos', kind: 'eventos', label: '🌩️ Evento da Noite + veredito' };
  return (
    <div className="min-h-full mx-auto max-w-md px-5 py-6 flex flex-col gap-5">
      <header className="text-center">
        <h1 className="fd-title fd-neon text-2xl font-extrabold">🎮 F&D · Demos</h1>
        <p className="text-xs text-white/45 mt-1">Pré-visualização dos mini-jogos e eventos (dados fictícios).</p>
      </header>
      <div className="flex flex-col gap-2">
        <p className="text-[11px] uppercase tracking-widest text-white/40 px-1">✨ Ambiente</p>
        <button onClick={() => setSel(ambiente)} className="fd-card text-left px-4 py-3 text-sm">
          {ambiente.label}
        </button>
        <button onClick={() => setSel(palpitesDemo)} className="fd-card text-left px-4 py-3 text-sm">
          {palpitesDemo.label}
        </button>
        <button onClick={() => setSel(eventosDemo)} className="fd-card text-left px-4 py-3 text-sm">
          {eventosDemo.label}
        </button>
      </div>
      {groups.map((g) => (
        <div key={g} className="flex flex-col gap-2">
          <p className="text-[11px] uppercase tracking-widest text-white/40 px-1">{g === 'Roda' ? '🎡 Roda' : '🎲 Tabuleiro'}</p>
          <div className="grid grid-cols-1 gap-2">
            {SCENARIOS.filter((s) => s.group === g).map((s) => (
              <button key={s.id} onClick={() => setSel(s)} className="fd-card text-left px-4 py-3 text-sm">
                {s.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="text-center text-[11px] text-white/30 mt-2">
        Nos ecrãs do tabuleiro, o "← Sair" volta aqui. Os botões de ação são só visuais (não mudam estado).
      </p>
    </div>
  );
}
