-- =====================================================================
-- F&D — Estrutura da base de dados (cria OU atualiza)
-- =====================================================================
-- GERADO por server/db/generate.mjs a partir de prisma/schema.prisma.
-- NÃO editar à mão: correr `npm run db:sql` depois de mexer no schema.
--
-- Idempotente e seguro numa BD que já tenha dados: os CREATE têm IF NOT EXISTS
-- e, no fim, cada coluna e cada valor de enum são acrescentados só se faltarem.
-- Serve para inicializar do zero E para pôr uma BD antiga em dia sem o Prisma.
--
-- Em produção o caminho normal continua a ser `npx prisma db push`; isto existe
-- para o SQL editor da Supabase / psql, e para o colega da BD rever.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE "RoomStatus" AS ENUM ('lobby', 'playing', 'ended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "Intensity" AS ENUM ('leve', 'picante', 'hardcore', 'caos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RoundStatus" AS ENUM ('pending', 'resolved', 'refused');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "LifeEventType" AS ENUM ('vida_perdida', 'shot');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "BoardItemCategory" AS ENUM ('evento', 'prisao', 'carta', 'regra');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "rooms" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "host_player_id" UUID,
    "status" "RoomStatus" NOT NULL DEFAULT 'lobby',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "players" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "lives" INTEGER NOT NULL DEFAULT 3,
    "is_host" BOOLEAN NOT NULL DEFAULT false,
    "connected" BOOLEAN NOT NULL DEFAULT true,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "chat_messages" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "game_types" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "game_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "prompts" (
    "id" UUID NOT NULL,
    "game_type_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "intensity" "Intensity" NOT NULL DEFAULT 'leve',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "buddy" BOOLEAN NOT NULL DEFAULT false,
    "duration" INTEGER,
    "tag" TEXT,

    CONSTRAINT "prompts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "game_rounds" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "game_type_id" UUID NOT NULL,
    "current_player_id" UUID NOT NULL,
    "prompt_id" UUID,
    "status" "RoundStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_rounds_pkey" PRIMARY KEY ("id")
);

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

CREATE TABLE IF NOT EXISTS "room_snapshots" (
    "code" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "saved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_snapshots_pkey" PRIMARY KEY ("code")
);

CREATE TABLE IF NOT EXISTS "life_events" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "type" "LifeEventType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "life_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "telemetry_counters" (
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT,
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_counters_pkey" PRIMARY KEY ("scope","key")
);

CREATE TABLE IF NOT EXISTS "telemetry_nights" (
    "id" UUID NOT NULL,
    "ended_at" TIMESTAMP(3) NOT NULL,
    "mode" TEXT NOT NULL,
    "intensity" TEXT,
    "players" INTEGER NOT NULL DEFAULT 0,
    "rounds" INTEGER NOT NULL DEFAULT 0,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "outcome" TEXT NOT NULL DEFAULT 'fim',
    "modifiers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "eliminated" INTEGER NOT NULL DEFAULT 0,
    "drinks" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "telemetry_nights_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "rooms_code_key" ON "rooms"("code");

CREATE UNIQUE INDEX IF NOT EXISTS "rooms_host_player_id_key" ON "rooms"("host_player_id");

CREATE INDEX IF NOT EXISTS "rooms_code_idx" ON "rooms"("code");

CREATE INDEX IF NOT EXISTS "players_room_id_name_idx" ON "players"("room_id", "name");

CREATE UNIQUE INDEX IF NOT EXISTS "players_room_id_name_key" ON "players"("room_id", "name");

CREATE INDEX IF NOT EXISTS "chat_messages_room_id_idx" ON "chat_messages"("room_id");

CREATE UNIQUE INDEX IF NOT EXISTS "game_types_key_key" ON "game_types"("key");

CREATE INDEX IF NOT EXISTS "prompts_game_type_id_intensity_active_idx" ON "prompts"("game_type_id", "intensity", "active");

CREATE INDEX IF NOT EXISTS "prompts_tag_idx" ON "prompts"("tag");

CREATE UNIQUE INDEX IF NOT EXISTS "prompts_game_type_id_text_key" ON "prompts"("game_type_id", "text");

CREATE INDEX IF NOT EXISTS "game_rounds_room_id_idx" ON "game_rounds"("room_id");

CREATE INDEX IF NOT EXISTS "board_items_category_active_idx" ON "board_items"("category", "active");

CREATE UNIQUE INDEX IF NOT EXISTS "board_items_category_title_key" ON "board_items"("category", "title");

CREATE INDEX IF NOT EXISTS "room_snapshots_saved_at_idx" ON "room_snapshots"("saved_at");

CREATE INDEX IF NOT EXISTS "life_events_room_id_idx" ON "life_events"("room_id");

CREATE INDEX IF NOT EXISTS "telemetry_counters_scope_idx" ON "telemetry_counters"("scope");

CREATE INDEX IF NOT EXISTS "telemetry_nights_ended_at_idx" ON "telemetry_nights"("ended_at");

CREATE UNIQUE INDEX IF NOT EXISTS "telemetry_nights_ended_at_mode_key" ON "telemetry_nights"("ended_at", "mode");

DO $$ BEGIN
  ALTER TABLE "rooms" ADD CONSTRAINT "rooms_host_player_id_fkey" FOREIGN KEY ("host_player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "players" ADD CONSTRAINT "players_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "prompts" ADD CONSTRAINT "prompts_game_type_id_fkey" FOREIGN KEY ("game_type_id") REFERENCES "game_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "game_rounds" ADD CONSTRAINT "game_rounds_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "game_rounds" ADD CONSTRAINT "game_rounds_game_type_id_fkey" FOREIGN KEY ("game_type_id") REFERENCES "game_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "game_rounds" ADD CONSTRAINT "game_rounds_current_player_id_fkey" FOREIGN KEY ("current_player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "game_rounds" ADD CONSTRAINT "game_rounds_prompt_id_fkey" FOREIGN KEY ("prompt_id") REFERENCES "prompts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "life_events" ADD CONSTRAINT "life_events_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "life_events" ADD CONSTRAINT "life_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "life_events" ADD CONSTRAINT "life_events_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "game_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================================
-- Pôr em dia uma BD criada com uma versão anterior deste ficheiro.
-- (Numa BD nova não fazem nada — é tudo IF NOT EXISTS.)
-- Fora de transação: ALTER TYPE ... ADD VALUE exige-o em Postgres antigo.
-- =====================================================================
ALTER TYPE "RoomStatus" ADD VALUE IF NOT EXISTS 'lobby';
ALTER TYPE "RoomStatus" ADD VALUE IF NOT EXISTS 'playing';
ALTER TYPE "RoomStatus" ADD VALUE IF NOT EXISTS 'ended';
ALTER TYPE "Intensity" ADD VALUE IF NOT EXISTS 'leve';
ALTER TYPE "Intensity" ADD VALUE IF NOT EXISTS 'picante';
ALTER TYPE "Intensity" ADD VALUE IF NOT EXISTS 'hardcore';
ALTER TYPE "Intensity" ADD VALUE IF NOT EXISTS 'caos';
ALTER TYPE "RoundStatus" ADD VALUE IF NOT EXISTS 'pending';
ALTER TYPE "RoundStatus" ADD VALUE IF NOT EXISTS 'resolved';
ALTER TYPE "RoundStatus" ADD VALUE IF NOT EXISTS 'refused';
ALTER TYPE "LifeEventType" ADD VALUE IF NOT EXISTS 'vida_perdida';
ALTER TYPE "LifeEventType" ADD VALUE IF NOT EXISTS 'shot';
ALTER TYPE "BoardItemCategory" ADD VALUE IF NOT EXISTS 'evento';
ALTER TYPE "BoardItemCategory" ADD VALUE IF NOT EXISTS 'prisao';
ALTER TYPE "BoardItemCategory" ADD VALUE IF NOT EXISTS 'carta';
ALTER TYPE "BoardItemCategory" ADD VALUE IF NOT EXISTS 'regra';
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "id" UUID;
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "host_player_id" UUID;
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "status" "RoomStatus" NOT NULL DEFAULT 'lobby';
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "ended_at" TIMESTAMP(3);
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "id" UUID;
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "room_id" UUID;
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "lives" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "is_host" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "connected" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "id" UUID;
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "room_id" UUID;
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "player_id" UUID;
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "text" TEXT;
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "game_types" ADD COLUMN IF NOT EXISTS "id" UUID;
ALTER TABLE "game_types" ADD COLUMN IF NOT EXISTS "key" TEXT;
ALTER TABLE "game_types" ADD COLUMN IF NOT EXISTS "label" TEXT;
ALTER TABLE "game_types" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "prompts" ADD COLUMN IF NOT EXISTS "id" UUID;
ALTER TABLE "prompts" ADD COLUMN IF NOT EXISTS "game_type_id" UUID;
ALTER TABLE "prompts" ADD COLUMN IF NOT EXISTS "text" TEXT;
ALTER TABLE "prompts" ADD COLUMN IF NOT EXISTS "intensity" "Intensity" NOT NULL DEFAULT 'leve';
ALTER TABLE "prompts" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "prompts" ADD COLUMN IF NOT EXISTS "buddy" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "prompts" ADD COLUMN IF NOT EXISTS "duration" INTEGER;
ALTER TABLE "prompts" ADD COLUMN IF NOT EXISTS "tag" TEXT;
ALTER TABLE "game_rounds" ADD COLUMN IF NOT EXISTS "id" UUID;
ALTER TABLE "game_rounds" ADD COLUMN IF NOT EXISTS "room_id" UUID;
ALTER TABLE "game_rounds" ADD COLUMN IF NOT EXISTS "game_type_id" UUID;
ALTER TABLE "game_rounds" ADD COLUMN IF NOT EXISTS "current_player_id" UUID;
ALTER TABLE "game_rounds" ADD COLUMN IF NOT EXISTS "prompt_id" UUID;
ALTER TABLE "game_rounds" ADD COLUMN IF NOT EXISTS "status" "RoundStatus" NOT NULL DEFAULT 'pending';
ALTER TABLE "game_rounds" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "board_items" ADD COLUMN IF NOT EXISTS "id" UUID;
ALTER TABLE "board_items" ADD COLUMN IF NOT EXISTS "category" "BoardItemCategory";
ALTER TABLE "board_items" ADD COLUMN IF NOT EXISTS "emoji" TEXT NOT NULL DEFAULT '🎲';
ALTER TABLE "board_items" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "board_items" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "board_items" ADD COLUMN IF NOT EXISTS "effect" TEXT;
ALTER TABLE "board_items" ADD COLUMN IF NOT EXISTS "value" INTEGER;
ALTER TABLE "board_items" ADD COLUMN IF NOT EXISTS "skip_turns" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "board_items" ADD COLUMN IF NOT EXISTS "drink" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "board_items" ADD COLUMN IF NOT EXISTS "back" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "board_items" ADD COLUMN IF NOT EXISTS "lose_card" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "board_items" ADD COLUMN IF NOT EXISTS "weight" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "board_items" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "board_items" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "room_snapshots" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "room_snapshots" ADD COLUMN IF NOT EXISTS "data" JSONB;
ALTER TABLE "room_snapshots" ADD COLUMN IF NOT EXISTS "saved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "life_events" ADD COLUMN IF NOT EXISTS "id" UUID;
ALTER TABLE "life_events" ADD COLUMN IF NOT EXISTS "room_id" UUID;
ALTER TABLE "life_events" ADD COLUMN IF NOT EXISTS "player_id" UUID;
ALTER TABLE "life_events" ADD COLUMN IF NOT EXISTS "round_id" UUID;
ALTER TABLE "life_events" ADD COLUMN IF NOT EXISTS "type" "LifeEventType";
ALTER TABLE "life_events" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "telemetry_counters" ADD COLUMN IF NOT EXISTS "scope" TEXT;
ALTER TABLE "telemetry_counters" ADD COLUMN IF NOT EXISTS "key" TEXT;
ALTER TABLE "telemetry_counters" ADD COLUMN IF NOT EXISTS "label" TEXT;
ALTER TABLE "telemetry_counters" ADD COLUMN IF NOT EXISTS "metrics" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "telemetry_counters" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "telemetry_nights" ADD COLUMN IF NOT EXISTS "id" UUID;
ALTER TABLE "telemetry_nights" ADD COLUMN IF NOT EXISTS "ended_at" TIMESTAMP(3);
ALTER TABLE "telemetry_nights" ADD COLUMN IF NOT EXISTS "mode" TEXT;
ALTER TABLE "telemetry_nights" ADD COLUMN IF NOT EXISTS "intensity" TEXT;
ALTER TABLE "telemetry_nights" ADD COLUMN IF NOT EXISTS "players" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "telemetry_nights" ADD COLUMN IF NOT EXISTS "rounds" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "telemetry_nights" ADD COLUMN IF NOT EXISTS "minutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "telemetry_nights" ADD COLUMN IF NOT EXISTS "outcome" TEXT NOT NULL DEFAULT 'fim';
ALTER TABLE "telemetry_nights" ADD COLUMN IF NOT EXISTS "modifiers" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "telemetry_nights" ADD COLUMN IF NOT EXISTS "eliminated" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "telemetry_nights" ADD COLUMN IF NOT EXISTS "drinks" INTEGER NOT NULL DEFAULT 0;
