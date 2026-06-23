// ================================================================
// DASHBOARD SERVICE — Gov Estancorp
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
    if (typeof _renderHotelChip === 'function') _renderHotelChip('dash-hotel-selector');
    else { const s = document.getElementById('dash-hotel-selector'); if (s) s.style.display = 'none'; }
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
  const govEl = document.getElementById('dash-gov-indicadores');
  if (govEl) govEl.innerHTML = '';
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
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const hojeISO = hoje.toISOString();

  // Carrega em paralelo — dados gerais + indicadores de governança
  const agora = new Date().toISOString();

  const [
    aptosRes, chamadosRes, equipeRes,
    govAbertosRes, govAtrasadosRes, retrabalhoRes,
  ] = await Promise.all([
    supabaseClient.from('apartments').select('id, status, maid_id').eq('hotel_id', hotelId).eq('ativo', true),
    supabaseClient.from('work_orders').select('id, status, tipo, prioridade, departamento, created_at, apartments(numero)')
      .eq('hotel_id', hotelId).order('created_at', { ascending: false }).limit(50),
    supabaseClient.from('user_profiles').select('id').eq('hotel_id', hotelId)
      .in('perfil', ['camareira','manutencao']).eq('ativo', true),
    // chamados da governança em aberto
    supabaseClient.from('work_orders').select('id', { count: 'exact', head: true })
      .eq('hotel_id', hotelId).eq('departamento', 'governanca')
      .in('status', ['aberto','em_analise','andamento','pausado','reaberto']),
    // chamados com prazo vencido e ainda ativos
    supabaseClient.from('work_orders').select('id', { count: 'exact', head: true })
      .eq('hotel_id', hotelId).eq('departamento', 'governanca')
      .not('status', 'in', '("resolvido","concluido","cancelado")')
      .not('prazo', 'is', null)
      .lt('prazo', agora),
    // retrabalhos em aberto — dados completos para detalhe
    supabaseClient.from('pendencias_retrabalho')
      .select('id, apartment_id, motivo, obs, status, created_at, apartments(numero, tipo, andar, leitos)')
      .eq('hotel_id', hotelId)
      .or('status.eq.aberta,status.eq.aberto,status.is.null')
      .order('created_at', { ascending: false }),
  ]);

  const aptosArr   = aptosRes.data   || [];
  const chamArr    = chamadosRes.data || [];
  const equipeArr  = equipeRes.data   || [];

  const total      = aptosArr.length;
  const livre      = aptosArr.filter(a => a.status === 'livre').length;
  const sujo       = aptosArr.filter(a => a.status === 'sujo').length;
  const sujoSemCam = aptosArr.filter(a => a.status === 'sujo' && !a.maid_id).length;
  const limpando   = aptosArr.filter(a => a.status === 'limpando').length;
  const pausado    = aptosArr.filter(a => a.status === 'pausado').length;
  const conferencia= aptosArr.filter(a => a.status === 'conferencia').length;
  const limpo      = aptosArr.filter(a => a.status === 'limpo').length;
  const reprovado  = aptosArr.filter(a => a.status === 'reprovado').length;
  const bloqueado  = aptosArr.filter(a => a.status === 'bloqueado').length;
  const manutencao = aptosArr.filter(a => a.status === 'manutencao').length;
  const ocupado    = aptosArr.filter(a => a.status === 'ocupado').length;
  const inspecao   = aptosArr.filter(a => a.status === 'inspecao').length;
  const reservado  = aptosArr.filter(a => a.status === 'reservado').length;
  const site       = aptosArr.filter(a => a.status === 'site').length;
  const abertos    = chamArr.filter(c => c.status === 'aberto').length;
  const andamento  = chamArr.filter(c => c.status === 'andamento').length;

  const govAbertos   = govAbertosRes.count  ?? 0;
  const govAtrasados = govAtrasadosRes.count ?? 0;
  const retrabArr    = retrabalhoRes.data   || [];
  const retrabalhos  = retrabArr.length;

  // Stats grid — linha 1: composição dos aptos | linha 2: outros indicadores
  document.getElementById('stats-grid').innerHTML = `
    <div style="margin-bottom:6px;">
      <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;">
        Composição dos Apartamentos
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">
        <div class="stat-card s-blue">
          <div class="stat-label">Total aptos</div>
          <div class="stat-value">${total}</div>
          <div class="stat-sub">unidades cadastradas</div>
        </div>
        <div class="stat-card s-green">
          <div class="stat-label">Vagos</div>
          <div class="stat-value">${livre}</div>
          <div class="stat-sub">disponíveis agora</div>
        </div>
        <div class="stat-card s-orange">
          <div class="stat-label">A limpar</div>
          <div class="stat-value">${sujo}</div>
          <div class="stat-sub">aguardando limpeza</div>
        </div>
        <div class="stat-card s-blue">
          <div class="stat-label">Em Limpeza</div>
          <div class="stat-value">${limpando}</div>
          <div class="stat-sub">em andamento</div>
        </div>
        ${pausado > 0 ? `
        <div class="stat-card" style="border-top:3px solid #7c3aed;">
          <div class="stat-label">Pausados</div>
          <div class="stat-value" style="color:#7c3aed;">${pausado}</div>
          <div class="stat-sub">limpeza interrompida</div>
        </div>` : ''}
        ${conferencia > 0 ? `
        <div class="stat-card" style="border-top:3px solid #0891b2;">
          <div class="stat-label">Arrumação</div>
          <div class="stat-value" style="color:#0891b2;">${conferencia}</div>
          <div class="stat-sub">aguardando vistoria</div>
        </div>` : ''}
        ${limpo > 0 ? `
        <div class="stat-card" style="border-top:3px solid #16a34a;">
          <div class="stat-label">Limpos</div>
          <div class="stat-value" style="color:#16a34a;">${limpo}</div>
          <div class="stat-sub">prontos para recepção</div>
        </div>` : ''}
        ${reprovado > 0 ? `
        <div class="stat-card" style="border-top:3px solid #dc2626;">
          <div class="stat-label">Reprovados</div>
          <div class="stat-value" style="color:#dc2626;">${reprovado}</div>
          <div class="stat-sub">requer retrabalho</div>
        </div>` : ''}
        ${bloqueado > 0 ? `
        <div class="stat-card" style="border-top:3px solid #64748b;">
          <div class="stat-label">Bloqueados</div>
          <div class="stat-value" style="color:#64748b;">${bloqueado}</div>
          <div class="stat-sub">fora de uso</div>
        </div>` : ''}
        ${manutencao > 0 ? `
        <div class="stat-card" style="border-top:3px solid #b45309;">
          <div class="stat-label">Em manutenção</div>
          <div class="stat-value" style="color:#b45309;">${manutencao}</div>
          <div class="stat-sub">aguardando reparo</div>
        </div>` : ''}
        ${ocupado > 0 ? `
        <div class="stat-card" style="border-top:3px solid #7f8c8d;">
          <div class="stat-label">Ocupados</div>
          <div class="stat-value" style="color:#7f8c8d;">${ocupado}</div>
          <div class="stat-sub">hóspedes no apto</div>
        </div>` : ''}
        ${inspecao > 0 ? `
        <div class="stat-card" style="border-top:3px solid #0891b2;">
          <div class="stat-label">Inspeção</div>
          <div class="stat-value" style="color:#0891b2;">${inspecao}</div>
          <div class="stat-sub">aguardando inspeção</div>
        </div>` : ''}
        ${reservado > 0 ? `
        <div class="stat-card" style="border-top:3px solid #6366f1;">
          <div class="stat-label">Reservados</div>
          <div class="stat-value" style="color:#6366f1;">${reservado}</div>
          <div class="stat-sub">reserva confirmada</div>
        </div>` : ''}
        ${site > 0 ? `
        <div class="stat-card" style="border-top:3px solid #8b5cf6;">
          <div class="stat-label">Site</div>
          <div class="stat-value" style="color:#8b5cf6;">${site}</div>
          <div class="stat-sub">bloqueado pelo site</div>
        </div>` : ''}
      </div>
    </div>

    <div>
      <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;">
        Outros Indicadores
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">
        <div class="stat-card s-red">
          <div class="stat-label">Chamados abertos</div>
          <div class="stat-value">${abertos}</div>
          <div class="stat-sub">${andamento} em andamento</div>
        </div>
        <div class="stat-card s-purple">
          <div class="stat-label">Equipe ativa</div>
          <div class="stat-value">${equipeArr.length}</div>
          <div class="stat-sub">camareiras + manutenção</div>
        </div>
      </div>
    </div>`;

  // Indicadores de Governança
  const _govCard = (label, value, color, sub) =>
    `<div class="stat-card" style="border-top:3px solid ${color};padding:14px 16px;">
      <div class="stat-label" style="font-size:11px;">${label}</div>
      <div class="stat-value" style="font-size:26px;color:${color};">${value}</div>
      ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
    </div>`;

  const govEl = document.getElementById('dash-gov-indicadores');
  if (govEl) {
    govEl.innerHTML = `
      <div class="card" style="padding:16px 18px;">
        <div class="card-title" style="margin-bottom:14px;">Governança — Indicadores do Dia</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;">
          ${sujo       > 0 ? _govCard('Sujos',             sujo,        '#e67e22', 'aguardando limpeza')    : ''}
          ${sujoSemCam > 0 ? _govCard('Sujos sem cam.',    sujoSemCam,  '#c0392b', 'sem responsável')       : ''}
          ${limpando   > 0 ? _govCard('Em Limpeza',        limpando,    '#2e86c1', 'em andamento')          : ''}
          ${pausado    > 0 ? _govCard('Pausados',          pausado,     '#f39c12', 'limpeza interrompida')  : ''}
          ${conferencia> 0 ? _govCard('Arrumação',         conferencia, '#8e44ad', 'aguardando arrumação')  : ''}
          ${limpo      > 0 ? _govCard('Limpos',            limpo,       '#27ae60', 'prontos')               : ''}
          ${reprovado  > 0 ? _govCard('Reprovados',        reprovado,   '#c0392b', 'exigem retrabalho')     : ''}
          ${govAbertos > 0 ? _govCard('Chamados abertos',  govAbertos,  '#e74c3c', 'gov. em aberto')        : ''}
          ${govAtrasados>0 ? _govCard('Atrasados',         govAtrasados,'#c0392b', 'prazo vencido')         : ''}
          ${retrabalhos> 0 ? _govCard('Retrabalhos abertos',retrabalhos,'#e67e22', 'aguardando refazer')    : ''}
        </div>
      </div>`;
  }

  // Gráfico status
  const statuses = ['livre','sujo','limpando','conferencia','bloqueado','ocupado','manutencao'];
  const labels   = {livre:'Vago',sujo:'Sujo',limpando:'Em Limpeza',conferencia:'Arrumação',bloqueado:'Bloqueado',ocupado:'Ocupado',manutencao:'Manutenção'};
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

  // Retrabalhos em aberto — detalhe
  const retEl = document.getElementById('dash-retrabalhos');
  if (retEl) {
    if (!retrabArr.length) {
      retEl.innerHTML = '';
    } else {
      const rows = retrabArr.map(r => {
        const ap = r.apartments;
        const aptoInfo = ap
          ? `Apto ${ap.numero}${ap.leitos ? ` · ${ap.leitos}🛏` : ''} · ${ap.andar}º andar`
          : '—';
        const dias = r.created_at
          ? Math.floor((Date.now() - new Date(r.created_at)) / 86400000) : null;
        return `
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;
                      padding:10px 0;border-bottom:1px solid var(--border);">
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:700;">${aptoInfo}</div>
              ${r.motivo ? `<div style="font-size:12px;color:var(--text2);margin-top:2px;">🔁 ${r.motivo}</div>` : ''}
              ${r.obs    ? `<div style="font-size:11px;color:var(--text3);margin-top:2px;">${r.obs}</div>` : ''}
            </div>
            ${dias !== null ? `<span style="font-size:11px;color:#c0392b;font-weight:700;white-space:nowrap;">${dias}d</span>` : ''}
          </div>`;
      }).join('');
      retEl.innerHTML = `
        <div class="card" style="margin-top:16px;padding:16px 18px;">
          <div class="card-title" style="margin-bottom:12px;">🔁 Retrabalhos em aberto (${retrabArr.length})</div>
          ${rows}
        </div>`;
    }
  }
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
