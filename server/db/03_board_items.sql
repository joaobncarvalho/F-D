-- =====================================================================
-- F&D — Bancos do Modo Tabuleiro (board_items)
-- =====================================================================
-- Schema + seed dos três bancos do tabuleiro (?? / prisão / cartas), editáveis
-- na /admin. Autocontido e idempotente — pode correr isolado (Supabase SQL
-- editor / psql), depois de 01_schema.sql. Espelha:
--   server/prisma/schema.prisma  (model BoardItem)
--   server/src/content/board.data.js  (valores por omissão)
--
-- NOTA: em produção o caminho normal é `prisma db push` + `prisma db seed`; este
-- script existe só para inicializar/rever a BD diretamente sem o Prisma.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE "BoardItemCategory" AS ENUM ('evento', 'prisao', 'carta');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "board_items" (
    "id" UUID NOT NULL,
    "category" "BoardItemCategory" NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '🎲',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "effect" TEXT,
    "value" INTEGER,
    "skip_turns" INTEGER NOT NULL DEFAULT 0,
    "drink" INTEGER NOT NULL DEFAULT 0,
    "back" INTEGER NOT NULL DEFAULT 0,
    "lose_card" BOOLEAN NOT NULL DEFAULT false,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "board_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "board_items_category_title_key" ON "board_items"("category", "title");
CREATE INDEX IF NOT EXISTS "board_items_category_active_idx" ON "board_items"("category", "active");

BEGIN;

-- ---------- Casa ?? (evento) ----------
INSERT INTO board_items (id, category, emoji, title, description, effect, value) VALUES
  (gen_random_uuid(), 'evento', '🚀', 'Sorte!', 'Avanças 2 casas', 'advance', 2),
  (gen_random_uuid(), 'evento', '💨', 'Azar', 'Recuas 2 casas', 'back', 2),
  (gen_random_uuid(), 'evento', '🍺', 'Golada', 'Bebes 3 golos', 'drink', 3),
  (gen_random_uuid(), 'evento', '🎴', 'Carta nova', 'Ganhas uma carta', 'card', NULL),
  (gen_random_uuid(), 'evento', '🚔', 'Preso!', 'Vais direto para a prisão', 'prison', NULL),
  (gen_random_uuid(), 'evento', '👯', 'Ronda geral', 'Todos os outros bebem 2', 'others_drink', 2)
ON CONFLICT (category, title) DO UPDATE SET
  emoji = EXCLUDED.emoji, description = EXCLUDED.description,
  effect = EXCLUDED.effect, value = EXCLUDED.value, active = true;

-- ---------- Prisão (prisao) — efeitos combinados ----------
INSERT INTO board_items (id, category, emoji, title, skip_turns, drink, back, lose_card) VALUES
  (gen_random_uuid(), 'prisao', '🚔', 'perde 1 vez', 1, 0, 0, false),
  (gen_random_uuid(), 'prisao', '🚔', 'perde 2 vezes', 2, 0, 0, false),
  (gen_random_uuid(), 'prisao', '🚔', 'bebe 4 golos + perde 1 vez', 1, 4, 0, false),
  (gen_random_uuid(), 'prisao', '🚔', 'recua 3 + perde 1 vez', 1, 0, 3, false),
  (gen_random_uuid(), 'prisao', '🚔', 'perde 1 carta + 1 vez', 1, 0, 0, true)
ON CONFLICT (category, title) DO UPDATE SET
  skip_turns = EXCLUDED.skip_turns, drink = EXCLUDED.drink,
  back = EXCLUDED.back, lose_card = EXCLUDED.lose_card, active = true;

-- ---------- Cartas jogáveis (carta) — effect = key da mecânica ----------
INSERT INTO board_items (id, category, emoji, title, description, effect) VALUES
  (gen_random_uuid(), 'carta', '🔁', 'Troca', 'Trocas de casa com um jogador', 'swap'),
  (gen_random_uuid(), 'carta', '⬅️', 'Empurrão', 'Mandas alguém recuar 2 casas', 'back2'),
  (gen_random_uuid(), 'carta', '⛓️', 'Denúncia', 'Mandas alguém para a prisão', 'prison'),
  (gen_random_uuid(), 'carta', '⏭️', 'Salta-vez', 'Um jogador perde a próxima vez', 'skip'),
  (gen_random_uuid(), 'carta', '🛡️', 'Escudo', 'Bloqueia a próxima carta contra ti', 'shield'),
  (gen_random_uuid(), 'carta', '🍺', 'Ronda', 'Obrigas alguém a beber 3 golos', 'drink3'),
  (gen_random_uuid(), 'carta', '🎁', 'Roubo', 'Roubas uma carta a alguém', 'steal')
ON CONFLICT (category, title) DO UPDATE SET
  emoji = EXCLUDED.emoji, description = EXCLUDED.description,
  effect = EXCLUDED.effect, active = true;

COMMIT;

COMMENT ON TABLE "board_items" IS 'Bancos do Modo Tabuleiro: ?? (evento), prisão, cartas. Editável na /admin.';
