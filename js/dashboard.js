// ================================================================
// DASHBOARD SERVICE — GovHotel
// Stats reais do Supabase com seletor de hotel para admin_global.
// ================================================================

let _dashHotelId = null;

// ── RENDER PRINCIPAL ──────────────────────────────────────────
async function renderDashboard() {
  // Determina hotel
  if (currentUser.perfil === 'admin_global') {
    await _renderDashHotelSelector();
    if (!_dashHotelId) {
      _renderDashSemHotel();
      return;
    }
  } else {
    _dashHotelId = currentUser.hotelId;
    const selector = document.getElementById('dash-hotel-selector');
    if (selector) selector.style.display = 'none';
  }

  await _carregarDashboard(_dashHotelId);
}

async function _renderDashHotelSelector() {
  const wrap = document.getElementById('dash-hotel-selector');
  if (!wrap) return;
  if (wrap.querySelector('select')) {
    // já renderizado — só atualiza seleção
    const sel = document.getElementById('dash-hotel-select');
    if (sel && _dashHotelId) sel.value = _dashHotelId;
    return;
  }
  const { data: hotels } = await supabaseClient
    .from('hotels').select('id, nome').eq('ativo', true).order('nome');
  wrap.style.display = '';
  wrap.innerHTML = `
    <div class="card" style="padding:10px 16px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <span style="font-size:13px;font-weight:600;color:var(--text2);">🏨 Hotel:</span>
        <select id="dash-hotel-select"
          style="flex:1;min-width:200px;padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;"
          onchange="_selecionarHotelDash(this.value)">
          <option value="">Selecione um hotel...</option>
          ${(hotels||[]).map(h =>
            `<option value="${h.id}" ${h.id === _dashHotelId ? 'selected' : ''}>${h.nome}</option>`
          ).join('')}
        </select>
      </div>
    </div>`;
}

function _renderDashSemHotel() {
  document.getElementById('stats-grid').innerHTML = '';
  document.getElementById('dash-status-chart').innerHTML =
    '<p style="color:var(--text3);text-align:center;padding:24px;">Selecione um hotel para ver o dashboard.</p>';
  document.getElementById('dash-chamados-list').innerHTML = '';
  document.getElementById('dash-activity').innerHTML = '';
}

async function _selecionarHotelDash(hotelId) {
  _dashHotelId = hotelId || null;
  if (!hotelId) { _renderDashSemHotel(); return; }
  await _carregarDashboard(hotelId);
}

async function _carregarDashboard(hotelId) {
  // Carrega em paralelo
  const [aptosRes, chamadosRes, equipeRes] = await Promise.all([
    supabaseClient.from('apartments').select('id, status').eq('hotel_id', hotelId).eq('ativo', true),
    supabaseClient.from('work_orders').select('id, status, tipo, prioridade, departamento, created_at, apartments(numero)')
      .eq('hotel_id', hotelId).order('created_at', { ascending: false }).limit(50),
    supabaseClient.from('user_profiles').select('id').eq('hotel_id', hotelId)
      .in('perfil', ['camareira','manutencao']).eq('ativo', true),
  ]);

  const aptosArr   = aptosRes.data   || [];
  const chamArr    = chamadosRes.data || [];
  const equipeArr  = equipeRes.data   || [];

  const total      = aptosArr.length;
  const livre      = aptosArr.filter(a => a.status === 'livre').length;
  const sujo       = aptosArr.filter(a => a.status === 'sujo').length;
  const limpando   = aptosArr.filter(a => a.status === 'limpando').length;
  const abertos    = chamArr.filter(c => c.status === 'aberto').length;
  const andamento  = chamArr.filter(c => c.status === 'andamento').length;

  // Stats grid
  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card s-blue">
      <div class="stat-label">Total aptos</div>
      <div class="stat-value">${total}</div>
      <div class="stat-sub">unidades cadastradas</div>
    </div>
    <div class="stat-card s-green">
      <div class="stat-label">Livres</div>
      <div class="stat-value">${livre}</div>
      <div class="stat-sub">disponíveis agora</div>
    </div>
    <div class="stat-card s-orange">
      <div class="stat-label">A limpar</div>
      <div class="stat-value">${sujo}</div>
      <div class="stat-sub">aguardando limpeza</div>
    </div>
    <div class="stat-card s-blue">
      <div class="stat-label">Em limpeza</div>
      <div class="stat-value">${limpando}</div>
      <div class="stat-sub">em andamento</div>
    </div>
    <div class="stat-card s-red">
      <div class="stat-label">Chamados abertos</div>
      <div class="stat-value">${abertos}</div>
      <div class="stat-sub">${andamento} em andamento</div>
    </div>
    <div class="stat-card s-purple">
      <div class="stat-label">Equipe ativa</div>
      <div class="stat-value">${equipeArr.length}</div>
      <div class="stat-sub">camareiras + manutenção</div>
    </div>`;

  // Gráfico status
  const statuses = ['livre','sujo','limpando','conferencia','bloqueado','ocupado','manutencao'];
  const labels   = {livre:'Livre',sujo:'Sujo',limpando:'Limpando',conferencia:'Conferência',bloqueado:'Bloqueado',ocupado:'Ocupado',manutencao:'Manutenção'};
  const colors   = {livre:'#27ae60',sujo:'#e67e22',limpando:'#2e86c1',conferencia:'#8e44ad',bloqueado:'#c0392b',ocupado:'#7f8c8d',manutencao:'#f1c40f'};
  let chartHtml  = '';
  statuses.forEach(s => {
    const count = aptosArr.filter(a => a.status === s).length;
    if (!count) return;
    const pct = total ? Math.round((count / total) * 100) : 0;
    chartHtml += `
      <div style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px;">
          <span style="color:var(--text2);font-weight:600;">${labels[s]}</span>
          <span style="font-weight:700;">${count} <span style="color:var(--text3);font-weight:400;">(${pct}%)</span></span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${colors[s]};"></div></div>
      </div>`;
  });
  document.getElementById('dash-status-chart').innerHTML = chartHtml || '<p style="color:var(--text3);font-size:13px;">Nenhum apartamento cadastrado.</p>';

  // Chamados em aberto
  const chamAbertos = chamArr.filter(c => c.status === 'aberto' || c.status === 'andamento').slice(0, 5);
  const prioColor = { urgente:'var(--danger)', normal:'var(--warning)', baixa:'var(--success)' };
  document.getElementById('dash-chamados-list').innerHTML = chamAbertos.length
    ? chamAbertos.map(c => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f5f5f5;">
          <span class="badge badge-${c.prioridade==='urgente'?'ocupado':c.prioridade==='baixa'?'livre':'limpando'}">${c.prioridade}</span>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:600;">Apto ${c.apartments?.numero || '—'}</div>
            <div style="font-size:11px;color:var(--text2);">${c.tipo}${c.departamento==='manutencao'?' 🔧':' 🧹'}</div>
          </div>
          <span class="badge" style="background:var(--surface2);">${c.status}</span>
        </div>`).join('')
    : '<p style="font-size:13px;color:var(--text3);padding:12px 0;">Nenhum chamado aberto 🎉</p>';

  // Atividade recente (últimos chamados criados)
  document.getElementById('dash-activity').innerHTML = chamArr.slice(0, 5).map(c => {
    const hora = new Date(c.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    const icon = c.status === 'concluido' ? '✅' : c.departamento === 'manutencao' ? '🔧' : '🔔';
    return `
      <div style="display:flex;gap:12px;padding:8px 0;border-bottom:1px solid #f8f8f8;align-items:flex-start;">
        <span style="font-size:16px;">${icon}</span>
        <div style="flex:1;">
          <div style="font-size:13px;">${c.tipo} — Apto ${c.apartments?.numero || '—'}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px;">${hora} · ${c.status}</div>
        </div>
      </div>`;
  }).join('') || '<p style="font-size:13px;color:var(--text3);">Nenhuma atividade recente.</p>';
}

function refreshDash() { renderDashboard(); toast('Dashboard atualizado'); }

// Patch openPage para dashboard
(function patchOpenPageDash() {
  if (window._dashPatch) return;
  window._dashPatch = true;
  const _realOpen = openPage;
  openPage = function(id) {
    _realOpen(id);
    if (id === 'dashboard') renderDashboard();
  };
})();
