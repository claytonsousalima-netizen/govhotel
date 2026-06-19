// ================================================================
// CONFIG SERVICE — Gov Estancorp
// CRUD de tipos de chamado, checklist de limpeza e turnos.
// Visível apenas para admin_global e admin_hotel.
// ================================================================

// ── HOTEL SELECTOR (admin_global) ────────────────────────────
let _configViewHotelId = null; // hotel selecionado no seletor global da Config

function _cfgHotelId() {
  // Retorna o hotel_id a usar em todas as operações de config
  return currentUser?.perfil === 'admin_global'
    ? _configViewHotelId
    : (currentUser?.hotelId || null);
}

function _cfgBlocked() {
  // Bloqueia edições para admin_global sem hotel selecionado
  return currentUser?.perfil === 'admin_global' && !_configViewHotelId;
}

async function _renderConfigHotelSelector() {
  const wrap = document.getElementById('config-global-hotel-selector');
  const aviso = document.getElementById('config-sem-hotel-aviso');
  const conteudo = document.getElementById('config-conteudo');
  if (!wrap) return;

  if (currentUser?.perfil !== 'admin_global') {
    wrap.style.display = 'none';
    if (aviso) aviso.style.display = 'none';
    if (conteudo) conteudo.style.display = 'grid';
    return;
  }

  wrap.style.display = 'block';
  const sel = document.getElementById('cfg-global-hotel-select');
  if (sel) {
    const { data } = await supabaseClient.from('hotels').select('id, nome').eq('ativo', true).order('nome');
    sel.innerHTML = '<option value="">— Selecione um hotel para configurar —</option>' +
      (data || []).map(h => `<option value="${h.id}" ${h.id === _configViewHotelId ? 'selected' : ''}>${h.nome}</option>`).join('');
  }

  const semHotel = !_configViewHotelId;
  if (aviso) aviso.style.display = semHotel ? 'block' : 'none';
  if (conteudo) conteudo.style.display = semHotel ? 'none' : 'grid';

  const hint = document.getElementById('config-hotel-hint');
  if (hint) {
    const h = (document.getElementById('cfg-global-hotel-select') || {});
    const nomeHotel = h.options?.[h.selectedIndex]?.text || '';
    hint.textContent = _configViewHotelId
      ? `Exibindo configurações de: ${nomeHotel}`
      : 'Selecione um hotel para visualizar e editar suas configurações.';
  }
}

async function _onConfigHotelChange(hotelId) {
  _configViewHotelId = hotelId || null;
  await _renderConfigHotelSelector();
  if (_configViewHotelId) await _recarregarTodasSections();
}

async function _recarregarTodasSections() {
  await Promise.all([
    renderConfigTurnos(),
    renderConfigTipos(),
    renderConfigAndares(),
    renderConfigTiposLimpeza(),
    renderConfigParametrosLimpeza(),
    renderConfigSolicitantes(),
    renderConfigMotivos(),
    renderConfigChecklist(),
    renderConfigMotivosPausa(),
    renderConfigStatusApto(),
    renderConfigStatusGov(),
    (typeof renderConfigAptoTiposCats === 'function' ? renderConfigAptoTiposCats() : Promise.resolve()),
  ]);
}

// ── RENDER PÁGINA CONFIG ──────────────────────────────────────
async function renderConfigPage() {
  if (!canAccess('config')) return;
  await _renderConfigHotelSelector();
  if (!_cfgBlocked()) await _recarregarTodasSections();
}

// ── TURNOS ────────────────────────────────────────────────────
let _turnosCache = [];

async function renderConfigTurnos() {
  const el = document.getElementById('config-turnos');
  if (!el) return;

  const hotelId = _cfgHotelId();
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

  const hotelId = _cfgHotelId();
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
  if (_cfgBlocked()) { toast('Selecione um hotel para editar configurações', 'error'); return; }
  const hotel_id = _cfgHotelId();
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

  const hotelId = _cfgHotelId();
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
  if (_cfgBlocked()) { toast('Selecione um hotel para editar configurações', 'error'); return; }
  const hotel_id = _cfgHotelId();
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

  const origem = (typeof _checklistOrigemStatus !== 'undefined' && _checklistOrigemStatus) || apto.status;
  const titulo = origem === 'reprovado'
    ? `Re-limpeza — Apto ${apto.numero}`
    : origem === 'pausado'
    ? `Retomar limpeza — Apto ${apto.numero}`
    : `Limpeza — Apto ${apto.numero}`;
  document.getElementById('checklist-title').textContent = titulo;

  // Limpa estado de pausa, observação e campos de Permanência
  const obsEl = document.getElementById('checklist-obs');
  if (obsEl) obsEl.value = '';
  const reqEl = document.getElementById('checklist-obs-required');
  if (reqEl) reqEl.style.display = 'none';
  const permFields = document.getElementById('checklist-permanencia-fields');
  if (permFields) permFields.style.display = 'none';
  const pessoasEl = document.getElementById('checklist-perm-pessoas');
  if (pessoasEl) pessoasEl.value = '';
  const bagagemEl = document.getElementById('checklist-perm-bagagem');
  if (bagagemEl) bagagemEl.value = '';
  const confirmCb = document.getElementById('checklist-confirmacao');
  if (confirmCb) confirmCb.checked = false;
  const confirmReq = document.getElementById('checklist-confirmacao-required');
  if (confirmReq) confirmReq.style.display = 'none';
  const confirmWrap = document.getElementById('checklist-confirmacao-wrap');
  if (confirmWrap) confirmWrap.style.borderColor = 'var(--border)';
  const confirmLbl = document.getElementById('checklist-confirmacao-label');
  if (confirmLbl) confirmLbl.style.color = 'var(--text2)';

  const hotelId = currentUser?.hotelId;
  let query = supabaseClient.from('checklist_templates').select('nome').eq('ativo', true).order('ordem');
  if (hotelId) query = query.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);

  const [, ckRes] = await Promise.allSettled([
    (typeof _renderTipoLimpezaBtns === 'function' ? _renderTipoLimpezaBtns() : Promise.resolve()),
    query
  ]);

  const { data } = (ckRes.status === 'fulfilled' ? ckRes.value : {}) || {};
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

  const hotelId = _cfgHotelId();
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
  if (_cfgBlocked()) { toast('Selecione um hotel para editar configurações', 'error'); return; }
  const hotel_id = _cfgHotelId();
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

  const hotelId = _cfgHotelId();
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
  if (_cfgBlocked()) { toast('Selecione um hotel para editar configurações', 'error'); return; }
  const hotel_id = _cfgHotelId();
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
  const hotelId = _cfgHotelId();
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
  if (_cfgBlocked()) { toast('Selecione um hotel para editar configurações', 'error'); return; }
  const val = parseInt(document.getElementById('cfg-max-andares')?.value);
  if (!val || val < 1 || val > 99) { toast('Valor inválido (1–99)', 'error'); return; }
  const hotelId = _cfgHotelId();
  if (!hotelId) return;
  const { error } = await supabaseClient.from('hotel_config')
    .upsert({ hotel_id: hotelId, chave: 'max_andares', valor: String(val) }, { onConflict: 'hotel_id,chave' });
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Número de andares salvo!', 'success');
  await renderConfigAndares();
}

// ── PARÂMETROS DE TEMPO DE LIMPEZA ───────────────────────────

async function renderConfigParametrosLimpeza() {
  const hotelId = _cfgHotelId();
  const inpS = document.getElementById('cfg-tempo-saida');
  const inpP = document.getElementById('cfg-tempo-permanencia');
  if (!hotelId) {
    if (inpS) inpS.value = '';
    if (inpP) inpP.value = '';
    return;
  }
  const { data } = await supabaseClient
    .from('hotel_config').select('chave, valor')
    .eq('hotel_id', hotelId)
    .in('chave', ['tempo_padrao_saida','tempo_padrao_permanencia','tempo_padrao_faxina','tempo_padrao_pos_manutencao']);
  const map = Object.fromEntries((data || []).map(r => [r.chave, r.valor]));
  if (inpS) inpS.value = map['tempo_padrao_saida']           || '45';
  if (inpP) inpP.value = map['tempo_padrao_permanencia']     || '25';
  const inpF = document.getElementById('cfg-tempo-faxina');
  const inpM = document.getElementById('cfg-tempo-pos-manutencao');
  if (inpF) inpF.value = map['tempo_padrao_faxina']          || '60';
  if (inpM) inpM.value = map['tempo_padrao_pos_manutencao']  || '30';
}

async function _salvarParametrosLimpeza() {
  if (_cfgBlocked()) { toast('Selecione um hotel para editar configurações', 'error'); return; }
  const saida = parseInt(document.getElementById('cfg-tempo-saida')?.value);
  const perm  = parseInt(document.getElementById('cfg-tempo-permanencia')?.value);
  const fax   = parseInt(document.getElementById('cfg-tempo-faxina')?.value);
  const pos   = parseInt(document.getElementById('cfg-tempo-pos-manutencao')?.value);
  if (!saida||saida<1||!perm||perm<1||!fax||fax<1||!pos||pos<1) { toast('Valores inválidos (mínimo 1 min)', 'error'); return; }
  const hotelId = _cfgHotelId();
  if (!hotelId) { toast('Hotel não identificado', 'error'); return; }
  const { error } = await supabaseClient.from('hotel_config').upsert([
    { hotel_id: hotelId, chave: 'tempo_padrao_saida',            valor: String(saida) },
    { hotel_id: hotelId, chave: 'tempo_padrao_permanencia',      valor: String(perm)  },
    { hotel_id: hotelId, chave: 'tempo_padrao_faxina',           valor: String(fax)   },
    { hotel_id: hotelId, chave: 'tempo_padrao_pos_manutencao',   valor: String(pos)   },
  ], { onConflict: 'hotel_id,chave' });
  if (error) { toast('Erro ao salvar: ' + error.message, 'error'); return; }
  toast('Parâmetros de tempo salvos!', 'success');
}

// ── TIPOS DE LIMPEZA ──────────────────────────────────────────
let _tiposLimpezaCache = [];

async function renderConfigTiposLimpeza() {
  const el = document.getElementById('config-tipos-limpeza');
  if (!el) return;
  const hotelId = _cfgHotelId();
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
  if (_cfgBlocked()) { toast('Selecione um hotel para editar configurações', 'error'); return; }
  const hotel_id = _cfgHotelId();
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
  const hotelId = _cfgHotelId();
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
  if (_cfgBlocked()) { toast('Selecione um hotel para editar configurações', 'error'); return; }
  const hotel_id = _cfgHotelId();
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


// ── STATUS APTO ──────────────────────────────────────────────
let _statusAptoCache = [];
async function renderConfigStatusApto() {
  const el = document.getElementById('config-status-apto');
  if (!el) return;
  const hotelId = _cfgHotelId();
  let q = supabaseClient.from('status_apto_opcoes').select('*').order('ordem');
  if (hotelId) q = q.eq('hotel_id', hotelId);
  const { data } = await q;
  _statusAptoCache = data || [];
  el.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:flex-end;">
      <input type="text" id="new-sao-nome" placeholder="Ex: Ocupado, Vago, Bloqueado..."
        style="flex:1;min-width:140px;padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;"
        onkeydown="if(event.key==='Enter') _addStatusApto()">
      <input type="color" id="new-sao-cor" value="#6b7280" title="Cor do badge" style="width:38px;height:36px;border:1.5px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;">
      <button class="btn btn-primary btn-sm" onclick="_addStatusApto()">+ Adicionar</button>
    </div>
    <div>${_statusAptoCache.map(o => _rowStatusOpcao(o, 'sao')).join('')}</div>`;
}

// ── STATUS GOVERNANÇA ─────────────────────────────────────────
let _statusGovCache = [];
async function renderConfigStatusGov() {
  const el = document.getElementById('config-status-gov');
  if (!el) return;
  const hotelId = _cfgHotelId();
  let q = supabaseClient.from('status_governanca_opcoes').select('*').order('ordem');
  if (hotelId) q = q.eq('hotel_id', hotelId);
  const { data } = await q;
  _statusGovCache = data || [];
  el.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:flex-end;">
      <input type="text" id="new-sgo-nome" placeholder="Ex: Limpo, Sujo, Não Perturbe..."
        style="flex:1;min-width:140px;padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;"
        onkeydown="if(event.key==='Enter') _addStatusGov()">
      <input type="color" id="new-sgo-cor" value="#6b7280" title="Cor do badge" style="width:38px;height:36px;border:1.5px solid var(--border);border-radius:var(--radius-sm);cursor:pointer;">
      <button class="btn btn-primary btn-sm" onclick="_addStatusGov()">+ Adicionar</button>
    </div>
    <div>${_statusGovCache.map(o => _rowStatusOpcao(o, 'sgo')).join('')}</div>`;
}

function _rowStatusOpcao(o, prefix) {
  const cor = o.cor || '#6b7280';
  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);gap:8px;" id="${prefix}-row-${o.id}">
    <div style="display:flex;align-items:center;gap:8px;flex:1;">
      <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${cor};flex-shrink:0;"></span>
      <span id="${prefix}-text-${o.id}" style="font-size:13px;${!o.ativo?'text-decoration:line-through;color:var(--text3);':''}">${o.nome}</span>
      ${!o.ativo?'<span class="badge badge-bloqueado" style="font-size:10px;">Inativo</span>':''}
    </div>
    <div id="${prefix}-edit-${o.id}" style="display:none;flex:1;gap:8px;align-items:center;">
      <input type="text" id="${prefix}-input-${o.id}" value="${o.nome}"
        style="flex:1;padding:5px 8px;border:1.5px solid var(--primary-light);border-radius:var(--radius-sm);font-size:13px;"
        onkeydown="if(event.key==='Enter') _saveStatusOpcao('${o.id}','${prefix}')">
      <input type="color" id="${prefix}-cor-${o.id}" value="${cor}" style="width:32px;height:30px;border:1.5px solid var(--border);border-radius:4px;cursor:pointer;">
    </div>
    <div style="display:flex;gap:4px;flex-shrink:0;">
      <button class="btn btn-ghost btn-xs" id="${prefix}-btn-edit-${o.id}" onclick="_editStatusOpcao('${o.id}','${prefix}')" title="Editar">✏️</button>
      <button class="btn btn-ghost btn-xs" id="${prefix}-btn-save-${o.id}" style="display:none;" onclick="_saveStatusOpcao('${o.id}','${prefix}')" title="Salvar">💾</button>
      <button class="btn btn-ghost btn-xs" id="${prefix}-btn-cancel-${o.id}" style="display:none;" onclick="${prefix==='sao'?'renderConfigStatusApto':'renderConfigStatusGov'}()" title="Cancelar">✕</button>
      <button class="btn btn-ghost btn-xs" onclick="_toggleStatusOpcao('${o.id}','${prefix}',${o.ativo})" title="${o.ativo?'Inativar':'Ativar'}">${o.ativo?'⏸':'▶'}</button>
      <button class="btn btn-ghost btn-xs" style="color:var(--danger);" onclick="_delStatusOpcao('${o.id}','${prefix}')" title="Excluir">🗑</button>
    </div>
  </div>`;
}
function _editStatusOpcao(id, prefix) {
  document.getElementById(`${prefix}-text-${id}`).closest('div').style.display = 'none';
  document.getElementById(`${prefix}-edit-${id}`).style.display = 'flex';
  document.getElementById(`${prefix}-btn-edit-${id}`).style.display = 'none';
  document.getElementById(`${prefix}-btn-save-${id}`).style.display = '';
  document.getElementById(`${prefix}-btn-cancel-${id}`).style.display = '';
  document.getElementById(`${prefix}-input-${id}`)?.focus();
}
async function _saveStatusOpcao(id, prefix) {
  const tabela = prefix === 'sao' ? 'status_apto_opcoes' : 'status_governanca_opcoes';
  const nome = document.getElementById(`${prefix}-input-${id}`)?.value.trim();
  const cor  = document.getElementById(`${prefix}-cor-${id}`)?.value || '#6b7280';
  if (!nome) { toast('Informe o nome', 'error'); return; }
  const { error } = await supabaseClient.from(tabela).update({ nome, cor }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Salvo!', 'success');
  prefix === 'sao' ? await renderConfigStatusApto() : await renderConfigStatusGov();
  if (typeof _loadStatusOpcoes === 'function') await _loadStatusOpcoes();
}
async function _addStatusApto() {
  const nome = document.getElementById('new-sao-nome')?.value.trim();
  const cor  = document.getElementById('new-sao-cor')?.value || '#6b7280';
  if (!nome) { toast('Informe o nome', 'error'); return; }
  if (_cfgBlocked()) { toast('Selecione um hotel', 'error'); return; }
  const { error } = await supabaseClient.from('status_apto_opcoes').insert([{ nome, cor, hotel_id: _cfgHotelId(), ativo: true, ordem: (_statusAptoCache.length || 0) + 1 }]);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  document.getElementById('new-sao-nome').value = '';
  toast('Adicionado!', 'success'); await renderConfigStatusApto();
  if (typeof _loadStatusOpcoes === 'function') await _loadStatusOpcoes();
}
async function _addStatusGov() {
  const nome = document.getElementById('new-sgo-nome')?.value.trim();
  const cor  = document.getElementById('new-sgo-cor')?.value || '#6b7280';
  if (!nome) { toast('Informe o nome', 'error'); return; }
  if (_cfgBlocked()) { toast('Selecione um hotel', 'error'); return; }
  const { error } = await supabaseClient.from('status_governanca_opcoes').insert([{ nome, cor, hotel_id: _cfgHotelId(), ativo: true, ordem: (_statusGovCache.length || 0) + 1 }]);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  document.getElementById('new-sgo-nome').value = '';
  toast('Adicionado!', 'success'); await renderConfigStatusGov();
  if (typeof _loadStatusOpcoes === 'function') await _loadStatusOpcoes();
}
async function _toggleStatusOpcao(id, prefix, ativo) {
  const tabela = prefix === 'sao' ? 'status_apto_opcoes' : 'status_governanca_opcoes';
  await supabaseClient.from(tabela).update({ ativo: !ativo }).eq('id', id);
  prefix === 'sao' ? await renderConfigStatusApto() : await renderConfigStatusGov();
}
async function _delStatusOpcao(id, prefix) {
  if (!confirm('Excluir este status?')) return;
  const tabela = prefix === 'sao' ? 'status_apto_opcoes' : 'status_governanca_opcoes';
  await supabaseClient.from(tabela).delete().eq('id', id);
  toast('Excluído!', 'success');
  prefix === 'sao' ? await renderConfigStatusApto() : await renderConfigStatusGov();
}

// ── REPLICAR CONFIG DO HOTEL GRAN ESTANPLAZA ─────────────────
async function _replicarConfigGranEstanplaza(novoHotelId) {
  if (!novoHotelId) return;

  // Busca o ID do Hotel Gran Estanplaza
  const { data: hotelOrigem } = await supabaseClient
    .from('hotels').select('id').ilike('nome', '%gran estanplaza%').single();
  if (!hotelOrigem) { console.warn('Hotel Gran Estanplaza não encontrado para replicação'); return; }
  const origemId = hotelOrigem.id;

  const tabelas = [
    { tabela: 'turnos',                    colunas: ['nome', 'label', 'inicio', 'fim', 'periodo', 'numero', 'ativo', 'ordem'] },
    { tabela: 'chamado_tipos',             colunas: ['nome', 'departamento', 'ativo', 'ordem'] },
    { tabela: 'checklist_templates',       colunas: ['nome', 'ativo', 'ordem'] },
    { tabela: 'solicitantes',              colunas: ['nome', 'ativo', 'ordem'] },
    { tabela: 'motivos_reprovacao',        colunas: ['nome', 'ativo', 'ordem'] },
    { tabela: 'tipos_limpeza',             colunas: ['nome', 'ativo', 'ordem'] },
    { tabela: 'motivos_pausa',             colunas: ['nome', 'ativo', 'ordem'] },
  ];

  for (const { tabela, colunas } of tabelas) {
    const { data } = await supabaseClient.from(tabela).select(colunas.join(','))
      .eq('hotel_id', origemId);
    if (!data || !data.length) continue;
    const registros = data.map(r => {
      const obj = { hotel_id: novoHotelId };
      colunas.forEach(c => { if (r[c] !== undefined) obj[c] = r[c]; });
      return obj;
    });
    await supabaseClient.from(tabela).insert(registros);
  }

  // Replica hotel_config (parâmetros e andares)
  const { data: cfgData } = await supabaseClient.from('hotel_config')
    .select('chave, valor').eq('hotel_id', origemId);
  if (cfgData?.length) {
    const cfgRegistros = cfgData.map(r => ({ hotel_id: novoHotelId, chave: r.chave, valor: r.valor }));
    await supabaseClient.from('hotel_config').upsert(cfgRegistros, { onConflict: 'hotel_id,chave' });
  }
}

// Rendering chamado diretamente por renderConfig() em index.html
