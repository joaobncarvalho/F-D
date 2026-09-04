// F&D — teste end-to-end do Modo Tabuleiro, conduzido pelos bots.
//
// Os bots escolhem peão, lançam a ordem e correm o tabuleiro (resolvendo casas:
// mini/gamble/blackjack/beerpong/??) até alguém dar a volta. Rede contra
// regressões ao mexer no board.js: se encravar ou rebentar, o teste falha.

import { test } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL;
// A prisao tem de se aplicar JA: com o ⚖️ Tribunal pelo meio (board/tribunal.js)
// a mesa fica trancada a espera de um veredito, e estes testes deixavam de ser
// sobre o que testam. O Tribunal tem testes proprios em tribunal.test.js.
process.env.TRIBUNAL = '0'; // conteúdo em memória

const { RoomManager, serializeRoom } = await import('../src/rooms.js');
const board = await import('../src/board.js');
const bots = await import('../src/bots.js');

test('Tabuleiro e2e (bots): corre até ao fim sem encravar nem expor cartas', async () => {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom('AnfitriaoBot');
  rm.addBot(room.code);
  rm.addBot(room.code);
  rm.addBot(room.code); // 4 jogadores
  host.isBot = true;

  room.status = 'playing';
  await board.initBoard(room, { intensity: 'leve' });

  const seenPending = new Set();
  let leaked = false;
  let iters = 0;
  while (room.board.phase !== 'over' && iters++ < 6000) {
    if (room.board.pending) seenPending.add(room.board.pending.kind);
    await bots.driveBots(room);
    // As cartas de cada jogador nunca podem ir no broadcast (só a contagem).
    const sb = serializeRoom(room).board;
    if (sb) for (const pl of Object.values(sb.players || {})) if ('cards' in pl) leaked = true;
  }

  assert.equal(leaked, false, 'as cartas do tabuleiro não podem ir no broadcast');
  assert.equal(room.board.phase, 'over', `o tabuleiro devia terminar (ficou em "${room.board.phase}" — encravou?)`);
  assert.ok(room.board.winnerId, 'devia haver vencedor no fim');
  // Passou por casas interativas (pelo menos uma das especiais).
  assert.ok(seenPending.size > 0, 'os bots deviam ter caído em casas interativas');
});
