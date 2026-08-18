// F&D — repositório de conteúdo (camada de dados).
//
// Lê da BD (Prisma/Supabase) quando DATABASE_URL está definido; caso contrário
// (ou se a BD falhar) cai para o conteúdo em código (content/prompts.data.js).
// Assim: dev sem .env corre na mesma; produção usa a Supabase; e uma falha de
// BD não deita o jogo abaixo. O game.js/handlers não sabem de onde vem — só
// chamam estas funções (mesma assinatura async de sempre).

import { GAME_TYPES, VASCO_BOARDS } from './content/prompts.data.js';

// Cliente Prisma lazy: só carrega se houver DATABASE_URL. Cacheado (promessa).
let prismaPromise = null;
async function client() {
  if (!process.env.DATABASE_URL) return null;
  if (!prismaPromise) {
    prismaPromise = import('@prisma/client')
      .then(({ PrismaClient }) => new PrismaClient())
      .catch((e) => {
        console.error('[repo] Prisma indisponível, uso conteúdo em memória:', e.message);
        return null;
      });
  }
  return prismaPromise;
}

/** Prisma obrigatório (para a admin). Lança se não houver BD. */
async function requirePrisma() {
  const prisma = await client();
  if (!prisma) throw new Error('Base de dados não configurada (DATABASE_URL em falta).');
  return prisma;
}

// ----- Leitura (jogo) -------------------------------------------------------

export async function getGameTypes() {
  const prisma = await client();
  if (prisma) {
    try {
      const types = await prisma.gameType.findMany({
        where: { active: true },
        select: { key: true, label: true },
      });
      if (types.length) return types;
    } catch (e) {
      console.error('[repo] getGameTypes DB falhou, uso memória:', e.message);
    }
  }
  return GAME_TYPES.map((g) => ({ key: g.key, label: g.label }));
}

export async function getRandomPrompt(gameTypeKey, intensity) {
  const prisma = await client();
  if (prisma) {
    try {
      const base = { active: true, gameType: { key: gameTypeKey } };
      let where = intensity ? { ...base, intensity } : base;
      let n = await prisma.prompt.count({ where });
      if (!n && intensity) {
        where = base; // sem prompts nessa intensidade → cai para qualquer uma
        n = await prisma.prompt.count({ where });
      }
      if (n) {
        const [p] = await prisma.prompt.findMany({
          where,
          take: 1,
          skip: Math.floor(Math.random() * n),
        });
        if (p) return { text: p.text, intensity: p.intensity };
      }
      return null;
    } catch (e) {
      console.error('[repo] getRandomPrompt DB falhou, uso memória:', e.message);
    }
  }
  // Fallback estático.
  const gt = GAME_TYPES.find((g) => g.key === gameTypeKey);
  if (!gt) return null;
  let pool = gt.prompts;
  if (intensity) {
    const filtered = pool.filter(([, inten]) => inten === intensity);
    if (filtered.length) pool = filtered;
  }
  if (!pool.length) return null;
  const [text, inten] = pool[Math.floor(Math.random() * pool.length)];
  return { text, intensity: inten };
}

/** Quadros do Jogo do Vasco — mecânica, sempre do código (não estão na BD). */
export async function getRandomVascoBoard() {
  if (!VASCO_BOARDS.length) return null;
  return VASCO_BOARDS[Math.floor(Math.random() * VASCO_BOARDS.length)];
}

// ----- CRUD de conteúdo (página de admin) — exige BD ------------------------

export async function adminGameTypes() {
  const prisma = await requirePrisma();
  return prisma.gameType.findMany({
    where: { active: true },
    select: { key: true, label: true },
    orderBy: { key: 'asc' },
  });
}

export async function adminListPrompts(gameTypeKey) {
  const prisma = await requirePrisma();
  const where = gameTypeKey ? { gameType: { key: gameTypeKey } } : {};
  return prisma.prompt.findMany({
    where,
    orderBy: [{ gameType: { key: 'asc' } }, { intensity: 'asc' }],
    select: { id: true, text: true, intensity: true, active: true, gameType: { select: { key: true, label: true } } },
  });
}

export async function adminCreatePrompt({ gameTypeKey, text, intensity = 'leve' }) {
  const prisma = await requirePrisma();
  const gt = await prisma.gameType.findUnique({ where: { key: gameTypeKey } });
  if (!gt) throw new Error('Tipo de jogo inválido.');
  return prisma.prompt.create({
    data: { gameTypeId: gt.id, text, intensity, active: true },
    select: { id: true, text: true, intensity: true, active: true, gameType: { select: { key: true, label: true } } },
  });
}

export async function adminUpdatePrompt(id, { text, intensity, active }) {
  const prisma = await requirePrisma();
  const data = {};
  if (text !== undefined) data.text = text;
  if (intensity !== undefined) data.intensity = intensity;
  if (active !== undefined) data.active = active;
  return prisma.prompt.update({
    where: { id },
    data,
    select: { id: true, text: true, intensity: true, active: true, gameType: { select: { key: true, label: true } } },
  });
}

export async function adminDeletePrompt(id) {
  const prisma = await requirePrisma();
  await prisma.prompt.delete({ where: { id } });
  return { ok: true };
}
