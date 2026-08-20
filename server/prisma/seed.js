// F&D — seed do banco inicial de prompts.
// Idempotente: upsert por key (game_types) e por (gameTypeId, text) (prompts).
// Corre com:  npm run db:seed   (ou npx prisma db seed)

import { PrismaClient } from '@prisma/client';
import { GAME_TYPES } from '../src/content/prompts.data.js';
import { boardItemsForSeed } from '../src/content/board.data.js';

const prisma = new PrismaClient();

async function main() {
  let totalPrompts = 0;

  for (const gt of GAME_TYPES) {
    const gameType = await prisma.gameType.upsert({
      where: { key: gt.key },
      update: { label: gt.label, active: true },
      create: { key: gt.key, label: gt.label, active: true },
    });

    for (const [text, intensity, opts = {}] of gt.prompts) {
      const buddy = !!opts.buddy;
      const duration = opts.duration ?? null;
      await prisma.prompt.upsert({
        where: { gameTypeId_text: { gameTypeId: gameType.id, text } },
        update: { intensity, active: true, buddy, duration },
        create: { gameTypeId: gameType.id, text, intensity, active: true, buddy, duration },
      });
      totalPrompts++;
    }

    console.log(`  ${gt.label}: ${gt.prompts.length} prompts`);
  }

  // Bancos do Tabuleiro (?? / prisão / cartas) — idempotente por (category, title).
  const boardRows = boardItemsForSeed();
  for (const r of boardRows) {
    await prisma.boardItem.upsert({
      where: { category_title: { category: r.category, title: r.title } },
      update: { ...r, active: true },
      create: { ...r, active: true },
    });
  }
  console.log(`  Tabuleiro: ${boardRows.length} itens de banco (??/prisão/cartas)`);

  console.log(`Seed concluído: ${GAME_TYPES.length} tipos, ${totalPrompts} prompts, ${boardRows.length} itens de tabuleiro.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
