// ================================================================
// MAIDS SERVICE — GovHotel
// Gerenciamento de camareiras vinculadas ao hotel
// Depende de: supabase-client.js, auth.js, apartments.js
// ================================================================

let _editingMaidId   = null;
let _maidViewHotelId = null;

// ── CARREGAR E SINCRONIZAR ────────────────────────────────────

async function renderEquipe() {
  // Bloqueia acesso para camareira (dupla garantia além do PERFIL_PAGES)
  if (currentUser.perfil === 'camareira') return;

  // Seletor de hotel para admin_global
  const selectorWrap = document.getElementById('equipe-hotel-selector');
  if (selectorWrap) {
    if (currentUser.perfil === 'admin_global') {
      selectorWrap.style.display = '';
      await _popularSeletorHotelEquipe();
    } else {
      selectorWrap.style.display = 'none';
      _maidViewHotelId = currentUser.hotelId;
    }
  }

  if (!_maidViewHotelId) {
    document.getElementById('equipe-table-body').innerHTML = `
      <tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text3);">
        Selecione um hotel para visualizar a equipe.
      </td></tr>`;
    _zerarStatsEquipe();
    return;
  }

  document.getElementById('equipe-table-body').innerHTML = `
    <tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3);">
      <div class="spinner" style="margin:0 auto 8px;border-top-color:var(--primary-light);"></div>
      Carregando equipe...
    </td></tr>`;

  await _fetchMaids(_maidViewHotelId);
  _renderEquipeTabela();
  _atualizarStatsEquipe();

  // Sincroniza seletor de camareira no formulário de aptos
  populateSelects();
}

async function _popularSeletorHotelEquipe() {
  const sel = document.getElementById('equipe-hotel-select');
  if (!sel) return;
  const { data } = await supabaseClient
    .from('hotels').select('id, nome').eq('ativo', true).order('nome');
  sel.innerHTML = '<option value="">Selecione um hotel...</option>' +
    (data || []).map(h =>
      `<option value="${h.id}" ${h.id === _maidViewHotelId ? 'selected' : ''}>${h.nome}</option>`
    ).join('');
}

async function _fetchMaids(hotelId) {
  const { data, error } = await supabaseClient
    .from('maids')
    .select('*')
    .eq('hotel_id', hotelId)
    .order('nome');

  if (error) {
    console.error('Erro maids:', error.message);
    return;
  }

  // Atualiza array local compatível com mapa/kanban/select
  equipe = (data || []).map((m, i) => ({
    id:        m.id,
    nome:      m.nome,
    cargo:     m.cargo             || 'Camareira',
    andar:     m.andar_responsavel || 'Todos',
    turno:     m.turno             || 'Manhã (07:00–15:00)',
    status:    m.status,
    telefone:  m.telefone          || '',
    email:     m.email             || '',
    hotel_id:  m.hotel_id,
    aptos_hoje: 0,
    avId:      (i % 6) + 1,
  }));
}

async function selecionarHotelEquipe(hotelId) {
  _maidViewHotelId = hotelId || null;
  await renderEquipe();
}

// ── RENDER TABELA ─────────────────────────────────────────────

function _renderEquipeTabela(filter = '') {
  const statusLabel = { ativo:'Ativo', ferias:'Férias', afastado:'Afastado', inativo:'Inativo' };
  const statusBadge = { ativo:'badge-livre', ferias:'badge-conferencia', afastado:'badge-sujo', inativo:'badge-bloqueado' };

  let lista = equipe;
  if (filter) {
    const q = filter.toLowerCase();
    lista = equipe.filter(e =>
      e.nome.toLowerCase().includes(q) ||
      e.cargo.toLowerCase().includes(q)
    );
  }

  const tbody = document.getElementById('equipe-table-body');
  if (!tbody) return;

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text3);">
      Nenhum membro encontrado.
    </td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(e => {
    const iniciais = e.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
    const andarLabel = (e.andar && e.andar !== 'Todos') ? `${e.andar}º Andar` : 'Todos';
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="user-avatar av-${e.avId}" style="width:30px;height:30px;font-size:11px;flex-shrink:0;">${iniciais}</div>
          <div>
            <div style="font-weight:600;">${e.nome}</div>
            ${e.telefone ? `<div style="font-size:11px;color:var(--text3);">${e.telefone}</div>` : ''}
          </div>
        </div>
      </td>
      <td>${e.cargo}</td>
      <td>${andarLabel}</td>
      <td style="font-size:12px;">${e.turno}</td>
      <td><strong>${e.aptos_hoje}</strong></td>
      <td>
        <span class="badge ${statusBadge[e.status] || 'badge-bloqueado'}">
          ${statusLabel[e.status] || e.status}
        </span>
      </td>
      <td>
        <button class="btn btn-ghost btn-xs" onclick="openMaidForm('${e.id}')" title="Editar">✏️</button>
        <button class="btn btn-ghost btn-xs"
          onclick="toggleMaidStatus('${e.id}', '${e.status}')"
          title="${e.status === 'ativo' ? 'Inativar' : 'Ativar'}">
          ${e.status === 'ativo' ? '⏸' : '▶'}
        </button>
      </td>
    </tr>`;
  }).join('');
}

function searchEquipe(q) { _renderEquipeTabela(q); }

function _atualizarStatsEquipe() {
  const total  = equipe.length;
  const ativos = equipe.filter(e => e.status === 'ativo').length;
  document.getElementById('eq-total').textContent = total;
  document.getElementById('eq-turno').textContent = ativos;
}

function _zerarStatsEquipe() {
  document.getElementById('eq-total').textContent = '0';
  document.getElementById('eq-turno').textContent = '0';
}

// ── FORMULÁRIO ────────────────────────────────────────────────

async function openMaidForm(id = null) {
  if (!requireWrite('maids')) return;
  _editingMaidId = id;
  const isEdit = !!id;

  document.getElementById('modal-membro-title').textContent  = isEdit ? 'Editar Membro' : 'Adicionar Membro';
  document.getElementById('btn-salvar-membro').textContent   = isEdit ? 'Salvar alterações' : 'Adicionar membro';
  document.getElementById('btn-salvar-membro').disabled      = false;

  // Limpar campos
  ['nm-nome','nm-telefone','nm-email'].forEach(fId => {
    const el = document.getElementById(fId); if (el) el.value = '';
  });
  document.getElementById('nm-cargo').value  = 'Camareira';
  document.getElementById('nm-andar').value  = '';
  document.getElementById('nm-turno').value  = 'Manhã (07:00–15:00)';
  document.getElementById('nm-status').value = 'ativo';

  // Seletor de hotel — visível apenas para admin_global
  const hotelWrap = document.getElementById('nm-hotel-wrap');
  if (hotelWrap) {
    if (currentUser.perfil === 'admin_global') {
      hotelWrap.style.display = '';
      await _popularCaHotelSelectMaid();
    } else {
      hotelWrap.style.display = 'none';
    }
  }

  if (isEdit) {
    const m = equipe.find(x => x.id === id);
    if (m) {
      document.getElementById('nm-nome').value     = m.nome;
      document.getElementById('nm-cargo').value    = m.cargo;
      document.getElementById('nm-andar').value    = m.andar === 'Todos' ? '' : m.andar;
      document.getElementById('nm-turno').value    = m.turno;
      document.getElementById('nm-status').value   = m.status;
      document.getElementById('nm-telefone').value = m.telefone || '';
      document.getElementById('nm-email').value    = m.email    || '';
    }
  }

  openModal('modal-novo-membro');
  document.getElementById('nm-nome').focus();
}

async function _popularCaHotelSelectMaid() {
  const sel = document.getElementById('nm-hotel-id');
  if (!sel) return;
  const { data } = await supabaseClient
    .from('hotels').select('id, nome').eq('ativo', true).order('nome');
  sel.innerHTML = '<option value="">Selecione o hotel *</option>' +
    (data || []).map(h =>
      `<option value="${h.id}" ${h.id === _maidViewHotelId ? 'selected' : ''}>${h.nome}</option>`
    ).join('');
}

// Override do salvarNovoMembro inline
async function salvarNovoMembro() {
  if (!requireWrite('maids')) return;
  const nome     = document.getElementById('nm-nome').value.trim();
  const cargo    = document.getElementById('nm-cargo').value;
  const andar    = document.getElementById('nm-andar').value || null;
  const turno    = document.getElementById('nm-turno').value;
  const status   = document.getElementById('nm-status').value;
  const telefone = document.getElementById('nm-telefone').value.trim() || null;
  const email    = document.getElementById('nm-email').value.trim()    || null;

  let hotel_id = currentUser.perfil === 'admin_global'
    ? (document.getElementById('nm-hotel-id')?.value || _maidViewHotelId)
    : currentUser.hotelId;

  if (!nome)     { toast('Informe o nome completo', 'error'); return; }
  if (!hotel_id) { toast('Selecione o hotel', 'error'); return; }

  const btn = document.getElementById('btn-salvar-membro');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  const payload = {
    nome, cargo, turno, status, hotel_id,
    andar_responsavel: andar,
    telefone, email,
  };

  let error;
  if (_editingMaidId) {
    ({ error } = await supabaseClient.from('maids').update(payload).eq('id', _editingMaidId));
  } else {
    ({ error } = await supabaseClient.from('maids').insert([payload]));
  }

  if (btn) { btn.disabled = false; btn.textContent = _editingMaidId ? 'Salvar alterações' : 'Adicionar membro'; }

  if (error) { toast('Erro: ' + error.message, 'error'); return; }

  closeModal('modal-novo-membro');
  toast(_editingMaidId ? `${nome} atualizado(a)!` : `${nome} adicionado(a) à equipe!`, 'success');
  _editingMaidId = null;

  await renderEquipe();
}

// ── ATIVAR / INATIVAR ─────────────────────────────────────────

async function toggleMaidStatus(id, statusAtual) {
  const maid = equipe.find(m => m.id === id);
  if (!maid) return;

  const novoStatus = statusAtual === 'ativo' ? 'inativo' : 'ativo';
  const acao       = statusAtual === 'ativo' ? 'inativar' : 'ativar';

  if (!confirm(`Deseja ${acao} "${maid.nome}"?`)) return;

  const { error } = await supabaseClient
    .from('maids').update({ status: novoStatus }).eq('id', id);

  if (error) { toast('Erro: ' + error.message, 'error'); return; }

  maid.status = novoStatus;
  toast(`${maid.nome} ${novoStatus === 'ativo' ? 'ativado(a)' : 'inativado(a)'}!`, 'success');
  _renderEquipeTabela();
  _atualizarStatsEquipe();
  populateSelects(); // atualiza select de camareira no form de aptos
}
