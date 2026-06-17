// ================================================================
// MAIDS SERVICE — Gov Estancorp
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
      selectorWrap.style.display = 'block';
      await _popularSeletorHotelEquipe();
    } else {
      _maidViewHotelId = currentUser.hotelId;
      if (typeof _renderHotelChip === 'function') _renderHotelChip('equipe-hotel-selector');
      else selectorWrap.style.display = 'none';
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

  // Botão "Adicionar Membro" redireciona para Usuários (criação de camareira exige login no sistema)
  const btnAddMembro = document.querySelector('[onclick="openMaidForm()"]');
  if (btnAddMembro) {
    const isAdmin = ['admin_global','admin_hotel'].includes(currentUser.perfil);
    btnAddMembro.style.display = isAdmin ? '' : 'none';
    btnAddMembro.setAttribute('onclick', "openPage('usuarios')");
    btnAddMembro.title = 'Cadastrar novo membro em Usuários';
  }

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
    .from('user_profiles')
    .select('user_id, nome, perfil, ativo, hotel_id, turnos(label)')
    .in('perfil', ['camareira', 'manutencao'])
    .eq('hotel_id', hotelId)
    .eq('ativo', true)
    .order('nome');

  if (error) console.error('Erro equipe (user_profiles):', error.message);

  equipe = (data || []).map((u, i) => ({
    id:         u.user_id,
    user_id:    u.user_id,
    nome:       u.nome,
    andar:      'Todos',
    turno:      u.turnos?.label || '—',
    status:     'ativo',
    telefone:   '',
    email:      '',
    hotel_id:   u.hotel_id,
    aptos_hoje: 0,
    avId:       (i % 6) + 1,
    _source:    'user_profiles',
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
      e.nome.toLowerCase().includes(q)
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

      <td>${andarLabel}</td>
      <td style="font-size:12px;">${e.turno}</td>
      <td><strong>${e.aptos_hoje}</strong></td>
      <td>
        <span class="badge ${statusBadge[e.status] || 'badge-bloqueado'}">
          ${statusLabel[e.status] || e.status}
        </span>
      </td>
      <td>
        ${['admin_global','admin_hotel'].includes(currentUser.perfil) ? `
          ${e._source === 'user_profiles'
            ? `<button class="btn btn-ghost btn-xs" onclick="openPage('usuarios')" title="Editar usuário">✏️</button>`
            : `<button class="btn btn-ghost btn-xs" onclick="openMaidForm('${e.id}')" title="Editar">✏️</button>`
          }
          <button class="btn btn-ghost btn-xs"
            onclick="toggleMaidStatus('${e.id}', '${e.status}')"
            title="${e.status === 'ativo' ? 'Inativar' : 'Ativar'}">
            ${e.status === 'ativo' ? '⏸' : '▶'}
          </button>` : '<span style="font-size:11px;color:var(--text3);">—</span>'
        }
      </td>
    </tr>`;
  }).join('');
}

function searchEquipe(q) { _renderEquipeTabela(q); }

async function _atualizarStatsEquipe() {
  const total  = equipe.length;
  const ativos = equipe.filter(e => e.status === 'ativo').length;
  document.getElementById('eq-total').textContent = total;
  document.getElementById('eq-turno').textContent = ativos;

  // Produtividade e aptos/camareira calculados via apartment_status_history do dia
  const elProd  = document.getElementById('eq-produtividade');
  const elAptos = document.getElementById('eq-aptos-camareira');
  if (!elProd || !elAptos) return;

  const hojeInicio = new Date();
  hojeInicio.setHours(0, 0, 0, 0);
  const hotelId = _maidViewHotelId || currentUser.hotelId;

  // Busca histórico de hoje: saídas de 'sujo' (início de limpeza) e chegadas em 'limpo' (conclusão)
  let q = supabaseClient
    .from('apartment_status_history')
    .select('apartment_id, status_anterior, status_novo')
    .gte('created_at', hojeInicio.toISOString());

  if (hotelId) {
    // filtra pelos aptos do hotel via subquery local (apartment_status_history não tem hotel_id)
    const idsDoHotel = (typeof aptos !== 'undefined' ? aptos : [])
      .filter(a => a.hotel_id === hotelId)
      .map(a => a.id);
    if (idsDoHotel.length) q = q.in('apartment_id', idsDoHotel);
  }

  const { data: hist } = await q;
  const registros = hist || [];

  // Aptos que iniciaram limpeza hoje (saíram de 'sujo')
  const iniciados = new Set(
    registros.filter(r => r.status_anterior === 'sujo').map(r => r.apartment_id)
  );
  // Aptos concluídos hoje (chegaram em 'limpo')
  const concluidos = new Set(
    registros.filter(r => r.status_novo === 'limpo').map(r => r.apartment_id)
  );

  // Produtividade = concluídos / iniciados × 100
  const produtividade = iniciados.size > 0
    ? Math.round((concluidos.size / iniciados.size) * 100)
    : null;

  // Aptos/camareira = concluídos / camareiras ativas
  const camareirasAtivas = equipe.filter(e => e.status === 'ativo').length;
  const aptosPorCamareira = camareirasAtivas > 0
    ? (concluidos.size / camareirasAtivas).toFixed(1)
    : null;

  elProd.textContent  = produtividade !== null ? produtividade + '%' : '—';
  elAptos.textContent = aptosPorCamareira !== null ? aptosPorCamareira : '—';
}

function _zerarStatsEquipe() {
  document.getElementById('eq-total').textContent = '0';
  document.getElementById('eq-turno').textContent = '0';
  const elProd  = document.getElementById('eq-produtividade');
  const elAptos = document.getElementById('eq-aptos-camareira');
  if (elProd)  elProd.textContent  = '—';
  if (elAptos) elAptos.textContent = '—';
}

// ── FORMULÁRIO ────────────────────────────────────────────────

async function openMaidForm(id = null) {
  if (!requireWrite('equipe')) return;
  _editingMaidId = id;
  const isEdit = !!id;

  document.getElementById('modal-membro-title').textContent  = isEdit ? 'Editar Membro' : 'Adicionar Membro';
  document.getElementById('btn-salvar-membro').textContent   = isEdit ? 'Salvar alterações' : 'Adicionar membro';
  document.getElementById('btn-salvar-membro').disabled      = false;

  // Limpar campos
  ['nm-nome','nm-telefone','nm-email'].forEach(fId => {
    const el = document.getElementById(fId); if (el) el.value = '';
  });
  document.getElementById('nm-andar').value  = '';
  document.getElementById('nm-status').value = 'ativo';

  await _popularNmTurno();

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
      document.getElementById('nm-andar').value    = m.andar === 'Todos' ? '' : m.andar;
      document.getElementById('nm-status').value   = m.status;
      document.getElementById('nm-telefone').value = m.telefone || '';
      document.getElementById('nm-email').value    = m.email    || '';
      const turnoSel = document.getElementById('nm-turno');
      if (turnoSel && m.turno) turnoSel.value = m.turno;
    }
  }

  openModal('modal-novo-membro');
  document.getElementById('nm-nome').focus();
}

async function _popularNmTurno() {
  const sel = document.getElementById('nm-turno');
  if (!sel) return;
  const hotelId = currentUser.hotelId;
  let q = supabaseClient.from('turnos').select('nome').eq('ativo', true).order('ordem');
  if (hotelId) q = q.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);
  const { data } = await q;
  const turnos = data || [];
  sel.innerHTML = turnos.length
    ? turnos.map(t => `<option value="${t.nome}">${t.nome}</option>`).join('')
    : '<option value="">Nenhum turno configurado</option>';
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

// Membros da equipe são gerenciados via página Usuários (cadastro com login no sistema)
async function salvarNovoMembro() {
  closeModal('modal-novo-membro');
  toast('Para adicionar ou editar membros, use o menu Usuários.', 'warning');
  openPage('usuarios');
  toast(_editingMaidId ? `${nome} atualizado(a)!` : `${nome} adicionado(a) à equipe!`, 'success');
  _editingMaidId = null;

  await renderEquipe();
}

// ── ATIVAR / INATIVAR ─────────────────────────────────────────

async function toggleMaidStatus(id, statusAtual) {
  const maid = equipe.find(m => m.id === id);
  if (!maid) return;

  const ativar = statusAtual !== 'ativo';
  const acao   = ativar ? 'ativar' : 'inativar';
  if (!confirm(`Deseja ${acao} "${maid.nome}"?`)) return;

  const { error } = await supabaseClient
    .from('user_profiles').update({ ativo: ativar }).eq('user_id', maid.user_id);
  if (!error) maid.status = ativar ? 'ativo' : 'inativo';

  if (error) { toast('Erro: ' + error.message, 'error'); return; }

  toast(`${maid.nome} ${ativar ? 'ativado(a)' : 'inativado(a)'}!`, 'success');
  _renderEquipeTabela();
  _atualizarStatsEquipe();
}
