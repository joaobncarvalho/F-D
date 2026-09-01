// F&D — invariantes dos tipos de mesa inteira (2026-09-01).
//
// O que aqui se protege é o que faz estes jogos funcionarem: se as respostas ou
// o autor/palavra vazassem no broadcast antes do reveal, o jogo deixava de ter
// graça (e o anonimato do "Quem Disse" desaparecia).

import { test } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL; // corre contra o conteúdo em memória

const { RoomManager, serializeRoom } = await import('../src/rooms.js');
const game = await import('../src/game.js');

function sala(n = 4) {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom('Ana');
  const nomes = ['Bruno', 'Carla', 'Duarte', 'Eva'].slice(0, n - 1);
  const outros = nomes.map((nome) => rm.joinRoom(room.code, nome).player);
  room.status = 'playing';
  game.initGame(room, { lives: 3, curve: false });
  return { rm, room, host, outros, todos: [host, ...outros] };
}

/** Força a roda a sair num tipo específico (o sorteio é aleatório). */
async function forcaTipo(room, host, key) {
  let guard = 0;
  while (guard++ < 500) {
    room.game.phase = 'wheel';
    room.game.currentPlayerId = host.id;
    room.game.round = null;
    const round = await game.spinWheel(room, host.id);
    if (round.gameTypeKey === key) return round;
  }
  throw new Error(`nunca saiu o tipo ${key}`);
}

test('Grupo: as respostas não vão no broadcast antes do reveal', async () => {
  const { room, host, todos } = sala(4);
  await forcaTipo(room, host, 'eu_nunca');

  game.grupoAnswer(room, todos[1].id, 'ja');
  const r = serializeRoom(room).game.round;
  assert.equal(r.revealed, false);
  assert.ok(!('answers' in r), 'as respostas não podem ir no payload');
  assert.deepEqual(r.answeredIds, [todos[1].id], 'só se sabe QUEM já respondeu');
  assert.equal(r.result, null);
});

test('Eu Nunca: quem responde "já" bebe quando todos respondem', async () => {
  const { room, host, todos } = sala(4);
  await forcaTipo(room, host, 'eu_nunca');
  for (const p of todos) game.grupoAnswer(room, p.id, p.id === host.id ? 'ja' : 'nunca');

  const r = serializeRoom(room).game.round;
  assert.equal(r.revealed, true, 'a última resposta fecha a ronda sozinha');
  assert.deepEqual(r.result.drinkers.map((d) => d.id), [host.id]);
  assert.equal(room.game.stats[host.id].drinks, 1);
});

test('Mais Provável: o mais votado bebe um golo por voto', async () => {
  const { room, host, todos } = sala(4);
  await forcaTipo(room, host, 'mais_provavel');
  const alvo = todos[1];
  for (const p of todos) game.grupoAnswer(room, p.id, p.id === alvo.id ? todos[2].id : alvo.id);

  const r = serializeRoom(room).game.round;
  assert.deepEqual(r.result.winners.map((w) => w.id), [alvo.id]);
  assert.equal(room.game.stats[alvo.id].drinks, 3, '3 votos = 3 golos');
});

test('Termómetro: bebem os extremos, e ninguém se todos escolherem igual', async () => {
  const { room, host, todos } = sala(4);
  await forcaTipo(room, host, 'termometro');
  const vals = [0, 5, 5, 10];
  todos.forEach((p, i) => game.grupoAnswer(room, p.id, vals[i]));

  const r = serializeRoom(room).game.round;
  const bebem = new Set([...r.result.hottest, ...r.result.coldest].map((x) => x.id));
  assert.deepEqual([...bebem].sort(), [todos[0].id, todos[3].id].sort());
  assert.equal(room.game.stats[todos[1].id], undefined, 'quem ficou pelo meio não bebe');
});

test('Quem Disse: o autor é secreto até ao reveal e não vota', async () => {
  const { room, host, todos } = sala(4);
  // O quem_disse vive das perguntas da preparação.
  game.addQuestion(room, todos[1].id, host.id, 'Qual foi a tua maior vergonha?');
  await forcaTipo(room, host, 'quem_disse');

  const antes = serializeRoom(room).game.round;
  assert.ok(!('authorId' in antes), 'o autor não pode ir no payload antes do reveal');

  const autor = room.game.round.authorId;
  assert.equal(autor, todos[1].id);
  assert.throws(() => game.grupoAnswer(room, autor, host.id), /não podes responder/i);

  // Todos erram (ninguém aponta o autor) — e ninguém pode votar em si próprio.
  for (const p of todos) {
    if (p.id === autor) continue;
    game.grupoAnswer(room, p.id, p.id === host.id ? todos[2].id : host.id);
  }
  const depois = serializeRoom(room).game.round;
  assert.equal(depois.result.authorId, autor, 'no reveal já se sabe quem foi');
  assert.equal(depois.result.wrong.length, 3);
});

test('Cascata: só se pode parar por ordem, e o último paga mais', async () => {
  const { room, host, todos } = sala(4);
  await forcaTipo(room, host, 'cascata');
  game.cascataStart(room, host.id);

  const ordem = room.game.round.order;
  assert.throws(() => game.cascataStop(room, ordem[1].id), /espera/i, 'não dá para furar a fila');
  ordem.forEach((o) => game.cascataStop(room, o.id));

  const r = serializeRoom(room).game.round;
  assert.equal(r.substate, 'result');
  assert.equal(r.result.last.id, ordem[3].id);
  assert.equal(room.game.stats[ordem[3].id].drinks, 4, 'o último da cascata bebe 4');
  assert.equal(room.game.stats[ordem[0].id].drinks, 1);
});

test('Desenho: a palavra é privada até ao fim e quem acerta safa-se', async () => {
  const { room, host, todos } = sala(4);
  await forcaTipo(room, host, 'desenho');
  const palavra = room.game.round.word;

  const antes = serializeRoom(room).game.round;
  assert.ok(!('word' in antes), 'a palavra não pode ir no broadcast');
  assert.equal(game.desenhoWord(room, todos[1].id), null, 'só quem desenha recebe a palavra');
  assert.equal(game.desenhoWord(room, host.id).word, palavra);

  game.desenhoStart(room, host.id);
  const { correct } = game.desenhoGuess(room, todos[1].id, palavra.toUpperCase());
  assert.equal(correct, true, 'o palpite ignora maiúsculas e acentos');

  const r = serializeRoom(room).game.round;
  assert.equal(r.result.word, palavra, 'no fim a palavra aparece');
  assert.equal(r.result.winner.id, todos[1].id);
  assert.equal(room.game.stats[todos[1].id], undefined, 'quem acertou não bebe');
  assert.equal(room.game.stats[todos[2].id].drinks, 1, 'o resto da mesa bebe');
});

test('Reação: falso arranque é penalizado e o último bebe', async () => {
  const { room, host, todos } = sala(4);
  await forcaTipo(room, host, 'reacao');
  const reac = room.game.round.reaction;

  game.reacaoTap(room, todos[1].id); // antes do GO → falso arranque
  assert.deepEqual(reac.falseStarts, [todos[1].id]);

  reac.goAt = Date.now() - 1; // abre o GO
  game.reacaoTap(room, host.id);
  game.reacaoTap(room, todos[2].id);
  game.reacaoTap(room, todos[3].id);

  const r = serializeRoom(room).game.round;
  assert.equal(r.substate, 'result');
  assert.ok(r.result.drinkers.some((d) => d.id === todos[1].id), 'o falso arranque paga');
  assert.equal(r.result.ranking[r.result.ranking.length - 1].id, todos[1].id);
});
