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
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id             UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  data_integracao      DATE NOT NULL,
  arquivo_nome         TEXT,
  modo                 TEXT DEFAULT 'geral',
  total_linhas         INTEGER DEFAULT 0,
  total_importadas     INTEGER DEFAULT 0,
  total_ignoradas      INTEGER DEFAULT 0,
  total_inconsistencias INTEGER DEFAULT 0,
  importado_por        UUID REFERENCES auth.users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hotel_id, data_integracao, modo)
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
--    Recebe o payload do frontend, salva linha a linha e atualiza
--    o status dos apartamentos conforme o modo selecionado.
-- ================================================================
CREATE OR REPLACE FUNCTION importar_integracao_xls_status_diario(
  p_hotel_id              UUID,
  p_data                  DATE,
  p_arquivo_nome          TEXT,
  p_payload               JSONB,
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
  _rec            JSONB;
  _apto_numero    TEXT;
  _apto_id        UUID;
  _apto_status    TEXT;
  _novo_status    TEXT;
  _novo_status_apto TEXT;
  _aptos_pausados TEXT[] := '{}';
  _total_atualizados INTEGER := 0;
  _ja_existe      BOOLEAN;
BEGIN
  -- Verifica permissão mínima
  IF my_perfil() NOT IN ('admin_global','admin_hotel','gestor') THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_permissao', 'mensagem', 'Sem permissão para integrar XLS.');
  END IF;

  -- Verifica se já existe importação para este hotel/data/modo
  SELECT EXISTS(
    SELECT 1 FROM integracao_xls_importacoes
    WHERE hotel_id = p_hotel_id
      AND data_integracao = p_data
      AND modo = p_modo
  ) INTO _ja_existe;

  IF _ja_existe AND NOT p_substituir THEN
    RETURN jsonb_build_object(
      'ok', false,
      'erro', 'ja_existe',
      'mensagem', 'Já existe uma integração (' || p_modo || ') para este hotel em ' || p_data::TEXT || '. Deseja substituir?'
    );
  END IF;

  -- Remove registros anteriores desta data/hotel se substituindo
  IF p_substituir THEN
    DELETE FROM integracao_xls_status_diario
    WHERE hotel_id = p_hotel_id AND data_integracao = p_data AND modo = p_modo;
    DELETE FROM integracao_xls_importacoes
    WHERE hotel_id = p_hotel_id AND data_integracao = p_data AND modo = p_modo;
  END IF;

  -- Grava cabeçalho da importação
  INSERT INTO integracao_xls_importacoes
    (hotel_id, data_integracao, arquivo_nome, modo,
     total_linhas, total_importadas, total_ignoradas, total_inconsistencias,
     importado_por)
  VALUES
    (p_hotel_id, p_data, p_arquivo_nome, p_modo,
     p_total_linhas, p_total_importadas, p_total_ignoradas, p_total_inconsistencias,
     auth.uid());

  -- Processa cada linha do payload
  FOR _rec IN SELECT * FROM jsonb_array_elements(p_payload)
  LOOP
    _apto_numero := _rec->>'apto';
    IF _apto_numero IS NULL OR _apto_numero = '' THEN CONTINUE; END IF;

    -- Busca o apto no sistema
    SELECT id, status INTO _apto_id, _apto_status
    FROM apartments
    WHERE hotel_id = p_hotel_id AND numero = _apto_numero AND ativo = TRUE
    LIMIT 1;

    IF _apto_id IS NULL THEN CONTINUE; END IF;

    -- Salva linha na tabela de integração
    INSERT INTO integracao_xls_status_diario
      (hotel_id, data_integracao, arquivo_nome, apto,
       status_apto, status_apto_original,
       status_governanca, status_governanca_original,
       adultos, criancas, data_partida, modo)
    VALUES
      (p_hotel_id, p_data, p_arquivo_nome, _apto_numero,
       _rec->>'status_apto',          _rec->>'status_apto_original',
       _rec->>'status_governanca',    _rec->>'status_governanca_original',
       COALESCE((_rec->>'adultos')::INTEGER, 0),
       COALESCE((_rec->>'criancas')::INTEGER, 0),
       NULLIF(_rec->>'data_partida','')::DATE,
       p_modo)
    ON CONFLICT (hotel_id, data_integracao, apto) DO UPDATE
      SET status_apto                = EXCLUDED.status_apto,
          status_apto_original       = EXCLUDED.status_apto_original,
          status_governanca          = EXCLUDED.status_governanca,
          status_governanca_original = EXCLUDED.status_governanca_original,
          adultos                    = EXCLUDED.adultos,
          criancas                   = EXCLUDED.criancas,
          data_partida               = EXCLUDED.data_partida,
          modo                       = EXCLUDED.modo;

    -- Preserva aptos em pausa
    IF _apto_status = 'pausado' THEN
      _aptos_pausados := array_append(_aptos_pausados, _apto_numero);
      -- Para pausado em modo status_apto: ainda atualiza ocupação
      IF p_modo = 'status_apto' THEN
        _novo_status_apto := CASE (_rec->>'status_apto')
          WHEN 'ocupado'    THEN 'Ocupado'
          WHEN 'nao_perturbe' THEN 'Ocupado'
          WHEN 'vago'       THEN 'Vago'
          WHEN 'bloqueado'  THEN 'Bloqueado'
          ELSE NULL
        END;
        IF _novo_status_apto IS NOT NULL THEN
          UPDATE apartments SET status_apto = _novo_status_apto, updated_at = NOW()
          WHERE id = _apto_id;
        END IF;
      END IF;
      CONTINUE;
    END IF;

    IF p_modo = 'geral' THEN
      -- ── Modo Geral: atualiza status (limpeza) + status_apto (ocupação) ──
      _novo_status := CASE
        WHEN (_rec->>'status_apto') = 'bloqueado' THEN 'bloqueado'
        WHEN (_rec->>'status_apto') = 'nao_perturbe' THEN 'ocupado'
        WHEN (_rec->>'status_apto') = 'ocupado' THEN
          CASE (_rec->>'status_governanca')
            WHEN 'limpo'       THEN 'ocupado'
            WHEN 'sujo'        THEN 'sujo'
            WHEN 'conferencia' THEN 'conferencia'
            WHEN 'inspecao'    THEN 'inspecao'
            WHEN 'manutencao'  THEN 'manutencao'
            WHEN 'nao_perturbe','nao_quis_arrumacao' THEN 'ocupado'
            ELSE 'ocupado'
          END
        WHEN (_rec->>'status_apto') = 'vago' THEN
          CASE (_rec->>'status_governanca')
            WHEN 'limpo'       THEN 'vago'
            WHEN 'sujo'        THEN 'sujo'
            WHEN 'conferencia' THEN 'conferencia'
            WHEN 'inspecao'    THEN 'inspecao'
            WHEN 'manutencao'  THEN 'manutencao'
            ELSE 'vago'
          END
        WHEN (_rec->>'status_governanca') IN ('reservado','site') THEN 'ocupado'
        WHEN (_rec->>'status_governanca') = 'manutencao' THEN 'manutencao'
        ELSE _apto_status
      END;

      _novo_status_apto := CASE (_rec->>'status_apto')
        WHEN 'ocupado'      THEN 'Ocupado'
        WHEN 'nao_perturbe' THEN 'Ocupado'
        WHEN 'vago'         THEN 'Vago'
        WHEN 'bloqueado'    THEN 'Bloqueado'
        ELSE NULL
      END;

      UPDATE apartments
        SET status     = _novo_status,
            status_apto = COALESCE(_novo_status_apto, status_apto),
            updated_at  = NOW()
      WHERE id = _apto_id;

      -- Grava histórico
      INSERT INTO apartment_status_history
        (apartment_id, status_anterior, status_novo, alterado_por, obs)
      VALUES
        (_apto_id, _apto_status, _novo_status, auth.uid(),
         'Integração XLS Geral — ' || p_arquivo_nome);

    ELSIF p_modo = 'status_apto' THEN
      -- ── Modo Status Apto: atualiza APENAS status_apto (ocupação) ──
      _novo_status_apto := CASE (_rec->>'status_apto')
        WHEN 'ocupado'      THEN 'Ocupado'
        WHEN 'nao_perturbe' THEN 'Ocupado'
        WHEN 'vago'         THEN 'Vago'
        WHEN 'bloqueado'    THEN 'Bloqueado'
        ELSE NULL
      END;

      IF _novo_status_apto IS NOT NULL THEN
        UPDATE apartments
          SET status_apto = _novo_status_apto,
              updated_at  = NOW()
        WHERE id = _apto_id;
      END IF;
    END IF;

    _total_atualizados := _total_atualizados + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',                    true,
    'total_aptos_atualizados', _total_atualizados,
    'aptos_pausados',        _aptos_pausados
  );
END;
$$;
