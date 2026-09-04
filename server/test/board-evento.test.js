// F&D — casa ?? : os efeitos novos.
//
// O banco tinha 9 efeitos e a casa mostra 3 de cada vez: via-se um terço do
// baralho por visita e ao fim de meia hora já não havia surpresa nenhuma. Passou
// a 24, com pesos, e com efeitos que mexem mesmo com a mesa (roubar, trocar
// mãos, golpe de estado, impostos ao líder).
//
// Cada efeito novo é exercitado aqui: são mutações de estado partilhado e um
// erro num deles só apareceria a meio de uma partida.

import { test } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL;
// A prisao tem de se aplicar JA: com o ⚖️ Tribunal pelo meio (board/tribunal.js)
// a mesa fica trancada a espera de um veredito, e estes testes deixavam de ser
// sobre o que testam. O Tribunal tem testes proprios em tribunal.test.js.
process.env.TRIBUNAL = '0'; // conteúdo em memória
process.env.AUTO_RESOLVE_MS = '0';

const { RoomManager } = await import('../src/rooms.js');
const board = await import('../src/board.js');
const { BOARD_EVENTS } = await import('../src/content/board.data.js');

async function mesa() {
  const rm = new RoomManager();
  const { room, player: a } = rm.createRoom('Ana');
  const b = rm.joinRoom(room.code, 'Bruno').player;
  const c = rm.joinRoom(room.code, 'Carla').player;
  room.status = 'playing';
  await board.initBoard(room, { intensity: 'leve' });
  const bd = room.board;
  bd.phase = 'playing';
  bd.order = [a.id, b.id, c.id];
  bd.turnIndex = 0;
  bd.currentPlayerId = a.id;
  return { room, bd, a, b, c };
}

/** Força a casa ?? com um efeito à escolha e resolve-a para `playerId`. */
function dispara(room, playerId, evento) {
  const bd = room.board;
  bd.currentPlayerId = playerId;
  bd.turnIndex = bd.order.indexOf(playerId);
  bd.pending = { kind: 'evento', playerId, cards: [evento, evento, evento] };
  board.boardEventoPick(room, playerId, 0);
  return bd.lastEvent.text;
}

test('?? : o banco cresceu e tem pesos coerentes', () => {
  assert.ok(BOARD_EVENTS.length >= 20, `o banco tem de ser grande (tem ${BOARD_EVENTS.length})`);
  for (const e of BOARD_EVENTS) {
    assert.ok(e.weight >= 1, `"${e.title}" precisa de peso`);
    assert.ok(e.emoji && e.title && e.desc && e.effect, `"${e.title}" está incompleto`);
  }
  const titulos = BOARD_EVENTS.map((e) => e.title);
  assert.equal(new Set(titulos).size, titulos.length, 'os títulos são a chave na BD — não podem repetir');
});

test('?? : impostos ao líder e saúde à mesa toda', async () => {
  const { room, bd, a, b, c } = await mesa();
  bd.players[b.id].pos = 20; // Bruno vai à frente

  dispara(room, a.id, { effect: 'leader_drink', value: 3, emoji: '👑', title: 'Impostos', desc: '' });
  assert.equal(bd.players[b.id].golos, 3, 'quem vai à frente é que paga');
  assert.equal(bd.players[a.id].golos, 0);

  dispara(room, a.id, { effect: 'all_drink', value: 2, emoji: '🍻', title: 'Saúde', desc: '' });
  for (const p of [a, b, c]) assert.ok(bd.players[p.id].golos >= 2, 'o "saúde" apanha toda a gente');
});

test('?? : golpe de estado troca de casa com o líder', async () => {
  const { room, bd, a, b } = await mesa();
  bd.players[a.id].pos = 5;
  bd.players[b.id].pos = 30;

  dispara(room, a.id, { effect: 'swap_leader', emoji: '🔀', title: 'Golpe', desc: '' });
  assert.equal(bd.players[a.id].pos, 30, 'a Ana passou para a casa do líder');
  assert.equal(bd.players[b.id].pos, 5, 'e o líder foi para a dela');
});

test('?? : roubo e troca de mãos mexem mesmo nas cartas', async () => {
  const { room, bd, a, b } = await mesa();
  bd.players[b.id].cards = [{ id: 'x1', key: 'swap' }, { id: 'x2', key: 'skip' }];

  dispara(room, a.id, { effect: 'steal_card', emoji: '🪝', title: 'Carteirista', desc: '' });
  assert.equal(bd.players[a.id].cards.length, 1, 'a Ana ficou com uma carta');
  assert.equal(bd.players[b.id].cards.length, 1, 'e o Bruno perdeu-a');

  const antesA = bd.players[a.id].cards.length;
  const antesB = bd.players[b.id].cards.length;
  bd.players[b.id].cards.push({ id: 'x3', key: 'shield' }); // desequilibra p/ a troca se notar
  dispara(room, a.id, { effect: 'trade_cards', emoji: '🔄', title: 'Feira', desc: '' });
  const trocou =
    bd.players[a.id].cards.length !== antesA || bd.players[b.id].cards.length !== antesB + 1;
  assert.ok(trocou, 'a troca tem de mudar mesmo as mãos');
});

test('?? : último a rir premeia quem vai atrás e castiga quem não vai', async () => {
  const { room, bd, a, b, c } = await mesa();
  const evento = { effect: 'last_advance', value: 3, emoji: '🐢', title: 'Último a rir', desc: '' };

  bd.players[a.id].pos = 0;
  bd.players[b.id].pos = 10;
  bd.players[c.id].pos = 12;
  dispara(room, a.id, evento);
  assert.equal(bd.players[a.id].pos, 3, 'ia em último → avança');

  bd.players[a.id].pos = 40; // agora vai à frente
  const golosAntes = bd.players[a.id].golos;
  dispara(room, a.id, evento);
  assert.equal(bd.players[a.id].pos, 40, 'não avança');
  assert.equal(bd.players[a.id].golos, golosAntes + 2, 'e bebe');
});

test('?? : escudo, adormecer e beber por carta', async () => {
  const { room, bd, a } = await mesa();

  dispara(room, a.id, { effect: 'shield', emoji: '🛡️', title: 'Imunidade', desc: '' });
  assert.equal(bd.players[a.id].shield, true);

  dispara(room, a.id, { effect: 'skip', value: 1, emoji: '😴', title: 'Adormeceste', desc: '' });
  assert.equal(bd.players[a.id].skipTurns, 1);

  bd.players[a.id].cards = [{ id: 'c1', key: 'swap' }, { id: 'c2', key: 'skip' }];
  const antes = bd.players[a.id].golos;
  dispara(room, a.id, { effect: 'drink_per_card', value: 1, emoji: '🎴', title: 'Conta a mão', desc: '' });
  assert.equal(bd.players[a.id].golos, antes + 2, '2 cartas = 2 golos');
});

test('?? : um efeito desconhecido não parte a ronda', async () => {
  const { room, bd, a } = await mesa();
  const texto = dispara(room, a.id, { effect: 'efeito_que_nao_existe', emoji: '❓', title: '?', desc: '' });
  assert.match(texto, /não teve nada/i);
  assert.equal(bd.pending, null, 'a vez passa na mesma');
});
