-- ================================================================
-- MIGRATION: corrigir FK apartments.maid_id
-- O código armazena user_profiles.user_id em apartments.maid_id,
-- mas o schema original referenciava maids(id).
-- Esta migration remove a FK antiga e aponta para auth.users(id).
-- Execute no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/fjohwpkjjxeqqxudzmhz/sql
-- ================================================================

-- 1. Remover FK antiga (referencia maids.id)
ALTER TABLE apartments
  DROP CONSTRAINT IF EXISTS apartments_maid_id_fkey;

-- 2. Adicionar FK correta (referencia auth.users, mesmo que user_profiles.user_id)
ALTER TABLE apartments
  ADD CONSTRAINT apartments_maid_id_fkey
  FOREIGN KEY (maid_id) REFERENCES auth.users(id) ON DELETE SET NULL;
