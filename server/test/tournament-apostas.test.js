// F&D — Torneio: apostas, final à melhor de 3 e cara ou coroa.
//
// Com 6 pessoas o modo tinha um problema simples: três eram eliminadas na
// primeira ronda e ficavam o resto do tempo a olhar. As apostas põem toda a mesa
// (incluindo quem já saiu) a jogar em cada duelo, e a final à melhor de 3 dá
// peso ao fim. Aqui garante-se que isso funciona mesmo — e que as apostas ficam
// secretas até ao resultado, senão apostava toda a gente no mesmo.

import { test } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL; // conteúdo em memória
process.env.AUTO_RESOLVE_MS = '0';

const { RoomManager, serializeRoom } = await import('../src/rooms.js');
const tournament = await import('../src/tournament.js');

/** Sala com N jogadores, já em modo torneio. */
function torneio(n = 6) {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom('Ana');
  const outros = ['Bruno', 'Carla', 'Duarte', 'Eva', 'Filipe']
    .slice(0, n - 1)
    .map((nome) => rm.joinRoom(room.code, nome).player);
  room.status = 'playing';
  tournament.initTournament(room, { intensity: 'leve' });
  return { rm, room, host, todos: [host, ...outros] };
}

const duelo = (room) => room.tournament.duel;
const espetadores = (room) =>
  [...room.players.values()].filter((p) => ![duelo(room).aId, duelo(room).bId].includes(p.id));

/**
 * Põe o duelo em curso num tipo DETERMINÍSTICO (aceitar/recusar). Sem isto os
 * testes eram instáveis: se calhasse o cara-ou-coroa, quem ganhava era a moeda e
 * não quem o teste mandava ganhar.
 */
function normaliza(room) {
  const d = duelo(room);
  if (d.substate === 'daring') return;
  d.gameTypeKey = 'desafio';
  d.substate = 'daring';
  d.actions = {};
  d.coin = null;
  d.text = 'desafio de teste';
}

/** Resolve o duelo em curso a favor de `winnerId`, seja qual for o tipo. */
function resolve(room, winnerId) {
  const t = room.tournament;
  const d = t.duel;
  const loserId = winnerId === d.aId ? d.bId : d.aId;
  if (d.substate === 'daring') {
    tournament.tournamentAction(room, loserId, 'refuse');
    tournament.tournamentAction(room, winnerId, 'accept');
  } else if (d.substate === 'choosing') {
    tournament.tournamentChoose(room, d.aId, 0);
    tournament.tournamentChoose(room, d.bId, 1);
    if (d.substate === 'judging') {
      for (const p of espetadores(room)) tournament.tournamentVote(room, p.id, winnerId);
    }
  } else if (d.substate === 'racing') {
    d.reaction.goAt = Date.now() - 1;
    tournament.tournamentTap(room, winnerId);
    tournament.tournamentTap(room, loserId);
  } else if (d.substate === 'calling') {
    tournament.tournamentCall(room, d.aId, 'cara');
  }
  return t.duel.result;
}

test('Torneio: os espetadores apostam e quem erra bebe', async () => {
  const { room, host } = torneio(6);
  await tournament.tournamentNext(room, host.id);
  normaliza(room);
  const d = duelo(room);
  const publico = espetadores(room);
  assert.equal(publico.length, 4, 'com 6 jogadores sobram 4 a assistir');

  // Metade aposta em cada lado.
  tournament.tournamentBet(room, publico[0].id, d.aId);
  tournament.tournamentBet(room, publico[1].id, d.aId);
  tournament.tournamentBet(room, publico[2].id, d.bId);

  // Antes do resultado, as apostas são SEGREDO (só se sabe quem já apostou).
  const meio = serializeRoom(room).tournament.duel;
  assert.equal(meio.bets, null, 'as apostas não podem ir no payload antes do fim');
  assert.deepEqual(meio.betters.sort(), [publico[0].id, publico[1].id, publico[2].id].sort());

  // Regras da aposta.
  assert.throws(() => tournament.tournamentBet(room, d.aId, d.aId), /duelistas não apostam/i);
  assert.throws(() => tournament.tournamentBet(room, publico[0].id, d.bId), /já apostaste/i);

  const res = resolve(room, d.aId);
  assert.deepEqual(res.apostas.certos.map((x) => x.id).sort(), [publico[0].id, publico[1].id].sort());
  assert.deepEqual(res.apostas.errados.map((x) => x.id), [publico[2].id]);
  assert.equal(room.tournament.stats[publico[2].id].drinks, res.apostas.golos, 'quem apostou mal bebeu');
  assert.equal(room.tournament.stats[publico[0].id].betsWon, 1, 'quem acertou fica com o crédito');

  const fim = serializeRoom(room).tournament.duel;
  assert.ok(fim.bets, 'no resultado as apostas ficam à vista');
});

test('Torneio: quem já foi eliminado continua a apostar', async () => {
  const { room, host } = torneio(4);
  await tournament.tournamentNext(room, host.id);
  normaliza(room);
  const primeiro = duelo(room);
  const eliminado = primeiro.bId;
  resolve(room, primeiro.aId);
  await tournament.tournamentContinue(room, primeiro.aId);

  await tournament.tournamentNext(room, host.id);
  assert.ok(
    ![duelo(room).aId, duelo(room).bId].includes(eliminado),
    'o eliminado não volta a duelar'
  );
  tournament.tournamentBet(room, eliminado, duelo(room).aId); // mas continua no jogo
  assert.equal(duelo(room).bets[eliminado], duelo(room).aId);
});

test('Torneio: a final é à melhor de 3 e não elimina à primeira', async () => {
  const { room, host } = torneio(4);

  // Semifinais.
  for (let i = 0; i < 2; i++) {
    await tournament.tournamentNext(room, host.id);
    normaliza(room);
    const d = duelo(room);
    resolve(room, d.aId);
    assert.equal(d.result.seriesOngoing, undefined, 'nas semifinais fecha-se logo');
    await tournament.tournamentContinue(room, d.aId);
  }

  // Final: primeira vitória NÃO elimina ninguém.
  await tournament.tournamentNext(room, host.id);
  normaliza(room);
  const finalA = duelo(room).aId;
  const finalB = duelo(room).bId;
  const r1 = resolve(room, finalA);
  assert.equal(r1.seriesOngoing, true, 'a final continua');
  assert.equal(r1.series.need, 2);
  assert.equal(room.tournament.eliminated.length, 2, 'ainda ninguém saiu da final');

  // Continuar reabre o MESMO encontro em vez de voltar ao quadro.
  await tournament.tournamentContinue(room, finalA);
  assert.equal(room.tournament.phase, 'duel', 'a série reabre');
  assert.deepEqual([duelo(room).aId, duelo(room).bId].sort(), [finalA, finalB].sort());

  // Segunda vitória fecha.
  normaliza(room);
  const r2 = resolve(room, finalA);
  assert.ok(!r2.seriesOngoing, 'com 2 vitórias, acabou');
  await tournament.tournamentContinue(room, finalA);
  await tournament.tournamentNext(room, host.id);
  assert.equal(room.tournament.championId, finalA, 'campeão coroado');
});

test('Torneio: cara ou coroa é lançado pela app e decide o duelo', async () => {
  const { room, host } = torneio(4);
  await tournament.tournamentNext(room, host.id);
  const d = duelo(room);
  d.gameTypeKey = 'cara_coroa'; // força o tipo (o sorteio é aleatório)
  d.substate = 'calling';
  d.coin = null;

  assert.throws(() => tournament.tournamentCall(room, d.bId, 'cara'), /sorteado/i);
  tournament.tournamentCall(room, d.aId, 'coroa');

  const s = serializeRoom(room).tournament.duel;
  assert.ok(['cara', 'coroa'].includes(s.coin.face), 'a moeda é lançada no servidor');
  assert.equal(s.result.how, 'moeda');
  assert.equal(s.result.winnerId, s.coin.face === 'coroa' ? d.aId : d.bId);
});
