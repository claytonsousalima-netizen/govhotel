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
    _maid_nome:   a.maids?.nome || null,
    avId:         (i % 6) + 1,
  }));

  // Sincroniza equipe (maids) do mesmo hotel
  await _syncEquipe(hotelId);
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
      selectorWrap.style.display = 'none';
      _aptoViewHotelId = currentUser.hotelId;
    }
  }

  // Oculta botão "Cadastrar" para camareira
  const btnCadastrar = document.getElementById('btn-cadastrar-apto');
  if (btnCadastrar) btnCadastrar.style.display = currentUser.perfil === 'camareira' ? 'none' : '';

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
  document.getElementById('ca-andar').value     = '1';
  document.getElementById('ca-leitos').value    = '2';
  document.getElementById('ca-tipo').value      = 'Standard';
  document.getElementById('ca-categoria').value = 'Regular';
  document.getElementById('ca-status').value    = 'livre';
  document.getElementById('ca-camareira').value = '';

  // Seletor de hotel — visível apenas para admin_global
  const hotelWrap = document.getElementById('ca-hotel-wrap');
  if (hotelWrap) {
    if (currentUser.perfil === 'admin_global') {
      hotelWrap.style.display = '';
      await _populateCaHotelSelect();
    } else {
      hotelWrap.style.display = 'none';
    }
  }

  // Preencher campos se editando
  if (isEdit) {
    const a = aptos.find(x => x.id === id);
    if (a) {
      document.getElementById('ca-numero').value    = a.numero;
      document.getElementById('ca-andar').value     = a.andar;
      document.getElementById('ca-leitos').value    = a.leitos;
      document.getElementById('ca-tipo').value      = a.tipo;
      document.getElementById('ca-categoria').value = a.categoria;
      document.getElementById('ca-status').value    = a.status;
      document.getElementById('ca-camareira').value = a.camareira_id || '';
      document.getElementById('ca-obs').value       = a.obs || '';
    }
  }

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

async function concluirLimpeza() {
  const obs = `Limpeza concluída por ${currentUser.nome} em ${new Date().toLocaleString('pt-BR')}`;
  await mudarStatusApto(selectedAptoId, 'conferencia', obs);
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
  const done = checklistState.filter(i => i.done).length;
  if (done < checklistState.length * 0.8) {
    toast('Complete pelo menos 80% dos itens', 'error'); return;
  }
  const apto = aptos.find(a => a.id === selectedAptoId);
  if (!apto) return;
  await mudarStatusApto(selectedAptoId, 'conferencia');
  closeModal('modal-checklist');
  toast(`Apto ${apto.numero} enviado para conferência! ✅`, 'success');
  renderAppCamareira();
}

// ── MAPA COM SELETOR DE HOTEL (admin_global) ──────────────────

async function initMapaAdmin() {
  const wrap = document.getElementById('mapa-hotel-selector');
  if (!wrap) return;

  if (currentUser.perfil !== 'admin_global') {
    wrap.style.display = 'none';
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
