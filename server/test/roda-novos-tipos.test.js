// F&D — testes dos tipos novos da Roda: Categoria Relâmpago, Mímica, Roleta
// Russa e Duelo 1v1. Foco no que parte em silêncio: a palavra da Mímica não pode
// vazar antes do fim (regra de ouro do anonimato) e a Roleta tem de parar sempre.

import { test } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL;

const { RoomManager, serializeRoom } = await import('../src/rooms.js');
const game = await import('../src/game.js');

function makeRoom(names) {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom(names[0]);
  const players = [host];
  for (const n of names.slice(1)) players.push(rm.joinRoom(room.code, n).player);
  return { room, players };
}

async function spinUntil(room, key, maxTries = 1500) {
  const spinnerId = room.game.currentPlayerId;
  for (let i = 0; i < maxTries; i++) {
    const round = await game.spinWheel(room, spinnerId);
    if (round.gameTypeKey === key) return round;
    room.game.round = null;
    room.game.phase = 'wheel';
    room.game.currentPlayerId = spinnerId;
  }
  throw new Error(`A roda nunca calhou em "${key}".`);
}

function start(names = ['Ana', 'Rui', 'Zé']) {
  const { room, players } = makeRoom(names);
  game.initGame(room, { lives: 3 });
  game.beginPlay(room, players[0].id);
  return { room, players };
}

test('Mímica: a palavra é privada até ao veredicto', async () => {
  const { room, players } = start();
  const [ana] = players;
  const round = await spinUntil(room, 'mimica');
  assert.ok(round.secretWord, 'o motor conhece a palavra');

  const priv = game.mimicaWord(room, ana.id);
  assert.equal(priv.word, round.secretWord, 'quem está à vez recebe-a por canal privado');
  assert.equal(game.mimicaWord(room, players[1].id), null, 'mais ninguém a recebe');

  let r = serializeRoom(room).game.round;
  assert.ok(!JSON.stringify(r).includes(round.secretWord), 'a palavra não vai no broadcast');

  game.mimicaStart(room, ana.id);
  game.mimicaResolve(room, ana.id, false);
  r = serializeRoom(room).game.round;
  assert.equal(r.result.word, round.secretWord, 'no fim é revelada a todos');
  assert.ok(r.result.golos > 0, 'ninguém acertou → o mimo bebe');

  game.continueRound(room, ana.id);
  assert.equal(room.game.phase, 'wheel', 'a ronda fecha e a roda volta');
});

test('Categoria Relâmpago: travar custa golos e a ronda fecha', async () => {
  const { room, players } = start();
  const [ana] = players;
  await spinUntil(room, 'categoria_relampago');
  const before = room.game.stats[ana.id]?.drinks || 0;

  game.relampagoStart(room, ana.id);
  game.relampagoResolve(room, ana.id, false);
  assert.ok(room.game.stats[ana.id].drinks > before, 'travou → bebeu');

  game.continueRound(room, ana.id);
  assert.equal(room.game.phase, 'wheel');
});

test('Roleta Russa: os passes ficam mais caros e a roleta dispara no máximo', async () => {
  const { room, players } = start();
  const [ana] = players;
  await spinUntil(room, 'roleta_russa');

  await game.roletaPass(room, ana.id);
  assert.equal(room.game.round.tab, 1, '1.º passe custa 1');
  await game.roletaPass(room, ana.id);
  assert.equal(room.game.round.tab, 3, '2.º passe custa 2 (total 3)');
  await game.roletaPass(room, ana.id);

  assert.equal(room.game.round.substate, 'result', 'ao 3.º passe a roleta dispara');
  assert.equal(room.game.round.result.outcome, 'estourou');
  assert.equal(room.game.stats[ana.id].drinks, 6, 'paga 1+2+3 golos');
});

test('Duelo 1v1: sorteia adversário e quem perde bebe', async () => {
  const { room, players } = start();
  const [ana] = players;
  const round = await spinUntil(room, 'duelo');
  assert.ok(round.opponentId && round.opponentId !== ana.id, 'há adversário sorteado');
  assert.ok(round.duel?.key, 'há mini-duelo sorteado');

  if (round.duel.key === 'cara_coroa') {
    // Este joga-se DENTRO da app: só quem lançou o duelo escolhe a face.
    assert.equal(round.substate, 'calling');
    assert.throws(() => game.dueloResult(room, ana.id, ana.id), /cara ou coroa/i);
    game.dueloCall(room, ana.id, 'cara');
  } else {
    // Os restantes jogam-se à mesa — o adversário também pode registar o resultado.
    game.dueloResult(room, round.opponentId, ana.id);
  }

  const r = serializeRoom(room).game.round;
  assert.ok(r.result.winnerId, 'há vencedor');
  assert.ok(room.game.stats[r.result.loserId].drinks > 0, 'o perdedor bebeu');

  game.continueRound(room, ana.id);
  assert.equal(room.game.phase, 'wheel');
});

test('Cara ou Coroa: a moeda é lançada pela app e decide sozinha', async () => {
  const { room, players } = start();
  const [ana] = players;

  // Sorteia até calhar o cara-ou-coroa (os mini-duelos são 3).
  let round = null;
  for (let i = 0; i < 300 && !round; i++) {
    const r = await spinUntil(room, 'duelo');
    if (r.duel.key === 'cara_coroa') round = r;
    else {
      game.dueloResult(room, ana.id, ana.id);
      game.continueRound(room, ana.id);
      room.game.currentPlayerId = ana.id; // a vez volta à Ana para o próximo spin
    }
  }
  assert.ok(round, 'nunca saiu o cara ou coroa');

  const antes = serializeRoom(room).game.round;
  assert.equal(antes.coin, null, 'a moeda ainda não foi lançada');
  assert.throws(() => game.dueloCall(room, round.opponentId, 'cara'), /quem lançou/i);
  assert.throws(() => game.dueloCall(room, ana.id, 'lado'), /cara ou coroa/i);

  game.dueloCall(room, ana.id, 'cara');
  const r = serializeRoom(room).game.round;
  assert.ok(['cara', 'coroa'].includes(r.coin.face), 'o servidor é que lança');
  assert.equal(r.coin.call, 'cara');
  // Acertar ganha, falhar dá a vitória ao adversário — sem discussão à mesa.
  const esperado = r.coin.face === 'cara' ? ana.id : round.opponentId;
  assert.equal(r.result.winnerId, esperado);
});
