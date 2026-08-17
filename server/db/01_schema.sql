-- =====================================================================
-- F&D — Friends and Drinking · Estrutura da base de dados (PostgreSQL)
-- =====================================================================
-- Gerado a partir do schema Prisma (server/prisma/schema.prisma) — fonte de
-- verdade. Mantém-se fiel ao que a app espera; correr este script cria a mesma
-- estrutura que o `prisma migrate` criaria.
--
-- Idempotente: pode ser corrido mais que uma vez (Supabase SQL editor / psql).
--
-- Nota sobre UUIDs: as colunas `id` NÃO têm default no lado da BD, tal como no
-- Prisma (o client gera o UUID). As linhas de rooms/players/etc. são criadas
-- pela app. Só o conteúdo (game_types/prompts) é semeado — ver 02_seed.sql, que
-- fornece os UUIDs explicitamente (gen_random_uuid()).
-- =====================================================================

-- gen_random_uuid() está no core desde o PG 13; a extensão garante PG mais antigos.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- Tipos enumerados ----------
DO $$ BEGIN
  CREATE TYPE "RoomStatus" AS ENUM ('lobby', 'playing', 'ended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "Intensity" AS ENUM ('leve', 'picante');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RoundStatus" AS ENUM ('pending', 'resolved', 'refused');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "LifeEventType" AS ENUM ('vida_perdida', 'shot');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Tabelas ----------

-- Salas efémeras. O estado "quente" vive em memória no servidor; a BD guarda
-- histórico/persistência. code = código curto para juntar à sala.
CREATE TABLE IF NOT EXISTS "rooms" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "host_player_id" UUID,
    "status" "RoomStatus" NOT NULL DEFAULT 'lobby',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- Jogadores de uma sala. Nome único DENTRO da sala (não globalmente).
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

-- Chat de grupo do lobby.
CREATE TABLE IF NOT EXISTS "chat_messages" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- Tipos de jogo (boca_calada, desafio, intrigas, segredos). active permite
-- desativar sem apagar dados.
CREATE TABLE IF NOT EXISTS "game_types" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "game_types_pkey" PRIMARY KEY ("id")
);

-- Banco de prompts/conteúdo, por tipo de jogo e intensidade (leve/picante).
CREATE TABLE IF NOT EXISTS "prompts" (
    "id" UUID NOT NULL,
    "game_type_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "intensity" "Intensity" NOT NULL DEFAULT 'leve',
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "prompts_pkey" PRIMARY KEY ("id")
);

-- Histórico de rondas jogadas (para estatísticas / auditoria).
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

-- Log de eventos de vida (vida perdida / shot) para o "quem bebeu mais".
CREATE TABLE IF NOT EXISTS "life_events" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "type" "LifeEventType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "life_events_pkey" PRIMARY KEY ("id")
);

-- ---------- Índices e unicidade ----------
CREATE UNIQUE INDEX IF NOT EXISTS "rooms_code_key" ON "rooms"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "rooms_host_player_id_key" ON "rooms"("host_player_id");
CREATE INDEX IF NOT EXISTS "rooms_code_idx" ON "rooms"("code");

CREATE INDEX IF NOT EXISTS "players_room_id_name_idx" ON "players"("room_id", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "players_room_id_name_key" ON "players"("room_id", "name");

CREATE INDEX IF NOT EXISTS "chat_messages_room_id_idx" ON "chat_messages"("room_id");

CREATE UNIQUE INDEX IF NOT EXISTS "game_types_key_key" ON "game_types"("key");

CREATE INDEX IF NOT EXISTS "prompts_game_type_id_intensity_active_idx" ON "prompts"("game_type_id", "intensity", "active");
CREATE UNIQUE INDEX IF NOT EXISTS "prompts_game_type_id_text_key" ON "prompts"("game_type_id", "text");

CREATE INDEX IF NOT EXISTS "game_rounds_room_id_idx" ON "game_rounds"("room_id");
CREATE INDEX IF NOT EXISTS "life_events_room_id_idx" ON "life_events"("room_id");

-- ---------- Chaves estrangeiras (guardadas contra re-execução) ----------
DO $$ BEGIN
  ALTER TABLE "rooms" ADD CONSTRAINT "rooms_host_player_id_fkey"
    FOREIGN KEY ("host_player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "players" ADD CONSTRAINT "players_room_id_fkey"
    FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_room_id_fkey"
    FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_player_id_fkey"
    FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "prompts" ADD CONSTRAINT "prompts_game_type_id_fkey"
    FOREIGN KEY ("game_type_id") REFERENCES "game_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "game_rounds" ADD CONSTRAINT "game_rounds_room_id_fkey"
    FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "game_rounds" ADD CONSTRAINT "game_rounds_game_type_id_fkey"
    FOREIGN KEY ("game_type_id") REFERENCES "game_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "game_rounds" ADD CONSTRAINT "game_rounds_current_player_id_fkey"
    FOREIGN KEY ("current_player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "game_rounds" ADD CONSTRAINT "game_rounds_prompt_id_fkey"
    FOREIGN KEY ("prompt_id") REFERENCES "prompts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "life_events" ADD CONSTRAINT "life_events_room_id_fkey"
    FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "life_events" ADD CONSTRAINT "life_events_player_id_fkey"
    FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "life_events" ADD CONSTRAINT "life_events_round_id_fkey"
    FOREIGN KEY ("round_id") REFERENCES "game_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Comentários (documentação) ----------
COMMENT ON TABLE "rooms" IS 'Salas de jogo (código curto para juntar; estado quente vive em memória).';
COMMENT ON TABLE "players" IS 'Jogadores por sala; nome único dentro da sala.';
COMMENT ON TABLE "game_types" IS 'Tipos de jogo: boca_calada, desafio, intrigas, segredos.';
COMMENT ON TABLE "prompts" IS 'Banco de conteúdo por tipo de jogo e intensidade (leve/picante).';
COMMENT ON TABLE "game_rounds" IS 'Histórico de rondas jogadas.';
COMMENT ON TABLE "life_events" IS 'Log de goles/shots para estatísticas finais.';
