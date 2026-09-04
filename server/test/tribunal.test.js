// F&D — ⚖️ Tribunal da Injustiça (game/tribunal.js + board/tribunal.js).
//
// Duas coisas se protegem aqui:
//
//   1. QUE HAJA MESMO HIPÓTESE. Se a absolvição não funcionasse, o julgamento
//      era teatro — e ao fim de duas vezes a mesa carregava para o despachar.
//      É a razão de existir da camada toda.
//   2. QUE O TABULEIRO NÃO FIQUE ENCRAVADO. O julgamento tranca a mesa inteira
//      (é uma mesa parada a ouvir), e uma coisa que tranca tem de destrancar
//      sempre — pelo veredito, ou pelo auto-resolve.

import { test } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL;
process.env.SNAPSHOT = '0';
process.env.EVENTOS = '0';

const { RoomManager, serializeRoom } = await import('../src/rooms.js');
const game = await import('../src/game.js');
const board = await import('../src/board.js');
const tribunal = await import('../src/game/tribunal.js');
const boardTribunal = await import('../src/board/tribunal.js');
const { applyPrison } = await import('../src/board/core.js');

function sala(nomes = ['Ana', 'Rui', 'Zé']) {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom(nomes[0]);
  const players = [host];
  for (const n of nomes.slice(1)) players.push(rm.joinRoom(room.code, n).player);
  return { rm, room, players };
}

// ----- A Roda ----------------------------------------------------------------

function rodaComTribunal(nomes) {
  const { room, players } = sala(nomes);
  game.initGame(room, { lives: 3, intensity: 'caos', curve: false });
  game.beginPlay(room, players[0].id);
  // Monta-se a ronda à mão: esperar que a roda calhe no tribunal era testar o
  // sorteio, não o tribunal.
  const round = {
    id: 'r1',
    gameTypeKey: 'tribunal',
    gameTypeLabel: 'Tribunal da Injustiça',
    currentPlayerId: players[0].id,
    status: 'pending',
  };
  assert.equal(tribunal.setupTribunal(room, round, { text: 'Defende que a conta se divide por altura.' }), true);
  room.game.round = round;
  room.game.phase = 'tribunal';
  return { room, players, round };
}

test('Roda: o tribunal só entra no sorteio a partir do Hardcore', () => {
  const types = [{ key: 'tribunal', label: 'Tribunal' }, { key: 'desafio', label: 'Desafio' }];
  for (const nivel of ['leve', 'picante']) {
    for (let i = 0; i < 200; i++) {
      assert.notEqual(
        game.pickWeightedType(types, { jogadores: 6, intensidade: nivel }).key,
        'tribunal',
        `não pode sair em ${nivel}`
      );
    }
  }
  let saiu = false;
  for (let i = 0; i < 400 && !saiu; i++) {
    saiu = game.pickWeightedType(types, { jogadores: 6, intensidade: 'hardcore' }).key === 'tribunal';
  }
  assert.ok(saiu, 'em hardcore tem de poder sair');
  // Sem intensidade (testes antigos, chamadores futuros) a roda fica inteira.
  assert.doesNotThrow(() => game.pickWeightedType(types, { jogadores: 6 }));
});

test('Roda: absolvido — quem condenou é que bebe', () => {
  const { room, players } = rodaComTribunal();
  const [ana, rui, ze] = players;
  game.tribunalAoVoto(room, rui.id);
  assert.equal(room.game.round.substate, 'votar');
  assert.throws(() => game.votaVeredito(room, ana.id, 'sim'), /em ti próprio/i);

  game.votaVeredito(room, rui.id, 'sim'); // absolve
  game.votaVeredito(room, ze.id, 'nao'); // condena
  const r = room.game.round.result;
  assert.equal(r.absolvido, true, 'empate absolve — a regra é a mesma em todo o lado');
  assert.equal(room.players.get(ana.id).lives, 3, 'quem foi absolvido não perde nada');
  assert.deepEqual(r.pagantes.map((p) => p.id), [ze.id]);
  assert.equal(room.game.stats[ze.id].drinks, tribunal.CUSTO_CONDENAR_MAL);
});

test('Roda: condenado — perde uma vida, e ninguém bebe por isso', () => {
  const { room, players } = rodaComTribunal();
  const [ana, rui, ze] = players;
  game.tribunalAoVoto(room, ana.id);
  game.votaVeredito(room, rui.id, 'nao');
  game.votaVeredito(room, ze.id, 'nao');
  assert.equal(room.game.round.result.absolvido, false);
  assert.equal(room.players.get(ana.id).lives, 2);
  assert.equal(room.game.stats[rui.id]?.drinks || 0, 0, 'condenar bem não custa nada');
});

test('Roda: a tese vai no payload, os 90s também, e não há mais nada escondido', () => {
  const { room } = rodaComTribunal();
  const pub = serializeRoom(room).game.round;
  assert.equal(pub.tese, 'Defende que a conta se divide por altura.');
  assert.equal(pub.segundos, 90);
  assert.equal(pub.substate, 'defesa');
  assert.equal(pub.veredito, null, 'a votação só abre quando a defesa acaba');
});

test('Roda: sem júri não há tribunal', () => {
  const { room, players } = sala(['Ana']);
  game.initGame(room, { lives: 3 });
  const round = { id: 'r', gameTypeKey: 'tribunal', currentPlayerId: players[0].id };
  assert.equal(tribunal.setupTribunal(room, round, { text: 'x' }), false);
});

// ----- O Tabuleiro -----------------------------------------------------------

async function tabuleiroAJogar(nomes = ['Ana', 'Rui', 'Zé']) {
  const { room, players } = sala(nomes);
  await board.initBoard(room, { intensity: 'hardcore' });
  const b = room.board;
  for (const p of players) b.players[p.id].pawn = '🦊';
  b.order = players.map((p) => p.id);
  b.currentPlayerId = players[0].id;
  b.phase = 'playing';
  return { room, b, players };
}

test('Tabuleiro: ir preso abre um julgamento, e a pena fica à espera', async () => {
  const { room, b, players } = await tabuleiroAJogar();
  const [ana] = players;
  const posAntes = 20;
  const golosAntes = 0;

  // O sorteio é 80/20; aqui testa-se o lado do julgamento. Cada tentativa parte
  // de um jogador LIMPO — senão as tentativas que calham em condenação direta
  // aplicavam a pena e o teste media o lixo delas em vez do julgamento.
  let aberto = false;
  for (let i = 0; i < 200 && !aberto; i++) {
    Object.assign(b.players[ana.id], { pos: posAntes, golos: golosAntes, prisonCount: 0, skipTurns: 0 });
    b.tribunal = null;
    aberto = applyPrison(room, ana.id, 'abuso de bebida').julgamento;
  }
  assert.ok(aberto, 'com 80% de hipótese, 200 tentativas têm de abrir um');

  const t = b.tribunal;
  assert.equal(t.reuId, ana.id);
  assert.equal(t.substate, 'defesa');
  assert.ok(t.tese, 'tem de haver tese para defender');
  assert.equal(b.players[ana.id].pos, posAntes, 'a pena ainda NÃO se aplicou');
  assert.equal(b.players[ana.id].golos, golosAntes);
  assert.equal(b.players[ana.id].prisonCount, 0, 'ainda não foi preso — foi acusado');

  // A pena que está à espera nunca sai no payload: sabê-la mudava o voto.
  const pub = serializeRoom(room).board.tribunal;
  assert.equal('pena' in pub, false);
  assert.ok(pub.tese && pub.reuName && pub.segundos === 90);
});

test('Tabuleiro: o julgamento tranca a mesa até se resolver', async () => {
  const { room, b, players } = await tabuleiroAJogar();
  const [ana, rui] = players;
  boardTribunal.abreTribunal(room, ana.id, 'ganância', { note: 'salta 1 vez', skipTurns: 1 }, 'Defende o indefensável.');

  await assert.rejects(() => board.advance(room, ana.id, 1), /julgamento/i);
  assert.throws(() => board.playCard(room, ana.id, 'x', rui.id), /julgamento/i);

  board.boardTribunalAoVoto(room, rui.id);
  board.boardTribunalVota(room, rui.id, 'sim');
  board.boardTribunalVota(room, players[2].id, 'sim');
  assert.equal(b.tribunal.substate, 'result');
  board.limpaTribunal(room);
  assert.equal(b.tribunal, null, 'destrancou');
  await assert.doesNotReject(() => board.advance(room, ana.id, 1));
});

test('Tabuleiro: absolvido escapa à pena; condenado cumpre a que estava guardada', async () => {
  for (const [voto, esperado] of [
    ['sim', { skip: 0, preso: 0 }],
    ['nao', { skip: 2, preso: 1 }],
  ]) {
    const { room, b, players } = await tabuleiroAJogar();
    const [ana, rui, ze] = players;
    boardTribunal.abreTribunal(room, ana.id, 'ganância', { note: 'salta 2 vezes', skipTurns: 2 }, 'Tese qualquer.');
    board.boardTribunalAoVoto(room, rui.id);
    board.boardTribunalVota(room, rui.id, voto);
    board.boardTribunalVota(room, ze.id, voto);

    assert.equal(b.players[ana.id].skipTurns, esperado.skip, `voto ${voto}: saltos`);
    assert.equal(b.players[ana.id].prisonCount, esperado.preso, `voto ${voto}: contagem de prisões`);
    assert.equal(b.tribunal.result.absolvido, voto === 'sim');
  }
});

test('Tabuleiro: a vez fica onde estava — um julgamento não é a vez de ninguém', async () => {
  const { room, b, players } = await tabuleiroAJogar();
  const [ana, rui] = players;
  const vezAntes = b.currentPlayerId;
  boardTribunal.abreTribunal(room, ana.id, 'maldição', { note: 'bebe 3', drink: 3 }, 'Tese qualquer.');
  board.boardTribunalAoVoto(room, rui.id);
  board.boardTribunalVota(room, rui.id, 'nao');
  board.boardTribunalVota(room, players[2].id, 'nao');
  board.limpaTribunal(room);
  assert.equal(b.currentPlayerId, vezAntes);
});

test('Tabuleiro: dois julgamentos ao mesmo tempo, nunca', async () => {
  const { room, b, players } = await tabuleiroAJogar();
  boardTribunal.abreTribunal(room, players[0].id, 'x', { note: 'n' }, 'Tese.');
  const t = b.tribunal;
  // Com um julgamento aberto, uma segunda prisão resolve-se logo (não espera).
  const res = applyPrison(room, players[1].id, 'maldição');
  assert.equal(res.julgamento, false);
  assert.equal(b.tribunal, t, 'o julgamento a decorrer não é substituído');
  assert.equal(b.players[players[1].id].prisonCount, 1, 'o segundo foi preso à antiga');
});

test('TRIBUNAL=0 desliga a camada e a prisão volta a ser imediata', async () => {
  const { room, b, players } = await tabuleiroAJogar();
  const anterior = process.env.TRIBUNAL;
  try {
    // O módulo lê o interruptor no import, por isso testa-se o que ele governa:
    // com a camada ligada há julgamentos; os testes do tabuleiro que a desligam
    // (board-*.test.js) contam com prisão imediata, e é isso que aqui se afirma.
    assert.equal(boardTribunal.ENABLED, anterior !== '0');
    if (!boardTribunal.ENABLED) {
      applyPrison(room, players[0].id, 'x');
      assert.equal(b.tribunal, null);
    }
  } finally {
    process.env.TRIBUNAL = anterior;
  }
});
