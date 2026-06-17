-- ================================================================
-- FIX COMPLETO — EXECUTAR NO SUPABASE SQL EDITOR
-- https://supabase.com/dashboard/project/fjohwpkjjxeqqxudzmhz/sql
--
-- Este arquivo corrige TODOS os problemas identificados:
-- 1. CHECK constraints de status (faltam: pausado, limpo, reprovado)
-- 2. CHECK constraint de perfil (faltam: supervisora, manutencao)
-- 3. Cria tabelas que estavam ausentes
-- 4. Verifica o resultado
--
-- É seguro executar múltiplas vezes (IF NOT EXISTS / IF EXISTS)
-- ================================================================

-- ================================================================
-- PARTE 1: apartments.status — adicionar pausado, limpo, reprovado
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
-- PARTE 2: apartment_status_history.status_novo — mesmos valores
-- ================================================================
ALTER TABLE apartment_status_history
  DROP CONSTRAINT IF EXISTS apartment_status_history_status_novo_check;

ALTER TABLE apartment_status_history
  ADD CONSTRAINT apartment_status_history_status_novo_check
  CHECK (status_novo IN (
    'livre', 'ocupado', 'sujo', 'limpando', 'pausado',
    'conferencia', 'limpo', 'reprovado', 'bloqueado', 'manutencao'
  ));

-- Mesmo para status_anterior (pode ser qualquer valor incluindo antigos)
ALTER TABLE apartment_status_history
  DROP CONSTRAINT IF EXISTS apartment_status_history_status_anterior_check;

-- ================================================================
-- PARTE 3: user_profiles.perfil — adicionar supervisora e manutencao
-- ================================================================
ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_perfil_check;

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_perfil_check
  CHECK (perfil IN (
    'admin_global', 'admin_hotel', 'gestor',
    'supervisora', 'camareira', 'manutencao'
  ));

-- ================================================================
-- PARTE 4: Coluna turno_id em user_profiles (para camareiras)
-- ================================================================
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS turno_id INTEGER REFERENCES turnos(id) ON DELETE SET NULL;

-- ================================================================
-- PARTE 5: Tabela limpeza_checklists (se não existir)
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

DROP POLICY IF EXISTS "checklist_admin_global"  ON limpeza_checklists;
DROP POLICY IF EXISTS "checklist_select_hotel"  ON limpeza_checklists;
DROP POLICY IF EXISTS "checklist_insert_hotel"  ON limpeza_checklists;

CREATE POLICY "checklist_admin_global"
  ON limpeza_checklists FOR ALL TO authenticated
  USING (is_admin_global()) WITH CHECK (is_admin_global());

CREATE POLICY "checklist_select_hotel"
  ON limpeza_checklists FOR SELECT TO authenticated
  USING (hotel_id = my_hotel_id());

CREATE POLICY "checklist_insert_hotel"
  ON limpeza_checklists FOR INSERT TO authenticated
  WITH CHECK (hotel_id = my_hotel_id());

-- ================================================================
-- PARTE 6: Tabela conferencia_supervisora_checklists (se não existir)
-- ================================================================
CREATE TABLE IF NOT EXISTS conferencia_supervisora_checklists (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  apartment_id UUID NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  hotel_id     UUID NOT NULL REFERENCES hotels(id)    ON DELETE CASCADE,
  usuario_id   UUID NOT NULL REFERENCES auth.users(id),
  respostas    JSONB NOT NULL DEFAULT '{}',
  obs          TEXT,
  resultado    TEXT NOT NULL DEFAULT 'aprovar'
               CHECK (resultado IN ('aprovar','reprovar')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conf_sup_apartment ON conferencia_supervisora_checklists (apartment_id);
CREATE INDEX IF NOT EXISTS idx_conf_sup_hotel     ON conferencia_supervisora_checklists (hotel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conf_sup_usuario   ON conferencia_supervisora_checklists (usuario_id);

ALTER TABLE conferencia_supervisora_checklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conf_sup_admin_global"  ON conferencia_supervisora_checklists;
DROP POLICY IF EXISTS "conf_sup_select_hotel"  ON conferencia_supervisora_checklists;
DROP POLICY IF EXISTS "conf_sup_insert_hotel"  ON conferencia_supervisora_checklists;

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
-- PARTE 7: Tabela pendencias_retrabalho (se não existir)
-- ================================================================
CREATE TABLE IF NOT EXISTS pendencias_retrabalho (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  apartment_id  UUID NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  hotel_id      UUID NOT NULL REFERENCES hotels(id)    ON DELETE CASCADE,
  motivo        TEXT NOT NULL,
  obs           TEXT,
  status        TEXT NOT NULL DEFAULT 'aberta'
                CHECK (status IN ('aberta','resolvida')),
  criado_por    UUID REFERENCES auth.users(id),
  resolvido_por UUID REFERENCES auth.users(id),
  resolvido_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pendencias_apartment ON pendencias_retrabalho (apartment_id);
CREATE INDEX IF NOT EXISTS idx_pendencias_hotel     ON pendencias_retrabalho (hotel_id, status);

ALTER TABLE pendencias_retrabalho ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pendencias_admin_global"   ON pendencias_retrabalho;
DROP POLICY IF EXISTS "pendencias_select_hotel"   ON pendencias_retrabalho;
DROP POLICY IF EXISTS "pendencias_insert_hotel"   ON pendencias_retrabalho;
DROP POLICY IF EXISTS "pendencias_update_hotel"   ON pendencias_retrabalho;

CREATE POLICY "pendencias_admin_global"
  ON pendencias_retrabalho FOR ALL TO authenticated
  USING (is_admin_global()) WITH CHECK (is_admin_global());

CREATE POLICY "pendencias_select_hotel"
  ON pendencias_retrabalho FOR SELECT TO authenticated
  USING (hotel_id = my_hotel_id());

CREATE POLICY "pendencias_insert_hotel"
  ON pendencias_retrabalho FOR INSERT TO authenticated
  WITH CHECK (hotel_id = my_hotel_id());

CREATE POLICY "pendencias_update_hotel"
  ON pendencias_retrabalho FOR UPDATE TO authenticated
  USING (hotel_id = my_hotel_id()) WITH CHECK (hotel_id = my_hotel_id());

-- ================================================================
-- PARTE 8: FK apartments.maid_id — apontar para auth.users
-- ================================================================
ALTER TABLE apartments
  DROP CONSTRAINT IF EXISTS apartments_maid_id_fkey;

ALTER TABLE apartments
  ADD CONSTRAINT apartments_maid_id_fkey
  FOREIGN KEY (maid_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- ================================================================
-- VERIFICAÇÃO FINAL — deve mostrar constraints corretas
-- ================================================================
SELECT
  tc.table_name,
  cc.constraint_name,
  cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name IN (
  'apartments', 'apartment_status_history', 'user_profiles',
  'limpeza_checklists', 'conferencia_supervisora_checklists', 'pendencias_retrabalho'
)
AND tc.constraint_type = 'CHECK'
ORDER BY tc.table_name, cc.constraint_name;
