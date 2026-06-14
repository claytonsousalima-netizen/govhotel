-- ================================================================
-- MIGRATION: Numeração MAN + RLS por departamento
-- Rodar no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/fjohwpkjjxeqqxudzmhz/sql
-- ================================================================

-- 1. Sequência para numeração MAN (análoga à chamado_gov_seq)
CREATE SEQUENCE IF NOT EXISTS chamado_man_seq START 1;

-- 2. Atualizar função geradora para incluir manutenção
CREATE OR REPLACE FUNCTION fn_gerar_numero_chamado()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.departamento = 'governanca' AND (NEW.numero IS NULL OR NEW.numero = '') THEN
    NEW.numero := 'GOV-' || LPAD(nextval('chamado_gov_seq')::TEXT, 6, '0');
  ELSIF NEW.departamento = 'manutencao' AND (NEW.numero IS NULL OR NEW.numero = '') THEN
    NEW.numero := 'MAN-' || LPAD(nextval('chamado_man_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;
-- O trigger trg_gerar_numero_chamado já existe e cobre INSERT de qualquer departamento.
-- Não é necessário recriar o trigger.

-- 3. Restringir UPDATE de work_orders por departamento vs perfil
--    Garante que camareira só atualiza chamados de governança
--    e manutenção só atualiza chamados de manutenção, mesmo chamando a API diretamente.
DROP POLICY IF EXISTS "usuários do hotel — atualizam chamado" ON work_orders;

CREATE POLICY "usuários do hotel — atualizam chamado"
  ON work_orders FOR UPDATE
  TO authenticated
  USING (
    hotel_id = my_hotel_id()
    AND (
      my_perfil() IN ('admin_global', 'admin_hotel', 'gestor', 'supervisora')
      OR (my_perfil() = 'camareira'  AND departamento = 'governanca')
      OR (my_perfil() = 'manutencao' AND departamento = 'manutencao')
    )
  )
  WITH CHECK (
    hotel_id = my_hotel_id()
    AND (
      my_perfil() IN ('admin_global', 'admin_hotel', 'gestor', 'supervisora')
      OR (my_perfil() = 'camareira'  AND departamento = 'governanca')
      OR (my_perfil() = 'manutencao' AND departamento = 'manutencao')
    )
  );

-- Observação: chamados de manutenção já existentes ficam com numero = NULL.
-- Apenas novos chamados de manutenção receberão MAN-XXXXXX.
