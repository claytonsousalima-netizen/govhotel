-- ================================================================
-- MIGRATION: novos status do fluxo de limpeza
-- Execute no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/fjohwpkjjxeqqxudzmhz/sql
--
-- Adiciona: pausado, limpo, reprovado
-- Mantém todos os status existentes (compatibilidade total)
-- ================================================================

-- 1. apartments.status: ampliar CHECK constraint
ALTER TABLE apartments
  DROP CONSTRAINT IF EXISTS apartments_status_check;

ALTER TABLE apartments
  ADD CONSTRAINT apartments_status_check
  CHECK (status IN (
    'livre', 'ocupado', 'sujo', 'limpando', 'pausado',
    'conferencia', 'limpo', 'reprovado', 'bloqueado', 'manutencao'
  ));

-- 2. apartment_status_history.status_novo: ampliar CHECK constraint
ALTER TABLE apartment_status_history
  DROP CONSTRAINT IF EXISTS apartment_status_history_status_novo_check;

ALTER TABLE apartment_status_history
  ADD CONSTRAINT apartment_status_history_status_novo_check
  CHECK (status_novo IN (
    'livre', 'ocupado', 'sujo', 'limpando', 'pausado',
    'conferencia', 'limpo', 'reprovado', 'bloqueado', 'manutencao'
  ));
