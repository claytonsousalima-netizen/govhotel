-- ================================================================
-- MIGRATION: Tabelas de Configuração do Sistema
-- Cria todas as tabelas usadas no módulo Config.
-- Execute no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/fjohwpkjjxeqqxudzmhz/sql
-- ================================================================

-- ---------------------------------------------------------------
-- 1. chamado_tipos
--    Tipos de chamado configuráveis por hotel (governança/manutenção)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chamado_tipos (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id    UUID REFERENCES hotels(id) ON DELETE CASCADE,  -- NULL = global
  nome        TEXT NOT NULL,
  departamento TEXT NOT NULL DEFAULT 'ambos'
              CHECK (departamento IN ('governanca','manutencao','ambos')),
  ordem       INTEGER NOT NULL DEFAULT 0,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chamado_tipos_hotel ON chamado_tipos (hotel_id, ativo, ordem);
ALTER TABLE chamado_tipos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chamado_tipos_select"       ON chamado_tipos FOR SELECT USING (true);
CREATE POLICY "chamado_tipos_admin_global" ON chamado_tipos FOR ALL   USING (is_admin_global());
CREATE POLICY "chamado_tipos_admin_hotel"  ON chamado_tipos FOR ALL
  USING (my_perfil() IN ('admin_hotel','gestor') AND hotel_id = my_hotel_id());

-- ---------------------------------------------------------------
-- 2. checklist_templates
--    Templates de checklist de limpeza configuráveis por hotel
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checklist_templates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id    UUID REFERENCES hotels(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  ordem       INTEGER NOT NULL DEFAULT 0,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_checklist_tpl_hotel ON checklist_templates (hotel_id, ativo, ordem);
ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklist_tpl_select"       ON checklist_templates FOR SELECT USING (true);
CREATE POLICY "checklist_tpl_admin_global" ON checklist_templates FOR ALL   USING (is_admin_global());
CREATE POLICY "checklist_tpl_admin_hotel"  ON checklist_templates FOR ALL
  USING (my_perfil() IN ('admin_hotel','gestor') AND hotel_id = my_hotel_id());

-- ---------------------------------------------------------------
-- 3. solicitantes
--    Origem dos chamados (recepção, hóspede, diretoria, etc.)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS solicitantes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id    UUID REFERENCES hotels(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  ordem       INTEGER NOT NULL DEFAULT 0,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_solicitantes_hotel ON solicitantes (hotel_id, ativo, ordem);
ALTER TABLE solicitantes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "solicitantes_select"       ON solicitantes FOR SELECT USING (true);
CREATE POLICY "solicitantes_admin_global" ON solicitantes FOR ALL   USING (is_admin_global());
CREATE POLICY "solicitantes_admin_hotel"  ON solicitantes FOR ALL
  USING (my_perfil() IN ('admin_hotel','gestor') AND hotel_id = my_hotel_id());

-- ---------------------------------------------------------------
-- 4. motivos_reprovacao
--    Motivos padrão ao reprovar conferência de limpeza
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS motivos_reprovacao (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id    UUID REFERENCES hotels(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  ordem       INTEGER NOT NULL DEFAULT 0,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_motivos_reprov_hotel ON motivos_reprovacao (hotel_id, ativo, ordem);
ALTER TABLE motivos_reprovacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "motivos_reprov_select"       ON motivos_reprovacao FOR SELECT USING (true);
CREATE POLICY "motivos_reprov_admin_global" ON motivos_reprovacao FOR ALL   USING (is_admin_global());
CREATE POLICY "motivos_reprov_admin_hotel"  ON motivos_reprovacao FOR ALL
  USING (my_perfil() IN ('admin_hotel','gestor') AND hotel_id = my_hotel_id());

-- ---------------------------------------------------------------
-- 5. tipos_limpeza
--    Tipos de limpeza além dos padrão (saida, permanencia, pos_manutencao)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tipos_limpeza (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id    UUID REFERENCES hotels(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  ordem       INTEGER NOT NULL DEFAULT 0,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tipos_limpeza_hotel ON tipos_limpeza (hotel_id, ativo, ordem);
ALTER TABLE tipos_limpeza ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tipos_limpeza_select"       ON tipos_limpeza FOR SELECT USING (true);
CREATE POLICY "tipos_limpeza_admin_global" ON tipos_limpeza FOR ALL   USING (is_admin_global());
CREATE POLICY "tipos_limpeza_admin_hotel"  ON tipos_limpeza FOR ALL
  USING (my_perfil() IN ('admin_hotel','gestor') AND hotel_id = my_hotel_id());

-- ---------------------------------------------------------------
-- 6. motivos_pausa
--    Motivos para pausar limpeza em andamento
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS motivos_pausa (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id    UUID REFERENCES hotels(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  ordem       INTEGER NOT NULL DEFAULT 0,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_motivos_pausa_hotel ON motivos_pausa (hotel_id, ativo, ordem);
ALTER TABLE motivos_pausa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "motivos_pausa_select"       ON motivos_pausa FOR SELECT USING (true);
CREATE POLICY "motivos_pausa_admin_global" ON motivos_pausa FOR ALL   USING (is_admin_global());
CREATE POLICY "motivos_pausa_admin_hotel"  ON motivos_pausa FOR ALL
  USING (my_perfil() IN ('admin_hotel','gestor') AND hotel_id = my_hotel_id());

-- ---------------------------------------------------------------
-- 7. motivos_cancelamento
--    Motivos para cancelar chamados
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS motivos_cancelamento (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id    UUID REFERENCES hotels(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  ordem       INTEGER NOT NULL DEFAULT 0,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_motivos_cancel_hotel ON motivos_cancelamento (hotel_id, ativo, ordem);
ALTER TABLE motivos_cancelamento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "motivos_cancel_select"       ON motivos_cancelamento FOR SELECT USING (true);
CREATE POLICY "motivos_cancel_admin_global" ON motivos_cancelamento FOR ALL   USING (is_admin_global());
CREATE POLICY "motivos_cancel_admin_hotel"  ON motivos_cancelamento FOR ALL
  USING (my_perfil() IN ('admin_hotel','gestor') AND hotel_id = my_hotel_id());

-- ---------------------------------------------------------------
-- 8. supervisora_checklist_items
--    Itens do checklist que a supervisora verifica na conferência
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supervisora_checklist_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id    UUID REFERENCES hotels(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  obrigatorio BOOLEAN NOT NULL DEFAULT TRUE,
  ordem       INTEGER NOT NULL DEFAULT 0,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sup_cl_items_hotel ON supervisora_checklist_items (hotel_id, ativo, ordem);
ALTER TABLE supervisora_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sup_cl_items_select"       ON supervisora_checklist_items FOR SELECT USING (true);
CREATE POLICY "sup_cl_items_admin_global" ON supervisora_checklist_items FOR ALL   USING (is_admin_global());
CREATE POLICY "sup_cl_items_admin_hotel"  ON supervisora_checklist_items FOR ALL
  USING (my_perfil() IN ('admin_hotel','gestor') AND hotel_id = my_hotel_id());

-- ---------------------------------------------------------------
-- 9. hotel_config
--    Configurações gerais do hotel em pares chave/valor
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hotel_config (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id    UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  chave       TEXT NOT NULL,
  valor       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hotel_id, chave)
);
CREATE INDEX IF NOT EXISTS idx_hotel_config_hotel ON hotel_config (hotel_id, chave);
ALTER TABLE hotel_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hotel_config_select"       ON hotel_config FOR SELECT USING (hotel_id = my_hotel_id() OR is_admin_global());
CREATE POLICY "hotel_config_admin_global" ON hotel_config FOR ALL   USING (is_admin_global());
CREATE POLICY "hotel_config_admin_hotel"  ON hotel_config FOR ALL
  USING (my_perfil() IN ('admin_hotel','gestor') AND hotel_id = my_hotel_id());
