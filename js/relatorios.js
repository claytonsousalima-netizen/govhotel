// ================================================================
// RELATÓRIOS SERVICE — GovHotel
// Analytics reais do Supabase com seletor de hotel para admin_global.
// ================================================================

let _relHotelId = null;

async function renderRelatorios() {
  if (currentUser.perfil === 'admin_global') {
    await _renderRelHotelSelector();
    if (!_relHotelId) { _renderRelSemHotel(); return; }
  } else {
    _relHotelId = currentUser.hotelId;
    const sel = document.getElementById('rel-hotel-selector');
    if (sel) sel.style.display = 'none';
  }
  await _carregarRelatorios(_relHotelId);
}

async function _renderRelHotelSelector() {
  const wrap = document.getElementById('rel-hotel-selector');
  if (!wrap) return;
  if (wrap.querySelector('select')) {
    const sel = document.getElementById('rel-hotel-select');
    if (sel && _relHotelId) sel.value = _relHotelId;
    return;
  }
  const { data: hotels } = await supabaseClient
    .from('hotels').select('id, nome').eq('ativo', true).order('nome');
  wrap.style.display = '';
  wrap.innerHTML = `
    <div class="card" style="padding:10px 16px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <span style="font-size:13px;font-weight:600;color:var(--text2);">🏨 Hotel:</span>
        <select id="rel-hotel-select"
          style="flex:1;min-width:200px;padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;"
          onchange="_selecionarHotelRel(this.value)">
          <option value="">Selecione um hotel...</option>
          ${(hotels||[]).map(h =>
            `<option value="${h.id}" ${h.id === _relHotelId ? 'selected' : ''}>${h.nome}</option>`
          ).join('')}
        </select>
      </div>
    </div>`;
}

function _renderRelSemHotel() {
  document.querySelector('#page-relatorios .stats-grid').innerHTML =
    `<div class="stat-card s-blue" style="grid-column:1/-1;text-align:center;">
       <div class="stat-label">Selecione um hotel para ver os relatórios</div>
     </div>`;
  document.getElementById('rel-status-dist').innerHTML  = '';
  document.getElementById('rel-ranking').innerHTML      = '';
  document.getElementById('rel-chamados-tipo').innerHTML = '';
  const cw = document.getElementById('chart-week');
  if (cw) cw.innerHTML = '';
}

async function _selecionarHotelRel(hotelId) {
  _relHotelId = hotelId || null;
  if (!hotelId) { _renderRelSemHotel(); return; }
  await _carregarRelatorios(hotelId);
}

async function _carregarRelatorios(hotelId) {
  const [aptosRes, chamadosRes, equipeRes] = await Promise.all([
    supabaseClient.from('apartments').select('id, status').eq('hotel_id', hotelId).eq('ativo', true),
    supabaseClient.from('work_orders')
      .select('id, tipo, status, departamento, responsavel_user_id, created_at')
      .eq('hotel_id', hotelId),
    supabaseClient.from('user_profiles')
      .select('user_id, nome, perfil')
      .eq('hotel_id', hotelId)
      .eq('perfil', 'camareira')
      .eq('ativo', true),
  ]);

  const aptosArr  = aptosRes.data   || [];
  const chamArr   = chamadosRes.data || [];
  const camArr    = equipeRes.data   || [];

  const total      = aptosArr.length;
  const concluidos = chamArr.filter(c => c.status === 'concluido').length;
  const abertos    = chamArr.filter(c => c.status === 'aberto').length;
  const manutCham  = chamArr.filter(c => c.departamento === 'manutencao').length;

  // Stats gerais
  document.querySelector('#page-relatorios .stats-grid').innerHTML = `
    <div class="stat-card s-blue">
      <div class="stat-label">Total de apartamentos</div>
      <div class="stat-value">${total}</div>
      <div class="stat-sub">unidades ativas</div>
    </div>
    <div class="stat-card s-green">
      <div class="stat-label">Chamados resolvidos</div>
      <div class="stat-value">${concluidos}</div>
      <div class="stat-sub">${abertos} em aberto</div>
    </div>
    <div class="stat-card s-orange">
      <div class="stat-label">Chamados manutenção</div>
      <div class="stat-value">${manutCham}</div>
      <div class="stat-sub">de ${chamArr.length} total</div>
    </div>
    <div class="stat-card s-purple">
      <div class="stat-label">Camareiras ativas</div>
      <div class="stat-value">${camArr.length}</div>
      <div class="stat-sub">equipe de limpeza</div>
    </div>`;

  // Gráfico de barras semanal (chamados por dia nos últimos 7 dias)
  const hoje = new Date();
  const dias = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const semana = Array.from({length: 7}, (_, i) => {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() - (6 - i));
    return { label: dias[d.getDay()], date: d.toISOString().slice(0, 10), count: 0 };
  });
  chamArr.forEach(c => {
    const dia = c.created_at?.slice(0, 10);
    const slot = semana.find(s => s.date === dia);
    if (slot) slot.count++;
  });
  const maxVal = Math.max(...semana.map(s => s.count), 1);
  const chartEl = document.getElementById('chart-week');
  const labelsEl = document.getElementById('chart-week-labels');
  if (chartEl) chartEl.innerHTML = semana.map(s => {
    const h = Math.round((s.count / maxVal) * 72);
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;">
      <div style="font-size:10px;color:var(--text2);">${s.count || ''}</div>
      <div class="mini-bar" style="height:${Math.max(h,2)}px;width:100%;"></div>
    </div>`;
  }).join('');
  if (labelsEl) labelsEl.innerHTML = semana.map(s =>
    `<div class="mini-bar-label" style="flex:1;text-align:center;">${s.label}</div>`
  ).join('');

  // Distribuição de status dos aptos
  const statusInfo = [
    { key:'livre',       label:'Livre',       color:'#27ae60' },
    { key:'sujo',        label:'Sujo',        color:'#e67e22' },
    { key:'limpando',    label:'Limpando',    color:'#2e86c1' },
    { key:'conferencia', label:'Conferência', color:'#8e44ad' },
    { key:'bloqueado',   label:'Bloqueado',   color:'#c0392b' },
    { key:'manutencao',  label:'Manutenção',  color:'#f1c40f' },
    { key:'ocupado',     label:'Ocupado',     color:'#7f8c8d' },
  ];
  const distEl = document.getElementById('rel-status-dist');
  if (distEl) {
    distEl.innerHTML = statusInfo.map(s => {
      const count = aptosArr.filter(a => a.status === s.key).length;
      if (!count) return '';
      const pct = total ? Math.round((count / total) * 100) : 0;
      return `
        <div style="margin-bottom:7px;">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px;">
            <span style="color:var(--text2);">${s.label}</span>
            <span style="font-weight:700;">${count} <span style="color:var(--text3);">(${pct}%)</span></span>
          </div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${s.color};"></div></div>
        </div>`;
    }).join('') || '<p style="font-size:12px;color:var(--text3);">Nenhum apartamento cadastrado.</p>';
  }

  // Ranking de camareiras por chamados concluídos
  const rankEl = document.getElementById('rel-ranking');
  if (rankEl) {
    if (!camArr.length) {
      rankEl.innerHTML = '<p style="font-size:12px;color:var(--text3);">Nenhuma camareira cadastrada.</p>';
    } else {
      const ranking = camArr.map(cam => ({
        nome: cam.nome,
        count: chamArr.filter(c => c.responsavel_user_id === cam.user_id && c.status === 'concluido').length,
      })).sort((a, b) => b.count - a.count);
      rankEl.innerHTML = ranking.map((r, i) => `
        <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #f5f5f5;">
          <div style="width:22px;height:22px;border-radius:50%;background:${i<3?'var(--warning)':'var(--border)'};
            display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;
            color:${i<3?'white':'var(--text2)'};">${i+1}</div>
          <div style="flex:1;font-size:13px;">${r.nome}</div>
          <div style="font-size:13px;font-weight:700;">${r.count} concluídos</div>
        </div>`).join('');
    }
  }

  // Chamados por tipo
  const tipoEl = document.getElementById('rel-chamados-tipo');
  if (tipoEl) {
    const tipoCount = {};
    chamArr.forEach(c => { tipoCount[c.tipo] = (tipoCount[c.tipo] || 0) + 1; });
    const tipoOrdem = Object.entries(tipoCount).sort((a, b) => b[1] - a[1]).slice(0, 8);
    tipoEl.innerHTML = tipoOrdem.length
      ? tipoOrdem.map(([tipo, count]) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f5f5f5;">
            <span style="font-size:13px;">${tipo}</span>
            <span class="badge badge-andamento">${count}</span>
          </div>`).join('')
      : '<p style="font-size:12px;color:var(--text3);">Nenhum chamado registrado.</p>';
  }
}

// Patch openPage para relatórios
(function patchOpenPageRel() {
  if (window._relPatch) return;
  window._relPatch = true;
  const _realOpen = openPage;
  openPage = function(id) {
    _realOpen(id);
    if (id === 'relatorios') renderRelatorios();
  };
})();
