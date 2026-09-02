// F&D — invariantes de robustez que vieram da revisão pré-playtest.
//
// Cada teste aqui fixa um buraco que EXISTIU e foi fechado. Não são casos
// hipotéticos: os primeiros foram reproduzidos com clientes a sério antes de
// haver correção.
//
//   1. Fazer-se passar por outro jogador (o playerId vai no broadcast, o token não).
//   2. Sala sem teto de jogadores.
//   3. Quem chega tarde ficava à porta.
//   4. Salas órfãs a acumular em memória.
//   5. A roda ignorava o tamanho da mesa e repetia-se.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';

delete process.env.DATABASE_URL; // conteúdo em memória
process.env.SNAPSHOT = '0';
process.env.AUTO_RESOLVE_MS = '0';

const { registerSocketHandlers } = await import('../src/socket.js');
const { RoomManager, serializeRoom } = await import('../src/rooms.js');
const game = await import('../src/game.js');

async function arranca() {
  const http = createServer();
  const io = new Server(http, { cors: { origin: '*' } });
  registerSocketHandlers(io);
  await new Promise((res) => http.listen(0, res));
  const url = `http://localhost:${http.address().port}`;
  const abertos = [];
  const cliente = () => {
    const s = connect(url, { transports: ['websocket'], forceNew: true });
    abertos.push(s);
    return s;
  };
  const fechar = async () => {
    for (const s of abertos) s.close();
    io.close();
    await new Promise((res) => http.close(res));
  };
  return { cliente, fechar };
}

function pede(socket, evento, payload = {}) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`sem resposta a ${evento}`)), 3000);
    socket.emit(evento, payload, (r) => {
      clearTimeout(t);
      res(r);
    });
  });
}

// ----- 1. Identidade --------------------------------------------------------

test('rejoin: o playerId sozinho não chega para assumir a identidade de outro', async (t) => {
  const { cliente, fechar } = await arranca();
  t.after(fechar);

  const anfitriao = cliente();
  const intruso = cliente();
  const criada = await pede(anfitriao, 'create_room', { name: 'Ana' });
  const entrou = await pede(intruso, 'join_room', { code: criada.room.code, name: 'Bruno' });

  // O id da Ana está à vista de toda a gente — tem de estar, o cliente precisa
  // dele para desenhar a mesa. É por isso que não pode servir de senha.
  const idDaAna = entrou.room.players.find((p) => p.name === 'Ana').id;
  assert.equal(idDaAna, criada.you);

  const semToken = await pede(intruso, 'rejoin_room', { code: criada.room.code, playerId: idDaAna });
  assert.equal(semToken.ok, false, 'sem token, o rejoin tem de ser recusado');

  const tokenErrado = await pede(intruso, 'rejoin_room', {
    code: criada.room.code,
    playerId: idDaAna,
    token: entrou.token, // o token DELE, não o dela
  });
  assert.equal(tokenErrado.ok, false, 'o token de outro jogador não serve');

  // O intruso continua a ser ele próprio: não herdou os poderes de host.
  const modo = await pede(intruso, 'set_mode', { mode: 'board' });
  assert.equal(modo.ok, false, 'só o host escolhe o modo');

  // E a dona da sessão religa-se sem problema nenhum.
  const legitimo = await pede(anfitriao, 'rejoin_room', {
    code: criada.room.code,
    playerId: idDaAna,
    token: criada.token,
  });
  assert.equal(legitimo.ok, true, 'com o token certo, religa');
});

test('o token nunca viaja no estado da sala', async (t) => {
  const { cliente, fechar } = await arranca();
  t.after(fechar);
  const a = cliente();
  const b = cliente();
  const criada = await pede(a, 'create_room', { name: 'Ana' });
  const entrou = await pede(b, 'join_room', { code: criada.room.code, name: 'Bruno' });

  assert.ok(criada.token, 'quem cria recebe o seu token');
  assert.ok(!JSON.stringify(entrou.room).includes(criada.token), 'o token da Ana não pode aparecer no broadcast');
  assert.ok(entrou.room.players.every((p) => !('token' in p)), 'nenhum jogador leva token no payload');
});

// ----- 2. Teto de jogadores -------------------------------------------------

test('a sala tem um teto de jogadores (e recusa com uma mensagem útil)', () => {
  const rm = new RoomManager();
  const { room } = rm.createRoom('Ana');
  for (let i = 1; i < 12; i++) rm.joinRoom(room.code, `J${i}`);
  assert.equal(room.players.size, 12);
  assert.throws(() => rm.joinRoom(room.code, 'Tarde'), /cheia/i);
});

// ----- 3. Entrar a meio -----------------------------------------------------

test('Roda: quem chega a meio entra na rotação com as vidas da mesa', () => {
  const rm = new RoomManager();
  const { room, player: ana } = rm.createRoom('Ana');
  rm.joinRoom(room.code, 'Rui');
  rm.joinRoom(room.code, 'Zé');
  rm.startGame(room.code, ana.id);
  game.initGame(room, { lives: 5 });
  game.beginPlay(room, ana.id);

  const { player: tarde, latecomer } = rm.joinRoom(room.code, 'Nel');
  assert.equal(latecomer, true, 'a sala aceita quem chega com o jogo a decorrer');
  game.addLatecomer(room, tarde);

  assert.equal(tarde.lives, 5, 'joga com as MESMAS vidas com que a mesa começou');
  assert.equal(tarde.eliminated, false);
  const ordem = serializeRoom(room).players.map((p) => p.name);
  assert.deepEqual(ordem, ['Ana', 'Rui', 'Zé', 'Nel'], 'entra no fim da ordem de chegada');
});

test('Tabuleiro: quem chega a meio começa na casa do último (nem à partida, nem à frente)', async () => {
  const board = await import('../src/board.js');
  const rm = new RoomManager();
  const { room, player: ana } = rm.createRoom('Ana');
  const { player: rui } = rm.joinRoom(room.code, 'Rui');
  rm.setMode(room.code, ana.id, 'board');
  rm.startGame(room.code, ana.id);
  await board.initBoard(room, { intensity: 'leve' });

  room.board.players[ana.id].pos = 20;
  room.board.players[rui.id].pos = 8;

  const { player: tarde } = rm.joinRoom(room.code, 'Nel');
  board.addLatecomer(room, tarde);

  const pl = room.board.players[tarde.id];
  assert.equal(pl.pos, 8, 'entra onde está quem vai em último');
  assert.ok(pl.pawn, 'recebe um peão livre automaticamente');
  assert.ok(room.board.order.includes(tarde.id), 'entra na ordem de jogo');
  assert.equal(room.board.order[room.board.order.length - 1], tarde.id, 'joga a seguir a quem já esperava');
});

test('um jogo terminado recusa quem chega (o caminho é o host voltar ao lobby)', () => {
  const rm = new RoomManager();
  const { room, player: ana } = rm.createRoom('Ana');
  rm.joinRoom(room.code, 'Rui');
  rm.startGame(room.code, ana.id);
  room.status = 'ended';
  assert.throws(() => rm.joinRoom(room.code, 'Nel'), /terminou/i);
});

// ----- 4. Salas órfãs -------------------------------------------------------

test('criar uma segunda sala não deixa um fantasma ligado na primeira', async (t) => {
  const { cliente, fechar } = await arranca();
  t.after(fechar);

  const c = cliente();
  const primeira = await pede(c, 'create_room', { name: 'Ana' });
  const segunda = await pede(c, 'create_room', { name: 'Ana' });
  assert.notEqual(primeira.room.code, segunda.room.code);

  // Alguém entra na sala abandonada e vê-a como ela está mesmo: sem a Ana ligada.
  const outro = cliente();
  const vista = await pede(outro, 'join_room', { code: primeira.room.code, name: 'Bruno' });
  assert.equal(vista.ok, true);
  const fantasma = vista.room.players.find((p) => p.name === 'Ana');
  assert.equal(fantasma.connected, false, 'a Ana já não está ligada à sala que abandonou');
  assert.equal(vista.room.hostPlayerId, vista.you, 'e o host passou para quem lá está');
});

// ----- 5. A roda ------------------------------------------------------------

test('a roda não sorteia tipos que a mesa não tem gente para jogar', () => {
  const types = [
    { key: 'desafio', label: 'Desafio' },
    { key: 'vasco', label: 'Vasco' },
    { key: 'piramide', label: 'Pirâmide' },
    { key: 'eu_nunca', label: 'Eu Nunca' },
  ];
  const saidas = new Set();
  for (let i = 0; i < 500; i++) saidas.add(game.pickWeightedType(types, { jogadores: 2 }).key);
  assert.ok(!saidas.has('vasco'), 'o Vasco precisa de 4 (com 2 é uma acusação a dois)');
  assert.ok(!saidas.has('piramide'), 'a Pirâmide precisa de 3');
  assert.ok(saidas.has('desafio') && saidas.has('eu_nunca'), 'os curtos servem qualquer mesa');

  const comMesa = new Set();
  for (let i = 0; i < 500; i++) comMesa.add(game.pickWeightedType(types, { jogadores: 6 }).key);
  assert.equal(comMesa.size, 4, 'com mesa cheia, tudo volta a entrar na roda');
});

test('a roda evita os tipos que acabaram de sair', () => {
  const types = ['desafio', 'eu_nunca', 'mimica', 'termometro', 'cascata', 'reacao']
    .map((key) => ({ key, label: key }));
  for (let i = 0; i < 300; i++) {
    const escolhido = game.pickWeightedType(types, { jogadores: 6, recentes: ['desafio', 'eu_nunca'] });
    assert.ok(!['desafio', 'eu_nunca'].includes(escolhido.key), 'não repete o que saiu nas duas últimas voltas');
  }
});

test('mesa pequena de mais: prefere-se repetir a ficar sem roda', () => {
  const types = [{ key: 'desafio', label: 'Desafio' }, { key: 'eu_nunca', label: 'Eu Nunca' }];
  // Só há dois tipos e ambos são "recentes" — a roda tem de devolver um deles à
  // mesma. Uma roda vazia encravava o jogo; um tipo repetido só aborrece.
  const escolhido = game.pickWeightedType(types, { jogadores: 2, recentes: ['desafio', 'eu_nunca'] });
  assert.ok(['desafio', 'eu_nunca'].includes(escolhido.key));
});

test('a roda respeita os pesos (os jogos longos saem menos)', () => {
  const types = [{ key: 'desafio', label: 'D' }, { key: 'vasco', label: 'V' }];
  let desafios = 0;
  const N = 4000;
  for (let i = 0; i < N; i++) if (game.pickWeightedType(types, { jogadores: 6 }).key === 'desafio') desafios += 1;
  // Pesos 12 vs 3 → o desafio deve ficar perto de 80%. Folga larga de propósito:
  // um teste de aleatoriedade que falha de vez em quando é pior do que nenhum.
  assert.ok(desafios / N > 0.7, `o desafio saiu ${((desafios / N) * 100).toFixed(0)}% das vezes`);
});

// ----- 6. A curva de intensidade do lobby -----------------------------------

test('a curva desligada no lobby chega mesmo ao motor da Roda', async (t) => {
  const { cliente, fechar } = await arranca();
  t.after(fechar);
  const a = cliente();
  const b = cliente();
  const criada = await pede(a, 'create_room', { name: 'Ana' });
  await pede(b, 'join_room', { code: criada.room.code, name: 'Bruno' });

  await pede(a, 'vote_intensity', { intensity: 'caos' });
  await pede(a, 'set_curve', { on: false });
  await pede(a, 'start_game', { lives: 3 });

  // Com a curva desligada, a intensidade votada vale desde a primeira ronda.
  // Com ela ligada, a noite começa sempre leve — é esse o ponto da curva.
  const semCurva = await pede(a, 'rejoin_room', {
    code: criada.room.code, playerId: criada.you, token: criada.token,
  });
  assert.equal(semCurva.room.game.curve, false, 'o motor tem de receber a escolha do host');
  assert.equal(semCurva.room.game.intensity, 'caos', 'sem curva, começa-se já no teto votado');
});
