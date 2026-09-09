// F&D — Showroom de mini-jogos/eventos. Renderiza os COMPONENTES REAIS (Board e os
// cartões da roda) com dados fictícios, para confirmar o aspeto sem começar um jogo.
// Acede-se via ?demo na app; embebido na dashboard /admin.
//
// A VITRINE E A SALA DE TESTE
//
// Isto aqui é a vitrine: mostra num segundo estados que numa noite a sério são
// raros (absolvido e condenado lado a lado), mas os botões não fazem nada — não
// há servidor por trás. Para testar a LÓGICA de uma feature nova há o outro
// caminho, o "▶ jogar", que abre a app a sério numa sala com bots já dentro do
// jogo que se quer ver, e essa joga-se até ao fim (ver playtest.js). Os dois
// servem coisas diferentes e por isso vivem os dois nesta página.
import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import Board from './Board.jsx';
import { PromptCard, ChoiceCard, IntrigasCard } from './games/cards.jsx';
import { RelampagoCard, MimicaCard, RoletaCard, DueloCard } from './games/quickCards.jsx';
import { ReacaoCard } from './games/ReacaoCard.jsx';
import { TribunalCard } from './games/hardcoreCards.jsx';
import Beat from '../components/Beat.jsx';
import PalpiteBand from './games/PalpiteBand.jsx';
import VereditoBand from './games/VereditoBand.jsx';
import EventoDaNoite from '../components/EventoDaNoite.jsx';
import Palco from '../components/Palco.jsx';
import { limpaPalco } from '../palco.js';
import { aplicaHumor, humorAtual, NIVEIS } from '../mood.js';
import { confetti } from '../confetti.js';
import { linkPlaytest } from '../playtest.js';

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
  onTribunalAoVoto: noop, onTribunalVota: noop, onTribunalFecha: noop,
  onSkip: noop, onEnd: noop, onKick: noop, onReset: noop, onLeave: back,
});
const renderBoard = (patch) => (back) => <Board room={boardMock(patch)} youId="me" {...boardHandlers(back)} />;

const card = (rank, suit) => ({ rank, suit });

// ⚖️ Tribunal da Injustiça (server/src/game/tribunal.js + board/tribunal.js).
//
// É o tipo mais difícil de apanhar ao vivo para se afinar: na Roda só sai em
// hardcore/caos, e no Tabuleiro é preciso alguém ir preso E calhar nos 80%. Daí
// estarem aqui os quatro estados dos dois lados — que é para o que o showroom
// serve. A tese é uma das reais (`content/prompts.data.js`).
const TESE = 'Defende que devias poder despedir um amigo, com pré-aviso de 30 dias.';
const TESE_B = 'Defende que quem não bebe não devia ser convidado para sair.';
const tribunalRound = (patch = {}) => ({
  id: 'trib-' + (patch.substate || 'defesa'),
  gameTypeKey: 'tribunal',
  reuId: 'me',
  reuName: 'Tu',
  tese: TESE,
  segundos: 90,
  substate: 'defesa',
  veredito: null,
  custoCondenarMal: 2,
  result: null,
  ...patch,
});
const vereditoAberto = (jaVotaram = ['p2']) => ({
  pergunta: `Tu: "${TESE}"`,
  rotulos: { sim: '⚖️ Absolvido', nao: '🔨 Condenado', aviso: 'Se for absolvido, quem condenou bebe' },
  atores: ['me'],
  jaVotaram,
  fechado: false,
});
const tribunalBoard = (patch = {}) => ({
  reuId: 'p3',
  reuName: 'Rui',
  razao: 'abuso de bebida',
  tese: TESE_B,
  segundos: 90,
  abertoEm: Date.now(),
  substate: 'defesa',
  veredito: null,
  result: null,
  ...patch,
});

// A sala de teste que corresponde a cada cena (ver playtest.js). Onde não há
// entrada, a cena é um estado que não se encomenda — o "▶ jogar" leva na mesma
// ao modo certo, e o resto acontece a jogar.
const PLAY = {
  // ---------- Tabuleiro ----------
  'b-pawn': { mode: 'board' },
  'b-order': { mode: 'board' },
  'b-turn': { mode: 'board' },
  'b-card': { mode: 'board' },
  'b-greed': { mode: 'board' },
  'b-greed-escapa': { mode: 'board' },
  'b-over': { mode: 'board' },
  'b-regras': { mode: 'board' },
  'b-maldicao': { mode: 'board' },
  'b-mini-dare': { mode: 'board', casa: 'mini', gameKey: 'desafio' },
  'b-mini-choice': { mode: 'board', casa: 'mini', gameKey: 'isto_ou_aquilo' },
  'b-evento-pick': { mode: 'board', casa: 'evento' },
  'b-evento-sorte': { mode: 'board', casa: 'evento' },
  'b-evento-carta': { mode: 'board', casa: 'evento' },
  'b-evento-preso': { mode: 'board', casa: 'evento' },
  'b-gamble': { mode: 'board', casa: 'gamble' },
  'b-gamble-win': { mode: 'board', casa: 'gamble' },
  'b-gamble-lose': { mode: 'board', casa: 'gamble' },
  'b-bj': { mode: 'board', casa: 'blackjack' },
  'b-bj-win': { mode: 'board', casa: 'blackjack' },
  'b-bj-lose': { mode: 'board', casa: 'blackjack' },
  'b-bp': { mode: 'board', casa: 'beerpong' },
  'b-bp-jack': { mode: 'board', casa: 'beerpong' },
  'b-bp-bad': { mode: 'board', casa: 'beerpong' },
  'b-leilao': { mode: 'board', casa: 'leilao' },
  'b-trib-defesa': { mode: 'board', casa: 'tribunal' },
  'b-trib-voto': { mode: 'board', casa: 'tribunal' },
  'b-trib-absolvido': { mode: 'board', casa: 'tribunal' },
  'b-trib-condenado': { mode: 'board', casa: 'tribunal' },
  // ---------- Roda ----------
  'w-boca': { mode: 'wheel', tipo: 'boca_calada' },
  'w-desafio': { mode: 'wheel', tipo: 'desafio' },
  'w-iaq': { mode: 'wheel', tipo: 'isto_ou_aquilo' },
  'w-intrigas': { mode: 'wheel', tipo: 'intrigas' },
  'w-relampago': { mode: 'wheel', tipo: 'categoria_relampago' },
  'w-reacao': { mode: 'wheel', tipo: 'reacao' },
  'w-mimica': { mode: 'wheel', tipo: 'mimica' },
  'w-roleta': { mode: 'wheel', tipo: 'roleta_russa' },
  'w-moeda': { mode: 'wheel', tipo: 'duelo' },
  'w-duelo': { mode: 'wheel', tipo: 'duelo' },
  'w-trib-defesa': { mode: 'wheel', tipo: 'tribunal' },
  'w-trib-voto': { mode: 'wheel', tipo: 'tribunal' },
  'w-trib-convenceu': { mode: 'wheel', tipo: 'tribunal' },
  'w-trib-falhou': { mode: 'wheel', tipo: 'tribunal' },
};

/**
 * Abre a sala de teste desta cena.
 *
 * Dentro do iframe da /admin, `_top` não serve (levava a dashboard inteira) e
 * ficar no iframe também não (o jogo é vertical e a mesa é uma só). Vai sempre
 * para separador novo — o showroom fica onde está, para se voltar a ele.
 */
function abrePlaytest(spec) {
  window.open(linkPlaytest(spec), '_blank', 'noopener');
}

/** O botão "▶ jogar" — só aparece nas cenas que têm sala de teste. */
function BotaoJogar({ spec, className = '' }) {
  if (!spec) return null;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation(); // está dentro do cartão que abre a vitrine
        abrePlaytest(spec);
      }}
      title="Abrir a app a sério, com bots, já neste jogo"
      className={`fd-chip text-xs shrink-0 border border-fuchsia-400/40 ${className}`}
    >
      ▶ jogar
    </button>
  );
}

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
  {
    id: 'b-greed', kind: 'board', group: 'Tabuleiro', label: '🐍 Ganância castigada',
    render: renderBoard({
      lastEvent: {
        text: '🐍 Ganância castigada — recuas 3 casas!',
        greed: { victim: 'Tu', turn: 12, escapou: false, emoji: '🐍', titulo: 'Ganância castigada', texto: 'Recua 3 casas' },
      },
    }),
  },
  {
    // O 1%. Está no showroom porque à mesa nunca ninguém o vai ver: numa noite
    // inteira a ganância dispara meia dúzia de vezes, e escapar é 1 em 100.
    id: 'b-greed-escapa', kind: 'board', group: 'Tabuleiro', label: '😅 Ganância — escapou (1%)',
    render: renderBoard({
      lastEvent: {
        text: '😅 Tu abusaste da ganância… mas escapaste por um triz! Fica na mesma.',
        greed: { victim: 'Tu', turn: 13, escapou: true, emoji: '😅', titulo: 'Escapou por um triz', texto: 'Fica tudo na mesma — desta vez.' },
      },
    }),
  },
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
  // ⚖️ O julgamento de quem vai preso. Tranca a jogada — repare-se que o
  // tabuleiro por baixo fica suspenso, que é o ponto.
  {
    id: 'b-trib-defesa', kind: 'board', group: 'Tabuleiro', label: '⚖️ Tribunal — defesa (90s)',
    render: renderBoard({ tribunal: tribunalBoard() }),
  },
  {
    id: 'b-trib-voto', kind: 'board', group: 'Tabuleiro', label: '⚖️ Tribunal — o júri vota',
    render: renderBoard({
      tribunal: tribunalBoard({
        substate: 'votar',
        veredito: { ...vereditoAberto(['me']), pergunta: `Rui: "${TESE_B}"`, atores: ['p3'] },
      }),
    }),
  },
  {
    id: 'b-trib-absolvido', kind: 'board', group: 'Tabuleiro', label: '⚖️ Tribunal — absolvido',
    render: renderBoard({
      tribunal: tribunalBoard({
        substate: 'result',
        result: { absolvido: true, reuId: 'p3', reuName: 'Rui', absolvicoes: 2, condenacoes: 1, pena: null },
      }),
    }),
  },
  {
    id: 'b-trib-condenado', kind: 'board', group: 'Tabuleiro', label: '⚖️ Tribunal — condenado 🔨',
    render: renderBoard({
      tribunal: tribunalBoard({
        substate: 'result',
        result: { absolvido: false, reuId: 'p3', reuName: 'Rui', absolvicoes: 0, condenacoes: 3, pena: 'salta 2 vezes e bebe 3' },
      }),
    }),
  },
  {
    id: 'b-maldicao', kind: 'board', group: 'Tabuleiro', label: '☠️ Maldição disparada',
    render: renderBoard({ trapCount: 1, lastEvent: { text: '☠️ MALDIÇÃO na casa 14: Tu bebes 4 golos (deixada por Bea)', trap: { key: 'curse_drink', emoji: '☠️', square: 14, victim: 'Tu', owner: 'Bea', text: 'bebes 4 golos', self: false } } }),
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
    // O estado que interessa ver é o RESULTADO: é onde se lê que o último não
    // bebe só — perde mesmo uma vida. A corrida em si vê-se a jogar ("▶ jogar").
    id: 'w-reacao', kind: 'wheel', group: 'Roda', label: '⚡ Reação (resultado)',
    render: () => (
      <ReacaoCard
        round={{
          id: 'r1',
          gameTypeKey: 'reacao',
          substate: 'result',
          reaction: { goAt: Date.now(), done: true, tapped: ['me', 'p2'], falseStarts: [] },
          result: {
            ranking: [
              { id: 'p2', name: 'Bea', ms: 214, early: false, missed: false },
              { id: 'me', name: 'Tu', ms: 388, early: false, missed: false },
              { id: 'p3', name: 'Rui', ms: null, early: false, missed: true },
            ],
            winner: { id: 'p2', name: 'Bea' },
            drinkers: [{ id: 'p3', name: 'Rui' }],
            perdeuVida: { id: 'p3', name: 'Rui' },
            eliminado: false,
          },
        }}
        room={{ players: mkPlayers() }}
        youId="me"
        canControl
        onTap={noop}
        onContinue={noop}
      />
    ),
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
  // ⚖️ Tribunal na Roda — os quatro estados. Só sai em hardcore/caos, por isso
  // vê-lo a pedido é a única forma prática de lhe afinar o texto.
  {
    id: 'w-trib-defesa', kind: 'wheel', group: 'Roda', label: '⚖️ Tribunal — defesa (90s)',
    render: () => <TribunalCard round={tribunalRound()} room={{ players: mkPlayers() }} youId="me" canControl onAoVoto={noop} onVota={noop} onContinue={noop} />,
  },
  {
    id: 'w-trib-voto', kind: 'wheel', group: 'Roda', label: '⚖️ Tribunal — o júri vota',
    render: () => <TribunalCard round={tribunalRound({ substate: 'votar', veredito: vereditoAberto() })} room={{ players: mkPlayers() }} youId="me" canControl onAoVoto={noop} onVota={noop} onContinue={noop} />,
  },
  {
    id: 'w-trib-convenceu', kind: 'wheel', group: 'Roda', label: '⚖️ Tribunal — convenceu',
    render: () => (
      <TribunalCard
        round={tribunalRound({ substate: 'result', result: { absolvido: true, reuId: 'me', reuName: 'Tu', absolvicoes: 2, condenacoes: 1, custo: 2, pagantes: [{ id: 'p2', name: 'Bea' }] } })}
        room={{ players: mkPlayers() }} youId="me" canControl onAoVoto={noop} onVota={noop} onContinue={noop}
      />
    ),
  },
  {
    id: 'w-trib-falhou', kind: 'wheel', group: 'Roda', label: '⚖️ Tribunal — não convenceu 🔨',
    render: () => (
      <TribunalCard
        round={tribunalRound({ substate: 'result', result: { absolvido: false, reuId: 'me', reuName: 'Tu', absolvicoes: 0, condenacoes: 3, custo: 2, pagantes: [] } })}
        room={{ players: mkPlayers() }} youId="me" canControl onAoVoto={noop} onVota={noop} onContinue={noop}
      />
    ),
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
  // As encenações de ecrã inteiro do Tabuleiro passaram a ser cenas do palco
  // (ver ../palco.js), por isso o showroom também precisa de um palco montado —
  // e de o limpar ao trocar de cartão: a fila lembra-se do que já encenou, e
  // sem isto a mesma maldição só se via uma vez por visita.
  const back = () => { limpaPalco(); setSel(null); };
  const abre = (cena) => { limpaPalco(); setSel(cena); };

  if (sel?.kind === 'ambiente') return <PalcoAmbiente onBack={back} />;
  if (sel?.kind === 'palpites') return <PalcoPalpites onBack={back} />;
  if (sel?.kind === 'eventos') return <PalcoEventos onBack={back} />;

  if (sel?.kind === 'board') {
    return (
      <div className="min-h-full mx-auto max-w-md px-5 py-6 flex flex-col relative">
        <Palco />
        {sel.render(back)}
        {PLAY[sel.id] && (
          <div className="mt-4 flex items-center justify-between gap-2 text-xs text-white/40">
            <span>Os botões aqui são só visuais.</span>
            <BotaoJogar spec={PLAY[sel.id]} />
          </div>
        )}
      </div>
    );
  }
  if (sel?.kind === 'wheel') {
    return (
      <div className="min-h-full mx-auto max-w-md px-5 py-6 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <button onClick={back} className="text-sm text-white/50">← voltar aos demos</button>
          <BotaoJogar spec={PLAY[sel.id]} />
        </div>
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
        <p className="text-xs text-white/45 mt-1">
          Toca no cartão para ver o ecrã (dados fictícios). Toca em <b>▶ jogar</b> para o jogar a
          sério, com bots, até ao fim.
        </p>
      </header>

      {/* A sala de teste sem cena nenhuma: entrar no modo e jogar o que vier. */}
      <div className="flex flex-col gap-2">
        <p className="text-[11px] uppercase tracking-widest text-white/40 px-1">🧪 Sala de teste (bots)</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => abrePlaytest({ mode: 'wheel' })} className="fd-card px-4 py-3 text-sm">
            🎡 Roda
          </button>
          <button onClick={() => abrePlaytest({ mode: 'board' })} className="fd-card px-4 py-3 text-sm">
            🎲 Tabuleiro
          </button>
          <button onClick={() => abrePlaytest({ mode: 'morte' })} className="fd-card px-4 py-3 text-sm">
            💀 Modo da Morte
          </button>
          <button onClick={() => abrePlaytest({ mode: 'tournament' })} className="fd-card px-4 py-3 text-sm">
            🏆 Torneio
          </button>
        </div>
        <p className="text-[11px] text-white/35 px-1">
          Abre a app a sério em separador novo: tu + 3 bots, intensidade Caos, já dentro do jogo.
          Lá dentro, a barra 🧪 encomenda o jogo seguinte. No servidor a sério, abre este showroom
          pela <code className="text-white/50">/admin</code> — é de lá que vem o bilhete que
          destranca a sala de teste.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-[11px] uppercase tracking-widest text-white/40 px-1">✨ Ambiente</p>
        <button onClick={() => abre(ambiente)} className="fd-card text-left px-4 py-3 text-sm">
          {ambiente.label}
        </button>
        <button onClick={() => abre(palpitesDemo)} className="fd-card text-left px-4 py-3 text-sm">
          {palpitesDemo.label}
        </button>
        <button onClick={() => abre(eventosDemo)} className="fd-card text-left px-4 py-3 text-sm">
          {eventosDemo.label}
        </button>
      </div>
      {groups.map((g) => (
        <div key={g} className="flex flex-col gap-2">
          <p className="text-[11px] uppercase tracking-widest text-white/40 px-1">{g === 'Roda' ? '🎡 Roda' : '🎲 Tabuleiro'}</p>
          <div className="grid grid-cols-1 gap-2">
            {SCENARIOS.filter((s) => s.group === g).map((s) => (
              <div key={s.id} className="fd-card flex items-center gap-2 pr-3">
                <button onClick={() => abre(s)} className="flex-1 text-left px-4 py-3 text-sm">
                  {s.label}
                </button>
                <BotaoJogar spec={PLAY[s.id]} />
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="text-center text-[11px] text-white/30 mt-2">
        Nos ecrãs do tabuleiro, o "← Sair" volta aqui. Os botões de ação são só visuais (não mudam
        estado) — para os exercer a sério é o ▶ jogar.
      </p>
    </div>
  );
}
