// ================================================================
// CONFIG SERVICE — GovHotel
// CRUD de tipos de chamado, checklist de limpeza e turnos.
// Visível apenas para admin_global e admin_hotel.
// ================================================================

// ── RENDER PÁGINA CONFIG ──────────────────────────────────────
async function renderConfigPage() {
  if (!canAccess('config')) return;
  await Promise.all([
    renderConfigTurnos(),
    renderConfigTipos(),
    renderConfigChecklist(),
  ]);
}

// ── TURNOS ────────────────────────────────────────────────────
function renderConfigTurnos() {
  const el = document.getElementById('config-turnos');
  if (!el) return;
  const turnos = [
    { id:'manha', label:'Manhã',   hora:'07:00–15:00', icon:'🌅' },
    { id:'tarde', label:'Tarde',   hora:'14:00–22:00', icon:'🌤️' },
    { id:'noite', label:'Noite',   hora:'22:00–07:00', icon:'🌙' },
  ];
  el.innerHTML = turnos.map(t => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:18px;">${t.icon}</span>
        <div>
          <div style="font-weight:600;font-size:13px;">${t.label}</div>
          <div style="font-size:11px;color:var(--text3);">${t.hora}</div>
        </div>
      </div>
      <span class="badge badge-livre" style="font-size:11px;">Ativo</span>
    </div>`).join('');
}

// ── TIPOS DE CHAMADO ──────────────────────────────────────────
let _tiposCache = [];

async function renderConfigTipos() {
  const el = document.getElementById('config-tipos-chamado');
  if (!el) return;

  const hotelId = currentUser.perfil === 'admin_global' ? null : currentUser.hotelId;
  let query = supabaseClient.from('chamado_tipos').select('*').order('ordem');
  if (hotelId) query = query.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);

  const { data } = await query;
  _tiposCache = data || [];

  el.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:12px;">
      <input type="text" id="new-tipo-nome" placeholder="Novo tipo de chamado..."
        style="flex:1;padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;">
      <button class="btn btn-primary btn-sm" onclick="_adicionarTipo()">+ Adicionar</button>
    </div>
    <div id="tipos-lista">
      ${_tiposCache.map(t => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);" id="tipo-row-${t.id}">
          <div style="display:flex;align-items:center;gap:8px;flex:1;">
            <span style="font-size:12px;color:var(--text3);">${t.hotel_id ? '🏨' : '🌐'}</span>
            <span style="font-size:13px;">${t.nome}</span>
            ${!t.ativo ? '<span class="badge badge-bloqueado" style="font-size:10px;">Inativo</span>' : ''}
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <button class="btn btn-ghost btn-xs" onclick="_toggleTipo('${t.id}',${t.ativo})">${t.ativo ? '⏸ Inativar' : '▶ Ativar'}</button>
            ${t.hotel_id ? `<button class="btn btn-ghost btn-xs" style="color:var(--danger);" onclick="_excluirTipo('${t.id}')">🗑</button>` : ''}
          </div>
        </div>`).join('')}
    </div>`;
}

async function _adicionarTipo() {
  const input = document.getElementById('new-tipo-nome');
  const nome  = input?.value.trim();
  if (!nome) { toast('Informe o nome do tipo', 'error'); return; }

  const hotel_id = currentUser.perfil === 'admin_global' ? null : currentUser.hotelId;
  const ordem    = (_tiposCache.length || 0) + 1;

  const { error } = await supabaseClient.from('chamado_tipos').insert([{ nome, hotel_id, ordem }]);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }

  if (input) input.value = '';
  toast('Tipo adicionado!', 'success');
  await renderConfigTipos();
}

async function _toggleTipo(id, ativo) {
  const { error } = await supabaseClient.from('chamado_tipos').update({ ativo: !ativo }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  await renderConfigTipos();
}

async function _excluirTipo(id) {
  if (!confirm('Excluir este tipo de chamado?')) return;
  const { error } = await supabaseClient.from('chamado_tipos').delete().eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Tipo excluído!', 'success');
  await renderConfigTipos();
}

// ── CHECKLIST DE LIMPEZA ──────────────────────────────────────
let _checklistCache = [];

async function renderConfigChecklist() {
  const el = document.getElementById('config-checklist');
  if (!el) return;

  const hotelId = currentUser.perfil === 'admin_global' ? null : currentUser.hotelId;
  let query = supabaseClient.from('checklist_templates').select('*').order('ordem');
  if (hotelId) query = query.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);

  const { data } = await query;
  _checklistCache = data || [];

  el.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:12px;">
      <input type="text" id="new-check-nome" placeholder="Novo item de limpeza..."
        style="flex:1;padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;">
      <button class="btn btn-primary btn-sm" onclick="_adicionarCheckItem()">+ Adicionar</button>
    </div>
    <div id="checklist-config-lista">
      ${_checklistCache.map((item, idx) => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);">
          <div style="display:flex;align-items:center;gap:8px;flex:1;">
            <span style="font-size:11px;color:var(--text3);min-width:20px;">${idx+1}.</span>
            <span style="font-size:13px;${!item.ativo ? 'text-decoration:line-through;color:var(--text3);' : ''}">${item.nome}</span>
            <span style="font-size:10px;color:var(--text3);">${item.hotel_id ? '🏨' : '🌐'}</span>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <button class="btn btn-ghost btn-xs" onclick="_toggleCheckItem('${item.id}',${item.ativo})">${item.ativo ? '⏸' : '▶'}</button>
            ${item.hotel_id ? `<button class="btn btn-ghost btn-xs" style="color:var(--danger);" onclick="_excluirCheckItem('${item.id}')">🗑</button>` : ''}
          </div>
        </div>`).join('')}
    </div>`;
}

async function _adicionarCheckItem() {
  const input = document.getElementById('new-check-nome');
  const nome  = input?.value.trim();
  if (!nome) { toast('Informe o nome do item', 'error'); return; }

  const hotel_id = currentUser.perfil === 'admin_global' ? null : currentUser.hotelId;
  const ordem    = (_checklistCache.length || 0) + 1;

  const { error } = await supabaseClient.from('checklist_templates').insert([{ nome, hotel_id, ordem }]);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }

  if (input) input.value = '';
  toast('Item adicionado!', 'success');
  await renderConfigChecklist();
}

async function _toggleCheckItem(id, ativo) {
  const { error } = await supabaseClient.from('checklist_templates').update({ ativo: !ativo }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  await renderConfigChecklist();
}

async function _excluirCheckItem(id) {
  if (!confirm('Excluir este item do checklist?')) return;
  const { error } = await supabaseClient.from('checklist_templates').delete().eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Item excluído!', 'success');
  await renderConfigChecklist();
}

// ── INTEGRAÇÃO COM CHECKLIST DE LIMPEZA ───────────────────────
// Substitui o CHECKLIST_PADRAO hardcoded pelo banco de dados
async function abrirChecklistApp(id) {
  selectedAptoId = id;
  const apto = aptos.find(a => a.id === id);
  if (!apto) return;

  document.getElementById('checklist-title').textContent = `Limpeza — Apto ${apto.numero}`;

  // Carrega itens do banco
  const hotelId = currentUser.hotelId;
  let query = supabaseClient.from('checklist_templates').select('nome').eq('ativo', true).order('ordem');
  if (hotelId) query = query.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);

  const { data } = await query;
  const itens = (data || []).map(i => i.nome);

  checklistState = (itens.length ? itens : (typeof CHECKLIST_PADRAO !== 'undefined' ? CHECKLIST_PADRAO : []))
    .map(label => ({ label, done: false }));

  if (apto.status === 'sujo') {
    await supabaseClient.from('apartments').update({ status: 'limpando' }).eq('id', id);
    apto.status = 'limpando';
  }

  renderChecklist();
  openModal('modal-checklist');
}

// Intercepta openPage para carregar config
(function patchOpenPageConfig() {
  if (window._configPatch) return;
  window._configPatch = true;
  const _realOpen = openPage;
  openPage = function(id) {
    _realOpen(id);
    if (id === 'config') renderConfigPage();
  };
})();
