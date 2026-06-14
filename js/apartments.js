// ================================================================
// APARTMENTS SERVICE — GovHotel
// Gerenciamento de apartamentos vinculados ao hotel
// Depende de: supabase-client.js, auth.js
// ================================================================

let _editingAptoId  = null;
let _aptoViewHotelId = null; // hotel selecionado na visualização (admin_global)

// ── SINCRONIZAR COM SUPABASE ──────────────────────────────────

async function syncApartamentos() {
  const hotelId = currentUser.perfil === 'admin_global'
    ? _aptoViewHotelId
    : currentUser.hotelId;

  if (!hotelId) return;

  const { data: aptosData, error: aptosErr } = await supabaseClient
    .from('apartments')
    .select('*, maids!maid_id(id, nome)')
    .eq('hotel_id', hotelId)
    .order('andar')
    .order('numero');

  if (aptosErr) {
    console.error('Erro apartments:', aptosErr.message);
    return;
  }

  // Resolve nomes de camareira: tenta maids, depois user_profiles
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
    _maid_nome:   _camNamesExtra[a.maid_id] || a.maids?.nome || null,
    avId:         (i % 6) + 1,
  }));

  // Sincroniza equipe (maids) do mesmo hotel
  await _syncEquipe(hotelId);
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
    .from('maids')
    .select('*')
    .eq('hotel_id', hotelId)
    .eq('status', 'ativo')
    .order('nome');

  if (data) {
    equipe = data.map((m, i) => ({
      id:        m.id,
      nome:      m.nome,
      cargo:     m.cargo              || 'Camareira',
      andar:     m.andar_responsavel  || 'Todos',
      turno:     m.turno              || 'Manhã (07:00–15:00)',
      status:    m.status,
      aptos_hoje: 0,
      avId:      (i % 6) + 1,
    }));
  }
}

// ── RENDER PÁGINA PRINCIPAL ───────────────────────────────────

async function renderApartamentos() {
  // Controla visibilidade do seletor de hotel (admin_global)
  const selectorWrap = document.getElementById('apto-hotel-selector');
  if (selectorWrap) {
    if (currentUser.perfil === 'admin_global') {
      selectorWrap.style.display = '';
      await _popularSeletorHotelPagina();
    } else {
      _aptoViewHotelId = currentUser.hotelId;
      if (typeof _renderHotelChip === 'function') _renderHotelChip('apto-hotel-selector');
      else selectorWrap.style.display = 'none';
    }
  }

  // Oculta botões de escrita para camareira
  const _isCam = currentUser.perfil === 'camareira';
  const btnCadastrar = document.getElementById('btn-cadastrar-apto');
  if (btnCadastrar) btnCadastrar.style.display = _isCam ? 'none' : '';
  const btnLote = document.getElementById('btn-gerar-lote');
  if (btnLote) btnLote.style.display = _isCam ? 'none' : '';

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
          ? `<div style="font-size:12px;font-weight:600;">${cam.nome.split(' ')[0]}</div>`
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
  document.getElementById('ca-andar').value  = '1';
  document.getElementById('ca-leitos').value = '2';
  document.getElementById('ca-status').value = 'livre';
  _populateAptoTipoSelect();
  _populateAptoCatSelect();

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
      document.getElementById('ca-andar').value  = a.andar;
      document.getElementById('ca-leitos').value = a.leitos;
      _populateAptoTipoSelect(a.tipo);
      _populateAptoCatSelect(a.categoria);
      document.getElementById('ca-status').value = a.status;
      document.getElementById('ca-obs').value    = a.obs || '';
      _selectedCamId = a.camareira_id || null;
      if (_formHotelId === null) _formHotelId = a.hotel_id;
    }
  }

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

// ── CADASTRO EM LOTE ─────────────────────────────────────────

let _loteNovos      = [];
let _loteDuplicados = [];
let _loteHotelId    = null;
let _lotePreviewOk  = false;

async function openGerarLoteModal() {
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

  // Popula tipo/categoria reaproveitando listas configuradas
  _populateGlTipoSelect();
  _populateGlCatSelect();
  document.getElementById('gl-status').value = 'livre';

  // Camareira
  const hotelIdParaCam = currentUser.perfil === 'admin_global'
    ? (_aptoViewHotelId || null)
    : currentUser.hotelId;
  await _popularGlCamareiraSelect(null, hotelIdParaCam);

  _atualizarGlExemplo();
  openModal('modal-gerar-lote');
}

function _populateGlTipoSelect(selected) {
  const sel = document.getElementById('gl-tipo');
  if (!sel) return;
  const vals = _cfgGet(_TIPOS_KEY, _TIPOS_DEFAULT);
  sel.innerHTML = vals.map(v =>
    `<option value="${v}" ${v === (selected || vals[0]) ? 'selected' : ''}>${v}</option>`
  ).join('');
}

function _populateGlCatSelect(selected) {
  const sel = document.getElementById('gl-categoria');
  if (!sel) return;
  const vals = _cfgGet(_CATS_KEY, _CATS_DEFAULT);
  sel.innerHTML = vals.map(v =>
    `<option value="${v}" ${v === (selected || vals[0]) ? 'selected' : ''}>${v}</option>`
  ).join('');
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

// Override do mudarStatusApto do inline script
async function mudarStatusApto(id, novoStatus, obs = null) {
  const apto = aptos.find(a => a.id === id);
  if (!apto) return;

  const statusAnterior = apto.status;

  const { error } = await supabaseClient
    .from('apartments')
    .update({ status: novoStatus })
    .eq('id', id);

  if (error) { toast('Erro ao atualizar: ' + error.message, 'error'); return; }

  // Registrar histórico com obs opcional
  const histPayload = {
    apartment_id:    id,
    status_anterior: statusAnterior,
    status_novo:     novoStatus,
    alterado_por:    currentUser.id,
  };
  if (obs) histPayload.obs = obs;
  await supabaseClient.from('apartment_status_history').insert(histPayload);

  apto.status = novoStatus;
  const label = (typeof _STATUS_LABELS !== 'undefined' ? _STATUS_LABELS[novoStatus] : null) || novoStatus;
  toast(`Apto ${apto.numero} → ${label}`, 'success');
  closeModal('modal-apto-detail');

  if (currentPage === 'mapa')          renderMapa();
  if (currentPage === 'kanban')        renderKanban();
  if (currentPage === 'dashboard')     renderDashboard();
  if (currentPage === 'app-camareira') renderAppCamareira();
  if (currentPage === 'cadastro-apto') renderCadastroTableDb();
}

async function salvarTrocarStatus() {
  const aptoNum  = document.getElementById('ts-apto').value;
  const novoStatus = document.getElementById('ts-status').value;
  if (!aptoNum) { toast('Selecione um apartamento', 'error'); return; }
  const apto = aptos.find(a => a.numero === aptoNum);
  if (!apto) return;
  closeModal('modal-trocar-status');
  await mudarStatusApto(apto.id, novoStatus);
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
  const acao = apto.status === 'pausado' ? 'retomada' : 'iniciada';
  const obs  = `Limpeza ${acao} por ${currentUser.nome} em ${new Date().toLocaleString('pt-BR')}`;
  await mudarStatusApto(selectedAptoId, 'limpando', obs);
}

function abrirModalPausa(id) {
  selectedAptoId = id;
  const el = document.getElementById('pausa-motivo');
  if (el) el.value = '';
  closeModal('modal-apto-detail');
  openModal('modal-pausar-limpeza');
  if (el) el.focus();
}

async function pausarLimpeza() {
  const motivo = (document.getElementById('pausa-motivo')?.value || '').trim();
  if (!motivo) { toast('Informe o motivo da pausa', 'error'); return; }
  closeModal('modal-pausar-limpeza');
  const obs = `Pausado por ${currentUser.nome} em ${new Date().toLocaleString('pt-BR')}: ${motivo}`;
  await mudarStatusApto(selectedAptoId, 'pausado', obs);
}

// Redireciona para o checklist antes de concluir
function concluirLimpeza() {
  abrirChecklistLimpeza();
}

// ── CONFERÊNCIA DA SUPERVISORA ────────────────────────────────

async function aprovarLimpeza() {
  const apto = aptos.find(a => a.id === selectedAptoId);
  if (!apto) return;
  const obs = `Aprovado por ${currentUser.nome} em ${new Date().toLocaleString('pt-BR')}`;
  await mudarStatusApto(selectedAptoId, 'limpo', obs);
}

function abrirModalReprovacao() {
  const sel = document.getElementById('rep-motivo');
  const obs = document.getElementById('rep-obs');
  if (sel) sel.value = '';
  if (obs) obs.value = '';
  closeModal('modal-apto-detail');
  openModal('modal-reprovacao');
  if (sel) sel.focus();
}

async function reprovarLimpeza() {
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

// ── CHECKLIST DE LIMPEZA ──────────────────────────────────────

const CHECKLIST_LIMPEZA = [
  { id: 'banheiro',   label: 'Banheiro limpo',                 obrigatorio: true  },
  { id: 'enxoval',    label: 'Enxoval conferido',              obrigatorio: true  },
  { id: 'amenities',  label: 'Amenities repostos',             obrigatorio: true  },
  { id: 'lixeira',    label: 'Lixeira retirada',               obrigatorio: true  },
  { id: 'piso',       label: 'Piso limpo',                     obrigatorio: true  },
  { id: 'frigobar',   label: 'Frigobar conferido',             obrigatorio: false },
  { id: 'manutencao', label: 'Manutenção aparente verificada', obrigatorio: false },
];

function abrirChecklistLimpeza() {
  const apto = aptos.find(a => a.id === selectedAptoId);
  if (!apto) return;

  const titulo = document.getElementById('cl-apto-titulo');
  if (titulo) titulo.textContent = `✅ Checklist — Apto ${apto.numero}`;

  const tipoEl = document.getElementById('cl-tipo-limpeza');
  if (tipoEl) tipoEl.value = 'saida';

  const obsGeralEl = document.getElementById('cl-obs-geral');
  if (obsGeralEl) obsGeralEl.value = '';

  _renderChecklistItens();
  closeModal('modal-apto-detail');
  openModal('modal-checklist-limpeza');
}

function _renderChecklistItens() {
  const container = document.getElementById('cl-items');
  if (!container) return;
  container.innerHTML = CHECKLIST_LIMPEZA.map(item => `
    <div class="cl-item" id="cl-item-${item.id}">
      <div class="cl-item-header">
        <span class="cl-item-label">
          ${item.label}${item.obrigatorio ? ' <span style="color:var(--danger);">*</span>' : ''}
        </span>
        <div class="cl-opcoes">
          <input class="cl-radio-btn" type="radio" id="cl-${item.id}-c"  name="cl-${item.id}" value="conforme"     onchange="_clChange('${item.id}')">
          <label class="cl-radio-label" for="cl-${item.id}-c">Conforme</label>
          <input class="cl-radio-btn" type="radio" id="cl-${item.id}-nc" name="cl-${item.id}" value="nao_conforme" onchange="_clChange('${item.id}')">
          <label class="cl-radio-label" for="cl-${item.id}-nc">Não conforme</label>
          <input class="cl-radio-btn" type="radio" id="cl-${item.id}-na" name="cl-${item.id}" value="nao_aplica"   onchange="_clChange('${item.id}')">
          <label class="cl-radio-label" for="cl-${item.id}-na">N/A</label>
        </div>
      </div>
      <div class="cl-obs-wrap" id="cl-obs-wrap-${item.id}" style="display:none;">
        <textarea id="cl-obs-${item.id}" placeholder="Descreva o problema encontrado *" rows="2"></textarea>
      </div>
    </div>`).join('');
}

function _clChange(itemId) {
  const val = document.querySelector(`input[name="cl-${itemId}"]:checked`)?.value;
  const wrap = document.getElementById(`cl-obs-wrap-${itemId}`);
  if (wrap) wrap.style.display = val === 'nao_conforme' ? '' : 'none';
  // Remove destaque de pendente ao responder
  const itemEl = document.getElementById(`cl-item-${itemId}`);
  if (itemEl) itemEl.classList.remove('cl-pendente');
}

async function concluirChecklistLimpeza() {
  const apto = aptos.find(a => a.id === selectedAptoId);
  if (!apto) return;

  const tipo      = document.getElementById('cl-tipo-limpeza')?.value || 'saida';
  const obsGeral  = document.getElementById('cl-obs-geral')?.value.trim() || null;
  const respostas = [];
  const erros     = [];

  for (const item of CHECKLIST_LIMPEZA) {
    const val = document.querySelector(`input[name="cl-${item.id}"]:checked`)?.value || null;
    const obs = document.getElementById(`cl-obs-${item.id}`)?.value.trim() || null;

    if (item.obrigatorio && !val) {
      erros.push(item.id);
      continue;
    }
    if (val === 'nao_conforme' && !obs) {
      toast(`"${item.label}": descreva o problema encontrado`, 'error');
      document.getElementById(`cl-obs-${item.id}`)?.focus();
      // Marca itens sem resposta antes de retornar
      erros.forEach(id => document.getElementById(`cl-item-${id}`)?.classList.add('cl-pendente'));
      return;
    }
    if (val) respostas.push({ item: item.label, resultado: val, obs });
  }

  if (erros.length) {
    erros.forEach(id => document.getElementById(`cl-item-${id}`)?.classList.add('cl-pendente'));
    toast(`Preencha os itens obrigatórios destacados`, 'error');
    return;
  }

  const btn = document.querySelector('#modal-checklist-limpeza .btn-success');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  const { error } = await supabaseClient.from('limpeza_checklists').insert({
    apartment_id: selectedAptoId,
    hotel_id:     apto.hotel_id,
    usuario_id:   currentUser.id,
    tipo_limpeza: tipo,
    respostas,
    obs_geral:    obsGeral,
  });

  if (btn) { btn.disabled = false; btn.textContent = '✓ Concluir limpeza'; }

  if (error) { toast('Erro ao salvar checklist: ' + error.message, 'error'); return; }

  closeModal('modal-checklist-limpeza');
  const obsHist = `Checklist concluído por ${currentUser.nome} em ${new Date().toLocaleString('pt-BR')} (${respostas.length} itens)`;
  await mudarStatusApto(selectedAptoId, 'conferencia', obsHist);
}

// ── ADAPTAR renderAppCamareira para usar dados do Supabase ────

async function renderAppCamareira() {
  document.getElementById('app-camareira-nome').textContent = currentUser.nome;

  // Carrega aptos se ainda não carregados
  if (!aptos.length || aptos[0]?.hotel_id !== currentUser.hotelId) {
    _aptoViewHotelId = currentUser.hotelId;
    await syncApartamentos();
  }

  // Filtra aptos da camareira logada (via maid.user_id)
  const maid = equipe.find(e => e.id && currentUser.id); // ajuste fino na Etapa 5
  const meus = aptos; // por ora mostra todos do hotel; Etapa 5 filtrará por maid_id

  const aLimpar    = meus.filter(a => a.status === 'sujo').length;
  const limpando   = meus.filter(a => a.status === 'limpando').length;
  const concluidos = meus.filter(a => ['livre','conferencia'].includes(a.status)).length;

  document.getElementById('app-a-limpar').textContent   = aLimpar;
  document.getElementById('app-limpando').textContent   = limpando;
  document.getElementById('app-concluidos').textContent = concluidos;
  document.getElementById('app-aptos-count').textContent= `${meus.length} aptos no hotel`;

  const icons = {
    livre:'✅', sujo:'🧺', limpando:'🧹', pausado:'⏸',
    conferencia:'🔍', limpo:'✨', reprovado:'❌',
    bloqueado:'🔒', ocupado:'🏠', manutencao:'🔧'
  };

  document.getElementById('app-apto-list').innerHTML = meus.map(a => `
    <div class="apto-card-app ${a.status}" onclick="abrirChecklistApp('${a.id}')">
      <div>
        <div class="app-apto-num">${a.numero}</div>
        <div class="app-apto-info">${a.tipo} · ${a.andar}º andar</div>
        <div style="margin-top:4px;"><span class="badge badge-${a.status}">${a.status}</span></div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:28px;">${icons[a.status]||'❓'}</div>
        ${a.status==='sujo'?'<div style="font-size:11px;color:var(--warning);font-weight:700;margin-top:4px;">TAP PARA INICIAR</div>':''}
        ${a.status==='limpando'?'<div style="font-size:11px;color:var(--info);font-weight:700;margin-top:4px;">EM ANDAMENTO</div>':''}
      </div>
    </div>`).join('');
}

// ── ADAPTAR abrirChecklistApp para UUIDs ─────────────────────

function abrirChecklistApp(id) {
  selectedAptoId = id;
  const apto = aptos.find(a => a.id === id);
  if (!apto) return;
  document.getElementById('checklist-title').textContent = `Limpeza — Apto ${apto.numero}`;
  checklistState = CHECKLIST_PADRAO.map(item => ({ label: item, done: false }));
  if (apto.status === 'sujo') {
    mudarStatusApto(id, 'limpando'); // persiste no Supabase
  }
  renderChecklist();
  openModal('modal-checklist');
}

async function concluirChecklist() {
  // Redireciona para o checklist completo (valida obrigatórios, salva no banco)
  closeModal('modal-checklist');
  abrirChecklistLimpeza();
}

// ── MAPA COM SELETOR DE HOTEL (admin_global) ──────────────────

async function initMapaAdmin() {
  const wrap = document.getElementById('mapa-hotel-selector');
  if (!wrap) return;

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

// Estado dos filtros (compartilhado entre mapa e kanban)
const _aptoFiltros = {
  status:     'todos',
  andar:      '',
  camareira:  '',
  tipo:       '',
  comChamado: false,
};

// Set de apartment_ids com chamados abertos (carregado sob demanda)
const _aptosComChamadoAberto = new Set();

// ── APLICAR FILTROS AO ARRAY DE APTOS ────────────────────────
function _filtrarAptos(lista) {
  return lista.filter(a => {
    if (_aptoFiltros.status !== 'todos' && a.status !== _aptoFiltros.status) return false;
    if (_aptoFiltros.andar     && String(a.andar)       !== String(_aptoFiltros.andar))   return false;
    if (_aptoFiltros.camareira && a.camareira_id        !== _aptoFiltros.camareira)        return false;
    if (_aptoFiltros.tipo      && a.tipo                !== _aptoFiltros.tipo)             return false;
    if (_aptoFiltros.comChamado && !_aptosComChamadoAberto.has(a.id))                      return false;
    return true;
  });
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
        `<option value="${c.id}" ${_aptoFiltros.camareira === c.id ? 'selected' : ''}>${c.nome.split(' ')[0]}</option>`
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
      const icon       = (typeof _STATUS_ICONS  !== 'undefined' ? _STATUS_ICONS[a.status]  : null) || '❓';
      const lbl        = (typeof _STATUS_LABELS !== 'undefined' ? _STATUS_LABELS[a.status] : null) || a.status;
      const temChamado = _aptosComChamadoAberto.has(a.id);
      html += `<div class="apto-card ${a.status}" onclick="openAptoDetail('${a.id}')" style="position:relative;">
        ${a.prioridade ? '<div class="apto-priority"></div>' : ''}
        ${temChamado ? '<div style="position:absolute;top:4px;right:4px;font-size:9px;font-weight:700;background:var(--danger);color:#fff;border-radius:8px;padding:1px 5px;line-height:1.5;" title="Chamado aberto">📋</div>' : ''}
        <div class="apto-status-icon">${icon}</div>
        <div class="apto-num">${a.numero}</div>
        <div class="apto-tipo">${a.tipo}</div>
        <span class="badge badge-${a.status}" style="font-size:10px;">${lbl}</span>
      </div>`;
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
  const cols  = [
    { key:'sujo',        label:'Sujo',          color:'#e67e22' },
    { key:'limpando',    label:'Em limpeza',     color:'#2e86c1' },
    { key:'pausado',     label:'Pausado',        color:'#f39c12' },
    { key:'conferencia', label:'Aguard. conf.',  color:'#8e44ad' },
    { key:'limpo',       label:'Limpo',          color:'#1abc9c' },
    { key:'reprovado',   label:'Reprovado',      color:'#e74c3c' },
    { key:'manutencao',  label:'Manutenção',     color:'#f1c40f' },
  ];

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
          ${cam ? `<div style="font-size:11px;color:var(--text3);margin-top:4px;">👤 ${cam.nome.split(' ')[0]}</div>` : ''}
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

const _TIPOS_KEY = 'gov_apto_tipos';
const _CATS_KEY  = 'gov_apto_cats';
const _TIPOS_DEFAULT = ['Standard','Superior','Deluxe','Suíte','Master'];
const _CATS_DEFAULT  = ['Regular','VIP','Acessível','Família'];

function _cfgGet(key, defaults) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : [...defaults]; } catch { return [...defaults]; }
}
function _cfgSet(key, arr) { localStorage.setItem(key, JSON.stringify(arr)); }

function _populateAptoTipoSelect(selected) {
  const sel = document.getElementById('ca-tipo');
  if (!sel) return;
  const vals = _cfgGet(_TIPOS_KEY, _TIPOS_DEFAULT);
  sel.innerHTML = vals.map(v => `<option value="${v}" ${v === selected ? 'selected' : ''}>${v}</option>`).join('');
}
function _populateAptoCatSelect(selected) {
  const sel = document.getElementById('ca-categoria');
  if (!sel) return;
  const vals = _cfgGet(_CATS_KEY, _CATS_DEFAULT);
  sel.innerHTML = vals.map(v => `<option value="${v}" ${v === selected ? 'selected' : ''}>${v}</option>`).join('');
}

function renderConfigAptoTiposCats() {
  const elT = document.getElementById('config-apto-tipos');
  const elC = document.getElementById('config-apto-cats');
  if (elT) elT.innerHTML = _renderCfgItems(_TIPOS_KEY, _TIPOS_DEFAULT, 'tipo');
  if (elC) elC.innerHTML = _renderCfgItems(_CATS_KEY,  _CATS_DEFAULT,  'categoria');
}

function _renderCfgItems(key, defaults, label) {
  const items = _cfgGet(key, defaults);
  const rows = items.map((item, i) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      <span style="flex:1;font-size:13px;padding:6px 10px;background:var(--surface2);border-radius:var(--radius-sm);">${item}</span>
      <button class="btn btn-ghost btn-xs" onclick="_cfgEdit('${key}',${i})" title="Editar">✏️</button>
      ${items.length > 1 ? `<button class="btn btn-ghost btn-xs" style="color:var(--danger);" onclick="_cfgRemove('${key}',${i})" title="Excluir">✕</button>` : ''}
    </div>`).join('');
  return `${rows}
    <div style="display:flex;gap:8px;margin-top:10px;">
      <input id="cfg-new-${key}" type="text" placeholder="Novo ${label}..."
        style="flex:1;padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;"
        onkeydown="if(event.key==='Enter')_cfgAdd('${key}',this)">
      <button class="btn btn-primary btn-sm" onclick="_cfgAdd('${key}',document.getElementById('cfg-new-${key}'))">+ Adicionar</button>
    </div>`;
}

function _cfgAdd(key, inputEl) {
  const val = (inputEl.value || '').trim();
  if (!val) { toast('Digite um nome', 'error'); return; }
  const defaults = key === _TIPOS_KEY ? _TIPOS_DEFAULT : _CATS_DEFAULT;
  const arr = _cfgGet(key, defaults);
  if (arr.map(v => v.toLowerCase()).includes(val.toLowerCase())) { toast('Já existe', 'error'); return; }
  arr.push(val);
  _cfgSet(key, arr);
  inputEl.value = '';
  renderConfigAptoTiposCats();
  toast('Adicionado!', 'success');
}

function _cfgRemove(key, idx) {
  const defaults = key === _TIPOS_KEY ? _TIPOS_DEFAULT : _CATS_DEFAULT;
  const arr = _cfgGet(key, defaults);
  if (arr.length <= 1) return;
  if (!confirm(`Excluir "${arr[idx]}"?`)) return;
  arr.splice(idx, 1);
  _cfgSet(key, arr);
  renderConfigAptoTiposCats();
  toast('Removido!', 'success');
}

function _cfgEdit(key, idx) {
  const defaults = key === _TIPOS_KEY ? _TIPOS_DEFAULT : _CATS_DEFAULT;
  const arr = _cfgGet(key, defaults);
  const novo = prompt('Novo nome:', arr[idx]);
  if (!novo || !novo.trim() || novo.trim() === arr[idx]) return;
  arr[idx] = novo.trim();
  _cfgSet(key, arr);
  renderConfigAptoTiposCats();
  toast('Atualizado!', 'success');
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
