// F&D — teste end-to-end pela REDE (Socket.io a sério, cliente a sério).
//
// Os outros testes exercitam os motores; este exercita a CAMADA DE LIGAÇÃO, que
// é onde vive metade do risco: ~60 eventos registados à mão, entregas privadas
// por canal (palavra do desenho, autor da pergunta), a pausa que tem de recusar
// pacotes, e o modo TV que entra na sala sem ser jogador.
//
// Se um `socket.on` ficar por ligar, ou um payload privado passar a ir no
// broadcast, é aqui que se apanha — e não numa festa com oito pessoas à espera.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';

delete process.env.DATABASE_URL; // conteúdo em memória
process.env.SNAPSHOT = '0'; // sem gravação em disco durante os testes
process.env.AUTO_RESOLVE_MS = '0'; // sem varrimento automático a interferir

const { registerSocketHandlers } = await import('../src/socket.js');

/** Sobe um servidor real numa porta livre e devolve helpers de cliente. */
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

/** Emite com ack e devolve a resposta (falha o teste se o servidor recusar). */
function pede(socket, evento, payload = {}) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`sem resposta a ${evento}`)), 3000);
    socket.emit(evento, payload, (r) => {
      clearTimeout(t);
      res(r);
    });
  });
}

/** Espera pelo próximo `room_state` que satisfaça a condição. */
function esperaEstado(socket, cond, label = 'estado') {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout à espera de ${label}`)), 4000);
    const h = ({ room }) => {
      if (cond(room)) {
        clearTimeout(t);
        socket.off('room_state', h);
        res(room);
      }
    };
    socket.on('room_state', h);
  });
}

function esperaEvento(socket, evento) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout à espera do evento ${evento}`)), 4000);
    socket.once(evento, (p) => {
      clearTimeout(t);
      res(p);
    });
  });
}

/**
 * Gira a roda até sair um dos tipos pedidos, saltando as rondas que não servem.
 * Gira sempre pelo jogador da vez — o servidor não deixa outro girar.
 */
async function giraAte(s, tipos) {
  let room = null;
  for (let i = 0; i < 400; i++) {
    const quem = socketDe(s, s.ultimo?.game?.currentPlayerId);
    const proximo = esperaEstado(s.a, (r) => !!r.game.round, 'ronda');
    const res = await pede(quem, 'spin_wheel');
    if (!res.ok) {
      // A espera fica pendurada e o seu temporizador rejeita 4s depois — já
      // fora do teste, como unhandledRejection que derruba a corrida inteira.
      // Quanto mais tipos a roda tem, mais voltas isto dá e mais provável era.
      proximo.catch(() => {});
      continue;
    }
    room = await proximo;
    if (tipos.includes(room.game.round.gameTypeKey)) return room;
    await pede(s.a, 'skip_turn'); // ronda que não interessa: fecha e volta a girar
    room = null;
  }
  return null;
}

function socketDe(s, playerId) {
  return { [s.ids.a]: s.a, [s.ids.b]: s.b, [s.ids.c]: s.c }[playerId] || s.a;
}

/** Cria uma sala com 3 jogadores ligados e devolve tudo o que os testes precisam. */
async function sala(cliente) {
  const a = cliente();
  const b = cliente();
  const c = cliente();
  const criada = await pede(a, 'create_room', { name: 'Ana' });
  const code = criada.room.code;
  const entrouB = await pede(b, 'join_room', { code, name: 'Bruno' });
  const entrouC = await pede(c, 'join_room', { code, name: 'Carla' });
  const s = {
    code,
    a, b, c,
    ids: { a: criada.you, b: entrouB.you, c: entrouC.you },
    // Prova de identidade de cada jogador (o rejoin exige-a — ver rooms.reconnect).
    tokens: { [criada.you]: criada.token, [entrouB.you]: entrouB.token, [entrouC.you]: entrouC.token },
    ultimo: criada.room, // último room_state visto (para saber de quem é a vez)
  };
  a.on('room_state', ({ room }) => {
    s.ultimo = room;
  });
  return s;
}

test('socket: identidade, duração e curva chegam ao estado da sala', async (t) => {
  const { cliente, fechar } = await arranca();
  t.after(fechar);
  const s = await sala(cliente);

  assert.equal((await pede(s.a, 'set_identity', { emoji: '🦄', color: '#4ade80' })).ok, true);
  const r1 = await esperaEstado(s.b, (room) => room.players.some((p) => p.emoji === '🦄'), 'emoji');
  const ana = r1.players.find((p) => p.id === s.ids.a);
  assert.equal(ana.color, '#4ade80');

  // Dois jogadores não podem ficar com o mesmo emoji (senão perde-se a leitura à mesa).
  const repetido = await pede(s.b, 'set_identity', { emoji: '🦄' });
  assert.equal(repetido.ok, false);

  assert.equal((await pede(s.a, 'set_night_length', { minutos: 90 })).ok, true);
  assert.equal((await pede(s.a, 'set_curve', { on: false })).ok, true);
  const r2 = await esperaEstado(
    s.c,
    (room) => room.duracaoMin === 90 && room.curve === false,
    'duração+curva'
  );
  assert.equal(r2.duracaoMin, 90);

  // Só o host mexe nestas duas.
  assert.equal((await pede(s.b, 'set_night_length', { minutos: 60 })).ok, false);
  assert.equal((await pede(s.b, 'set_curve', { on: true })).ok, false);
});

test('socket: a pausa do host recusa mesmo as ações de jogo', async (t) => {
  const { cliente, fechar } = await arranca();
  t.after(fechar);
  const s = await sala(cliente);

  const aJogar = esperaEstado(s.a, (room) => room.status === 'playing', 'jogo a decorrer');
  await pede(s.a, 'start_game', { lives: 3 });
  await aJogar;
  await pede(s.a, 'begin_play');

  const emPausa = esperaEstado(s.b, (room) => room.paused === true, 'pausa');
  assert.equal((await pede(s.a, 'pause_game', { paused: true })).ok, true);
  await emPausa;

  // Com a sala em pausa, o pacote é descartado e chega um erro legível.
  const erro = esperaEvento(s.a, 'error_msg');
  s.a.emit('spin_wheel');
  assert.match((await erro).message, /pausa/i);

  const retomado = esperaEstado(s.b, (room) => room.paused === false, 'retoma');
  assert.equal((await pede(s.a, 'pause_game', { paused: false })).ok, true);
  await retomado;
  assert.equal((await pede(s.a, 'spin_wheel')).ok, true); // já dá
});

test('socket: modo TV entra sem ser jogador e recebe o estado', async (t) => {
  const { cliente, fechar } = await arranca();
  t.after(fechar);
  const s = await sala(cliente);

  const tv = cliente();
  const resposta = await pede(tv, 'watch_room', { code: s.code });
  assert.equal(resposta.ok, true);
  assert.equal(resposta.you, null, 'a TV não é jogador');
  assert.equal(resposta.room.players.length, 3, 'a TV não ocupa lugar na sala');

  // E continua a receber atualizações como qualquer outro ecrã.
  const atualizado = esperaEstado(tv, (room) => room.duracaoMin === 60, 'estado na TV');
  await pede(s.a, 'set_night_length', { minutos: 60 });
  await atualizado; // a TV vê a mudança sem ter feito nada

  const inexistente = await pede(tv, 'watch_room', { code: 'ZZZZ' });
  assert.equal(inexistente.ok, false);
});

test('socket: jogos de grupo respondem e revelam pela rede', async (t) => {
  const { cliente, fechar } = await arranca();
  t.after(fechar);
  const s = await sala(cliente);

  await pede(s.a, 'start_game', { lives: 3 });
  await pede(s.a, 'begin_play');

  // Gira até sair um jogo de mesa inteira que não dependa da preparação.
  const room = await giraAte(s, ['eu_nunca', 'mais_provavel', 'termometro']);
  assert.ok(room, 'nunca saiu um jogo de grupo em 400 voltas');

  const key = room.game.round.gameTypeKey;
  const resposta = { eu_nunca: 'ja', termometro: 7, mais_provavel: s.ids.b }[key];
  const outra = { eu_nunca: 'nunca', termometro: 2, mais_provavel: s.ids.a }[key];

  const umaResposta = esperaEstado(s.b, (r) => r.game.round?.answeredIds?.length === 1, '1 resposta');
  await pede(s.a, 'grupo_answer', { value: resposta });
  const meio = await umaResposta;
  assert.ok(!('answers' in meio.game.round), 'as respostas não podem ir no broadcast');

  const revelado = esperaEstado(s.c, (r) => r.game.round?.revealed, 'reveal');
  await pede(s.b, 'grupo_answer', { value: outra });
  await pede(s.c, 'grupo_answer', { value: outra });
  const fim = await revelado;
  assert.ok(fim.game.round.result, 'no fim há resultado para toda a mesa');
});

test('socket: no Desenha, a palavra vai por canal privado e os traços não vão no estado', async (t) => {
  const { cliente, fechar } = await arranca();
  t.after(fechar);
  const s = await sala(cliente);

  await pede(s.a, 'start_game', { lives: 3 });
  await pede(s.a, 'begin_play');

  const room = await giraAte(s, ['desenho']);
  assert.ok(room, 'nunca saiu o Desenha em 400 voltas');
  assert.ok(!('word' in room.game.round), 'a palavra não vai no broadcast');

  // A palavra é entregue a quem desenha por canal privado — vamos buscá-la à
  // reconexão, que é o mesmo caminho que um telemóvel usa depois de cair.
  const desenhista = socketDe(s, room.game.round.currentPlayerId);
  const idDesenhista = room.game.round.currentPlayerId;
  const palavraPrometida = esperaEvento(desenhista, 'desenho_word');
  desenhista.emit('rejoin_room', { code: s.code, playerId: idDesenhista, token: s.tokens[idDesenhista] });
  const { word } = await palavraPrometida;
  assert.ok(word, 'quem desenha recebe a palavra em privado');

  await pede(desenhista, 'desenho_start');
  // Os traços viajam por canal próprio — e só de quem está a desenhar.
  const espectador = [s.a, s.b, s.c].find((x) => x !== desenhista);
  const traco = esperaEvento(espectador, 'draw_stroke');
  desenhista.emit('draw_stroke', { points: [[0.1, 0.1], [0.4, 0.5]], color: '#fff', width: 4 });
  assert.equal((await traco).points.length, 2);

  const resultado = esperaEstado(espectador, (r) => r.game.round?.substate === 'result', 'resultado');
  await pede(espectador, 'desenho_guess', { text: word });
  const fim = await resultado;
  assert.ok(fim.game.round.result.winner, 'quem acertou fica registado');
  assert.equal(fim.game.round.result.word, word, 'no fim a palavra é pública');
});

test('socket: o veto do host chega à sala, e as regras da noite sorteiam-se', async (t) => {
  const { cliente, fechar } = await arranca();
  t.after(fechar);
  const s = await sala(cliente);

  // Uma sala nova já nasce com o Sem Anonimato fora do sorteio — sem ninguém
  // tocar em nada. É esta a promessa que substituiu a escolha do host.
  assert.deepEqual(s.ultimo.modifiers.vetados, ['sem_anonimato']);
  assert.deepEqual(s.ultimo.modifiers.ativos, [], 'no lobby ainda não há regras');
  assert.ok(s.ultimo.modifiers.catalogo.length >= 6);

  // Só o host mexe nos vetos.
  const recusa = await pede(s.b, 'set_vetados', { vetados: [] });
  assert.equal(recusa.ok, false);

  // O host veta tudo menos o Dobro ou Nada: assim o sorteio é determinista e o
  // teste pode afirmar o que saiu (sem isto, sortear é intestável pela rede).
  const soUm = s.ultimo.modifiers.catalogo
    .map((m) => m.key)
    .filter((k) => k !== 'dobro_ou_nada');
  assert.equal((await pede(s.a, 'set_vetados', { vetados: soUm })).ok, true);
  const comVeto = await esperaEstado(s.c, (r) => r.modifiers.vetados.length === soUm.length, 'veto');
  assert.ok(!comVeto.modifiers.vetados.includes('dobro_ou_nada'));

  // Toda a mesa vota Caos: 3 a 4 regras à partida, mas só uma escapou ao veto.
  for (const sock of [s.a, s.b, s.c]) await pede(sock, 'vote_intensity', { intensity: 'caos' });
  await pede(s.a, 'start_game', { lives: 3 });
  const aJogar = await esperaEstado(s.b, (r) => !!r.game, 'jogo a começar');
  assert.deepEqual(aJogar.game.modifiers, ['dobro_ou_nada'], 'saiu a única que não estava vetada');
  assert.deepEqual(aJogar.modifiers.ativos, ['dobro_ou_nada'], '…e o payload da sala concorda');
});
