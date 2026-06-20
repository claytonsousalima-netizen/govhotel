-- ================================================================
-- CORREÇÃO: Inserir registro de início de pausa para aptos 304 e 312
-- Motivo: INSERT em apartment_status_history falhou silenciosamente
--         (constraint antiga não incluía 'pausado')
-- Data de início informada pelo gestor: 18/06/2026 às 17:10
-- ================================================================

-- Verificar antes de inserir: confirme que NÃO existem já estes registros
SELECT ash.id, a.numero, ash.status_anterior, ash.status_novo, ash.created_at
FROM apartment_status_history ash
JOIN apartments a ON a.id = ash.apartment_id
WHERE a.numero IN ('304', '312')
  AND ash.status_novo = 'pausado'
ORDER BY ash.created_at DESC;

-- ----------------------------------------------------------------
-- Se a query acima não retornar linhas para 304 e/ou 312, execute:
-- ----------------------------------------------------------------

INSERT INTO apartment_status_history
  (apartment_id, status_anterior, status_novo, alterado_por, obs, created_at)

-- Apto 304
SELECT
  a.id,
  'limpando',
  'pausado',
  -- Reutiliza o alterado_por da retomada (quem retomou o apto 304)
  (SELECT alterado_por FROM apartment_status_history
   WHERE apartment_id = a.id AND status_anterior = 'pausado'
   ORDER BY created_at ASC LIMIT 1),
  'Início de pausa inserido manualmente — registro original não gravado',
  '2026-06-18 17:10:00-03:00'
FROM apartments a
WHERE a.numero = '304'
LIMIT 1;

-- Apto 312
INSERT INTO apartment_status_history
  (apartment_id, status_anterior, status_novo, alterado_por, obs, created_at)
SELECT
  a.id,
  'limpando',
  'pausado',
  (SELECT alterado_por FROM apartment_status_history
   WHERE apartment_id = a.id AND status_anterior = 'pausado'
   ORDER BY created_at ASC LIMIT 1),
  'Início de pausa inserido manualmente — registro original não gravado',
  '2026-06-18 17:10:00-03:00'
FROM apartments a
WHERE a.numero = '312'
LIMIT 1;

-- ----------------------------------------------------------------
-- Verificar resultado após inserção:
-- ----------------------------------------------------------------
SELECT ash.id, a.numero, ash.status_anterior, ash.status_novo,
       ash.alterado_por, ash.created_at, ash.obs
FROM apartment_status_history ash
JOIN apartments a ON a.id = ash.apartment_id
WHERE a.numero IN ('304', '312')
ORDER BY a.numero, ash.created_at;
