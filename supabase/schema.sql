-- ================================================================
-- GOVHOTEL — SCHEMA COMPLETO DO BANCO DE DADOS
-- Banco: PostgreSQL via Supabase
-- Versão: 2.0
--
-- INSTRUÇÕES:
--   1. Acesse seu projeto no Supabase
--   2. Vá em: SQL Editor → New query
--   3. Cole este arquivo inteiro e clique em Run
--   4. Em seguida, execute o arquivo rls.sql
--
-- ORDEM DAS TABELAS (respeitar por causa das FK):
--   1. hotels
--   2. user_profiles
--   3. apartments
--   4. maids
--   5. work_orders  (chamados)
--   6. apartment_status_history
-- ================================================================


-- ================================================================
-- EXTENSÃO: uuid-ossp
-- Necessária para gerar UUIDs automaticamente
-- ================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ================================================================
-- FUNÇÃO AUXILIAR: atualiza o campo updated_at automaticamente
-- Usada como trigger em todas as tabelas que têm updated_at
-- ================================================================
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- ================================================================
-- TABELA: hotels
-- Armazena os hotéis cadastrados no sistema.
-- Cada hotel é uma unidade independente com seus próprios
-- apartamentos, camareiras e usuários.
-- ================================================================
CREATE TABLE IF NOT EXISTS hotels (

  -- Identificador único do hotel
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Nome comercial do hotel (obrigatório)
  nome        TEXT NOT NULL,

  -- CNPJ da empresa, formatado como texto (ex: "12.345.678/0001-90")
  cnpj        TEXT,

  -- Endereço completo (logradouro + número + complemento)
  endereco    TEXT,

  -- Cidade onde o hotel está localizado
  cidade      TEXT,

  -- UF (2 letras, ex: "SP", "RJ")
  estado      CHAR(2),

  -- Número de andares do hotel (usado para organizar aptos)
  total_andares INTEGER DEFAULT 1 CHECK (total_andares >= 1),

  -- Telefone principal de contato
  telefone    TEXT,

  -- E-mail institucional do hotel
  email       TEXT,

  -- Indica se o hotel está ativo no sistema.
  -- Hotéis inativos não aparecem para usuários comuns.
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,

  -- Data/hora de criação do registro (preenchida automaticamente)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Data/hora da última atualização (atualizada pelo trigger)
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

-- Trigger: atualiza updated_at ao editar um hotel
CREATE OR REPLACE TRIGGER trg_hotels_updated_at
  BEFORE UPDATE ON hotels
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Índice para buscas por nome
CREATE INDEX IF NOT EXISTS idx_hotels_nome ON hotels (nome);


-- ================================================================
-- TABELA: user_profiles
-- Perfil de acesso de cada usuário do sistema.
-- Complementa a tabela auth.users do Supabase Auth, que armazena
-- apenas e-mail e senha. Aqui ficam nome, perfil e hotel vinculado.
--
-- PERFIS DISPONÍVEIS:
--   admin_global → acessa todos os hotéis e todas as funções
--   admin_hotel  → acessa apenas o hotel vinculado (gestão total)
--   gestor       → acessa hotel vinculado, sem cadastros de sistema
--   camareira    → visualiza e muda status de aptos apenas
-- ================================================================
CREATE TABLE IF NOT EXISTS user_profiles (

  -- Identificador interno do perfil
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Referência ao usuário na tabela de autenticação do Supabase.
  -- ON DELETE CASCADE: se o usuário for excluído do auth, o perfil
  -- também é removido automaticamente.
  user_id     UUID NOT NULL UNIQUE
              REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Nome completo do usuário (exibido na interface)
  nome        TEXT NOT NULL,

  -- Perfil de acesso — define o que o usuário pode ver e fazer
  perfil      TEXT NOT NULL
              CHECK (perfil IN ('admin_global','admin_hotel','gestor','camareira')),

  -- Hotel ao qual o usuário pertence.
  -- NULL somente para admin_global, que acessa todos os hotéis.
  -- ON DELETE SET NULL: se o hotel for excluído, o vínculo é removido
  -- (não exclui o usuário).
  hotel_id    UUID
              REFERENCES hotels(id) ON DELETE SET NULL,

  -- Usuário ativo ou inativo.
  -- Usuários inativos não conseguem fazer login.
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

-- Trigger
CREATE OR REPLACE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Índices
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id  ON user_profiles (user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_hotel_id ON user_profiles (hotel_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_perfil   ON user_profiles (perfil);


-- ================================================================
-- TABELA: apartments
-- Apartamentos/unidades cadastrados por hotel.
-- Cada apartamento pertence obrigatoriamente a um hotel.
-- O campo status reflete o estado operacional em tempo real.
--
-- ESTADOS POSSÍVEIS:
--   livre       → disponível para receber hóspede
--   ocupado     → hóspede hospedado, sem necessidade de limpeza
--   sujo        → aguardando limpeza após checkout ou solicitação
--   limpando    → camareira em serviço no momento
--   conferencia → aguardando inspeção da supervisora
--   bloqueado   → fora de operação por decisão da gestão
--   manutencao  → em reparo técnico
-- ================================================================
CREATE TABLE IF NOT EXISTS apartments (

  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Hotel ao qual o apartamento pertence (obrigatório).
  -- ON DELETE CASCADE: se o hotel for excluído, seus aptos também são.
  hotel_id    UUID NOT NULL
              REFERENCES hotels(id) ON DELETE CASCADE,

  -- Número/código do apartamento (ex: "101", "204A")
  numero      TEXT NOT NULL,

  -- Andar onde o apartamento está localizado
  andar       INTEGER NOT NULL DEFAULT 1 CHECK (andar >= 1),

  -- Tipo de apartamento (Standard, Superior, Deluxe, Suíte etc.)
  tipo        TEXT NOT NULL DEFAULT 'Standard',

  -- Categoria especial (Regular, VIP, Família, Acessível etc.)
  categoria   TEXT NOT NULL DEFAULT 'Regular',

  -- Quantidade de leitos (camas) no apartamento
  leitos      INTEGER NOT NULL DEFAULT 2 CHECK (leitos >= 1 AND leitos <= 10),

  -- Status operacional atual do apartamento
  status      TEXT NOT NULL DEFAULT 'vago'
              CHECK (status IN ('vago','ocupado','sujo','limpando','pausado','conferencia','limpo','reprovado','bloqueado','manutencao','inspecao')),

  -- Indica se este apartamento deve ser priorizado na fila de limpeza
  prioridade  BOOLEAN NOT NULL DEFAULT FALSE,

  -- Camareira atualmente responsável pelo apartamento.
  -- ON DELETE SET NULL: se a camareira for removida, o campo fica NULL.
  maid_id     UUID
              REFERENCES maids(id) ON DELETE SET NULL
              DEFERRABLE INITIALLY DEFERRED, -- evita conflito circular com maids

  -- Observações livres (características especiais, preferências etc.)
  obs         TEXT,

  -- Apartamento ativo ou desativado (desativado não aparece no mapa)
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Restrição: número de apartamento único dentro do mesmo hotel
  UNIQUE (hotel_id, numero)

);

-- Trigger
CREATE OR REPLACE TRIGGER trg_apartments_updated_at
  BEFORE UPDATE ON apartments
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Índices
CREATE INDEX IF NOT EXISTS idx_apartments_hotel_id ON apartments (hotel_id);
CREATE INDEX IF NOT EXISTS idx_apartments_status   ON apartments (status);
CREATE INDEX IF NOT EXISTS idx_apartments_andar    ON apartments (hotel_id, andar);


-- ================================================================
-- TABELA: maids
-- Camareiras e membros da equipe de governança.
-- Cada membro pertence a um hotel.
-- Um membro pode ter um user_id (se tiver login no sistema)
-- ou não (se for apenas um registro operacional sem acesso).
-- ================================================================
CREATE TABLE IF NOT EXISTS maids (

  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Hotel ao qual a camareira pertence (obrigatório).
  hotel_id    UUID NOT NULL
              REFERENCES hotels(id) ON DELETE CASCADE,

  -- Nome completo
  nome        TEXT NOT NULL,

  -- Cargo dentro da equipe (ex: Camareira, Supervisora, Auxiliar)
  cargo       TEXT NOT NULL DEFAULT 'Camareira'
              CHECK (cargo IN ('Camareira','Supervisora','Auxiliar de Limpeza','Roupeiro(a)')),

  -- Andar de responsabilidade principal (NULL = todos os andares)
  andar_responsavel TEXT,

  -- Turno de trabalho
  turno       TEXT
              CHECK (turno IN ('Manhã (07:00–15:00)','Tarde (14:00–22:00)','Noite (22:00–07:00)')),

  -- Telefone para contato
  telefone    TEXT,

  -- E-mail (opcional, usado caso tenha acesso ao sistema)
  email       TEXT,

  -- Status do funcionário
  status      TEXT NOT NULL DEFAULT 'ativo'
              CHECK (status IN ('ativo','ferias','afastado','inativo')),

  -- Vínculo com usuário do sistema (opcional).
  -- Quando preenchido, este membro pode fazer login com o perfil "camareira".
  user_id     UUID
              REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

-- Trigger
CREATE OR REPLACE TRIGGER trg_maids_updated_at
  BEFORE UPDATE ON maids
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Agora que maids existe, adicionar a FK de apartments.maid_id corretamente
-- (a coluna já foi criada com DEFERRABLE acima; aqui apenas documentamos)
-- Se preferir adicionar depois: ALTER TABLE apartments ADD CONSTRAINT fk_apto_maid ...

-- Índices
CREATE INDEX IF NOT EXISTS idx_maids_hotel_id ON maids (hotel_id);
CREATE INDEX IF NOT EXISTS idx_maids_status   ON maids (status);
CREATE INDEX IF NOT EXISTS idx_maids_user_id  ON maids (user_id);


-- ================================================================
-- TABELA: work_orders  (Chamados de limpeza)
-- Registra solicitações de limpeza, manutenção ou atendimento
-- abertas pela recepção, hóspedes ou supervisão.
-- Cada chamado pertence a um hotel e, opcionalmente, a um apto
-- e a uma camareira responsável.
-- ================================================================
CREATE TABLE IF NOT EXISTS work_orders (

  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Hotel ao qual o chamado pertence
  hotel_id      UUID NOT NULL
                REFERENCES hotels(id) ON DELETE CASCADE,

  -- Apartamento relacionado ao chamado (pode ser NULL em casos gerais)
  apartment_id  UUID
                REFERENCES apartments(id) ON DELETE SET NULL,

  -- Camareira atribuída para atender o chamado
  maid_id       UUID
                REFERENCES maids(id) ON DELETE SET NULL,

  -- Tipo do chamado (descritivo livre ou padronizado)
  tipo          TEXT NOT NULL,

  -- Nível de prioridade
  prioridade    TEXT NOT NULL DEFAULT 'normal'
                CHECK (prioridade IN ('urgente','normal','baixa')),

  -- Status atual do chamado
  status        TEXT NOT NULL DEFAULT 'aberto'
                CHECK (status IN ('aberto','andamento','concluido','cancelado')),

  -- Quem solicitou (recepção, hóspede, supervisora, gerência)
  solicitante   TEXT,

  -- Nome do hóspede relacionado ao chamado (quando aplicável)
  hospede       TEXT,

  -- Descrição detalhada do chamado
  descricao     TEXT,

  -- Data/hora limite para conclusão
  prazo         TIMESTAMPTZ,

  -- Usuário que abriu o chamado
  criado_por    UUID
                REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

-- Trigger
CREATE OR REPLACE TRIGGER trg_work_orders_updated_at
  BEFORE UPDATE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Índices
CREATE INDEX IF NOT EXISTS idx_work_orders_hotel_id     ON work_orders (hotel_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_status       ON work_orders (status);
CREATE INDEX IF NOT EXISTS idx_work_orders_apartment_id ON work_orders (apartment_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_prioridade   ON work_orders (hotel_id, prioridade, status);


-- ================================================================
-- TABELA: apartment_status_history
-- Histórico completo de todas as mudanças de status de apartamentos.
-- Permite rastrear quem alterou, quando e de qual status para qual.
-- Importante para relatórios de produtividade e auditorias.
-- ================================================================
CREATE TABLE IF NOT EXISTS apartment_status_history (

  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Apartamento cujo status foi alterado
  apartment_id    UUID NOT NULL
                  REFERENCES apartments(id) ON DELETE CASCADE,

  -- Status anterior à mudança (NULL quando o apto foi recém-criado)
  status_anterior TEXT,

  -- Novo status aplicado
  status_novo     TEXT NOT NULL
                  CHECK (status_novo IN ('vago','ocupado','sujo','limpando','pausado','conferencia','limpo','reprovado','bloqueado','manutencao','inspecao')),

  -- Usuário que realizou a mudança
  alterado_por    UUID
                  REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Observação livre sobre o motivo da mudança
  obs             TEXT,

  -- Apenas created_at (histórico é imutável — não tem updated_at)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()

);

-- Índices
CREATE INDEX IF NOT EXISTS idx_status_history_apartment  ON apartment_status_history (apartment_id);
CREATE INDEX IF NOT EXISTS idx_status_history_created_at ON apartment_status_history (created_at DESC);


-- ================================================================
-- DADOS INICIAIS: admin global padrão
--
-- ATENÇÃO: Substitua o UUID abaixo pelo user_id real do usuário
-- criado em Supabase → Authentication → Add User.
--
-- Para descobrir o UUID após criar o usuário:
--   SELECT id FROM auth.users WHERE email = 'seu@email.com';
--
-- ================================================================
-- INSERT INTO user_profiles (user_id, nome, perfil, hotel_id, ativo)
-- VALUES (
--   'COLE_AQUI_O_UUID_DO_USUARIO',
--   'Administrador Global',
--   'admin_global',
--   NULL,   -- admin_global não tem hotel_id
--   TRUE
-- );


-- ================================================================
-- FIM DO SCHEMA
-- Execute em seguida: rls.sql
-- ================================================================
