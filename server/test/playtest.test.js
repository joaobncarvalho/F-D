// F&D — testes da SALA DE TESTE (playtest): encomendar o próximo jogo.
//
// O showroom deixou de ser só uma montra: dá para jogar a sério, com bots, e
// pedir o jogo que se quer ver. O que aqui se testa é a encomenda — que o jogo
// pedido é MESMO o que sai, que vale uma vez só, e que fica reservada a quem a
// pediu (senão, com bots na mesa, era um bot a levar o jogo que se ia testar).

import { test } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL; // corre contra o conteúdo em memória
process.env.ENABLE_DEV_BOTS = '1'; // a sala de teste é uma ferramenta de dev
process.env.SNAPSHOT = '0'; // sem gravação em disco
process.env.AUTO_RESOLVE_MS = '0'; // sem varrimento automático a interferir

const { RoomManager } = await import('../src/rooms.js');
const game = await import('../src/game.js');
const board = await import('../src/board.js');

async function mesaRoda(nomes = ['Ana', 'Rui', 'Zé']) {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom(nomes[0]);
  const players = [host];
  for (const n of nomes.slice(1)) players.push(rm.joinRoom(room.code, n).player);
  room.status = 'playing';
  // 'caos' porque o ⚖️ Tribunal não entra no sorteio abaixo de hardcore — e é
  // justamente o tipo que a encomenda existe para alcançar.
  game.initGame(room, { lives: 3, intensity: 'caos', curve: false });
  game.beginPlay(room, host.id);
  return { room, players };
}

async function mesaTabuleiro(nomes = ['Ana', 'Rui', 'Zé']) {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom(nomes[0]);
  const players = [host];
  for (const n of nomes.slice(1)) players.push(rm.joinRoom(room.code, n).player);
  room.status = 'playing';
  await board.initBoard(room, { intensity: 'picante' });
  const b = room.board;
  for (const p of players) b.players[p.id].pawn = '🦊';
  b.order = players.map((p) => p.id);
  b.currentPlayerId = players[0].id;
  b.phase = 'playing';
  return { room, b, players };
}

test('Roda: o tipo encomendado é o que sai — e só naquela volta', async () => {
  const { room, players } = await mesaRoda();
  const [ana] = players;

  game.forcaProximoTipo(room, 'tribunal', ana.id);
  const round = await game.spinWheel(room, ana.id);
  assert.equal(round.gameTypeKey, 'tribunal');
  assert.equal(room.game.tipoForcado, null, 'a encomenda consome-se');

  // A volta seguinte volta ao sorteio do Diretor: nada garante o tipo, mas
  // garante-se que já não é a encomenda a mandar.
  assert.equal(room.game.tipoForcado, null);
});

test('Roda: a encomenda fica reservada a quem a pediu', async () => {
  const { room, players } = await mesaRoda();
  const [ana, rui] = players;

  game.forcaProximoTipo(room, 'tribunal', ana.id);
  // O Rui gira primeiro (é a mesa a andar): não pode levar o jogo da Ana.
  room.game.currentPlayerId = rui.id;
  const doRui = await game.spinWheel(room, rui.id);
  assert.notEqual(doRui.gameTypeKey, 'tribunal');
  assert.ok(room.game.tipoForcado, 'a encomenda fica à espera do dono');

  room.game.phase = 'wheel';
  room.game.currentPlayerId = ana.id;
  const daAna = await game.spinWheel(room, ana.id);
  assert.equal(daAna.gameTypeKey, 'tribunal');
});

test('Tabuleiro: a casa encomendada é onde se cai, dê o dado o que der', async () => {
  const { room, b, players } = await mesaTabuleiro();
  const [ana] = players;

  board.forcaProximaCasa(room, { kind: 'beerpong' }, ana.id);
  await board.advance(room, ana.id, 2);
  assert.equal(b.pending?.kind, 'beerpong');
  assert.equal(b.casaForcada, null, 'a encomenda consome-se');
  assert.equal(b.lastMove.landedKind, 'beerpong');
});

test('Tabuleiro: mini encomendado abre o tipo pedido', async () => {
  const { room, b, players } = await mesaTabuleiro();
  const [ana] = players;

  board.forcaProximaCasa(room, { kind: 'mini', gameKey: 'isto_ou_aquilo' }, ana.id);
  await board.advance(room, ana.id, 1);
  assert.equal(b.pending?.kind, 'mini');
  assert.equal(b.pending.variant, 'choice');
  assert.equal(b.pending.gameKey, 'isto_ou_aquilo');
});

test('Tabuleiro: encomendar o Tribunal salta o sorteio dos 80%', async () => {
  const { room, b, players } = await mesaTabuleiro();
  const [ana] = players;

  board.forcaProximaCasa(room, { kind: 'tribunal' }, ana.id);
  await board.advance(room, ana.id, 2);
  assert.ok(b.tribunal, 'abriu julgamento');
  assert.equal(b.tribunal.reuId, ana.id);
  assert.equal(b.pending, null);
});

test('Tabuleiro: a encomenda não é gasta por outro jogador', async () => {
  const { room, b, players } = await mesaTabuleiro();
  const [ana, rui] = players;

  board.forcaProximaCasa(room, { kind: 'gamble' }, ana.id);
  b.currentPlayerId = rui.id;
  await board.advance(room, rui.id, 3);
  assert.notEqual(b.pending?.kind, 'gamble', 'o Rui caiu na casa dele');
  assert.ok(b.casaForcada, 'a encomenda fica à espera da Ana');
});

test('Tabuleiro: a encomenda cala as sequências (não vai preso a meio)', async () => {
  const { room, b, players } = await mesaTabuleiro();
  const [ana] = players;
  b.players[ana.id].slowStreak = 2; // à beira da prisão por abuso

  board.forcaProximaCasa(room, { kind: 'blackjack' }, ana.id);
  await board.advance(room, ana.id, 1);
  assert.equal(b.pending?.kind, 'blackjack');
  assert.equal(b.players[ana.id].slowStreak, 0);
});

// ----- Pela rede: o botão "jogar a sério" do showroom -------------------------

test('dev_playtest: um evento põe a mesa de pé, com bots, no jogo pedido', async () => {
  const { createServer } = await import('node:http');
  const { Server } = await import('socket.io');
  const { io: connect } = await import('socket.io-client');
  const { registerSocketHandlers } = await import('../src/socket.js');

  const http = createServer();
  const io = new Server(http, { cors: { origin: '*' } });
  registerSocketHandlers(io);
  await new Promise((res) => http.listen(0, res));
  const cli = connect(`http://localhost:${http.address().port}`, { transports: ['websocket'], forceNew: true });

  const pede = (evento, payload = {}) =>
    new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(`sem resposta a ${evento}`)), 4000);
      cli.emit(evento, payload, (r) => {
        clearTimeout(t);
        res(r);
      });
    });

  try {
    // O ouvinte fica pronto ANTES do pedido: o servidor faz o broadcast do
    // arranque logo a seguir ao ack, e sem isto o teste chegava tarde.
    const arrancou = new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('o jogo não arrancou')), 4000);
      cli.on('room_state', ({ room }) => {
        if (room.game?.phase === 'wheel') {
          clearTimeout(t);
          res(room);
        }
      });
    });
    const r = await pede('dev_playtest', {
      name: 'Tu',
      mode: 'wheel',
      intensity: 'caos',
      bots: 3,
      gameTypeKey: 'tribunal',
    });
    assert.equal(r.ok, true, r.message);
    assert.equal(r.room.players.length, 4, 'host + 3 bots');
    assert.ok(r.room.players.filter((p) => p.isBot).length === 3);

    // O jogo já arrancou e saltou a fase de escrever perguntas: quem entra cai
    // logo na roda, que é o ponto de um playtest.
    const estado = await arrancou;
    assert.equal(estado.game.tipoForcado, 'tribunal', 'a encomenda vai no estado');

    // E a roda dá MESMO o que foi encomendado.
    const saiu = new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('a roda não parou')), 4000);
      cli.on('round_started', (payload) => {
        clearTimeout(t);
        res(payload);
      });
    });
    await pede('spin_wheel');
    const round = await saiu;
    assert.equal(round.gameTypeKey, 'tribunal');
  } finally {
    cli.close();
    io.close();
    await new Promise((res) => http.close(res));
  }
});
