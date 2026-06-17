// ================================================================
// APARTMENTS SERVICE — Gov Estancorp
// Gerenciamento de apartamentos vinculados ao hotel
// Depende de: supabase-client.js, auth.js
// ================================================================

let _editingAptoId  = null;
let _aptoViewHotelId = null; // hotel selecionado na visualização (admin_global)
let _checklistOrigemStatus = null; // status anterior ao abrir o checklist de limpeza (para cancelar reverter)
let _limpandoOrfaosVerificado = false; // garante que a limpeza de órfãos roda só uma vez por sessão

// ── SINCRONIZAR COM SUPABASE ──────────────────────────────────

async function syncApartamentos() {
  const hotelId = currentUser.perfil === 'admin_global'
    ? _aptoViewHotelId
    : currentUser.hotelId;

  if (!hotelId) return;

  const { data: aptosData, error: aptosErr } = await supabaseClient
    .from('apartments')
    .select('*')
    .eq('hotel_id', hotelId)
    .order('andar')
    .order('numero');

  if (aptosErr) {
    console.error('Erro apartments:', aptosErr.message);
    return;
  }

  // Resolve nomes de camareira via user_profiles (maid_id armazena user_profiles.user_id)
  const maidIdsRaw = [...new Set((aptosData || []).filter(a => a.maid_id).map(a => a.maid_id))];
  let _camNamesExtra = {};
  if (maidIdsRaw.length) {
    const { data: profs } = await supabaseClient
      .from('user_profiles').select('user_id, nome').in('user_id', maidIdsRaw);
    (profs || []).forEach(p => { _camNamesExtra[p.user_id] = p.nome; });
  }

  // Mapeia para o formato local (compatível com mapa/kanban/dashboard)
  aptos = (aptosData || []).map((a, i) => ({
    id:           a.id,
    numero:       a.numero,
    andar:        a.andar,
    tipo:         a.tipo        || 'Standard',
    categoria:    a.categoria   || 'Regular',
    status:       a.status,
    leitos:       a.leitos      || 2,
    camareira_id: a.maid_id     || null,
    obs:          a.obs         || '',
    prioridade:   a.prioridade  || false,
    hotel_id:     a.hotel_id,
    ativo:        a.ativo !== false,
    _maid_nome:   _camNamesExtra[a.maid_id] || null,
    status_at:    a.updated_at  || null,
    avId:         (i % 6) + 1,
  }));

  // Sincroniza equipe do mesmo hotel via user_profiles
  await _syncEquipe(hotelId);

  // Atualiza badge do menu (confCount depende de aptos frescos)
  if (typeof buildSidebar === 'function') buildSidebar();

  // Na primeira carga da sessão, reverte apts em limpando órfãos (sem processo ativo)
  if (!_limpandoOrfaosVerificado) {
    _limpandoOrfaosVerificado = true;
    await _limparLimpandoOrfaos();
  }
}

// Reverte para sujo qualquer apt em limpando cujo processo foi abandonado:
// status_at > 1h e nenhum checklist ativo neste cliente para ele.
async function _limparLimpandoOrfaos() {
  const LIMITE_MS = 1 * 60 * 60 * 1000; // 1 hora
  const agora = Date.now();
  const orfaos = aptos.filter(a => {
    if (a.status !== 'limpando') return false;
    // Preserva o apto que está com checklist aberto agora neste cliente
    if (a.id === selectedAptoId && _checklistOrigemStatus !== null) return false;
    const ts = a.status_at ? new Date(a.status_at).getTime() : 0;
    return (agora - ts) > LIMITE_MS;
  });
  if (!orfaos.length) return;
  for (const a of orfaos) {
    await mudarStatusApto(
      a.id, 'sujo',
      `Limpeza encerrada automaticamente — processo não concluído (inativo há mais de 2h)`
    );
  }
  toast(`${orfaos.length} apto(s) em limpeza sem processo ativo foram revertidos para Sujo`, 'warning');
}

// ── POPULAR SELECT DE CAMAREIRA (de user_profiles) ───────────
async function _popularCamareiraSelect(selectedId, hotelId) {
  const sel = document.getElementById('ca-camareira');
  if (!sel) return;
  const hId = hotelId || currentUser.hotelId;
  let q = supabaseClient.from('user_profiles')
    .select('user_id, nome').eq('perfil', 'camareira').eq('ativo', true).order('nome');
  if (hId) q = q.eq('hotel_id', hId);
  const { data } = await q;
  sel.innerHTML = '<option value="">Não atribuída</option>' +
    (data || []).map(u =>
      `<option value="${u.user_id}" ${u.user_id === selectedId ? 'selected' : ''}>${u.nome}</option>`
    ).join('');
}

async function _syncEquipe(hotelId) {
  const { data } = await supabaseClient
    .from('user_profiles')
    .select('user_id, nome, perfil, ativo, turnos(label)')
    .in('perfil', ['camareira', 'manutencao'])
    .eq('hotel_id', hotelId)
    .eq('ativo', true)
    .order('nome');

  const cargoMap = { camareira: 'Camareira', manutencao: 'Manutenção' };
  equipe = (data || []).map((u, i) => ({
    id:         u.user_id,
    user_id:    u.user_id,
    nome:       u.nome,
    cargo:      cargoMap[u.perfil] || u.perfil,
    andar:      'Todos',
    turno:      u.turnos?.label || '—',
    status:     'ativo',
    hotel_id:   hotelId,
    aptos_hoje: 0,
    avId:       (i % 6) + 1,
    _source:    'user_profiles',
  }));
}

// ── RENDER PÁGINA PRINCIPAL ───────────────────────────────────

async function renderApartamentos() {
  // Controla visibilidade do seletor de hotel (admin_global)
  const selectorWrap = document.getElementById('apto-hotel-selector');
  if (selectorWrap) {
    if (currentUser.perfil === 'admin_global') {
      selectorWrap.style.display = 'block';
      await _popularSeletorHotelPagina();
    } else {
      _aptoViewHotelId = currentUser.hotelId;
      if (typeof _renderHotelChip === 'function') _renderHotelChip('apto-hotel-selector');
      else selectorWrap.style.display = 'none';
    }
  }

  // Cadastro/lote/exclusão restrito a admin; gestor e demais não veem
  const _isAdminUser = ['admin_global','admin_hotel'].includes(currentUser.perfil);
  const btnCadastrar = document.getElementById('btn-cadastrar-apto');
  if (btnCadastrar) btnCadastrar.style.display = _isAdminUser ? '' : 'none';
  const btnLote = document.getElementById('btn-gerar-lote');
  if (btnLote) btnLote.style.display = _isAdminUser ? '' : 'none';

  if (!_aptoViewHotelId) {
    const tbody = document.getElementById('cadastro-table-body');
    if (tbody) tbody.innerHTML = `
      <tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text3);">
        Selecione um hotel para visualizar os apartamentos.
      </td></tr>`;
    return;
  }

  const tbody = document.getElementById('cadastro-table-body');
  if (tbody) tbody.innerHTML = `
    <tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text3);">
      <div class="spinner" style="margin:0 auto 8px;border-top-color:var(--primary-light);"></div>
      Carregando apartamentos...
    </td></tr>`;

  await syncApartamentos();
  populateSelects();
  renderCadastroTableDb();
}

async function _popularSeletorHotelPagina() {
  const sel = document.getElementById('apto-hotel-select');
  if (!sel) return;
  const { data } = await supabaseClient
    .from('hotels')
    .select('id, nome')
    .eq('ativo', true)
    .order('nome');
  sel.innerHTML = '<option value="">Selecione um hotel...</option>' +
    (data || []).map(h =>
      `<option value="${h.id}" ${h.id === _aptoViewHotelId ? 'selected' : ''}>${h.nome}</option>`
    ).join('');
}

async function selecionarHotelApto(hotelId) {
  _aptoViewHotelId = hotelId || null;
  await renderApartamentos();
}

// ── RENDER TABELA ─────────────────────────────────────────────

function renderCadastroTableDb(filter = '') {
  const isCamareira = currentUser.perfil === 'camareira';
  const _isAdmin    = ['admin_global','admin_hotel'].includes(currentUser.perfil);
  let lista = aptos.filter(a => a.ativo !== false);

  if (filter) {
    const q = filter.toLowerCase();
    lista = lista.filter(a =>
      a.numero.toLowerCase().includes(q) ||
      String(a.andar).includes(q) ||
      a.tipo.toLowerCase().includes(q)
    );
  }

  const tbody = document.getElementById('cadastro-table-body');
  if (!tbody) return;

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text3);">
      Nenhum apartamento encontrado.
    </td></tr>`;
    return;
  }

  // Agrupa por andar para melhor visualização
  const andares = [...new Set(lista.map(a => a.andar))].sort((x, y) => x - y);
  let html = '';

  andares.forEach(andar => {
    const do_andar = lista.filter(a => a.andar === andar);
    // Linha de separação por andar
    html += `<tr>
      <td colspan="8" style="background:var(--surface2);font-size:11px;font-weight:700;
        text-transform:uppercase;letter-spacing:0.5px;color:var(--text2);padding:8px 14px;">
        🏢 ${andar}º Andar — ${do_andar.length} apartamento${do_andar.length !== 1 ? 's' : ''}
      </td>
    </tr>`;

    do_andar.forEach(a => {
      const cam = equipe.find(e => e.id === a.camareira_id);
      const statusColor = {
        livre:'#27ae60', sujo:'#e67e22', limpando:'#2e86c1', pausado:'#f39c12',
        conferencia:'#8e44ad', limpo:'#1abc9c', reprovado:'#e74c3c',
        bloqueado:'#c0392b', ocupado:'#7f8c8d', manutencao:'#f1c40f'
      }[a.status] || '#999';

      html += `<tr>
        <td>
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="width:4px;height:32px;border-radius:2px;background:${statusColor};flex-shrink:0;"></div>
            <strong style="font-size:15px;">${a.numero}</strong>
            ${a.prioridade ? '<span title="Prioridade" style="color:var(--danger);">⚠️</span>' : ''}
          </div>
        </td>
        <td>${a.andar}º</td>
        <td>${a.tipo}</td>
        <td><span class="badge" style="background:#eef;color:#556;">${a.categoria}</span></td>
        <td>${a.leitos} leito${a.leitos !== 1 ? 's' : ''}</td>
        <td><span class="badge badge-${a.status}">${a.status}</span></td>
        <td>${cam
          ? `<div style="font-size:12px;font-weight:600;">${cam.nome}</div>`
          : '<span style="color:var(--text3);font-size:12px;">—</span>'
        }</td>
        <td>
          ${!isCamareira
            ? `<button class="btn btn-ghost btn-xs" onclick="openAptoForm('${a.id}')" title="Editar">✏️</button>`
            : ''}
          <button class="btn btn-ghost btn-xs" onclick="openAptoDetail('${a.id}')" title="Ver detalhes">👁</button>
          ${!isCamareira
            ? `<button class="btn btn-ghost btn-xs" onclick="alterarStatusRapido('${a.id}')" title="Status">🔄</button>`
            : ''}
          ${_isAdmin
            ? `<button class="btn btn-ghost btn-xs" onclick="confirmarExclusaoApto('${a.id}','${a.numero}')" title="Excluir apartamento" style="color:var(--danger);">🗑️</button>`
            : ''}
        </td>
      </tr>`;
    });
  });

  tbody.innerHTML = html;
}

// Substituição do searchAptos original
function searchAptos(q) { renderCadastroTableDb(q); }

// ── FORMULÁRIO DE APARTAMENTO ─────────────────────────────────

async function openAptoForm(id = null) {
  if (!['admin_global','admin_hotel'].includes(currentUser.perfil)) {
    toast('Somente administradores podem cadastrar apartamentos', 'error'); return;
  }
  if (!requireWrite('apartments')) return;
  _editingAptoId = id;
  const isEdit   = !!id;

  document.getElementById('modal-cadastro-apto-title').textContent = isEdit
    ? 'Editar Apartamento' : 'Cadastrar Apartamento';

  // Limpar campos
  ['ca-numero','ca-obs'].forEach(fId => {
    const el = document.getElementById(fId);
    if (el) el.value = '';
  });
  document.getElementById('ca-leitos').value = '2';
  document.getElementById('ca-status').value = 'livre';
  await _populateAptoTipoSelect();
  await _populateAptoCatSelect();

  // Seletor de hotel — visível apenas para admin_global
  const hotelWrap = document.getElementById('ca-hotel-wrap');
  let _formHotelId = currentUser.hotelId;
  if (hotelWrap) {
    if (currentUser.perfil === 'admin_global') {
      hotelWrap.style.display = '';
      await _populateCaHotelSelect();
      _formHotelId = _aptoViewHotelId;
    } else {
      hotelWrap.style.display = 'none';
    }
  }

  // Preencher campos se editando
  let _selectedCamId = null;
  if (isEdit) {
    const a = aptos.find(x => x.id === id);
    if (a) {
      document.getElementById('ca-numero').value = a.numero;
      document.getElementById('ca-leitos').value = a.leitos;
      await _populateAptoTipoSelect(a.tipo);
      await _populateAptoCatSelect(a.categoria);
      document.getElementById('ca-status').value = a.status;
      document.getElementById('ca-obs').value    = a.obs || '';
      _selectedCamId = a.camareira_id || null;
      if (_formHotelId === null) _formHotelId = a.hotel_id;
    }
  }

  const _savedAndar = isEdit ? (aptos.find(x => x.id === id)?.andar || 1) : 1;
  await _populateAndarSelect(_formHotelId, _savedAndar);
  await _popularCamareiraSelect(_selectedCamId, _formHotelId);

  openModal('modal-cadastro-apto');
  document.getElementById('ca-numero').focus();
}

async function _populateCaHotelSelect() {
  const sel = document.getElementById('ca-hotel-id');
  if (!sel) return;
  const { data } = await supabaseClient
    .from('hotels').select('id, nome').eq('ativo', true).order('nome');
  sel.innerHTML = '<option value="">Selecione o hotel *</option>' +
    (data || []).map(h =>
      `<option value="${h.id}" ${h.id === _aptoViewHotelId ? 'selected' : ''}>${h.nome}</option>`
    ).join('');
}

// Override do salvarCadastroApto do inline script
async function salvarCadastroApto() {
  if (!requireWrite('apartments')) return;
  const numero    = document.getElementById('ca-numero').value.trim();
  const andar     = parseInt(document.getElementById('ca-andar').value);
  const leitos    = parseInt(document.getElementById('ca-leitos').value);
  const tipo      = document.getElementById('ca-tipo').value;
  const categoria = document.getElementById('ca-categoria').value;
  const status    = document.getElementById('ca-status').value;
  const maid_id   = document.getElementById('ca-camareira').value || null;
  const obs       = document.getElementById('ca-obs').value.trim() || null;

  let hotel_id = currentUser.perfil === 'admin_global'
    ? (document.getElementById('ca-hotel-id')?.value || _aptoViewHotelId)
    : currentUser.hotelId;

  if (!numero)   { toast('Informe o número do apartamento', 'error'); return; }
  if (!hotel_id) { toast('Selecione o hotel', 'error'); return; }
  if (!andar || andar < 1) { toast('Andar inválido', 'error'); return; }

  const btn = document.getElementById('btn-salvar-apto');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  const payload = { numero, andar, leitos, tipo, categoria, status, maid_id, obs, hotel_id };

  let error;
  if (_editingAptoId) {
    ({ error } = await supabaseClient.from('apartments').update(payload).eq('id', _editingAptoId));
  } else {
    ({ error } = await supabaseClient.from('apartments').insert([payload]));
  }

  if (btn) { btn.disabled = false; btn.textContent = 'Salvar apartamento'; }

  if (error) { toast('Erro: ' + error.message, 'error'); return; }

  closeModal('modal-cadastro-apto');
  toast(_editingAptoId ? 'Apartamento atualizado!' : 'Apartamento cadastrado!', 'success');
  _editingAptoId = null;

  await syncApartamentos();
  renderCadastroTableDb();
  populateSelects();
  if (currentPage === 'mapa')   renderMapa();
  if (currentPage === 'kanban') renderKanban();
}

// ── EXCLUSÃO DE APARTAMENTO ──────────────────────────────────

let _excluindoAptoId   = null;
let _excluindoAptoNum  = null;

function confirmarExclusaoApto(id, numero) {
  if (!requireWrite('apartments')) return;
  _excluindoAptoId  = id;
  _excluindoAptoNum = numero;

  const el = document.getElementById('excluir-apto-numero');
  if (el) el.textContent = numero;

  const btn = document.getElementById('btn-confirmar-excluir-apto');
  if (btn) { btn.disabled = false; btn.textContent = '🗑️ Excluir permanentemente'; }

  openModal('modal-excluir-apto');
}

async function executarExclusaoApto() {
  if (!_excluindoAptoId) return;

  const btn = document.getElementById('btn-confirmar-excluir-apto');
  if (btn) { btn.disabled = true; btn.textContent = 'Excluindo...'; }

  const id = _excluindoAptoId;

  // 1. Busca IDs dos chamados vinculados
  const { data: chamados } = await supabaseClient
    .from('work_orders').select('id').eq('apartment_id', id);
  const chamadoIds = (chamados || []).map(c => c.id);

  // 2. Apaga histórico dos chamados
  if (chamadoIds.length) {
    await supabaseClient.from('chamado_historico').delete().in('chamado_id', chamadoIds);
  }

  // 3. Apaga chamados
  await supabaseClient.from('work_orders').delete().eq('apartment_id', id);

  // 4. Apaga checklists de limpeza
  await supabaseClient.from('limpeza_checklists').delete().eq('apartment_id', id);

  // 5. Apaga pendências / retrabalho
  await supabaseClient.from('pendencias_retrabalho').delete().eq('apartment_id', id);

  // 6. Apaga histórico de status
  await supabaseClient.from('apartment_status_history').delete().eq('apartment_id', id);

  // 7. Apaga o apartamento
  const { error } = await supabaseClient.from('apartments').delete().eq('id', id);

  if (btn) { btn.disabled = false; btn.textContent = '🗑️ Excluir permanentemente'; }

  if (error) {
    toast('Erro ao excluir: ' + error.message, 'error');
    return;
  }

  closeModal('modal-excluir-apto');
  toast(`Apartamento ${_excluindoAptoNum} excluído com sucesso.`, 'success');
  _excluindoAptoId  = null;
  _excluindoAptoNum = null;

  await syncApartamentos();
  renderCadastroTableDb();
  populateSelects();
  if (currentPage === 'mapa')   renderMapa();
  if (currentPage === 'kanban') renderKanban();
}

// ── CADASTRO EM LOTE ─────────────────────────────────────────

let _loteNovos      = [];
let _loteDuplicados = [];
let _loteHotelId    = null;
let _lotePreviewOk  = false;

async function openGerarLoteModal() {
  if (!['admin_global','admin_hotel'].includes(currentUser.perfil)) {
    toast('Somente administradores podem gerar apartamentos em lote', 'error'); return;
  }
  if (!requireWrite('apartments')) return;

  _loteNovos = []; _loteDuplicados = []; _loteHotelId = null; _lotePreviewOk = false;

  document.getElementById('gl-stage-config').style.display  = '';
  document.getElementById('gl-stage-preview').style.display = 'none';
  const btnCriar = document.getElementById('btn-criar-lote');
  if (btnCriar) { btnCriar.disabled = true; btnCriar.textContent = '✅ Criar apartamentos'; }

  // Hotel: admin_global vê select; outros têm hotel fixado
  const hotelWrap = document.getElementById('gl-hotel-wrap');
  if (hotelWrap) {
    if (currentUser.perfil === 'admin_global') {
      hotelWrap.style.display = '';
      const sel = document.getElementById('gl-hotel-id');
      if (sel) {
        const { data } = await supabaseClient
          .from('hotels').select('id, nome').eq('ativo', true).order('nome');
        sel.innerHTML = '<option value="">Selecione o hotel *</option>' +
          (data || []).map(h =>
            `<option value="${h.id}" ${h.id === _aptoViewHotelId ? 'selected' : ''}>${h.nome}</option>`
          ).join('');
      }
    } else {
      hotelWrap.style.display = 'none';
    }
  }

  // Limpar / resetar campos
  document.getElementById('gl-andar-ini').value     = '1';
  document.getElementById('gl-qtd-andares').value   = '1';
  document.getElementById('gl-qtd-por-andar').value = '4';
  document.getElementById('gl-num-ini').value       = '1';
  document.getElementById('gl-digitos').value       = '2';
  document.getElementById('gl-leitos').value        = '2';
  document.getElementById('gl-obs').value           = '';

  // Popula tipo/categoria e max andares a partir do banco
  await _populateGlTipoSelect();
  await _populateGlCatSelect();
  await _populateGlAndarMax(_loteHotelId || currentUser.hotelId);
  document.getElementById('gl-status').value = 'livre';

  // Camareira
  const hotelIdParaCam = currentUser.perfil === 'admin_global'
    ? (_aptoViewHotelId || null)
    : currentUser.hotelId;
  await _popularGlCamareiraSelect(null, hotelIdParaCam);

  _atualizarGlExemplo();
  openModal('modal-gerar-lote');
}

async function _populateGlTipoSelect(selected) {
  const sel = document.getElementById('gl-tipo');
  if (!sel) return;
  const itens = await _loadAptoOpcoes('apto_tipos');
  const ativos = itens.filter(i => i.ativo);
  sel.innerHTML = ativos.map((v, idx) =>
    `<option value="${v.nome}" ${v.nome === (selected || ativos[0]?.nome) ? 'selected' : ''}>${v.nome}</option>`
  ).join('');
}

async function _populateGlCatSelect(selected) {
  const sel = document.getElementById('gl-categoria');
  if (!sel) return;
  const itens = await _loadAptoOpcoes('apto_categorias');
  const ativos = itens.filter(i => i.ativo);
  sel.innerHTML = ativos.map((v, idx) =>
    `<option value="${v.nome}" ${v.nome === (selected || ativos[0]?.nome) ? 'selected' : ''}>${v.nome}</option>`
  ).join('');
}

async function _populateAndarSelect(hotelId, selected) {
  const sel = document.getElementById('ca-andar');
  if (!sel) return;
  let maxAndares = 12;
  if (hotelId) {
    const { data } = await supabaseClient.from('hotel_config')
      .select('valor').eq('hotel_id', hotelId).eq('chave', 'max_andares').single();
    if (data) maxAndares = parseInt(data.valor) || 12;
  }
  const val = selected || 1;
  sel.innerHTML = Array.from({ length: maxAndares }, (_, i) => i + 1)
    .map(n => `<option value="${n}" ${n === Number(val) ? 'selected' : ''}>${n}º</option>`)
    .join('');
}

async function _populateGlAndarMax(hotelId) {
  const inp = document.getElementById('gl-andar-ini');
  if (!inp) return;
  let maxAndares = 12;
  if (hotelId) {
    const { data } = await supabaseClient.from('hotel_config')
      .select('valor').eq('hotel_id', hotelId).eq('chave', 'max_andares').single();
    if (data) maxAndares = parseInt(data.valor) || 12;
  }
  inp.max = maxAndares;
}

async function _populateTipoLimpezaSelect() {
  const sel = document.getElementById('cl-tipo-limpeza');
  if (!sel) return;
  const hotelId = currentUser?.hotelId;
  let q = supabaseClient.from('tipos_limpeza').select('id, nome').eq('ativo', true).order('ordem');
  if (hotelId) q = q.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);
  const { data } = await q;
  const tipos = data?.length ? data : [
    { nome: 'Saída (checkout)' }, { nome: 'Permanência' }, { nome: 'Pós-manutenção' }
  ];
  sel.innerHTML = tipos.map(t => `<option value="${t.nome}">${t.nome}</option>`).join('');
}

async function _popularGlCamareiraSelect(selectedId, hotelId) {
  const sel = document.getElementById('gl-camareira');
  if (!sel) return;
  const hId = hotelId || currentUser.hotelId;
  let q = supabaseClient.from('user_profiles')
    .select('user_id, nome').eq('perfil', 'camareira').eq('ativo', true).order('nome');
  if (hId) q = q.eq('hotel_id', hId);
  const { data } = await q;
  sel.innerHTML = '<option value="">Não atribuída</option>' +
    (data || []).map(u =>
      `<option value="${u.user_id}" ${u.user_id === selectedId ? 'selected' : ''}>${u.nome}</option>`
    ).join('');
}

async function _onGlHotelChange(hotelId) {
  await _popularGlCamareiraSelect(null, hotelId || null);
}

function _gerarNumerosLote(config) {
  const { andarIni, qtdAndares, qtdPorAndar, numIni, digitos } = config;
  const resultado = [];
  for (let a = andarIni; a < andarIni + qtdAndares; a++) {
    for (let s = numIni; s < numIni + qtdPorAndar; s++) {
      const seq    = String(s).padStart(digitos, '0');
      const numero = String(a) + seq;
      resultado.push({ numero, andar: a });
    }
  }
  return resultado;
}

function _atualizarGlExemplo() {
  const el = document.getElementById('gl-exemplo');
  if (!el) return;
  const andarIni    = parseInt(document.getElementById('gl-andar-ini')?.value)     || 1;
  const qtdAndares  = parseInt(document.getElementById('gl-qtd-andares')?.value)   || 1;
  const qtdPorAndar = parseInt(document.getElementById('gl-qtd-por-andar')?.value) || 4;
  const numIni      = parseInt(document.getElementById('gl-num-ini')?.value)       || 1;
  const digitos     = parseInt(document.getElementById('gl-digitos')?.value)       || 2;
  if (!andarIni || !qtdAndares || !qtdPorAndar) { el.textContent = 'Preencha os campos para ver o exemplo.'; return; }
  const gerados   = _gerarNumerosLote({ andarIni, qtdAndares, qtdPorAndar, numIni, digitos });
  const total     = gerados.length;
  const primeiros = gerados.slice(0, 6).map(a => a.numero).join(', ');
  const mais      = total > 6 ? ` ... ${gerados[total-1].numero}` : '';
  el.innerHTML = `<strong>Exemplo:</strong> ${primeiros}${mais} &nbsp;·&nbsp; <strong>${total}</strong> apartamento${total !== 1 ? 's' : ''} no total`;
}

async function previewGerarLote() {
  // Ler hotel
  const hotelId = currentUser.perfil === 'admin_global'
    ? (document.getElementById('gl-hotel-id')?.value || '')
    : currentUser.hotelId;

  const andarIni    = parseInt(document.getElementById('gl-andar-ini').value);
  const qtdAndares  = parseInt(document.getElementById('gl-qtd-andares').value);
  const qtdPorAndar = parseInt(document.getElementById('gl-qtd-por-andar').value);
  const numIni      = parseInt(document.getElementById('gl-num-ini').value);
  const digitos     = parseInt(document.getElementById('gl-digitos').value);

  // Validações
  if (!hotelId)                          { toast('Selecione o hotel', 'error'); return; }
  if (!andarIni    || andarIni < 1)      { toast('Andar inicial deve ser maior que zero', 'error'); return; }
  if (!qtdAndares  || qtdAndares < 1)    { toast('Quantidade de andares deve ser maior que zero', 'error'); return; }
  if (!qtdPorAndar || qtdPorAndar < 1)   { toast('Apartamentos por andar deve ser maior que zero', 'error'); return; }
  if (isNaN(numIni) || numIni < 0)       { toast('Número inicial inválido', 'error'); return; }
  if (!digitos)                          { toast('Selecione a quantidade de dígitos', 'error'); return; }

  const btnPreview = document.getElementById('btn-preview-lote');
  if (btnPreview) { btnPreview.disabled = true; btnPreview.textContent = 'Verificando...'; }

  const gerados = _gerarNumerosLote({ andarIni, qtdAndares, qtdPorAndar, numIni, digitos });

  // Buscar existentes no banco
  const { data: existentes, error } = await supabaseClient
    .from('apartments').select('numero').eq('hotel_id', hotelId).eq('ativo', true);

  if (btnPreview) { btnPreview.disabled = false; btnPreview.textContent = '🔍 Gerar prévia'; }

  if (error) { toast('Erro ao verificar apartamentos: ' + error.message, 'error'); return; }

  const setExist   = new Set((existentes || []).map(a => a.numero));
  _loteNovos       = gerados.filter(a => !setExist.has(a.numero));
  _loteDuplicados  = gerados.filter(a =>  setExist.has(a.numero));
  _loteHotelId     = hotelId;
  _lotePreviewOk   = true;

  // Nome do hotel
  let hotelNome = currentUser.hotelNome || hotelId;
  if (currentUser.perfil === 'admin_global') {
    const sel = document.getElementById('gl-hotel-id');
    if (sel) hotelNome = sel.options[sel.selectedIndex]?.text || hotelId;
  }

  // Montar HTML da prévia
  const andarFinal = andarIni + qtdAndares - 1;
  let html = `
    <div style="background:var(--surface2);padding:12px 14px;border-radius:var(--radius-sm);
                margin-bottom:14px;font-size:13px;line-height:1.7;">
      <div>🏨 <strong>Hotel:</strong> ${hotelNome}</div>
      <div>📐 <strong>Andares:</strong> ${andarIni}º ao ${andarFinal}º &nbsp;·&nbsp;
           ${qtdPorAndar} apto${qtdPorAndar !== 1 ? 's' : ''}/andar</div>
      <div>📊 <strong>Total calculado:</strong> ${gerados.length} apartamentos
           (${_loteNovos.length} novos · ${_loteDuplicados.length} já existem)</div>
    </div>`;

  if (_loteNovos.length) {
    const porAndar = {};
    _loteNovos.forEach(a => { if (!porAndar[a.andar]) porAndar[a.andar] = []; porAndar[a.andar].push(a.numero); });
    html += `<div style="margin-bottom:14px;">
      <div style="font-size:11px;font-weight:700;color:#27ae60;text-transform:uppercase;
                  letter-spacing:0.4px;margin-bottom:8px;">✅ Serão criados (${_loteNovos.length})</div>`;
    Object.entries(porAndar).forEach(([andar, nums]) => {
      html += `<div style="font-size:12px;margin-bottom:3px;">
        <span style="color:var(--text3);min-width:60px;display:inline-block;">${andar}º andar:</span>
        <span style="font-weight:600;">${nums.join(', ')}</span></div>`;
    });
    html += '</div>';
  }

  if (_loteDuplicados.length) {
    const dupNums = _loteDuplicados.map(a => a.numero).join(', ');
    html += `<div style="margin-bottom:14px;">
      <div style="font-size:11px;font-weight:700;color:#e67e22;text-transform:uppercase;
                  letter-spacing:0.4px;margin-bottom:6px;">⚠️ Já existem — serão ignorados (${_loteDuplicados.length})</div>
      <div style="font-size:12px;color:var(--text2);">${dupNums}</div>
    </div>`;
  }

  if (_loteNovos.length === 0) {
    html += `<div style="background:#fef9e7;border:1px solid #f9c74f;padding:10px 14px;
      border-radius:var(--radius-sm);font-size:13px;color:#b7770d;">
      ⚠️ Todos os apartamentos já existem neste hotel. Nenhum será inserido.
    </div>`;
  }

  document.getElementById('gl-preview-content').innerHTML = html;
  document.getElementById('gl-stage-config').style.display  = 'none';
  document.getElementById('gl-stage-preview').style.display = '';

  const btnCriar = document.getElementById('btn-criar-lote');
  if (btnCriar) {
    btnCriar.disabled    = _loteNovos.length === 0;
    btnCriar.textContent = _loteNovos.length
      ? `✅ Criar ${_loteNovos.length} apartamento${_loteNovos.length !== 1 ? 's' : ''}`
      : '✅ Criar apartamentos';
  }
}

function _glVoltarConfig() {
  _lotePreviewOk  = false;
  _loteNovos      = [];
  _loteDuplicados = [];
  document.getElementById('gl-stage-config').style.display  = '';
  document.getElementById('gl-stage-preview').style.display = 'none';
  const btn = document.getElementById('btn-criar-lote');
  if (btn) { btn.disabled = true; btn.textContent = '✅ Criar apartamentos'; }
}

async function confirmarGerarLote() {
  if (!_lotePreviewOk)       { toast('Gere a prévia antes de salvar', 'error'); return; }
  if (!_loteNovos.length)    { toast('Nenhum apartamento novo para inserir', 'error'); return; }

  if (_loteNovos.length > 500) {
    if (!confirm(`Você está prestes a criar ${_loteNovos.length} apartamentos. Confirma?`)) return;
  }

  const tipo      = document.getElementById('gl-tipo')?.value      || 'Standard';
  const categoria = document.getElementById('gl-categoria')?.value || 'Regular';
  const leitos    = parseInt(document.getElementById('gl-leitos')?.value)   || 2;
  const status    = document.getElementById('gl-status')?.value    || 'livre';
  const maid_id   = document.getElementById('gl-camareira')?.value || null;
  const obs       = document.getElementById('gl-obs')?.value?.trim()        || null;

  const payload = _loteNovos.map(a => ({
    numero: a.numero, andar: a.andar, leitos, tipo, categoria, status,
    maid_id: maid_id || null, obs: obs || null,
    hotel_id: _loteHotelId, ativo: true,
  }));

  const btnCriar = document.getElementById('btn-criar-lote');
  if (btnCriar) { btnCriar.disabled = true; btnCriar.textContent = 'Criando...'; }

  const { error } = await supabaseClient.from('apartments').insert(payload);

  if (btnCriar) { btnCriar.disabled = false; }

  if (error) { toast('Erro ao criar apartamentos: ' + error.message, 'error'); return; }

  const criados  = _loteNovos.length;
  const ignorados = _loteDuplicados.length;

  closeModal('modal-gerar-lote');
  toast(
    `${criados} apartamento${criados !== 1 ? 's' : ''} criado${criados !== 1 ? 's' : ''} com sucesso.` +
    (ignorados ? ` ${ignorados} já existiam e foram ignorados.` : ''),
    'success'
  );

  _loteNovos = []; _loteDuplicados = []; _lotePreviewOk = false;

  await syncApartamentos();
  renderCadastroTableDb();
  populateSelects();
  if (currentPage === 'mapa')   renderMapa();
  if (currentPage === 'kanban') renderKanban();
}

// ── ALTERAR STATUS (com escrita no Supabase + histórico) ──────
// Função global — usada pelo mapa, kanban, minha fila e cadastro
window.mudarStatusApto = async function mudarStatusApto(id, novoStatus, obs) {
  obs = obs || null;
  try {
    const apto = aptos.find(a => a.id === id);
    if (!apto) { toast('Apartamento não encontrado', 'error'); return; }

    if (!sameHotel(apto.hotel_id)) {
      toast('Sem permissão: apartamento de outro hotel', 'error'); return;
    }

    const statusAnterior = apto.status;

    const { error } = await supabaseClient
      .from('apartments')
      .update({ status: novoStatus })
      .eq('id', id);

    if (error) { toast('Erro ao salvar: ' + error.message, 'error'); return; }

    // Histórico
    supabaseClient.from('apartment_status_history').insert({
      apartment_id:    id,
      status_anterior: statusAnterior,
      status_novo:     novoStatus,
      alterado_por:    currentUser.id,
      obs:             obs || null,
    }).then(({ error }) => { if (error) console.warn('Histórico status:', error.message); });

    apto.status = novoStatus;
    const label = (_STATUS_LABELS && _STATUS_LABELS[novoStatus]) || novoStatus;
    toast('Apto ' + apto.numero + ' → ' + label, 'success');

    if (typeof closeModal === 'function') closeModal('modal-apto-detail');

    if (currentPage === 'mapa')          renderMapa();
    if (currentPage === 'kanban')        renderKanban();
    if (currentPage === 'minha-fila')    { if (typeof renderMinhaFila === 'function') renderMinhaFila(); }
    if (currentPage === 'dashboard')     renderDashboard();
    if (currentPage === 'app-camareira') renderAppCamareira();
    if (currentPage === 'cadastro-apto') renderCadastroTableDb();

  } catch (e) {
    toast('Erro inesperado: ' + e.message, 'error');
  }
};

// Status que só podem ser atribuídos pelo fluxo — bloqueados no modal manual
const _TS_BLOQUEADOS_MANUAL = new Set(['limpando','pausado','conferencia','limpo','reprovado']);

async function salvarTrocarStatus() {
  const aptoNum    = document.getElementById('ts-apto').value;
  const novoStatus = document.getElementById('ts-status').value;
  const obs        = document.getElementById('ts-obs')?.value?.trim() || null;
  if (!aptoNum)    { toast('Selecione um apartamento', 'error'); return; }
  if (!novoStatus) { toast('Selecione o novo status', 'error'); return; }

  const apto = aptos.find(a => a.numero === aptoNum);
  if (!apto) { toast('Apartamento não encontrado', 'error'); return; }

  // Bloqueia status que devem vir somente do fluxo operacional
  if (_TS_BLOQUEADOS_MANUAL.has(novoStatus)) {
    toast('Este status é definido exclusivamente pelo fluxo de limpeza/conferência', 'error'); return;
  }

  // Se o apto está em fluxo ativo, exige confirmação de gestor+
  const _PODE_INTERROMPER = new Set(['admin_global','admin_hotel','gestor','supervisora','governanta']);
  if (_TS_BLOQUEADOS_MANUAL.has(apto.status)) {
    if (!_PODE_INTERROMPER.has(currentUser?.perfil)) {
      toast('Interromper o fluxo de limpeza requer perfil Gestor ou superior', 'error'); return;
    }
    if (!obs) { toast('Informe o motivo para interromper o fluxo de limpeza', 'error'); return; }
    if (!confirm(`Atenção: o apto ${aptoNum} está em fluxo ativo ("${apto.status}"). Alterar manualmente pode perder o histórico. Confirma?`)) return;
  }

  closeModal('modal-trocar-status');
  await window.mudarStatusApto(apto.id, novoStatus, obs || `Status alterado manualmente por ${currentUser.nome}`);
}

function alterarStatusRapido(id) {
  const apto = aptos.find(a => a.id === id);
  if (!apto) return;
  // Preenche o select do modal-trocar-status e abre
  const sel = document.getElementById('ts-apto');
  if (sel) sel.value = apto.numero;
  openModal('modal-trocar-status');
}

// ── AÇÕES OPERACIONAIS DE LIMPEZA ────────────────────────────

async function iniciarLimpeza() {
  const apto = aptos.find(a => a.id === selectedAptoId);
  if (!apto) return;
  if (!['sujo','pausado','reprovado'].includes(apto.status)) {
    toast('Limpeza só pode ser iniciada em apartamento Sujo, Pausado ou Reprovado', 'error'); return;
  }
  _checklistOrigemStatus = apto.status; // guarda para cancelar poder reverter
  const acao = apto.status === 'pausado' ? 'retomada' : 'iniciada';
  const obs  = `Limpeza ${acao} por ${currentUser.nome} em ${new Date().toLocaleString('pt-BR')}`;
  await mudarStatusApto(selectedAptoId, 'limpando', obs);
  // Perfis operacionais preenchem checklist ao iniciar; manutenção segue fluxo direto
  const _PERFIS_CHECKLIST_LIMPEZA = ['camareira','admin_global','admin_hotel','gestor','supervisora','governanta'];
  if (_PERFIS_CHECKLIST_LIMPEZA.includes(currentUser?.perfil)) {
    await abrirChecklistApp(selectedAptoId);
  }
}

async function abrirModalCancelarLimpeza(id) {
  selectedAptoId = id;
  const apto = aptos.find(a => a.id === id);
  if (!apto || apto.status !== 'limpando') {
    toast('Cancelamento só é possível durante limpeza ativa', 'error'); return;
  }
  const sel   = document.getElementById('cancelar-motivo');
  const obsEl = document.getElementById('cancelar-obs');
  if (obsEl) obsEl.value = '';
  closeModal('modal-apto-detail');

  if (sel) {
    sel.innerHTML = '<option value="">Carregando...</option>';
    const hotelId = currentUser.hotelId;
    let q = supabaseClient.from('motivos_cancelamento').select('id, nome').eq('ativo', true).order('ordem');
    if (hotelId) q = q.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);
    const { data } = await q;
    sel.innerHTML = '<option value="">Selecione o motivo *</option>' +
      (data || []).map(m => `<option value="${m.nome}">${m.nome}</option>`).join('');
  }

  openModal('modal-cancelar-limpeza');
  if (sel) sel.focus();
}

async function cancelarLimpeza() {
  const motivo = document.getElementById('cancelar-motivo')?.value || '';
  const obs    = (document.getElementById('cancelar-obs')?.value || '').trim();
  if (!motivo) { toast('Selecione o motivo do cancelamento', 'error'); return; }
  closeModal('modal-cancelar-limpeza');
  const texto = `Limpeza cancelada por ${currentUser.nome} em ${new Date().toLocaleString('pt-BR')}: ${motivo}${obs ? ' — ' + obs : ''}`;
  await mudarStatusApto(selectedAptoId, 'sujo', texto);
}

async function abrirModalPausa(id) {
  selectedAptoId = id;
  const sel = document.getElementById('pausa-motivo');
  const obsEl = document.getElementById('pausa-obs');
  if (obsEl) obsEl.value = '';
  closeModal('modal-apto-detail');

  if (sel) {
    sel.innerHTML = '<option value="">Carregando...</option>';
    const hotelId = currentUser.hotelId;
    let q = supabaseClient.from('motivos_pausa').select('id, nome').eq('ativo', true).order('ordem');
    if (hotelId) q = q.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);
    const { data } = await q;
    sel.innerHTML = '<option value="">Selecione o motivo *</option>' +
      (data || []).map(m => `<option value="${m.nome}">${m.nome}</option>`).join('');
  }

  openModal('modal-pausar-limpeza');
  if (sel) sel.focus();
}

async function pausarLimpeza() {
  const apto = aptos.find(a => a.id === selectedAptoId);
  if (!apto || apto.status !== 'limpando') {
    toast('Pausa só é possível durante limpeza ativa', 'error'); return;
  }
  const motivo = document.getElementById('pausa-motivo')?.value || '';
  const obs    = (document.getElementById('pausa-obs')?.value || '').trim();
  if (!motivo) { toast('Selecione o motivo da pausa', 'error'); return; }
  closeModal('modal-pausar-limpeza');
  const texto = `Pausado por ${currentUser.nome} em ${new Date().toLocaleString('pt-BR')}: ${motivo}${obs ? ' — ' + obs : ''}`;
  await mudarStatusApto(selectedAptoId, 'pausado', texto);
}

async function concluirLimpeza() {
  const apto = aptos.find(a => a.id === selectedAptoId);
  if (!apto) return;
  if (apto.status !== 'limpando') {
    toast('Conclusão só é permitida com apartamento Em limpeza. Retome antes de concluir.', 'error'); return;
  }
  const _PERFIS_CHECKLIST_LIMPEZA = ['camareira','admin_global','admin_hotel','gestor','supervisora','governanta'];
  if (_PERFIS_CHECKLIST_LIMPEZA.includes(currentUser?.perfil)) {
    // Re-abre checklist caso o modal tenha sido fechado sem concluir
    _checklistOrigemStatus = 'limpando';
    await abrirChecklistApp(selectedAptoId);
  } else {
    const obs = `Limpeza concluída por ${currentUser.nome} em ${new Date().toLocaleString('pt-BR')} — aguardando conferência`;
    await mudarStatusApto(selectedAptoId, 'conferencia', obs);
  }
}

// ── CONFERÊNCIA DA SUPERVISORA ────────────────────────────────

const _PERFIS_CONFERENCIA = new Set(['admin_global','admin_hotel','gestor','supervisora','governanta']);

let _supChecklistAtivo = [];

function aprovarLimpeza() {
  if (!_PERFIS_CONFERENCIA.has(currentUser?.perfil)) {
    toast('Somente supervisora, gestora ou admin podem aprovar a limpeza', 'error'); return;
  }
  abrirChecklistSupervisora();
}

async function abrirChecklistSupervisora() {
  if (!_PERFIS_CONFERENCIA.has(currentUser?.perfil)) {
    toast('Sem permissão para realizar conferência', 'error'); return;
  }
  const apto = aptos.find(a => a.id === selectedAptoId);
  if (!apto || apto.status !== 'conferencia') {
    toast('Conferência só é permitida em apartamento Aguardando conferência', 'error'); return;
  }
  const titulo = document.getElementById('sup-cl-titulo');
  if (titulo && apto) titulo.textContent = `🔍 Conferência — Apto ${apto.numero}`;

  const obsEl = document.getElementById('sup-cl-obs');
  if (obsEl) obsEl.value = '';

  const hotelId = apto?.hotel_id || currentUser.hotelId;
  let q = supabaseClient.from('supervisora_checklist_items').select('*').eq('ativo', true).order('ordem');
  if (hotelId) q = q.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);
  const { data } = await q;
  _supChecklistAtivo = data || [];

  const container = document.getElementById('sup-cl-items');
  if (container) {
    if (!_supChecklistAtivo.length) {
      container.innerHTML = '<p style="font-size:13px;color:var(--text3);">Nenhum item configurado. Adicione itens em Configurações → Checklist da Supervisora.</p>';
    } else {
      container.innerHTML = _supChecklistAtivo.map((item, i) => `
        <div style="padding:10px 0;border-bottom:1px solid var(--border);">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <span style="font-size:14px;font-weight:500;">${item.nome}${item.obrigatorio ? '<span style="color:var(--danger);margin-left:3px;">*</span>' : ''}</span>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;">
                <input type="radio" name="sup-cl-${i}" value="ok" style="accent-color:var(--success);" onchange="supClOnChange(${i})"> Conforme
              </label>
              <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;">
                <input type="radio" name="sup-cl-${i}" value="nao" onchange="supClOnChange(${i})"> Não conforme
              </label>
              <label style="display:flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;">
                <input type="radio" name="sup-cl-${i}" value="na" onchange="supClOnChange(${i})"> N/A
              </label>
            </div>
          </div>
          <div id="sup-cl-obs-row-${i}" style="display:none;margin-top:8px;">
            <textarea id="sup-cl-obs-item-${i}" rows="2" placeholder="Descreva o que não estava conforme..."
              style="width:100%;font-size:12px;padding:6px 8px;border:1px solid var(--danger);border-radius:var(--radius-sm);background:var(--bg);color:var(--text1);resize:vertical;box-sizing:border-box;"></textarea>
          </div>
        </div>`).join('');
    }
  }

  closeModal('modal-apto-detail');
  openModal('modal-conferencia-supervisora');
}

function supClOnChange(i) {
  const sel = document.querySelector(`input[name="sup-cl-${i}"]:checked`);
  const row = document.getElementById(`sup-cl-obs-row-${i}`);
  if (row) row.style.display = sel?.value === 'nao' ? 'block' : 'none';
}

async function confirmarChecklistSupervisora(decisao) {
  const respostas = {};
  let incompleto = false;
  _supChecklistAtivo.forEach((item, i) => {
    const sel = document.querySelector(`input[name="sup-cl-${i}"]:checked`);
    if (!sel && item.obrigatorio) { incompleto = true; return; }
    if (sel) {
      const obsItem = sel.value === 'nao'
        ? (document.getElementById(`sup-cl-obs-item-${i}`)?.value?.trim() || '')
        : '';
      respostas[item.nome] = { valor: sel.value, obs: obsItem };
    }
  });
  if (incompleto) { toast('Avalie todos os itens obrigatórios antes de continuar', 'error'); return; }

  const obs = (document.getElementById('sup-cl-obs')?.value || '').trim();

  closeModal('modal-conferencia-supervisora');

  const apto = aptos.find(a => a.id === selectedAptoId);
  if (!apto) return;

  // Salvar no banco
  try {
    await supabaseClient.from('conferencia_supervisora_checklists').insert({
      apartment_id: selectedAptoId,
      hotel_id:     apto.hotel_id,
      usuario_id:   currentUser.id,
      respostas,
      obs:          obs || null,
      resultado:    decisao,
    });
  } catch(e) { console.warn('Erro ao salvar checklist supervisora:', e); }

  if (decisao === 'aprovar') {
    const obsStatus = `Aprovado por ${currentUser.nome} em ${new Date().toLocaleString('pt-BR')}${obs ? ' — ' + obs : ''}`;
    await mudarStatusApto(selectedAptoId, 'limpo', obsStatus);
    // fecha pendências de retrabalho abertas deste apartamento
    supabaseClient.from('pendencias_retrabalho')
      .update({ status: 'resolvida', resolvido_por: currentUser?.id || null, resolvido_at: new Date().toISOString() })
      .eq('apartment_id', selectedAptoId)
      .or('status.eq.aberta,status.eq.aberto,status.is.null')
      .then(({ error }) => { if (error) console.warn('Erro ao fechar retrabalho:', error); });
  } else {
    abrirModalReprovacao();
  }
}

async function abrirModalReprovacao() {
  if (!_PERFIS_CONFERENCIA.has(currentUser?.perfil)) {
    toast('Somente supervisora, gestora ou admin podem reprovar a limpeza', 'error'); return;
  }
  const apto = aptos.find(a => a.id === selectedAptoId);
  if (!apto || apto.status !== 'conferencia') {
    toast('Reprovação só é permitida em apartamento Aguardando conferência', 'error'); return;
  }
  const sel = document.getElementById('rep-motivo');
  const obs = document.getElementById('rep-obs');
  if (obs) obs.value = '';
  closeModal('modal-apto-detail');
  openModal('modal-reprovacao');

  // Carrega motivos do banco
  if (sel) {
    sel.innerHTML = '<option value="">Carregando...</option>';
    const hotelId = currentUser.hotelId;
    let q = supabaseClient.from('motivos_reprovacao').select('id, nome').eq('ativo', true).order('ordem');
    if (hotelId) q = q.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);
    const { data } = await q;
    const motivos = data || [];
    sel.innerHTML = '<option value="">Selecione o motivo *</option>' +
      motivos.map(m => `<option value="${m.nome}">${m.nome}</option>`).join('');
    sel.focus();
  }
}

async function reprovarLimpeza() {
  if (!_PERFIS_CONFERENCIA.has(currentUser?.perfil)) {
    toast('Sem permissão para reprovar limpeza', 'error'); return;
  }
  const motivo = document.getElementById('rep-motivo')?.value || '';
  const obs    = document.getElementById('rep-obs')?.value.trim() || null;

  if (!motivo) { toast('Selecione o motivo da reprovação', 'error'); return; }

  const apto = aptos.find(a => a.id === selectedAptoId);
  if (!apto) return;

  const btn = document.getElementById('btn-confirmar-reprovacao');
  if (btn) { btn.disabled = true; btn.textContent = 'Registrando...'; }

  const { error } = await supabaseClient.from('pendencias_retrabalho').insert({
    apartment_id: selectedAptoId,
    hotel_id:     apto.hotel_id,
    motivo,
    obs,
    criado_por:   currentUser.id,
  });

  if (btn) { btn.disabled = false; btn.textContent = '❌ Confirmar reprovação'; }
  if (error) { toast('Erro ao registrar pendência: ' + error.message, 'error'); return; }

  closeModal('modal-reprovacao');
  const obsHist = `Reprovado por ${currentUser.nome} em ${new Date().toLocaleString('pt-BR')}: ${motivo}${obs ? ' — ' + obs : ''}`;
  await mudarStatusApto(selectedAptoId, 'reprovado', obsHist);
}

// ── CHECKLIST DE CONFERÊNCIA ──────────────────────────────────

const CHECKLIST_LIMPEZA_FALLBACK = [
  { id: 'banheiro',   nome: 'Banheiro limpo',                 obrigatorio: true  },
  { id: 'enxoval',    nome: 'Enxoval conferido',              obrigatorio: true  },
  { id: 'amenities',  nome: 'Amenities repostos',             obrigatorio: true  },
  { id: 'lixeira',    nome: 'Lixeira retirada',               obrigatorio: true  },
  { id: 'piso',       nome: 'Piso limpo',                     obrigatorio: true  },
  { id: 'frigobar',   nome: 'Frigobar conferido',             obrigatorio: false },
  { id: 'manutencao', nome: 'Manutenção aparente verificada', obrigatorio: false },
];

let _confChecklistAtivo = []; // itens carregados do banco para o modal atual


// ── ADAPTAR renderAppCamareira para usar dados do Supabase ────

let _appCamFiltro      = ''; // '' = todos, 'meus' = atribuídos a mim, ou status string
let _appCamFiltroMeus  = false; // true quando filtro "Atribuídos a mim" está ativo

function setAppCamFiltro(status) {
  if (status === 'meus') {
    _appCamFiltroMeus = !_appCamFiltroMeus;
    _appCamFiltro = '';
  } else {
    _appCamFiltroMeus = false;
    _appCamFiltro = (_appCamFiltro === status) ? '' : status;
  }
  renderAppCamareira();
}

async function renderAppCamareira() {
  document.getElementById('app-camareira-nome').textContent = currentUser.nome;

  if (!aptos.length || aptos[0]?.hotel_id !== currentUser.hotelId) {
    _aptoViewHotelId = currentUser.hotelId;
    await syncApartamentos();
  }

  const todos = aptos;
  const aLimpar    = todos.filter(a => a.status === 'sujo').length;
  const limpando   = todos.filter(a => a.status === 'limpando').length;
  const concluidos = todos.filter(a => ['limpo','livre','conferencia'].includes(a.status)).length;

  document.getElementById('app-a-limpar').textContent    = aLimpar;
  document.getElementById('app-limpando').textContent    = limpando;
  document.getElementById('app-concluidos').textContent  = concluidos;
  document.getElementById('app-aptos-count').textContent = `${todos.length} aptos no hotel`;

  const LABEL = {
    livre:'Livre', sujo:'Sujo', limpando:'Em limpeza', pausado:'Pausado',
    conferencia:'Aguard. conf.', limpo:'Limpo', reprovado:'Reprovado',
    bloqueado:'Bloqueado', ocupado:'Ocupado', manutencao:'Manutenção'
  };

  const totalMeusAtrib = todos.filter(a => a.camareira_id === currentUser.id).length;
  const statusPresentes = [...new Set(todos.map(a => a.status))];
  const ordemStatus = ['reprovado','pausado','limpando','sujo','conferencia','limpo','livre','ocupado','bloqueado','manutencao'];
  statusPresentes.sort((a,b) => ordemStatus.indexOf(a) - ordemStatus.indexOf(b));

  const filtroEl = document.getElementById('app-filtro-status');
  if (filtroEl) {
    filtroEl.innerHTML =
      `<button class="btn btn-sm ${(!_appCamFiltro && !_appCamFiltroMeus) ? 'btn-primary' : 'btn-ghost'}" onclick="setAppCamFiltro('')">Todos (${todos.length})</button>` +
      (totalMeusAtrib > 0
        ? `<button class="btn btn-sm ${_appCamFiltroMeus ? 'btn-primary' : 'btn-ghost'}" onclick="setAppCamFiltro('meus')" style="${_appCamFiltroMeus?'':'border-color:#1d4ed8;color:#1d4ed8;'}">👤 Meus (${totalMeusAtrib})</button>`
        : '') +
      statusPresentes.map(s =>
        `<button class="btn btn-sm ${_appCamFiltro===s?'btn-primary':'btn-ghost'}" onclick="setAppCamFiltro('${s}')">${LABEL[s]||s} (${todos.filter(a=>a.status===s).length})</button>`
      ).join('');
  }

  let exibir;
  if (_appCamFiltroMeus)   exibir = todos.filter(a => a.camareira_id === currentUser.id);
  else if (_appCamFiltro)  exibir = todos.filter(a => a.status === _appCamFiltro);
  else                     exibir = todos;

  // Agrupa por status na ordem definida
  const grupos = [
    { key:'reprovado',  label:'Re-limpeza necessária', icon:'❌', color:'#e74c3c', badge:'badge-reprovado' },
    { key:'pausado',    label:'Pausados — retomar',     icon:'⏸', color:'#f39c12', badge:'badge-pausado'   },
    { key:'limpando',   label:'Em andamento',            icon:'🧹', color:'#2e86c1', badge:'badge-limpando'  },
    { key:'sujo',       label:'Para limpar',             icon:'🟠', color:'#e67e22', badge:'badge-sujo'      },
    { key:'conferencia',label:'Aguardando conferência',  icon:'🔍', color:'#8e44ad', badge:'badge-conferencia'},
    { key:'limpo',      label:'Limpos',                  icon:'✨', color:'#27ae60', badge:'badge-limpo'     },
    { key:'livre',      label:'Livres',                  icon:'✅', color:'#27ae60', badge:'badge-livre'     },
    { key:'ocupado',    label:'Ocupados',                icon:'🏠', color:'#7f8c8d', badge:'badge-ocupado'   },
    { key:'bloqueado',  label:'Bloqueados',              icon:'🔒', color:'#c0392b', badge:'badge-bloqueado' },
    { key:'manutencao', label:'Manutenção',              icon:'🔧', color:'#95a5a6', badge:'badge-manutencao'},
  ];

  let html = '';
  grupos.forEach(g => {
    const lista = exibir.filter(a => a.status === g.key);
    if (!lista.length) return;

    // Atribuídos a mim primeiro
    lista.sort((a, b) => (a.camareira_id === currentUser.id ? 0 : 1) - (b.camareira_id === currentUser.id ? 0 : 1));

    html += `<div style="margin-bottom:22px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid ${g.color};">
        <span style="font-size:15px;">${g.icon}</span>
        <span style="font-size:12px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;">${g.label}</span>
        <span style="background:${g.color};color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;margin-left:auto;">${lista.length}</span>
      </div>`;

    if (g.key === 'livre') {
      html += `<div class="card" style="padding:14px 16px;color:var(--text2);font-size:13px;">
        ✅ ${lista.length} apartamento${lista.length !== 1 ? 's' : ''} livre${lista.length !== 1 ? 's' : ''} — sem ação necessária.
      </div>`;
    } else {
      lista.forEach(a => {
        const meuApto = a.camareira_id === currentUser.id;
        const borderColor = meuApto ? '#1d4ed8' : (a.prioridade ? 'var(--danger)' : g.color);
        const extraStyle  = meuApto ? 'background:linear-gradient(135deg,#eff6ff 0%,#fff 60%);box-shadow:0 2px 12px rgba(29,78,216,0.12);' : '';

        const camApto = (typeof equipe !== 'undefined' ? equipe : []).find(e => e.id === a.camareira_id);
        const camLineApto = camApto
          ? `<div style="font-size:11px;color:var(--text3);margin-top:3px;">🧹 ${camApto.nome}</div>`
          : `<div style="font-size:11px;font-weight:700;color:var(--danger);margin-top:3px;">👤 Sem responsável</div>`;
        html += `
        <div class="card" style="margin-bottom:10px;border-left:4px solid ${borderColor};padding:14px 16px;${extraStyle}">
          ${meuApto ? `<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;background:#dbeafe;color:#1d4ed8;padding:5px 10px;border-radius:6px;font-size:11px;font-weight:700;">📌 Atribuído a mim</div>` : ''}
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px;">
            <div>
              <div style="font-size:22px;font-weight:800;color:${meuApto?'#1d4ed8':'var(--text)'};line-height:1;">${a.numero}</div>
              <div style="font-size:12px;color:var(--text2);margin-top:3px;">${a.tipo} &nbsp;·&nbsp; ${a.andar}º andar &nbsp;·&nbsp; ${a.leitos} leito${a.leitos!==1?'s':''}</div>
              ${camLineApto}
              ${a.prioridade ? `<div style="font-size:11px;font-weight:700;color:var(--danger);margin-top:4px;">⚠️ PRIORIDADE</div>` : ''}
            </div>
            <span class="badge ${g.badge}" style="flex-shrink:0;">${LABEL[a.status]||a.status}</span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn btn-ghost btn-sm" onclick="openAptoDetail('${a.id}')">👁 Ver detalhes</button>
          </div>
        </div>`;
      });
    }

    html += `</div>`;
  });

  document.getElementById('app-apto-list').innerHTML = html ||
    `<div style="text-align:center;padding:32px;color:var(--text3);font-size:13px;">Nenhum apartamento encontrado.</div>`;
}

// ── TIPO DE LIMPEZA — seleção no modal ───────────────────────

let _checklistTipoSelecionado = 'Saída (checkout)';

function _tipoLimpezaEnum(nome) {
  const n = (nome || '').toLowerCase();
  if (n.includes('perm')) return 'permanencia';
  if (n.includes('pós') || n.includes('pos') || n.includes('manut')) return 'pos_manutencao';
  return 'saida';
}

function _emojiTipoLimpeza(nome) {
  const n = (nome || '').toLowerCase();
  if (n.includes('saída') || n.includes('saida') || n.includes('checkout')) return '🛏';
  if (n.includes('pós') || n.includes('pos') || n.includes('manutenção') || n.includes('manutencao')) return '🔧';
  if (n.includes('permanência') || n.includes('permanencia')) return '🏠';
  return '🧹';
}

const _TIPOS_LIMPEZA_FALLBACK = [
  { nome: 'Saída (checkout)' },
  { nome: 'Permanência' },
  { nome: 'Pós-manutenção' },
];

async function _renderTipoLimpezaBtns() {
  // Sempre reseta para o primeiro tipo ao abrir o modal
  _checklistTipoSelecionado = _TIPOS_LIMPEZA_FALLBACK[0].nome;
  const wrap = document.getElementById('checklist-tipo-btns');
  if (!wrap) return;

  // Reseta seleção visual para padrão (primeiro btn ativo)
  wrap.querySelectorAll('button').forEach((btn, i) => {
    btn.className = `btn btn-sm ${i === 0 ? 'btn-primary' : 'btn-ghost'}`;
  });

  // Tenta carregar tipos personalizados do banco e atualiza se diferente do fallback
  try {
    const hotelId = currentUser?.hotelId;
    let q = supabaseClient.from('tipos_limpeza').select('id, nome').eq('ativo', true).order('ordem');
    if (hotelId) q = q.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);
    const { data } = await q;
    if (data?.length) {
      _checklistTipoSelecionado = data[0].nome;
      wrap.innerHTML = data.map((t, i) =>
        `<button type="button" id="cl-tipo-btn-${i}"
          class="btn btn-sm ${i === 0 ? 'btn-primary' : 'btn-ghost'}"
          style="flex:1;min-width:110px;"
          onclick="_selecionarTipoLimpeza('${(t.nome||'').replace(/'/g,"\\'")}',${i},${data.length})">
          ${_emojiTipoLimpeza(t.nome)} ${t.nome || 'Tipo'}
        </button>`
      ).join('');
    }
  } catch (e) {
    console.warn('Tipos de limpeza: mantendo botões padrão.', e);
  }
}

function _selecionarTipoLimpeza(nome, idx, total) {
  _checklistTipoSelecionado = nome;
  for (let i = 0; i < total; i++) {
    const btn = document.getElementById(`cl-tipo-btn-${i}`);
    if (btn) btn.className = `btn btn-sm ${i === idx ? 'btn-primary' : 'btn-ghost'}`;
  }
}

// ── ADAPTAR abrirChecklistApp para UUIDs ─────────────────────

async function abrirChecklistApp(id) {
  selectedAptoId = id;
  const apto = aptos.find(a => a.id === id);
  if (!apto) return;
  const titulo = apto.status === 'limpando'
    ? `Concluir limpeza — Apto ${apto.numero}`
    : apto.status === 'reprovado'
    ? `Re-limpeza — Apto ${apto.numero}`
    : `Limpeza — Apto ${apto.numero}`;
  document.getElementById('checklist-title').textContent = titulo;
  const hotelId = currentUser?.hotelId;
  let q = supabaseClient.from('checklist_templates').select('nome').eq('ativo', true).order('ordem');
  if (hotelId) q = q.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);
  const [, ckRes] = await Promise.allSettled([_renderTipoLimpezaBtns(), q]);
  const { data } = (ckRes.status === 'fulfilled' ? ckRes.value : {}) || {};
  const itens = data?.length ? data : (typeof CHECKLIST_PADRAO !== 'undefined' ? CHECKLIST_PADRAO.map(n => ({ nome: n })) : []);
  checklistState = itens.map(item => ({ label: item.nome, done: false }));
  renderChecklist();
  openModal('modal-checklist');
}

async function concluirChecklist() {
  const done = checklistState.filter(i => i.done).length;
  if (done < checklistState.length * 0.8) { toast('Complete pelo menos 80% dos itens', 'error'); return; }

  const obsGeral  = (document.getElementById('checklist-obs')?.value || '').trim();
  const respostas = checklistState.map(i => ({ item: i.label, resposta: i.done ? 'conforme' : 'nao_conforme' }));

  const { error: ckErr } = await supabaseClient.from('limpeza_checklists').insert({
    apartment_id: selectedAptoId,
    hotel_id:     currentUser.hotelId,
    usuario_id:   currentUser.id,
    tipo_limpeza: _tipoLimpezaEnum(_checklistTipoSelecionado),
    respostas,
    obs_geral:    obsGeral || null,
  });
  if (ckErr) console.warn('Checklist não salvo:', ckErr.message);

  _checklistOrigemStatus = null;
  closeModal('modal-checklist');

  const obs = `Checklist de limpeza concluído por ${currentUser.nome} em ${new Date().toLocaleString('pt-BR')} — aguardando conferência`;
  await mudarStatusApto(selectedAptoId, 'conferencia', obs);
}

async function cancelarChecklistLimpeza() {
  const status = _checklistOrigemStatus || 'sujo';
  _checklistOrigemStatus = null;
  closeModal('modal-checklist');
  const obs = `Limpeza cancelada por ${currentUser.nome} em ${new Date().toLocaleString('pt-BR')}`;
  await mudarStatusApto(selectedAptoId, status, obs);
}

// ── MAPA COM SELETOR DE HOTEL (admin_global) ──────────────────

function _garantirBotoesMapa() {
  const isOperacional = ['camareira','manutencao'].includes(currentUser?.perfil);
  const container = document.getElementById('mapa-header-actions');
  if (!container) return;

  // Reconstrói o container para eliminar duplicatas de versões antigas do index.html
  container.innerHTML = '';

  const isAdmin = ['admin_global','admin_hotel'].includes(currentUser?.perfil);

  if (!isOperacional) {
    if (isAdmin) {
      const btnCad = document.createElement('button');
      btnCad.id = 'btn-cadastrar-apto-mapa';
      btnCad.className = 'btn btn-ghost btn-sm';
      btnCad.textContent = '⊕ Cadastrar Apto';
      btnCad.onclick = () => openPage('cadastro-apto');
      container.appendChild(btnCad);
    }

    const btnAlt = document.createElement('button');
    btnAlt.id = 'btn-alterar-status-header';
    btnAlt.className = 'btn btn-outline btn-sm';
    btnAlt.textContent = '🔄 Alterar Status';
    btnAlt.onclick = () => _loteMode ? _abrirModalLote() : openModal('modal-trocar-status');
    container.appendChild(btnAlt);

    const btnLote = document.createElement('button');
    btnLote.id = 'btn-lote-selecionar';
    btnLote.className = 'btn btn-primary btn-sm';
    btnLote.textContent = '☑ Selecionar em lote';
    btnLote.onclick = _toggleLoteMode;
    container.appendChild(btnLote);

    const btnAtrib = document.createElement('button');
    btnAtrib.id = 'btn-lote-atribuir';
    btnAtrib.className = 'btn btn-outline btn-sm';
    btnAtrib.textContent = '👤 Atribuir em lote';
    btnAtrib.onclick = _abrirModalAtribuirLote;
    container.appendChild(btnAtrib);
  }
}

async function _abrirModalAtribuirLote() {
  if (_loteSelected.size === 0) {
    toast('Selecione ao menos um apartamento primeiro', 'error');
    return;
  }
  const n = _loteSelected.size;
  const el = document.getElementById('lote-atribuir-info');
  if (el) el.textContent = `${n} apartamento${n !== 1 ? 's' : ''} selecionado${n !== 1 ? 's' : ''}`;

  // Carrega camareiras do hotel
  const hotelId = _aptoViewHotelId || currentUser.hotelId;
  const { data } = await supabaseClient
    .from('user_profiles')
    .select('user_id, nome')
    .eq('perfil', 'camareira')
    .eq('ativo', true)
    .eq('hotel_id', hotelId)
    .order('nome');

  const sel = document.getElementById('lote-atribuir-camareira');
  if (sel) {
    sel.innerHTML = '<option value="">— Remover atribuição —</option>' +
      (data || []).map(u => `<option value="${u.user_id}">${u.nome}</option>`).join('');
  }

  openModal('modal-lote-atribuir');
}

async function _executarAtribuirLote() {
  const camId  = document.getElementById('lote-atribuir-camareira')?.value || null;
  const ids    = [..._loteSelected];
  const n      = ids.length;
  const camNome = camId
    ? document.getElementById('lote-atribuir-camareira')?.selectedOptions[0]?.text
    : 'nenhuma (remover atribuição)';

  if (!confirm(`Atribuir ${n} apartamento${n > 1 ? 's' : ''} para: ${camNome}?`)) return;

  closeModal('modal-lote-atribuir');
  let erros = 0;
  for (const id of ids) {
    const { error } = await supabaseClient
      .from('apartments')
      .update({ maid_id: camId })
      .eq('id', id);
    if (error) erros++;
    else {
      const apto = aptos.find(a => a.id === id);
      if (apto) {
        apto.camareira_id = camId;
        apto._maid_nome   = camId ? camNome : null;
      }
    }
  }

  if (erros) toast(`Concluído com ${erros} erro(s)`, 'warning');
  else toast(`${n} apartamento${n > 1 ? 's' : ''} atribuído${n > 1 ? 's' : ''}!`, 'success');

  _loteMode = false;
  _loteSelected.clear();
  document.getElementById('lote-bar').style.display = 'none';
  const btnSel = document.getElementById('btn-lote-selecionar');
  if (btnSel) btnSel.textContent = '☑ Selecionar em lote';
  renderMapa();
}

async function initMapaAdmin() {
  const wrap = document.getElementById('mapa-hotel-selector');
  if (!wrap) return;

  _garantirBotoesMapa();

  if (currentUser.perfil !== 'admin_global') {
    if (typeof _renderHotelChip === 'function') _renderHotelChip('mapa-hotel-selector');
    else wrap.style.display = 'none';
    // Para outros perfis, garante que o hotel correto está carregado
    if (!aptos.length || aptos[0]?.hotel_id !== currentUser.hotelId) {
      _aptoViewHotelId = currentUser.hotelId;
      await syncApartamentos();
    }
    renderMapa();
    return;
  }

  // Admin global: mostra seletor
  wrap.style.display = '';
  const { data: hotels } = await supabaseClient
    .from('hotels').select('id, nome').eq('ativo', true).order('nome');

  wrap.innerHTML = `
    <div class="card" style="padding:10px 16px;margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <span style="font-size:13px;font-weight:600;color:var(--text2);">🏨 Hotel:</span>
        <select id="mapa-hotel-select"
          style="flex:1;min-width:200px;padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;"
          onchange="selecionarHotelMapa(this.value)">
          <option value="">Selecione um hotel...</option>
          ${(hotels||[]).map(h =>
            `<option value="${h.id}" ${h.id === _aptoViewHotelId ? 'selected' : ''}>${h.nome}</option>`
          ).join('')}
        </select>
        ${_aptoViewHotelId ? `<span style="font-size:12px;color:var(--text3);">${aptos.length} apto(s)</span>` : ''}
      </div>
    </div>`;

  if (_aptoViewHotelId) {
    if (!aptos.length || aptos[0]?.hotel_id !== _aptoViewHotelId) {
      await syncApartamentos();
    }
    renderMapa();
  } else {
    document.getElementById('mapa-container').innerHTML =
      '<p style="color:var(--text3);text-align:center;padding:48px;">Selecione um hotel para visualizar o mapa.</p>';
  }
}

async function selecionarHotelMapa(hotelId) {
  _aptoViewHotelId = hotelId || null;
  if (!hotelId) {
    document.getElementById('mapa-container').innerHTML =
      '<p style="color:var(--text3);text-align:center;padding:48px;">Selecione um hotel para visualizar o mapa.</p>';
    return;
  }
  await syncApartamentos();
  renderMapa();
  // Atualiza contador no selector
  const countEl = document.querySelector('#mapa-hotel-selector span[style*="text3"]');
  if (countEl) countEl.textContent = `${aptos.length} apto(s)`;
}

// Intercepta openPage para inicializar mapa
(function patchOpenPageMapa() {
  if (window._mapaPatch) return;
  window._mapaPatch = true;
  const _realOpen = openPage;
  openPage = function(id) {
    _realOpen(id);
    if (id === 'mapa') initMapaAdmin();
  };
})();

// ================================================================
// FILTROS OPERACIONAIS — Mapa e Kanban de Limpeza
// ================================================================

// Modo do kanban: 'limpeza' | 'chamados'
let _kanbanModo = 'limpeza';

async function setKanbanModo(modo) {
  _kanbanModo = modo;
  const btnL = document.getElementById('btn-kanban-limpeza');
  const btnC = document.getElementById('btn-kanban-chamados');
  if (btnL) btnL.className = 'btn btn-sm ' + (modo === 'limpeza'  ? 'btn-primary' : 'btn-ghost');
  if (btnC) btnC.className = 'btn btn-sm ' + (modo === 'chamados' ? 'btn-primary' : 'btn-ghost');
  const title    = document.getElementById('kanban-page-title');
  const subtitle = document.getElementById('kanban-page-subtitle');
  const filtrosStatus = document.getElementById('kanban-filtros-status');
  const filtrosAptos  = document.getElementById('kanban-filtros-aptos');
  if (modo === 'limpeza') {
    if (title)    title.textContent    = 'Kanban de Limpeza';
    if (subtitle) subtitle.textContent = 'Fluxo visual de andamento das limpezas';
    if (filtrosStatus) filtrosStatus.style.display = '';
    if (filtrosAptos)  filtrosAptos.style.display  = '';
    renderAptoKanban();
  } else {
    if (title)    title.textContent    = 'Kanban de Chamados';
    if (subtitle) subtitle.textContent = 'Acompanhamento dos chamados por status';
    if (filtrosStatus) filtrosStatus.style.display = 'none';
    if (filtrosAptos)  filtrosAptos.style.display  = 'none';
    if (typeof _fetchChamados === 'function') await _fetchChamados();
    if (typeof renderKanban   === 'function') renderKanban();
  }
}

// Estado dos filtros (compartilhado entre mapa e kanban)
const _aptoFiltros = {
  status:       'todos',
  andar:        '',
  camareira:    '',
  tipo:         '',
  comChamado:   false,
  semCamareira: false,
};

// Set de apartment_ids com chamados abertos (carregado sob demanda)
const _aptosComChamadoAberto = new Set();

// ── APLICAR FILTROS AO ARRAY DE APTOS ────────────────────────
function _filtrarAptos(lista) {
  return lista.filter(a => {
    if (_aptoFiltros.status !== 'todos' && a.status !== _aptoFiltros.status) return false;
    if (_aptoFiltros.andar     && String(a.andar)  !== String(_aptoFiltros.andar))  return false;
    if (_aptoFiltros.camareira && a.camareira_id   !== _aptoFiltros.camareira)      return false;
    if (_aptoFiltros.tipo      && a.tipo            !== _aptoFiltros.tipo)           return false;
    if (_aptoFiltros.comChamado && !_aptosComChamadoAberto.has(a.id))               return false;
    if (_aptoFiltros.semCamareira && a.camareira_id)                                return false;
    return true;
  });
}

function _tempoStatus(dateStr) {
  if (!dateStr) return '';
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 2) return '';
  if (mins < 60) return `há ${mins}min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? `há ${h}h${m}` : `há ${h}h`;
}

// ── CARREGAR APTOS COM CHAMADOS ABERTOS ──────────────────────
async function _carregarChamadosAbertosAptos(hotelId) {
  _aptosComChamadoAberto.clear();
  if (!hotelId) return;
  const { data } = await supabaseClient
    .from('work_orders')
    .select('apartment_id')
    .eq('hotel_id', hotelId)
    .in('status', ['aberto', 'em_analise', 'andamento', 'reaberto'])
    .not('apartment_id', 'is', null);
  (data || []).forEach(c => { if (c.apartment_id) _aptosComChamadoAberto.add(c.apartment_id); });
}

// ── RENDERIZAR BARRA DE FILTROS AVANÇADOS ────────────────────
function _renderFiltrosBar(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!aptos.length) { el.innerHTML = ''; return; }

  const andares = [...new Set(aptos.map(a => a.andar))].sort((a, b) => a - b);
  const tipos   = [...new Set(aptos.map(a => a.tipo).filter(Boolean))].sort();

  // Camareiras: prioriza equipe, complementa com dados dos aptos
  const camMap = new Map();
  equipe.forEach(c => { if (c.id && c.nome) camMap.set(c.id, c.nome); });
  aptos.forEach(a => { if (a.camareira_id && a._maid_nome && !camMap.has(a.camareira_id)) camMap.set(a.camareira_id, a._maid_nome); });
  const camLista = [...camMap.entries()].map(([id, nome]) => ({ id, nome }));

  const temFiltroAvancado = _aptoFiltros.andar || _aptoFiltros.camareira ||
                            _aptoFiltros.tipo  || _aptoFiltros.comChamado;
  const total    = _filtrarAptos(aptos).length;
  const countMsg = total < aptos.length
    ? `<span style="font-size:11px;color:var(--primary);font-weight:600;margin-left:4px;">${total} de ${aptos.length} aptos</span>`
    : '';

  el.innerHTML = `<div class="govfilter-bar">
    <select class="govfilter-sel${_aptoFiltros.andar ? ' ativo' : ''}"
            onchange="_onFiltroAndar(this.value)" title="Filtrar por andar">
      <option value="">🏢 Todos os andares</option>
      ${andares.map(a =>
        `<option value="${a}" ${String(_aptoFiltros.andar) === String(a) ? 'selected' : ''}>${a}º Andar</option>`
      ).join('')}
    </select>
    ${camLista.length ? `
    <select class="govfilter-sel${_aptoFiltros.camareira ? ' ativo' : ''}"
            onchange="_onFiltroCamareira(this.value)" title="Filtrar por camareira responsável">
      <option value="">👤 Todas as camareiras</option>
      ${camLista.map(c =>
        `<option value="${c.id}" ${_aptoFiltros.camareira === c.id ? 'selected' : ''}>${c.nome}</option>`
      ).join('')}
    </select>` : ''}
    ${tipos.length > 1 ? `
    <select class="govfilter-sel${_aptoFiltros.tipo ? ' ativo' : ''}"
            onchange="_onFiltroTipo(this.value)" title="Filtrar por tipo de UH">
      <option value="">🛏 Todos os tipos</option>
      ${tipos.map(t =>
        `<option value="${t}" ${_aptoFiltros.tipo === t ? 'selected' : ''}>${t}</option>`
      ).join('')}
    </select>` : ''}
    <button class="filter-btn${_aptoFiltros.comChamado ? ' active' : ''}"
            onclick="_onFiltroChamadoAberto()" title="Somente aptos com chamados abertos">
      📋 Com chamados
    </button>
    <button class="filter-btn${_aptoFiltros.status === 'conferencia' ? ' active' : ''}"
            onclick="_setFiltroStatusRapido('conferencia')" title="Aguardando conferência">
      🟣 Aguard. conf.
    </button>
    <button class="filter-btn${_aptoFiltros.status === 'reprovado' ? ' active' : ''}"
            onclick="_setFiltroStatusRapido('reprovado')" title="Reprovados">
      🔴 Reprovados
    </button>
    ${temFiltroAvancado ? `
    <button class="filter-btn" onclick="_limparFiltrosAvancados()"
            style="background:var(--danger);color:#fff;border-color:var(--danger);">
      ✕ Limpar filtros
    </button>` : ''}
    ${countMsg}
  </div>`;
}

// ── HANDLERS DE FILTRO ────────────────────────────────────────
function _onFiltroAndar(v)     { _aptoFiltros.andar = v;  _reaplicarFiltros(); }
function _onFiltroCamareira(v) { _aptoFiltros.camareira = v; _reaplicarFiltros(); }
function _onFiltroTipo(v)      { _aptoFiltros.tipo = v;   _reaplicarFiltros(); }

function _onFiltroChamadoAberto() {
  _aptoFiltros.comChamado = !_aptoFiltros.comChamado;
  _reaplicarFiltros();
}

function _setFiltroStatusRapido(s) {
  // Toggle: se já está ativo, volta para 'todos'
  _aptoFiltros.status = _aptoFiltros.status === s ? 'todos' : s;
  // Sincroniza botões de status do mapa
  document.querySelectorAll('#mapa-filters .filter-btn').forEach(b => {
    const isAtivo = _aptoFiltros.status === 'todos'
      ? b.getAttribute('onclick')?.includes("'todos'")
      : b.getAttribute('onclick')?.includes(`'${_aptoFiltros.status}'`);
    b.classList.toggle('active', !!isAtivo);
  });
  // Sincroniza botões de status do kanban
  document.querySelectorAll('#kanban-filtros-status .filter-btn').forEach(b => {
    const isAtivo = _aptoFiltros.status === 'todos'
      ? b.getAttribute('onclick')?.includes("'todos'")
      : b.getAttribute('onclick')?.includes(`'${_aptoFiltros.status}'`);
    b.classList.toggle('active', !!isAtivo);
  });
  _reaplicarFiltros();
}

function _limparFiltrosAvancados() {
  _aptoFiltros.andar     = '';
  _aptoFiltros.camareira = '';
  _aptoFiltros.tipo      = '';
  _aptoFiltros.comChamado = false;
  _reaplicarFiltros();
}

function _reaplicarFiltros() {
  _renderFiltrosBar('mapa-filtros-avancados');
  _renderFiltrosBar('kanban-filtros-aptos');
  renderMapa();
  renderAptoKanban();
}

// ── OVERRIDE: renderMapa (com filtros) ───────────────────────
function renderMapa() {
  const lista   = _filtrarAptos(aptos);
  const andares = [...new Set(lista.map(a => a.andar))].sort((a, b) => a - b);
  let html = '';

  andares.forEach(andar => {
    const do_andar = lista.filter(a => a.andar === andar);
    if (!do_andar.length) return;
    html += `<div class="floor-section">
      <div class="floor-label">🏢 ${andar}º Andar — ${do_andar.length} apto${do_andar.length !== 1 ? 's' : ''}</div>
      <div class="aptos-grid">`;
    do_andar.forEach(a => {
      const icon = _STATUS_ICONS[a.status]  || '❓';
      const lbl  = _STATUS_LABELS[a.status] || a.status;
      const temChamado = _aptosComChamadoAberto.has(a.id);

      if (_loteMode) {
        const bloqueado   = _LOTE_STATUS_BLOQUEADOS.has(a.status);
        const selecionado = _loteSelected.has(a.id);
        html += `<div class="apto-card ${a.status}${selecionado ? ' lote-selecionado' : ''}${bloqueado ? ' lote-bloqueado' : ''}"
          data-id="${a.id}" onclick="_loteToggleApto('${a.id}',this)" style="position:relative;">
          ${selecionado ? '<div style="position:absolute;top:4px;left:4px;background:#1d4ed8;color:#fff;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;">✓</div>' : ''}
          ${a.prioridade ? '<div class="apto-priority"></div>' : ''}
          ${temChamado ? '<div style="position:absolute;top:4px;right:4px;font-size:9px;font-weight:700;background:var(--danger);color:#fff;border-radius:8px;padding:1px 5px;line-height:1.5;" title="Chamado aberto">📋</div>' : ''}
          <div class="apto-status-icon">${icon}</div>
          <div class="apto-num">${a.numero}</div>
          <div class="apto-tipo">${a.tipo}</div>
          <span class="badge badge-${a.status}" style="font-size:10px;">${lbl}</span>
        </div>`;
      } else {
        const _tempo = typeof _tempoStatus === 'function' ? _tempoStatus(a.status_at) : '';
        const _camNome = a._maid_nome || null;
        html += `<div class="apto-card ${a.status}" data-id="${a.id}" onclick="openAptoDetail('${a.id}')" style="position:relative;">
          ${a.prioridade ? '<div class="apto-priority"></div>' : ''}
          ${temChamado ? '<div style="position:absolute;top:4px;right:4px;font-size:9px;font-weight:700;background:var(--danger);color:#fff;border-radius:8px;padding:1px 5px;line-height:1.5;" title="Chamado aberto">📋</div>' : ''}
          <div class="apto-status-icon">${icon}</div>
          <div class="apto-num">${a.numero}</div>
          <div class="apto-tipo">${a.tipo}</div>
          <span class="badge badge-${a.status}" style="font-size:10px;">${lbl}</span>
          ${_camNome
            ? `<div style="font-size:9px;color:var(--text2);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">👤 ${_camNome}</div>`
            : '<div style="font-size:9px;color:var(--danger);font-weight:700;margin-top:3px;">Sem responsável</div>'}
          ${_tempo ? `<div style="font-size:9px;color:var(--text3);margin-top:2px;">${_tempo}</div>` : ''}
        </div>`;
      }
    });
    html += '</div></div>';
  });

  const container = document.getElementById('mapa-container');
  if (container) {
    container.innerHTML = html ||
      '<p style="color:var(--text3);text-align:center;padding:48px;">Nenhum apartamento encontrado com os filtros aplicados.</p>';
  }
  if (typeof populateTsApto === 'function') populateTsApto();
}

// ── OVERRIDE: filterMapa (status buttons → sincroniza _aptoFiltros) ──
function filterMapa(status, btn) {
  _aptoFiltros.status = status;
  document.querySelectorAll('#mapa-filters .filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // Sincroniza quick-filters no bar avançado
  _renderFiltrosBar('mapa-filtros-avancados');
  _renderFiltrosBar('kanban-filtros-aptos');
  renderMapa();
  renderAptoKanban();
}

// ── OVERRIDE: filterKanbanStatus (botões de status no kanban) ──
function filterKanbanStatus(status, btn) {
  _aptoFiltros.status = status;
  document.querySelectorAll('#kanban-filtros-status .filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  _renderFiltrosBar('mapa-filtros-avancados');
  _renderFiltrosBar('kanban-filtros-aptos');
  renderMapa();
  renderAptoKanban();
}

// ── OVERRIDE: searchMapa (busca por número — mantém card no DOM) ──
function searchMapa(q) {
  const lq = q.toLowerCase().trim();
  document.querySelectorAll('.apto-card').forEach(card => {
    const num = card.querySelector('.apto-num')?.textContent || '';
    card.style.display = num.toLowerCase().includes(lq) ? '' : 'none';
  });
  // Oculta seções de andar que ficaram vazias após a busca
  document.querySelectorAll('.floor-section').forEach(sec => {
    const visiveis = [...sec.querySelectorAll('.apto-card')].filter(c => c.style.display !== 'none');
    sec.style.display = visiveis.length ? '' : 'none';
  });
}

// ── KANBAN DE LIMPEZA (apartments) ───────────────────────────
function renderAptoKanban() {
  const board = document.getElementById('kanban-board');
  if (!board) return;

  const lista = _filtrarAptos(aptos);
  // Quando filtro "Com chamados" está ativo, inclui todos os statuses
  // (chamados abertos existem em aptos ocupados, livres, bloqueados, etc.)
  const colsLimpeza = [
    { key:'sujo',        label:'Sujo',          color:'#e67e22' },
    { key:'limpando',    label:'Em limpeza',     color:'#2e86c1' },
    { key:'pausado',     label:'Pausado',        color:'#f39c12' },
    { key:'conferencia', label:'Aguard. conf.',  color:'#8e44ad' },
    { key:'limpo',       label:'Limpo',          color:'#1abc9c' },
    { key:'reprovado',   label:'Reprovado',      color:'#e74c3c' },
    { key:'manutencao',  label:'Manutenção',     color:'#f1c40f' },
  ];
  const colsTodos = [
    ...colsLimpeza,
    { key:'livre',      label:'Livre',      color:'#27ae60' },
    { key:'ocupado',    label:'Ocupado',    color:'#7f8c8d' },
    { key:'bloqueado',  label:'Bloqueado',  color:'#c0392b' },
  ];
  const cols = _aptoFiltros.comChamado ? colsTodos : colsLimpeza;

  // Se há filtro de status ativo, mostrar apenas coluna relevante
  const colsFiltradas = _aptoFiltros.status !== 'todos'
    ? cols.filter(c => c.key === _aptoFiltros.status)
    : cols;

  board.innerHTML = colsFiltradas.map(col => {
    const items = lista.filter(a => a.status === col.key);
    return `<div class="kanban-col">
      <div class="kanban-col-title" style="color:${col.color};">
        ${col.label} <span class="kanban-count">${items.length}</span>
      </div>
      ${items.map(a => {
        const cam        = equipe.find(e => e.id === a.camareira_id);
        const temChamado = _aptosComChamadoAberto.has(a.id);
        return `<div class="kanban-item" onclick="openAptoDetail('${a.id}')">
          <div class="kanban-apto">
            ${a.numero}
            ${temChamado ? '<span style="font-size:10px;color:var(--danger);" title="Chamado aberto">📋</span>' : ''}
          </div>
          <div class="kanban-detail">${a.tipo} · ${a.andar}º andar</div>
          ${cam ? `<div style="font-size:11px;color:var(--text3);margin-top:4px;">👤 ${cam.nome}</div>` : ''}
          ${a.prioridade ? '<div style="font-size:10px;font-weight:700;color:var(--danger);margin-top:2px;">⚠️ PRIORIDADE</div>' : ''}
        </div>`;
      }).join('') || `<div style="font-size:12px;color:var(--text3);text-align:center;padding:12px;">—</div>`}
    </div>`;
  }).join('');
}

// ── INICIALIZAR KANBAN DE LIMPEZA ─────────────────────────────
async function _initAptoKanban() {
  const hotelWrap = document.getElementById('kanban-hotel-filter');
  const hotelId   = _aptoViewHotelId || currentUser.hotelId;

  if (hotelWrap) {
    if (currentUser.perfil === 'admin_global') {
      const { data: hotels } = await supabaseClient
        .from('hotels').select('id, nome').eq('ativo', true).order('nome');
      hotelWrap.innerHTML = `
        <div class="card" style="padding:10px 16px;margin-bottom:14px;">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
            <span style="font-size:13px;font-weight:600;color:var(--text2);">🏨 Hotel:</span>
            <select style="flex:1;min-width:200px;padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;"
              onchange="_onKanbanHotelChange(this.value)">
              <option value="">Selecione um hotel...</option>
              ${(hotels || []).map(h =>
                `<option value="${h.id}" ${h.id === _aptoViewHotelId ? 'selected' : ''}>${h.nome}</option>`
              ).join('')}
            </select>
          </div>
        </div>`;
    } else {
      hotelWrap.innerHTML = '';
    }
  }

  if (!hotelId && currentUser.perfil === 'admin_global') {
    const board = document.getElementById('kanban-board');
    if (board) board.innerHTML = '<p style="color:var(--text3);text-align:center;padding:48px;">Selecione um hotel para visualizar o kanban.</p>';
    document.getElementById('kanban-filtros-aptos').innerHTML = '';
    return;
  }

  // Sincroniza aptos se necessário
  if (!aptos.length || (hotelId && aptos[0]?.hotel_id !== hotelId)) {
    if (hotelId) _aptoViewHotelId = hotelId;
    await syncApartamentos();
  }
  await _carregarChamadosAbertosAptos(hotelId);
  _renderFiltrosBar('kanban-filtros-aptos');
  renderAptoKanban();
}

async function _onKanbanHotelChange(hotelId) {
  _aptoViewHotelId = hotelId || null;
  const board = document.getElementById('kanban-board');
  if (!hotelId) {
    if (board) board.innerHTML = '<p style="color:var(--text3);text-align:center;padding:48px;">Selecione um hotel.</p>';
    document.getElementById('kanban-filtros-aptos').innerHTML = '';
    return;
  }
  await syncApartamentos();
  await _carregarChamadosAbertosAptos(hotelId);
  _renderFiltrosBar('kanban-filtros-aptos');
  renderAptoKanban();
}

// ── PATCH openPage PARA KANBAN DE LIMPEZA ────────────────────
(function patchOpenPageKanbanLimpeza() {
  if (window._kanbanLimpezaPatch) return;
  window._kanbanLimpezaPatch = true;
  const _prev = openPage;
  openPage = function(id) {
    _prev(id);
    if (id === 'kanban') _initAptoKanban();
  };
})();

// ── WRAP: initMapaAdmin — injeta filtros após renderização do mapa
// Usa atribuição (não function declaration) para não sofrer hoisting
const _baseInitMapaAdmin = initMapaAdmin;
initMapaAdmin = async function() {
  await _baseInitMapaAdmin();
  const hotelId = _aptoViewHotelId || currentUser.hotelId;
  if (hotelId && aptos.length) {
    await _carregarChamadosAbertosAptos(hotelId);
    _renderFiltrosBar('mapa-filtros-avancados');
  }
};

// ── CONFIGURAÇÃO: TIPOS E CATEGORIAS DE APARTAMENTO ──────────

// ── TIPOS E CATEGORIAS DE APARTAMENTO (banco de dados) ───────

async function _loadAptoOpcoes(tabela) {
  const hotelId = (typeof _cfgHotelId === 'function') ? _cfgHotelId() : (currentUser?.hotelId || null);
  let q = supabaseClient.from(tabela).select('id, nome, hotel_id, ativo').order('ordem');
  if (hotelId) q = q.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);
  const { data } = await q;
  return data || [];
}

async function _populateAptoTipoSelect(selected) {
  const sel = document.getElementById('ca-tipo');
  if (!sel) return;
  const itens = await _loadAptoOpcoes('apto_tipos');
  const ativos = itens.filter(i => i.ativo);
  sel.innerHTML = ativos.map(i =>
    `<option value="${i.nome}" ${i.nome === selected ? 'selected' : ''}>${i.nome}</option>`
  ).join('');
}

async function _populateAptoCatSelect(selected) {
  const sel = document.getElementById('ca-categoria');
  if (!sel) return;
  const itens = await _loadAptoOpcoes('apto_categorias');
  const ativos = itens.filter(i => i.ativo);
  sel.innerHTML = ativos.map(i =>
    `<option value="${i.nome}" ${i.nome === selected ? 'selected' : ''}>${i.nome}</option>`
  ).join('');
}

async function renderConfigAptoTiposCats() {
  const [tipos, cats] = await Promise.all([
    _loadAptoOpcoes('apto_tipos'),
    _loadAptoOpcoes('apto_categorias'),
  ]);
  const elT = document.getElementById('config-apto-tipos');
  const elC = document.getElementById('config-apto-cats');
  if (elT) elT.innerHTML = _renderCfgRows(tipos, 'apto_tipos', 'tipo');
  if (elC) elC.innerHTML = _renderCfgRows(cats, 'apto_categorias', 'categoria');
}

function _renderCfgRows(itens, tabela, label) {
  const rows = itens.map(item => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;" id="cfgrow-${tabela}-${item.id}">
      <span style="font-size:12px;color:var(--text3);">${item.hotel_id ? '🏨' : '🌐'}</span>
      <span style="flex:1;font-size:13px;padding:6px 10px;background:var(--surface2);border-radius:var(--radius-sm);${!item.ativo?'text-decoration:line-through;color:var(--text3);':''}"
        id="cfgtext-${tabela}-${item.id}">${item.nome}</span>
      <div id="cfgedit-${tabela}-${item.id}" style="display:none;flex:1;">
        <input type="text" id="cfginput-${tabela}-${item.id}" value="${item.nome}"
          style="width:100%;padding:5px 8px;border:1.5px solid var(--primary-light);border-radius:var(--radius-sm);font-size:13px;"
          onkeydown="if(event.key==='Enter')_cfgSave('${tabela}',${item.id})">
      </div>
      <button class="btn btn-ghost btn-xs" id="cfgbtn-edit-${tabela}-${item.id}"
        onclick="_cfgStartEdit('${tabela}',${item.id})" title="Editar">✏️</button>
      <button class="btn btn-ghost btn-xs" id="cfgbtn-save-${tabela}-${item.id}" style="display:none;"
        onclick="_cfgSave('${tabela}',${item.id})" title="Salvar">💾</button>
      <button class="btn btn-ghost btn-xs" id="cfgbtn-cancel-${tabela}-${item.id}" style="display:none;"
        onclick="renderConfigAptoTiposCats()" title="Cancelar">✕</button>
      <button class="btn btn-ghost btn-xs" onclick="_cfgToggle('${tabela}',${item.id},${item.ativo})"
        title="${item.ativo?'Inativar':'Ativar'}">${item.ativo?'⏸':'▶'}</button>
      ${item.hotel_id
        ? `<button class="btn btn-ghost btn-xs" style="color:var(--danger);"
            onclick="_cfgDelete('${tabela}',${item.id})" title="Excluir">🗑</button>`
        : ''}
    </div>`).join('');
  return `${rows}
    <div style="display:flex;gap:8px;margin-top:10px;">
      <input id="cfg-new-${tabela}" type="text" placeholder="Novo ${label}..."
        style="flex:1;padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;"
        onkeydown="if(event.key==='Enter')_cfgAdd('${tabela}',this)">
      <button class="btn btn-primary btn-sm" onclick="_cfgAdd('${tabela}',document.getElementById('cfg-new-${tabela}'))">+ Adicionar</button>
    </div>`;
}

function _cfgStartEdit(tabela, id) {
  document.getElementById(`cfgtext-${tabela}-${id}`).style.display    = 'none';
  document.getElementById(`cfgedit-${tabela}-${id}`).style.display    = 'block';
  document.getElementById(`cfgbtn-edit-${tabela}-${id}`).style.display   = 'none';
  document.getElementById(`cfgbtn-save-${tabela}-${id}`).style.display   = '';
  document.getElementById(`cfgbtn-cancel-${tabela}-${id}`).style.display = '';
  document.getElementById(`cfginput-${tabela}-${id}`)?.focus();
}

async function _cfgSave(tabela, id) {
  const nome = document.getElementById(`cfginput-${tabela}-${id}`)?.value.trim();
  if (!nome) { toast('Informe o nome', 'error'); return; }
  const { error } = await supabaseClient.from(tabela).update({ nome }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Atualizado!', 'success');
  await renderConfigAptoTiposCats();
}

async function _cfgAdd(tabela, inputEl) {
  const nome = (inputEl?.value || '').trim();
  if (!nome) { toast('Informe o nome', 'error'); return; }
  if (typeof _cfgBlocked === 'function' && _cfgBlocked()) { toast('Selecione um hotel para editar configurações', 'error'); return; }
  const hotel_id = (typeof _cfgHotelId === 'function') ? _cfgHotelId() : (currentUser?.hotelId || null);
  const { data: existentes } = await supabaseClient.from(tabela).select('ordem').order('ordem', { ascending: false }).limit(1);
  const ordem = existentes?.length ? (existentes[0].ordem + 1) : 1;
  const { error } = await supabaseClient.from(tabela).insert([{ nome, hotel_id, ativo: true, ordem }]);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  if (inputEl) inputEl.value = '';
  toast('Adicionado!', 'success');
  await renderConfigAptoTiposCats();
}

async function _cfgToggle(tabela, id, ativo) {
  const { error } = await supabaseClient.from(tabela).update({ ativo: !ativo }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  await renderConfigAptoTiposCats();
}

async function _cfgDelete(tabela, id) {
  if (!confirm('Excluir este item?')) return;
  const { error } = await supabaseClient.from(tabela).delete().eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  toast('Excluído!', 'success');
  await renderConfigAptoTiposCats();
}

// renderConfigAptoTiposCats() chamada diretamente por renderConfig() em index.html

// ── PATCH: selecionarHotelMapa — recarrega chamados e filtros
const _origSelecionarHotelMapa = selecionarHotelMapa;
async function selecionarHotelMapa(hotelId) {
  await _origSelecionarHotelMapa(hotelId);
  if (hotelId) {
    await _carregarChamadosAbertosAptos(hotelId);
    _renderFiltrosBar('mapa-filtros-avancados');
  } else {
    _aptosComChamadoAberto.clear();
    document.getElementById('mapa-filtros-avancados').innerHTML = '';
  }
}
