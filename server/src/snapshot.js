// F&D — snapshot das salas (recuperação depois de o servidor reiniciar).
//
// O estado das salas vive em memória, de propósito (latência). O preço é que um
// reinício do processo — um deploy, um crash, o `--watch` em dev — apagava TODAS
// as salas a meio da noite. Aqui gravamos periodicamente um retrato do estado e
// voltamos a carregá-lo no arranque: os telemóveis religam-se sozinhos (já fazem
// `rejoin_room`) e a festa continua de onde ia.
//
// DOIS destinos, de propósito:
//   · ficheiro (`.data/rooms.json`) — instantâneo, sempre disponível, cobre o
//     reinício do processo e do container. É o que salva o dev e o `--watch`.
//   · Postgres (tabela `room_snapshots`) — mais lento, por isso menos frequente,
//     mas é o ÚNICO que sobrevive a um deploy que troque de máquina (o disco do
//     container não vai com ela). É por isso que existem os dois.
//
// No arranque tenta-se a BD primeiro (é a fonte mais fiável entre máquinas) e
// cai-se para o ficheiro. Uma falha de qualquer um deles nunca impede o servidor
// de arrancar — pior do que perder as salas era não abrir de todo.
//
// Desliga-se com SNAPSHOT=0.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prismaClient } from './repo.js';
import { log } from './log.js';

const DEFAULT_FILE = fileURLToPath(new URL('../.data/rooms.json', import.meta.url));
const FILE = process.env.SNAPSHOT_FILE || DEFAULT_FILE;
const MAX_AGE_MS = Number(process.env.SNAPSHOT_MAX_AGE_MS) || 6 * 60 * 60 * 1000; // 6h
const FILE_EVERY_MS = Number(process.env.SNAPSHOT_EVERY_MS) || 5000;
const DB_EVERY_MS = Number(process.env.SNAPSHOT_DB_EVERY_MS) || 15000; // a BD é mais cara

export const ENABLED = process.env.SNAPSHOT !== '0';

// ----- Conversão ------------------------------------------------------------

/** Converte a sala para JSON simples (Maps → arrays, Sets → arrays, sem timers). */
export function toPlain(room) {
  const { cleanupTimer, players, promptBags, ...rest } = room;
  return {
    ...rest,
    players: [...players.values()],
    promptBags: Object.fromEntries(Object.entries(promptBags || {}).map(([k, v]) => [k, [...v]])),
  };
}

/** O caminho inverso. Todos voltam como DESLIGADOS: religam-se com `rejoin_room`. */
export function fromPlain(plain) {
  const room = { ...plain, cleanupTimer: null };
  room.players = new Map(plain.players.map((p) => [p.id, { ...p, connected: false }]));
  room.promptBags = Object.fromEntries(
    Object.entries(plain.promptBags || {}).map(([k, v]) => [k, new Set(v)])
  );
  return room;
}

/** As salas que vale a pena guardar (uma sala terminada não interessa a ninguém). */
function vivas(manager) {
  return [...manager.rooms.values()].filter((r) => r.status !== 'ended');
}

// ----- Destino: ficheiro ----------------------------------------------------

function saveFile(manager) {
  try {
    const payload = JSON.stringify({ savedAt: Date.now(), rooms: vivas(manager).map(toPlain) });
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, payload);
    fs.renameSync(tmp, FILE); // atómico: nunca se lê um ficheiro meio-escrito
    return true;
  } catch (err) {
    log.warn('snapshot: falhou a gravação em ficheiro', { message: err?.message });
    return false;
  }
}

function loadFile() {
  try {
    if (!fs.existsSync(FILE)) return [];
    const { savedAt, rooms } = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!Array.isArray(rooms)) return [];
    if (Date.now() - (savedAt || 0) > MAX_AGE_MS) return [];
    return rooms;
  } catch (err) {
    log.warn('snapshot: falhou a leitura do ficheiro', { message: err?.message });
    return [];
  }
}

// ----- Destino: Postgres ----------------------------------------------------

/**
 * Grava uma linha por sala e limpa as que já não existem. `prisma` é injetável
 * para os testes poderem exercitar este caminho sem uma base de dados a sério.
 */
export async function saveDb(manager, prisma) {
  if (!prisma) return false;
  try {
    const salas = vivas(manager);
    for (const room of salas) {
      const data = toPlain(room);
      await prisma.roomSnapshot.upsert({
        where: { code: room.code },
        update: { data, savedAt: new Date() },
        create: { code: room.code, data },
      });
    }
    // Salas que acabaram (ou desapareceram) não têm de ficar a ocupar espaço.
    const codigos = salas.map((r) => r.code);
    await prisma.roomSnapshot.deleteMany({
      where: {
        OR: [
          { code: { notIn: codigos.length ? codigos : ['—'] } },
          { savedAt: { lt: new Date(Date.now() - MAX_AGE_MS) } },
        ],
      },
    });
    return true;
  } catch (err) {
    // Uma BD sem a tabela (ainda sem `db push`) cai aqui — o ficheiro continua a
    // fazer o seu trabalho e o jogo nem dá por isso.
    log.warn('snapshot: falhou a gravação na BD, fica o ficheiro', { message: err?.message });
    return false;
  }
}

export async function loadDb(prisma) {
  if (!prisma) return [];
  try {
    const rows = await prisma.roomSnapshot.findMany({
      where: { savedAt: { gt: new Date(Date.now() - MAX_AGE_MS) } },
    });
    return rows.map((r) => r.data).filter(Boolean);
  } catch (err) {
    log.warn('snapshot: falhou a leitura da BD, tento o ficheiro', { message: err?.message });
    return [];
  }
}

// ----- API ------------------------------------------------------------------

/** Grava o retrato atual. `deep` inclui a BD (mais cara, corre menos vezes). */
export async function save(manager, { deep = false, prisma } = {}) {
  if (!ENABLED) return false;
  const ok = saveFile(manager);
  if (deep) {
    const client = prisma !== undefined ? prisma : await prismaClient();
    await saveDb(manager, client);
  }
  return ok;
}

/**
 * Repõe as salas gravadas: BD primeiro (sobrevive a trocas de máquina), ficheiro
 * a seguir. Nunca lança. Devolve quantas salas foram recuperadas.
 */
export async function restore(manager, { prisma } = {}) {
  if (!ENABLED) return 0;
  const client = prisma !== undefined ? prisma : await prismaClient();
  const daBd = await loadDb(client);
  const doFicheiro = loadFile();
  const origem = daBd.length ? 'bd' : 'ficheiro';

  // A BD manda; o ficheiro entra só para as salas que a BD não tinha (ex.: a
  // gravação profunda ainda não tinha corrido quando o servidor caiu).
  const porCodigo = new Map();
  for (const plain of [...doFicheiro, ...daBd]) {
    if (plain?.code) porCodigo.set(plain.code, plain);
  }

  let n = 0;
  for (const [code, plain] of porCodigo) {
    if (manager.rooms.has(code)) continue;
    try {
      manager.rooms.set(code, fromPlain(plain));
      n += 1;
    } catch (err) {
      log.warn('snapshot: sala ilegível, ignorada', { code, message: err?.message });
    }
  }
  if (n) log.info('snapshot: salas recuperadas', { salas: n, origem });
  return n;
}

/**
 * Liga a gravação periódica (ficheiro a cada 5s, BD a cada 15s) + gravação no
 * encerramento (SIGTERM do Railway, que é o caso do deploy).
 * Devolve uma função para parar (usada nos testes).
 */
export function startAutosave(manager) {
  if (!ENABLED) return () => {};
  const rapido = setInterval(() => save(manager), FILE_EVERY_MS);
  const profundo = setInterval(() => save(manager, { deep: true }), DB_EVERY_MS);
  rapido.unref?.(); // não segurar o processo
  profundo.unref?.();

  const onExit = async () => {
    // Última gravação COM a BD: é a que salva o estado num redeploy.
    await save(manager, { deep: true }).catch(() => {});
    process.exit(0);
  };
  process.once('SIGTERM', onExit);
  process.once('SIGINT', onExit);
  log.info('snapshot ativo', { ficheiro: FILE, ficheiroMs: FILE_EVERY_MS, bdMs: DB_EVERY_MS });
  return () => {
    clearInterval(rapido);
    clearInterval(profundo);
  };
}
