// F&D — seed do banco inicial de prompts.
// Idempotente: upsert por key (game_types) e por (gameTypeId, text) (prompts).
// Corre com:  npm run db:seed   (ou npx prisma db seed)

import { PrismaClient } from '@prisma/client';
import { GAME_TYPES } from '../src/content/prompts.data.js';

const prisma = new PrismaClient();

async function main() {
  let totalPrompts = 0;

  for (const gt of GAME_TYPES) {
    const gameType = await prisma.gameType.upsert({
      where: { key: gt.key },
      update: { label: gt.label, active: true },
      create: { key: gt.key, label: gt.label, active: true },
    });

    for (const [text, intensity] of gt.prompts) {
      await prisma.prompt.upsert({
        where: { gameTypeId_text: { gameTypeId: gameType.id, text } },
        update: { intensity, active: true },
        create: { gameTypeId: gameType.id, text, intensity, active: true },
      });
      totalPrompts++;
    }

    console.log(`  ${gt.label}: ${gt.prompts.length} prompts`);
  }

  console.log(`Seed concluído: ${GAME_TYPES.length} tipos, ${totalPrompts} prompts.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
