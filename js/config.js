// ================================================================
// CONFIG SERVICE — Gov Estancorp
// CRUD de tipos de chamado, checklist de limpeza e turnos.
// Visível apenas para admin_global e admin_hotel.
// ================================================================

// ── RENDER PÁGINA CONFIG ──────────────────────────────────────
async function renderConfigPage() {
  if (!canAccess('config')) return;
  await Promise.all([
    renderConfigTurnos(),
    renderConfigTipos(),
    renderConfigSolicitantes(),
    renderConfigChecklist(),
  ]);
}

// ── TURNOS ────────────────────────────────────────────────────
let _turnosCache = [];

async function renderConfigTurnos() {
  const el = document.getElementById('config-turnos');
  if (!el) return;

  const hotelId = currentUser.perfil === 'admin_global' ? null : currentUser.hotelId;
  let query = supabaseClient.from('turnos').select('*').order('periodo').order('numero');
  if (hotelId) query = query.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);

  const { data, error } = await query;
  if (error) {
    el.innerHTML = `<div style="color:var(--danger);font-size:12px;">Erro ao carregar turnos: ${error.message}<br><small>Execute a migration SQL primeiro.</small></div>`;
    return;
  }
  _turnosCache = data || [];

  const periodos = [
    { id: 'manha', label: 'Manhã',  icon: '🌅' },
    { id: 'tarde', label: 'Tarde',  icon: '🌤️' },
    { id: 'noite', label: 'Noite',  icon: '🌙' },
  ];

  el.innerHTML = periodos.map(p => {
    const items = _turnosCache.filter(t => t.periodo === p.id);
    return `
      <div style="margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
          <span style="font-size:16px;">${p.icon}</span>
          <span style="font-weight:700;font-size:13px;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;">${p.label}</span>
        </div>
        ${items.map(t => `
          <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
            <span style="font-size:12px;color:var(--text3);min-width:58px;font-weight:600;">${t.label}</span>
            <input type="time" value="${t.hora_inicio}"
              style="width:110px;padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;"
              onchange="_salvarTurno(${t.id},'hora_inicio',this.value)"
              title="Hora início">
            <span style="color:var(--text3);">–</span>
            <input type="time" value="${t.hora_fim}"
              style="width:110px;padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;"
              onchange="_salvarTurno(${t.id},'hora_fim',this.value)"
              title="Hora fim">
            <span class="badge ${t.ativo ? 'badge-livre' : 'badge-bloqueado'}" style="font-size:10px;cursor:pointer;"
              onclick="_toggleTurno(${t.id},${t.ativo})"
              title="Clique para ${t.ativo ? 'inativar' : 'ativar'}">${t.ativo ? 'Ativo' : 'Inativo'}</span>
            ${t.hotel_id ? `<span style="font-size:10px;color:var(--text3);">🏨</span>` : `<span style="font-size:10px;color:var(--text3);">🌐</span>`}
          </div>`).join('')}
        ${currentUser.perfil !== 'admin_global' ? '' : ''}
      </div>`;
  }).join('');
}

async function _salvarTurno(id, campo, valor) {
  const { error } = await supabaseClient.from('turnos').update({ [campo]: valor }).eq('id', id);
  if (error) { toast('Erro ao salvar turno: ' + error.message, 'error'); return; }
  toast('Turno atualizado!', 'success');
  const t = _turnosCache.find(x => x.id === id);
  if (t) t[campo] = valor;
}

async function _toggleTurno(id, ativo) {
  const { error } = await supabaseClient.from('turnos').update({ ativo: !ativo }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  await renderConfigTurnos();
}

// ── TIPOS DE CHAMADO ──────────────────────────────────────────
let _tiposCache = [];

async function renderConfigTipos() {
  const elGov  = document.getElementById('config-tipos-governanca');
  const elMan  = document.getElementById('config-tipos-manutencao');
  if (!elGov && !elMan) return;

  const hotelId = currentUser.perfil === 'admin_global' ? null : currentUser.hotelId;
  let query = supabaseClient.from('chamado_tipos').select('*').order('ordem');
  if (hotelId) query = query.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);

  const { data } = await query;
  _tiposCache = data || [];

  const govTipos = _tiposCache.filter(t => !t.departamento || t.departamento === 'governanca' || t.departamento === 'ambos');
  const manTipos = _tiposCache.filter(t => t.departamento === 'manutencao' || t.departamento === 'ambos');

  const addForm = (dept, placeholder) => `
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
      <input type="text" id="new-tipo-nome-${dept}" placeholder="${placeholder}"
        style="flex:1;min-width:180px;padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;">
      <button class="btn btn-primary btn-sm" onclick="_adicionarTipo('${dept}')">+ Adicionar</button>
    </div>`;

  if (elGov) elGov.innerHTML = addForm('governanca','Novo tipo de limpeza/governança...') +
    `<div id="tipos-lista-governanca">${govTipos.map(t => _renderTipoRow(t)).join('')}</div>`;

  if (elMan) elMan.innerHTML = addForm('manutencao','Novo tipo de manutenção...') +
    `<div id="tipos-lista-manutencao">${manTipos.map(t => _renderTipoRow(t)).join('')}</div>`;
}

function _renderTipoRow(t, deptLabel) {
  deptLabel = deptLabel || { governanca:'Governança', manutencao:'Manutenção', ambos:'Ambos' };
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);gap:8px;" id="tipo-row-${t.id}">
      <div style="display:flex;align-items:center;gap:8px;flex:1;">
        <span style="font-size:12px;color:var(--text3);">${t.hotel_id ? '🏨' : '🌐'}</span>
        <span style="font-size:13px;" id="tipo-nome-text-${t.id}">${t.nome}</span>
        <span style="font-size:10px;color:var(--text3);background:var(--surface2);padding:2px 6px;border-radius:10px;">${deptLabel[t.departamento || 'ambos'] || 'Ambos'}</span>
        ${!t.ativo ? '<span class="badge badge-bloqueado" style="font-size:10px;">Inativo</span>' : ''}
      </div>
      <div id="tipo-edit-${t.id}" style="display:none;flex:1;display:none;">
        <input type="text" id="tipo-edit-nome-${t.id}" value="${t.nome}"
          style="width:100%;padding:5px 8px;border:1.5px solid var(--primary-light);border-radius:var(--radius-sm);font-size:13px;">
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0;">
        <button class="btn btn-ghost btn-xs" id="tipo-btn-edit-${t.id}"
          onclick="_iniciarEdicaoTipo('${t.id}')" title="Editar">✏️</button>
        <button class="btn btn-ghost btn-xs" id="tipo-btn-save-${t.id}" style="display:none;"
          onclick="_salvarEdicaoTipo('${t.id}')" title="Salvar">💾</button>
        <button class="btn btn-ghost btn-xs" id="tipo-btn-cancel-${t.id}" style="display:none;"
          onclick="renderConfigTipos()" title="Cancelar">✕</button>
        <button class="btn btn-ghost btn-xs" onclick="_toggleTipo('${t.id}',${t.ativo})"
          title="${t.ativo ? 'Inativar' : 'Ativar'}">${t.ativo ? '⏸' : '▶'}</button>
        ${t.hotel_id
          ? `<button class="btn btn-ghost btn-xs" style="color:var(--danger);"
              onclick="_excluirTipo('${t.id}')" title="Excluir">🗑</button>`
          : ''}
      </div>
    </div>`;
}

function _iniciarEdicaoTipo(id) {
  const textEl = document.getElementById(`tipo-nome-text-${id}`);
  const editEl = document.getElementById(`tipo-edit-${id}`);
  const btnEdit  = document.getElementById(`tipo-btn-edit-${id}`);
  const btnSave  = document.getElementById(`tipo-btn-save-${id}`);
  const btnCancel = document.getElementById(`tipo-btn-cancel-${id}`);
  if (!textEl || !editEl) return;
  textEl.style.display = 'none';
  editEl.style.display = 'block';
  btnEdit.style.display  = 'none';
  btnSave.style.display  = '';
  btnCancel.style.display = '';
  document.getElementById(`tipo-edit-nome-${id}`)?.focus();
}

async function _salvarEdicaoTipo(id) {
  const input = document.getElementById(`tipo-edit-nome-${id}`);
  const nome = input?.value.trim();
  if (!nome) { toast('Informe o nome', 'error'); return; }
  const { error } = await supabaseClient.from('chamado_tipos').update({ nome }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Tipo atualizado!', 'success');
  await renderConfigTipos();
}

async function _adicionarTipo(dept) {
  dept = dept || 'governanca';
  const input = document.getElementById(`new-tipo-nome-${dept}`);
  const nome  = input?.value.trim();
  if (!nome) { toast('Informe o nome do tipo', 'error'); return; }
  const hotel_id = currentUser.perfil === 'admin_global' ? null : currentUser.hotelId;
  const ordem    = (_tiposCache.filter(t => t.departamento === dept).length || 0) + 1;
  const { error } = await supabaseClient.from('chamado_tipos').insert([{ nome, hotel_id, ordem, departamento: dept }]);
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
      ${_checklistCache.map((item, idx) => _renderCheckRow(item, idx)).join('')}
    </div>`;
}

function _renderCheckRow(item, idx) {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);gap:8px;" id="check-row-${item.id}">
      <div style="display:flex;align-items:center;gap:8px;flex:1;">
        <span style="font-size:11px;color:var(--text3);min-width:20px;">${(idx+1)}.</span>
        <span style="font-size:13px;${!item.ativo ? 'text-decoration:line-through;color:var(--text3);' : ''}"
          id="check-nome-text-${item.id}">${item.nome}</span>
        <span style="font-size:10px;color:var(--text3);">${item.hotel_id ? '🏨' : '🌐'}</span>
      </div>
      <div id="check-edit-wrap-${item.id}" style="display:none;flex:1;">
        <input type="text" id="check-edit-nome-${item.id}" value="${item.nome}"
          style="width:100%;padding:5px 8px;border:1.5px solid var(--primary-light);border-radius:var(--radius-sm);font-size:13px;">
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0;">
        <button class="btn btn-ghost btn-xs" id="check-btn-edit-${item.id}"
          onclick="_iniciarEdicaoCheck('${item.id}')" title="Editar">✏️</button>
        <button class="btn btn-ghost btn-xs" id="check-btn-save-${item.id}" style="display:none;"
          onclick="_salvarEdicaoCheck('${item.id}')" title="Salvar">💾</button>
        <button class="btn btn-ghost btn-xs" id="check-btn-cancel-${item.id}" style="display:none;"
          onclick="renderConfigChecklist()" title="Cancelar">✕</button>
        <button class="btn btn-ghost btn-xs" onclick="_toggleCheckItem('${item.id}',${item.ativo})"
          title="${item.ativo ? 'Inativar' : 'Ativar'}">${item.ativo ? '⏸' : '▶'}</button>
        ${item.hotel_id
          ? `<button class="btn btn-ghost btn-xs" style="color:var(--danger);"
              onclick="_excluirCheckItem('${item.id}')" title="Excluir">🗑</button>`
          : ''}
      </div>
    </div>`;
}

function _iniciarEdicaoCheck(id) {
  const textEl  = document.getElementById(`check-nome-text-${id}`);
  const editWrap = document.getElementById(`check-edit-wrap-${id}`);
  const btnEdit  = document.getElementById(`check-btn-edit-${id}`);
  const btnSave  = document.getElementById(`check-btn-save-${id}`);
  const btnCancel = document.getElementById(`check-btn-cancel-${id}`);
  if (!textEl) return;
  textEl.style.display  = 'none';
  editWrap.style.display = 'block';
  btnEdit.style.display  = 'none';
  btnSave.style.display  = '';
  btnCancel.style.display = '';
  document.getElementById(`check-edit-nome-${id}`)?.focus();
}

async function _salvarEdicaoCheck(id) {
  const input = document.getElementById(`check-edit-nome-${id}`);
  const nome = input?.value.trim();
  if (!nome) { toast('Informe o nome', 'error'); return; }
  const { error } = await supabaseClient.from('checklist_templates').update({ nome }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Item atualizado!', 'success');
  await renderConfigChecklist();
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
async function abrirChecklistApp(id) {
  selectedAptoId = id;
  const apto = aptos.find(a => a.id === id);
  if (!apto) return;

  document.getElementById('checklist-title').textContent = `Limpeza — Apto ${apto.numero}`;

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

// ── SOLICITANTES ──────────────────────────────────────────────
let _solicitantesCache = [];

async function renderConfigSolicitantes() {
  const el = document.getElementById('config-solicitantes');
  if (!el) return;

  const hotelId = currentUser.perfil === 'admin_global' ? null : currentUser.hotelId;
  let query = supabaseClient.from('solicitantes').select('*').order('ordem');
  if (hotelId) query = query.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);

  const { data, error } = await query;
  if (error) {
    el.innerHTML = `<div style="color:var(--danger);font-size:12px;">Erro: ${error.message}</div>`;
    return;
  }
  _solicitantesCache = data || [];

  el.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
      <input type="text" id="new-solicitante-nome" placeholder="Novo tipo de solicitante..."
        style="flex:1;min-width:180px;padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;">
      <button class="btn btn-primary btn-sm" onclick="_adicionarSolicitante()">+ Adicionar</button>
    </div>
    <div id="solicitantes-lista">
      ${_solicitantesCache.map(s => _renderSolicitanteRow(s)).join('')}
    </div>`;
}

function _renderSolicitanteRow(s) {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);gap:8px;" id="sol-row-${s.id}">
      <div style="display:flex;align-items:center;gap:8px;flex:1;">
        <span style="font-size:12px;color:var(--text3);">${s.hotel_id ? '🏨' : '🌐'}</span>
        <span style="font-size:13px;" id="sol-nome-text-${s.id}">${s.nome}</span>
        ${!s.ativo ? '<span class="badge badge-bloqueado" style="font-size:10px;">Inativo</span>' : ''}
      </div>
      <div id="sol-edit-${s.id}" style="display:none;flex:1;">
        <input type="text" id="sol-edit-nome-${s.id}" value="${s.nome}"
          style="width:100%;padding:5px 8px;border:1.5px solid var(--primary-light);border-radius:var(--radius-sm);font-size:13px;">
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0;">
        <button class="btn btn-ghost btn-xs" id="sol-btn-edit-${s.id}"
          onclick="_iniciarEdicaoSolicitante('${s.id}')" title="Editar">✏️</button>
        <button class="btn btn-ghost btn-xs" id="sol-btn-save-${s.id}" style="display:none;"
          onclick="_salvarEdicaoSolicitante('${s.id}')" title="Salvar">💾</button>
        <button class="btn btn-ghost btn-xs" id="sol-btn-cancel-${s.id}" style="display:none;"
          onclick="renderConfigSolicitantes()" title="Cancelar">✕</button>
        <button class="btn btn-ghost btn-xs" onclick="_toggleSolicitante('${s.id}',${s.ativo})"
          title="${s.ativo ? 'Inativar' : 'Ativar'}">${s.ativo ? '⏸' : '▶'}</button>
        ${s.hotel_id
          ? `<button class="btn btn-ghost btn-xs" style="color:var(--danger);"
              onclick="_excluirSolicitante('${s.id}')" title="Excluir">🗑</button>`
          : ''}
      </div>
    </div>`;
}

function _iniciarEdicaoSolicitante(id) {
  document.getElementById(`sol-nome-text-${id}`).style.display  = 'none';
  document.getElementById(`sol-edit-${id}`).style.display       = 'block';
  document.getElementById(`sol-btn-edit-${id}`).style.display   = 'none';
  document.getElementById(`sol-btn-save-${id}`).style.display   = '';
  document.getElementById(`sol-btn-cancel-${id}`).style.display = '';
  document.getElementById(`sol-edit-nome-${id}`)?.focus();
}

async function _salvarEdicaoSolicitante(id) {
  const nome = document.getElementById(`sol-edit-nome-${id}`)?.value.trim();
  if (!nome) { toast('Informe o nome', 'error'); return; }
  const { error } = await supabaseClient.from('solicitantes').update({ nome }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Solicitante atualizado!', 'success');
  await renderConfigSolicitantes();
}

async function _adicionarSolicitante() {
  const input = document.getElementById('new-solicitante-nome');
  const nome  = input?.value.trim();
  if (!nome) { toast('Informe o nome do solicitante', 'error'); return; }
  const hotel_id = currentUser.perfil === 'admin_global' ? null : currentUser.hotelId;
  const ordem    = (_solicitantesCache.length || 0) + 1;
  const { error } = await supabaseClient.from('solicitantes').insert([{ nome, hotel_id, ativo: true, ordem }]);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  if (input) input.value = '';
  toast('Solicitante adicionado!', 'success');
  await renderConfigSolicitantes();
}

async function _toggleSolicitante(id, ativo) {
  const { error } = await supabaseClient.from('solicitantes').update({ ativo: !ativo }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  await renderConfigSolicitantes();
}

async function _excluirSolicitante(id) {
  if (!confirm('Excluir este solicitante?')) return;
  const { error } = await supabaseClient.from('solicitantes').delete().eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Solicitante excluído!', 'success');
  await renderConfigSolicitantes();
}

// Rendering chamado diretamente por renderConfig() em index.html
