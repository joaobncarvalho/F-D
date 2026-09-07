// F&D — o PORTÃO da sala de teste (server/src/devticket.js + socket.js).
//
// Este ficheiro corre de propósito SEM `ENABLE_DEV_BOTS`, que é a situação do
// servidor a sério. O que se testa é que, aí, a sala de teste só abre com um
// bilhete da /admin — e que sem bilhete (ou com um inventado) fica fechada.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as connect } from 'socket.io-client';

delete process.env.DATABASE_URL;
delete process.env.ENABLE_DEV_BOTS; // produção: a variável de dev NÃO está ligada
process.env.SNAPSHOT = '0';
process.env.AUTO_RESOLVE_MS = '0';

const devticket = await import('../src/devticket.js');
const { registerSocketHandlers } = await import('../src/socket.js');

async function arranca() {
  const http = createServer();
  const io = new Server(http, { cors: { origin: '*' } });
  registerSocketHandlers(io);
  await new Promise((res) => http.listen(0, res));
  const cli = connect(`http://localhost:${http.address().port}`, { transports: ['websocket'], forceNew: true });
  const pede = (evento, payload = {}) =>
    new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(`sem resposta a ${evento}`)), 4000);
      cli.emit(evento, payload, (r) => {
        clearTimeout(t);
        res(r);
      });
    });
  const fecha = async () => {
    cli.close();
    io.close();
    await new Promise((res) => http.close(res));
  };
  return { pede, fecha };
}

test('devticket: o bilhete emitido vale; um inventado não', () => {
  const { token } = devticket.emite();
  assert.equal(devticket.valida(token), true);
  assert.equal(devticket.valida('nao-e-um-bilhete'), false);
  assert.equal(devticket.valida(null), false);
  assert.equal(devticket.valida(''), false);
});

test('sem ENABLE_DEV_BOTS e sem bilhete, a sala de teste não abre', async () => {
  const { pede, fecha } = await arranca();
  try {
    const r = await pede('dev_playtest', { mode: 'wheel', bots: 3 });
    assert.equal(r.ok, false);
    assert.match(r.message, /sala de teste está fechada/i);

    const c = await pede('dev_catalogo', {});
    assert.equal(c.ok, false);

    const f = await pede('dev_force_next', { gameTypeKey: 'tribunal' });
    assert.equal(f.ok, false);
  } finally {
    await fecha();
  }
});

test('com um bilhete da /admin, abre — e com um falso, não', async () => {
  const { pede, fecha } = await arranca();
  try {
    const mau = await pede('dev_playtest', { mode: 'wheel', bots: 3, ticket: 'inventado' });
    assert.equal(mau.ok, false);

    const { token } = devticket.emite();
    const bom = await pede('dev_playtest', { mode: 'wheel', bots: 3, ticket: token });
    assert.equal(bom.ok, true, bom.message);
    assert.equal(bom.room.players.length, 4);

    // O bilhete continua a valer para o resto da sessão de testes (não é de uso único).
    const cat = await pede('dev_catalogo', { ticket: token });
    assert.equal(cat.ok, true);
    assert.ok(cat.tipos.length > 0);
    assert.ok(cat.casas.length > 0);
  } finally {
    await fecha();
  }
});
