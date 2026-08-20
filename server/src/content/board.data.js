// F&D — bancos do Modo Tabuleiro (fonte única de verdade do conteúdo do tabuleiro).
// Módulo PURO (sem efeitos) partilhado por:
//   - server/prisma/seed.js   (semeia a tabela board_items)
//   - server/src/repo.js      (fallback em memória quando não há BD)
//   - server/src/board.js     (interpreta os efeitos tipados)
//
// Três bancos, todos editáveis na /admin (tabela board_items, discriminada por
// `category`). Aqui vivem os valores por omissão (usados sem BD / se a BD falhar).
//
//   • evento (casa ??): { emoji, title, desc, effect, value }
//       effect ∈ advance | back | drink | card | prison | others_drink
//       value  = magnitude (casas/golos); ignorado em card/prison.
//   • prisao: { note, skipTurns, drink, back, loseCard }  (efeitos combinados)
//   • carta (catálogo jogável): { key, emoji, name, desc }
//       A MECÂNICA de cada carta vive em board.js (keyed por `key`); aqui está só
//       o catálogo (quais existem + aspeto). Desativar uma carta tira-a do baralho.

export const BOARD_EVENTS = [
  { emoji: '🚀', title: 'Sorte!', desc: 'Avanças 2 casas', effect: 'advance', value: 2 },
  { emoji: '💨', title: 'Azar', desc: 'Recuas 2 casas', effect: 'back', value: 2 },
  { emoji: '🍺', title: 'Golada', desc: 'Bebes 3 golos', effect: 'drink', value: 3 },
  { emoji: '🎴', title: 'Carta nova', desc: 'Ganhas uma carta', effect: 'card', value: null },
  { emoji: '🚔', title: 'Preso!', desc: 'Vais direto para a prisão', effect: 'prison', value: null },
  { emoji: '👯', title: 'Ronda geral', desc: 'Todos os outros bebem 2', effect: 'others_drink', value: 2 },
];

export const BOARD_PRISON = [
  { note: 'perde 1 vez', skipTurns: 1, drink: 0, back: 0, loseCard: false },
  { note: 'perde 2 vezes', skipTurns: 2, drink: 0, back: 0, loseCard: false },
  { note: 'bebe 4 golos + perde 1 vez', skipTurns: 1, drink: 4, back: 0, loseCard: false },
  { note: 'recua 3 + perde 1 vez', skipTurns: 1, drink: 0, back: 3, loseCard: false },
  { note: 'perde 1 carta + 1 vez', skipTurns: 1, drink: 0, back: 0, loseCard: true },
];

// Catálogo de cartas jogáveis. `key` liga à mecânica em board.js (CARD_EFFECTS).
export const BOARD_CARDS = [
  { key: 'swap', emoji: '🔁', name: 'Troca', desc: 'Trocas de casa com um jogador' },
  { key: 'back2', emoji: '⬅️', name: 'Empurrão', desc: 'Mandas alguém recuar 2 casas' },
  { key: 'prison', emoji: '⛓️', name: 'Denúncia', desc: 'Mandas alguém para a prisão' },
  { key: 'skip', emoji: '⏭️', name: 'Salta-vez', desc: 'Um jogador perde a próxima vez' },
  { key: 'shield', emoji: '🛡️', name: 'Escudo', desc: 'Bloqueia a próxima carta contra ti' },
  { key: 'drink3', emoji: '🍺', name: 'Ronda', desc: 'Obrigas alguém a beber 3 golos' },
  { key: 'steal', emoji: '🎁', name: 'Roubo', desc: 'Roubas uma carta a alguém' },
];

// Linhas para o seed da BD (board_items). Achata os três bancos numa só tabela.
export function boardItemsForSeed() {
  const rows = [];
  for (const e of BOARD_EVENTS)
    rows.push({ category: 'evento', emoji: e.emoji, title: e.title, desc: e.desc, effect: e.effect, value: e.value ?? null, skipTurns: 0, drink: 0, back: 0, loseCard: false });
  for (const p of BOARD_PRISON)
    rows.push({ category: 'prisao', emoji: '🚔', title: p.note, desc: '', effect: null, value: null, skipTurns: p.skipTurns, drink: p.drink, back: p.back, loseCard: p.loseCard });
  for (const c of BOARD_CARDS)
    rows.push({ category: 'carta', emoji: c.emoji, title: c.name, desc: c.desc, effect: c.key, value: null, skipTurns: 0, drink: 0, back: 0, loseCard: false });
  return rows;
}
