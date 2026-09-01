// F&D — bancos do Modo Tabuleiro (fonte única de verdade do conteúdo do tabuleiro).
// Módulo PURO (sem efeitos) partilhado por:
//   - server/prisma/seed.js   (semeia a tabela board_items)
//   - server/src/repo.js      (fallback em memória quando não há BD)
//   - server/src/board.js     (interpreta os efeitos tipados)
//
// Três bancos, todos editáveis na /admin (tabela board_items, discriminada por
// `category`). Aqui vivem os valores por omissão (usados sem BD / se a BD falhar).
//
//   • evento (casa ??): { emoji, title, desc, effect, value, weight }
//       effect ∈ advance | back | drink | all_drink | others_drink | leader_drink |
//                drink_per_card | last_advance | card | steal_card | trade_cards |
//                shield | swap_leader | skip | prison | alliance | rule_roulette | mirror
//       value  = magnitude (casas/golos); ignorado nos efeitos sem grandeza.
//       weight = probabilidade relativa dentro do banco (1 = normal).
//   • prisao: { note, skipTurns, drink, back, loseCard }  (efeitos combinados)
//   • carta (catálogo jogável): { key, emoji, name, desc }
//       A MECÂNICA de cada carta vive em board.js (keyed por `key`); aqui está só
//       o catálogo (quais existem + aspeto). Desativar uma carta tira-a do baralho.
//   • regra (Roleta de Regras): { text, turns }  (na BD: title=texto, value=jogadas)

// A casa ?? mostra TRÊS cartas de cada vez. Com um banco de 9 via-se um terço do
// baralho a cada visita e ao fim de meia hora já se sabia tudo de cor — daí este
// banco maior e com pesos.
//
// `weight` é a probabilidade relativa dentro do banco (1 = normal). Os efeitos
// dramáticos levam peso baixo para continuarem a ser acontecimentos; os pequenos
// levam peso alto porque são o pano de fundo.
export const BOARD_EVENTS = [
  // ---- Movimento (o pão-nosso da corrida) ----
  { emoji: '🚀', title: 'Sorte!', desc: 'Avanças 2 casas', effect: 'advance', value: 2, weight: 3 },
  { emoji: '🏃', title: 'Atalho', desc: 'Avanças 1 casa', effect: 'advance', value: 1, weight: 3 },
  { emoji: '🌟', title: 'Noite inspirada', desc: 'Avanças 4 casas', effect: 'advance', value: 4, weight: 1 },
  { emoji: '💨', title: 'Azar', desc: 'Recuas 2 casas', effect: 'back', value: 2, weight: 3 },
  { emoji: '🍌', title: 'Casca de banana', desc: 'Recuas 1 casa', effect: 'back', value: 1, weight: 3 },
  { emoji: '🕳️', title: 'Buraco', desc: 'Recuas 4 casas', effect: 'back', value: 4, weight: 1 },
  { emoji: '🐢', title: 'Último a rir', desc: 'Se vais em último, avanças 3 — senão bebes 2', effect: 'last_advance', value: 3, weight: 2 },

  // ---- Bebida (a moeda do jogo) ----
  { emoji: '🍺', title: 'Golada', desc: 'Bebes 3 golos', effect: 'drink', value: 3, weight: 3 },
  { emoji: '🥤', title: 'Golinho', desc: 'Bebes 1 golo', effect: 'drink', value: 1, weight: 3 },
  { emoji: '🥴', title: 'Fundo do copo', desc: 'Bebes 5 golos', effect: 'drink', value: 5, weight: 1 },
  { emoji: '👯', title: 'Ronda geral', desc: 'Todos os outros bebem 2', effect: 'others_drink', value: 2, weight: 2 },
  { emoji: '🍻', title: 'Saúde!', desc: 'TODA a mesa bebe 2 — tu incluído', effect: 'all_drink', value: 2, weight: 2 },
  { emoji: '👑', title: 'Impostos', desc: 'Quem vai à frente bebe 3', effect: 'leader_drink', value: 3, weight: 2 },
  { emoji: '🎴', title: 'Conta a mão', desc: 'Bebes 1 golo por cada carta que tens', effect: 'drink_per_card', value: 1, weight: 2 },

  // ---- Cartas e inventário ----
  { emoji: '🎁', title: 'Carta nova', desc: 'Ganhas uma carta', effect: 'card', value: null, weight: 3 },
  { emoji: '🪝', title: 'Carteirista', desc: 'Roubas uma carta a alguém ao acaso', effect: 'steal_card', value: null, weight: 2 },
  { emoji: '🔄', title: 'Feira da ladra', desc: 'Trocas a tua mão com a de outro jogador', effect: 'trade_cards', value: null, weight: 1 },
  { emoji: '🛡️', title: 'Imunidade', desc: 'Ficas com escudo: bloqueia a próxima carta contra ti', effect: 'shield', value: null, weight: 2 },

  // ---- Posição e vez ----
  { emoji: '🔀', title: 'Golpe de estado', desc: 'Trocas de casa com quem vai à frente', effect: 'swap_leader', value: null, weight: 1 },
  { emoji: '😴', title: 'Adormeceste', desc: 'Perdes a próxima vez', effect: 'skip', value: 1, weight: 2 },
  { emoji: '🚔', title: 'Preso!', desc: 'Vais direto para a prisão', effect: 'prison', value: null, weight: 1 },

  // ---- Efeitos com duração (os que mudam a mesa) ----
  { emoji: '🤝', title: 'Aliança', desc: 'Ficas ligado a alguém: quem beber por casa, o outro bebe metade (3 jogadas)', effect: 'alliance', value: 3, weight: 2 },
  { emoji: '📜', title: 'Roleta de Regras', desc: 'Uma regra para a mesa toda — quem falhar, bebe', effect: 'rule_roulette', value: null, weight: 3 },
  { emoji: '🪞', title: 'Espelho', desc: 'O próximo ?? de quem joga a seguir também te acerta a ti', effect: 'mirror', value: null, weight: 2 },
];

export const BOARD_PRISON = [
  { note: 'perde 1 vez', skipTurns: 1, drink: 0, back: 0, loseCard: false },
  { note: 'perde 2 vezes', skipTurns: 2, drink: 0, back: 0, loseCard: false },
  { note: 'bebe 4 golos + perde 1 vez', skipTurns: 1, drink: 4, back: 0, loseCard: false },
  { note: 'recua 3 + perde 1 vez', skipTurns: 1, drink: 0, back: 3, loseCard: false },
  { note: 'perde 1 carta + 1 vez', skipTurns: 1, drink: 0, back: 0, loseCard: true },
];

// Catálogo de cartas jogáveis. `key` liga à mecânica em board.js (CARD_EFFECTS).
// As `curse_*` são MALDIÇÕES: não se jogam contra alguém — ficam presas a uma casa
// à escolha do dono e disparam em quem lá parar (mesmo que seja o próprio).
export const BOARD_CARDS = [
  { key: 'swap', emoji: '🔁', name: 'Troca', desc: 'Trocas de casa com um jogador' },
  { key: 'back2', emoji: '⬅️', name: 'Empurrão', desc: 'Mandas alguém recuar 2 casas' },
  { key: 'prison', emoji: '⛓️', name: 'Denúncia', desc: 'Mandas alguém para a prisão' },
  { key: 'skip', emoji: '⏭️', name: 'Salta-vez', desc: 'Um jogador perde a próxima vez' },
  { key: 'shield', emoji: '🛡️', name: 'Escudo', desc: 'Bloqueia a próxima carta contra ti' },
  { key: 'drink3', emoji: '🍺', name: 'Ronda', desc: 'Obrigas alguém a beber 3 golos' },
  { key: 'steal', emoji: '🎁', name: 'Roubo', desc: 'Roubas uma carta a alguém' },
  { key: 'curse_drink', emoji: '☠️', name: 'Maldição da Golada', desc: 'Escondes numa casa: quem lá parar bebe 4 golos' },
  { key: 'curse_back', emoji: '🕳️', name: 'Maldição do Buraco', desc: 'Escondes numa casa: quem lá parar recua 3 casas' },
  { key: 'curse_prison', emoji: '👻', name: 'Maldição da Cela', desc: 'Escondes numa casa: quem lá parar vai preso' },
];

// Roleta de Regras (casa ??): regra imposta a TODOS por N jogadas. Quem falhar,
// bebe — a falha é marcada à mão por qualquer jogador (a app não ouve a mesa).
export const BOARD_RULES = [
  { text: 'Ninguém pode dizer nomes próprios', turns: 4 },
  { text: 'Proibido dizer "sim" e "não"', turns: 4 },
  { text: 'Só se fala na terceira pessoa', turns: 3 },
  { text: 'Bebe-se sempre com a mão não dominante', turns: 5 },
  { text: 'Proibido apontar com o dedo', turns: 4 },
  { text: 'Cada frase acaba com "meu capitão"', turns: 3 },
  { text: 'Proibido dizer "beber", "copo" ou "golo"', turns: 4 },
  { text: 'Quem rir alto, bebe', turns: 3 },
  { text: 'Proibido pousar o copo na mesa', turns: 5 },
  { text: 'Fala-se sempre a sussurrar', turns: 3 },
];

// Linhas para o seed da BD (board_items). Achata os três bancos numa só tabela.
export function boardItemsForSeed() {
  const rows = [];
  for (const e of BOARD_EVENTS)
    rows.push({ category: 'evento', emoji: e.emoji, title: e.title, desc: e.desc, effect: e.effect, value: e.value ?? null, skipTurns: 0, drink: 0, back: 0, loseCard: false, weight: e.weight ?? 1 });
  for (const p of BOARD_PRISON)
    rows.push({ category: 'prisao', emoji: '🚔', title: p.note, desc: '', effect: null, value: null, skipTurns: p.skipTurns, drink: p.drink, back: p.back, loseCard: p.loseCard });
  for (const c of BOARD_CARDS)
    rows.push({ category: 'carta', emoji: c.emoji, title: c.name, desc: c.desc, effect: c.key, value: null, skipTurns: 0, drink: 0, back: 0, loseCard: false });
  for (const r of BOARD_RULES)
    rows.push({ category: 'regra', emoji: '📜', title: r.text, desc: '', effect: null, value: r.turns, skipTurns: 0, drink: 0, back: 0, loseCard: false });
  return rows;
}
