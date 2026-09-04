// F&D — testes das mecânicas novas do Modo Tabuleiro (aliança, leilão, roleta de
// regras, espelho e cartas de maldição). Sem rede e sem BD: mexem no estado do
// tabuleiro diretamente para forçar cada situação.

import { test } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL;
// A prisao tem de se aplicar JA: com o ⚖️ Tribunal pelo meio (board/tribunal.js)
// a mesa fica trancada a espera de um veredito, e estes testes deixavam de ser
// sobre o que testam. O Tribunal tem testes proprios em tribunal.test.js.
process.env.TRIBUNAL = '0';

const { RoomManager, serializeRoom } = await import('../src/rooms.js');
const board = await import('../src/board.js');
const evento = await import('../src/board/evento.js');

async function makeBoard(names) {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom(names[0]);
  const players = [host];
  for (const n of names.slice(1)) players.push(rm.joinRoom(room.code, n).player);
  room.status = 'playing';
  await board.initBoard(room, { intensity: 'leve' });
  const b = room.board;
  for (const p of players) b.players[p.id].pawn = '🦊';
  b.order = players.map((p) => p.id);
  b.currentPlayerId = players[0].id;
  b.phase = 'playing';
  return { room, b, players };
}

test('Aliança: quem bebe por efeito de casa faz o aliado beber metade (p/ cima)', async () => {
  const { room, b, players } = await makeBoard(['Ana', 'Rui', 'Zé']);
  const [ana, rui] = players;
  b.players[ana.id].allianceWith = rui.id;
  b.players[ana.id].allianceTurnsLeft = 3;
  b.players[rui.id].allianceWith = ana.id;
  b.players[rui.id].allianceTurnsLeft = 3;

  b.pending = { kind: 'evento', playerId: ana.id, cards: [{ effect: 'drink', value: 3, emoji: '🍺', title: 'Golada', desc: '' }] };
  evento.boardEventoPick(room, ana.id, 0);

  assert.equal(b.players[ana.id].golos, 3, 'a Ana bebe os 3 golos da casa');
  assert.equal(b.players[rui.id].golos, 2, 'o aliado bebe metade arredondada para cima (2)');
});

test('Espelho: o ?? seguinte do jogador marcado também acerta em quem armou', async () => {
  const { room, b, players } = await makeBoard(['Ana', 'Rui', 'Zé']);
  const [ana, rui] = players;
  b.players[ana.id].mirrorOf = rui.id; // a Ana armou o espelho sobre o Rui

  b.pending = { kind: 'evento', playerId: rui.id, cards: [{ effect: 'drink', value: 4, emoji: '🍺', title: 'Golada', desc: '' }] };
  b.currentPlayerId = rui.id;
  evento.boardEventoPick(room, rui.id, 0);

  assert.equal(b.players[rui.id].golos, 4);
  assert.equal(b.players[ana.id].golos, 4, 'o espelho replicou o efeito na Ana');
  assert.equal(b.players[ana.id].mirrorOf, null, 'o espelho é de uso único');
});

test('Leilão: maior licitação avança e bebe; as licitações são secretas até fechar', async () => {
  const { room, b, players } = await makeBoard(['Ana', 'Rui', 'Zé']);
  const [ana, rui, ze] = players;
  b.pending = { kind: 'auction', playerId: ana.id, squares: 3, maxBid: 6, bids: {} };

  board.boardBid(room, ana.id, 2);
  const mid = serializeRoom(room).board.pending;
  assert.equal(mid.kind, 'auction');
  assert.ok(!('bids' in mid), 'as licitações não podem ir no broadcast antes de fechar');
  assert.deepEqual(mid.bidders, [ana.id]);

  board.boardBid(room, rui.id, 5);
  board.boardBid(room, ze.id, 1);

  assert.equal(b.pending, null, 'o leilão fecha quando todos licitam');
  assert.equal(b.players[rui.id].pos, 3, 'o vencedor avança 3 casas');
  assert.equal(b.players[rui.id].golos, 5, 'e bebe o que licitou');
  assert.equal(b.players[ana.id].pos, 0, 'quem perdeu não avança nem bebe');
});

test('Roleta de Regras: a regra entra em vigor, marca-se a falha e expira', async () => {
  const { room, b, players } = await makeBoard(['Ana', 'Rui']);
  const [ana, rui] = players;
  b.pending = { kind: 'evento', playerId: ana.id, cards: [{ effect: 'rule_roulette', emoji: '📜', title: 'Regra', desc: '' }] };
  evento.boardEventoPick(room, ana.id, 0);

  const rule = b.activeRules[0];
  assert.ok(rule?.text, 'ficou uma regra ativa');
  const remainingAfterPick = rule.remaining;

  board.boardRuleFail(room, ana.id, rule.id, rui.id);
  assert.ok(b.players[rui.id].golos > 0, 'quem falhou a regra bebeu');

  for (let i = 0; i < remainingAfterPick; i++) board.boardHostSkip(room, ana.id);
  assert.equal(b.activeRules.length, 0, 'a regra expira ao fim das jogadas');
});

test('Maldição: fica presa numa casa e dispara em quem lá parar', async () => {
  const { room, b, players } = await makeBoard(['Ana', 'Rui']);
  const [ana, rui] = players;
  b.players[ana.id].cards = [{ id: 'c1', key: 'curse_drink' }];
  board.playCard(room, ana.id, 'c1', null, 5);

  assert.equal(b.trapCards.length, 1, 'a maldição ficou no tabuleiro');
  const pub = serializeRoom(room).board;
  assert.equal(pub.trapCount, 1);
  assert.ok(!('trapCards' in pub), 'a posição das maldições não vai no broadcast');
  assert.deepEqual(board.boardTraps(room, ana.id).map((t) => t.square), [5], 'o dono sabe onde a pôs');
  assert.deepEqual(board.boardTraps(room, rui.id), [], 'os outros não');

  b.currentPlayerId = rui.id;
  b.players[rui.id].pos = 2;
  await board.advance(room, rui.id, 3); // cai na casa 5

  assert.equal(b.trapCards.length, 0, 'a maldição é consumida');
  assert.ok(b.players[rui.id].golos >= 4 + 6, 'bebeu o avanço (6) e a maldição (4)');
});
