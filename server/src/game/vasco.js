// ----- Jogo do Vasco (Impostor) ---------------------------------------------
//
// O grupo partilha uma PALAVRA secreta (uma de 9 num quadro visível a todos). O
// (ou os) "Vasco(s)" são impostores que NÃO sabem qual é e têm de a adivinhar
// pelas pistas que o resto vai dando à vez. No fim cada Vasco escolhe uma palavra
// do quadro: acerta → +1 vida; falha → bebe 5 golos. A palavra secreta e QUEM é
// Vasco nunca vão no broadcast até ao reveal (entrega privada por `vasco_role`).
//
// Extraído do game.js (comportamento idêntico). Depende de ./helpers.js e ../repo.js.

import * as repo from '../repo.js';
import { AppError } from '../errors.js';
import { connectedOrder, nameOf, drink, shuffle } from './helpers.js';

const VASCO_GOLOS = 5;

export async function dealVasco(room, round) {
  const board = await repo.getRandomVascoBoard();
  const words = board?.words ? [...board.words] : [];
  const secret = words[Math.floor(Math.random() * words.length)];
  const order = connectedOrder(room).map((p) => p.id);
  const k = order.length >= 6 ? 2 : 1;
  const nImp = Math.min(k, Math.max(1, order.length - 1)); // pelo menos 1 do grupo não-Vasco
  const impostorIds = shuffle([...order]).slice(0, nImp);

  round.board = { theme: board?.theme || '—', words }; // só o TEMA é público; words fica no servidor
  round.secretWord = secret; // PRIVADO (só o grupo o recebe por vasco_role)
  round.impostorIds = impostorIds; // PRIVADO durante reveal/clues
  round.impostorInfo = impostorIds.map((id) => ({ id, name: nameOf(room, id) })); // revelado no guessing
  round.clueOrder = order;
  round.clueIdx = 0;
  round.votes = {}; // voterId -> suspectId (votação de quem é o Vasco)
  round.accusedId = null; // mais votado (definido no tally)
  round.accusedName = null;
  round.redemption = null; // { by:{id,name}, word, correct } se o Vasco apanhado tentar a palavra
  round.result = null;
  round.substate = 'reveal';
}

function requireVasco(room, substates) {
  const g = room.game;
  const r = g?.round;
  if (!g || g.phase !== 'vasco' || !r || r.gameTypeKey !== 'vasco')
    throw new AppError('Não há Jogo do Vasco ativo.');
  if (substates && !substates.includes(r.substate)) throw new AppError('Não é altura disso.');
  return r;
}

/** Papel PRIVADO de um jogador: é Vasco? qual a palavra (só o grupo a vê)? */
export function vascoRole(room, playerId) {
  const r = room.game?.round;
  if (!r || r.gameTypeKey !== 'vasco') return null;
  const isImpostor = r.impostorIds.includes(playerId);
  return { isImpostor, word: isImpostor ? null : r.secretWord };
}

function skipToConnectedClue(room) {
  const r = room.game.round;
  while (r.clueIdx < r.clueOrder.length && !room.players.get(r.clueOrder[r.clueIdx])?.connected) {
    r.clueIdx += 1;
  }
  if (r.clueIdx >= r.clueOrder.length) r.substate = 'voting'; // fim das pistas → votação
}

/** Reveal → começa a ronda de pistas (host ou quem girou). */
export function vascoStartClues(room, playerId) {
  const r = requireVasco(room, ['reveal']);
  const p = room.players.get(playerId);
  if (!p || (!p.isHost && playerId !== room.game.currentPlayerId))
    throw new AppError('Só o host ou quem girou pode começar.');
  r.substate = 'clues';
  r.clueIdx = 0;
  skipToConnectedClue(room);
  return r;
}

/** O jogador da vez (ou host/quem girou) marca que já deu a sua pista. */
export function vascoClueDone(room, playerId) {
  const r = requireVasco(room, ['clues']);
  const cur = r.clueOrder[r.clueIdx];
  const p = room.players.get(playerId);
  if (!p || (playerId !== cur && !p.isHost && playerId !== room.game.currentPlayerId))
    throw new AppError('Não é a tua vez de dar pista.');
  r.clueIdx += 1;
  skipToConnectedClue(room);
  return r;
}

/** Votação: cada jogador vota em quem acha que é o Vasco (não em si). Todos → tally. */
export function vascoVote(room, voterId, suspectId) {
  const r = requireVasco(room, ['voting']);
  const voter = room.players.get(voterId);
  if (!voter || !voter.connected) throw new AppError('Jogador inválido.');
  if (voter.eliminated) throw new AppError('Estás fora — só a ver.');
  if (suspectId === voterId) throw new AppError('Não podes votar em ti próprio.');
  if (!room.players.get(suspectId)) throw new AppError('Escolhe um jogador válido.');
  r.votes[voterId] = suspectId;

  const allVoted = connectedOrder(room).every((p) => r.votes[p.id] !== undefined);
  if (allVoted) return tallyVascoVotes(room);
  return { round: r, finalized: false, winners: [] };
}

/** Apura os votos. Se o mais votado for Vasco → redenção; senão → resolve (Vascos escapam). */
export function tallyVascoVotes(room) {
  const r = room.game.round;
  const tally = {};
  for (const s of Object.values(r.votes)) tally[s] = (tally[s] || 0) + 1;
  const max = Object.values(tally).reduce((m, n) => Math.max(m, n), 0);
  const top = Object.keys(tally).filter((id) => tally[id] === max);
  r.accusedId = top.length === 1 ? top[0] : null; // empate → sem acusado claro
  r.accusedName = r.accusedId ? nameOf(room, r.accusedId) : null;

  if (r.accusedId && r.impostorIds.includes(r.accusedId)) {
    r.substate = 'redemption'; // Vasco apanhado → última hipótese (adivinhar a palavra)
    return { round: r, finalized: false, winners: [] };
  }
  const winners = buildVascoResult(room); // ninguém apanhado → Vascos escapam
  return { round: r, finalized: true, winners };
}

/** Redenção: o Vasco apanhado escolhe a palavra do quadro. Acerta → safa-se (+1 vida). */
export function vascoRedeem(room, playerId, word) {
  const r = requireVasco(room, ['redemption']);
  if (playerId !== r.accusedId) throw new AppError('Só o Vasco apanhado pode adivinhar.');
  if (!r.board.words.includes(word)) throw new AppError('Escolhe uma palavra do quadro.');
  r.redemption = { by: { id: playerId, name: nameOf(room, playerId) }, word, correct: word === r.secretWord };
  const winners = buildVascoResult(room);
  return { round: r, finalized: true, winners };
}

export function buildVascoResult(room) {
  const g = room.game;
  const r = g.round;
  const impostors = r.impostorIds.map((id) => {
    const caught = id === r.accusedId; // o acusado (se for Vasco)
    // Escapou → +1 vida. Apanhado → redenção: acerta = +1 vida, falha = 5 golos.
    const correct = caught ? !!(r.redemption && r.redemption.correct) : false;
    const outcome = !caught || correct ? 'vida' : 'golos';
    return { id, name: nameOf(room, id), caught, correct, outcome, golos: outcome === 'golos' ? VASCO_GOLOS : 0 };
  });
  const winners = [];
  for (const imp of impostors) {
    const p = room.players.get(imp.id);
    if (imp.outcome === 'vida') {
      if (p) p.lives += 1;
      winners.push({ id: imp.id, name: imp.name });
    } else {
      drink(g, imp.id, 1); // 5 golos
    }
  }
  const voteTally = Object.entries(
    Object.values(r.votes).reduce((m, s) => ((m[s] = (m[s] || 0) + 1), m), {})
  )
    .map(([id, n]) => ({ id, name: nameOf(room, id), votes: n }))
    .sort((a, b) => b.votes - a.votes);

  r.result = {
    secretWord: r.secretWord,
    theme: r.board.theme,
    golos: VASCO_GOLOS,
    accusedId: r.accusedId,
    accusedName: r.accusedName,
    redemption: r.redemption,
    voteTally,
    impostors,
  };
  r.substate = 'result';
  return winners;
}

/** Preenche `base` com os campos públicos do Vasco (palavra/impostores nunca antes do result). */
export function serializeVasco(base, r) {
  base.substate = r.substate; // reveal | clues | voting | redemption | result
  base.theme = r.board.theme; // só o TEMA é público (a pista do Vasco); as 9 palavras NÃO vão em clues
  base.clueOrder = r.clueOrder;
  base.clueIdx = r.clueIdx;
  base.clueCurrentId = r.substate === 'clues' ? r.clueOrder[r.clueIdx] || null : null;
  base.impostorCount = r.impostorIds.length; // quantos Vascos (não quem)
  base.voterIds = Object.keys(r.votes || {}); // quem já votou (não em quem)
  // O acusado só é revelado a partir da redenção; identidades no result.
  base.accused =
    ['redemption', 'result'].includes(r.substate) && r.accusedId
      ? { id: r.accusedId, name: r.accusedName }
      : null;
  base.boardWords = ['redemption', 'result'].includes(r.substate) ? r.board.words : null; // p/ a redenção
  base.result = r.substate === 'result' ? r.result : null; // palavra/Vascos/votos só aqui
}
