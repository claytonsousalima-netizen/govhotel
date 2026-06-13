-- ================================================================
-- MIGRATION: pendencias_retrabalho
-- Criada automaticamente ao reprovar a conferência de limpeza.
-- Execute no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/fjohwpkjjxeqqxudzmhz/sql
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
