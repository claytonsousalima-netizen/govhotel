-- RLS policies for limpeza_sessoes
-- Table had RLS enabled but no policies, blocking all INSERT/SELECT

CREATE POLICY "limpeza_sessoes_insert"
ON limpeza_sessoes FOR INSERT
WITH CHECK (camareira_id = auth.uid());

CREATE POLICY "limpeza_sessoes_update"
ON limpeza_sessoes FOR UPDATE
USING (camareira_id = auth.uid());

CREATE POLICY "limpeza_sessoes_select"
ON limpeza_sessoes FOR SELECT
USING (
  hotel_id IN (
    SELECT hotel_id FROM user_profiles WHERE user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM user_profiles
    WHERE user_id = auth.uid() AND perfil = 'admin_global'
  )
);
