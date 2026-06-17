-- ================================================================
-- MIGRATION: conferencia_supervisora_checklists
-- Salva o resultado da conferência da supervisora por apartamento.
-- Campos `respostas` armazena array JSONB com itens verificados.
-- Execute no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/fjohwpkjjxeqqxudzmhz/sql
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

CREATE POLICY "conf_sup_admin_global"
  ON conferencia_supervisora_checklists FOR ALL TO authenticated
  USING (is_admin_global()) WITH CHECK (is_admin_global());

CREATE POLICY "conf_sup_select_hotel"
  ON conferencia_supervisora_checklists FOR SELECT TO authenticated
  USING (hotel_id = my_hotel_id());

CREATE POLICY "conf_sup_insert_hotel"
  ON conferencia_supervisora_checklists FOR INSERT TO authenticated
  WITH CHECK (hotel_id = my_hotel_id());
