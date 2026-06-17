-- ================================================================
-- MIGRATION: user_profiles v2
-- Adiciona perfis 'supervisora' e 'manutencao' + coluna turno_id
-- Execute no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/fjohwpkjjxeqqxudzmhz/sql
-- ================================================================

-- 1. Expandir CHECK constraint de perfil para incluir supervisora e manutencao
ALTER TABLE user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_perfil_check;

ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_perfil_check
  CHECK (perfil IN (
    'admin_global',
    'admin_hotel',
    'gestor',
    'supervisora',
    'camareira',
    'manutencao'
  ));

-- 2. Adicionar coluna turno_id (FK para turnos — usado para camareiras)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS turno_id INTEGER REFERENCES turnos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_profiles_turno ON user_profiles (turno_id);
