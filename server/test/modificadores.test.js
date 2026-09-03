// F&D — testes dos Modificadores da noite (game/modificadores.js).
//
// O que aqui se protege são REGRAS, não ecrãs: cada modificador muda o custo de
// uma decisão, e um custo errado só se descobre à mesa, tarde de mais. Em
// especial a promessa de segurança do módulo — nenhum modificador manda beber
// mais — que é fácil de partir sem dar por isso ao mexer no `resolveAction`.

import { test } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL;
process.env.EVENTOS = '0'; // aqui contam-se vidas exatas — sem eventos pelo meio

const { RoomManager, serializeRoom } = await import('../src/rooms.js');
const game = await import('../src/game.js');
const modificadores = await import('../src/game/modificadores.js');

function makeRoom(names) {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom(names[0]);
  const players = [host];
  for (const n of names.slice(1)) players.push(rm.joinRoom(room.code, n).player);
  return { rm, room, players };
}

function start(names = ['Ana', 'Rui', 'Zé'], opts = {}) {
  const { rm, room, players } = makeRoom(names);
  game.initGame(room, { lives: 3, ...opts });
  game.beginPlay(room, players[0].id);
  return { rm, room, players };
}

/** Força uma ronda de Desafio no jogador da vez, sem depender do sorteio. */
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

test('normaliza: ignora chaves inventadas e não repete', () => {
  const out = modificadores.normaliza(['sem_escape', 'xpto', 'sem_escape', 'morte_subita']);
  assert.deepEqual(out, ['sem_escape', 'morte_subita']);
  assert.deepEqual(modificadores.normaliza(null), []);
});

test('setModifiers: só o host, e só no lobby', () => {
  const { rm, room, players } = makeRoom(['Ana', 'Rui']);
  const [ana, rui] = players;
  assert.throws(() => rm.setModifiers(room.code, rui.id, ['sem_escape']), /host/i);
  rm.setModifiers(room.code, ana.id, ['sem_escape']);
  assert.deepEqual(room.modifiers, ['sem_escape']);
  room.status = 'playing';
  assert.throws(() => rm.setModifiers(room.code, ana.id, []), /já começou/i);
});

test('Sem Escape: recusar custa duas vidas em vez de uma', async () => {
  const { room, players } = start(['Ana', 'Rui', 'Zé'], { modifiers: ['sem_escape'] });
  const [ana] = players;
  await rondaDesafio(room);
  game.resolveAction(room, ana.id, 'refuse');
  assert.equal(room.players.get(ana.id).lives, 1, 'de 3 para 1');
  // …e continua a beber UMA vez: o modificador sobe o risco, não o copo.
  assert.equal(room.game.stats[ana.id].drinks, 1);
});

test('Sem Escape: não empurra ninguém para lá do zero', async () => {
  const { room, players } = start(['Ana', 'Rui', 'Zé'], { lives: 1, modifiers: ['sem_escape'] });
  const [ana] = players;
  await rondaDesafio(room);
  const { effect } = game.resolveAction(room, ana.id, 'refuse');
  assert.equal(effect.type, 'eliminated');
  assert.equal(room.players.get(ana.id).lives, 0);
});

test('Alvo Marcado: quem perde vida volta a ser o alvo — mas não para sempre', async () => {
  const { room, players } = start(['Ana', 'Rui', 'Zé'], { modifiers: ['alvo_marcado'] });
  const [ana] = players;
  for (let i = 0; i < 2; i++) {
    await rondaDesafio(room);
    assert.equal(room.game.currentPlayerId, ana.id, `ronda ${i + 1}: a Ana está na mira`);
    game.resolveAction(room, ana.id, 'refuse');
  }
  // Terceira perda seguida: o travão salta e a vez volta à rotação normal.
  await rondaDesafio(room);
  assert.equal(room.game.currentPlayerId, ana.id, 'a segunda marca ainda vale');
  game.resolveAction(room, ana.id, 'refuse'); // fica sem vidas → sai
  assert.notEqual(room.game.currentPlayerId, ana.id, 'quem sai nunca fica na mira');
});

test('sem o modificador, a vez roda como sempre', async () => {
  const { room, players } = start(['Ana', 'Rui', 'Zé']);
  const [ana, rui] = players;
  await rondaDesafio(room);
  game.resolveAction(room, ana.id, 'refuse');
  assert.equal(room.game.currentPlayerId, rui.id);
});

test('Morte Súbita: só vale no fim, e aí recusar põe fora', async () => {
  const { room, players } = start(['Ana', 'Rui', 'Zé'], { modifiers: ['morte_subita'] });
  const [ana] = players;
  await rondaDesafio(room);
  assert.equal(modificadores.morteSubita(room), false, 'no aquecimento não vale');
  game.resolveAction(room, ana.id, 'refuse');
  assert.equal(room.players.get(ana.id).lives, 2, 'ainda é só uma vida');

  room.game.roundCount = 40; // noite avançada (sem duração planeada → conta rondas)
  assert.equal(modificadores.morteSubita(room), true);
  const alvo = room.game.currentPlayerId;
  await rondaDesafio(room);
  const { effect } = game.resolveAction(room, alvo, 'refuse');
  assert.equal(effect.type, 'eliminated');
  assert.equal(room.players.get(alvo).eliminated, true);
  // A saída NÃO conta um shot: o castigo é sair, não beber mais.
  assert.equal(room.game.stats[alvo].shots || 0, 0);
});

test('Morte Súbita com duração planeada conta o relógio, não as rondas', () => {
  const { room } = start(['Ana', 'Rui', 'Zé'], { modifiers: ['morte_subita'], duracaoMin: 60 });
  room.game.startedAt = Date.now() - 30 * 60000; // meia hora de 60 min
  assert.equal(modificadores.morteSubita(room), false);
  room.game.startedAt = Date.now() - 45 * 60000; // último terço
  assert.equal(modificadores.morteSubita(room), true);
});

test('Dobro ou Nada: a mesa decide — ganha vida ou perde vida', async () => {
  const { room, players } = start(['Ana', 'Rui', 'Zé'], { modifiers: ['dobro_ou_nada'] });
  const [ana, rui, ze] = players;
  await rondaDesafio(room);
  assert.equal(serializeRoom(room).game.podeDobrar, true);

  game.resolveAction(room, ana.id, 'double');
  assert.equal(room.game.round.status, 'doubling');
  assert.throws(() => game.votaVeredito(room, ana.id, 'sim'), /em ti próprio/i);

  game.votaVeredito(room, rui.id, 'sim');
  game.votaVeredito(room, ze.id, 'sim');
  assert.equal(room.players.get(ana.id).lives, 4, 'a mesa deu por bom → mais uma vida');
  assert.equal(room.game.round.status, 'resolved');

  game.continueRound(room, ana.id);
  assert.equal(room.game.phase, 'wheel');
});

test('Dobro ou Nada: falhar custa a vida que estava em jogo', async () => {
  const { room, players } = start(['Ana', 'Rui', 'Zé'], { modifiers: ['dobro_ou_nada'] });
  const [ana, rui, ze] = players;
  await rondaDesafio(room);
  game.resolveAction(room, ana.id, 'double');
  game.votaVeredito(room, rui.id, 'nao');
  game.votaVeredito(room, ze.id, 'nao');
  assert.equal(room.players.get(ana.id).lives, 2);
  // Perder o dobro não é beber: continua sem goles nesta ronda.
  assert.equal(room.game.stats[ana.id]?.drinks || 0, 0);
});

test('sem o modificador não se pode dobrar', async () => {
  const { room, players } = start(['Ana', 'Rui', 'Zé']);
  const [ana] = players;
  await rondaDesafio(room);
  assert.equal(serializeRoom(room).game.podeDobrar, false);
  assert.throws(() => game.resolveAction(room, ana.id, 'double'), /dobrar/i);
});

test('o payload da sala leva os modificadores e o catálogo', () => {
  const { rm, room, players } = makeRoom(['Ana', 'Rui']);
  rm.setModifiers(room.code, players[0].id, ['sem_anonimato']);
  const s = serializeRoom(room);
  assert.deepEqual(s.modifiers.ativos, ['sem_anonimato']);
  assert.equal(s.modifiers.catalogo.length, modificadores.CATALOGO.length);
  assert.ok(s.modifiers.catalogo.every((m) => m.label && m.desc && m.emoji));
});

test('avisos: combinações que a mesa deve conhecer antes de começar', () => {
  assert.equal(modificadores.avisos([], 'leve').length, 0);
  assert.ok(modificadores.avisos(['sem_escape', 'morte_subita'], 'leve').length >= 1);
  assert.ok(modificadores.avisos(['sem_escape', 'alvo_marcado', 'dobro_ou_nada'], 'caos').length >= 2);
});
