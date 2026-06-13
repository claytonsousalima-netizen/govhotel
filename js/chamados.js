// ================================================================
// CHAMADOS SERVICE — GovHotel
// Substitui os dados mock do inline script por Supabase real.
// Depende de: supabase-client.js, auth.js, apartments.js (aptos cache)
// ================================================================

let _chamadosCache  = [];
let _chamadoHotelId = null; // hotel filtrado (admin_global pode mudar)
let _tiposChamado   = [];   // cache de chamado_tipos

// ── CARREGAR TIPOS DO CHAMADO ──────────────────────────────────
async function _loadTiposChamado() {
  const { data } = await supabaseClient
    .from('chamado_tipos')
    .select('id, nome')
    .eq('ativo', true)
    .order('ordem');
  _tiposChamado = data || [];
}

// ── POPULAR SELECT DE TIPOS ────────────────────────────────────
function _populateTipoSelect(selId) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  sel.innerHTML = _tiposChamado.map(t =>
    `<option value="${t.id}">${t.nome}</option>`
  ).join('');
}

// ── FILTRO DE HOTEL (admin_global) ────────────────────────────
async function _popularFiltroHotelChamados() {
  if (currentUser.perfil !== 'admin_global') return;

  // Adiciona seletor de hotel na página de chamados se não existir
  ['chamados-hotel-filter', 'kanban-hotel-filter'].forEach(async (filterId) => {
    const wrap = document.getElementById(filterId);
    if (!wrap) return;
    const { data: hotels } = await supabaseClient
      .from('hotels').select('id, nome').eq('ativo', true).order('nome');
    wrap.innerHTML = `
      <div class="card" style="padding:10px 16px;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <span style="font-size:13px;font-weight:600;color:var(--text2);">🏨 Hotel:</span>
          <select style="flex:1;min-width:180px;padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;"
            onchange="_filtrarChamadosPorHotel(this.value)">
            <option value="">Todos os hotéis</option>
            ${(hotels||[]).map(h=>`<option value="${h.id}">${h.nome}</option>`).join('')}
          </select>
        </div>
      </div>`;
  });
}

async function _filtrarChamadosPorHotel(hotelId) {
  _chamadoHotelId = hotelId || null;
  await _fetchChamados();
  renderChamados();
  renderKanban();
}

// ── BUSCAR CHAMADOS DO BANCO ───────────────────────────────────
async function _fetchChamados() {
  let query = supabaseClient
    .from('work_orders')
    .select(`
      id, tipo, prioridade, status, solicitante, hospede, descricao, prazo, created_at,
      hotel_id, hotels(nome),
      apartment_id, apartments(numero),
      maid_id, maids(nome)
    `)
    .order('created_at', { ascending: false });

  if (_chamadoHotelId) {
    query = query.eq('hotel_id', _chamadoHotelId);
  }

  const { data, error } = await query;
  if (error) { console.error('Chamados:', error.message); return; }

  // Normaliza para o formato esperado pelo renderChamados
  _chamadosCache = (data || []).map(c => ({
    id:           c.id,
    dbId:         c.id,
    apto:         c.apartments?.numero || '—',
    tipo:         c.tipo,
    prioridade:   c.prioridade,
    status:       c.status,
    solicitante:  c.solicitante || '',
    hospede:      c.hospede || '',
    desc:         c.descricao || '',
    prazo:        c.prazo ? new Date(c.prazo).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '',
    criado:       new Date(c.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),
    camareira_id: c.maid_id,
    camareira:    c.maids?.nome || null,
    hotel_id:     c.hotel_id,
    hotelNome:    c.hotels?.nome || null,
    apartment_id: c.apartment_id,
  }));

  // Sincroniza o array global `chamados` usado pelo inline script
  chamados = _chamadosCache;
}

// ── CARREGAR CAMAREIRAS NO MODAL ──────────────────────────────
async function _popularCamareirasModalChamado(hotelId) {
  const sel = document.getElementById('nc-camareira');
  if (!sel) return;
  const hId = hotelId || currentUser.hotelId;
  let query = supabaseClient.from('maids').select('id, nome').eq('status', 'ativo').order('nome');
  if (hId) query = query.eq('hotel_id', hId);
  const { data } = await query;
  sel.innerHTML = '<option value="">Não atribuído</option>' +
    (data||[]).map(m=>`<option value="${m.id}">${m.nome}</option>`).join('');
}

// ── POPULAR APTOS NO MODAL ────────────────────────────────────
async function _popularAptosModalChamado(hotelId) {
  const sel = document.getElementById('nc-apto');
  if (!sel) return;
  const hId = hotelId || currentUser.hotelId;
  let query = supabaseClient.from('apartments').select('id, numero, tipo').eq('ativo', true).order('numero');
  if (hId) query = query.eq('hotel_id', hId);
  const { data } = await query;
  sel.innerHTML = '<option value="">Selecionar...</option>' +
    (data||[]).map(a=>`<option value="${a.id}">${a.numero} — ${a.tipo}</option>`).join('');
}

// ── ABRIR MODAL CHAMADO ───────────────────────────────────────
const _origOpenModalNovoChamado = window.openModalNovoChamado;

async function openModalNovoChamado() {
  // Hotel para admin: selector; para outros: label fixo
  const hotelWrap = document.getElementById('nc-hotel-wrap');
  if (hotelWrap) {
    if (currentUser.perfil === 'admin_global') {
      hotelWrap.style.display = '';
      const { data: hotels } = await supabaseClient
        .from('hotels').select('id, nome').eq('ativo', true).order('nome');
      const sel = document.getElementById('nc-hotel-id');
      if (sel) {
        sel.innerHTML = '<option value="">Selecione o hotel *</option>' +
          (hotels||[]).map(h=>`<option value="${h.id}">${h.nome}</option>`).join('');
        sel.onchange = async () => {
          await _popularAptosModalChamado(sel.value);
          await _popularCamareirasModalChamado(sel.value);
        };
      }
      await _popularAptosModalChamado(null);
      await _popularCamareirasModalChamado(null);
    } else {
      hotelWrap.style.display = 'none';
      document.getElementById('nc-hotel-label').textContent = currentUser.hotelNome || '';
      await _popularAptosModalChamado(currentUser.hotelId);
      await _popularCamareirasModalChamado(currentUser.hotelId);
    }
  }
  _populateTipoSelect('nc-tipo');
  openModal('modal-novo-chamado');
}

// ── SALVAR CHAMADO ────────────────────────────────────────────
async function salvarNovoChamado() {
  const isAdmin  = currentUser.perfil === 'admin_global';
  const hotel_id = isAdmin
    ? document.getElementById('nc-hotel-id')?.value
    : currentUser.hotelId;

  if (!hotel_id) { toast('Selecione o hotel', 'error'); return; }

  const apartment_id  = document.getElementById('nc-apto')?.value || null;
  const tipoVal       = document.getElementById('nc-tipo')?.value || '';
  const tipoNome      = _tiposChamado.find(t => t.id === tipoVal)?.nome || tipoVal;
  const prioridade    = document.getElementById('nc-prioridade')?.value || 'normal';
  const solicitante   = document.getElementById('nc-solicitante')?.value || '';
  const maid_id       = document.getElementById('nc-camareira')?.value || null;
  const prazo         = document.getElementById('nc-prazo')?.value || null;
  const descricao     = document.getElementById('nc-desc')?.value || '';
  const hospede       = document.getElementById('nc-hospede')?.value || '';

  const { error } = await supabaseClient.from('work_orders').insert([{
    hotel_id,
    apartment_id: apartment_id || null,
    maid_id: maid_id || null,
    tipo:        tipoNome,
    prioridade,
    status:      'aberto',
    solicitante,
    hospede,
    descricao,
    prazo:       prazo || null,
    criado_por:  currentUser.id,
  }]);

  if (error) { toast('Erro: ' + error.message, 'error'); return; }

  closeModal('modal-novo-chamado');
  toast('Chamado aberto!', 'success');
  await _fetchChamados();
  renderChamados();
  renderKanban();
}

// ── ATUALIZAR STATUS DO CHAMADO ───────────────────────────────
async function atualizarStatusChamado(id, novoStatus) {
  const c = _chamadosCache.find(x => x.id === id);
  if (!c) return;
  const { error } = await supabaseClient
    .from('work_orders').update({ status: novoStatus }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }
  c.status = novoStatus;
  chamados  = _chamadosCache;
  renderChamados();
  renderKanban();
}

// ── RENDER CHAMADOS ───────────────────────────────────────────
function renderChamados() {
  const showHotel = currentUser.perfil === 'admin_global';
  ['todos','abertos','andamento','concluidos'].forEach(tab => {
    let lista = _chamadosCache;
    if (tab === 'abertos')    lista = lista.filter(c => c.status === 'aberto');
    if (tab === 'andamento')  lista = lista.filter(c => c.status === 'andamento');
    if (tab === 'concluidos') lista = lista.filter(c => c.status === 'concluido');

    const el = document.getElementById('chamados-list-' + tab);
    if (!el) return;

    if (!lista.length) {
      el.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text3);">Nenhum chamado encontrado.</div>`;
      return;
    }

    const prioColor = { urgente:'var(--danger)', normal:'var(--warning)', baixa:'var(--success)' };
    el.innerHTML = lista.map(c => `
      <div class="card" style="margin-bottom:10px;border-left:4px solid ${prioColor[c.prioridade]||'var(--border)'};">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
          <div>
            ${showHotel && c.hotelNome ? `<div style="font-size:10px;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">🏨 ${c.hotelNome}</div>` : ''}
            <div style="font-weight:700;font-size:14px;">${c.tipo}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:2px;">
              Apto ${c.apto}${c.hospede ? ` · ${c.hospede}` : ''}${c.camareira ? ` · 🧹 ${c.camareira}` : ''}
            </div>
            ${c.desc ? `<div style="font-size:12px;color:var(--text3);margin-top:4px;">${c.desc}</div>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">
            <span class="badge badge-${c.prioridade === 'urgente' ? 'ocupado' : c.prioridade === 'baixa' ? 'livre' : 'limpando'}">${c.prioridade}</span>
            <span class="badge" style="background:var(--surface2);">${c.status}</span>
            ${c.status !== 'concluido' && c.status !== 'cancelado'
              ? `<button class="btn btn-ghost btn-xs" onclick="_menuStatusChamado('${c.id}',event)">✏️ Status</button>`
              : ''}
          </div>
        </div>
      </div>`).join('');
  });
}

function _menuStatusChamado(id, e) {
  e.stopPropagation();
  const c = _chamadosCache.find(x => x.id === id);
  if (!c) return;
  const next = c.status === 'aberto' ? 'andamento' : c.status === 'andamento' ? 'concluido' : 'cancelado';
  const label = { andamento:'Em andamento', concluido:'Concluído', cancelado:'Cancelado' };
  if (confirm(`Mudar para "${label[next]}"?`)) atualizarStatusChamado(id, next);
}

// ── RENDER KANBAN ─────────────────────────────────────────────
function renderKanban() {
  const showHotel = currentUser.perfil === 'admin_global';
  const cols = [
    { key:'aberto',    label:'Aberto',       color:'var(--danger)' },
    { key:'andamento', label:'Em andamento',  color:'var(--warning)' },
    { key:'concluido', label:'Concluído',     color:'var(--success)' },
  ];
  const board = document.getElementById('kanban-board');
  if (!board) return;

  board.innerHTML = cols.map(col => {
    const items = _chamadosCache.filter(c => c.status === col.key);
    return `<div class="kanban-col">
      <div class="kanban-col-header" style="border-top:3px solid ${col.color};">
        <span>${col.label}</span>
        <span class="badge" style="background:${col.color};color:#fff;">${items.length}</span>
      </div>
      ${items.map(c => `
        <div class="kanban-card" style="border-left:3px solid ${col.color};">
          ${showHotel && c.hotelNome ? `<div style="font-size:10px;font-weight:700;color:var(--primary);margin-bottom:2px;">🏨 ${c.hotelNome}</div>` : ''}
          <div style="font-weight:600;font-size:13px;">${c.tipo}</div>
          <div style="font-size:11px;color:var(--text2);margin-top:2px;">Apto ${c.apto}</div>
          ${c.camareira ? `<div style="font-size:11px;color:var(--text3);">🧹 ${c.camareira}</div>` : ''}
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
            <span class="badge badge-${c.prioridade==='urgente'?'ocupado':c.prioridade==='baixa'?'livre':'limpando'}">${c.prioridade}</span>
            ${col.key !== 'concluido'
              ? `<button class="btn btn-ghost btn-xs kanban-novo-chamado" onclick="atualizarStatusChamado('${c.id}','${col.key==='aberto'?'andamento':'concluido'}')">→</button>`
              : ''}
          </div>
        </div>`).join('') || `<div style="font-size:12px;color:var(--text3);padding:12px;text-align:center;">Vazio</div>`}
    </div>`;
  }).join('');

  // Aplica visibilidade do botão novo chamado baseado na permissão
  if (typeof applyProfileRestrictions === 'function') applyProfileRestrictions();
}

// ── INICIALIZAR CHAMADOS ─────────────────────────────────────
async function _initChamados() {
  await _loadTiposChamado();
  await _popularFiltroHotelChamados();
  await _fetchChamados();
}

// Intercepta openPage para carregar chamados do banco
(function patchOpenPageChamados() {
  const _orig = window.openPage || function(){};
  const alreadyPatched = '_chamadosPatch' in window;
  if (alreadyPatched) return;
  window._chamadosPatch = true;

  const _realOpen = openPage;
  openPage = function(id) {
    _realOpen(id);
    if (id === 'chamados' || id === 'kanban') {
      _fetchChamados().then(() => {
        if (id === 'chamados') renderChamados();
        if (id === 'kanban')   renderKanban();
      });
    }
  };
})();

// Aguarda o app inicializar e então carrega dados de chamados
document.addEventListener('govhotel:ready', () => _initChamados());
