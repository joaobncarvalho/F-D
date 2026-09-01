// F&D — teste end-to-end do Modo Torneio, conduzido pelos bots.
//
// Os bots correm o bracket até haver campeão. Rede contra regressões no
// tournament.js: se o quadro encravar (duelo sem saída, ronda que não avança) o
// teste falha por não chegar a 'over'.

import { test } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL; // conteúdo em memória

const { RoomManager, serializeRoom } = await import('../src/rooms.js');
const tournament = await import('../src/tournament.js');
const bots = await import('../src/bots.js');

test('Torneio e2e (bots): corre o bracket até coroar um campeão', async () => {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom('AnfitriaoBot');
  host.isBot = true;
  for (let i = 0; i < 4; i++) rm.addBot(room.code); // 5 jogadores → ronda ímpar (bye)

  room.status = 'playing';
  room.mode = 'tournament';
  tournament.initTournament(room, { intensity: 'leve' });

  let leaked = false;
  let iters = 0;
  while (room.tournament.phase !== 'over' && iters++ < 3000) {
    await bots.driveBots(room);
    const d = serializeRoom(room).tournament?.duel;
    // As jogadas dos duelistas são secretas até ambos jogarem.
    if (d && (d.substate === 'daring' || d.substate === 'choosing') && d.actions !== null) leaked = true;
  }

  assert.equal(leaked, false, 'as jogadas do duelo não podem ser reveladas antes do tempo');
  assert.equal(room.tournament.phase, 'over', 'o torneio devia terminar (encravou?)');
  assert.ok(room.tournament.championId, 'devia haver campeão');
  assert.equal(room.tournament.eliminated.length, 4, 'todos menos o campeão são eliminados');
});

test('Torneio: bracket com número ímpar dá bye a um jogador', () => {
  const rm = new RoomManager();
  const { room } = rm.createRoom('Ana');
  rm.joinRoom(room.code, 'Rui');
  rm.joinRoom(room.code, 'Zé');
  const t = tournament.initTournament(room, { intensity: 'leve' });
  const first = t.rounds[0];
  assert.equal(first.length, 2, '3 jogadores → 1 duelo + 1 bye');
  const bye = first.find((m) => m.bye);
  assert.ok(bye && bye.winnerId === bye.aId, 'o bye passa automaticamente');
});
