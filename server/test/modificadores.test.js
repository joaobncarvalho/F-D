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

/**
 * Força uma ronda de Desafio no jogador da vez, sem depender do sorteio.
 *
 * Repõe o `roundCount` a cada giro descartado. Um giro que se deita fora não
 * aconteceu, e deixá-lo contar fazia a mesa "envelhecer" às centenas de rondas
 * enquanto se procurava um tipo — o que ligava sozinha a Morte Súbita (que
 * arranca à 20.ª ronda) e partia este ficheiro à sorte.
 */
async function rondaDesafio(room) {
  const spinnerId = room.game.currentPlayerId;
  const contagem = room.game.roundCount;
  for (let i = 0; i < 3000; i++) {
    const round = await game.spinWheel(room, spinnerId);
    if (round.gameTypeKey === 'desafio' && !round.needsBuddy) {
      room.game.roundCount = contagem + 1;
      return round;
    }
    room.game.round = null;
    room.game.phase = 'wheel';
    room.game.currentPlayerId = spinnerId;
    room.game.roundCount = contagem;
  }
  throw new Error('A roda nunca calhou num Desafio simples.');
}

test('normaliza: ignora chaves inventadas e não repete', () => {
  const out = modificadores.normaliza(['sem_escape', 'xpto', 'sem_escape', 'morte_subita']);
  assert.deepEqual(out, ['sem_escape', 'morte_subita']);
  assert.deepEqual(modificadores.normaliza(null), []);
});

test('setVetados: só o host, e só no lobby', () => {
  const { rm, room, players } = makeRoom(['Ana', 'Rui']);
  const [ana, rui] = players;
  assert.throws(() => rm.setVetados(room.code, rui.id, ['sem_escape']), /host/i);
  rm.setVetados(room.code, ana.id, ['sem_escape']);
  assert.deepEqual(room.vetados, ['sem_escape']);
  room.status = 'playing';
  assert.throws(() => rm.setVetados(room.code, ana.id, []), /já começou/i);
});

test('uma sala nova já nasce com o Sem Anonimato vetado', () => {
  const { room } = makeRoom(['Ana', 'Rui']);
  assert.deepEqual(room.vetados, ['sem_anonimato']);
  // …e é isso que o mantém fora do sorteio sem ninguém tocar em nada.
  for (let i = 0; i < 200; i++) {
    const saiu = modificadores.sorteia({ intensity: 'caos', vetados: room.vetados });
    assert.ok(!saiu.includes('sem_anonimato'));
  }
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

test('o payload da sala leva o veto, o catálogo e o que está em vigor', () => {
  const { rm, room, players } = makeRoom(['Ana', 'Rui']);
  rm.setVetados(room.code, players[0].id, ['sem_anonimato', 'divida']);
  const noLobby = serializeRoom(room);
  assert.deepEqual(noLobby.modifiers.vetados, ['sem_anonimato', 'divida']);
  assert.deepEqual(noLobby.modifiers.ativos, [], 'no lobby ainda não há regras nenhumas');
  assert.equal(noLobby.modifiers.catalogo.length, modificadores.CATALOGO.length);
  assert.ok(noLobby.modifiers.catalogo.every((m) => m.label && m.desc && m.emoji));

  game.initGame(room, { lives: 3, modifiers: ['sem_escape'] });
  room.game.modifiersTemp = { sem_escape: 3 };
  const aJogar = serializeRoom(room);
  assert.deepEqual(aJogar.modifiers.ativos, ['sem_escape']);
  assert.deepEqual(aJogar.modifiers.prazos, { sem_escape: 3 });
});

// ----- O sorteio ---------------------------------------------------------------

test('sorteia: a intensidade decide quantas regras a noite apanha', () => {
  for (const [nivel, plano] of Object.entries(modificadores.PLANO)) {
    const vistos = new Set();
    for (let i = 0; i < 400; i++) {
      const saiu = modificadores.sorteia({ intensity: nivel });
      assert.ok(
        saiu.length >= plano.inicio[0] && saiu.length <= plano.inicio[1],
        `${nivel}: saíram ${saiu.length}, esperado ${plano.inicio.join('–')}`
      );
      assert.equal(new Set(saiu).size, saiu.length, 'nunca repete');
      saiu.forEach((k) => vistos.add(k));
    }
    // Em 400 noites o sorteio tem de ter mexido em mais do que uma regra —
    // um sorteio que sai sempre no mesmo é um sorteio partido.
    if (plano.inicio[1] > 0) assert.ok(vistos.size >= 3, `${nivel}: só saíram ${vistos.size} regras`);
  }
});

test('sorteia: ⛓️ + 💀 juntos só em caos', () => {
  for (const nivel of ['leve', 'picante', 'hardcore']) {
    for (let i = 0; i < 500; i++) {
      const saiu = modificadores.sorteia({ intensity: nivel });
      assert.ok(
        !(saiu.includes('sem_escape') && saiu.includes('morte_subita')),
        `${nivel} não pode juntar Sem Escape com Morte Súbita`
      );
    }
  }
  // Em caos pode — e ao fim de muitas noites tem mesmo de acontecer.
  let houve = false;
  for (let i = 0; i < 800 && !houve; i++) {
    const saiu = modificadores.sorteia({ intensity: 'caos' });
    houve = saiu.includes('sem_escape') && saiu.includes('morte_subita');
  }
  assert.ok(houve, 'em caos a combinação tem de ser possível');
});

test('sorteia: o veto é absoluto', () => {
  const veto = ['sem_escape', 'morte_subita', 'divida', 'sem_anonimato'];
  for (let i = 0; i < 400; i++) {
    const saiu = modificadores.sorteia({ intensity: 'caos', vetados: veto });
    assert.ok(saiu.every((k) => !veto.includes(k)), `vetado saiu: ${saiu}`);
  }
  // Vetar tudo é legítimo: dá uma noite sem regras nenhumas, não um erro.
  assert.deepEqual(modificadores.sorteia({ intensity: 'caos', vetados: modificadores.KEYS }), []);
});

test('a meio da noite: cai uma regra nova, com carta para o cliente', () => {
  const { room } = start(['Ana', 'Rui', 'Zé'], { sorteio: true, modifiers: [] });
  room.game.modifiers = []; // parte-se de zero para o teste ser sobre o que CAI
  room.game.intensity = 'caos';
  room.game.roundCount = 30;
  room.game.proximoModificadorNa = 10;

  assert.equal(modificadores.horaDeSorteio(room), true);
  const nova = modificadores.sorteiaAMeio(room);
  assert.ok(nova, 'tem de cair alguma coisa');
  assert.ok(room.game.modifiers.includes(nova.key), 'e tem de ficar LIGADA');
  assert.ok(nova.titulo && nova.desc && nova.emoji && nova.em);
  // Só entram a meio as regras que não criam estado.
  assert.ok(!['divida', 'sem_anonimato'].includes(nova.key));
  // Reagendou-se — não pode voltar a cair na ronda seguinte.
  assert.ok(room.game.proximoModificadorNa > room.game.roundCount);
  assert.equal(modificadores.horaDeSorteio(room), false);
});

test('a meio da noite: nunca passa do teto da intensidade, nem na última ronda', () => {
  const { room } = start(['Ana', 'Rui', 'Zé'], { sorteio: true });
  const g = room.game;
  g.intensity = 'leve'; // teto 1
  g.modifiers = ['dobro_ou_nada'];
  g.roundCount = 50;
  g.proximoModificadorNa = 1;
  assert.equal(modificadores.horaDeSorteio(room), false, 'teto cheio');

  g.intensity = 'hardcore'; // teto 4
  assert.equal(modificadores.horaDeSorteio(room), true);
  g.finale = true;
  assert.equal(modificadores.horaDeSorteio(room), false, 'não cai na última ronda');
});

test('sem sorteio ligado, nunca cai regra nenhuma a meio', () => {
  const { room } = start(['Ana', 'Rui', 'Zé'], { modifiers: ['sem_escape'] });
  room.game.roundCount = 999;
  room.game.proximoModificadorNa = 1;
  assert.equal(modificadores.horaDeSorteio(room), false);
});

test('regras com prazo: expiram sozinhas e largam a mira do Alvo Marcado', () => {
  const { room, players } = start(['Ana', 'Rui', 'Zé'], { modifiers: ['alvo_marcado', 'sem_escape'] });
  const g = room.game;
  g.modifiersTemp = { alvo_marcado: 2 };
  g.alvoMarcadoId = players[0].id;
  g.alvoSeguidas = 1;

  assert.deepEqual(modificadores.passaRonda(room), [], 'ainda falta uma ronda');
  assert.ok(g.modifiers.includes('alvo_marcado'));

  const fora = modificadores.passaRonda(room);
  assert.deepEqual(fora.map((m) => m.key), ['alvo_marcado']);
  assert.deepEqual(g.modifiers, ['sem_escape'], 'só sai a que tinha prazo');
  assert.equal(g.alvoMarcadoId, null, 'a mira tem de cair com a regra');
  assert.equal(g.alvoSeguidas, 0);

  // …e não volta a sair: uma regra que vai e vem deixa de ser um acontecimento.
  g.sorteio = true;
  g.intensity = 'caos';
  g.roundCount = 40;
  for (let i = 0; i < 30; i++) {
    g.proximoModificadorNa = 1;
    const nova = modificadores.sorteiaAMeio(room);
    if (!nova) break;
    assert.notEqual(nova.key, 'alvo_marcado', 'a que já teve prazo não volta');
  }
});

test('avisos: combinações que a mesa deve conhecer antes de começar', () => {
  assert.equal(modificadores.avisos([], 'leve').length, 0);
  assert.ok(modificadores.avisos(['sem_escape', 'morte_subita'], 'leve').length >= 1);
  assert.ok(modificadores.avisos(['sem_escape', 'alvo_marcado', 'dobro_ou_nada'], 'caos').length >= 2);
});
