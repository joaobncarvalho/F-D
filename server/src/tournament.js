// F&D — Modo Torneio. Bracket eliminatório rápido que reaproveita os mini-jogos
// RÁPIDOS da Roda (boca_calada / desafio / isto_ou_aquilo) — mesmo conteúdo, via
// repo.getRandomPrompt. Aqui NÃO há vidas: cada duelo elimina um dos dois. Quem
// sobra no fim é coroado rei/rainha da noite.
//
// Fluxo:  bracket (ver o quadro) → duel (duelo a decorrer) → over (campeão)
//
// Cada duelo sorteia um dos três mini-jogos e aplica-o SÓ aos dois duelistas:
//   • boca_calada / desafio → cada um aceita ou recusa. Quem recusa (sozinho) é
//     eliminado; se ambos fizerem o mesmo, desempata-se à sorte (moeda ao ar).
//   • isto_ou_aquilo → cada um escolhe uma opção em segredo e os ESPETADORES
//     votam quem teve mais coragem; empate (ou mesa sem espetadores) → sorteio.
//
// `room.tournament` vive em paralelo com `room.game`/`room.board` e é limpo pelo
// resetToLobby (game.js), tal como os outros modos.

import { randomUUID } from 'node:crypto';
import * as repo from './repo.js';
import { AppError } from './errors.js';
import { shuffle, nameOf } from './game/helpers.js';

const DUEL_TYPES = ['boca_calada', 'desafio', 'isto_ou_aquilo'];
const REFUSE_GOLOS = 3; // quem recusa (e cai) bebe
const TIEBREAK_GOLOS = 2; // ambos fizeram o mesmo → os dois bebem antes do sorteio

function connectedPlayers(room) {
  return [...room.players.values()]
    .filter((p) => p.connected)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
}

function statsFor(t, playerId) {
  return (t.stats[playerId] ||= { drinks: 0, wins: 0, duels: 0 });
}
function drink(t, playerId, n) {
  statsFor(t, playerId).drinks += n;
}

/** Monta uma ronda de bracket a partir de uma lista de ids (bye se for ímpar). */
function buildRound(ids) {
  const matches = [];
  const pool = [...ids];
  // Número ímpar → o último fica com bye (passa automaticamente).
  const bye = pool.length % 2 === 1 ? pool.pop() : null;
  for (let i = 0; i < pool.length; i += 2) {
    matches.push({ id: randomUUID(), aId: pool[i], bId: pool[i + 1], winnerId: null, bye: false });
  }
  if (bye) matches.push({ id: randomUUID(), aId: bye, bId: null, winnerId: bye, bye: true });
  return matches;
}

export function initTournament(room, { intensity = 'leve' } = {}) {
  const players = connectedPlayers(room);
  if (players.length < 2) throw new AppError('São precisos pelo menos 2 jogadores.');
  const ids = shuffle(players.map((p) => p.id)); // sorteio do quadro
  room.mode = 'tournament';
  room.tournament = {
    phase: 'bracket',
    intensity: ['picante', 'hardcore', 'caos'].includes(intensity) ? intensity : 'leve',
    rounds: [buildRound(ids)],
    roundIdx: 0,
    matchIdx: 0,
    duel: null, // estado do duelo em curso
    eliminated: [], // { id, name, roundIdx }
    championId: null,
    stats: {},
    lastResult: null, // resumo do último duelo (para o ecrã do bracket)
  };
  return room.tournament;
}

function requireTournament(room, phases) {
  const t = room.tournament;
  if (!t) throw new AppError('Não há torneio ativo.');
  if (phases && !phases.includes(t.phase)) throw new AppError('Não é altura disso.');
  return t;
}

function currentRound(t) {
  return t.rounds[t.roundIdx] || [];
}

/** Próximo duelo por jogar nesta ronda (salta byes e já resolvidos). */
function nextPendingMatch(t) {
  const round = currentRound(t);
  for (let i = 0; i < round.length; i++) {
    if (!round[i].winnerId) return i;
  }
  return -1;
}

/**
 * Arranca o próximo duelo (host ou qualquer duelista). Se a ronda acabou, monta
 * a ronda seguinte; se sobrar um só, coroa o campeão.
 */
export async function tournamentNext(room, playerId) {
  const t = requireTournament(room, ['bracket']);
  const p = room.players.get(playerId);
  if (!p) throw new AppError('Jogador inválido.');

  let idx = nextPendingMatch(t);
  if (idx === -1) {
    // Ronda cheia → apura os vencedores e avança de ronda (ou termina).
    const winners = currentRound(t).map((m) => m.winnerId).filter(Boolean);
    if (winners.length <= 1) {
      t.championId = winners[0] || null;
      t.phase = 'over';
      room.status = 'ended';
      return t;
    }
    t.rounds.push(buildRound(winners));
    t.roundIdx += 1;
    idx = nextPendingMatch(t);
    if (idx === -1) throw new AppError('O quadro ficou sem duelos.');
  }

  const match = currentRound(t)[idx];
  t.matchIdx = idx;
  await openDuel(room, t, match);
  return t;
}

async function openDuel(room, t, match) {
  const key = DUEL_TYPES[Math.floor(Math.random() * DUEL_TYPES.length)];
  const prompt = await repo.getRandomPrompt(key, t.intensity);
  const duel = {
    matchId: match.id,
    gameTypeKey: key,
    aId: match.aId,
    aName: nameOf(room, match.aId),
    bId: match.bId,
    bName: nameOf(room, match.bId),
    substate: key === 'isto_ou_aquilo' ? 'choosing' : 'daring', // daring|choosing → judging → result
    actions: {}, // playerId -> 'accept'|'refuse' (daring) ou 0|1 (choosing)
    votes: {}, // espetador -> duelista (só no isto_ou_aquilo)
    result: null,
  };
  if (key === 'isto_ou_aquilo') {
    const parts = String(prompt?.text || '||').split('||');
    duel.options = [(parts[0] || '—').trim(), (parts[1] || '—').trim()];
  } else {
    duel.text = prompt?.text || '—';
  }
  t.duel = duel;
  t.phase = 'duel';
  statsFor(t, match.aId).duels += 1;
  statsFor(t, match.bId).duels += 1;
  return duel;
}

function spectators(room, t) {
  const d = t.duel;
  return [...room.players.values()].filter((p) => p.connected && p.id !== d.aId && p.id !== d.bId);
}

/** Fecha o duelo: aplica o vencedor ao quadro e elimina o perdedor. */
function finishDuel(room, t, winnerId, how) {
  const d = t.duel;
  const loserId = winnerId === d.aId ? d.bId : d.aId;
  const match = currentRound(t).find((m) => m.id === d.matchId);
  if (match) match.winnerId = winnerId;
  statsFor(t, winnerId).wins += 1;
  t.eliminated.push({ id: loserId, name: nameOf(room, loserId), roundIdx: t.roundIdx });
  d.result = {
    winnerId,
    winnerName: nameOf(room, winnerId),
    loserId,
    loserName: nameOf(room, loserId),
    how, // 'recusou' | 'sorteio' | 'votacao'
    actions: d.actions,
  };
  d.substate = 'result';
  t.lastResult = { ...d.result, gameTypeKey: d.gameTypeKey };
  return d;
}

/** Boca Calada / Desafio: cada duelista aceita ou recusa. */
export function tournamentAction(room, playerId, action) {
  const t = requireTournament(room, ['duel']);
  const d = t.duel;
  if (d.substate !== 'daring') throw new AppError('Não é altura de aceitar/recusar.');
  if (![d.aId, d.bId].includes(playerId)) throw new AppError('Só os duelistas jogam este duelo.');
  if (d.actions[playerId]) throw new AppError('Já jogaste.');
  d.actions[playerId] = action === 'refuse' ? 'refuse' : 'accept';
  if (!d.actions[d.aId] || !d.actions[d.bId]) return t;

  const aRefused = d.actions[d.aId] === 'refuse';
  const bRefused = d.actions[d.bId] === 'refuse';
  if (aRefused !== bRefused) {
    const loserId = aRefused ? d.aId : d.bId;
    drink(t, loserId, REFUSE_GOLOS);
    finishDuel(room, t, aRefused ? d.bId : d.aId, 'recusou');
    return t;
  }
  // Empate (ambos aceitaram ou ambos recusaram) → os dois bebem e a moeda decide.
  drink(t, d.aId, TIEBREAK_GOLOS);
  drink(t, d.bId, TIEBREAK_GOLOS);
  finishDuel(room, t, Math.random() < 0.5 ? d.aId : d.bId, 'sorteio');
  return t;
}

/** Isto ou Aquilo: cada duelista escolhe uma opção (secreta até ambos jogarem). */
export function tournamentChoose(room, playerId, index) {
  const t = requireTournament(room, ['duel']);
  const d = t.duel;
  if (d.substate !== 'choosing') throw new AppError('Não é altura de escolher.');
  if (![d.aId, d.bId].includes(playerId)) throw new AppError('Só os duelistas escolhem.');
  if (d.actions[playerId] !== undefined) throw new AppError('Já escolheste.');
  const i = Number(index);
  if (i !== 0 && i !== 1) throw new AppError('Escolha inválida.');
  d.actions[playerId] = i;
  if (d.actions[d.aId] === undefined || d.actions[d.bId] === undefined) return t;

  // Sem espetadores (mesa de 2) não há júri → moeda ao ar.
  if (!spectators(room, t).length) {
    finishDuel(room, t, Math.random() < 0.5 ? d.aId : d.bId, 'sorteio');
    return t;
  }
  d.substate = 'judging';
  return t;
}

/** Isto ou Aquilo: os espetadores votam quem teve mais coragem. */
export function tournamentVote(room, voterId, duelistId) {
  const t = requireTournament(room, ['duel']);
  const d = t.duel;
  if (d.substate !== 'judging') throw new AppError('Ainda não há nada para votar.');
  if ([d.aId, d.bId].includes(voterId)) throw new AppError('Os duelistas não votam.');
  if (!room.players.get(voterId)) throw new AppError('Jogador inválido.');
  if (![d.aId, d.bId].includes(duelistId)) throw new AppError('Vota num dos duelistas.');
  d.votes[voterId] = duelistId;

  const jury = spectators(room, t).map((p) => p.id);
  if (!jury.every((id) => d.votes[id])) return t;
  const va = Object.values(d.votes).filter((v) => v === d.aId).length;
  const vb = Object.values(d.votes).filter((v) => v === d.bId).length;
  if (va === vb) {
    finishDuel(room, t, Math.random() < 0.5 ? d.aId : d.bId, 'sorteio');
  } else {
    finishDuel(room, t, va > vb ? d.aId : d.bId, 'votacao');
  }
  drink(t, d.result.loserId, REFUSE_GOLOS);
  return t;
}

/** Fecha o duelo resolvido e volta ao quadro (host ou um dos duelistas). */
export function tournamentContinue(room, playerId) {
  const t = requireTournament(room, ['duel']);
  const d = t.duel;
  if (d.substate !== 'result') throw new AppError('O duelo ainda não terminou.');
  const p = room.players.get(playerId);
  if (!p || (!p.isHost && ![d.aId, d.bId].includes(playerId)))
    throw new AppError('Só o host ou os duelistas podem continuar.');
  t.duel = null;
  t.phase = 'bracket';
  return t;
}

/** Host: dá o duelo por resolvido à sorte (duelista AFK / a mesa quer avançar). */
export function tournamentSkip(room, hostId) {
  const t = requireTournament(room, ['duel', 'bracket']);
  const host = room.players.get(hostId);
  if (!host || !host.isHost) throw new AppError('Só o host pode saltar.');
  if (t.phase === 'duel' && t.duel && t.duel.substate !== 'result') {
    finishDuel(room, t, Math.random() < 0.5 ? t.duel.aId : t.duel.bId, 'sorteio');
  }
  return t;
}

/** Host: termina já — campeão = quem tiver ganho mais duelos (empate: o 1.º). */
export function tournamentEnd(room, hostId) {
  const t = requireTournament(room);
  const host = room.players.get(hostId);
  if (!host || !host.isHost) throw new AppError('Só o host pode terminar.');
  const alive = [...room.players.values()].filter((p) => !t.eliminated.some((e) => e.id === p.id));
  const best = alive.sort((a, b) => (t.stats[b.id]?.wins || 0) - (t.stats[a.id]?.wins || 0))[0];
  t.championId = best?.id || null;
  t.duel = null;
  t.phase = 'over';
  room.status = 'ended';
  return t;
}

/**
 * Desconexão: um duelista que desaparece a meio perde por W.O. — o torneio não
 * pode ficar preso à espera de quem já não está.
 */
export function tournamentOnDisconnect(room, playerId) {
  const t = room.tournament;
  if (!t || t.phase !== 'duel' || !t.duel) return;
  const d = t.duel;
  if (![d.aId, d.bId].includes(playerId)) return;
  if (d.substate === 'result') return;
  finishDuel(room, t, playerId === d.aId ? d.bId : d.aId, 'desistiu');
}

function serializeDuel(room, t) {
  const d = t.duel;
  if (!d) return null;
  const revealed = d.substate === 'judging' || d.substate === 'result';
  return {
    matchId: d.matchId,
    gameTypeKey: d.gameTypeKey,
    aId: d.aId,
    aName: d.aName,
    bId: d.bId,
    bName: d.bName,
    substate: d.substate,
    text: d.text || null,
    options: d.options || null,
    // As jogadas são SEGREDO até ambos jogarem — senão o segundo copiava o primeiro.
    played: Object.keys(d.actions),
    actions: revealed ? d.actions : null,
    voters: Object.keys(d.votes),
    result: d.result,
  };
}

export function serializeTournament(room) {
  const t = room.tournament;
  if (!t) return null;
  const label = (id) => (id ? { id, name: nameOf(room, id) } : null);
  return {
    phase: t.phase,
    intensity: t.intensity,
    roundIdx: t.roundIdx,
    rounds: t.rounds.map((round) =>
      round.map((m) => ({
        id: m.id,
        a: label(m.aId),
        b: label(m.bId),
        winnerId: m.winnerId,
        bye: m.bye,
      }))
    ),
    eliminated: t.eliminated,
    champion: t.championId ? { id: t.championId, name: nameOf(room, t.championId) } : null,
    duel: serializeDuel(room, t),
    lastResult: t.lastResult,
    stats: Object.entries(t.stats).map(([id, s]) => ({ id, name: nameOf(room, id), ...s })),
  };
}
