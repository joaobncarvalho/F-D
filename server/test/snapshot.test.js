// F&D — snapshot: ficheiro e base de dados.
//
// Isto é a rede de segurança da noite: se falhar, um redeploy a meio da festa
// apaga todas as salas. Aqui exercitam-se os dois destinos — o ficheiro com o
// disco a sério, e a BD com um Prisma falso (não há Postgres nos testes, mas o
// que interessa validar é a NOSSA lógica: o que se grava, o que se limpa e quem
// ganha quando os dois têm dados).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

delete process.env.DATABASE_URL; // sem BD real: o caminho da BD é injetado
process.env.SNAPSHOT_FILE = path.join(os.tmpdir(), `fd-snapshot-${process.pid}.json`);
process.env.AUTO_RESOLVE_MS = '0';

const { RoomManager } = await import('../src/rooms.js');
const game = await import('../src/game.js');
const snapshot = await import('../src/snapshot.js');

test.after(() => {
  try {
    fs.unlinkSync(process.env.SNAPSHOT_FILE);
  } catch {
    /* já não existe */
  }
});

/** Prisma falso: só a fatia de `roomSnapshot` que o snapshot.js usa. */
function prismaFalso() {
  const linhas = new Map();
  const json = (v) => JSON.parse(JSON.stringify(v)); // como uma coluna Json a sério
  return {
    linhas,
    roomSnapshot: {
      async upsert({ where, update, create }) {
        const existente = linhas.get(where.code);
        const novo = existente ? { ...existente, ...update } : { ...create, savedAt: new Date() };
        linhas.set(where.code, { ...novo, data: json(novo.data) });
      },
      async deleteMany({ where }) {
        const manter = where.OR[0].code.notIn;
        const limite = where.OR[1].savedAt.lt;
        for (const [code, row] of [...linhas]) {
          if (!manter.includes(code) || row.savedAt < limite) linhas.delete(code);
        }
      },
      async findMany({ where }) {
        const limite = where.savedAt.gt;
        return [...linhas.values()].filter((r) => r.savedAt > limite);
      },
    },
  };
}

/** Uma sala a meio de um jogo — o caso que interessa mesmo recuperar. */
async function salaAJogar() {
  const rm = new RoomManager();
  const { room, player: host } = rm.createRoom('Ana');
  const bruno = rm.joinRoom(room.code, 'Bruno').player;
  rm.setIdentity(room.code, host.id, { emoji: '🦄' });
  room.status = 'playing';
  game.initGame(room, { lives: 3 });
  game.beginPlay(room, host.id);
  await game.spinWheel(room, host.id);
  // Nem todos os tipos sorteiam prompts (há mecânicas puras) — garantimos que o
  // saco anti-repetição tem conteúdo para testar a conversão Set ↔ array.
  room.promptBags.desafio = new Set(['um desafio já usado']);
  return { rm, room, host, bruno };
}

test('snapshot: o ficheiro devolve a sala a meio do jogo', async () => {
  const { rm, room, host } = await salaAJogar();
  const fase = room.game.phase;
  const ronda = room.game.round?.id;

  assert.equal(await snapshot.save(rm), true);

  // Servidor "reiniciado": gestor novo, memória vazia.
  const novo = new RoomManager();
  const n = await snapshot.restore(novo, { prisma: null });
  assert.equal(n, 1);

  const recuperada = novo.getRoom(room.code);
  assert.ok(recuperada, 'a sala voltou');
  assert.equal(recuperada.game.phase, fase, 'a fase é a mesma');
  assert.equal(recuperada.game.round?.id, ronda, 'a ronda é a mesma');
  assert.equal(recuperada.players.get(host.id).emoji, '🦄', 'a identidade sobreviveu');
  assert.equal(recuperada.players.get(host.id).connected, false, 'todos voltam desligados até religarem');
  assert.ok(recuperada.promptBags.desafio instanceof Set, 'o saco de prompts volta a ser um Set');
  assert.ok(recuperada.promptBags.desafio.has('um desafio já usado'), 'e mantém o que já saiu');
});

test('snapshot: a gravação profunda escreve na BD e limpa as salas que acabaram', async () => {
  const { rm, room } = await salaAJogar();
  const prisma = prismaFalso();

  await snapshot.save(rm, { deep: true, prisma });
  assert.equal(prisma.linhas.size, 1, 'uma linha por sala viva');
  assert.equal(prisma.linhas.get(room.code).data.code, room.code);

  // A sala acaba → deixa de ser gravada e a linha é removida.
  room.status = 'ended';
  await snapshot.save(rm, { deep: true, prisma });
  assert.equal(prisma.linhas.size, 0, 'salas terminadas não ficam a ocupar espaço');
});

test('snapshot: a BD manda sobre o ficheiro (é a que sobrevive a trocar de máquina)', async () => {
  const { rm, room } = await salaAJogar();
  const prisma = prismaFalso();
  await snapshot.save(rm, { deep: true, prisma }); // ficheiro + BD

  // O jogo avança e só o FICHEIRO é atualizado — como acontece entre duas
  // gravações profundas.
  const antes = room.game.roundCount;
  room.game.roundCount = antes + 5;
  await snapshot.save(rm);

  // Máquina nova: só existe a BD (o disco ficou para trás).
  const novo = new RoomManager();
  await snapshot.restore(novo, { prisma });
  assert.equal(novo.getRoom(room.code).game.roundCount, antes, 'veio o retrato da BD');
});

test('snapshot: uma BD sem a tabela não impede o arranque nem perde o ficheiro', async () => {
  const { rm, room } = await salaAJogar();
  const partido = {
    roomSnapshot: {
      async upsert() {
        throw new Error('relation "room_snapshots" does not exist');
      },
      async deleteMany() {
        throw new Error('relation "room_snapshots" does not exist');
      },
      async findMany() {
        throw new Error('relation "room_snapshots" does not exist');
      },
    },
  };

  // Grava na mesma (o ficheiro faz o trabalho) e não lança.
  assert.equal(await snapshot.save(rm, { deep: true, prisma: partido }), true);

  const novo = new RoomManager();
  const n = await snapshot.restore(novo, { prisma: partido });
  assert.equal(n, 1, 'recuperou pelo ficheiro apesar de a BD falhar');
  assert.equal(novo.getRoom(room.code).code, room.code);
});
