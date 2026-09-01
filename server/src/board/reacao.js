// ----- Casa de Reação (Tabuleiro) --------------------------------------------
//
// Duelo relâmpago: quem calha na casa desafia outro jogador ao acaso. Conta
// decrescente com atraso aleatório e ganha quem carregar primeiro depois do GO.
// Quem perde bebe; quem ganha avança uma casa. Falso arranque = derrota direta.
//
// Reutiliza o motor puro de `game/reacao.js` (o mesmo da Roda e do Torneio) —
// a mecânica é uma só, muda o que está em jogo.

import { AppError } from '../errors.js';
import { createReaction, tapReaction, finishReaction, reactionRanking } from '../game/reacao.js';
import { requireBoard, nameOf, checkWin, activeIds, advanceBoardTurn } from './core.js';

const GOLOS_PERDEDOR = 4;

/** Abre o duelo: escolhe adversário ao acaso entre os jogadores ativos. */
export function openReacao(room, playerId) {
  const b = room.board;
  const rivais = activeIds(room).filter((id) => id !== playerId);
  if (!rivais.length) {
    // Sozinho não há duelo — a casa fica neutra e a vez passa.
    b.lastEvent = { text: '⚡ Reação sem adversário — casa neutra.' };
    advanceBoardTurn(room);
    return null;
  }
  const opponentId = rivais[Math.floor(Math.random() * rivais.length)];
  b.pending = {
    kind: 'reacao',
    playerId,
    opponentId,
    reaction: createReaction([playerId, opponentId]),
  };
  b.lastEvent = { text: `⚡ ${nameOf(room, playerId)} desafia ${nameOf(room, opponentId)} — primeiro a carregar!` };
  return b.pending;
}

/** Um toque de um dos dois duelistas. Resolve quando ambos responderem. */
export function boardReacao(room, playerId) {
  const b = requireBoard(room, ['playing']);
  const p = b.pending;
  if (!p || p.kind !== 'reacao') throw new AppError('Não há duelo de reação.');
  if (![p.playerId, p.opponentId].includes(playerId)) throw new AppError('Não estás neste duelo.');
  const res = tapReaction(p.reaction, playerId);
  if (!res.ok) throw new AppError('Já carregaste.');
  if (p.reaction.done) resolveReacao(room);
  return res;
}

/** Fecha o duelo: o pior classificado bebe; o vencedor avança uma casa. */
export function resolveReacao(room) {
  const b = room.board;
  const p = b.pending;
  if (!p || p.kind !== 'reacao') return b;
  finishReaction(p.reaction);
  const ranking = reactionRanking(p.reaction);
  const vencedor = ranking[0];
  const perdedor = ranking[ranking.length - 1];

  const loser = b.players[perdedor.id];
  if (loser) loser.golos += GOLOS_PERDEDOR;

  const winner = vencedor && vencedor.id !== perdedor.id ? b.players[vencedor.id] : null;
  if (winner && !vencedor.early && !vencedor.missed) winner.pos = Math.min(b.size, winner.pos + 1);

  b.lastEvent = {
    text: perdedor.early
      ? `⚡ ${nameOf(room, perdedor.id)} carregou cedo demais — bebe ${GOLOS_PERDEDOR} golos!`
      : `⚡ ${nameOf(room, perdedor.id)} foi mais lento — bebe ${GOLOS_PERDEDOR} golos!`,
  };
  b.pending = null;
  if (winner && !checkWin(room, vencedor.id)) advanceBoardTurn(room);
  else if (!winner) advanceBoardTurn(room);
  return b;
}

/** Já passou a janela de resposta? (o auto-avanço do tabuleiro trata do resto) */
export function serializeReacaoPending(pending) {
  return {
    kind: 'reacao',
    playerId: pending.playerId,
    opponentId: pending.opponentId,
    goAt: pending.reaction.goAt,
    tapped: Object.keys(pending.reaction.taps),
    falseStarts: pending.reaction.falseStarts,
  };
}
