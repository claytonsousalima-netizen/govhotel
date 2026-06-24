-- ================================================================
-- FIX: status 'vago' + 'inspecao' + qtd_pessoas/qtd_criancas
-- GovEstancorp — Execute no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/fjohwpkjjxeqqxudzmhz/sql
--
-- PROBLEMAS CORRIGIDOS:
--   1. apartments.status CHECK: adiciona 'vago' e 'inspecao', remove 'livre'
--   2. apartment_status_history.status_novo CHECK: mesma correção
--   3. limpeza_checklists: adiciona colunas qtd_pessoas e qtd_criancas
--   4. integracao_xls_status_diario: cria tabela se não existir
--   5. RPC importar_integracao_xls_status_diario: cria/atualiza função
-- ================================================================

-- ================================================================
-- 1. apartments.status — substitui 'livre' por 'vago', adiciona 'inspecao'
-- ================================================================
ALTER TABLE apartments
  DROP CONSTRAINT IF EXISTS apartments_status_check;

ALTER TABLE apartments
  ADD CONSTRAINT apartments_status_check
  CHECK (status IN (
    'vago', 'ocupado', 'sujo', 'limpando', 'pausado',
    'conferencia', 'limpo', 'reprovado', 'bloqueado', 'manutencao', 'inspecao'
  ));

-- ================================================================
-- 2. apartment_status_history.status_novo — mesma correção
-- ================================================================
ALTER TABLE apartment_status_history
  DROP CONSTRAINT IF EXISTS apartment_status_history_status_novo_check;

ALTER TABLE apartment_status_history
  ADD CONSTRAINT apartment_status_history_status_novo_check
  CHECK (status_novo IN (
    'vago', 'ocupado', 'sujo', 'limpando', 'pausado',
    'conferencia', 'limpo', 'reprovado', 'bloqueado', 'manutencao', 'inspecao'
  ));

-- ================================================================
-- 3. limpeza_checklists — adicionar qtd_pessoas e qtd_criancas
--    (usadas pela discrepância XLS vs limpeza)
-- ================================================================
ALTER TABLE limpeza_checklists
  ADD COLUMN IF NOT EXISTS qtd_pessoas  INTEGER,
  ADD COLUMN IF NOT EXISTS qtd_criancas INTEGER;

-- ================================================================
-- 4. integracao_xls_status_diario — criar tabela se não existir
--    Armazena cada linha da planilha XLS integrada por dia/hotel
-- ================================================================
CREATE TABLE IF NOT EXISTS integracao_xls_status_diario (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id                    UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  data_integracao             DATE NOT NULL,
  arquivo_nome                TEXT,
  apto                        TEXT NOT NULL,

  -- Col G do XLS → ocupação (Vago/Ocupado/Bloqueado)
  status_apto                 TEXT,
  status_apto_original        TEXT,

  -- Col D do XLS → limpeza/governança (Limpo/Sujo/Arrumação/...)
  status_governanca           TEXT,
  status_governanca_original  TEXT,

  adultos                     INTEGER DEFAULT 0,
  criancas                    INTEGER DEFAULT 0,
  data_partida                DATE,

  -- Modo de integração usado: 'geral' | 'status_apto'
  modo                        TEXT DEFAULT 'geral',

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (hotel_id, data_integracao, apto)
);

CREATE INDEX IF NOT EXISTS idx_xls_hotel_data ON integracao_xls_status_diario (hotel_id, data_integracao);
CREATE INDEX IF NOT EXISTS idx_xls_apto       ON integracao_xls_status_diario (hotel_id, apto);

ALTER TABLE integracao_xls_status_diario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "xls_admin_global"  ON integracao_xls_status_diario;
DROP POLICY IF EXISTS "xls_select_hotel"  ON integracao_xls_status_diario;
DROP POLICY IF EXISTS "xls_insert_hotel"  ON integracao_xls_status_diario;
DROP POLICY IF EXISTS "xls_update_hotel"  ON integracao_xls_status_diario;
DROP POLICY IF EXISTS "xls_delete_hotel"  ON integracao_xls_status_diario;

CREATE POLICY "xls_admin_global"
  ON integracao_xls_status_diario FOR ALL TO authenticated
  USING (is_admin_global()) WITH CHECK (is_admin_global());

CREATE POLICY "xls_select_hotel"
  ON integracao_xls_status_diario FOR SELECT TO authenticated
  USING (hotel_id = my_hotel_id());

CREATE POLICY "xls_insert_hotel"
  ON integracao_xls_status_diario FOR INSERT TO authenticated
  WITH CHECK (hotel_id = my_hotel_id()
    AND my_perfil() IN ('admin_global','admin_hotel','gestor'));

CREATE POLICY "xls_update_hotel"
  ON integracao_xls_status_diario FOR UPDATE TO authenticated
  USING (hotel_id = my_hotel_id()
    AND my_perfil() IN ('admin_global','admin_hotel','gestor'))
  WITH CHECK (hotel_id = my_hotel_id());

CREATE POLICY "xls_delete_hotel"
  ON integracao_xls_status_diario FOR DELETE TO authenticated
  USING (hotel_id = my_hotel_id()
    AND my_perfil() IN ('admin_global','admin_hotel','gestor'));

-- ================================================================
-- 5. Meta-tabela de importações (cabeçalho de cada importação)
-- ================================================================
CREATE TABLE IF NOT EXISTS integracao_xls_importacoes (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id              UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  data_integracao       DATE NOT NULL,
  arquivo_nome          TEXT,
  total_linhas          INTEGER DEFAULT 0,
  total_importadas      INTEGER DEFAULT 0,
  total_ignoradas       INTEGER DEFAULT 0,
  total_inconsistencias INTEGER DEFAULT 0,
  created_by            UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE integracao_xls_importacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "xlsimp_admin_global"  ON integracao_xls_importacoes;
DROP POLICY IF EXISTS "xlsimp_select_hotel"  ON integracao_xls_importacoes;
DROP POLICY IF EXISTS "xlsimp_insert_hotel"  ON integracao_xls_importacoes;

CREATE POLICY "xlsimp_admin_global"
  ON integracao_xls_importacoes FOR ALL TO authenticated
  USING (is_admin_global()) WITH CHECK (is_admin_global());

CREATE POLICY "xlsimp_select_hotel"
  ON integracao_xls_importacoes FOR SELECT TO authenticated
  USING (hotel_id = my_hotel_id());

CREATE POLICY "xlsimp_insert_hotel"
  ON integracao_xls_importacoes FOR INSERT TO authenticated
  WITH CHECK (hotel_id = my_hotel_id()
    AND my_perfil() IN ('admin_global','admin_hotel','gestor'));

-- ================================================================
-- 6. RPC: importar_integracao_xls_status_diario
--    Recebe o payload do frontend (bulk jsonb), salva na tabela
--    de integração e atualiza o status dos apartamentos conforme
--    o modo selecionado ('geral' ou 'status_apto').
--
--    NOTA: assinatura corrigida — p_payload vem ANTES de p_arquivo_nome.
-- ================================================================
CREATE OR REPLACE FUNCTION importar_integracao_xls_status_diario(
  p_hotel_id              UUID,
  p_data                  DATE,
  p_payload               JSONB,
  p_arquivo_nome          TEXT,
  p_total_linhas          INTEGER DEFAULT 0,
  p_total_importadas      INTEGER DEFAULT 0,
  p_total_ignoradas       INTEGER DEFAULT 0,
  p_total_inconsistencias INTEGER DEFAULT 0,
  p_substituir            BOOLEAN DEFAULT FALSE,
  p_modo                  TEXT    DEFAULT 'geral'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_hotel_id uuid;
  v_caller_perfil   text;
  v_existente       integer;
  v_importacao_id   uuid;
  v_total_aptos     integer := 0;
  v_aptos_pausados  text[]  := '{}';
BEGIN
  SELECT hotel_id, perfil INTO v_caller_hotel_id, v_caller_perfil
  FROM user_profiles WHERE user_id = auth.uid();

  IF v_caller_perfil <> 'admin_global' AND v_caller_hotel_id IS DISTINCT FROM p_hotel_id THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'acesso_negado',
      'mensagem', 'Hotel nao corresponde ao usuario autenticado.');
  END IF;

  SELECT COUNT(*) INTO v_existente
  FROM integracao_xls_status_diario
  WHERE hotel_id = p_hotel_id AND data_integracao = p_data;

  IF v_existente > 0 AND NOT p_substituir THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'ja_existe',
      'mensagem', format('Ja existe uma integracao para %s com %s registros. Deseja substituir?', p_data, v_existente),
      'total_existente', v_existente);
  END IF;

  IF v_existente > 0 AND p_substituir THEN
    DELETE FROM integracao_xls_status_diario
    WHERE hotel_id = p_hotel_id AND data_integracao = p_data;
  END IF;

  INSERT INTO integracao_xls_status_diario
    (hotel_id, data_integracao, apto,
     status_apto, status_apto_original,
     status_governanca, status_governanca_original,
     adultos, criancas, data_partida, arquivo_nome, created_by, modo)
  SELECT
    p_hotel_id, p_data, (r->>'apto')::text,
    (r->>'status_apto')::text,       (r->>'status_apto_original')::text,
    (r->>'status_governanca')::text, (r->>'status_governanca_original')::text,
    COALESCE((r->>'adultos')::integer, 0),
    COALESCE((r->>'criancas')::integer, 0),
    NULLIF(r->>'data_partida', '')::date,
    p_arquivo_nome, auth.uid(), p_modo
  FROM jsonb_array_elements(p_payload) AS r
  ON CONFLICT ON CONSTRAINT uq_integracao_xls_hotel_data_apto DO UPDATE SET
    status_apto                = EXCLUDED.status_apto,
    status_apto_original       = EXCLUDED.status_apto_original,
    status_governanca          = EXCLUDED.status_governanca,
    status_governanca_original = EXCLUDED.status_governanca_original,
    adultos                    = EXCLUDED.adultos,
    criancas                   = EXCLUDED.criancas,
    data_partida               = EXCLUDED.data_partida,
    arquivo_nome               = EXCLUDED.arquivo_nome,
    created_by                 = EXCLUDED.created_by,
    modo                       = EXCLUDED.modo;

  SELECT array_agg(a.numero ORDER BY a.numero) INTO v_aptos_pausados
  FROM integracao_xls_status_diario ix
  JOIN apartments a ON a.hotel_id = p_hotel_id AND a.numero = ix.apto
  WHERE ix.hotel_id = p_hotel_id AND ix.data_integracao = p_data
    AND a.ativo = true AND a.status = 'pausado';

  IF p_modo = 'status_apto' THEN
    INSERT INTO apartment_status_history
      (apartment_id, status_anterior, status_novo, alterado_por, obs)
    SELECT a.id, a.status,
      CASE
        WHEN a.status = 'pausado'                                                                  THEN 'pausado'
        WHEN ix.status_apto = 'bloqueado'                                                          THEN 'bloqueado'
        WHEN ix.status_apto IN ('ocupado','nao_perturbe') AND a.status IN ('vago','sujo','limpo')  THEN 'ocupado'
        WHEN ix.status_apto = 'vago' AND a.status = 'ocupado'                                     THEN 'sujo'
        ELSE a.status
      END,
      auth.uid(), 'Integracao XLS (Status Apto) - ' || p_arquivo_nome
    FROM integracao_xls_status_diario ix
    JOIN apartments a ON a.hotel_id = p_hotel_id AND a.numero = ix.apto
    WHERE ix.hotel_id = p_hotel_id AND ix.data_integracao = p_data
      AND a.ativo = true AND a.status <> 'pausado'
      AND (
        (ix.status_apto = 'bloqueado')
        OR (ix.status_apto IN ('ocupado','nao_perturbe') AND a.status IN ('vago','sujo','limpo'))
        OR (ix.status_apto = 'vago' AND a.status = 'ocupado')
      );

    UPDATE apartments a SET
      status = CASE
        WHEN a.status = 'pausado'                                                                  THEN 'pausado'
        WHEN ix.status_apto = 'bloqueado'                                                          THEN 'bloqueado'
        WHEN ix.status_apto IN ('ocupado','nao_perturbe') AND a.status IN ('vago','sujo','limpo')  THEN 'ocupado'
        WHEN ix.status_apto = 'vago' AND a.status = 'ocupado'                                     THEN 'sujo'
        ELSE a.status
      END,
      status_apto = CASE ix.status_apto
        WHEN 'vago'               THEN 'Vago'
        WHEN 'ocupado'            THEN 'Ocupado'
        WHEN 'bloqueado'          THEN 'Bloqueado'
        WHEN 'nao_perturbe'       THEN 'Ocupado'
        WHEN 'nao_quis_arrumacao' THEN 'Ocupado'
        ELSE a.status_apto
      END,
      updated_at = now()
    FROM integracao_xls_status_diario ix
    WHERE ix.hotel_id = p_hotel_id AND ix.data_integracao = p_data
      AND a.hotel_id = p_hotel_id AND a.numero = ix.apto AND a.ativo = true;

  ELSE
    INSERT INTO apartment_status_history
      (apartment_id, status_anterior, status_novo, alterado_por, obs)
    SELECT a.id, a.status,
      CASE
        WHEN ix.status_apto = 'bloqueado'                                                     THEN 'bloqueado'
        WHEN ix.status_apto = 'nao_perturbe'                                                  THEN 'ocupado'
        WHEN ix.status_apto = 'ocupado' AND ix.status_governanca = 'limpo'                    THEN 'ocupado'
        WHEN ix.status_apto = 'ocupado' AND ix.status_governanca = 'sujo'                     THEN 'sujo'
        WHEN ix.status_apto = 'ocupado' AND ix.status_governanca = 'conferencia'              THEN 'conferencia'
        WHEN ix.status_apto = 'ocupado' AND ix.status_governanca = 'inspecao'                 THEN 'inspecao'
        WHEN ix.status_apto = 'ocupado' AND ix.status_governanca = 'manutencao'               THEN 'manutencao'
        WHEN ix.status_apto = 'ocupado' AND ix.status_governanca IN ('nao_perturbe','nao_quis_arrumacao') THEN 'ocupado'
        WHEN ix.status_apto = 'vago'    AND ix.status_governanca = 'limpo'                    THEN 'vago'
        WHEN ix.status_apto = 'vago'    AND ix.status_governanca = 'sujo'                     THEN 'sujo'
        WHEN ix.status_apto = 'vago'    AND ix.status_governanca = 'conferencia'              THEN 'conferencia'
        WHEN ix.status_apto = 'vago'    AND ix.status_governanca = 'inspecao'                 THEN 'inspecao'
        WHEN ix.status_apto = 'vago'    AND ix.status_governanca = 'manutencao'               THEN 'manutencao'
        WHEN ix.status_governanca = 'reservado'                                                THEN 'ocupado'
        WHEN ix.status_governanca = 'site'                                                     THEN 'ocupado'
        WHEN ix.status_governanca = 'manutencao'                                               THEN 'manutencao'
        ELSE a.status
      END,
      auth.uid(), 'Integracao XLS - ' || p_arquivo_nome
    FROM integracao_xls_status_diario ix
    JOIN apartments a ON a.hotel_id = p_hotel_id AND a.numero = ix.apto
    WHERE ix.hotel_id = p_hotel_id AND ix.data_integracao = p_data
      AND a.ativo = true AND a.status <> 'pausado';

    UPDATE apartments a SET
      status = CASE
        WHEN a.status = 'pausado'                                                             THEN 'pausado'
        WHEN ix.status_apto = 'bloqueado'                                                     THEN 'bloqueado'
        WHEN ix.status_apto = 'nao_perturbe'                                                  THEN 'ocupado'
        WHEN ix.status_apto = 'ocupado' AND ix.status_governanca = 'limpo'                    THEN 'ocupado'
        WHEN ix.status_apto = 'ocupado' AND ix.status_governanca = 'sujo'                     THEN 'sujo'
        WHEN ix.status_apto = 'ocupado' AND ix.status_governanca = 'conferencia'              THEN 'conferencia'
        WHEN ix.status_apto = 'ocupado' AND ix.status_governanca = 'inspecao'                 THEN 'inspecao'
        WHEN ix.status_apto = 'ocupado' AND ix.status_governanca = 'manutencao'               THEN 'manutencao'
        WHEN ix.status_apto = 'ocupado' AND ix.status_governanca IN ('nao_perturbe','nao_quis_arrumacao') THEN 'ocupado'
        WHEN ix.status_apto = 'vago'    AND ix.status_governanca = 'limpo'                    THEN 'vago'
        WHEN ix.status_apto = 'vago'    AND ix.status_governanca = 'sujo'                     THEN 'sujo'
        WHEN ix.status_apto = 'vago'    AND ix.status_governanca = 'conferencia'              THEN 'conferencia'
        WHEN ix.status_apto = 'vago'    AND ix.status_governanca = 'inspecao'                 THEN 'inspecao'
        WHEN ix.status_apto = 'vago'    AND ix.status_governanca = 'manutencao'               THEN 'manutencao'
        WHEN ix.status_governanca = 'reservado'                                                THEN 'ocupado'
        WHEN ix.status_governanca = 'site'                                                     THEN 'ocupado'
        WHEN ix.status_governanca = 'manutencao'                                               THEN 'manutencao'
        ELSE a.status
      END,
      status_apto = CASE ix.status_apto
        WHEN 'vago'               THEN 'Vago'
        WHEN 'ocupado'            THEN 'Ocupado'
        WHEN 'bloqueado'          THEN 'Bloqueado'
        WHEN 'nao_perturbe'       THEN 'Ocupado'
        WHEN 'nao_quis_arrumacao' THEN 'Ocupado'
        ELSE a.status_apto
      END,
      status_governanca_manual = CASE
        WHEN a.status = 'pausado'                        THEN a.status_governanca_manual
        WHEN ix.status_governanca = 'limpo'              THEN 'Limpo'
        WHEN ix.status_governanca = 'sujo'               THEN 'Sujo'
        WHEN ix.status_governanca = 'conferencia'        THEN 'Arrumacao'
        WHEN ix.status_governanca = 'inspecao'           THEN 'Inspecao'
        WHEN ix.status_governanca = 'manutencao'         THEN 'Manutencao'
        WHEN ix.status_governanca = 'nao_perturbe'       THEN 'Nao Perturbe'
        WHEN ix.status_governanca = 'nao_quis_arrumacao' THEN 'Nao Quis Arrumacao'
        WHEN ix.status_governanca = 'reservado'          THEN 'Reservado'
        WHEN ix.status_governanca = 'site'               THEN 'Site'
        ELSE a.status_governanca_manual
      END,
      updated_at = now()
    FROM integracao_xls_status_diario ix
    WHERE ix.hotel_id = p_hotel_id AND ix.data_integracao = p_data
      AND a.hotel_id = p_hotel_id AND a.numero = ix.apto AND a.ativo = true;

  END IF;

  GET DIAGNOSTICS v_total_aptos = ROW_COUNT;

  INSERT INTO integracao_xls_importacoes
    (hotel_id, data_integracao, arquivo_nome,
     total_linhas, total_importadas, total_ignoradas, total_inconsistencias,
     created_by)
  VALUES
    (p_hotel_id, p_data, p_arquivo_nome,
     p_total_linhas, p_total_importadas, p_total_ignoradas, p_total_inconsistencias,
     auth.uid())
  RETURNING id INTO v_importacao_id;

  RETURN jsonb_build_object(
    'ok',                      true,
    'importacao_id',           v_importacao_id,
    'total_inseridos',         p_total_importadas,
    'total_aptos_atualizados', v_total_aptos,
    'substituiu',              (v_existente > 0 AND p_substituir),
    'modo',                    p_modo,
    'aptos_pausados',          COALESCE(to_jsonb(v_aptos_pausados), '[]'::jsonb)
  );
END;
$$;
