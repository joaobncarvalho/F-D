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

/**
 * Tira uma vida a um jogador e devolve o efeito para o cliente animar.
 *
 * Existia só dentro do `resolveAction` (recusar um desafio). Agora que falhar um
 * desafio a tempo e certos eventos da noite também custam vidas, passa a haver um
 * sítio só — senão a regra "sem vidas → eliminado, com shot" ficava escrita em
 * três sítios e mudava em dois.
 *
 * @returns {{type:'vida_perdida'|'eliminated', playerId, lives}}
 */
export function perdeVida(room, playerId, { motivo = '', emoji = '💔' } = {}) {
  const g = room.game;
  const player = room.players.get(playerId);
  if (!player || !g) return null;
  // Trégua (evento bom da noite): bebe-se na mesma, mas não se perdem vidas.
  // A verificação vive AQUI e não em cada chamador — era exatamente assim que
  // uma regra destas ficava esquecida num dos caminhos.
  if ((g.tregua || 0) > 0) return { type: 'tregua', playerId, lives: player.lives };
  const st = statsFor(g, playerId);

  player.lives = Math.max(0, player.lives - 1);
  if (player.lives === 0) {
    player.eliminated = true; // sem vidas → fora (telemóvel partido)
    st.shots += 1; // o "shot" fatal
    return { type: 'eliminated', playerId, lives: 0, motivo, emoji: '💀' };
  }
  return { type: 'vida_perdida', playerId, lives: player.lives, motivo, emoji };
}

/** Devolve uma vida (eventos bons, prémios). Nunca ressuscita quem já saiu. */
export function ganhaVida(room, playerId) {
  const player = room.players.get(playerId);
  if (!player || player.eliminated) return null;
  player.lives += 1;
  return { type: 'vida_extra', playerId, lives: player.lives, name: player.name };
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
