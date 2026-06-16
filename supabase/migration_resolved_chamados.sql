-- ================================================================
-- MIGRATION: campos de conclusão em work_orders
-- Execute no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/fjohwpkjjxeqqxudzmhz/sql
-- ================================================================

-- Adiciona data e usuário de conclusão/resolução/cancelamento
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS resolved_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by  UUID REFERENCES auth.users(id);

-- Index para queries de tempo de resolução
CREATE INDEX IF NOT EXISTS idx_work_orders_resolved
  ON work_orders (resolved_at)
  WHERE resolved_at IS NOT NULL;

-- Retroativo: preenche resolved_at para registros já concluídos sem data
-- (usa updated_at se existir e for confiável; caso contrário deixa NULL)
UPDATE work_orders
SET resolved_at = updated_at
WHERE status IN ('resolvido','concluido','cancelado')
  AND resolved_at IS NULL
  AND updated_at IS NOT NULL;
