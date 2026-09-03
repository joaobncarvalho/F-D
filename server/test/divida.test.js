// F&D — testes de A Conta (game/divida.js): adiar, transferir, herdar, cobrar.
//
// O que aqui se protege é a promessa que faz o sistema honesto: uma dívida que
// nunca vence é uma forma gratuita de nunca beber. Há testes para os dois sítios
// onde a conta fecha (o Cobrador e o fim da noite) e para o teto — sem ele, a
// conta cresce até deixar de ser negociável e passa a ser piada.

import { test } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL;
process.env.EVENTOS = '0'; // contam-se goles exatos — sem eventos pelo meio

const { RoomManager, serializeRoom } = await import('../src/rooms.js');
const game = await import('../src/game.js');
const divida = await import('../src/game/divida.js');

function start(names = ['Ana', 'Rui', 'Zé'], opts = {}) {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom(names[0]);
  const players = [host];
  for (const n of names.slice(1)) players.push(rm.joinRoom(room.code, n).player);
  game.initGame(room, { lives: 3, modifiers: ['divida'], ...opts });
  game.beginPlay(room, players[0].id);
  return { rm, room, players };
}

/** Força uma ronda de Desafio simples no jogador da vez. */
async function rondaDesafio(room) {
  const spinnerId = room.game.currentPlayerId;
  for (let i = 0; i < 2000; i++) {
    const round = await game.spinWheel(room, spinnerId);
    if (round.gameTypeKey === 'desafio' && !round.needsBuddy) return round;
    room.game.round = null;
    room.game.phase = 'wheel';
    room.game.currentPlayerId = spinnerId;
  }
  throw new Error('A roda nunca calhou num Desafio simples.');
}

test('adiar: não se bebe agora, fica a dever com juro — e a vida custa o mesmo', async () => {
  const { room, players } = start();
  const [ana] = players;
  await rondaDesafio(room);
  game.resolveAction(room, ana.id, 'adiar');
  assert.equal(room.game.stats[ana.id].drinks, 0, 'não bebeu nada agora');
  assert.equal(room.game.stats[ana.id].refusals, 1, 'continua a ser uma recusa');
  assert.equal(room.players.get(ana.id).lives, 2, 'a vida custa o mesmo que recusar');
  assert.equal(divida.deve(room.game, ana.id), divida.JURO);
});

test('adiar não está disponível sem o modificador', async () => {
  const { room, players } = start(['Ana', 'Rui', 'Zé'], { modifiers: [] });
  const [ana] = players;
  await rondaDesafio(room);
  assert.equal(serializeRoom(room).game.podeAdiar, false);
  assert.throws(() => game.resolveAction(room, ana.id, 'adiar'), /adiar/i);
});

test('o teto trava a conta antes de ela deixar de ser negociável', async () => {
  const { room, players } = start(['Ana', 'Rui', 'Zé'], { lives: 5 });
  const [ana] = players;
  room.game.dividas[ana.id] = divida.TETO - 1;
  assert.equal(divida.podeAdiar(room, ana.id), false);
  await rondaDesafio(room);
  assert.throws(() => game.resolveAction(room, ana.id, 'adiar'), /conta/i);
});

test('transferir: a conta muda de dono e quem a assume ganha uma vida', () => {
  const { room, players } = start();
  const [ana, rui] = players;
  room.game.dividas[ana.id] = 4;
  const antes = room.players.get(rui.id).lives;
  const res = game.transfereDivida(room, ana.id, rui.id);
  assert.equal(res.golos, 4);
  assert.equal(divida.deve(room.game, ana.id), 0);
  assert.equal(divida.deve(room.game, rui.id), 4);
  assert.equal(room.players.get(rui.id).lives, antes + 1, 'a troca é vida por goles');
});

test('transferir: sem conta, para si próprio, ou para quem já saiu — não passa', () => {
  const { room, players } = start();
  const [ana, rui, ze] = players;
  assert.throws(() => game.transfereDivida(room, ana.id, rui.id), /conta nenhuma/i);
  room.game.dividas[ana.id] = 3;
  assert.throws(() => game.transfereDivida(room, ana.id, ana.id), /outra pessoa/i);
  room.players.get(ze.id).eliminated = true;
  assert.throws(() => game.transfereDivida(room, ana.id, ze.id), /válido/i);
});

test('herança: quem sai a dever escolhe quem herda', async () => {
  const { room, players } = start(['Ana', 'Rui', 'Zé'], { lives: 1 });
  const [ana, rui, ze] = players;
  room.game.dividas[ana.id] = 5;
  await rondaDesafio(room);
  game.resolveAction(room, ana.id, 'refuse'); // 1 vida → sai
  assert.equal(room.players.get(ana.id).eliminated, true);

  const h = room.game.heranca;
  assert.ok(h, 'saiu a dever → abre a herança');
  assert.equal(h.golos, 5);
  assert.deepEqual([...h.candidatos].sort(), [rui.id, ze.id].sort());

  game.escolheHerdeiro(room, ana.id, ze.id);
  assert.equal(divida.deve(room.game, ana.id), 0);
  assert.equal(divida.deve(room.game, ze.id), 5);
  assert.equal(room.game.heranca, null);
});

test('herança: sem conta não abre nada', async () => {
  const { room, players } = start(['Ana', 'Rui', 'Zé'], { lives: 1 });
  const [ana] = players;
  await rondaDesafio(room);
  game.resolveAction(room, ana.id, 'refuse');
  assert.equal(room.game.heranca, null);
});

test('herança: só quem saiu decide, e uma escolha inválida vai ao ar', () => {
  const { room, players } = start();
  const [ana, rui] = players;
  room.game.dividas[ana.id] = 2;
  room.players.get(ana.id).eliminated = true;
  room.game.heranca = { deId: ana.id, deName: 'Ana', golos: 2, candidatos: [rui.id], herdeiroId: null };
  assert.throws(() => game.escolheHerdeiro(room, rui.id, rui.id), /quem saiu/i);
  const res = game.escolheHerdeiro(room, ana.id, 'inventado');
  assert.equal(res.herdeiroId, rui.id, 'cai no sorteio entre os candidatos');
});

test('o Cobrador fecha as contas todas — e aí sim conta como beber', () => {
  const { room, players } = start();
  const [ana, rui] = players;
  room.game.dividas[ana.id] = 4;
  room.game.dividas[rui.id] = 2;
  const cobradas = divida.cobraTudo(room);
  assert.equal(cobradas.length, 2);
  assert.equal(room.game.stats[ana.id].drinks, 4);
  assert.equal(room.game.stats[rui.id].drinks, 2);
  assert.deepEqual(divida.contas(room), []);
});

test('a noite fecha a conta: o que se adiou entra nos goles do fim', async () => {
  const { room, players } = start();
  const [ana] = players;
  await rondaDesafio(room);
  game.resolveAction(room, ana.id, 'adiar');
  assert.equal(room.game.stats[ana.id].drinks, 0);

  const stats = game.endGame(room, ana.id);
  const linha = stats.rows.find((r) => r.id === ana.id);
  assert.equal(linha.drinks, divida.JURO, 'a conta venceu no fim');
  assert.equal(stats.contaFinal.length, 1, 'e o ecrã final mostra quem devia o quê');
  assert.deepEqual(divida.contas(room), []);
});

test('o payload só leva A Conta quando o modificador está ligado', async () => {
  const { room } = start(['Ana', 'Rui', 'Zé'], { modifiers: [] });
  assert.equal(serializeRoom(room).game.divida, null);
  const outra = start();
  await rondaDesafio(outra.room);
  const s = serializeRoom(outra.room).game;
  assert.ok(s.divida, 'ligado → vem no payload');
  assert.equal(s.divida.juro, divida.JURO);
  assert.equal(s.podeAdiar, true);
});
