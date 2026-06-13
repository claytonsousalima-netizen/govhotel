-- ================================================================
-- MIGRATION: tabela de checklist de limpeza de UH
-- Execute no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/fjohwpkjjxeqqxudzmhz/sql
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

-- RLS
ALTER TABLE limpeza_checklists ENABLE ROW LEVEL SECURITY;

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
