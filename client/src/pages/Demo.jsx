// F&D — Showroom de mini-jogos/eventos. Renderiza os COMPONENTES REAIS (Board e os
// cartões da roda) com dados fictícios, para confirmar o aspeto sem começar um jogo.
// Acede-se via ?demo na app; embebido na dashboard /admin.
import { useState } from 'react';
import Board from './Board.jsx';
import { PromptCard, ChoiceCard, IntrigasCard } from './games/cards.jsx';

const PAWNS = ['🦊', '🐸', '🐵', '🦄', '🐙', '🐝', '🦁', '🐨', '🐼', '🐷', '🐧', '🐢', '🐔', '🦖'];
const CARD_META = {
  swap: { emoji: '🔁', name: 'Troca', desc: 'Trocas de casa com um jogador' },
  back2: { emoji: '⬅️', name: 'Empurrão', desc: 'Mandas alguém recuar 2 casas' },
  prison: { emoji: '⛓️', name: 'Denúncia', desc: 'Mandas alguém para a prisão' },
  skip: { emoji: '⏭️', name: 'Salta-vez', desc: 'Um jogador perde a próxima vez' },
  shield: { emoji: '🛡️', name: 'Escudo', desc: 'Bloqueia a próxima carta contra ti' },
  drink3: { emoji: '🍺', name: 'Ronda', desc: 'Obrigas alguém a beber 3 golos' },
  steal: { emoji: '🎁', name: 'Roubo', desc: 'Roubas uma carta a alguém' },
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
    id: 'w-intrigas', kind: 'wheel', group: 'Roda', label: '🗳️ Intrigas',
    render: () => <IntrigasCard round={{ gameTypeKey: 'intrigas', substate: 'choosing', currentPlayerName: 'Tu', currentPlayerId: 'me' }} room={{ players: mkPlayers() }} youId="me" reason="Quem é mais provável de acabar a noite a dormir no chão?" isAccuser isAccused={false} canControl onChooseTarget={noop} onSubmitRps={noop} onContinue={noop} />,
  },
];

export default function Demo() {
  const [sel, setSel] = useState(null);
  const back = () => setSel(null);

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
  return (
    <div className="min-h-full mx-auto max-w-md px-5 py-6 flex flex-col gap-5">
      <header className="text-center">
        <h1 className="fd-title fd-neon text-2xl font-extrabold">🎮 F&D · Demos</h1>
        <p className="text-xs text-white/45 mt-1">Pré-visualização dos mini-jogos e eventos (dados fictícios).</p>
      </header>
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
