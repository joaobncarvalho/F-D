// F&D — testes do MODO DA MORTE (game/morte.js).
//
// O modo é uma CAMADA sobre a Roda, não um quarto motor — por isso metade destes
// testes é a verificar que a camada não estraga o motor de baixo (a vez continua
// a rodar, as rondas continuam a fechar) e a outra metade as três regras que só
// existem aqui: não há recusar, quem sai ganha poder, o relógio encurta.
//
// A regra de segurança tem teste próprio e deliberado: sair NÃO manda beber. É a
// coisa mais fácil de partir sem dar por isso ao mexer no `resolveAction`, e a
// que faz a diferença entre um modo tenso e um modo perigoso.

import { test } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL;
process.env.EVENTOS = '0'; // contam-se vidas exatas

const { RoomManager, serializeRoom } = await import('../src/rooms.js');
const game = await import('../src/game.js');
const morte = await import('../src/game/morte.js');

function start(names = ['Ana', 'Rui', 'Zé', 'Mia'], opts = {}) {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom(names[0]);
  const players = [host];
  for (const n of names.slice(1)) players.push(rm.joinRoom(room.code, n).player);
  rm.setMode(room.code, host.id, 'morte');
  room.status = 'playing';
  game.initGame(room, opts);
  game.beginPlay(room, players[0].id);
  return { rm, room, players };
}

async function rondaDesafio(room) {
  const spinnerId = room.game.currentPlayerId;
  const contagem = room.game.roundCount; // um giro descartado nao aconteceu (ver modificadores.test.js)
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
    room.game.morte.dueloFinal = false;
  }
  throw new Error('A roda nunca calhou num Desafio simples.');
}

// ----- Arranque --------------------------------------------------------------

test('o modo aceita-se no lobby e arranca com menos vidas', () => {
  const { room } = start();
  assert.equal(room.mode, 'morte');
  assert.equal(room.game.startingLives, morte.VIDAS_DEFEITO);
  assert.ok(room.game.morte, 'a camada existe');
  assert.equal(serializeRoom(room).game.morte.mortes, 0);
});

test('nos outros modos a camada nem existe', () => {
  const rm = new RoomManager();
  const { room, player } = rm.createRoom('Ana');
  rm.joinRoom(room.code, 'Rui');
  game.initGame(room, { lives: 3 });
  assert.equal(room.game.morte, null);
  assert.equal(serializeRoom(room).game.morte, null);
});

// ----- Regra 1: não há recusar ------------------------------------------------

test('recusar põe fora à primeira, mesmo com vidas de sobra', async () => {
  const { room, players } = start(['Ana', 'Rui', 'Zé', 'Mia'], { lives: 3 });
  const [ana] = players;
  await rondaDesafio(room);
  const { effect } = game.resolveAction(room, ana.id, 'refuse');
  assert.equal(effect.type, 'eliminated');
  assert.equal(room.players.get(ana.id).eliminated, true);
});

test('SEGURANÇA: sair não manda beber mais', async () => {
  const { room, players } = start();
  const [ana] = players;
  await rondaDesafio(room);
  game.resolveAction(room, ana.id, 'refuse');
  const st = room.game.stats[ana.id];
  assert.equal(st.shots || 0, 0, 'a saída não conta um shot');
  assert.equal(st.drinks, 1, 'bebe o gole da recusa, e mais nada');
});

test('aceitar continua a passar a vez, como na Roda', async () => {
  const { room, players } = start();
  const [ana, rui] = players;
  await rondaDesafio(room);
  game.resolveAction(room, ana.id, 'accept');
  assert.equal(room.players.get(ana.id).eliminated, false);
  assert.equal(room.game.currentPlayerId, rui.id);
});

// ----- Regra 2: quem sai ganha poder ------------------------------------------

test('quem sai vira fantasma com cartas e testamento por escrever', async () => {
  const { room, players } = start();
  const [ana] = players;
  await rondaDesafio(room);
  game.resolveAction(room, ana.id, 'refuse');

  const m = room.game.morte;
  assert.equal(m.mortes, 1);
  assert.ok(m.fantasmas[ana.id], 'virou fantasma');
  assert.equal(m.fantasmas[ana.id].cartas.length, 2);
  assert.equal(m.testamentoAberto.deId, ana.id);
  assert.ok(game.maoFantasma(room, ana.id).every((c) => c.label && c.desc));
});

test('as cartas dos fantasmas nunca vão no broadcast', async () => {
  const { room, players } = start();
  const [ana] = players;
  await rondaDesafio(room);
  game.resolveAction(room, ana.id, 'refuse');
  const pub = serializeRoom(room).game.morte;
  const fantasma = pub.fantasmas.find((f) => f.id === ana.id);
  assert.equal(typeof fantasma.cartas, 'number', 'vê-se quantas são…');
  // O catálogo vai no payload de propósito (é o livro de regras, igual para
  // todos); o que não pode ir é QUE cartas estão em cada mão.
  assert.equal(JSON.stringify(pub.fantasmas).includes('marcar'), false, '…nunca quais');
  assert.ok(pub.catalogo.marcar.desc, 'mas o catálogo é público');
});

test('o testamento vira uma regra que não expira', async () => {
  const { room, players } = start();
  const [ana] = players;
  await rondaDesafio(room);
  game.resolveAction(room, ana.id, 'refuse');
  game.deixaTestamento(room, ana.id, 'Ninguém pode dizer a palavra "copo".');

  const regra = room.game.activeRules.at(-1);
  assert.ok(regra.text.includes('copo'));
  assert.equal(regra.remaining, Infinity, 'vale até ao fim da noite');
  assert.equal(room.game.morte.testamentoAberto, null);
  // …e sobrevive a rondas que passam (o decrementRules não a pode comer).
  await rondaDesafio(room);
  game.resolveAction(room, room.game.currentPlayerId, 'accept');
  assert.ok(room.game.activeRules.some((r) => r.text.includes('copo')));
});

test('quem não escreveu o testamento não deixa regra nenhuma', async () => {
  const { room, players } = start();
  const [ana] = players;
  await rondaDesafio(room);
  game.resolveAction(room, ana.id, 'refuse');
  const antes = room.game.activeRules.length;
  game.fechaTestamento(room);
  assert.equal(room.game.morte.testamentoAberto, null);
  assert.equal(room.game.activeRules.length, antes, 'não se inventa por ele');
  assert.throws(() => game.deixaTestamento(room, ana.id, 'tarde de mais'), /testamento/i);
});

test('só quem saiu joga cartas, e só uma por ronda', async () => {
  const { room, players } = start(['Ana', 'Rui', 'Zé', 'Mia', 'Bea']);
  const [ana, rui] = players;
  await rondaDesafio(room);
  game.resolveAction(room, ana.id, 'refuse');

  assert.throws(() => game.fantasmaJogaCarta(room, rui.id, 'condenar'), /já saiu/i);
  // Mão fixa: as duas cartas são sorteadas, e a 💞 Ressuscitar aponta a quem está
  // FORA — com uma mão à sorte, este teste dependia do sorteio.
  room.game.morte.fantasmas[ana.id].cartas = ['condenar', 'marcar'];
  const alvo = players.find((p) => !p.eliminated && p.id !== ana.id);

  game.fantasmaJogaCarta(room, ana.id, 'condenar');
  assert.deepEqual(room.game.morte.fantasmas[ana.id].cartas, ['marcar'], 'a carta gasta-se');
  assert.throws(() => game.fantasmaJogaCarta(room, ana.id, 'marcar', alvo.id), /uma carta nesta ronda/i);
});

test('🎯 Marcar põe o alvo a jogar a ronda seguinte', async () => {
  const { room, players } = start(['Ana', 'Rui', 'Zé', 'Mia', 'Bea']);
  const [ana] = players;
  await rondaDesafio(room);
  game.resolveAction(room, ana.id, 'refuse');
  room.game.morte.fantasmas[ana.id].cartas = ['marcar'];

  const alvo = players.find((p) => !p.eliminated && p.id !== room.game.currentPlayerId);
  game.fantasmaJogaCarta(room, ana.id, 'marcar', alvo.id);
  await rondaDesafio(room);
  game.resolveAction(room, room.game.currentPlayerId, 'accept'); // fecha a ronda → aplica a marca
  assert.equal(room.game.currentPlayerId, alvo.id);
});

test('💞 Ressuscitar traz alguém de volta com uma vida e afrouxa o relógio', async () => {
  const { room, players } = start(['Ana', 'Rui', 'Zé', 'Mia', 'Bea']);
  const [ana, rui] = players;
  await rondaDesafio(room);
  game.resolveAction(room, ana.id, 'refuse');
  await rondaDesafio(room);
  game.resolveAction(room, rui.id, 'refuse');
  assert.equal(room.game.morte.mortes, 2);
  const relogioComDois = morte.segundosRonda(room);

  room.game.morte.fantasmas[ana.id].cartas = ['ressuscitar'];
  game.fantasmaJogaCarta(room, ana.id, 'ressuscitar', rui.id);
  assert.equal(room.players.get(rui.id).eliminated, false);
  assert.equal(room.players.get(rui.id).lives, 1);
  assert.equal(room.game.morte.fantasmas[rui.id], undefined, 'deixa de ser plateia');
  assert.ok(morte.segundosRonda(room) > relogioComDois, 'e o relógio afrouxa');
  assert.equal(room.game.morte.fantasmas[ana.id].cartas.length, 0, 'a carta gastou-se');
});

test('💀 Condenar: nessa ronda, perder uma vida põe fora', async () => {
  const { room, players } = start(['Ana', 'Rui', 'Zé', 'Mia', 'Bea'], { lives: 3 });
  const [ana] = players;
  await rondaDesafio(room);
  game.resolveAction(room, ana.id, 'refuse');
  room.game.morte.fantasmas[ana.id].cartas = ['condenar'];

  await rondaDesafio(room);
  game.fantasmaJogaCarta(room, ana.id, 'condenar');
  const vitima = room.game.currentPlayerId;
  room.players.get(vitima).lives -= 1; // um veredito perdido, uma bomba, o que for
  game.resolveAction(room, vitima, 'accept'); // a ronda fecha → a condenação aplica-se
  assert.equal(room.players.get(vitima).eliminated, true);
});

// ----- Regra 3: o relógio encurta ---------------------------------------------

test('cada morte aperta o relógio, até ao mínimo', async () => {
  const { room, players } = start(['Ana', 'Rui', 'Zé', 'Mia', 'Bea', 'Nuno']);
  assert.equal(morte.segundosRonda(room), morte.SEGUNDOS_BASE);
  await rondaDesafio(room);
  game.resolveAction(room, players[0].id, 'refuse');
  assert.equal(morte.segundosRonda(room), morte.SEGUNDOS_BASE - morte.SEGUNDOS_POR_MORTE);

  room.game.morte.mortes = 99;
  assert.equal(morte.segundosRonda(room), morte.SEGUNDOS_MIN, 'há um chão');
});

// ----- O fim -----------------------------------------------------------------

test('restando dois, a ronda seguinte é o duelo', async () => {
  const { room, players } = start();
  await rondaDesafio(room);
  game.resolveAction(room, room.game.currentPlayerId, 'refuse');
  await rondaDesafio(room);
  game.resolveAction(room, room.game.currentPlayerId, 'refuse');

  assert.equal(room.game.morte.dueloFinal, true);
  const round = await game.spinWheel(room, room.game.currentPlayerId);
  assert.equal(round.gameTypeKey, 'duelo');
});

test('restando um, a noite acaba sozinha com as estatísticas', async () => {
  const { room, players } = start(['Ana', 'Rui', 'Zé']);
  for (let i = 0; i < 2; i++) {
    await rondaDesafio(room);
    game.resolveAction(room, room.game.currentPlayerId, 'refuse');
  }
  assert.equal(room.game.phase, 'gameover');
  assert.equal(room.status, 'ended');
  assert.ok(room.game.finalStats.survivor, 'há um último de pé');
  assert.equal(room.game.finalStats.survivor.eliminated, false);
});

// ----- O duelo final (bug reportado no playtest de 2026-09-03) ----------------
//
// A mesa era avisada de que restavam dois e de que aquilo era o final, o duelo
// resolvia-se… e ninguém saía: perder um duelo só custava goles. Continuavam a
// sobrar dois, por isso TODAS as rondas seguintes eram outra vez o "duelo final"
// e o jogo nunca acabava. Um final anunciado tem de ser decisivo.

async function ateAoDuelo(room) {
  // Elimina até restarem dois → a ronda seguinte é o duelo final.
  while (morte.estadoDoFim(room) !== 'duelo') {
    await rondaDesafio(room);
    game.resolveAction(room, room.game.currentPlayerId, 'refuse');
    if (room.game.morte.testamentoAberto) game.fechaTestamento(room);
  }
  assert.equal(room.game.morte.dueloFinal, true, 'o final foi anunciado');
  const round = await game.spinWheel(room, room.game.currentPlayerId);
  assert.equal(round.gameTypeKey, 'duelo');
  return round;
}

test('o duelo final elimina quem perde — e a noite ACABA aí', async () => {
  const { room } = start(['Ana', 'Rui', 'Zé', 'Mia'], { lives: 3 });
  const round = await ateAoDuelo(room);

  const vencedor = round.currentPlayerId;
  const perdedor = round.opponentId;
  if (round.substate === 'calling') {
    // Cara ou coroa resolve-se dentro da app; forçamos o outro caminho para o
    // teste ser sobre o FIM e não sobre o sorteio da moeda.
    room.game.round.substate = 'duelling';
  }
  game.dueloResult(room, vencedor, vencedor);

  assert.equal(room.game.round.result.final, true);
  assert.equal(room.game.round.result.eliminado, true);
  assert.equal(room.players.get(perdedor).eliminated, true, 'perder o final põe fora');

  game.continueRound(room, room.game.currentPlayerId);
  assert.equal(room.game.phase, 'gameover', 'a noite acaba no duelo final');
  assert.equal(room.status, 'ended');
  assert.equal(room.game.finalStats.survivor.id, vencedor);
});

test('fora do final, perder um duelo custa uma vida (não goles)', async () => {
  const { room } = start(['Ana', 'Rui', 'Zé', 'Mia', 'Bea']);
  let round = null;
  for (let i = 0; i < 4000 && !round; i++) {
    const r = await game.spinWheel(room, room.game.currentPlayerId);
    if (r.gameTypeKey === 'duelo') round = r;
    else {
      room.game.round = null;
      room.game.phase = 'wheel';
    }
  }
  assert.ok(round, 'a roda nunca calhou num duelo');
  assert.equal(room.game.morte.dueloFinal, false, 'ainda há mesa a mais para o final');

  const vencedor = round.currentPlayerId;
  const perdedor = round.opponentId;
  const vidasAntes = room.players.get(perdedor).lives;
  if (round.substate === 'calling') room.game.round.substate = 'duelling';
  game.dueloResult(room, vencedor, vencedor);

  assert.equal(room.players.get(perdedor).lives, vidasAntes - 1);
  assert.equal(room.players.get(perdedor).eliminated, false, 'ainda não sai');
  assert.equal(room.game.stats[perdedor]?.drinks || 0, 0, 'num modo de vidas não se paga a goles');
});

test('ressuscitar alguém desliga o duelo final', async () => {
  const { room } = start(['Ana', 'Rui', 'Zé', 'Mia']);
  await ateAoDuelo(room);
  room.game.round = null;
  room.game.phase = 'wheel';

  // Um fantasma traz alguém de volta → voltam a ser três, e o final espera.
  const fantasmaId = Object.keys(room.game.morte.fantasmas)[0];
  const outroFora = Object.keys(room.game.morte.fantasmas).find((id) => id !== fantasmaId);
  room.game.morte.fantasmas[fantasmaId].cartas = ['ressuscitar'];
  room.game.morte.cartaJogadaNaRonda = false;
  game.fantasmaJogaCarta(room, fantasmaId, 'ressuscitar', outroFora);

  assert.equal(morte.estadoDoFim(room), null, 'com três à mesa não há final à porta');
  await rondaDesafio(room);
  game.resolveAction(room, room.game.currentPlayerId, 'accept');
  assert.equal(room.game.morte.dueloFinal, false, 'a marca do final não fica presa');
});
