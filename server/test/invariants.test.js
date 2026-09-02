// F&D — testes de INVARIANTES críticos (node:test, sem rede, sem BD).
//
// Estes testes protegem as Regras de Ouro do projeto durante o desenvolvimento
// rápido à volta do playtest. Foco: as coisas que, se partirem em silêncio,
// estragam o jogo — sobretudo o ANONIMATO (regra de ouro #7) e a rotação de vez.
//
// Correr: `npm test` (na pasta server/). Não precisa de Supabase — o repo.js cai
// para o conteúdo em código quando não há DATABASE_URL (que aqui removemos).

import { test } from 'node:test';
import assert from 'node:assert/strict';

// Garante que o motor corre contra o conteúdo em memória (nunca toca na BD real).
delete process.env.DATABASE_URL;

const { RoomManager, serializeRoom } = await import('../src/rooms.js');
const game = await import('../src/game.js');
const board = await import('../src/board.js');

// ----- helpers --------------------------------------------------------------

/** Cria uma sala com `names[0]` como host e os restantes juntos, todos ligados. */
function makeRoom(names) {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom(names[0]);
  const players = [host];
  for (const name of names.slice(1)) {
    players.push(rm.joinRoom(room.code, name).player);
  }
  return { rm, room, players };
}

/**
 * Gira a roda repetidamente (mantendo o mesmo spinner) até sair `key`. A roda é
 * aleatória, por isso damos várias tentativas; entre elas repomos a fase 'wheel'.
 */
async function spinUntil(room, key, maxTries = 600) {
  const spinnerId = room.game.currentPlayerId;
  for (let i = 0; i < maxTries; i++) {
    const round = await game.spinWheel(room, spinnerId);
    if (round.gameTypeKey === key) return round;
    room.game.round = null;
    room.game.phase = 'wheel';
    room.game.currentPlayerId = spinnerId; // spinWheel não mexe na vez, mas garantimos
  }
  throw new Error(`A roda nunca calhou no tipo "${key}" em ${maxTries} tentativas.`);
}

/** Verdadeiro se `needle` aparece em qualquer sítio do objeto serializado. */
function leaks(obj, needle) {
  return JSON.stringify(obj).includes(needle);
}

// ----- ANONIMATO: Segredos --------------------------------------------------

test('Segredos: o autor nunca vai no payload antes do reveal', async () => {
  const { room, players } = makeRoom(['Ana', 'Rui', 'Zé']);
  const [ana, rui] = players;
  game.initGame(room, { lives: 3 });
  game.addSecret(room, rui.id, 'Uma vez comi um íman.'); // autor = Rui (não o spinner)
  game.beginPlay(room, ana.id); // vez começa no Ana (host)

  const round = await spinUntil(room, 'segredos');
  assert.ok(round.secretAuthorId, 'o motor deve saber o autor internamente');

  const payload = serializeRoom(room);
  const r = payload.game.round;
  assert.equal(r.gameTypeKey, 'segredos');
  assert.equal(r.revealed, false, 'ainda não revelado');
  assert.equal(r.result, null, 'sem result antes do reveal');
  assert.ok(!('secretAuthorId' in r), 'secretAuthorId não pode ser serializado');
  assert.ok(
    !leaks(r, round.secretAuthorId),
    'o id do autor não pode aparecer em lado nenhum da ronda serializada'
  );
});

// ----- ANONIMATO: Piramide (mãos privadas) ----------------------------------

test('Piramide: as mãos dos jogadores nunca vão no broadcast', async () => {
  const { room, players } = makeRoom(['Ana', 'Rui', 'Zé']);
  const [ana] = players;
  game.initGame(room, { lives: 3 });
  game.beginPlay(room, ana.id);

  await spinUntil(room, 'piramide');

  // A mão privada existe e é entregue só ao próprio.
  const hand = game.piramideHand(room, ana.id);
  assert.ok(Array.isArray(hand) && hand.length === 3, 'cada jogador tem 3 cartas privadas');

  const r = serializeRoom(room).game.round;
  assert.ok(!('hands' in r), 'as mãos não podem ser serializadas');
  // Cartas da pirâmide ainda por virar não revelam o número/naipe.
  for (const c of r.pyramid) {
    if (!c.flipped) {
      assert.equal(c.rank, null, 'carta por virar não revela rank');
      assert.equal(c.suit, null, 'carta por virar não revela suit');
    }
  }
});

// ----- ANONIMATO: Jogo do Vasco (palavra e impostores privados) -------------

test('Vasco: a palavra secreta e a identidade dos Vascos não vão no broadcast', async () => {
  // Quatro jogadores porque o Vasco exige mesa (TYPE_PROFILE.vasco.min = 4): com
  // três, a acusação é entre duas pessoas e o jogo não funciona.
  const { room, players } = makeRoom(['Ana', 'Rui', 'Zé', 'Nel']);
  const [ana] = players;
  game.initGame(room, { lives: 3 });
  game.beginPlay(room, ana.id);

  const round = await spinUntil(room, 'vasco');
  const secretWord = round.secretWord;
  assert.ok(secretWord, 'o motor conhece a palavra secreta internamente');

  // O papel privado é entregue por vasco_role (não no room_state).
  const role = game.vascoRole(room, ana.id);
  assert.ok(role && typeof role.isImpostor === 'boolean', 'papel privado disponível');

  const r = serializeRoom(room).game.round;
  assert.ok(!('secretWord' in r), 'secretWord não pode ser serializada');
  assert.ok(!('impostorIds' in r), 'impostorIds não pode ser serializado');
  assert.ok(r.theme, 'o tema (pista pública) está presente');
  assert.equal(r.result, null, 'sem result durante reveal/clues');
  assert.ok(!leaks(r, secretWord), 'a palavra secreta não pode aparecer na ronda serializada');
});

// ----- ROTAÇÃO DE VEZ: salta desligados -------------------------------------

test('Rotação: a vez salta jogadores desligados', async () => {
  const { room, players } = makeRoom(['Ana', 'Rui', 'Zé', 'Bea']);
  const [ana, rui, ze, bea] = players;
  game.initGame(room, { lives: 3 });
  game.beginPlay(room, ana.id);

  room.game.currentPlayerId = rui.id; // força a vez no Rui
  room.players.get(ze.id).connected = false; // Zé cai

  const round = await spinUntil(room, 'desafio');
  round.needsBuddy = false; // evita bloqueio por buddy neste teste
  game.resolveAction(room, rui.id, 'accept');

  assert.equal(room.game.currentPlayerId, bea.id, 'saltou o Zé (desligado) e foi para a Bea');
});

// ----- VIDAS → 0: elimina e passa a espectador ------------------------------

test('Vidas a 0: recusa fatal elimina o jogador e sobra o último de pé', async () => {
  const { room, players } = makeRoom(['Ana', 'Rui']);
  const [ana, rui] = players;
  game.initGame(room, { lives: 1 }); // uma recusa é fatal
  game.beginPlay(room, ana.id);

  const round = await spinUntil(room, 'desafio');
  round.needsBuddy = false;
  const res = game.resolveAction(room, ana.id, 'refuse');

  assert.equal(room.players.get(ana.id).eliminated, true, 'Ana ficou sem vidas → eliminada');
  assert.ok(res.gameOver, 'com ≤1 ativo, o jogo termina automaticamente');
  assert.equal(res.gameOver.survivor?.id, rui.id, 'o sobrevivente é o Rui');
});

test('Rotação: a vez salta jogadores eliminados', async () => {
  const { room, players } = makeRoom(['Ana', 'Rui', 'Zé']);
  const [ana, rui, ze] = players;
  game.initGame(room, { lives: 1 });
  game.beginPlay(room, ana.id); // vez = Ana

  const round = await spinUntil(room, 'desafio');
  round.needsBuddy = false;
  game.resolveAction(room, ana.id, 'refuse'); // Ana → 0 vidas → eliminada

  assert.equal(room.players.get(ana.id).eliminated, true);
  // Sobram Rui e Zé (2 ativos → jogo continua); a vez saltou a Ana eliminada.
  assert.equal(room.game.currentPlayerId, rui.id, 'a vez passou para o Rui, saltando a Ana');
});

// ----- Modo Tabuleiro: cartas privadas --------------------------------------

test('Tabuleiro: as cartas de cada jogador não vão no broadcast', async () => {
  const { room, players } = makeRoom(['Ana', 'Rui', 'Zé']);
  room.mode = 'board';
  room.status = 'playing';
  await board.initBoard(room, { intensity: 'leve' });

  const serialized = serializeRoom(room).board;
  assert.ok(serialized, 'o tabuleiro é serializado');
  // Nenhum jogador serializado pode expor a lista de cartas (só a contagem).
  for (const p of Object.values(serialized.players || {})) {
    assert.ok(!('cards' in p), 'a mão do jogador não pode ir no broadcast do tabuleiro');
  }
});
