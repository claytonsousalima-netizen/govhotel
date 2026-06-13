-- ================================================================
-- GOVHOTEL — ROW LEVEL SECURITY (RLS)
-- Execute APÓS o schema.sql
--
-- O que é RLS:
--   Cada linha do banco tem uma política de acesso.
--   Mesmo que alguém obtenha a chave anon, só vê os dados
--   que a política permite para o seu perfil.
--
-- COMO FUNCIONA:
--   1. auth.uid()    → UUID do usuário logado (Supabase injeta automaticamente)
--   2. my_hotel_id() → função que retorna o hotel_id do usuário logado
--   3. my_perfil()   → função que retorna o perfil do usuário logado
--   4. is_admin_global() → TRUE se o usuário é admin_global
-- ================================================================


-- ================================================================
-- FUNÇÕES AUXILIARES (SECURITY DEFINER)
-- Executadas com permissão elevada para consultar user_profiles
-- sem violar a própria RLS da tabela.
-- ================================================================

-- Retorna TRUE se o usuário logado é admin_global
CREATE OR REPLACE FUNCTION is_admin_global()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER   -- roda como dono da função, não como usuário logado
STABLE             -- resultado não muda dentro da mesma transação
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_profiles
    WHERE user_id = auth.uid()
      AND perfil  = 'admin_global'
      AND ativo   = TRUE
  );
$$;

-- Retorna o hotel_id do usuário logado (NULL para admin_global)
CREATE OR REPLACE FUNCTION my_hotel_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT hotel_id
  FROM user_profiles
  WHERE user_id = auth.uid()
    AND ativo   = TRUE
  LIMIT 1;
$$;

-- Retorna o perfil do usuário logado ('admin_global', 'admin_hotel' etc.)
CREATE OR REPLACE FUNCTION my_perfil()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT perfil
  FROM user_profiles
  WHERE user_id = auth.uid()
    AND ativo   = TRUE
  LIMIT 1;
$$;


-- ================================================================
-- ATIVAR RLS EM TODAS AS TABELAS
-- Sem isso, qualquer usuário autenticado acessa tudo.
-- ================================================================
ALTER TABLE hotels                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE maids                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders              ENABLE ROW LEVEL SECURITY;
ALTER TABLE apartment_status_history ENABLE ROW LEVEL SECURITY;


-- ================================================================
-- POLÍTICAS: hotels
-- ================================================================

-- admin_global: acesso total (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "admin_global — acesso total a hotels"
  ON hotels FOR ALL
  TO authenticated
  USING     (is_admin_global())
  WITH CHECK (is_admin_global());

-- Demais perfis: visualizam apenas o próprio hotel
CREATE POLICY "usuários — veem apenas o próprio hotel"
  ON hotels FOR SELECT
  TO authenticated
  USING (id = my_hotel_id());

-- admin_hotel: pode editar informações do próprio hotel
CREATE POLICY "admin_hotel — edita o próprio hotel"
  ON hotels FOR UPDATE
  TO authenticated
  USING     (id = my_hotel_id() AND my_perfil() = 'admin_hotel')
  WITH CHECK (id = my_hotel_id());


-- ================================================================
-- POLÍTICAS: user_profiles
-- ================================================================

-- Cada usuário vê apenas o próprio perfil
CREATE POLICY "usuário — vê o próprio perfil"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- admin_global: acesso total a todos os perfis
CREATE POLICY "admin_global — acesso total a user_profiles"
  ON user_profiles FOR ALL
  TO authenticated
  USING     (is_admin_global())
  WITH CHECK (is_admin_global());

-- admin_hotel: vê perfis do próprio hotel
CREATE POLICY "admin_hotel — vê perfis do hotel"
  ON user_profiles FOR SELECT
  TO authenticated
  USING (
    hotel_id = my_hotel_id()
    AND my_perfil() = 'admin_hotel'
  );

-- admin_hotel: cria/edita usuários do próprio hotel
-- Restrição: não pode criar outros admin_global
CREATE POLICY "admin_hotel — gerencia usuários do hotel"
  ON user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    hotel_id = my_hotel_id()
    AND my_perfil() = 'admin_hotel'
    AND perfil != 'admin_global'   -- não pode escalar para admin_global
  );

CREATE POLICY "admin_hotel — atualiza usuários do hotel"
  ON user_profiles FOR UPDATE
  TO authenticated
  USING (
    hotel_id = my_hotel_id()
    AND my_perfil() = 'admin_hotel'
  )
  WITH CHECK (
    hotel_id = my_hotel_id()
    AND perfil != 'admin_global'
  );


-- ================================================================
-- POLÍTICAS: apartments
-- ================================================================

-- admin_global: acesso total
CREATE POLICY "admin_global — acesso total a apartments"
  ON apartments FOR ALL
  TO authenticated
  USING     (is_admin_global())
  WITH CHECK (is_admin_global());

-- Todos os perfis do hotel: visualizam aptos do hotel
CREATE POLICY "usuários do hotel — veem aptos"
  ON apartments FOR SELECT
  TO authenticated
  USING (hotel_id = my_hotel_id());

-- admin_hotel e gestor: criam e editam aptos
CREATE POLICY "admin_hotel/gestor — criam aptos"
  ON apartments FOR INSERT
  TO authenticated
  WITH CHECK (
    hotel_id = my_hotel_id()
    AND my_perfil() IN ('admin_hotel','gestor')
  );

CREATE POLICY "admin_hotel/gestor — editam aptos"
  ON apartments FOR UPDATE
  TO authenticated
  USING (
    hotel_id = my_hotel_id()
    AND my_perfil() IN ('admin_hotel','gestor')
  )
  WITH CHECK (hotel_id = my_hotel_id());

-- camareira: só pode atualizar o campo status do apto
-- (UPDATE na tabela inteira — o frontend controla quais campos enviar)
CREATE POLICY "camareira — atualiza status do apto"
  ON apartments FOR UPDATE
  TO authenticated
  USING (
    hotel_id = my_hotel_id()
    AND my_perfil() = 'camareira'
  )
  WITH CHECK (hotel_id = my_hotel_id());

-- admin_hotel: pode excluir aptos do hotel
CREATE POLICY "admin_hotel — exclui aptos"
  ON apartments FOR DELETE
  TO authenticated
  USING (
    hotel_id = my_hotel_id()
    AND my_perfil() = 'admin_hotel'
  );


-- ================================================================
-- POLÍTICAS: maids
-- ================================================================

-- admin_global: acesso total
CREATE POLICY "admin_global — acesso total a maids"
  ON maids FOR ALL
  TO authenticated
  USING     (is_admin_global())
  WITH CHECK (is_admin_global());

-- Todos os perfis do hotel: visualizam camareiras do hotel
CREATE POLICY "usuários do hotel — veem camareiras"
  ON maids FOR SELECT
  TO authenticated
  USING (hotel_id = my_hotel_id());

-- admin_hotel e gestor: gerenciam camareiras
CREATE POLICY "admin_hotel/gestor — gerenciam camareiras"
  ON maids FOR ALL
  TO authenticated
  USING (
    hotel_id = my_hotel_id()
    AND my_perfil() IN ('admin_hotel','gestor')
  )
  WITH CHECK (hotel_id = my_hotel_id());


-- ================================================================
-- POLÍTICAS: work_orders (chamados)
-- ================================================================

-- admin_global: acesso total
CREATE POLICY "admin_global — acesso total a work_orders"
  ON work_orders FOR ALL
  TO authenticated
  USING     (is_admin_global())
  WITH CHECK (is_admin_global());

-- Todos os perfis do hotel: visualizam chamados do hotel
CREATE POLICY "usuários do hotel — veem chamados"
  ON work_orders FOR SELECT
  TO authenticated
  USING (hotel_id = my_hotel_id());

-- Perfis com gestão (não camareira): abrem chamados
CREATE POLICY "admin_hotel/gestor — abrem chamados"
  ON work_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    hotel_id = my_hotel_id()
    AND my_perfil() IN ('admin_hotel','gestor','admin_global')
  );

-- Todos (inclusive camareira): atualizam status do chamado
CREATE POLICY "usuários do hotel — atualizam chamado"
  ON work_orders FOR UPDATE
  TO authenticated
  USING (hotel_id = my_hotel_id())
  WITH CHECK (hotel_id = my_hotel_id());

-- admin_hotel: cancela/exclui chamados
CREATE POLICY "admin_hotel — exclui chamados"
  ON work_orders FOR DELETE
  TO authenticated
  USING (
    hotel_id = my_hotel_id()
    AND my_perfil() = 'admin_hotel'
  );


-- ================================================================
-- POLÍTICAS: apartment_status_history
-- ================================================================

-- admin_global: acesso total
CREATE POLICY "admin_global — acesso total ao histórico"
  ON apartment_status_history FOR ALL
  TO authenticated
  USING (is_admin_global());

-- Perfis do hotel: veem histórico dos aptos do próprio hotel
CREATE POLICY "usuários do hotel — veem histórico"
  ON apartment_status_history FOR SELECT
  TO authenticated
  USING (
    apartment_id IN (
      SELECT id FROM apartments WHERE hotel_id = my_hotel_id()
    )
  );

-- Qualquer autenticado do hotel: insere histórico (gravado automaticamente)
CREATE POLICY "usuários do hotel — inserem histórico"
  ON apartment_status_history FOR INSERT
  TO authenticated
  WITH CHECK (
    apartment_id IN (
      SELECT id FROM apartments WHERE hotel_id = my_hotel_id()
    )
  );


-- ================================================================
-- FIM DO RLS
-- ================================================================
