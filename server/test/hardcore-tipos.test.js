// F&D — testes dos seis tipos "hardcore": Bomba-Relógio, Leilão, Sincronia,
// Detetor, Julgamento e Contrato.
//
// Cada um destes tem uma coisa que o servidor sabe e o cliente não pode saber (o
// pavio, as licitações, as respostas da dupla, a marca do detetor) — e essa é a
// classe de bug que não dá erro nenhum, só estraga o jogo em silêncio. Por isso
// metade destes testes é sobre o PAYLOAD, não sobre as contas.

import { test } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL;
process.env.EVENTOS = '0'; // contam-se goles e vidas exatos

const { RoomManager, serializeRoom } = await import('../src/rooms.js');
const game = await import('../src/game.js');
const leilao = await import('../src/game/leilao.js');
const detetor = await import('../src/game/detetor.js');
const contrato = await import('../src/game/contrato.js');
const julgamento = await import('../src/game/julgamento.js');

function start(names = ['Ana', 'Rui', 'Zé', 'Mia']) {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom(names[0]);
  const players = [host];
  for (const n of names.slice(1)) players.push(rm.joinRoom(room.code, n).player);
  game.initGame(room, { lives: 3 });
  game.beginPlay(room, players[0].id);
  return { rm, room, players };
}

async function spinUntil(room, key, maxTries = 4000) {
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

const publico = (room) => serializeRoom(room).game.round;

// ----- Bomba-Relógio ---------------------------------------------------------

test('Bomba: o pavio nunca sai no payload', async () => {
  const { room } = start();
  const r = await spinUntil(room, 'bomba');
  assert.ok(r.pavioMs > 0, 'o motor conhece o pavio');
  const pub = publico(room);
  assert.equal('pavioMs' in pub, false, 'o pavio é a regra inteira do jogo');
  assert.equal('acesaEm' in pub, false);
  assert.ok(pub.holderId, 'mas vê-se quem a tem na mão');
});

test('Bomba: passa-se à volta e rebenta em quem a segurou demais', async () => {
  const { room, players } = start();
  const r = await spinUntil(room, 'bomba');
  const primeiro = r.holderId;
  const res1 = game.bombaPassa(room, primeiro);
  assert.equal(res1.rebentou, false);
  assert.notEqual(room.game.round.holderId, primeiro, 'mudou de mãos');
  assert.throws(() => game.bombaPassa(room, primeiro), /não está contigo/i);

  // Força o fim do pavio: quem a tiver na mão na próxima passagem leva.
  const vitima = room.game.round.holderId;
  room.game.round.acesaEm = Date.now() - room.game.round.pavioMs - 1;
  const vidasAntes = room.players.get(vitima).lives;
  const res2 = game.bombaPassa(room, vitima);
  assert.equal(res2.rebentou, true);
  assert.equal(room.players.get(vitima).lives, vidasAntes - 1, 'rebentar custa uma vida');
  assert.equal(room.game.round.result.quemId, vitima);
  assert.ok(publico(room).result.segundos > 0, 'só no fim se revela quanto era o pavio');
});

test('Bomba: o segundo pavio conta VOLTAS à mesa, e nunca sai no payload', async () => {
  const { room } = start();
  const r = await spinUntil(room, 'bomba');
  const naMesa = r.ordem.length;
  assert.ok(r.pavioPassagens >= 5, 'nunca rebenta antes de toda a gente lhe tocar');
  assert.ok(
    r.pavioPassagens <= Math.round(3.5 * naMesa),
    `${r.pavioPassagens} passagens para ${naMesa} à mesa é mais do que três voltas e meia`
  );
  const pub = publico(room);
  assert.equal('pavioPassagens' in pub, false, 'saber quantas faltam matava o jogo');
  assert.ok('passagens' in pub, 'mas as que já foram são públicas');
});

test('Bomba: rebenta às voltas mesmo com o relógio por acabar', async () => {
  const { room } = start();
  const r = await spinUntil(room, 'bomba');
  r.pavioMs = 10 * 60000; // dez minutos: o tempo não vai ser o culpado
  r.pavioPassagens = 3;
  r.acesaEm = Date.now() - 20000; // já passou do chão de 12s (ver o teste seguinte)

  for (let i = 0; i < 3; i++) {
    const res = game.bombaPassa(room, room.game.round.holderId);
    assert.equal(res.rebentou, false, `passagem ${i + 1} ainda não rebenta`);
  }
  const vitima = room.game.round.holderId;
  const res = game.bombaPassa(room, vitima);
  assert.equal(res.rebentou, true, 'esgotadas as passagens, rebenta em quem a larga');
  assert.equal(room.game.round.result.quemId, vitima);
  assert.equal(room.game.round.result.porque, 'passagens');
  assert.equal(room.game.round.result.segundos, null, 'não se anuncia um pavio de tempo que não acabou');
});

test('Bomba: as voltas não podem rebentar antes do chão de 12s', async () => {
  const { room } = start();
  const r = await spinUntil(room, 'bomba');
  r.pavioMs = 10 * 60000;
  r.pavioPassagens = 1;
  r.acesaEm = Date.now(); // acabou de acender: uma mesa rápida esgota as voltas já

  assert.equal(game.bombaPassa(room, room.game.round.holderId).rebentou, false);
  const res = game.bombaPassa(room, room.game.round.holderId);
  assert.equal(res.rebentou, false, 'passagens esgotadas, mas ainda não há jogo nenhum');

  // O mesmo estado, com o chão já cumprido: agora sim.
  room.game.round.acesaEm = Date.now() - 13000;
  assert.equal(game.bombaPassa(room, room.game.round.holderId).rebentou, true);
  assert.equal(room.game.round.result.porque, 'passagens');
});

test('Bomba: o auto-resolve rebenta em quem a tem, não passa por ele', async () => {
  const { room } = start();
  await spinUntil(room, 'bomba');
  room.game.round.acesaEm = Date.now() - room.game.round.pavioMs - 1;
  assert.equal(game.bombaExpirou(room), true);
  const holder = room.game.round.holderId;
  game.bombaEstoira(room);
  assert.equal(room.game.round.result.quemId, holder);
});

// ----- Leilão ----------------------------------------------------------------

test('Leilão: quem licita menos faz o desafio; os outros bebem o que licitaram', async () => {
  const { room, players } = start();
  const [ana, rui, ze, mia] = players;
  await spinUntil(room, 'leilao');

  game.leilaoLicita(room, ana.id, 3);
  game.leilaoLicita(room, rui.id, 4);
  game.leilaoLicita(room, ze.id, 1); // o mais baixo
  assert.equal(publico(room).result, null, 'ainda falta um — nada se revela');
  game.leilaoLicita(room, mia.id, 5);

  const res = room.game.round.result;
  assert.equal(res.executorId, ze.id, 'o mais baixo faz o desafio');
  assert.equal(room.game.stats[ze.id]?.drinks || 0, 0, 'e não bebe nada');
  assert.equal(room.game.stats[ana.id].drinks, 3);
  assert.equal(room.game.stats[rui.id].drinks, 4);
  assert.equal(room.game.stats[mia.id].drinks, 5);
});

test('Leilão: as licitações são secretas até fechar', async () => {
  const { room, players } = start();
  const [ana] = players;
  await spinUntil(room, 'leilao');
  game.leilaoLicita(room, ana.id, 2);
  const pub = publico(room);
  assert.deepEqual(pub.jaLicitaram, [ana.id], 'vê-se QUEM licitou…');
  assert.equal('licitacoes' in pub, false, '…nunca o quê');
  assert.throws(() => game.leilaoLicita(room, ana.id, 1), /já licitaste/i);
  assert.throws(() => game.leilaoLicita(room, ana.id, 99), /Já licitaste|inválida/i);
});

test('Leilão: empate no mínimo resolve-se entre os empatados', async () => {
  const { room, players } = start();
  const [ana, rui, ze, mia] = players;
  await spinUntil(room, 'leilao');
  for (const p of [ana, rui]) game.leilaoLicita(room, p.id, 1);
  for (const p of [ze, mia]) game.leilaoLicita(room, p.id, 4);
  const res = room.game.round.result;
  assert.equal(res.empate, true);
  assert.ok([ana.id, rui.id].includes(res.executorId));
});

// ----- Sincronia -------------------------------------------------------------

test('Sincronia: se a dupla bate certo, é a mesa que bebe', async () => {
  const { room, players } = start();
  const r = await spinUntil(room, 'sincronia');
  const alvo = players.find((p) => ![r.currentPlayerId, r.parId].includes(p.id));
  game.sincroniaResponde(room, r.currentPlayerId, alvo.id);
  assert.equal(publico(room).result, null, 'só se revela com as duas respostas');
  game.sincroniaResponde(room, r.parId, alvo.id);

  const res = room.game.round.result;
  assert.equal(res.bateu, true);
  const forasDaDupla = players.filter((p) => ![r.currentPlayerId, r.parId].includes(p.id));
  for (const p of forasDaDupla) assert.equal(room.game.stats[p.id].drinks, 1);
  for (const id of [r.currentPlayerId, r.parId]) assert.equal(room.game.stats[id]?.drinks || 0, 0);
});

test('Sincronia: se divergirem, bebem os dois — e as escolhas só saem no fim', async () => {
  const { room, players } = start();
  const r = await spinUntil(room, 'sincronia');
  const outros = players.filter((p) => ![r.currentPlayerId, r.parId].includes(p.id));
  game.sincroniaResponde(room, r.currentPlayerId, outros[0].id);
  const pub = publico(room);
  assert.deepEqual(pub.jaResponderam, [r.currentPlayerId]);
  assert.equal('respostas' in pub, false, 'a primeira resposta não pode vazar');

  game.sincroniaResponde(room, r.parId, outros[1] ? outros[1].id : r.currentPlayerId);
  const res = room.game.round.result;
  assert.equal(res.bateu, false);
  for (const id of [r.currentPlayerId, r.parId]) assert.equal(room.game.stats[id].drinks, 2);
});

// ----- Detetor de Mentiras ---------------------------------------------------

test('Detetor: a marca do ator é secreta até ao reveal', async () => {
  const { room } = start();
  const r = await spinUntil(room, 'detetor');
  game.detetorMarca(room, r.currentPlayerId, true);
  const pub = publico(room);
  assert.equal('verdade' in pub, false, 'saber isto era saber a resposta');
  assert.equal(pub.substate, 'votar');
});

test('Detetor: quem vota mal bebe; enganar a mesa toda vale uma vida', async () => {
  const { room, players } = start();
  const r = await spinUntil(room, 'detetor');
  const ator = room.players.get(r.currentPlayerId);
  const vidasAntes = ator.lives;
  game.detetorMarca(room, ator.id, false); // era mentira
  const outros = players.filter((p) => p.id !== ator.id);
  for (const p of outros) game.detetorVota(room, p.id, 'acredito'); // toda a mesa enganada

  const res = room.game.round.result;
  assert.equal(res.eraVerdade, false);
  assert.equal(res.extremo, 'enganou_todos');
  assert.equal(room.players.get(ator.id).lives, vidasAntes + 1);
  for (const p of outros) assert.equal(room.game.stats[p.id].drinks, detetor.CUSTO_VOTO_ERRADO);
});

test('Detetor: ser lido por toda a mesa custa uma vida', async () => {
  const { room, players } = start();
  const r = await spinUntil(room, 'detetor');
  const ator = room.players.get(r.currentPlayerId);
  const vidasAntes = ator.lives;
  game.detetorMarca(room, ator.id, true);
  for (const p of players.filter((p) => p.id !== ator.id)) game.detetorVota(room, p.id, 'acredito');
  assert.equal(room.game.round.result.extremo, 'lido_por_todos');
  assert.equal(room.players.get(ator.id).lives, vidasAntes - 1);
});

test('Detetor: o ator não vota, e ninguém vota duas vezes', async () => {
  const { room, players } = start();
  const r = await spinUntil(room, 'detetor');
  game.detetorMarca(room, r.currentPlayerId, true);
  assert.throws(() => game.detetorVota(room, r.currentPlayerId, 'acredito'), /em ti próprio/i);
  const outro = players.find((p) => p.id !== r.currentPlayerId);
  game.detetorVota(room, outro.id, 'mentira');
  assert.throws(() => game.detetorVota(room, outro.id, 'acredito'), /já votaste/i);
});

// ----- Julgamento ------------------------------------------------------------

test('Julgamento: condenar custa uma vida ao réu', async () => {
  const { room, players } = start();
  const r = await spinUntil(room, 'julgamento');
  assert.notEqual(r.advogadoId, r.reuId, 'a defesa é sempre outra pessoa');
  const vidasAntes = room.players.get(r.reuId).lives;
  game.julgamentoAoVoto(room, r.reuId);

  const jurados = players.filter((p) => ![r.reuId, r.advogadoId].includes(p.id));
  for (const j of jurados) game.votaVeredito(room, j.id, 'nao'); // culpado
  const res = room.game.round.result;
  assert.equal(res.inocente, false);
  assert.equal(room.players.get(r.reuId).lives, vidasAntes - 1);
});

test('Julgamento: absolver faz pagar quem condenou e premeia o advogado', async () => {
  const { room, players } = start(['Ana', 'Rui', 'Zé', 'Mia', 'Bea']);
  const r = await spinUntil(room, 'julgamento');
  game.julgamentoAoVoto(room, r.reuId);
  const jurados = players.filter((p) => ![r.reuId, r.advogadoId].includes(p.id));
  const advVidas = room.players.get(r.advogadoId).lives;

  game.votaVeredito(room, jurados[0].id, 'nao'); // condena
  for (const j of jurados.slice(1)) game.votaVeredito(room, j.id, 'sim'); // absolvem

  const res = room.game.round.result;
  assert.equal(res.inocente, true);
  assert.equal(room.game.stats[jurados[0].id].drinks, julgamento.CUSTO_CONDENAR_MAL);
  assert.equal(room.game.stats[jurados[1].id]?.drinks || 0, 0, 'quem absolveu não paga');
  assert.equal(room.players.get(r.advogadoId).lives, advVidas + 1, 'a defesa é paga pela absolvição');
});

test('Julgamento: réu e advogado não votam, e o veredito traz os rótulos certos', async () => {
  const { room } = start();
  const r = await spinUntil(room, 'julgamento');
  game.julgamentoAoVoto(room, r.reuId);
  assert.throws(() => game.votaVeredito(room, r.reuId, 'sim'), /em ti próprio/i);
  assert.throws(() => game.votaVeredito(room, r.advogadoId, 'sim'), /em ti próprio/i);
  const v = publico(room).veredito;
  assert.equal(v.rotulos.nao, '🔨 Culpado');
});

// ----- Contrato --------------------------------------------------------------

test('Contrato: assinado pelos dois dá vida aos dois e deixa uma regra ativa', async () => {
  const { room, players } = start();
  const r = await spinUntil(room, 'contrato');
  const parceiro = players.find((p) => p.id !== r.currentPlayerId);
  game.contratoEscolhe(room, r.currentPlayerId, parceiro.id);
  const antes = [r.currentPlayerId, parceiro.id].map((id) => room.players.get(id).lives);

  game.contratoAssina(room, r.currentPlayerId, true);
  assert.equal(room.game.round.substate, 'assinar', 'um só não fecha nada');
  game.contratoAssina(room, parceiro.id, true);

  assert.equal(room.game.round.result.feito, true);
  [r.currentPlayerId, parceiro.id].forEach((id, i) => {
    assert.equal(room.players.get(id).lives, antes[i] + 1);
  });
  const regra = room.game.activeRules.at(-1);
  assert.ok(regra && regra.remaining === contrato.DURACAO, 'o pacto fica no ecrã da mesa');
});

test('Contrato: quem recusa bebe — quem assinou, não', async () => {
  const { room, players } = start();
  const r = await spinUntil(room, 'contrato');
  const parceiro = players.find((p) => p.id !== r.currentPlayerId);
  game.contratoEscolhe(room, r.currentPlayerId, parceiro.id);
  game.contratoAssina(room, r.currentPlayerId, true);
  game.contratoAssina(room, parceiro.id, false);

  assert.equal(room.game.round.result.feito, false);
  assert.equal(room.game.stats[parceiro.id].drinks, contrato.CUSTO_RECUSA);
  assert.equal(room.game.stats[r.currentPlayerId]?.drinks || 0, 0);
});

test('Contrato: o silêncio não amarra ninguém', async () => {
  const { room, players } = start();
  const r = await spinUntil(room, 'contrato');
  const parceiro = players.find((p) => p.id !== r.currentPlayerId);
  game.contratoEscolhe(room, r.currentPlayerId, parceiro.id);
  game.contratoAssina(room, r.currentPlayerId, true);
  game.contratoExpira(room); // auto-resolve: o outro nunca decidiu
  assert.equal(room.game.round.result.feito, false, 'um pacto por omissão não é um pacto');
});

// ----- Transversal -----------------------------------------------------------

test('todos os tipos novos fecham a ronda e devolvem a vez à roda', async () => {
  for (const key of ['bomba', 'leilao', 'sincronia', 'detetor', 'julgamento', 'contrato']) {
    const { room, players } = start();
    const r = await spinUntil(room, key);
    // Leva cada um até ao resultado pelo caminho mais curto.
    if (key === 'bomba') {
      room.game.round.acesaEm = Date.now() - room.game.round.pavioMs - 1;
      game.bombaEstoira(room);
    } else if (key === 'leilao') {
      for (const p of players) game.leilaoLicita(room, p.id, 1);
    } else if (key === 'sincronia') {
      for (const id of [r.currentPlayerId, r.parId]) game.sincroniaResponde(room, id, players[0].id);
    } else if (key === 'detetor') {
      game.detetorMarca(room, r.currentPlayerId, true);
      for (const p of players.filter((p) => p.id !== r.currentPlayerId)) game.detetorVota(room, p.id, 'mentira');
    } else if (key === 'julgamento') {
      game.julgamentoAoVoto(room, r.reuId);
      for (const p of players.filter((p) => ![r.reuId, r.advogadoId].includes(p.id))) {
        game.votaVeredito(room, p.id, 'sim');
      }
    } else if (key === 'contrato') {
      const parceiro = players.find((p) => p.id !== r.currentPlayerId);
      game.contratoEscolhe(room, r.currentPlayerId, parceiro.id);
      for (const id of [r.currentPlayerId, parceiro.id]) game.contratoAssina(room, id, true);
    }
    assert.equal(room.game.round.status, 'resolved', `${key}: devia estar resolvido`);
    game.continueRound(room, room.game.currentPlayerId);
    assert.equal(room.game.phase, 'wheel', `${key}: a vez tem de voltar à roda`);
  }
});
