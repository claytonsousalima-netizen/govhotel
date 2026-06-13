// ================================================================
// HOTELS SERVICE — GovHotel
// Gerenciamento de hotéis para perfil admin_global
// Depende de: supabase-client.js
// ================================================================

let _hoteis = [];          // cache local dos hotéis
let _editingHotelId = null; // null = novo hotel | UUID = editando

// ── CARREGAR E RENDERIZAR ─────────────────────────────────────

async function renderHoteis() {
  if (!currentUser || currentUser.perfil !== 'admin_global') return;

  const grid = document.getElementById('hoteis-grid');
  if (!grid) return;

  grid.innerHTML = '<div class="hoteis-loading">Carregando hotéis...</div>';

  // busca hotéis com contagem de aptos vinculados
  const { data, error } = await supabaseClient
    .from('hotels')
    .select(`
      *,
      apartments ( count )
    `)
    .order('nome');

  if (error) {
    grid.innerHTML = `<div class="card" style="color:var(--danger);">
      Erro ao carregar hotéis: ${error.message}
    </div>`;
    return;
  }

  _hoteis = data || [];
  _atualizarStats();
  _renderGrid(_hoteis);
}

function _atualizarStats() {
  const total    = _hoteis.length;
  const ativos   = _hoteis.filter(h => h.ativo).length;
  const inativos = total - ativos;

  document.getElementById('h-stat-total').textContent    = total;
  document.getElementById('h-stat-ativos').textContent   = ativos;
  document.getElementById('h-stat-inativos').textContent = inativos;
}

function _renderGrid(lista) {
  const grid = document.getElementById('hoteis-grid');
  if (!grid) return;

  if (!lista.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:56px 20px;color:var(--text3);">
        <div style="font-size:48px;margin-bottom:12px;">🏨</div>
        <div style="font-size:15px;font-weight:600;color:var(--text2);margin-bottom:4px;">Nenhum hotel encontrado</div>
        <div style="font-size:13px;margin-bottom:16px;">Cadastre o primeiro hotel para começar.</div>
        <button class="btn btn-primary btn-sm" onclick="openHotelForm()">+ Cadastrar hotel</button>
      </div>`;
    return;
  }

  grid.innerHTML = lista.map(h => {
    const aptCount = h.apartments?.[0]?.count ?? 0;
    const localizacao = [h.cidade, h.estado].filter(Boolean).join(' — ') || '—';

    return `
    <div class="hotel-card ${h.ativo ? '' : 'hotel-inativo'}">
      <div class="hotel-card-top">
        <div class="hotel-card-icon">${h.ativo ? '🏨' : '🔒'}</div>
        <div style="flex:1;min-width:0;">
          <div class="hotel-card-nome">${h.nome}</div>
          <div class="hotel-card-local">📍 ${localizacao}</div>
        </div>
        <span class="badge ${h.ativo ? 'badge-livre' : 'badge-bloqueado'}">${h.ativo ? 'Ativo' : 'Inativo'}</span>
      </div>

      <div class="hotel-card-dados">
        ${h.cnpj      ? `<div class="hdado"><span>CNPJ</span><strong>${h.cnpj}</strong></div>` : ''}
        ${h.telefone  ? `<div class="hdado"><span>Telefone</span><strong>${h.telefone}</strong></div>` : ''}
        ${h.email     ? `<div class="hdado"><span>E-mail</span><strong>${h.email}</strong></div>` : ''}
        <div class="hdado"><span>Andares</span><strong>${h.total_andares || 1}</strong></div>
        <div class="hdado"><span>Aptos cadastrados</span><strong>${aptCount}</strong></div>
        <div class="hdado"><span>Criado em</span><strong>${new Date(h.created_at).toLocaleDateString('pt-BR')}</strong></div>
      </div>

      <div class="hotel-card-actions">
        <button class="btn btn-outline btn-sm" onclick="openHotelForm('${h.id}')">✏️ Editar</button>
        <button class="btn btn-sm ${h.ativo ? 'btn-warning' : 'btn-success'}"
                onclick="toggleHotelAtivo('${h.id}', ${h.ativo})">
          ${h.ativo ? '⏸ Inativar' : '▶ Ativar'}
        </button>
      </div>
    </div>`;
  }).join('');
}

// ── FORMULÁRIO DE HOTEL ───────────────────────────────────────

async function openHotelForm(id = null) {
  if (!requireWrite('hotels')) return;
  _editingHotelId = id;
  const isEdit = !!id;

  document.getElementById('modal-hotel-title').textContent   = isEdit ? 'Editar Hotel' : 'Cadastrar Hotel';
  document.getElementById('btn-salvar-hotel').textContent    = isEdit ? 'Salvar alterações' : 'Cadastrar hotel';
  document.getElementById('btn-salvar-hotel').disabled       = false;

  // limpar campos
  ['h-nome','h-cnpj','h-endereco','h-cidade','h-telefone','h-email'].forEach(fId => {
    const el = document.getElementById(fId);
    if (el) el.value = '';
  });
  document.getElementById('h-estado').value  = '';
  document.getElementById('h-andares').value = '1';
  document.getElementById('h-ativo').checked = true;

  if (isEdit) {
    const cached = _hoteis.find(h => h.id === id);
    if (cached) {
      _preencherForm(cached);
    } else {
      // busca individual se não estiver em cache
      const { data } = await supabaseClient.from('hotels').select('*').eq('id', id).single();
      if (data) _preencherForm(data);
    }
  }

  openModal('modal-hotel-form');
  document.getElementById('h-nome').focus();
}

function _preencherForm(h) {
  document.getElementById('h-nome').value     = h.nome          || '';
  document.getElementById('h-cnpj').value     = h.cnpj          || '';
  document.getElementById('h-endereco').value = h.endereco      || '';
  document.getElementById('h-cidade').value   = h.cidade        || '';
  document.getElementById('h-estado').value   = h.estado        || '';
  document.getElementById('h-andares').value  = h.total_andares || 1;
  document.getElementById('h-telefone').value = h.telefone      || '';
  document.getElementById('h-email').value    = h.email         || '';
  document.getElementById('h-ativo').checked  = h.ativo !== false;
}

async function salvarHotel() {
  if (!requireWrite('hotels')) return;
  const nome     = document.getElementById('h-nome').value.trim();
  const cnpj     = document.getElementById('h-cnpj').value.trim()     || null;
  const endereco = document.getElementById('h-endereco').value.trim() || null;
  const cidade   = document.getElementById('h-cidade').value.trim()   || null;
  const estado   = document.getElementById('h-estado').value          || null;
  const andares  = parseInt(document.getElementById('h-andares').value) || 1;
  const telefone = document.getElementById('h-telefone').value.trim() || null;
  const email    = document.getElementById('h-email').value.trim()    || null;
  const ativo    = document.getElementById('h-ativo').checked;

  if (!nome) { toast('Nome do hotel é obrigatório', 'error'); return; }
  if (andares < 1 || andares > 50) { toast('Número de andares inválido', 'error'); return; }

  const btn = document.getElementById('btn-salvar-hotel');
  btn.disabled    = true;
  btn.textContent = 'Salvando...';

  const payload = { nome, cnpj, endereco, cidade, estado, total_andares: andares, telefone, email, ativo };

  let error;
  if (_editingHotelId) {
    ({ error } = await supabaseClient.from('hotels').update(payload).eq('id', _editingHotelId));
  } else {
    ({ error } = await supabaseClient.from('hotels').insert([payload]));
  }

  btn.disabled    = false;
  btn.textContent = _editingHotelId ? 'Salvar alterações' : 'Cadastrar hotel';

  if (error) {
    toast('Erro ao salvar: ' + error.message, 'error');
    return;
  }

  closeModal('modal-hotel-form');
  toast(_editingHotelId ? 'Hotel atualizado com sucesso!' : 'Hotel cadastrado com sucesso!', 'success');
  _editingHotelId = null;
  await renderHoteis();
}

// ── ATIVAR / INATIVAR ─────────────────────────────────────────

async function toggleHotelAtivo(id, atualAtivo) {
  const hotel = _hoteis.find(h => h.id === id);
  const acao  = atualAtivo ? 'inativar' : 'ativar';

  if (!confirm(`Deseja ${acao} o hotel "${hotel?.nome || id}"?`)) return;

  const { error } = await supabaseClient
    .from('hotels')
    .update({ ativo: !atualAtivo })
    .eq('id', id);

  if (error) { toast('Erro: ' + error.message, 'error'); return; }

  toast(`Hotel ${atualAtivo ? 'inativado' : 'ativado'}!`, 'success');
  await renderHoteis();
}

// ── FILTROS ──────────────────────────────────────────────────

function filtrarHoteis(q) {
  const term     = (q || '').toLowerCase();
  const filtered = _hoteis.filter(h =>
    h.nome.toLowerCase().includes(term) ||
    (h.cidade  && h.cidade.toLowerCase().includes(term))  ||
    (h.cnpj    && h.cnpj.includes(term)) ||
    (h.estado  && h.estado.toLowerCase().includes(term))
  );
  _renderGrid(filtered);
}

function filtrarHoteisPorStatus(status, btn) {
  document.querySelectorAll('#hoteis-filter-btns .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  let filtered = _hoteis;
  if (status === 'ativo')   filtered = _hoteis.filter(h =>  h.ativo);
  if (status === 'inativo') filtered = _hoteis.filter(h => !h.ativo);
  _renderGrid(filtered);
}
