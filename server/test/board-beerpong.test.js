// F&D — Beer Pinga: dois jogadores seguidos na mesma casa.
//
// Bug do playtest: se dois jogadores caíam na casa um a seguir ao outro, o
// SEGUNDO não conseguia atirar a bola. A causa era o `lastEvent`: cair na casa
// não o limpava, por isso o cliente ainda via a revelação do tiro anterior — e o
// ecrã só deixa apontar quando não há revelação a mostrar.
//
// O teste trava exatamente isso: abrir a casa tem de deixar o estado sem
// revelação pendurada.

import { test } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL;
// A prisao tem de se aplicar JA: com o ⚖️ Tribunal pelo meio (board/tribunal.js)
// a mesa fica trancada a espera de um veredito, e estes testes deixavam de ser
// sobre o que testam. O Tribunal tem testes proprios em tribunal.test.js.
process.env.TRIBUNAL = '0'; // conteúdo em memória
process.env.AUTO_RESOLVE_MS = '0';

const { RoomManager, serializeRoom } = await import('../src/rooms.js');
const board = await import('../src/board.js');

async function tabuleiroAJogar() {
  const rm = new RoomManager();
  const { room, player: a } = rm.createRoom('Ana');
  const b = rm.joinRoom(room.code, 'Bruno').player;
  room.status = 'playing';
  await board.initBoard(room, { intensity: 'leve' });
  const bd = room.board;
  bd.phase = 'playing';
  bd.order = [a.id, b.id];
  bd.turnIndex = 0;
  bd.currentPlayerId = a.id;
  return { room, bd, a, b };
}

/** Põe o jogador a uma casa de distância de um Beer Pinga e manda-o avançar. */
async function caiNoBeerpong(room, playerId) {
  const bd = room.board;
  const idx = bd.squares.findIndex((s, i) => i > 0 && s.kind === 'beerpong');
  assert.ok(idx > 0, 'o tabuleiro tem de ter casas de Beer Pinga');
  bd.currentPlayerId = playerId;
  bd.turnIndex = bd.order.indexOf(playerId);
  bd.players[playerId].pos = idx - 1;
  bd.players[playerId].skipTurns = 0;
  await board.advance(room, playerId, 1);
}

test('Beer Pinga: cair na casa limpa a revelação do tiro anterior', async () => {
  const { room, bd, a, b } = await tabuleiroAJogar();

  await caiNoBeerpong(room, a.id);
  assert.equal(bd.pending?.kind, 'beerpong');
  board.boardBeerpong(room, a.id, 0.9); // Ana atira
  assert.ok(bd.lastEvent.beerpong, 'depois do tiro há revelação para animar');

  // Bruno cai na mesma casa a seguir.
  await caiNoBeerpong(room, b.id);
  assert.equal(bd.pending?.kind, 'beerpong', 'a casa abre para o Bruno');
  assert.equal(
    serializeRoom(room).board.lastEvent.beerpong,
    undefined,
    'a revelação da Ana não pode ficar pendurada — era isso que trancava o ecrã do Bruno'
  );

  // E o Bruno consegue mesmo atirar.
  board.boardBeerpong(room, b.id, 0.2);
  assert.ok(bd.lastEvent.beerpong, 'o segundo tiro resolve-se normalmente');
  assert.equal(bd.pending, null);
});

test('Beer Pinga: a força escolhe a fila e bebe-se sempre a base', async () => {
  const { room, bd, a } = await tabuleiroAJogar();
  const golosAntes = bd.players[a.id].golos;

  await caiNoBeerpong(room, a.id);
  board.boardBeerpong(room, a.id, 0.1); // pouca força → fila da frente
  const rev = bd.lastEvent.beerpong;
  assert.equal(rev.row, 0);
  assert.equal(rev.base, 2, 'a fila da frente custa 2 golos de base');
  assert.ok(bd.players[a.id].golos >= golosAntes + 2, 'nenhum copo é neutro');
});
