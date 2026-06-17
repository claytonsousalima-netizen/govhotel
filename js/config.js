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
    renderConfigAndares(),
    renderConfigTiposLimpeza(),
    renderConfigSolicitantes(),
    renderConfigMotivos(),
    renderConfigChecklist(),
    renderConfigMotivosPausa(),
    renderConfigMotivosCancel(),
    renderConfigSupervisoraChecklist(),

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
// Versão autoritativa — config.js é carregado após apartments.js, portanto esta prevalece.
// Fluxo novo: iniciar/retomar/re-limpar → limpando → checklist → conferencia
async function abrirChecklistApp(id) {
  selectedAptoId = id;
  const apto = aptos.find(a => a.id === id);
  if (!apto) return;

  // Usa origem salva em _checklistOrigemStatus para título correto (apto já está em 'limpando')
  const origem = (typeof _checklistOrigemStatus !== 'undefined' && _checklistOrigemStatus) || apto.status;
  const titulo = origem === 'reprovado'
    ? `Re-limpeza — Apto ${apto.numero}`
    : origem === 'pausado'
    ? `Retomar limpeza — Apto ${apto.numero}`
    : `Limpeza — Apto ${apto.numero}`;
  document.getElementById('checklist-title').textContent = titulo;

  const hotelId = currentUser?.hotelId;
  let query = supabaseClient.from('checklist_templates').select('nome').eq('ativo', true).order('ordem');
  if (hotelId) query = query.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);

  const { data } = await query;
  const itens = data?.length
    ? data.map(i => i.nome)
    : (typeof CHECKLIST_PADRAO !== 'undefined' ? CHECKLIST_PADRAO : []);

  checklistState = itens.map(label => ({ label, done: false }));

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

// ── MOTIVOS DE REPROVAÇÃO ─────────────────────────────────────
let _motivosCache = [];

async function renderConfigMotivos() {
  const el = document.getElementById('config-motivos-reprovacao');
  if (!el) return;

  const hotelId = currentUser.perfil === 'admin_global' ? null : currentUser.hotelId;
  let query = supabaseClient.from('motivos_reprovacao').select('*').order('ordem');
  if (hotelId) query = query.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);

  const { data, error } = await query;
  if (error) {
    el.innerHTML = `<div style="color:var(--danger);font-size:12px;">Erro: ${error.message}</div>`;
    return;
  }
  _motivosCache = data || [];

  el.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
      <input type="text" id="new-motivo-nome" placeholder="Novo motivo de reprovação..."
        style="flex:1;min-width:180px;padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;"
        onkeydown="if(event.key==='Enter') _adicionarMotivo()">
      <button class="btn btn-primary btn-sm" onclick="_adicionarMotivo()">+ Adicionar</button>
    </div>
    <div id="motivos-lista">
      ${_motivosCache.map(m => _renderMotivoRow(m)).join('')}
    </div>`;
}

function _renderMotivoRow(m) {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);gap:8px;" id="motivo-row-${m.id}">
      <div style="display:flex;align-items:center;gap:8px;flex:1;">
        <span style="font-size:12px;color:var(--text3);">${m.hotel_id ? '🏨' : '🌐'}</span>
        <span style="font-size:13px;${!m.ativo ? 'text-decoration:line-through;color:var(--text3);' : ''}"
          id="motivo-nome-text-${m.id}">${m.nome}</span>
        ${!m.ativo ? '<span class="badge badge-bloqueado" style="font-size:10px;">Inativo</span>' : ''}
      </div>
      <div id="motivo-edit-${m.id}" style="display:none;flex:1;">
        <input type="text" id="motivo-edit-nome-${m.id}" value="${m.nome}"
          style="width:100%;padding:5px 8px;border:1.5px solid var(--primary-light);border-radius:var(--radius-sm);font-size:13px;"
          onkeydown="if(event.key==='Enter') _salvarEdicaoMotivo('${m.id}')">
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0;">
        <button class="btn btn-ghost btn-xs" id="motivo-btn-edit-${m.id}"
          onclick="_iniciarEdicaoMotivo('${m.id}')" title="Editar">✏️</button>
        <button class="btn btn-ghost btn-xs" id="motivo-btn-save-${m.id}" style="display:none;"
          onclick="_salvarEdicaoMotivo('${m.id}')" title="Salvar">💾</button>
        <button class="btn btn-ghost btn-xs" id="motivo-btn-cancel-${m.id}" style="display:none;"
          onclick="renderConfigMotivos()" title="Cancelar">✕</button>
        <button class="btn btn-ghost btn-xs" onclick="_toggleMotivo('${m.id}',${m.ativo})"
          title="${m.ativo ? 'Inativar' : 'Ativar'}">${m.ativo ? '⏸' : '▶'}</button>
        ${m.hotel_id
          ? `<button class="btn btn-ghost btn-xs" style="color:var(--danger);"
              onclick="_excluirMotivo('${m.id}')" title="Excluir">🗑</button>`
          : ''}
      </div>
    </div>`;
}

function _iniciarEdicaoMotivo(id) {
  document.getElementById(`motivo-nome-text-${id}`).style.display  = 'none';
  document.getElementById(`motivo-edit-${id}`).style.display       = 'block';
  document.getElementById(`motivo-btn-edit-${id}`).style.display   = 'none';
  document.getElementById(`motivo-btn-save-${id}`).style.display   = '';
  document.getElementById(`motivo-btn-cancel-${id}`).style.display = '';
  document.getElementById(`motivo-edit-nome-${id}`)?.focus();
}

async function _salvarEdicaoMotivo(id) {
  const nome = document.getElementById(`motivo-edit-nome-${id}`)?.value.trim();
  if (!nome) { toast('Informe o motivo', 'error'); return; }
  const { error } = await supabaseClient.from('motivos_reprovacao').update({ nome }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Motivo atualizado!', 'success');
  await renderConfigMotivos();
}

async function _adicionarMotivo() {
  const input = document.getElementById('new-motivo-nome');
  const nome  = input?.value.trim();
  if (!nome) { toast('Informe o motivo de reprovação', 'error'); return; }
  const hotel_id = currentUser.perfil === 'admin_global' ? null : currentUser.hotelId;
  const ordem    = (_motivosCache.length || 0) + 1;
  const { error } = await supabaseClient.from('motivos_reprovacao').insert([{ nome, hotel_id, ativo: true, ordem }]);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  if (input) input.value = '';
  toast('Motivo adicionado!', 'success');
  await renderConfigMotivos();
}

async function _toggleMotivo(id, ativo) {
  const { error } = await supabaseClient.from('motivos_reprovacao').update({ ativo: !ativo }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  await renderConfigMotivos();
}

async function _excluirMotivo(id) {
  if (!confirm('Excluir este motivo de reprovação?')) return;
  const { error } = await supabaseClient.from('motivos_reprovacao').delete().eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Motivo excluído!', 'success');
  await renderConfigMotivos();
}

// ── ANDARES ───────────────────────────────────────────────────
async function renderConfigAndares() {
  const el = document.getElementById('config-andares');
  if (!el) return;
  const hotelId = currentUser.hotelId;
  if (!hotelId) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text3);">Selecione um hotel para configurar.</div>';
    return;
  }
  const { data } = await supabaseClient.from('hotel_config')
    .select('valor').eq('hotel_id', hotelId).eq('chave', 'max_andares').single();
  const atual = data?.valor || '12';
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
      <label style="font-size:13px;">Máximo de andares:</label>
      <input type="number" id="cfg-max-andares" value="${atual}" min="1" max="99"
        style="width:80px;padding:6px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-weight:700;">
      <button class="btn btn-primary btn-sm" onclick="_salvarMaxAndares()">Salvar</button>
    </div>
    <div style="font-size:11px;color:var(--text3);margin-top:8px;">Andares de 1º a ${atual}º aparecerão no cadastro de apartamentos.</div>`;
}

async function _salvarMaxAndares() {
  const val = parseInt(document.getElementById('cfg-max-andares')?.value);
  if (!val || val < 1 || val > 99) { toast('Valor inválido (1–99)', 'error'); return; }
  const hotelId = currentUser.hotelId;
  if (!hotelId) return;
  const { error } = await supabaseClient.from('hotel_config')
    .upsert({ hotel_id: hotelId, chave: 'max_andares', valor: String(val) }, { onConflict: 'hotel_id,chave' });
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Número de andares salvo!', 'success');
  await renderConfigAndares();
}

// ── TIPOS DE LIMPEZA ──────────────────────────────────────────
let _tiposLimpezaCache = [];

async function renderConfigTiposLimpeza() {
  const el = document.getElementById('config-tipos-limpeza');
  if (!el) return;
  const hotelId = currentUser.perfil === 'admin_global' ? null : currentUser.hotelId;
  let query = supabaseClient.from('tipos_limpeza').select('*').order('ordem');
  if (hotelId) query = query.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);
  const { data, error } = await query;
  if (error) { el.innerHTML = `<div style="color:var(--danger);font-size:12px;">Erro: ${error.message}</div>`; return; }
  _tiposLimpezaCache = data || [];
  el.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
      <input type="text" id="new-tipo-limpeza-nome" placeholder="Novo tipo de limpeza..."
        style="flex:1;min-width:180px;padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;"
        onkeydown="if(event.key==='Enter') _adicionarTipoLimpeza()">
      <button class="btn btn-primary btn-sm" onclick="_adicionarTipoLimpeza()">+ Adicionar</button>
    </div>
    <div id="tipos-limpeza-lista">
      ${_tiposLimpezaCache.map(t => _renderTipoLimpezaRow(t)).join('')}
    </div>`;
}

function _renderTipoLimpezaRow(t) {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);gap:8px;" id="tl-row-${t.id}">
      <div style="display:flex;align-items:center;gap:8px;flex:1;">
        <span style="font-size:12px;color:var(--text3);">${t.hotel_id ? '🏨' : '🌐'}</span>
        <span style="font-size:13px;${!t.ativo ? 'text-decoration:line-through;color:var(--text3);' : ''}"
          id="tl-text-${t.id}">${t.nome}</span>
        ${!t.ativo ? '<span class="badge badge-bloqueado" style="font-size:10px;">Inativo</span>' : ''}
      </div>
      <div id="tl-edit-${t.id}" style="display:none;flex:1;">
        <input type="text" id="tl-input-${t.id}" value="${t.nome}"
          style="width:100%;padding:5px 8px;border:1.5px solid var(--primary-light);border-radius:var(--radius-sm);font-size:13px;"
          onkeydown="if(event.key==='Enter') _salvarTipoLimpeza(${t.id})">
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0;">
        <button class="btn btn-ghost btn-xs" id="tl-btn-edit-${t.id}"
          onclick="_editarTipoLimpeza(${t.id})" title="Editar">✏️</button>
        <button class="btn btn-ghost btn-xs" id="tl-btn-save-${t.id}" style="display:none;"
          onclick="_salvarTipoLimpeza(${t.id})" title="Salvar">💾</button>
        <button class="btn btn-ghost btn-xs" id="tl-btn-cancel-${t.id}" style="display:none;"
          onclick="renderConfigTiposLimpeza()" title="Cancelar">✕</button>
        <button class="btn btn-ghost btn-xs" onclick="_toggleTipoLimpeza(${t.id},${t.ativo})"
          title="${t.ativo ? 'Inativar' : 'Ativar'}">${t.ativo ? '⏸' : '▶'}</button>
        ${t.hotel_id
          ? `<button class="btn btn-ghost btn-xs" style="color:var(--danger);"
              onclick="_excluirTipoLimpeza(${t.id})" title="Excluir">🗑</button>`
          : ''}
      </div>
    </div>`;
}

function _editarTipoLimpeza(id) {
  document.getElementById(`tl-text-${id}`).closest('div').style.display  = 'none';
  document.getElementById(`tl-edit-${id}`).style.display    = 'block';
  document.getElementById(`tl-btn-edit-${id}`).style.display   = 'none';
  document.getElementById(`tl-btn-save-${id}`).style.display   = '';
  document.getElementById(`tl-btn-cancel-${id}`).style.display = '';
  document.getElementById(`tl-input-${id}`)?.focus();
}

async function _salvarTipoLimpeza(id) {
  const nome = document.getElementById(`tl-input-${id}`)?.value.trim();
  if (!nome) { toast('Informe o nome', 'error'); return; }
  const { error } = await supabaseClient.from('tipos_limpeza').update({ nome }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Tipo atualizado!', 'success');
  await renderConfigTiposLimpeza();
}

async function _adicionarTipoLimpeza() {
  const nome = document.getElementById('new-tipo-limpeza-nome')?.value.trim();
  if (!nome) { toast('Informe o nome do tipo', 'error'); return; }
  const hotel_id = currentUser.perfil === 'admin_global' ? null : currentUser.hotelId;
  const ordem    = (_tiposLimpezaCache.length || 0) + 1;
  const { error } = await supabaseClient.from('tipos_limpeza').insert([{ nome, hotel_id, ativo: true, ordem }]);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  const input = document.getElementById('new-tipo-limpeza-nome');
  if (input) input.value = '';
  toast('Tipo adicionado!', 'success');
  await renderConfigTiposLimpeza();
}

async function _toggleTipoLimpeza(id, ativo) {
  const { error } = await supabaseClient.from('tipos_limpeza').update({ ativo: !ativo }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  await renderConfigTiposLimpeza();
}

async function _excluirTipoLimpeza(id) {
  if (!confirm('Excluir este tipo de limpeza?')) return;
  const { error } = await supabaseClient.from('tipos_limpeza').delete().eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Tipo excluído!', 'success');
  await renderConfigTiposLimpeza();
}


// ── MOTIVOS DE PAUSA ─────────────────────────────────────────
let _motivosPausaCache = [];

async function renderConfigMotivosPausa() {
  const el = document.getElementById('config-motivos-pausa');
  if (!el) return;
  const hotelId = currentUser.perfil === 'admin_global' ? null : currentUser.hotelId;
  let q = supabaseClient.from('motivos_pausa').select('*').order('ordem');
  if (hotelId) q = q.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);
  const { data, error } = await q;
  if (error) { el.innerHTML = `<div style="color:var(--danger);font-size:12px;">Erro: ${error.message}</div>`; return; }
  _motivosPausaCache = data || [];
  el.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
      <input type="text" id="new-mpaus-nome" placeholder="Novo motivo de pausa..."
        style="flex:1;min-width:180px;padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;"
        onkeydown="if(event.key==='Enter') _addMotivosPausa()">
      <button class="btn btn-primary btn-sm" onclick="_addMotivosPausa()">+ Adicionar</button>
    </div>
    <div id="mpaus-lista">${_motivosPausaCache.map(m => _rowMotivosPausa(m)).join('')}</div>`;
}

function _rowMotivosPausa(m) {
  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);gap:8px;" id="mpaus-row-${m.id}">
    <div style="display:flex;align-items:center;gap:8px;flex:1;">
      <span style="font-size:12px;color:var(--text3);">${m.hotel_id?'🏨':'🌐'}</span>
      <span style="font-size:13px;${!m.ativo?'text-decoration:line-through;color:var(--text3);':''}" id="mpaus-text-${m.id}">${m.nome}</span>
      ${!m.ativo?'<span class="badge badge-bloqueado" style="font-size:10px;">Inativo</span>':''}
    </div>
    <div id="mpaus-edit-${m.id}" style="display:none;flex:1;">
      <input type="text" id="mpaus-input-${m.id}" value="${m.nome}"
        style="width:100%;padding:5px 8px;border:1.5px solid var(--primary-light);border-radius:var(--radius-sm);font-size:13px;"
        onkeydown="if(event.key==='Enter') _saveMotivosPausa('${m.id}')">
    </div>
    <div style="display:flex;gap:4px;flex-shrink:0;">
      <button class="btn btn-ghost btn-xs" id="mpaus-btn-edit-${m.id}" onclick="_editMotivosPausa('${m.id}')" title="Editar">✏️</button>
      <button class="btn btn-ghost btn-xs" id="mpaus-btn-save-${m.id}" style="display:none;" onclick="_saveMotivosPausa('${m.id}')" title="Salvar">💾</button>
      <button class="btn btn-ghost btn-xs" id="mpaus-btn-cancel-${m.id}" style="display:none;" onclick="renderConfigMotivosPausa()" title="Cancelar">✕</button>
      <button class="btn btn-ghost btn-xs" onclick="_toggleMotivosPausa('${m.id}',${m.ativo})" title="${m.ativo?'Inativar':'Ativar'}">${m.ativo?'⏸':'▶'}</button>
      ${m.hotel_id?`<button class="btn btn-ghost btn-xs" style="color:var(--danger);" onclick="_delMotivosPausa('${m.id}')" title="Excluir">🗑</button>`:''}
    </div>
  </div>`;
}
function _editMotivosPausa(id) {
  document.getElementById(`mpaus-text-${id}`).parentElement.style.display = 'none';
  document.getElementById(`mpaus-edit-${id}`).style.display = 'block';
  document.getElementById(`mpaus-btn-edit-${id}`).style.display = 'none';
  document.getElementById(`mpaus-btn-save-${id}`).style.display = '';
  document.getElementById(`mpaus-btn-cancel-${id}`).style.display = '';
  document.getElementById(`mpaus-input-${id}`)?.focus();
}
async function _saveMotivosPausa(id) {
  const nome = document.getElementById(`mpaus-input-${id}`)?.value.trim();
  if (!nome) { toast('Informe o motivo', 'error'); return; }
  const { error } = await supabaseClient.from('motivos_pausa').update({ nome }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Salvo!', 'success'); await renderConfigMotivosPausa();
}
async function _addMotivosPausa() {
  const input = document.getElementById('new-mpaus-nome');
  const nome  = input?.value.trim();
  if (!nome) { toast('Informe o motivo', 'error'); return; }
  const hotel_id = currentUser.perfil === 'admin_global' ? null : currentUser.hotelId;
  const { error } = await supabaseClient.from('motivos_pausa').insert([{ nome, hotel_id, ativo: true, ordem: (_motivosPausaCache.length || 0) + 1 }]);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  if (input) input.value = '';
  toast('Adicionado!', 'success'); await renderConfigMotivosPausa();
}
async function _toggleMotivosPausa(id, ativo) {
  await supabaseClient.from('motivos_pausa').update({ ativo: !ativo }).eq('id', id);
  await renderConfigMotivosPausa();
}
async function _delMotivosPausa(id) {
  if (!confirm('Excluir este motivo de pausa?')) return;
  await supabaseClient.from('motivos_pausa').delete().eq('id', id);
  toast('Excluído!', 'success'); await renderConfigMotivosPausa();
}

// ── MOTIVOS DE CANCELAMENTO ──────────────────────────────────
let _motivosCancelCache = [];

async function renderConfigMotivosCancel() {
  const el = document.getElementById('config-motivos-cancelamento');
  if (!el) return;
  const hotelId = currentUser.perfil === 'admin_global' ? null : currentUser.hotelId;
  let q = supabaseClient.from('motivos_cancelamento').select('*').order('ordem');
  if (hotelId) q = q.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);
  const { data, error } = await q;
  if (error) { el.innerHTML = `<div style="color:var(--danger);font-size:12px;">Erro: ${error.message}</div>`; return; }
  _motivosCancelCache = data || [];
  el.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
      <input type="text" id="new-mcanc-nome" placeholder="Novo motivo de cancelamento..."
        style="flex:1;min-width:180px;padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;"
        onkeydown="if(event.key==='Enter') _addMotivosCancel()">
      <button class="btn btn-primary btn-sm" onclick="_addMotivosCancel()">+ Adicionar</button>
    </div>
    <div id="mcanc-lista">${_motivosCancelCache.map(m => _rowMotivosCancel(m)).join('')}</div>`;
}

function _rowMotivosCancel(m) {
  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);gap:8px;" id="mcanc-row-${m.id}">
    <div style="display:flex;align-items:center;gap:8px;flex:1;">
      <span style="font-size:12px;color:var(--text3);">${m.hotel_id?'🏨':'🌐'}</span>
      <span style="font-size:13px;${!m.ativo?'text-decoration:line-through;color:var(--text3);':''}" id="mcanc-text-${m.id}">${m.nome}</span>
      ${!m.ativo?'<span class="badge badge-bloqueado" style="font-size:10px;">Inativo</span>':''}
    </div>
    <div id="mcanc-edit-${m.id}" style="display:none;flex:1;">
      <input type="text" id="mcanc-input-${m.id}" value="${m.nome}"
        style="width:100%;padding:5px 8px;border:1.5px solid var(--primary-light);border-radius:var(--radius-sm);font-size:13px;"
        onkeydown="if(event.key==='Enter') _saveMotivosCancel('${m.id}')">
    </div>
    <div style="display:flex;gap:4px;flex-shrink:0;">
      <button class="btn btn-ghost btn-xs" id="mcanc-btn-edit-${m.id}" onclick="_editMotivosCancel('${m.id}')" title="Editar">✏️</button>
      <button class="btn btn-ghost btn-xs" id="mcanc-btn-save-${m.id}" style="display:none;" onclick="_saveMotivosCancel('${m.id}')" title="Salvar">💾</button>
      <button class="btn btn-ghost btn-xs" id="mcanc-btn-cancel-${m.id}" style="display:none;" onclick="renderConfigMotivosCancel()" title="Cancelar">✕</button>
      <button class="btn btn-ghost btn-xs" onclick="_toggleMotivosCancel('${m.id}',${m.ativo})" title="${m.ativo?'Inativar':'Ativar'}">${m.ativo?'⏸':'▶'}</button>
      ${m.hotel_id?`<button class="btn btn-ghost btn-xs" style="color:var(--danger);" onclick="_delMotivosCancel('${m.id}')" title="Excluir">🗑</button>`:''}
    </div>
  </div>`;
}
function _editMotivosCancel(id) {
  document.getElementById(`mcanc-text-${id}`).parentElement.style.display = 'none';
  document.getElementById(`mcanc-edit-${id}`).style.display = 'block';
  document.getElementById(`mcanc-btn-edit-${id}`).style.display = 'none';
  document.getElementById(`mcanc-btn-save-${id}`).style.display = '';
  document.getElementById(`mcanc-btn-cancel-${id}`).style.display = '';
  document.getElementById(`mcanc-input-${id}`)?.focus();
}
async function _saveMotivosCancel(id) {
  const nome = document.getElementById(`mcanc-input-${id}`)?.value.trim();
  if (!nome) { toast('Informe o motivo', 'error'); return; }
  const { error } = await supabaseClient.from('motivos_cancelamento').update({ nome }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Salvo!', 'success'); await renderConfigMotivosCancel();
}
async function _addMotivosCancel() {
  const input = document.getElementById('new-mcanc-nome');
  const nome  = input?.value.trim();
  if (!nome) { toast('Informe o motivo', 'error'); return; }
  const hotel_id = currentUser.perfil === 'admin_global' ? null : currentUser.hotelId;
  const { error } = await supabaseClient.from('motivos_cancelamento').insert([{ nome, hotel_id, ativo: true, ordem: (_motivosCancelCache.length || 0) + 1 }]);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  if (input) input.value = '';
  toast('Adicionado!', 'success'); await renderConfigMotivosCancel();
}
async function _toggleMotivosCancel(id, ativo) {
  await supabaseClient.from('motivos_cancelamento').update({ ativo: !ativo }).eq('id', id);
  await renderConfigMotivosCancel();
}
async function _delMotivosCancel(id) {
  if (!confirm('Excluir este motivo de cancelamento?')) return;
  await supabaseClient.from('motivos_cancelamento').delete().eq('id', id);
  toast('Excluído!', 'success'); await renderConfigMotivosCancel();
}

// ── CHECKLIST DA SUPERVISORA ─────────────────────────────────
let _supClCache = [];

async function renderConfigSupervisoraChecklist() {
  const el = document.getElementById('config-supervisora-checklist');
  if (!el) return;
  const hotelId = currentUser.perfil === 'admin_global' ? null : currentUser.hotelId;
  let q = supabaseClient.from('supervisora_checklist_items').select('*').order('ordem');
  if (hotelId) q = q.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);
  const { data, error } = await q;
  if (error) { el.innerHTML = `<div style="color:var(--danger);font-size:12px;">Erro: ${error.message}</div>`; return; }
  _supClCache = data || [];
  el.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:flex-end;">
      <input type="text" id="new-supcl-nome" placeholder="Novo item de conferência..."
        style="flex:1;min-width:180px;padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;"
        onkeydown="if(event.key==='Enter') _addSupCl()">
      <label style="display:flex;align-items:center;gap:5px;font-size:12px;white-space:nowrap;">
        <input type="checkbox" id="new-supcl-obrig" checked> Obrigatório
      </label>
      <button class="btn btn-primary btn-sm" onclick="_addSupCl()">+ Adicionar</button>
    </div>
    <div id="supcl-lista">${_supClCache.map(m => _rowSupCl(m)).join('')}</div>`;
}

function _rowSupCl(m) {
  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);gap:8px;" id="supcl-row-${m.id}">
    <div style="display:flex;align-items:center;gap:6px;flex:1;">
      <span style="font-size:12px;color:var(--text3);">${m.hotel_id?'🏨':'🌐'}</span>
      <span style="font-size:13px;${!m.ativo?'text-decoration:line-through;color:var(--text3);':''}" id="supcl-text-${m.id}">${m.nome}</span>
      ${m.obrigatorio?'<span style="color:var(--danger);font-size:11px;font-weight:700;">*</span>':''}
      ${!m.ativo?'<span class="badge badge-bloqueado" style="font-size:10px;">Inativo</span>':''}
    </div>
    <div id="supcl-edit-${m.id}" style="display:none;flex:1;gap:8px;align-items:center;">
      <input type="text" id="supcl-input-${m.id}" value="${m.nome}"
        style="flex:1;padding:5px 8px;border:1.5px solid var(--primary-light);border-radius:var(--radius-sm);font-size:13px;"
        onkeydown="if(event.key==='Enter') _saveSupCl('${m.id}')">
      <label style="display:flex;align-items:center;gap:4px;font-size:12px;white-space:nowrap;">
        <input type="checkbox" id="supcl-obrig-${m.id}" ${m.obrigatorio?'checked':''}> Obrig.
      </label>
    </div>
    <div style="display:flex;gap:4px;flex-shrink:0;">
      <button class="btn btn-ghost btn-xs" id="supcl-btn-edit-${m.id}" onclick="_editSupCl('${m.id}')" title="Editar">✏️</button>
      <button class="btn btn-ghost btn-xs" id="supcl-btn-save-${m.id}" style="display:none;" onclick="_saveSupCl('${m.id}')" title="Salvar">💾</button>
      <button class="btn btn-ghost btn-xs" id="supcl-btn-cancel-${m.id}" style="display:none;" onclick="renderConfigSupervisoraChecklist()" title="Cancelar">✕</button>
      <button class="btn btn-ghost btn-xs" onclick="_toggleSupCl('${m.id}',${m.ativo})" title="${m.ativo?'Inativar':'Ativar'}">${m.ativo?'⏸':'▶'}</button>
      ${m.hotel_id?`<button class="btn btn-ghost btn-xs" style="color:var(--danger);" onclick="_delSupCl('${m.id}')" title="Excluir">🗑</button>`:''}
    </div>
  </div>`;
}
function _editSupCl(id) {
  document.getElementById(`supcl-text-${id}`).closest('div').style.display = 'none';
  const editDiv = document.getElementById(`supcl-edit-${id}`);
  editDiv.style.display = 'flex';
  document.getElementById(`supcl-btn-edit-${id}`).style.display = 'none';
  document.getElementById(`supcl-btn-save-${id}`).style.display = '';
  document.getElementById(`supcl-btn-cancel-${id}`).style.display = '';
  document.getElementById(`supcl-input-${id}`)?.focus();
}
async function _saveSupCl(id) {
  const nome = document.getElementById(`supcl-input-${id}`)?.value.trim();
  const obrigatorio = document.getElementById(`supcl-obrig-${id}`)?.checked ?? true;
  if (!nome) { toast('Informe o nome', 'error'); return; }
  const { error } = await supabaseClient.from('supervisora_checklist_items').update({ nome, obrigatorio }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Salvo!', 'success'); await renderConfigSupervisoraChecklist();
}
async function _addSupCl() {
  const nome = document.getElementById('new-supcl-nome')?.value.trim();
  const obrigatorio = document.getElementById('new-supcl-obrig')?.checked ?? true;
  if (!nome) { toast('Informe o nome do item', 'error'); return; }
  const hotel_id = currentUser.perfil === 'admin_global' ? null : currentUser.hotelId;
  const { error } = await supabaseClient.from('supervisora_checklist_items').insert([{ nome, obrigatorio, hotel_id, ativo: true, ordem: (_supClCache.length || 0) + 1 }]);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  const input = document.getElementById('new-supcl-nome');
  if (input) input.value = '';
  toast('Adicionado!', 'success'); await renderConfigSupervisoraChecklist();
}
async function _toggleSupCl(id, ativo) {
  await supabaseClient.from('supervisora_checklist_items').update({ ativo: !ativo }).eq('id', id);
  await renderConfigSupervisoraChecklist();
}
async function _delSupCl(id) {
  if (!confirm('Excluir este item do checklist da supervisora?')) return;
  await supabaseClient.from('supervisora_checklist_items').delete().eq('id', id);
  toast('Excluído!', 'success'); await renderConfigSupervisoraChecklist();
}


// Rendering chamado diretamente por renderConfig() em index.html
