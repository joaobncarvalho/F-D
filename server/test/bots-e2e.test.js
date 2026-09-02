// F&D — teste end-to-end do motor da Roda, conduzido pelos bots.
//
// Os bots jogam SOZINHOS todas as mecânicas (spin/aceitar/votar/adivinhar/RPS/
// piramide/vasco). É a melhor rede contra regressões ao mexer no game.js: se
// alguma mecânica partir ou encravar, este teste falha (deadlock → timeout de
// iterações; erro → excepção; fuga → assert).

import { test } from 'node:test';
import assert from 'node:assert/strict';

delete process.env.DATABASE_URL; // corre contra o conteúdo em memória

const { RoomManager, serializeRoom } = await import('../src/rooms.js');
const game = await import('../src/game.js');
const bots = await import('../src/bots.js');

test('Roda e2e (bots): joga todas as mecânicas sem encravar nem fugas', async () => {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom('AnfitriaoBot');
  host.isBot = true; // no teste, o host também é bot para conduzir tudo
  rm.addBot(room.code);
  rm.addBot(room.code);
  rm.addBot(room.code); // 4 jogadores, todos bots

  room.status = 'playing';
  game.initGame(room, { lives: 3 });

  // PREP: bots submetem perguntas + segredos.
  let guard = 0;
  while (room.game.phase === 'prep' && guard++ < 100) {
    if (!(await bots.driveBots(room))) break;
  }
  game.beginPlay(room, host.id);

  const seenTypes = new Set();
  let leaked = null;
  let iters = 0;
  // Joga até visitar todas as mecânicas OU um tecto de rondas — o que vier primeiro.
  const WANT = [
    'boca_calada', 'desafio', 'isto_ou_aquilo', 'intrigas', 'segredos', 'piramide', 'vasco',
    // Tipos de mesa inteira / mecânica (2026-09-01) — se algum encravar, este teste pendura.
    'eu_nunca', 'mais_provavel', 'termometro', 'quem_disse', 'cascata', 'desenho', 'reacao',
  ];
  while (room.game && room.game.phase !== 'gameover' && iters++ < 8000) {
    // Este teste é sobre MECÂNICAS, não sobre desgaste: mantém-se a mesa de pé
    // para todas poderem sair. Desde que falhar um jogo a tempo custa uma vida,
    // quatro bots eliminavam-se uns aos outros antes de a roda calhar nos tipos
    // raros (o Vasco tem peso 3 em ~110) e o teste falhava à sorte.
    for (const p of room.players.values()) {
      if (p.lives < 3) p.lives = 3;
      p.eliminated = false;
    }
    await bots.driveBots(room, {
      onSpin: (round) => {
        seenTypes.add(round.gameTypeKey);
        const r = serializeRoom(room).game.round;
        if (round.gameTypeKey === 'segredos' && r && 'secretAuthorId' in r) leaked = 'segredos.author';
        if (round.gameTypeKey === 'vasco' && r && ('secretWord' in r || 'impostorIds' in r)) leaked = 'vasco.secret';
        if (round.gameTypeKey === 'piramide' && r && 'hands' in r) leaked = 'piramide.hands';
      },
    });
    if (WANT.every((t) => seenTypes.has(t)) && room.game.roundCount >= 30) break;
  }

  assert.equal(leaked, null, `não pode haver fuga de anonimato (${leaked})`);
  assert.ok(room.game.roundCount >= 30, `esperava ≥30 rondas, houve ${room.game.roundCount} (bots encravaram?)`);
  for (const t of WANT) {
    assert.ok(seenTypes.has(t), `a mecânica "${t}" nunca foi exercida (${[...seenTypes].join(', ')})`);
  }
});
