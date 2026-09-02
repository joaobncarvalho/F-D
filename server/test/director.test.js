// F&D — o Diretor da noite.
//
// A razão de o director.js estar partido em leitura / pesos / foco / fase é
// exatamente esta: dá para testar cada peça sem simular uma noite de duas horas.
// A leitura é uma função pura do estado; os pesos são uma função da leitura.
//
// O que se fixa aqui é COMPORTAMENTO DE MESA, não implementação: "a mesa que
// acabou de levar com três jogos longos recebe um curto", "quem anda calado
// ganha o palco", "o aquecimento não é sítio para o Vasco".

import { test } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL;
process.env.SNAPSHOT = '0';

const { RoomManager } = await import('../src/rooms.js');
const game = await import('../src/game.js');
const director = await import('../src/game/director.js');

const MINUTO = 60 * 1000;

/** Sala com o jogo a decorrer e N jogadores. */
function mesa(nomes = ['Ana', 'Rui', 'Zé', 'Nel'], opts = {}) {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom(nomes[0]);
  const jogadores = [host];
  for (const nome of nomes.slice(1)) jogadores.push(rm.joinRoom(room.code, nome).player);
  rm.startGame(room.code, host.id);
  game.initGame(room, { lives: 3, ...opts });
  game.beginPlay(room, host.id);
  return { rm, room, jogadores };
}

const idsPorNome = (jogadores) =>
  Object.fromEntries(jogadores.map((p) => [p.name, p.id]));

// ----- Leitura ---------------------------------------------------------------

test('leitura: no início ninguém está calado nem sobrecarregado', () => {
  const { room } = mesa();
  const l = director.leitura(room);
  assert.equal(l.jogadores, 4);
  assert.deepEqual(l.calados, [], 'ninguém pode estar calado no primeiro minuto');
  assert.deepEqual(l.sobrecarregados, [], 'com a mesa toda a zero não há sobrecarga');
  assert.deepEqual(l.poupados, []);
});

test('leitura: quem não toca no telemóvel há muito tempo aparece como calado', () => {
  const { room, jogadores } = mesa();
  const id = idsPorNome(jogadores);
  const agora = Date.now();

  // Três agiram agora; o Zé foi visto pela última vez há 20 minutos.
  director.registaAcao(room, id.Ana, agora);
  director.registaAcao(room, id.Rui, agora);
  director.registaAcao(room, id.Nel, agora);
  director.registaAcao(room, id.Zé, agora - 20 * MINUTO);

  const l = director.leitura(room, agora);
  assert.equal(l.calados.length, 1);
  assert.equal(l.calados[0].name, 'Zé');
  assert.ok(l.calados[0].silencioMs >= 19 * MINUTO);
});

test('leitura: quem está a levar com tudo destaca-se da mediana', () => {
  const { room, jogadores } = mesa();
  const id = idsPorNome(jogadores);
  const g = room.game;
  g.stats = {
    [id.Ana]: { drinks: 20, refusals: 0, shots: 0 }, // está a levar com tudo
    [id.Rui]: { drinks: 8, refusals: 0, shots: 0 },
    [id.Zé]: { drinks: 7, refusals: 0, shots: 0 },
    [id.Nel]: { drinks: 1, refusals: 0, shots: 0 }, // tem escapado a tudo
  };

  const l = director.leitura(room);
  assert.ok(l.sobrecarregados.includes(id.Ana), 'a Ana bebeu muito acima da mediana');
  assert.ok(!l.sobrecarregados.includes(id.Rui));
  assert.ok(l.poupados.includes(id.Nel), 'o Nel tem escapado');
});

test('leitura: a carga recente soma o custo dos últimos tipos', () => {
  const { room } = mesa();
  room.game.recentTypes = ['vasco', 'desenho', 'piramide']; // três longos (3+3+3)
  assert.equal(director.leitura(room).cargaRecente, 9);

  room.game.recentTypes = ['desafio', 'eu_nunca', 'reacao']; // três curtos (1+1+1)
  assert.equal(director.leitura(room).cargaRecente, 3);
});

// ----- Pesos -----------------------------------------------------------------

test('pesos: depois de três jogos longos, a mesa recebe um curto', () => {
  const l = { calados: [], cargaRecente: 9, jogadores: 6 };
  const pesos = director.pesosDe(l, 'meio');
  assert.ok(pesos.desafio > 1.5, 'os curtos sobem');
  assert.ok(pesos.vasco < 0.5, 'os longos descem');
  assert.ok(pesos.desafio > pesos.desenho * 4, 'e a diferença é grande, não simbólica');
});

test('pesos: com gente calada, os tipos de holofote sobem', () => {
  const semCalados = director.pesosDe({ calados: [], cargaRecente: 4 }, 'meio');
  const comCalados = director.pesosDe(
    { calados: [{ id: 'x', name: 'Zé', silencioMs: 9e5 }], cargaRecente: 4 },
    'meio'
  );
  assert.ok(comCalados.desafio > semCalados.desafio, 'o desafio põe uma pessoa no meio');
  assert.ok(comCalados.roleta_russa > semCalados.roleta_russa);
});

test('pesos: o aquecimento segura os jogos longos e prefere a mesa toda', () => {
  const l = { calados: [], cargaRecente: 4 };
  const pesos = director.pesosDe(l, 'aquecimento');
  assert.ok(pesos.vasco < 0.3, 'o Vasco não é jogo para a mesa fria');
  assert.ok(pesos.desenho < 0.3);
  assert.ok(pesos.eu_nunca > 1, 'os de mesa inteira quebram o gelo');
});

test('pesos: no final só sobra o que aguenta ser o último momento', () => {
  const pesos = director.pesosDe({ calados: [], cargaRecente: 4 }, 'final');
  assert.ok(pesos.segredos > 2, 'os Segredos aguentam ser o fim');
  assert.ok(pesos.intrigas > 2);
  assert.ok(pesos.termometro < 0.2, 'o Termómetro não é final de noite');
  assert.ok(pesos.cascata < 0.2);
});

// ----- Fase da noite ---------------------------------------------------------

test('sem duração planeada a noite nunca entra em final', () => {
  const { room } = mesa();
  room.game.startedAt = Date.now() - 5 * 60 * MINUTO; // cinco horas
  room.game.roundCount = 200;
  assert.equal(director.faseDaNoite(room), 'meio');
  assert.equal(director.horaDoFinal(room), false, 'quem não planeou fim termina à mão, como sempre');
});

test('com duração planeada, a noite tem aquecimento, meio e final', () => {
  const { room } = mesa(['Ana', 'Rui', 'Zé'], { duracaoMin: 60 });
  const g = room.game;
  const emMinuto = (m) => {
    g.startedAt = Date.now() - m * MINUTO;
    return director.faseDaNoite(room);
  };
  assert.equal(emMinuto(2), 'aquecimento');
  g.roundCount = 10;
  assert.equal(emMinuto(30), 'meio');
  assert.equal(emMinuto(55), 'final', 'aos 55 de 60 monta-se o fim');
});

test('a hora do final só chega uma vez', () => {
  const { room } = mesa(['Ana', 'Rui', 'Zé'], { duracaoMin: 60 });
  room.game.startedAt = Date.now() - 56 * MINUTO;
  assert.equal(director.horaDoFinal(room), true);

  room.game.finaleFeito = true; // já houve final
  assert.equal(director.horaDoFinal(room), false, 'não se monta um segundo final');
});

// ----- Foco ------------------------------------------------------------------

test('foco: sem ninguém calado, a rotação manda', () => {
  const { room, jogadores } = mesa();
  const id = idsPorNome(jogadores);
  const foco = director.escolheFoco(room, director.leitura(room), id.Rui);
  assert.equal(foco.id, id.Rui);
  assert.equal(foco.saltou, false);
});

test('foco: o Diretor salta a rotação para ir buscar quem anda esquecido', () => {
  const { room, jogadores } = mesa();
  const id = idsPorNome(jogadores);
  const agora = Date.now();
  for (const nome of ['Ana', 'Rui', 'Nel']) director.registaAcao(room, id[nome], agora);
  director.registaAcao(room, id.Zé, agora - 20 * MINUTO);
  room.game.roundCount = 10;
  room.game.ultimoSaltoRonda = -99; // há muito que não salta

  const foco = director.escolheFoco(room, director.leitura(room, agora), id.Rui);
  assert.equal(foco.id, id.Zé, 'a vez vai ao esquecido');
  assert.equal(foco.saltou, true);
  assert.match(foco.razao, /Zé/);
});

test('foco: os saltos têm travão — senão deixava de haver rotação', () => {
  const { room, jogadores } = mesa();
  const id = idsPorNome(jogadores);
  const agora = Date.now();
  for (const nome of ['Ana', 'Rui', 'Nel']) director.registaAcao(room, id[nome], agora);
  director.registaAcao(room, id.Zé, agora - 20 * MINUTO);
  room.game.roundCount = 10;
  room.game.ultimoSaltoRonda = 9; // saltou na ronda passada

  const foco = director.escolheFoco(room, director.leitura(room, agora), id.Rui);
  assert.equal(foco.id, id.Rui, 'saltou há pouco → a rotação volta a mandar');
  assert.equal(foco.saltou, false);
});

// ----- O final, ponta a ponta ------------------------------------------------

test('o final é anunciado antes de se jogar e o jogo acaba sozinho a seguir', async () => {
  const { room, jogadores } = mesa(['Ana', 'Rui', 'Zé'], { duracaoMin: 60 });
  const g = room.game;
  const ana = jogadores[0];

  // A noite chegou aos 56 de 60 minutos.
  g.startedAt = Date.now() - 56 * MINUTO;
  g.roundCount = 12;

  // Fechar uma ronda faz o Diretor anunciar o final (ainda não termina o jogo).
  game.skipTurn(room, ana.id);
  assert.equal(g.finale, true, 'a próxima ronda é a última');
  assert.equal(g.phase, 'wheel', 'e ainda se joga');
  assert.ok(
    room.feed.some((e) => /[Úú]ltima ronda/.test(e.text)),
    'a mesa tem de SABER que é a última — metade da graça é o aviso'
  );

  // Jogada a última ronda, o jogo termina sozinho e com estatísticas.
  game.skipTurn(room, ana.id);
  assert.equal(g.phase, 'gameover');
  assert.equal(room.status, 'ended');
  assert.ok(g.finalStats, 'a noite acaba com as contas feitas');
  assert.equal(g.finale, false);
  assert.equal(g.finaleFeito, true);
});

test('a roda respeita o Diretor: no aquecimento os jogos longos são raros', async () => {
  // Estatístico e não absoluto, de propósito. O Diretor baixa o peso do Vasco a
  // 15%, não a zero — um teste que exigisse "nunca" falhava de vez em quando
  // sozinho, e um teste que falha à sorte deixa de ser lido.
  const { room } = mesa(['Ana', 'Rui', 'Zé', 'Nel', 'Bea']);
  const g = room.game;
  const N = 400;
  let longos = 0;
  for (let i = 0; i < N; i++) {
    g.roundCount = 0;
    g.startedAt = Date.now();
    const round = await game.spinWheel(room, g.currentPlayerId);
    if (['vasco', 'desenho', 'piramide'].includes(round.gameTypeKey)) longos += 1;
    g.round = null;
    g.phase = 'wheel';
  }
  const fracao = longos / N;
  assert.ok(fracao < 0.05, `jogos longos no aquecimento: ${(fracao * 100).toFixed(1)}% (esperava <5%)`);
});
