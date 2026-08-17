# F&D — Scripts SQL da base de dados

Scripts **standalone** para inicializar a BD diretamente (sem depender do Prisma) —
úteis para o colega da BD rever ou para correr no **SQL editor da Supabase** / `psql`.

São gerados a partir da fonte de verdade:
- Estrutura ← `server/prisma/schema.prisma` (via `prisma migrate diff`)
- Conteúdo ← `server/src/content/prompts.data.js` (mesmo banco do `prisma/seed.js`)

## Ficheiros

| Ficheiro | O que faz |
|---|---|
| `01_schema.sql` | Cria enums, tabelas, índices, constraints e FKs. **Idempotente**. |
| `02_seed.sql` | Semeia `game_types` (4) e `prompts` (88, leve/picante). **Idempotente** (`ON CONFLICT`). |

## Como correr

**Supabase:** Dashboard → SQL Editor → cola o `01_schema.sql`, corre; depois o `02_seed.sql`.

**psql / linha de comandos:**
```bash
psql "$DATABASE_URL" -f server/db/01_schema.sql
psql "$DATABASE_URL" -f server/db/02_seed.sql
```

Ambos podem ser re-executados sem erro nem duplicados.

## Notas

- **UUIDs:** as colunas `id` não têm default na BD (tal como no Prisma — o client
  gera o UUID). Só o conteúdo é semeado, e o seed fornece os UUIDs explicitamente
  (`game_types` fixos; `prompts` via `gen_random_uuid()`).
- **Prisma vs SQL:** este é um caminho **alternativo** ao `prisma migrate` +
  `prisma db seed` (ver `../prisma/` e `.claude/skills/fd-dev/reference/db-setup.md`).
  A estrutura é equivalente. Se usarem Prisma para gerir migrations, prefiram esse
  fluxo; estes SQL servem para setup direto/revisão.
- **Regenerar:** o schema sai de `npx prisma migrate diff --from-empty
  --to-schema-datamodel prisma/schema.prisma --script`; o seed é gerado a partir de
  `src/content/prompts.data.js`.
- Validados com a gramática oficial do PostgreSQL (`pg-query-emscripten`).
