// F&D — testes da telemetria (server/src/telemetria.js).
//
// Duas coisas se protegem aqui, e a segunda vale mais do que a primeira:
//
//   1. QUE OS NÚMEROS ESTEJAM CERTOS. Uma taxa de recusa errada é pior do que
//      não a ter: leva alguém a apagar um desafio que estava bom.
//   2. QUE NÃO SAIA NADA DE NINGUÉM. Este jogo passou o tempo todo a esconder
//      quem escreveu o quê (intrigas anónimas, segredos server-side, palavras
//      por canal privado). Um ficheiro de estatísticas com nomes lá dentro
//      desfazia isso em silêncio — por isso há um teste que lê o payload de
//      gravação inteiro e procura os nomes dos jogadores.

import { test } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL;
process.env.SNAPSHOT = '0';
process.env.EVENTOS = '0'; // sem eventos a mexer em vidas no meio das contagens
process.env.EMPTY_ROOM_GRACE_MS = '20'; // a sala abandonada tem de morrer no teste

const { RoomManager } = await import('../src/rooms.js');
const game = await import('../src/game.js');
const telemetria = await import('../src/telemetria.js');

function makeRoom(names = ['Ana', 'Rui', 'Zé']) {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom(names[0]);
  const players = [host];
  for (const n of names.slice(1)) players.push(rm.joinRoom(room.code, n).player);
  return { rm, room, players };
}

function start(opts = {}, names) {
  const { rm, room, players } = makeRoom(names);
  game.initGame(room, { lives: 3, ...opts });
  game.beginPlay(room, players[0].id);
  return { rm, room, players };
}

/** Força uma ronda de Desafio no jogador da vez, sem depender do sorteio. */
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

const tipo = (r, key) => r.tipos.find((t) => t.key === key) || {};

test('chaveDePrompt: estável no mesmo texto, diferente noutro', () => {
  const a = telemetria.chaveDePrompt('desafio', 'Faz o pino');
  assert.equal(a, telemetria.chaveDePrompt('desafio', '  Faz o pino  '), 'espaços não contam');
  assert.notEqual(a, telemetria.chaveDePrompt('desafio', 'Faz o pino!'), 'reescrever é outro prompt');
  assert.notEqual(a, telemetria.chaveDePrompt('boca_calada', 'Faz o pino'), 'o tipo faz parte da chave');
});

test('uma ronda aceite e uma recusada contam-se por tipo, prompt e intensidade', async () => {
  telemetria._reset();
  const { room, players } = start({ curve: false, intensity: 'picante' });

  const r1 = await rondaDesafio(room);
  const texto1 = r1.prompt.text;
  game.resolveAction(room, r1.currentPlayerId, 'accept');

  const r2 = await rondaDesafio(room);
  game.resolveAction(room, r2.currentPlayerId, 'refuse');

  const res = telemetria.resumo();
  const t = tipo(res, 'desafio');
  // Afirmam-se as DECISÕES, que são exatas. O `saiu` não: o `rondaDesafio` deita
  // fora as voltas que não calharam num Desafio simples (num jogo a sério não há
  // giros deitados fora) e por isso vem inflacionado — o contador de `saiu` tem
  // teste próprio, mais abaixo, sem a roda pelo meio.
  assert.equal(t.aceite, 1);
  assert.equal(t.recusado, 1);
  assert.equal(t.taxaRecusa, 50);

  const p = telemetria.porPrompt('desafio', texto1);
  assert.equal(p.visto, 1);
  assert.equal(p.aceite, 1);
  assert.equal(p.taxaRecusa, 0);

  // Só as DECISÕES se afirmam por intensidade: o `saiu` vem inflacionado pelo
  // `rondaDesafio`, que deita fora as voltas da roda que não calharam em Desafio
  // (num jogo a sério não há giros deitados fora).
  const picante = res.intensidades.find((i) => i.key === 'picante');
  assert.equal(picante.aceite, 1);
  assert.equal(picante.recusado, 1);
  void players;
});

test('uma ronda que abre conta o tipo, a intensidade e o prompt', () => {
  telemetria._reset();
  const round = { gameTypeKey: 'desafio', prompt: { text: 'Faz o pino' } };
  telemetria.rondaAbriu(round, 'hardcore');
  telemetria.rondaAbriu(round, 'hardcore');

  assert.equal(tipo(telemetria.resumo(), 'desafio').saiu, 2);
  assert.equal(telemetria.resumo().intensidades.find((i) => i.key === 'hardcore').saiu, 2);
  assert.equal(telemetria.porPrompt('desafio', 'Faz o pino').visto, 2);
  // Ver não é decidir: sem aceitar nem recusar não há taxa nenhuma.
  assert.equal(telemetria.porPrompt('desafio', 'Faz o pino').taxaRecusa, null);
});

test('a intensidade fica gravada na ronda: a curva não reescreve o passado', async () => {
  telemetria._reset();
  const { room } = start({ curve: true, intensity: 'caos' });
  const r = await rondaDesafio(room); // aquecimento → sai leve, apesar do teto
  const inten = r.intensity;
  game.resolveAction(room, r.currentPlayerId, 'refuse');
  room.game.roundCount = 60; // a noite avança e a curva sobe…
  const res = telemetria.resumo();
  assert.equal(res.intensidades.find((i) => i.key === inten).recusado, 1, '…e a recusa fica no nível em que foi');
});

test('o salto do host conta como saltado, e não como decisão', async () => {
  telemetria._reset();
  const { room, players } = start();
  await rondaDesafio(room);
  game.skipTurn(room, players[0].id);
  const t = tipo(telemetria.resumo(), 'desafio');
  assert.equal(t.saltado, 1);
  assert.equal(t.aceite + t.recusado, 0, 'saltar não é aceitar nem recusar');
  assert.equal(t.taxaRecusa, null, 'e por isso não gera taxa nenhuma');
  assert.ok(t.taxaSalto > 0, 'mas conta para a taxa de salto do tipo');
});

test('regras da noite: compara-se a recusa COM e SEM cada regra', async () => {
  telemetria._reset();

  // Noite com Sem Escape: uma recusa.
  const a = start({ modifiers: ['sem_escape'] });
  const ra = await rondaDesafio(a.room);
  game.resolveAction(a.room, ra.currentPlayerId, 'refuse');

  // Noite sem regra nenhuma: uma aceitação.
  const b = start({});
  const rb = await rondaDesafio(b.room);
  game.resolveAction(b.room, rb.currentPlayerId, 'accept');

  const r = telemetria.resumo({ minAmostra: 1 }).regras.find((x) => x.key === 'sem_escape');
  assert.equal(r.comRondas, 1);
  assert.equal(r.semRondas, 1);
  assert.equal(r.recusaCom, 100);
  assert.equal(r.recusaSem, 0);

  // Uma regra que nunca esteve ligada tem os dois lados a contar como "sem".
  const outra = telemetria.resumo({ minAmostra: 1 }).regras.find((x) => x.key === 'alvo_marcado');
  assert.equal(outra.comRondas, 0);
  assert.equal(outra.semRondas, 2);
});

test('sorteio: o que saiu e o que a mesa vetou ficam contados', () => {
  telemetria._reset();
  const { room } = makeRoom();
  game.initGame(room, { lives: 3, intensity: 'caos', sorteio: true, vetados: ['sem_anonimato'] });
  const regras = telemetria.resumo().regras;
  const vetada = regras.find((r) => r.key === 'sem_anonimato');
  assert.equal(vetada.vetada, 1);
  assert.equal(vetada.arranque, 0, 'uma regra vetada nunca pode aparecer no arranque');
  const saiu = regras.filter((r) => r.arranque > 0).map((r) => r.key);
  assert.deepEqual(saiu.sort(), [...room.game.modifiers].sort());
});

test('a noite conta-se uma vez só, mesmo que o fim seja recalculado', async () => {
  telemetria._reset();
  const { room, players } = start({ intensity: 'hardcore' });
  const r = await rondaDesafio(room);
  game.resolveAction(room, r.currentPlayerId, 'refuse');
  game.endGame(room, players[0].id);
  game.endGame(room, players[0].id); // religar depois do fim volta a passar aqui

  const n = telemetria.resumo().noites;
  assert.equal(n.total, 1);
  assert.equal(n.mediaJogadores, 3);
  assert.deepEqual(n.porOutcome, [{ key: 'fim', n: 1 }]);
  assert.deepEqual(n.porIntensidade, [{ key: 'hardcore', n: 1 }]);
  assert.equal(n.recentes[0].rondas, room.game.roundCount);
});

test('uma sala que se esvazia a meio conta como noite ABANDONADA', async () => {
  telemetria._reset();
  const { rm, room, players } = start();
  await rondaDesafio(room);
  for (const p of players) rm.handleDisconnect(room.code, p.id);
  await new Promise((res) => setTimeout(res, 60)); // deixa correr o grace period

  const n = telemetria.resumo().noites;
  assert.equal(n.total, 1, 'uma noite largada continua a ser uma noite');
  assert.equal(n.recentes[0].outcome, 'abandonada');
  assert.equal(rm.getRoom(room.code), null, 'e a sala foi mesmo removida');
});

test('uma sala largada no LOBBY não é noite nenhuma', async () => {
  telemetria._reset();
  const { rm, room, players } = makeRoom();
  for (const p of players) rm.handleDisconnect(room.code, p.id);
  await new Promise((res) => setTimeout(res, 60));
  assert.equal(telemetria.resumo().noites.total, 0);
});

test('PRIVACIDADE: nada do que se grava identifica quem estava à mesa', async () => {
  telemetria._reset();
  const nomes = ['Anabela', 'Ruivaldo', 'Zebedeu']; // nomes improváveis num prompt
  const { room, players } = makeRoom(nomes);
  game.initGame(room, { lives: 3 });
  // O que a mesa escreve na preparação é o teste mais duro: é texto de pessoas.
  game.addQuestion(room, players[0].id, players[1].id, 'Uma pergunta secreta da mesa');
  game.beginPlay(room, players[0].id);

  const r = await rondaDesafio(room);
  game.resolveAction(room, r.currentPlayerId, 'refuse');

  // Os TRÊS caminhos por onde texto da mesa chega a `round.prompt`: a pergunta
  // da preparação (Boca Calada), o Quem Disse, e os Segredos. Exercem-se à mão
  // porque a roda podia nunca lá calhar — e é exatamente aqui que uma marca em
  // falta (`promptDaMesa`) passaria despercebida até estar no disco.
  for (const [tipoKey, texto] of [
    ['boca_calada', 'Uma pergunta secreta da mesa'],
    ['quem_disse', 'Outra coisa que alguém disse'],
    ['segredos', 'Um segredo que ninguém devia guardar'],
  ]) {
    const falso = { gameTypeKey: tipoKey, prompt: { text: texto }, promptDaMesa: true };
    telemetria.rondaAbriu(falso, 'leve');
    telemetria.rondaFechou(falso, { intensidade: 'leve', desfecho: 'recusado' });
    assert.equal(telemetria.porPrompt(tipoKey, texto).visto, 0, `${tipoKey} não pode ser contado`);
    assert.ok(tipo(telemetria.resumo(), tipoKey).saiu > 0, `${tipoKey}: o TIPO continua a contar`);
  }

  game.endGame(room, players[0].id);

  // O resumo é exatamente o que vai para a página, para o disco e para a BD.
  const gravado = JSON.stringify(telemetria.resumo());
  for (const nome of nomes) assert.ok(!gravado.includes(nome), `o nome ${nome} não pode estar aqui`);
  assert.ok(!gravado.includes('pergunta secreta'), 'o que a mesa escreve nunca é telemetria');
  assert.ok(!gravado.includes('segredo que ninguém'), 'muito menos um segredo');
  assert.ok(!gravado.includes('alguém disse'));
  for (const p of players) assert.ok(!gravado.includes(p.id), 'nem os ids dos jogadores');
});

test('TELEMETRIA=0 não é um filtro no fim: não se recolhe nada', () => {
  telemetria._reset();
  // `ENABLED` fixa-se no import, por isso testa-se a porta de entrada, que é o
  // que todo o módulo usa — se `conta` respeitar o interruptor, todo o resto o faz.
  assert.equal(typeof telemetria.ENABLED, 'boolean');
  telemetria.conta('tipo', 'desafio', 'saiu');
  assert.equal(tipo(telemetria.resumo(), 'desafio').saiu, telemetria.ENABLED ? 1 : 0);
});

test('resumo aguenta estar vazio (é o estado do primeiro arranque)', () => {
  telemetria._reset();
  const r = telemetria.resumo();
  assert.equal(r.noites.total, 0);
  assert.equal(r.noites.mediaRondas, 0);
  assert.deepEqual(r.prompts, []);
  assert.equal(r.intensidades.length, 4, 'as intensidades aparecem sempre, a zeros');
  assert.ok(r.intensidades.every((i) => i.taxaRecusa === null));
});
