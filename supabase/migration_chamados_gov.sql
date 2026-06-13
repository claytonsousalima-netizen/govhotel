-- ================================================================
-- MIGRATION: Chamados da Governança — GOV-XXXXXX
-- ================================================================

-- 1. Sequência para numeração GOV
CREATE SEQUENCE IF NOT EXISTS chamado_gov_seq START 1;

-- 2. Função geradora de número
CREATE OR REPLACE FUNCTION fn_gerar_numero_chamado()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.departamento = 'governanca' AND (NEW.numero IS NULL OR NEW.numero = '') THEN
    NEW.numero := 'GOV-' || LPAD(nextval('chamado_gov_seq')::TEXT, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Trigger BEFORE INSERT
DROP TRIGGER IF EXISTS trg_gerar_numero_chamado ON work_orders;
CREATE TRIGGER trg_gerar_numero_chamado
  BEFORE INSERT ON work_orders
  FOR EACH ROW EXECUTE FUNCTION fn_gerar_numero_chamado();

-- 4. Novas colunas
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS numero TEXT,
  ADD COLUMN IF NOT EXISTS categoria TEXT;

-- 5. Index único (nullable-safe)
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_orders_numero
  ON work_orders (numero) WHERE numero IS NOT NULL;

-- 6. Expandir status CHECK
ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS work_orders_status_check;
ALTER TABLE work_orders ADD CONSTRAINT work_orders_status_check
  CHECK (status IN (
    'aberto','em_analise','andamento','pausado',
    'resolvido','reaberto','cancelado','concluido'
  ));

-- 7. Expandir prioridade CHECK
ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS work_orders_prioridade_check;
ALTER TABLE work_orders ADD CONSTRAINT work_orders_prioridade_check
  CHECK (prioridade IN ('baixa','normal','alta','urgente'));

-- 8. Tabela de histórico de chamados
CREATE TABLE IF NOT EXISTS chamado_historico (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chamado_id  UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  hotel_id    UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  tipo_evento TEXT NOT NULL CHECK (tipo_evento IN (
    'criacao','status','responsavel','comentario','conclusao','reabertura','cancelamento','prioridade'
  )),
  descricao   TEXT NOT NULL,
  usuario_id  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chamado_hist_chamado
  ON chamado_historico (chamado_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chamado_hist_hotel
  ON chamado_historico (hotel_id);

-- 9. RLS
ALTER TABLE chamado_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ch_admin_global"
  ON chamado_historico FOR ALL TO authenticated
  USING (is_admin_global()) WITH CHECK (is_admin_global());

CREATE POLICY "ch_select_hotel"
  ON chamado_historico FOR SELECT TO authenticated
  USING (hotel_id = my_hotel_id());

CREATE POLICY "ch_insert_hotel"
  ON chamado_historico FOR INSERT TO authenticated
  WITH CHECK (hotel_id = my_hotel_id());
