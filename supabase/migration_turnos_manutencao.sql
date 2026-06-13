-- ================================================================
-- MIGRATION: turnos + departamento em chamados
-- Execute no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/fjohwpkjjxeqqxudzmhz/sql
-- ================================================================

-- 1. Tabela de turnos (9 períodos: 3 manhã, 3 tarde, 3 noite)
CREATE TABLE IF NOT EXISTS turnos (
  id         SERIAL PRIMARY KEY,
  periodo    TEXT NOT NULL CHECK (periodo IN ('manha','tarde','noite')),
  numero     INTEGER NOT NULL CHECK (numero BETWEEN 1 AND 3),
  label      TEXT NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim    TIME NOT NULL,
  hotel_id    UUID REFERENCES hotels(id) ON DELETE CASCADE,
  ativo       BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Índices únicos: global (hotel_id NULL) e por hotel
CREATE UNIQUE INDEX IF NOT EXISTS turnos_global_uniq
  ON turnos (periodo, numero) WHERE hotel_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS turnos_hotel_uniq
  ON turnos (periodo, numero, hotel_id) WHERE hotel_id IS NOT NULL;

-- Dados padrão globais
INSERT INTO turnos (periodo, numero, label, hora_inicio, hora_fim) VALUES
  ('manha', 1, 'Manhã 1', '06:00', '10:00'),
  ('manha', 2, 'Manhã 2', '08:00', '12:00'),
  ('manha', 3, 'Manhã 3', '10:00', '14:00'),
  ('tarde', 1, 'Tarde 1', '12:00', '16:00'),
  ('tarde', 2, 'Tarde 2', '14:00', '18:00'),
  ('tarde', 3, 'Tarde 3', '16:00', '20:00'),
  ('noite', 1, 'Noite 1', '18:00', '22:00'),
  ('noite', 2, 'Noite 2', '20:00', '00:00'),
  ('noite', 3, 'Noite 3', '22:00', '06:00')
ON CONFLICT DO NOTHING;

-- RLS turnos
ALTER TABLE turnos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "turnos_select"       ON turnos;
DROP POLICY IF EXISTS "turnos_admin_global" ON turnos;
DROP POLICY IF EXISTS "turnos_admin_hotel"  ON turnos;

CREATE POLICY "turnos_select" ON turnos
  FOR SELECT USING (true);

CREATE POLICY "turnos_admin_global" ON turnos
  FOR ALL USING (is_admin_global());

CREATE POLICY "turnos_admin_hotel" ON turnos
  FOR ALL USING (
    my_perfil() = 'admin_hotel'
    AND hotel_id = my_hotel_id()
  );

-- 2. work_orders: campo departamento + responsavel (manutenção)
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS departamento TEXT DEFAULT 'governanca'
    CHECK (departamento IN ('governanca','manutencao')),
  ADD COLUMN IF NOT EXISTS responsavel_user_id UUID REFERENCES auth.users(id);

-- 3. chamado_tipos: campo departamento (para filtrar tipos por área)
ALTER TABLE chamado_tipos
  ADD COLUMN IF NOT EXISTS departamento TEXT DEFAULT 'ambos'
    CHECK (departamento IN ('governanca','manutencao','ambos'));
