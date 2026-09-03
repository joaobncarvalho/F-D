// F&D — helpers partilhados do motor da Roda (game.js e módulos dos mini-jogos).
// Funções puras / sem dependências de outras partes do motor → sem ciclos de import.
// (`modificadores.js` só depende de `intensity.js`, por isso não fecha ciclo.)

import * as modificadores from './modificadores.js';

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
    marcaAlvo(g, null);
    return { type: 'eliminated', playerId, lives: 0, motivo, emoji: '💀' };
  }
  // Modificador "Alvo Marcado": quem acabou de perder uma vida fica na mira da
  // ronda seguinte. Fica aqui, e não no `resolveAction`, porque agora há cinco
  // caminhos que tiram vidas (recusa, veredito, eventos) — escrito em cada um,
  // era regra esquecida em três.
  if (modificadores.ativo({ game: g }, 'alvo_marcado')) marcaAlvo(g, playerId);
  return { type: 'vida_perdida', playerId, lives: player.lives, motivo, emoji };
}

/** Nº máximo de rondas seguidas que a mesma pessoa pode ficar na mira. */
export const MAX_ALVO_SEGUIDAS = 2;

/**
 * Regista (ou limpa) quem fica na mira. O travão das repetições vive aqui: sem
 * ele, azar a dobrar punha a mesa inteira a ver uma pessoa afundar sozinha.
 */
function marcaAlvo(g, playerId) {
  if (!playerId) {
    g.alvoMarcadoId = null;
    g.alvoSeguidas = 0;
    return;
  }
  g.alvoSeguidas = g.alvoMarcadoId === playerId ? (g.alvoSeguidas || 0) + 1 : 1;
  g.alvoMarcadoId = g.alvoSeguidas <= MAX_ALVO_SEGUIDAS ? playerId : null;
  if (!g.alvoMarcadoId) g.alvoSeguidas = 0;
}

/**
 * Põe alguém fora de uma vez só, sem passar pelas vidas.
 *
 * Usado pela Morte Súbita e (a seguir) pelo Modo da Morte. NÃO conta um shot: o
 * castigo é a saída, e somar-lhe bebida seria mandar beber mais quem já estava
 * a levar com tudo — exatamente o que estes modos não devem fazer.
 *
 * @returns {{type:'eliminated', playerId, lives:0, motivo, emoji}|null}
 */
export function elimina(room, playerId, motivo = '') {
  const g = room.game;
  const player = room.players.get(playerId);
  if (!player || !g || player.eliminated) return null;
  player.lives = 0;
  player.eliminated = true;
  return { type: 'eliminated', playerId, lives: 0, motivo, emoji: '💀' };
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
