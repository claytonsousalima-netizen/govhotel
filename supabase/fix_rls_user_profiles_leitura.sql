-- ================================================================
-- CORREÇÃO: RLS user_profiles — permitir leitura de nomes de
-- usuários que aparecem em históricos (ex: admin_global)
--
-- PROBLEMA: Gestor/supervisora/camareira não têm política SELECT
-- em user_profiles além do próprio perfil, então o nome do
-- admin_global (hotel_id = NULL) nunca é resolvido nos relatórios.
--
-- SOLUÇÃO: Adicionar política que permite todos os autenticados
-- lerem perfis do próprio hotel OU perfis admin_global.
-- ================================================================

-- Verificar políticas atuais na tabela
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'user_profiles'
ORDER BY policyname;

-- ----------------------------------------------------------------
-- Adicionar política de leitura para gestor/supervisora/camareira
-- e para admin_global de qualquer hotel
-- ----------------------------------------------------------------

-- Remove se já existir (para re-executar com segurança)
DROP POLICY IF EXISTS "usuarios autenticados — veem nomes do hotel e admin_global" ON user_profiles;

CREATE POLICY "usuarios autenticados — veem nomes do hotel e admin_global"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    hotel_id = my_hotel_id()          -- perfis do próprio hotel
    OR perfil = 'admin_global'        -- admin_global visível para todos
  );

-- ----------------------------------------------------------------
-- Verificar resultado
-- ----------------------------------------------------------------
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'user_profiles'
ORDER BY policyname;
