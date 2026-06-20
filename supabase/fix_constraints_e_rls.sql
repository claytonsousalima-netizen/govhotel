-- ================================================================
-- FIX: constraints + RLS para o fluxo de limpeza
-- GovEstancorp — Execute no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/fjohwpkjjxeqqxudzmhz/sql
--
-- PROBLEMAS IDENTIFICADOS:
--   1. apartments.status CHECK não inclui 'pausado','limpo','reprovado'
--   2. apartment_status_history.status_novo CHECK não inclui os mesmos
--   3. user_profiles.perfil CHECK não inclui 'supervisora','manutencao'
--   4. RLS de apartment_status_history bloqueia insert via anon key
--      (isso é esperado — os inserts precisam de usuário autenticado)
--   5. limpeza_checklists e conferencia_supervisora_checklists podem
--      não ter sido criadas ainda no banco (migrations pendentes)
-- ================================================================

-- ================================================================
-- 1. apartments.status — adicionar pausado, limpo, reprovado
-- ================================================================
ALTER TABLE apartments
  DROP CONSTRAINT IF EXISTS apartments_status_check;

ALTER TABLE apartments
  ADD CONSTRAINT apartments_status_check
  CHECK (status IN (
    'livre', 'ocupado', 'sujo', 'limpando', 'pausado',
    'conferencia', 'limpo', 'reprovado', 'bloqueado', 'manutencao'
  ));

-- ================================================================
-- 2. apartment_status_history.status_novo — mesma ampliação
-- ================================================================
ALTER TABLE apartment_status_history
  DROP CONSTRAINT IF EXISTS apartment_status_history_status_novo_check;

ALTER TABLE apartment_status_history
  ADD CONSTRAINT apartment_status_history_status_novo_check
  CHECK (status_novo IN (
    'livre', 'ocupado', 'sujo', 'limpando', 'pausado',
    'conferencia', 'limpo', 'reprovado', 'bloqueado', 'manutencao'
  ));

-- ================================================================
-- 3. user_profiles.perfil — adicionar supervisora e manutencao
-- ================================================================
ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_perfil_check;

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_perfil_check
  CHECK (perfil IN (
    'admin_global', 'admin_hotel', 'gestor',
    'supervisora', 'camareira', 'manutencao'
  ));

-- Adicionar coluna turno_id se não existir (migration_user_profiles_v2)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS turno_id INTEGER REFERENCES turnos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_profiles_turno ON user_profiles (turno_id);

-- ================================================================
-- 4. limpeza_checklists — criar tabela se não existir
-- ================================================================
CREATE TABLE IF NOT EXISTS limpeza_checklists (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  apartment_id UUID NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  hotel_id     UUID NOT NULL REFERENCES hotels(id)    ON DELETE CASCADE,
  usuario_id   UUID NOT NULL REFERENCES auth.users(id),
  tipo_limpeza TEXT NOT NULL DEFAULT 'saida'
               CHECK (tipo_limpeza IN ('saida','permanencia','pos_manutencao')),
  respostas    JSONB NOT NULL DEFAULT '[]',
  obs_geral    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_limpeza_checklists_apartment ON limpeza_checklists (apartment_id);
CREATE INDEX IF NOT EXISTS idx_limpeza_checklists_hotel     ON limpeza_checklists (hotel_id);
CREATE INDEX IF NOT EXISTS idx_limpeza_checklists_usuario   ON limpeza_checklists (usuario_id);
CREATE INDEX IF NOT EXISTS idx_limpeza_checklists_created   ON limpeza_checklists (created_at DESC);

ALTER TABLE limpeza_checklists ENABLE ROW LEVEL SECURITY;

-- Remover policies antigas se existirem (para re-criar de forma idempotente)
DROP POLICY IF EXISTS "checklist_admin_global"   ON limpeza_checklists;
DROP POLICY IF EXISTS "checklist_select_hotel"   ON limpeza_checklists;
DROP POLICY IF EXISTS "checklist_insert_hotel"   ON limpeza_checklists;

CREATE POLICY "checklist_admin_global"
  ON limpeza_checklists FOR ALL
  TO authenticated
  USING (is_admin_global()) WITH CHECK (is_admin_global());

CREATE POLICY "checklist_select_hotel"
  ON limpeza_checklists FOR SELECT
  TO authenticated
  USING (hotel_id = my_hotel_id());

CREATE POLICY "checklist_insert_hotel"
  ON limpeza_checklists FOR INSERT
  TO authenticated
  WITH CHECK (hotel_id = my_hotel_id());

-- ================================================================
-- 5. conferencia_supervisora_checklists — criar tabela se não existir
-- ================================================================
CREATE TABLE IF NOT EXISTS conferencia_supervisora_checklists (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  apartment_id UUID NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  hotel_id     UUID NOT NULL REFERENCES hotels(id)    ON DELETE CASCADE,
  usuario_id   UUID NOT NULL REFERENCES auth.users(id),
  respostas    JSONB NOT NULL DEFAULT '[]',
  obs          TEXT,
  resultado    TEXT NOT NULL DEFAULT 'aprovar'
               CHECK (resultado IN ('aprovar','reprovar')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conf_sup_apartment ON conferencia_supervisora_checklists (apartment_id);
CREATE INDEX IF NOT EXISTS idx_conf_sup_hotel     ON conferencia_supervisora_checklists (hotel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conf_sup_usuario   ON conferencia_supervisora_checklists (usuario_id);

ALTER TABLE conferencia_supervisora_checklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conf_sup_admin_global"   ON conferencia_supervisora_checklists;
DROP POLICY IF EXISTS "conf_sup_select_hotel"   ON conferencia_supervisora_checklists;
DROP POLICY IF EXISTS "conf_sup_insert_hotel"   ON conferencia_supervisora_checklists;

CREATE POLICY "conf_sup_admin_global"
  ON conferencia_supervisora_checklists FOR ALL TO authenticated
  USING (is_admin_global()) WITH CHECK (is_admin_global());

CREATE POLICY "conf_sup_select_hotel"
  ON conferencia_supervisora_checklists FOR SELECT TO authenticated
  USING (hotel_id = my_hotel_id());

CREATE POLICY "conf_sup_insert_hotel"
  ON conferencia_supervisora_checklists FOR INSERT TO authenticated
  WITH CHECK (hotel_id = my_hotel_id());

-- ================================================================
-- VERIFICAÇÃO FINAL — confirmar os valores aceitos pós-fix
-- ================================================================
SELECT
  conrelid::regclass AS tabela,
  conname            AS constraint_name,
  pg_get_constraintdef(oid) AS definicao
FROM pg_constraint
WHERE contype = 'c'
  AND conrelid::regclass::text IN (
    'apartments',
    'apartment_status_history',
    'user_profiles',
    'limpeza_checklists',
    'conferencia_supervisora_checklists'
  )
ORDER BY tabela, conname;
