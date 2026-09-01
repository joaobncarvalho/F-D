// F&D — gerador dos scripts SQL da pasta db/.
//
// Porquê um gerador: estes ficheiros já tinham derivado da realidade (o enum de
// intensidade tinha só leve/picante, os prompts não tinham buddy/duration, e o
// seed ficara nos 4 tipos originais). Escritos à mão, voltam sempre a derivar.
// Aqui saem das MESMAS fontes de verdade que a app usa:
//
//   estrutura ← prisma/schema.prisma      (via `prisma migrate diff`, offline)
//   conteúdo  ← src/content/prompts.data.js  (o mesmo banco do prisma/seed.js)
//
// O `01_schema.sql` gerado é "cria OU atualiza": além dos CREATE idempotentes,
// emite `ADD COLUMN IF NOT EXISTS` para cada coluna e `ADD VALUE IF NOT EXISTS`
// para cada valor de enum. Assim serve tanto para uma BD vazia como para uma BD
// antiga que precisa de apanhar o schema novo — sem precisar do Prisma.
//
// Correr com:  npm run db:sql

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GAME_TYPES } from '../src/content/prompts.data.js';

const DB_DIR = fileURLToPath(new URL('.', import.meta.url));
const SERVER_DIR = path.resolve(DB_DIR, '..');

// ----- 1. DDL canónico, tirado ao Prisma sem tocar em nenhuma base de dados ---

function ddlCanonico() {
  // As URLs são obrigatórias para o schema validar, mas `--from-empty` não liga
  // a lado nenhum: é tudo calculado a partir do datamodel.
  const fake = 'postgresql://u:p@localhost:5432/db';
  // Chamamos o CLI do Prisma pelo Node, e não pelo `npx`: no Windows o spawn de
  // um .cmd rebenta com EINVAL nas versões recentes do Node.
  const cli = path.join(SERVER_DIR, 'node_modules', 'prisma', 'build', 'index.js');
  return execFileSync(
    process.execPath,
    [cli, 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'],
    { cwd: SERVER_DIR, env: { ...process.env, DATABASE_URL: fake, DIRECT_URL: fake }, encoding: 'utf8' }
  );
}

/** Parte o DDL em instruções (o Prisma separa-as por `;` no fim da linha). */
function instrucoes(ddl) {
  return ddl
    .split(/;\s*\n/)
    .map((s) => s.replace(/^--.*$/gm, '').trim())
    .filter(Boolean);
}

/** Extrai as colunas de um CREATE TABLE, para depois emitir os ADD COLUMN. */
function colunasDe(createTable) {
  const [, tabela] = createTable.match(/CREATE TABLE "([^"]+)"/) || [];
  if (!tabela) return null;
  const corpo = createTable.slice(createTable.indexOf('(') + 1, createTable.lastIndexOf(')'));
  const colunas = [];
  for (const linha of corpo.split('\n')) {
    const t = linha.trim().replace(/,$/, '');
    if (!t || t.startsWith('CONSTRAINT')) continue;
    const m = t.match(/^"([^"]+)"\s+(.*)$/);
    if (!m) continue;
    // `NOT NULL` sem DEFAULT rebentaria numa tabela com linhas — para o caminho
    // de ATUALIZAÇÃO a coluna entra permissiva; numa BD vazia o CREATE manda.
    const tipo = m[2].includes('DEFAULT') || !m[2].includes('NOT NULL') ? m[2] : m[2].replace(' NOT NULL', '');
    colunas.push({ nome: m[1], tipo });
  }
  return { tabela, colunas };
}

export function geraSchema(ddl) {
  const out = [];
  const alters = [];
  out.push(`-- =====================================================================
-- F&D — Estrutura da base de dados (cria OU atualiza)
-- =====================================================================
-- GERADO por server/db/generate.mjs a partir de prisma/schema.prisma.
-- NÃO editar à mão: correr \`npm run db:sql\` depois de mexer no schema.
--
-- Idempotente e seguro numa BD que já tenha dados: os CREATE têm IF NOT EXISTS
-- e, no fim, cada coluna e cada valor de enum são acrescentados só se faltarem.
-- Serve para inicializar do zero E para pôr uma BD antiga em dia sem o Prisma.
--
-- Em produção o caminho normal continua a ser \`npx prisma db push\`; isto existe
-- para o SQL editor da Supabase / psql, e para o colega da BD rever.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
`);

  for (const st of instrucoes(ddl)) {
    if (st.startsWith('CREATE TYPE')) {
      const [, nome] = st.match(/CREATE TYPE "([^"]+)"/);
      const valores = [...st.matchAll(/'([^']+)'/g)].map((m) => m[1]);
      out.push(`DO $$ BEGIN\n  ${st};\nEXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
      // Enum que já existia numa BD antiga pode não ter os valores novos.
      for (const v of valores) alters.push(`ALTER TYPE "${nome}" ADD VALUE IF NOT EXISTS '${v}';`);
      continue;
    }
    if (st.startsWith('CREATE TABLE')) {
      out.push(`${st.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS')};`);
      const info = colunasDe(st);
      for (const c of info.colunas) {
        alters.push(`ALTER TABLE "${info.tabela}" ADD COLUMN IF NOT EXISTS "${c.nome}" ${c.tipo};`);
      }
      continue;
    }
    if (st.startsWith('CREATE UNIQUE INDEX') || st.startsWith('CREATE INDEX')) {
      out.push(`${st.replace(/^CREATE (UNIQUE )?INDEX/, 'CREATE $1INDEX IF NOT EXISTS')};`);
      continue;
    }
    if (st.startsWith('ALTER TABLE') && st.includes('ADD CONSTRAINT')) {
      out.push(`DO $$ BEGIN\n  ${st.replace(/\n/g, '\n  ')};\nEXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
      continue;
    }
    out.push(`${st};`);
  }

  out.push(`
-- =====================================================================
-- Pôr em dia uma BD criada com uma versão anterior deste ficheiro.
-- (Numa BD nova não fazem nada — é tudo IF NOT EXISTS.)
-- Fora de transação: ALTER TYPE ... ADD VALUE exige-o em Postgres antigo.
-- =====================================================================
${alters.join('\n')}
`);
  return out.join('\n\n');
}

// ----- 2. Seed do conteúdo ---------------------------------------------------

/** UUID determinístico a partir de texto — o mesmo conteúdo dá sempre o mesmo id. */
function uuidDe(texto) {
  const h = createHash('sha1').update(`fd:${texto}`).digest('hex');
  return [h.slice(0, 8), h.slice(8, 12), `5${h.slice(13, 16)}`, `8${h.slice(17, 20)}`, h.slice(20, 32)].join('-');
}

const sql = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

export function geraSeed() {
  const total = GAME_TYPES.reduce((n, g) => n + g.prompts.length, 0);
  const out = [`-- =====================================================================
-- F&D — Conteúdo (game_types + prompts)
-- =====================================================================
-- GERADO por server/db/generate.mjs a partir de src/content/prompts.data.js —
-- o MESMO banco que o prisma/seed.js semeia, para os dois nunca divergirem.
-- NÃO editar à mão: correr \`npm run db:sql\`.
--
-- Idempotente: os ids são derivados do texto (sempre iguais) e o ON CONFLICT
-- atualiza em vez de duplicar. Correr DEPOIS de 01_schema.sql.
--
-- ${GAME_TYPES.length} tipos de jogo · ${total} prompts
-- =====================================================================

BEGIN;

-- ---------- Tipos de jogo ----------
INSERT INTO game_types (id, key, label, active) VALUES`];

  out.push(
    GAME_TYPES.map((g) => `  (${sql(uuidDe(`type:${g.key}`))}, ${sql(g.key)}, ${sql(g.label)}, true)`).join(',\n') +
      `\nON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, active = true;`
  );

  for (const g of GAME_TYPES) {
    if (!g.prompts.length) {
      out.push(`-- ${g.label}: sem prompts (mecânica pura — o conteúdo é gerado pelo motor).`);
      continue;
    }
    const linhas = g.prompts.map(([text, intensity, opts = {}]) => {
      const id = uuidDe(`prompt:${g.key}:${text}`);
      return `  (${sql(id)}, ${sql(uuidDe(`type:${g.key}`))}, ${sql(text)}, ${sql(intensity)}, true, ${
        opts.buddy ? 'true' : 'false'
      }, ${opts.duration ?? 'NULL'}, ${sql(opts.tag ?? null)})`;
    });
    out.push(`-- ${g.label} (${g.prompts.length})
INSERT INTO prompts (id, game_type_id, text, intensity, active, buddy, duration, tag) VALUES
${linhas.join(',\n')}
ON CONFLICT (game_type_id, text) DO UPDATE SET
  intensity = EXCLUDED.intensity, active = true, buddy = EXCLUDED.buddy,
  duration = EXCLUDED.duration, tag = EXCLUDED.tag;`);
  }

  out.push(`COMMIT;

-- Conferência rápida (deve dar ${GAME_TYPES.length} e ${total}):
--   SELECT count(*) FROM game_types;
--   SELECT count(*) FROM prompts;`);
  return out.join('\n\n');
}

export const SCHEMA_FILE = path.join(DB_DIR, '01_schema.sql');
export const SEED_FILE = path.join(DB_DIR, '02_seed.sql');

// ----- 3. Escrever -----------------------------------------------------------

function main() {
  fs.writeFileSync(SCHEMA_FILE, geraSchema(ddlCanonico()).replace(/\n{3,}/g, '\n\n'));
  fs.writeFileSync(SEED_FILE, `${geraSeed()}\n`);
  const total = GAME_TYPES.reduce((n, g) => n + g.prompts.length, 0);
  console.log(`01_schema.sql e 02_seed.sql gerados (${GAME_TYPES.length} tipos, ${total} prompts).`);
}

// Só escreve quando é corrido de propósito (`npm run db:sql`). Importado, expõe
// apenas as funções — é assim que o teste confirma que os ficheiros estão em dia
// sem ter de invocar o Prisma.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
