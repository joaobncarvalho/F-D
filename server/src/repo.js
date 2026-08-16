// F&D — repositório de conteúdo (SEAM DE INTEGRAÇÃO com a BD).
//
// Hoje lê dos dados em memória (src/content/prompts.data.js), com a MESMA forma
// que o Prisma vai devolver. Na Semana 3/integração, troca-se o INTERIOR destas
// funções por chamadas ao Prisma client — a assinatura mantém-se, por isso o
// game.js e os handlers não mudam. Ver architecture.md §"Camada de dados".
//
//   Futuro (Prisma):
//     export async function getGameTypes() {
//       return prisma.gameType.findMany({ where: { active: true },
//         select: { key: true, label: true } });
//     }
//     export async function getRandomPrompt(key, intensity) {
//       const where = { active: true, gameType: { key },
//         ...(intensity ? { intensity } : {}) };
//       const n = await prisma.prompt.count({ where });
//       if (!n) return null;
//       const [p] = await prisma.prompt.findMany({ where, take: 1,
//         skip: Math.floor(Math.random() * n) });
//       return p ? { text: p.text, intensity: p.intensity } : null;
//     }
//
// (As funções são async de propósito, para a troca por Prisma ser drop-in.)

import { GAME_TYPES } from './content/prompts.data.js';

export async function getGameTypes() {
  return GAME_TYPES.map((g) => ({ key: g.key, label: g.label }));
}

export async function getRandomPrompt(gameTypeKey, intensity) {
  const gt = GAME_TYPES.find((g) => g.key === gameTypeKey);
  if (!gt) return null;

  let pool = gt.prompts;
  if (intensity) {
    const filtered = pool.filter(([, inten]) => inten === intensity);
    if (filtered.length) pool = filtered; // fallback: se vazio, usa todos
  }
  if (!pool.length) return null;

  const [text, inten] = pool[Math.floor(Math.random() * pool.length)];
  return { text, intensity: inten };
}
