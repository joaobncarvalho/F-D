// F&D — repositório de conteúdo (camada de dados).
//
// Lê da BD (Prisma/Supabase) quando DATABASE_URL está definido; caso contrário
// (ou se a BD falhar) cai para o conteúdo em código (content/prompts.data.js).
// Assim: dev sem .env corre na mesma; produção usa a Supabase; e uma falha de
// BD não deita o jogo abaixo. O game.js/handlers não sabem de onde vem — só
// chamam estas funções (mesma assinatura async de sempre).

import { GAME_TYPES, VASCO_BOARDS } from './content/prompts.data.js';
import { BOARD_EVENTS, BOARD_PRISON, BOARD_CARDS, BOARD_RULES } from './content/board.data.js';
import { log } from './log.js';

// Cliente Prisma lazy: só carrega se houver DATABASE_URL. Cacheado (promessa).
let prismaPromise = null;
async function client() {
  if (!process.env.DATABASE_URL) return null;
  if (!prismaPromise) {
    prismaPromise = import('@prisma/client')
      .then(({ PrismaClient }) => new PrismaClient())
      .catch((e) => {
        log.warn('repo: Prisma indisponível, uso conteúdo em memória:', { error: e.message });
        return null;
      });
  }
  return prismaPromise;
}

/**
 * Cliente Prisma partilhado (ou null se não houver BD). Exposto para módulos que
 * precisam da MESMA ligação — nomeadamente o snapshot.js, que não deve abrir uma
 * segunda pool só para gravar o estado das salas.
 */
export async function prismaClient() {
  return client();
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
      log.warn('repo: getGameTypes DB falhou, uso memória:', { error: e.message });
    }
  }
  return GAME_TYPES.map((g) => ({ key: g.key, label: g.label }));
}

/**
 * Sorteia UM prompt de um tipo.
 *
 * @param gameTypeKey  tipo de jogo ('desafio', 'mimica'…)
 * @param intensity    intensidade pedida (cai para qualquer uma se não houver)
 * @param opts.exclude textos já usados NESTA sala — evita repetir (saco em content/bag.js)
 * (os packs temáticos foram removidos: o conteúdo regula-se só pela intensidade)
 * @returns null quando não sobra nada (o chamador esvazia o saco e repete)
 */
export async function getRandomPrompt(gameTypeKey, intensity, { exclude = [] } = {}) {
  const excluded = exclude instanceof Set ? exclude : new Set(exclude);
  const prisma = await client();
  if (prisma) {
    try {
      const base = { active: true, gameType: { key: gameTypeKey } };
      let rows = await prisma.prompt.findMany({ where: { ...base, intensity } });
      if (!rows.length) rows = await prisma.prompt.findMany({ where: base }); // sem essa intensidade
      const pool = rows.filter((r) => !excluded.has(r.text));
      if (!pool.length) return null; // saco vazio → quem chama repõe e repete
      const p = pool[Math.floor(Math.random() * pool.length)];
      return { text: p.text, intensity: p.intensity, buddy: p.buddy, duration: p.duration };
    } catch (e) {
      // Uma BD fora de sincronia cai aqui — o jogo segue com o conteúdo em código.
      log.warn('repo: getRandomPrompt DB falhou, uso memória:', { error: e.message });
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
  const fresh = pool.filter(([text]) => !excluded.has(text));
  if (!fresh.length) return null;
  const [text, inten, opts = {}] = fresh[Math.floor(Math.random() * fresh.length)];
  return { text, intensity: inten, buddy: !!opts.buddy, duration: opts.duration ?? null };
}

/** Quadros do Jogo do Vasco — mecânica, sempre do código (não estão na BD). */
export async function getRandomVascoBoard() {
  if (!VASCO_BOARDS.length) return null;
  return VASCO_BOARDS[Math.floor(Math.random() * VASCO_BOARDS.length)];
}

// Bancos do Modo Tabuleiro (?? / prisão / cartas). Lê de board_items (BD) quando
// disponível; senão cai para o conteúdo em código (board.data.js). O board.js
// "fotografa" isto no initBoard (b.banks) — daí ser async só aqui.
const FALLBACK_BANKS = {
  events: BOARD_EVENTS.map((e) => ({ ...e, weight: e.weight ?? 1 })),
  prison: BOARD_PRISON.map((p) => ({ ...p, weight: p.weight ?? 1 })),
  cards: BOARD_CARDS.map((c) => ({ ...c, weight: c.weight ?? 1 })),
  rules: BOARD_RULES.map((r) => ({ ...r, weight: r.weight ?? 1 })),
};

export async function getBoardBanks() {
  const prisma = await client();
  if (prisma) {
    try {
      const rows = await prisma.boardItem.findMany({ where: { active: true } });
      if (rows.length) {
        const events = rows.filter((r) => r.category === 'evento')
          .map((r) => ({ emoji: r.emoji, title: r.title, desc: r.desc, effect: r.effect, value: r.value, weight: r.weight }));
        const prison = rows.filter((r) => r.category === 'prisao')
          .map((r) => ({ note: r.title, skipTurns: r.skipTurns, drink: r.drink, back: r.back, loseCard: r.loseCard, weight: r.weight }));
        const cards = rows.filter((r) => r.category === 'carta')
          .map((r) => ({ key: r.effect, emoji: r.emoji, name: r.title, desc: r.desc, weight: r.weight }));
        const rules = rows.filter((r) => r.category === 'regra')
          .map((r) => ({ text: r.title, turns: r.value || 3, weight: r.weight }));
        // Só usa a BD se cada banco tiver conteúdo (senão o jogo ficava sem opções).
        // As regras são recentes: uma BD antiga não as tem → cai no banco em código.
        if (events.length && prison.length && cards.length)
          return { events, prison, cards, rules: rules.length ? rules : FALLBACK_BANKS.rules.map((r) => ({ ...r })) };
      }
    } catch (e) {
      log.warn('repo: getBoardBanks DB falhou, uso memória:', { error: e.message });
    }
  }
  return {
    events: FALLBACK_BANKS.events.map((e) => ({ ...e })),
    prison: FALLBACK_BANKS.prison.map((p) => ({ ...p })),
    cards: FALLBACK_BANKS.cards.map((c) => ({ ...c })),
    rules: FALLBACK_BANKS.rules.map((r) => ({ ...r })),
  };
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

const PROMPT_SELECT = {
  id: true,
  text: true,
  intensity: true,
  active: true,
  buddy: true,
  duration: true,
  tag: true,
  gameType: { select: { key: true, label: true } },
};

export async function adminListPrompts(gameTypeKey) {
  const prisma = await requirePrisma();
  const where = gameTypeKey ? { gameType: { key: gameTypeKey } } : {};
  return prisma.prompt.findMany({
    where,
    orderBy: [{ gameType: { key: 'asc' } }, { intensity: 'asc' }],
    select: PROMPT_SELECT,
  });
}

/**
 * TODOS os prompts, com fallback para o conteúdo em código.
 *
 * O `adminListPrompts` exige BD (é para editar, e editar sem BD não faz sentido).
 * Isto não: serve para CRUZAR com a telemetria — e um playtest em casa, sem
 * Supabase ligada, é precisamente onde se quer saber que desafios nunca saíram.
 * Sem BD devolve os do ficheiro, sem `id` (não há nada para editar nesse caso).
 */
export async function allPromptsForStats() {
  const prisma = await client();
  if (prisma) {
    try {
      const rows = await prisma.prompt.findMany({ where: { active: true }, select: PROMPT_SELECT });
      if (rows.length) {
        return rows.map((p) => ({
          id: p.id,
          text: p.text,
          intensity: p.intensity,
          typeKey: p.gameType.key,
          typeLabel: p.gameType.label,
        }));
      }
    } catch (e) {
      log.warn('repo: allPromptsForStats DB falhou, uso memória:', { error: e.message });
    }
  }
  return GAME_TYPES.flatMap((gt) =>
    gt.prompts.map(([text, intensity]) => ({
      id: null,
      text,
      intensity,
      typeKey: gt.key,
      typeLabel: gt.label,
    }))
  );
}

export async function adminCreatePrompt({ gameTypeKey, text, intensity = 'leve', buddy = false, duration = null, tag = null }) {
  const prisma = await requirePrisma();
  const gt = await prisma.gameType.findUnique({ where: { key: gameTypeKey } });
  if (!gt) throw new Error('Tipo de jogo inválido.');
  return prisma.prompt.create({
    data: { gameTypeId: gt.id, text, intensity, active: true, buddy, duration, tag },
    select: PROMPT_SELECT,
  });
}

export async function adminUpdatePrompt(id, { text, intensity, active, buddy, duration, tag }) {
  const prisma = await requirePrisma();
  const data = {};
  if (text !== undefined) data.text = text;
  if (intensity !== undefined) data.intensity = intensity;
  if (active !== undefined) data.active = active;
  if (buddy !== undefined) data.buddy = buddy;
  if (duration !== undefined) data.duration = duration;
  if (tag !== undefined) data.tag = tag;
  return prisma.prompt.update({ where: { id }, data, select: PROMPT_SELECT });
}

export async function adminDeletePrompt(id) {
  const prisma = await requirePrisma();
  await prisma.prompt.delete({ where: { id } });
  return { ok: true };
}

// ----- CRUD dos bancos do Tabuleiro (board_items) — exige BD -----------------

const BOARD_ITEM_SELECT = {
  id: true, category: true, emoji: true, title: true, desc: true,
  effect: true, value: true, skipTurns: true, drink: true, back: true,
  loseCard: true, weight: true, active: true,
};

export async function adminListBoardItems(category) {
  const prisma = await requirePrisma();
  const where = category ? { category } : {};
  return prisma.boardItem.findMany({ where, orderBy: [{ category: 'asc' }], select: BOARD_ITEM_SELECT });
}

export async function adminCreateBoardItem(data) {
  const prisma = await requirePrisma();
  return prisma.boardItem.create({ data, select: BOARD_ITEM_SELECT });
}

export async function adminUpdateBoardItem(id, data) {
  const prisma = await requirePrisma();
  return prisma.boardItem.update({ where: { id }, data, select: BOARD_ITEM_SELECT });
}

export async function adminDeleteBoardItem(id) {
  const prisma = await requirePrisma();
  await prisma.boardItem.delete({ where: { id } });
  return { ok: true };
}
