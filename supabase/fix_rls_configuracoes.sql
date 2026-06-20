-- ================================================================
-- FIX RLS COMPLETO — tela Configurações
-- Todas as tabelas que precisam de INSERT/UPDATE/DELETE
-- ================================================================

-- ── 1. apto_tipos ─────────────────────────────────────────────
ALTER TABLE apto_tipos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "apto_tipos_select"        ON apto_tipos;
DROP POLICY IF EXISTS "apto_tipos_admin_global"  ON apto_tipos;
DROP POLICY IF EXISTS "apto_tipos_admin_hotel"   ON apto_tipos;
DROP POLICY IF EXISTS "apto_tipos_insert_hotel"  ON apto_tipos;
DROP POLICY IF EXISTS "apto_tipos_update_hotel"  ON apto_tipos;
DROP POLICY IF EXISTS "apto_tipos_delete_hotel"  ON apto_tipos;
CREATE POLICY "apto_tipos_select"       ON apto_tipos FOR SELECT TO authenticated USING (true);
CREATE POLICY "apto_tipos_admin_global" ON apto_tipos FOR ALL    TO authenticated USING (is_admin_global()) WITH CHECK (is_admin_global());
CREATE POLICY "apto_tipos_insert_hotel" ON apto_tipos FOR INSERT TO authenticated WITH CHECK (hotel_id = my_hotel_id());
CREATE POLICY "apto_tipos_update_hotel" ON apto_tipos FOR UPDATE TO authenticated USING (hotel_id = my_hotel_id()) WITH CHECK (hotel_id = my_hotel_id());
CREATE POLICY "apto_tipos_delete_hotel" ON apto_tipos FOR DELETE TO authenticated USING (hotel_id = my_hotel_id());

-- ── 2. apto_categorias ────────────────────────────────────────
ALTER TABLE apto_categorias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "apto_cat_select"        ON apto_categorias;
DROP POLICY IF EXISTS "apto_cat_admin_global"  ON apto_categorias;
DROP POLICY IF EXISTS "apto_cat_admin_hotel"   ON apto_categorias;
DROP POLICY IF EXISTS "apto_cat_insert_hotel"  ON apto_categorias;
DROP POLICY IF EXISTS "apto_cat_update_hotel"  ON apto_categorias;
DROP POLICY IF EXISTS "apto_cat_delete_hotel"  ON apto_categorias;
CREATE POLICY "apto_cat_select"       ON apto_categorias FOR SELECT TO authenticated USING (true);
CREATE POLICY "apto_cat_admin_global" ON apto_categorias FOR ALL    TO authenticated USING (is_admin_global()) WITH CHECK (is_admin_global());
CREATE POLICY "apto_cat_insert_hotel" ON apto_categorias FOR INSERT TO authenticated WITH CHECK (hotel_id = my_hotel_id());
CREATE POLICY "apto_cat_update_hotel" ON apto_categorias FOR UPDATE TO authenticated USING (hotel_id = my_hotel_id()) WITH CHECK (hotel_id = my_hotel_id());
CREATE POLICY "apto_cat_delete_hotel" ON apto_categorias FOR DELETE TO authenticated USING (hotel_id = my_hotel_id());

-- ── 3. tipos_limpeza ──────────────────────────────────────────
ALTER TABLE tipos_limpeza ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tipos_limpeza_select"        ON tipos_limpeza;
DROP POLICY IF EXISTS "tipos_limpeza_admin_global"  ON tipos_limpeza;
DROP POLICY IF EXISTS "tipos_limpeza_admin_hotel"   ON tipos_limpeza;
DROP POLICY IF EXISTS "tipos_limpeza_insert_hotel"  ON tipos_limpeza;
DROP POLICY IF EXISTS "tipos_limpeza_update_hotel"  ON tipos_limpeza;
DROP POLICY IF EXISTS "tipos_limpeza_delete_hotel"  ON tipos_limpeza;
CREATE POLICY "tipos_limpeza_select"       ON tipos_limpeza FOR SELECT TO authenticated USING (true);
CREATE POLICY "tipos_limpeza_admin_global" ON tipos_limpeza FOR ALL    TO authenticated USING (is_admin_global()) WITH CHECK (is_admin_global());
CREATE POLICY "tipos_limpeza_insert_hotel" ON tipos_limpeza FOR INSERT TO authenticated WITH CHECK (hotel_id = my_hotel_id());
CREATE POLICY "tipos_limpeza_update_hotel" ON tipos_limpeza FOR UPDATE TO authenticated USING (hotel_id = my_hotel_id()) WITH CHECK (hotel_id = my_hotel_id());
CREATE POLICY "tipos_limpeza_delete_hotel" ON tipos_limpeza FOR DELETE TO authenticated USING (hotel_id = my_hotel_id());

-- ── 4. chamado_tipos ──────────────────────────────────────────
ALTER TABLE chamado_tipos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "chamado_tipos_select"        ON chamado_tipos;
DROP POLICY IF EXISTS "chamado_tipos_admin_global"  ON chamado_tipos;
DROP POLICY IF EXISTS "chamado_tipos_admin_hotel"   ON chamado_tipos;
DROP POLICY IF EXISTS "chamado_tipos_insert_hotel"  ON chamado_tipos;
DROP POLICY IF EXISTS "chamado_tipos_update_hotel"  ON chamado_tipos;
DROP POLICY IF EXISTS "chamado_tipos_delete_hotel"  ON chamado_tipos;
CREATE POLICY "chamado_tipos_select"       ON chamado_tipos FOR SELECT TO authenticated USING (true);
CREATE POLICY "chamado_tipos_admin_global" ON chamado_tipos FOR ALL    TO authenticated USING (is_admin_global()) WITH CHECK (is_admin_global());
CREATE POLICY "chamado_tipos_insert_hotel" ON chamado_tipos FOR INSERT TO authenticated WITH CHECK (hotel_id = my_hotel_id());
CREATE POLICY "chamado_tipos_update_hotel" ON chamado_tipos FOR UPDATE TO authenticated USING (hotel_id = my_hotel_id()) WITH CHECK (hotel_id = my_hotel_id());
CREATE POLICY "chamado_tipos_delete_hotel" ON chamado_tipos FOR DELETE TO authenticated USING (hotel_id = my_hotel_id());

-- ── 5. checklist_templates ────────────────────────────────────
ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "checklist_tpl_select"        ON checklist_templates;
DROP POLICY IF EXISTS "checklist_tpl_admin_global"  ON checklist_templates;
DROP POLICY IF EXISTS "checklist_tpl_admin_hotel"   ON checklist_templates;
DROP POLICY IF EXISTS "checklist_tpl_insert_hotel"  ON checklist_templates;
DROP POLICY IF EXISTS "checklist_tpl_update_hotel"  ON checklist_templates;
DROP POLICY IF EXISTS "checklist_tpl_delete_hotel"  ON checklist_templates;
CREATE POLICY "checklist_tpl_select"       ON checklist_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "checklist_tpl_admin_global" ON checklist_templates FOR ALL    TO authenticated USING (is_admin_global()) WITH CHECK (is_admin_global());
CREATE POLICY "checklist_tpl_insert_hotel" ON checklist_templates FOR INSERT TO authenticated WITH CHECK (hotel_id = my_hotel_id());
CREATE POLICY "checklist_tpl_update_hotel" ON checklist_templates FOR UPDATE TO authenticated USING (hotel_id = my_hotel_id()) WITH CHECK (hotel_id = my_hotel_id());
CREATE POLICY "checklist_tpl_delete_hotel" ON checklist_templates FOR DELETE TO authenticated USING (hotel_id = my_hotel_id());

-- ── 6. solicitantes ───────────────────────────────────────────
ALTER TABLE solicitantes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "solicitantes_select"        ON solicitantes;
DROP POLICY IF EXISTS "solicitantes_admin_global"  ON solicitantes;
DROP POLICY IF EXISTS "solicitantes_admin_hotel"   ON solicitantes;
DROP POLICY IF EXISTS "solicitantes_insert_hotel"  ON solicitantes;
DROP POLICY IF EXISTS "solicitantes_update_hotel"  ON solicitantes;
DROP POLICY IF EXISTS "solicitantes_delete_hotel"  ON solicitantes;
CREATE POLICY "solicitantes_select"       ON solicitantes FOR SELECT TO authenticated USING (true);
CREATE POLICY "solicitantes_admin_global" ON solicitantes FOR ALL    TO authenticated USING (is_admin_global()) WITH CHECK (is_admin_global());
CREATE POLICY "solicitantes_insert_hotel" ON solicitantes FOR INSERT TO authenticated WITH CHECK (hotel_id = my_hotel_id());
CREATE POLICY "solicitantes_update_hotel" ON solicitantes FOR UPDATE TO authenticated USING (hotel_id = my_hotel_id()) WITH CHECK (hotel_id = my_hotel_id());
CREATE POLICY "solicitantes_delete_hotel" ON solicitantes FOR DELETE TO authenticated USING (hotel_id = my_hotel_id());

-- ── 7. motivos_reprovacao ─────────────────────────────────────
ALTER TABLE motivos_reprovacao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "motivos_reprov_select"        ON motivos_reprovacao;
DROP POLICY IF EXISTS "motivos_reprov_admin_global"  ON motivos_reprovacao;
DROP POLICY IF EXISTS "motivos_reprov_admin_hotel"   ON motivos_reprovacao;
DROP POLICY IF EXISTS "motivos_reprov_insert_hotel"  ON motivos_reprovacao;
DROP POLICY IF EXISTS "motivos_reprov_update_hotel"  ON motivos_reprovacao;
DROP POLICY IF EXISTS "motivos_reprov_delete_hotel"  ON motivos_reprovacao;
CREATE POLICY "motivos_reprov_select"       ON motivos_reprovacao FOR SELECT TO authenticated USING (true);
CREATE POLICY "motivos_reprov_admin_global" ON motivos_reprovacao FOR ALL    TO authenticated USING (is_admin_global()) WITH CHECK (is_admin_global());
CREATE POLICY "motivos_reprov_insert_hotel" ON motivos_reprovacao FOR INSERT TO authenticated WITH CHECK (hotel_id = my_hotel_id());
CREATE POLICY "motivos_reprov_update_hotel" ON motivos_reprovacao FOR UPDATE TO authenticated USING (hotel_id = my_hotel_id()) WITH CHECK (hotel_id = my_hotel_id());
CREATE POLICY "motivos_reprov_delete_hotel" ON motivos_reprovacao FOR DELETE TO authenticated USING (hotel_id = my_hotel_id());

-- ── 8. motivos_pausa ──────────────────────────────────────────
ALTER TABLE motivos_pausa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "motivos_pausa_select"        ON motivos_pausa;
DROP POLICY IF EXISTS "motivos_pausa_admin_global"  ON motivos_pausa;
DROP POLICY IF EXISTS "motivos_pausa_admin_hotel"   ON motivos_pausa;
DROP POLICY IF EXISTS "motivos_pausa_insert_hotel"  ON motivos_pausa;
DROP POLICY IF EXISTS "motivos_pausa_update_hotel"  ON motivos_pausa;
DROP POLICY IF EXISTS "motivos_pausa_delete_hotel"  ON motivos_pausa;
CREATE POLICY "motivos_pausa_select"       ON motivos_pausa FOR SELECT TO authenticated USING (true);
CREATE POLICY "motivos_pausa_admin_global" ON motivos_pausa FOR ALL    TO authenticated USING (is_admin_global()) WITH CHECK (is_admin_global());
CREATE POLICY "motivos_pausa_insert_hotel" ON motivos_pausa FOR INSERT TO authenticated WITH CHECK (hotel_id = my_hotel_id());
CREATE POLICY "motivos_pausa_update_hotel" ON motivos_pausa FOR UPDATE TO authenticated USING (hotel_id = my_hotel_id()) WITH CHECK (hotel_id = my_hotel_id());
CREATE POLICY "motivos_pausa_delete_hotel" ON motivos_pausa FOR DELETE TO authenticated USING (hotel_id = my_hotel_id());

-- ── 9. motivos_cancelamento ───────────────────────────────────
ALTER TABLE motivos_cancelamento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "motivos_cancel_select"        ON motivos_cancelamento;
DROP POLICY IF EXISTS "motivos_cancel_admin_global"  ON motivos_cancelamento;
DROP POLICY IF EXISTS "motivos_cancel_admin_hotel"   ON motivos_cancelamento;
DROP POLICY IF EXISTS "motivos_cancel_insert_hotel"  ON motivos_cancelamento;
DROP POLICY IF EXISTS "motivos_cancel_update_hotel"  ON motivos_cancelamento;
DROP POLICY IF EXISTS "motivos_cancel_delete_hotel"  ON motivos_cancelamento;
CREATE POLICY "motivos_cancel_select"       ON motivos_cancelamento FOR SELECT TO authenticated USING (true);
CREATE POLICY "motivos_cancel_admin_global" ON motivos_cancelamento FOR ALL    TO authenticated USING (is_admin_global()) WITH CHECK (is_admin_global());
CREATE POLICY "motivos_cancel_insert_hotel" ON motivos_cancelamento FOR INSERT TO authenticated WITH CHECK (hotel_id = my_hotel_id());
CREATE POLICY "motivos_cancel_update_hotel" ON motivos_cancelamento FOR UPDATE TO authenticated USING (hotel_id = my_hotel_id()) WITH CHECK (hotel_id = my_hotel_id());
CREATE POLICY "motivos_cancel_delete_hotel" ON motivos_cancelamento FOR DELETE TO authenticated USING (hotel_id = my_hotel_id());

-- ── 10. supervisora_checklist_items ───────────────────────────
ALTER TABLE supervisora_checklist_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sup_cl_select"        ON supervisora_checklist_items;
DROP POLICY IF EXISTS "sup_cl_admin_global"  ON supervisora_checklist_items;
DROP POLICY IF EXISTS "sup_cl_admin_hotel"   ON supervisora_checklist_items;
DROP POLICY IF EXISTS "sup_cl_insert_hotel"  ON supervisora_checklist_items;
DROP POLICY IF EXISTS "sup_cl_update_hotel"  ON supervisora_checklist_items;
DROP POLICY IF EXISTS "sup_cl_delete_hotel"  ON supervisora_checklist_items;
CREATE POLICY "sup_cl_select"       ON supervisora_checklist_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "sup_cl_admin_global" ON supervisora_checklist_items FOR ALL    TO authenticated USING (is_admin_global()) WITH CHECK (is_admin_global());
CREATE POLICY "sup_cl_insert_hotel" ON supervisora_checklist_items FOR INSERT TO authenticated WITH CHECK (hotel_id = my_hotel_id());
CREATE POLICY "sup_cl_update_hotel" ON supervisora_checklist_items FOR UPDATE TO authenticated USING (hotel_id = my_hotel_id()) WITH CHECK (hotel_id = my_hotel_id());
CREATE POLICY "sup_cl_delete_hotel" ON supervisora_checklist_items FOR DELETE TO authenticated USING (hotel_id = my_hotel_id());

-- ── 11. hotel_config ──────────────────────────────────────────
ALTER TABLE hotel_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hotel_config_select"        ON hotel_config;
DROP POLICY IF EXISTS "hotel_config_admin_global"  ON hotel_config;
DROP POLICY IF EXISTS "hotel_config_upsert_hotel"  ON hotel_config;
DROP POLICY IF EXISTS "hotel_config_insert_hotel"  ON hotel_config;
DROP POLICY IF EXISTS "hotel_config_update_hotel"  ON hotel_config;
CREATE POLICY "hotel_config_select"       ON hotel_config FOR SELECT TO authenticated USING (hotel_id = my_hotel_id() OR is_admin_global());
CREATE POLICY "hotel_config_admin_global" ON hotel_config FOR ALL    TO authenticated USING (is_admin_global()) WITH CHECK (is_admin_global());
CREATE POLICY "hotel_config_insert_hotel" ON hotel_config FOR INSERT TO authenticated WITH CHECK (hotel_id = my_hotel_id());
CREATE POLICY "hotel_config_update_hotel" ON hotel_config FOR UPDATE TO authenticated USING (hotel_id = my_hotel_id()) WITH CHECK (hotel_id = my_hotel_id());

-- ── 12. turnos ────────────────────────────────────────────────
ALTER TABLE turnos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "turnos_select"        ON turnos;
DROP POLICY IF EXISTS "turnos_admin_global"  ON turnos;
DROP POLICY IF EXISTS "turnos_admin_hotel"   ON turnos;
DROP POLICY IF EXISTS "turnos_insert_hotel"  ON turnos;
DROP POLICY IF EXISTS "turnos_update_hotel"  ON turnos;
DROP POLICY IF EXISTS "turnos_delete_hotel"  ON turnos;
CREATE POLICY "turnos_select"       ON turnos FOR SELECT TO authenticated USING (true);
CREATE POLICY "turnos_admin_global" ON turnos FOR ALL    TO authenticated USING (is_admin_global()) WITH CHECK (is_admin_global());
CREATE POLICY "turnos_insert_hotel" ON turnos FOR INSERT TO authenticated WITH CHECK (hotel_id = my_hotel_id());
CREATE POLICY "turnos_update_hotel" ON turnos FOR UPDATE TO authenticated USING (hotel_id = my_hotel_id()) WITH CHECK (hotel_id = my_hotel_id());
CREATE POLICY "turnos_delete_hotel" ON turnos FOR DELETE TO authenticated USING (hotel_id = my_hotel_id());
