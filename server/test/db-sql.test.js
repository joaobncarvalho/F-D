// F&D — os scripts SQL têm de estar em dia com as fontes de verdade.
//
// Estes ficheiros já derivaram uma vez: ficaram nos 4 tipos originais, com um
// enum de intensidade sem `hardcore`/`caos` e sem as colunas `buddy`/`duration`.
// Como são escritos por um gerador (db/generate.mjs), o que falta é alguém
// lembrar-se de o correr. Este teste é esse alguém: se mexeres no conteúdo e não
// correres `npm run db:sql`, falha aqui e não na noite do playtest.
//
// Só se verifica o seed (02): o schema (01) precisa de invocar o CLI do Prisma,
// que é lento de mais para a suite — e o schema muda muito menos vezes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { geraSeed, SEED_FILE } = await import('../db/generate.mjs');
const { GAME_TYPES } = await import('../src/content/prompts.data.js');

const noDisco = () => fs.readFileSync(SEED_FILE, 'utf8').replace(/\r\n/g, '\n').trim();

test('db: o 02_seed.sql está em dia com prompts.data.js', () => {
  assert.equal(
    noDisco(),
    geraSeed().trim(),
    'o conteúdo mudou mas o SQL não foi regenerado — corre `npm run db:sql`'
  );
});

test('db: o seed cobre todos os tipos e prompts, com packs e opções', () => {
  const sql = noDisco();
  const total = GAME_TYPES.reduce((n, g) => n + g.prompts.length, 0);

  for (const g of GAME_TYPES) {
    assert.ok(sql.includes(`'${g.key}'`), `o tipo "${g.key}" não aparece no seed`);
  }

  // Uma linha de VALUES por tipo de jogo + uma por prompt.
  const tuplos = (sql.match(/^ {2}\('[0-9a-f]{8}-/gm) || []).length;
  assert.equal(tuplos, GAME_TYPES.length + total, `esperava ${GAME_TYPES.length + total} linhas de VALUES`);

  // As colunas novas têm mesmo de lá estar (foi o que faltou da última vez).
  assert.ok(sql.includes('buddy, duration, tag'), 'as colunas buddy/duration/tag têm de ser semeadas');
  assert.ok(sql.includes("'aniversario'"), 'os packs temáticos têm de aparecer no conteúdo');
  assert.ok(sql.includes('ON CONFLICT (game_type_id, text) DO UPDATE'), 'o seed tem de ser idempotente');
});

test('db: o 01_schema.sql traz o que a app precisa hoje', () => {
  const sql = fs.readFileSync(SEED_FILE.replace('02_seed.sql', '01_schema.sql'), 'utf8');
  // Um smoke ao que já falhou no passado (drift silencioso do schema).
  for (const esperado of [
    `ALTER TYPE "Intensity" ADD VALUE IF NOT EXISTS 'hardcore'`,
    `ALTER TYPE "Intensity" ADD VALUE IF NOT EXISTS 'caos'`,
    `ALTER TABLE "prompts" ADD COLUMN IF NOT EXISTS "tag"`,
    `ALTER TABLE "prompts" ADD COLUMN IF NOT EXISTS "buddy"`,
    `CREATE TABLE IF NOT EXISTS "room_snapshots"`,
    `CREATE TABLE IF NOT EXISTS "board_items"`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "prompts_game_type_id_text_key"`, // o ON CONFLICT do seed depende disto
  ]) {
    assert.ok(sql.includes(esperado), `falta no 01_schema.sql: ${esperado}`);
  }
});
