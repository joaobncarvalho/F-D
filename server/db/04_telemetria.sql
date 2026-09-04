-- =====================================================================
-- F&D — Telemetria (telemetry_counters + telemetry_nights)
-- =====================================================================
-- As contagens que alimentam o separador 📊 Estatísticas da /admin.
-- Autocontido e idempotente — pode correr isolado (Supabase SQL editor / psql),
-- depois de 01_schema.sql. Espelha:
--   server/prisma/schema.prisma  (models TelemetryCounter, TelemetryNight)
--   server/src/telemetria.js     (quem escreve e quem lê)
--
-- SÓ AGREGADOS: não há aqui nomes de jogadores, ids, códigos de sala, nem nada
-- escrito pela mesa (perguntas, segredos, intrigas). Ver o cabeçalho do módulo.
--
-- O servidor funciona sem estas tabelas: a fonte de verdade em runtime é o
-- ficheiro `.data/telemetria.json`, e a BD é o que sobrevive a um deploy que
-- troque de máquina. Sem elas, a gravação falha em silêncio e fica o ficheiro.
--
-- NOTA: em produção o caminho normal é `prisma db push`; este script existe para
-- inicializar/rever a BD diretamente sem o Prisma.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Um contador por (scope, key). `metrics` é JSON para medir coisas novas sem
-- migração — ver a lista de scopes no schema.prisma.
CREATE TABLE IF NOT EXISTS telemetry_counters (
  scope      TEXT        NOT NULL,
  key        TEXT        NOT NULL,
  label      TEXT,
  metrics    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key)
);

CREATE INDEX IF NOT EXISTS telemetry_counters_scope_idx ON telemetry_counters (scope);

-- Uma linha por noite jogada: a FORMA da noite, não quem lá esteve.
CREATE TABLE IF NOT EXISTS telemetry_nights (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ended_at   TIMESTAMPTZ NOT NULL,
  mode       TEXT        NOT NULL,
  intensity  TEXT,
  players    INTEGER     NOT NULL DEFAULT 0,
  rounds     INTEGER     NOT NULL DEFAULT 0,
  minutes    INTEGER     NOT NULL DEFAULT 0,
  outcome    TEXT        NOT NULL DEFAULT 'fim',
  modifiers  TEXT[]      NOT NULL DEFAULT '{}',
  eliminated INTEGER     NOT NULL DEFAULT 0,
  drinks     INTEGER     NOT NULL DEFAULT 0
);

-- Torna o reenvio idempotente: o servidor manda as noites que a BD ainda não
-- tem, e um envio repetido não duplica nada.
CREATE UNIQUE INDEX IF NOT EXISTS telemetry_nights_ended_mode_key
  ON telemetry_nights (ended_at, mode);
CREATE INDEX IF NOT EXISTS telemetry_nights_ended_idx ON telemetry_nights (ended_at);
