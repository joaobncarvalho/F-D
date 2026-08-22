// F&D — helpers partilhados do motor da Roda (game.js e módulos dos mini-jogos).
// Funções puras / sem dependências de outras partes do motor → sem ciclos de import.

// Jogadores ATIVOS (ligados e não eliminados) por ordem de entrada. É a base das
// vezes, votações e distribuições — eliminados (sem vidas) ficam a ver.
export function connectedOrder(room) {
  return [...room.players.values()]
    .filter((p) => p.connected && !p.eliminated)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
}

export function statsFor(game, playerId) {
  return (game.stats[playerId] ||= { drinks: 0, refusals: 0, shots: 0 });
}

export function drink(game, playerId, n = 1) {
  statsFor(game, playerId).drinks += n;
}

export function nameOf(room, id) {
  return room.players.get(id)?.name;
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
