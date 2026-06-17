-- ================================================================
-- DIAGNÓSTICO E CORREÇÃO DOS RELATÓRIOS
-- Execute no Supabase → SQL Editor
-- https://supabase.com/dashboard/project/fjohwpkjjxeqqxudzmhz/sql
-- ================================================================

-- 1. VERIFICAR CHECK CONSTRAINTS (precisam incluir 'limpo','pausado','reprovado')
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid IN (
  'apartments'::regclass,
  'apartment_status_history'::regclass
)
AND contype = 'c';

-- ----------------------------------------------------------------
-- RESULTADO ESPERADO em apartment_status_history:
--   status_novo IN ('livre','ocupado','sujo','limpando','pausado',
--                   'conferencia','limpo','reprovado','bloqueado','manutencao')
-- Se estiver faltando 'limpo','pausado','reprovado' → execute o bloco abaixo
-- ----------------------------------------------------------------

-- 2. CORRIGIR CONSTRAINTS (execute SOMENTE se o resultado acima estiver incompleto)
/*
ALTER TABLE apartment_status_history
  DROP CONSTRAINT IF EXISTS apartment_status_history_status_novo_check;
ALTER TABLE apartment_status_history
  ADD CONSTRAINT apartment_status_history_status_novo_check
  CHECK (status_novo IN (
    'livre','ocupado','sujo','limpando','pausado',
    'conferencia','limpo','reprovado','bloqueado','manutencao'
  ));

ALTER TABLE apartments
  DROP CONSTRAINT IF EXISTS apartments_status_check;
ALTER TABLE apartments
  ADD CONSTRAINT apartments_status_check
  CHECK (status IN (
    'livre','ocupado','sujo','limpando','pausado',
    'conferencia','limpo','reprovado','bloqueado','manutencao'
  ));
*/

-- 3. CONTAR REGISTROS NAS TABELAS CRÍTICAS
SELECT
  'apartment_status_history'     AS tabela, COUNT(*) AS total FROM apartment_status_history
UNION ALL SELECT
  'limpeza_checklists',                      COUNT(*) FROM limpeza_checklists
UNION ALL SELECT
  'conferencia_supervisora_checklists',      COUNT(*) FROM conferencia_supervisora_checklists
UNION ALL SELECT
  'pendencias_retrabalho',                   COUNT(*) FROM pendencias_retrabalho;

-- 4. VER ÚLTIMOS 20 REGISTROS DO HISTÓRICO DE STATUS
SELECT apartment_id, status_anterior, status_novo, alterado_por, created_at
FROM apartment_status_history
ORDER BY created_at DESC
LIMIT 20;

-- 5. VERIFICAR SE HÁ SESSÕES DE LIMPEZA COMPLETAS (limpando → outro status)
-- Uma sessão completa precisa de evento 'limpando' seguido de outro status
WITH eventos AS (
  SELECT
    apartment_id,
    status_novo,
    created_at,
    LAG(status_novo) OVER (PARTITION BY apartment_id ORDER BY created_at) AS status_anterior_calc
  FROM apartment_status_history
)
SELECT
  COUNT(*) FILTER (WHERE status_novo = 'limpando')                   AS inicio_limpeza,
  COUNT(*) FILTER (WHERE status_anterior_calc = 'limpando'
                     AND status_novo NOT IN ('limpando','pausado'))  AS fim_limpeza,
  COUNT(*) FILTER (WHERE status_novo = 'conferencia')                AS entrou_conferencia,
  COUNT(*) FILTER (WHERE status_novo = 'limpo')                      AS aprovados,
  COUNT(*) FILTER (WHERE status_novo = 'reprovado')                  AS reprovados
FROM eventos;

-- 6. VERIFICAR CONFERENCIA_SUPERVISORA_CHECKLISTS (existe e tem dados?)
SELECT id, apartment_id, resultado, usuario_id, created_at
FROM conferencia_supervisora_checklists
ORDER BY created_at DESC
LIMIT 10;

-- 7. SE A TABELA conferencia_supervisora_checklists NÃO EXISTIR, crie:
-- (execute só se o SELECT acima retornar erro "relation does not exist")
/*
CREATE TABLE IF NOT EXISTS conferencia_supervisora_checklists (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  apartment_id UUID NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  hotel_id     UUID NOT NULL REFERENCES hotels(id)    ON DELETE CASCADE,
  usuario_id   UUID NOT NULL REFERENCES auth.users(id),
  respostas    JSONB NOT NULL DEFAULT '{}',
  obs          TEXT,
  resultado    TEXT NOT NULL DEFAULT 'aprovar'
               CHECK (resultado IN ('aprovar','reprovar')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE conferencia_supervisora_checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conf_sup_admin_global" ON conferencia_supervisora_checklists FOR ALL TO authenticated USING (is_admin_global()) WITH CHECK (is_admin_global());
CREATE POLICY "conf_sup_select_hotel" ON conferencia_supervisora_checklists FOR SELECT TO authenticated USING (hotel_id = my_hotel_id());
CREATE POLICY "conf_sup_insert_hotel" ON conferencia_supervisora_checklists FOR INSERT TO authenticated WITH CHECK (hotel_id = my_hotel_id());
*/
