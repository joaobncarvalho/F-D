// F&D — snapshot das salas em disco (recuperação depois de o servidor reiniciar).
//
// O estado das salas vive em memória, de propósito (latência). O preço é que um
// reinício do processo — um deploy, um crash, o `--watch` em dev — apagava TODAS
// as salas a meio da noite. Aqui gravamos periodicamente um retrato do estado e
// voltamos a carregá-lo no arranque: os telemóveis religam-se sozinhos (já fazem
// `rejoin_room`) e a festa continua de onde ia.
//
// Limite honesto: o ficheiro vive no disco do container. Cobre reinícios do
// processo e do container; NÃO cobre um deploy que troca de máquina/volume. Para
// isso seria preciso guardar na Postgres — fica como passo seguinte, com o schema
// do colega. Define SNAPSHOT_FILE para apontar a um volume persistente.
//
// Desliga-se com SNAPSHOT=0.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from './log.js';

const DEFAULT_FILE = fileURLToPath(new URL('../.data/rooms.json', import.meta.url));
const FILE = process.env.SNAPSHOT_FILE || DEFAULT_FILE;
const MAX_AGE_MS = Number(process.env.SNAPSHOT_MAX_AGE_MS) || 6 * 60 * 60 * 1000; // 6h
const SAVE_EVERY_MS = Number(process.env.SNAPSHOT_EVERY_MS) || 5000;

export const ENABLED = process.env.SNAPSHOT !== '0';

/** Converte a sala para JSON simples (Maps → arrays, Sets → arrays, sem timers). */
function toPlain(room) {
  const { cleanupTimer, players, promptBags, ...rest } = room;
  return {
    ...rest,
    players: [...players.values()],
    promptBags: Object.fromEntries(Object.entries(promptBags || {}).map(([k, v]) => [k, [...v]])),
  };
}

function fromPlain(plain) {
  const room = { ...plain, cleanupTimer: null };
  room.players = new Map(plain.players.map((p) => [p.id, { ...p, connected: false }]));
  room.promptBags = Object.fromEntries(
    Object.entries(plain.promptBags || {}).map(([k, v]) => [k, new Set(v)])
  );
  return room;
}

/** Grava o retrato atual (escrita atómica: tmp + rename). */
export function save(manager) {
  if (!ENABLED) return false;
  try {
    const rooms = [...manager.rooms.values()]
      .filter((r) => r.status !== 'ended')
      .map(toPlain);
    const payload = JSON.stringify({ savedAt: Date.now(), rooms });
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, payload);
    fs.renameSync(tmp, FILE); // atómico: nunca se lê um ficheiro meio-escrito
    return true;
  } catch (err) {
    log.warn('snapshot: falhou a gravação', { message: err?.message });
    return false;
  }
}

/** Repõe as salas gravadas. Devolve quantas foram recuperadas. */
export function restore(manager) {
  if (!ENABLED) return 0;
  try {
    if (!fs.existsSync(FILE)) return 0;
    const { savedAt, rooms } = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!Array.isArray(rooms)) return 0;
    if (Date.now() - (savedAt || 0) > MAX_AGE_MS) {
      log.info('snapshot: demasiado antigo, ignorado');
      return 0;
    }
    let n = 0;
    for (const plain of rooms) {
      if (!plain?.code || manager.rooms.has(plain.code)) continue;
      manager.rooms.set(plain.code, fromPlain(plain));
      n += 1;
    }
    if (n) log.info('snapshot: salas recuperadas', { salas: n, idadeSeg: Math.round((Date.now() - savedAt) / 1000) });
    return n;
  } catch (err) {
    log.warn('snapshot: falhou a leitura', { message: err?.message });
    return 0;
  }
}

/**
 * Liga a gravação periódica + gravação no encerramento (SIGTERM do Railway).
 * Devolve uma função para parar (usada nos testes).
 */
export function startAutosave(manager) {
  if (!ENABLED) return () => {};
  const id = setInterval(() => save(manager), SAVE_EVERY_MS);
  id.unref?.(); // não segura o processo
  const onExit = () => {
    save(manager);
    process.exit(0);
  };
  process.once('SIGTERM', onExit);
  process.once('SIGINT', onExit);
  log.info('snapshot ativo', { ficheiro: FILE, cadaMs: SAVE_EVERY_MS });
  return () => clearInterval(id);
}
