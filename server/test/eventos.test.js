// F&D — o Evento da Noite.
//
// O que se fixa aqui é o CONTRATO do evento, não cada efeito um a um: cai entre
// rondas (nunca a meio de uma), é raro, sabe dizer se é bom ou mau, e existe nos
// dois modos com a moeda de cada um — vidas na Roda, casas no Tabuleiro.
//
// Mais a trégua, que é a regra transversal mais fácil de esquecer num caminho.

import { test } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL;
process.env.SNAPSHOT = '0';

const { RoomManager } = await import('../src/rooms.js');
const game = await import('../src/game.js');
const board = await import('../src/board.js');
const eventos = await import('../src/game/eventos.js');
const { perdeVida } = await import('../src/game/helpers.js');

function mesa(nomes = ['Ana', 'Rui', 'Zé', 'Nel']) {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom(nomes[0]);
  const jogadores = [host];
  for (const nome of nomes.slice(1)) jogadores.push(rm.joinRoom(room.code, nome).player);
  rm.startGame(room.code, host.id);
  game.initGame(room, { lives: 3 });
  game.beginPlay(room, host.id);
  return { rm, room, jogadores };
}

// ----- O contrato ------------------------------------------------------------

test('o primeiro evento é agendado logo no arranque, e não já', () => {
  const { room } = mesa();
  const g = room.game;
  assert.ok(g.proximoEventoNa >= eventos.MIN_RONDAS, 'nunca cai na primeira ronda');
  assert.ok(g.proximoEventoNa <= eventos.MAX_RONDAS);
  assert.equal(eventos.horaDeEvento(room), false);
});

test('a janela é aleatória — a mesa não pode prever "agora vem aí"', () => {
  const janelas = new Set();
  for (let i = 0; i < 60; i++) {
    const estado = { roundCount: 0 };
    eventos.agendaProximo(estado);
    janelas.add(estado.proximoEventoNa);
  }
  assert.ok(janelas.size > 1, 'se fosse fixa, a mesa contava as rondas');
});

test('cada evento diz se é bom ou mau — é o que o cliente anima', () => {
  for (const banco of [eventos.EVENTOS_RODA, eventos.EVENTOS_TABULEIRO]) {
    assert.ok(banco.length >= 5, 'um banco pequeno de mais repete-se depressa');
    for (const ev of banco) {
      assert.ok(['bom', 'mau'].includes(ev.tom), `${ev.key} tem de ter tom`);
      assert.ok(ev.emoji && ev.titulo, `${ev.key} precisa de cara`);
      assert.ok(ev.peso > 0, `${ev.key} precisa de peso`);
      assert.equal(typeof ev.aplica, 'function');
    }
    assert.ok(banco.some((e) => e.tom === 'bom'), 'tem de haver metade boa');
    assert.ok(banco.some((e) => e.tom === 'mau'), 'e metade má');
  }
});

test('o evento cai ENTRE rondas, e reagenda-se sozinho', () => {
  const { room, jogadores } = mesa();
  const g = room.game;
  g.roundCount = g.proximoEventoNa; // chegou a hora
  assert.equal(eventos.horaDeEvento(room), true);

  game.skipTurn(room, jogadores[0].id); // fecha uma ronda → dispara
  assert.ok(g.ultimoEvento, 'caiu um evento');
  assert.ok(['bom', 'mau'].includes(g.ultimoEvento.tom));
  assert.ok(g.ultimoEvento.texto.length > 10, 'a mesa tem de conseguir ler o que aconteceu');
  assert.ok(g.proximoEventoNa > g.roundCount, 'o próximo já está marcado para a frente');
  assert.ok(
    room.feed.some((e) => e.text === g.ultimoEvento.texto),
    'e fica no feed, para quem estava distraído'
  );
});

test('não cai evento na última ronda da noite — o palco é do final', () => {
  const { room } = mesa();
  const g = room.game;
  g.roundCount = 99;
  g.proximoEventoNa = 1;
  g.finale = true;
  assert.equal(eventos.horaDeEvento(room), false);
});

// ----- A trégua --------------------------------------------------------------

test('a trégua trava a perda de vidas em TODOS os caminhos', () => {
  const { room, jogadores } = mesa();
  const [ana] = jogadores;
  room.game.tregua = 2;

  const antes = ana.lives;
  const efeito = perdeVida(room, ana.id, { motivo: 'teste' });
  assert.equal(efeito.type, 'tregua');
  assert.equal(ana.lives, antes, 'a vida não se perde');

  // E consome-se com as rondas, senão durava a noite toda.
  eventos.passaRonda(room.game);
  assert.equal(room.game.tregua, 1);
  eventos.passaRonda(room.game);
  assert.equal(room.game.tregua, 0);
  assert.equal(perdeVida(room, ana.id, {}).type, 'vida_perdida', 'acabada a trégua, dói outra vez');
});

// ----- Tabuleiro --------------------------------------------------------------

test('no Tabuleiro os eventos mexem em CASAS, não em vidas', async () => {
  const rm = new RoomManager();
  const { room, player: ana } = rm.createRoom('Ana');
  const { player: rui } = rm.joinRoom(room.code, 'Rui');
  rm.setMode(room.code, ana.id, 'board');
  rm.startGame(room.code, ana.id);
  await board.initBoard(room, { intensity: 'leve' });

  const b = room.board;
  assert.ok(b.proximoEventoNa >= eventos.MIN_RONDAS, 'o Tabuleiro também agenda');

  b.players[ana.id].pos = 30;
  b.players[rui.id].pos = 4;
  const posicoesAntes = { ana: 30, rui: 4 };

  b.turnCount = b.proximoEventoNa; // chegou a hora
  assert.equal(eventos.horaDeEvento(room, b), true);
  const ev = eventos.dispara(room, b);

  assert.ok(ev, 'caiu um evento no tabuleiro');
  assert.ok(['bom', 'mau'].includes(ev.tom));
  const mexeu =
    b.players[ana.id].pos !== posicoesAntes.ana ||
    b.players[rui.id].pos !== posicoesAntes.rui ||
    b.players[ana.id].golos > 0 ||
    b.players[ana.id].shield === true;
  assert.ok(mexeu, 'um evento que não muda nada não é um evento');
});

test('o golpe de estado troca mesmo o primeiro com o último', async () => {
  const rm = new RoomManager();
  const { room, player: ana } = rm.createRoom('Ana');
  const { player: rui } = rm.joinRoom(room.code, 'Rui');
  rm.setMode(room.code, ana.id, 'board');
  rm.startGame(room.code, ana.id);
  await board.initBoard(room, { intensity: 'leve' });

  const b = room.board;
  b.players[ana.id].pos = 40;
  b.players[rui.id].pos = 6;

  const golpe = eventos.EVENTOS_TABULEIRO.find((e) => e.key === 'golpe_de_estado');
  const res = golpe.aplica(room);

  assert.ok(res, 'com dois jogadores em casas diferentes, o golpe aplica-se');
  assert.equal(b.players[ana.id].pos, 6, 'quem ia à frente vai para trás');
  assert.equal(b.players[rui.id].pos, 40, 'e vice-versa');
});

test('um evento que não se pode aplicar não gasta a vez — tenta-se outro', () => {
  const { room } = mesa();
  const g = room.game;
  g.intensity = 'caos'; // o "a noite aquece" já não tem para onde subir

  const aquece = eventos.EVENTOS_RODA.find((e) => e.key === 'noite_a_serio');
  assert.equal(aquece.aplica(room), null, 'em Caos não há nível acima');

  // O disparo tem de encontrar outro na mesma.
  g.roundCount = 50;
  const ev = eventos.dispara(room, g);
  assert.ok(ev, 'a mesa não fica sem evento por causa de um que não servia');
});
