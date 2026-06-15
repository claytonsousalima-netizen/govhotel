// ================================================================
// USERS SERVICE — GovHotel
// Gerenciamento de usuários vinculados ao hotel
// Depende de: supabase-client.js, auth.js
// ================================================================

let _editingUserId   = null;   // user_profiles.id (UUID do perfil, não do auth.user)
let _userViewHotelId = null;
let _usuariosCache   = [];

// ── CARREGAR ──────────────────────────────────────────────────

async function renderUsuarios() {
  if (!canAccess('usuarios')) return;

  const selectorWrap = document.getElementById('usuarios-hotel-selector');
  if (currentUser.perfil === 'admin_global') {
    if (selectorWrap) selectorWrap.style.display = '';
    await _popularSeletorHotelUsuarios();
  } else {
    _userViewHotelId = currentUser.hotelId;
    if (typeof _renderHotelChip === 'function') _renderHotelChip('usuarios-hotel-selector');
    else if (selectorWrap) selectorWrap.style.display = 'none';
  }

  const tbody = document.getElementById('usuarios-table-body');
  if (tbody) tbody.innerHTML = `
    <tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3);">
      <div class="spinner" style="margin:0 auto 8px;border-top-color:var(--primary-light);"></div>
      Carregando usuários...
    </td></tr>`;

  await _fetchUsuarios();
  _renderUsuariosTabela();
  _atualizarStatsUsuarios();
}

async function _popularSeletorHotelUsuarios() {
  const sel = document.getElementById('usuarios-hotel-select');
  if (!sel) return;
  const { data } = await supabaseClient
    .from('hotels').select('id, nome').eq('ativo', true).order('nome');
  sel.innerHTML = '<option value="">Todos os hotéis</option>' +
    (data || []).map(h =>
      `<option value="${h.id}" ${h.id === _userViewHotelId ? 'selected' : ''}>${h.nome}</option>`
    ).join('');
}

async function _fetchUsuarios() {
  let query = supabaseClient
    .from('user_profiles')
    .select('*, hotels(nome), turnos(label, periodo, hora_inicio, hora_fim)')
    .order('nome');

  if (_userViewHotelId) query = query.eq('hotel_id', _userViewHotelId);

  // admin_hotel não visualiza admin_global; gestor não acessa esta tela (PERFIL_PAGES)
  if (currentUser.perfil !== 'admin_global') {
    query = query.neq('perfil', 'admin_global');
  }

  const { data, error } = await query;
  if (error) { console.error('Erro usuarios:', error.message); _usuariosCache = []; return; }
  _usuariosCache = data || [];
}

async function selecionarHotelUsuarios(hotelId) {
  _userViewHotelId = hotelId || null;
  await renderUsuarios();
}

// Remove acentos e caracteres inválidos para uso em e-mail virtual
function _normalizarLogin(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

// Extrai o username legível de um e-mail virtual (@govhotel.local)
function _loginDisplay(u) {
  if (u.login) return u.login;
  if (u.email) return u.email.replace(/@govhotel\.local$/, '');
  return '—';
}

// ── RENDER TABELA ─────────────────────────────────────────────

function _renderUsuariosTabela(filter = '') {
  const tbody = document.getElementById('usuarios-table-body');
  if (!tbody) return;

  let lista = _usuariosCache;
  if (filter) {
    const q = filter.toLowerCase();
    lista = lista.filter(u =>
      u.nome.toLowerCase().includes(q) ||
      _loginDisplay(u).toLowerCase().includes(q)
    );
  }

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text3);">
      Nenhum usuário encontrado.
    </td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map(u => {
    const iniciais  = u.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
    const hotelNome = u.hotels?.nome || '—';
    const isMe      = u.user_id === currentUser.id;
    return `<tr>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="user-avatar" style="width:30px;height:30px;font-size:11px;flex-shrink:0;">${iniciais}</div>
          <div>
            <div style="font-weight:600;">${u.nome}</div>
            ${isMe ? '<div style="font-size:10px;color:var(--accent);font-weight:600;">você</div>' : ''}
          </div>
        </div>
      </td>
      <td style="font-size:12px;color:var(--text2);font-family:monospace;">${_loginDisplay(u)}</td>
      <td><span class="badge badge-${u.perfil}">${PERFIL_LABELS[u.perfil] || u.perfil}</span></td>
      <td style="font-size:13px;">${hotelNome}</td>
      <td style="font-size:12px;">${u.perfil === 'camareira' && u.turnos
        ? `<span style="background:var(--surface2);padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">${u.turnos.label}<br><span style="font-weight:400;color:var(--text3);">${(u.turnos.hora_inicio||'').slice(0,5)}–${(u.turnos.hora_fim||'').slice(0,5)}</span></span>`
        : u.perfil === 'camareira' ? '<span style="color:var(--text3);font-size:11px;">Sem turno</span>' : '—'
      }</td>
      <td><span class="badge ${u.ativo ? 'badge-livre' : 'badge-bloqueado'}">${u.ativo ? 'Ativo' : 'Inativo'}</span></td>
      <td>
        ${_podeEditarUser(u)
          ? `<button class="btn btn-ghost btn-xs" onclick="openUserForm('${u.id}')" title="Editar">✏️</button>`
          : ''}
        ${(!isMe && _podeEditarUser(u)) ? `<button class="btn btn-ghost btn-xs"
          onclick="toggleUserAtivo('${u.id}', ${u.ativo})"
          title="${u.ativo ? 'Inativar' : 'Ativar'}">${u.ativo ? '⏸' : '▶'}</button>` : ''}
      </td>
    </tr>`;
  }).join('');
}

// Retorna true se o usuário logado pode editar o perfil informado
function _podeEditarUser(u) {
  if (currentUser.perfil === 'admin_global') return true;
  // admin_hotel não edita admin_global
  if (u.perfil === 'admin_global') return false;
  return true;
}

function searchUsuarios(q) { _renderUsuariosTabela(q); }

function _atualizarStatsUsuarios() {
  const total  = _usuariosCache.length;
  const ativos = _usuariosCache.filter(u => u.ativo).length;
  const perfis = [...new Set(_usuariosCache.map(u => u.perfil))].length;
  const elT = document.getElementById('us-stat-total');
  const elA = document.getElementById('us-stat-ativos');
  const elP = document.getElementById('us-stat-perfis');
  if (elT) elT.textContent = total;
  if (elA) elA.textContent = ativos;
  if (elP) elP.textContent = perfis;
}

// ── FORMULÁRIO ────────────────────────────────────────────────

async function openUserForm(profileId = null) {
  if (!canAccess('usuarios')) { toast('Sem permissão', 'error'); return; }
  _editingUserId = profileId;
  const isEdit = !!profileId;

  document.getElementById('modal-usuario-title').textContent  = isEdit ? 'Editar Usuário' : 'Novo Usuário';
  document.getElementById('btn-salvar-usuario').textContent   = isEdit ? 'Salvar alterações' : 'Criar usuário';
  document.getElementById('btn-salvar-usuario').disabled      = false;

  // Limpar campos
  document.getElementById('us-nome').value  = '';
  document.getElementById('us-email').value = '';
  document.getElementById('us-senha').value = '';
  document.getElementById('us-ativo').checked = true;

  // E-mail e senha: visíveis só na criação
  document.getElementById('us-email-wrap').style.display     = isEdit ? 'none' : '';
  document.getElementById('us-senha-wrap').style.display     = isEdit ? 'none' : '';
  document.getElementById('us-email-readonly').style.display = isEdit ? '' : 'none';

  await _popularHotelSelectUsuario();
  _popularPerfilSelectUsuario();
  const _perfilIni = document.getElementById('us-perfil')?.value || '';
  _atualizarPermissoesPerfil(_perfilIni);
  await _popularTurnoSelect(null);

  if (isEdit) {
    const u = _usuariosCache.find(x => x.id === profileId);
    if (u) {
      document.getElementById('us-nome').value             = u.nome;
      document.getElementById('us-email-text').textContent = _loginDisplay(u);
      document.getElementById('us-perfil').value           = u.perfil;
      document.getElementById('us-hotel-id').value         = u.hotel_id || '';
      document.getElementById('us-ativo').checked          = u.ativo !== false;
      _atualizarPermissoesPerfil(u.perfil);
      await _popularTurnoSelect(u.turno_id || null);
    }
  }

  openModal('modal-usuario-form');
  document.getElementById('us-nome').focus();
}

async function _popularHotelSelectUsuario() {
  const sel = document.getElementById('us-hotel-id');
  if (!sel) return;
  if (currentUser.perfil === 'admin_global') {
    const { data } = await supabaseClient
      .from('hotels').select('id, nome').eq('ativo', true).order('nome');
    // pré-seleciona o hotel filtrado atualmente na lista de usuários
    const presel = _userViewHotelId || '';
    sel.innerHTML = '<option value="">Sem hotel vinculado (admin_global)</option>' +
      (data || []).map(h =>
        `<option value="${h.id}" ${h.id === presel ? 'selected' : ''}>${h.nome}</option>`
      ).join('');
    sel.disabled = false;
  } else {
    sel.innerHTML = `<option value="${currentUser.hotelId}">${currentUser.hotelNome}</option>`;
    sel.disabled = true;
  }
}

function _popularPerfilSelectUsuario() {
  const sel = document.getElementById('us-perfil');
  if (!sel) return;
  const opcoes = currentUser.perfil === 'admin_global'
    ? [['admin_global','Administrador Global'],['admin_hotel','Admin do Hotel'],['gestor','Gestor'],['supervisora','Supervisora'],['camareira','Camareira'],['manutencao','Manutenção']]
    : [['admin_hotel','Admin do Hotel'],['gestor','Gestor'],['supervisora','Supervisora'],['camareira','Camareira'],['manutencao','Manutenção']];
  sel.innerHTML = opcoes.map(([val, label]) =>
    `<option value="${val}">${label}</option>`
  ).join('');
}

async function _popularTurnoSelect(selectedId) {
  const wrap = document.getElementById('us-turno-wrap');
  const sel  = document.getElementById('us-turno-id');
  if (!wrap || !sel) return;

  const { data } = await supabaseClient
    .from('turnos').select('id, periodo, numero, label, hora_inicio, hora_fim')
    .eq('ativo', true).order('periodo').order('numero');

  const periodos = { manha: '☀️ Manhã', tarde: '🌤 Tarde', noite: '🌙 Noite' };
  const grupos = {};
  (data || []).forEach(t => {
    if (!grupos[t.periodo]) grupos[t.periodo] = [];
    grupos[t.periodo].push(t);
  });

  sel.innerHTML = '<option value="">Não definido</option>' +
    Object.entries(periodos).map(([key, label]) => {
      if (!grupos[key]) return '';
      return `<optgroup label="${label}">` +
        grupos[key].map(t =>
          `<option value="${t.id}" ${t.id == selectedId ? 'selected' : ''}>` +
          `${t.label} (${t.hora_inicio.slice(0,5)}–${t.hora_fim.slice(0,5)})` +
          `</option>`
        ).join('') + '</optgroup>';
    }).join('');
}

function _toggleTurnoField(perfil) {
  const wrap = document.getElementById('us-turno-wrap');
  if (wrap) wrap.style.display = perfil === 'camareira' ? '' : 'none';
}

function _atualizarPermissoesPerfil(perfil) {
  _toggleTurnoField(perfil);
  const labels = {
    hoteis:'Hotéis', usuarios:'Usuários', dashboard:'Dashboard', mapa:'Mapa',
    kanban:'Kanban', chamados:'Chamados', equipe:'Equipe',
    'cadastro-apto':'Cadastro de Aptos', relatorios:'Relatórios',
    config:'Config', 'app-camareira':'App Camareira',
  };
  const pages = PERFIL_PAGES[perfil] || [];
  const el = document.getElementById('us-permissoes-lista');
  if (!el) return;
  el.innerHTML = pages.map(p =>
    `<span style="display:inline-flex;align-items:center;gap:4px;background:var(--surface2);
      border:1px solid var(--border);border-radius:20px;padding:3px 10px;
      font-size:11px;font-weight:600;color:var(--text2);margin:2px;">✓ ${labels[p] || p}</span>`
  ).join('');
}

// ── SALVAR ────────────────────────────────────────────────────

async function salvarUsuario() {
  if (!canAccess('usuarios')) { toast('Sem permissão', 'error'); return; }
  const nome     = document.getElementById('us-nome').value.trim();
  const login    = _normalizarLogin(document.getElementById('us-email').value.trim());
  const email    = login;
  const senha    = document.getElementById('us-senha')?.value || '';
  const perfil   = document.getElementById('us-perfil').value;
  const hotel_id = document.getElementById('us-hotel-id').value || null;
  const ativo    = document.getElementById('us-ativo').checked;
  const turno_id = perfil === 'camareira'
    ? (parseInt(document.getElementById('us-turno-id')?.value) || null)
    : null;

  if (!nome) { toast('Informe o nome completo', 'error'); return; }

  // Somente admin_global pode criar/editar perfis admin_global
  if (perfil === 'admin_global' && currentUser.perfil !== 'admin_global') {
    toast('Sem permissão para atribuir o perfil Administrador Global', 'error'); return;
  }

  const btn = document.getElementById('btn-salvar-usuario');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  let error;

  if (_editingUserId) {
    ({ error } = await supabaseClient
      .from('user_profiles')
      .update({ nome, perfil, hotel_id, ativo, turno_id })
      .eq('id', _editingUserId));
  } else {
    if (!login) {
      btn.disabled = false; btn.textContent = 'Criar usuário';
      toast('Informe o login / usuário', 'error'); return;
    }
    if (!senha || senha.length < 6) {
      btn.disabled = false; btn.textContent = 'Criar usuário';
      toast('A senha inicial deve ter pelo menos 6 caracteres', 'error'); return;
    }
    const result = await _invocarConvite({ nome, login, senha, perfil, hotel_id, ativo, turno_id });
    error = result.error;
    // Persiste o login no user_profiles após criação via Edge Function
    if (!error) {
      await supabaseClient.from('user_profiles')
        .update({ login })
        .eq('nome', nome)
        .eq('hotel_id', hotel_id)
        .is('login', null);
    }
  }

  btn.disabled = false;
  btn.textContent = _editingUserId ? 'Salvar alterações' : 'Criar usuário';

  if (error) { toast('Erro: ' + (error.message || error), 'error'); return; }

  closeModal('modal-usuario-form');
  toast(
    _editingUserId ? 'Usuário atualizado com sucesso!' : `Usuário ${email} criado com sucesso!`,
    'success'
  );
  _editingUserId = null;
  await renderUsuarios();
}

async function _invocarConvite(payload) {
  try {
    const { data, error } = await supabaseClient.functions.invoke('invite-user', { body: payload });
    if (error) {
      let msg = error.message || 'Erro na Edge Function';
      // Extrai mensagem real do corpo da resposta HTTP
      if (error.context) {
        try {
          const body = await error.context.clone().json();
          msg = body.error || body.message || msg;
        } catch {}
      }
      return { error: { message: msg } };
    }
    return { data };
  } catch (e) {
    return { error: { message: String(e) } };
  }
}

// ── ATIVAR / INATIVAR ─────────────────────────────────────────

async function toggleUserAtivo(profileId, atualAtivo) {
  const u = _usuariosCache.find(x => x.id === profileId);
  if (!u) return;
  if (!confirm(`Deseja ${atualAtivo ? 'inativar' : 'ativar'} o usuário "${u.nome}"?`)) return;

  const { error } = await supabaseClient
    .from('user_profiles').update({ ativo: !atualAtivo }).eq('id', profileId);

  if (error) { toast('Erro: ' + error.message, 'error'); return; }

  u.ativo = !atualAtivo;
  toast(`Usuário ${!atualAtivo ? 'ativado' : 'inativado'}!`, 'success');
  _renderUsuariosTabela();
  _atualizarStatsUsuarios();
}
