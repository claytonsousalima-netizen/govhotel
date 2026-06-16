// ================================================================
// RELATÓRIOS SERVICE — GovHotel
// Dados reais do Supabase. Sem mocks, sem exports, sem financeiro.
// ================================================================

let _relHotelId   = null;
let _relAba       = 'resumo';
let _relData      = null; // { aptos, chamados, retrabalhos, equipe, history, userNames }
let _relFiltros   = { dtIni: '', dtFim: '', andar: '', camareira: '', status: '', apto: '' };

// ── Entrada ──────────────────────────────────────────────────────

async function renderRelatorios() {
  if (currentUser.perfil === 'admin_global') {
    await _renderRelHotelSelector();
    if (!_relHotelId) { _relRenderSemHotel(); return; }
  } else {
    _relHotelId = currentUser.hotelId;
    const sel = document.getElementById('rel-hotel-selector');
    if (sel) sel.style.display = 'none';
  }
  await _relCarregarDados(_relHotelId);
}

// ── Seletor de hotel (admin_global) ─────────────────────────────

async function _renderRelHotelSelector() {
  const wrap = document.getElementById('rel-hotel-selector');
  if (!wrap) return;
  if (wrap.querySelector('select')) {
    const sel = document.getElementById('rel-hotel-select');
    if (sel && _relHotelId) sel.value = _relHotelId;
    wrap.style.display = '';
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
          style="flex:1;min-width:200px;padding:7px 10px;border:1.5px solid var(--border);
                 border-radius:var(--radius-sm);font-size:13px;"
          onchange="_selecionarHotelRel(this.value)">
          <option value="">Selecione um hotel...</option>
          ${(hotels||[]).map(h =>
            `<option value="${h.id}" ${h.id === _relHotelId ? 'selected' : ''}>${h.nome}</option>`
          ).join('')}
        </select>
      </div>
    </div>`;
}

function _relRenderSemHotel() {
  const c = document.getElementById('rel-conteudo');
  if (c) c.innerHTML = `<div class="card" style="padding:24px;text-align:center;color:var(--text3);">
    Selecione um hotel para ver os relatórios.</div>`;
}

async function _selecionarHotelRel(hotelId) {
  _relHotelId = hotelId || null;
  _relData    = null;
  if (!hotelId) { _relRenderSemHotel(); return; }
  await _relCarregarDados(hotelId);
}

// ── Carga de dados (uma vez por hotel) ──────────────────────────

async function _relCarregarDados(hotelId) {
  const conteudo = document.getElementById('rel-conteudo');
  if (conteudo) conteudo.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text3);font-size:13px;">⏳ Carregando dados...</div>`;

  const [aptosRes, chamadosRes, retrabRes, equipeRes, historyRes] = await Promise.all([
    supabaseClient.from('apartments')
      .select('id, numero, andar, tipo, status, maid_id, updated_at, hotel_id')
      .eq('hotel_id', hotelId).eq('ativo', true),
    supabaseClient.from('work_orders')
      .select('id, tipo, status, departamento, prioridade, apartment_id, created_at')
      .eq('hotel_id', hotelId),
    supabaseClient.from('pendencias_retrabalho')
      .select('id, apartment_id, motivo, obs, criado_por, created_at')
      .eq('hotel_id', hotelId),
    supabaseClient.from('user_profiles')
      .select('user_id, nome, perfil, ativo, hotel_id')
      .eq('hotel_id', hotelId).eq('ativo', true),
    supabaseClient.from('apartment_status_history')
      .select('id, apartment_id, status_anterior, status_novo, alterado_por, created_at')
      .eq('hotel_id', hotelId)
      .order('created_at', { ascending: false })
      .limit(3000),
  ]);

  const aptos      = aptosRes.data      || [];
  const chamados   = chamadosRes.data   || [];
  const retrabalhos= retrabRes.data     || [];
  const equipe     = equipeRes.data     || [];
  const history    = historyRes.data    || [];

  // mapa user_id → nome para resolução de nomes em histórico
  const userNames = {};
  equipe.forEach(u => { userNames[u.user_id] = u.nome; });

  _relData = { aptos, chamados, retrabalhos, equipe, history, userNames };
  _relFiltros = { dtIni: '', dtFim: '', andar: '', camareira: '', status: '', apto: '' };

  _relRenderShell();
  _relAbrirAba(_relAba);
}

// ── Shell com abas e filtros ─────────────────────────────────────

function _relRenderShell() {
  const c = document.getElementById('rel-conteudo');
  if (!c) return;

  const abas = [
    { id: 'resumo',         label: '📋 Resumo Operacional' },
    { id: 'status',         label: '🏠 Status dos Aptos' },
    { id: 'sem-resp',       label: '👤 Sem Responsável' },
    { id: 'produtividade',  label: '📊 Produtividade' },
    { id: 'equipe',         label: '👥 Equipe' },
  ];

  const { aptos, equipe } = _relData;
  const andares   = [...new Set(aptos.map(a => a.andar).filter(Boolean))].sort((a,b) => a-b);
  const camareiras= equipe.filter(u => u.perfil === 'camareira');
  const statusList= ['sujo','limpando','pausado','conferencia','limpo','reprovado','livre','ocupado','bloqueado','manutencao'];

  c.innerHTML = `
    <!-- Abas -->
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:16px;">
      ${abas.map(a => `
        <button id="rel-tab-${a.id}" class="btn btn-sm ${_relAba===a.id?'btn-primary':'btn-outline'}"
          onclick="_relAbrirAba('${a.id}')">${a.label}</button>
      `).join('')}
    </div>

    <!-- Filtros -->
    <div class="card" style="padding:12px 16px;margin-bottom:16px;">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
        <div style="display:flex;flex-direction:column;gap:3px;">
          <label style="font-size:11px;color:var(--text3);">Data início</label>
          <input type="date" id="rel-f-dtini" value="${_relFiltros.dtIni}"
            style="padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:12px;"
            onchange="_relFiltro('dtIni',this.value)">
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;">
          <label style="font-size:11px;color:var(--text3);">Data fim</label>
          <input type="date" id="rel-f-dtfim" value="${_relFiltros.dtFim}"
            style="padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:12px;"
            onchange="_relFiltro('dtFim',this.value)">
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;">
          <label style="font-size:11px;color:var(--text3);">Andar</label>
          <select id="rel-f-andar"
            style="padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:12px;"
            onchange="_relFiltro('andar',this.value)">
            <option value="">Todos</option>
            ${andares.map(a => `<option value="${a}" ${_relFiltros.andar==a?'selected':''}>${a}º andar</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;">
          <label style="font-size:11px;color:var(--text3);">Camareira</label>
          <select id="rel-f-cam"
            style="padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:12px;"
            onchange="_relFiltro('camareira',this.value)">
            <option value="">Todas</option>
            ${camareiras.map(u => `<option value="${u.user_id}" ${_relFiltros.camareira===u.user_id?'selected':''}>${u.nome}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;">
          <label style="font-size:11px;color:var(--text3);">Status</label>
          <select id="rel-f-status"
            style="padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:12px;"
            onchange="_relFiltro('status',this.value)">
            <option value="">Todos</option>
            ${statusList.map(s => `<option value="${s}" ${_relFiltros.status===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;">
          <label style="font-size:11px;color:var(--text3);">Apto</label>
          <input type="text" id="rel-f-apto" value="${_relFiltros.apto}" placeholder="ex: 101"
            style="padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:12px;width:80px;"
            oninput="_relFiltro('apto',this.value)">
        </div>
        <button class="btn btn-ghost btn-sm" onclick="_relLimparFiltros()">✕ Limpar</button>
      </div>
    </div>

    <!-- Conteúdo da aba ativa -->
    <div id="rel-aba-conteudo"></div>
  `;
}

function _relFiltro(campo, valor) {
  _relFiltros[campo] = valor;
  _relAbrirAba(_relAba);
}

function _relLimparFiltros() {
  _relFiltros = { dtIni: '', dtFim: '', andar: '', camareira: '', status: '', apto: '' };
  _relRenderShell();
  _relAbrirAba(_relAba);
}

function _relAbrirAba(id) {
  _relAba = id;
  // atualiza botões
  ['resumo','status','sem-resp','produtividade','equipe'].forEach(a => {
    const btn = document.getElementById('rel-tab-' + a);
    if (!btn) return;
    btn.className = 'btn btn-sm ' + (a === id ? 'btn-primary' : 'btn-outline');
  });
  const el = document.getElementById('rel-aba-conteudo');
  if (!el) return;
  if (id === 'resumo')        _relAbaResumo(el);
  else if (id === 'status')   _relAbaStatus(el);
  else if (id === 'sem-resp') _relAbaSemResp(el);
  else if (id === 'produtividade') _relAbaProdutividade(el);
  else if (id === 'equipe')   _relAbaEquipe(el);
}

// ── Helpers de filtro ────────────────────────────────────────────

function _relAptosFilter() {
  const { aptos } = _relData;
  const f = _relFiltros;
  return aptos.filter(a => {
    if (f.andar    && String(a.andar)    !== String(f.andar))    return false;
    if (f.camareira && a.maid_id         !== f.camareira)        return false;
    if (f.status   && a.status           !== f.status)           return false;
    if (f.apto     && !String(a.numero).toLowerCase().includes(f.apto.toLowerCase())) return false;
    return true;
  });
}

function _relHistoryFilter() {
  const { history } = _relData;
  const f = _relFiltros;
  return history.filter(h => {
    if (f.dtIni && h.created_at < f.dtIni) return false;
    if (f.dtFim && h.created_at.slice(0,10) > f.dtFim) return false;
    if (f.camareira && h.alterado_por !== f.camareira) return false;
    if (f.status && h.status_novo !== f.status && h.status_anterior !== f.status) return false;
    return true;
  });
}

function _relChamadosFilter() {
  const { chamados } = _relData;
  const f = _relFiltros;
  return chamados.filter(c => {
    if (f.dtIni && c.created_at < f.dtIni) return false;
    if (f.dtFim && c.created_at.slice(0,10) > f.dtFim) return false;
    return true;
  });
}

function _relRetrabalhoFilter() {
  const { retrabalhos } = _relData;
  const f = _relFiltros;
  return retrabalhos.filter(r => {
    if (f.dtIni && r.created_at < f.dtIni) return false;
    if (f.dtFim && r.created_at.slice(0,10) > f.dtFim) return false;
    if (f.apto) {
      const apto = (_relData.aptos.find(a => a.id === r.apartment_id));
      if (!apto || !String(apto.numero).toLowerCase().includes(f.apto.toLowerCase())) return false;
    }
    return true;
  });
}

function _fmtDt(iso) {
  if (!iso) return '—';
  return iso.slice(0,10).split('-').reverse().join('/') + ' ' + (iso.slice(11,16)||'');
}

function _relTable(cols, rows, cap = 200) {
  if (!rows.length) return `<p style="font-size:12px;color:var(--text3);padding:8px 0;">Nenhum registro encontrado.</p>`;
  const shown = rows.slice(0, cap);
  return `
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr>${cols.map(c=>`<th style="text-align:left;padding:6px 8px;border-bottom:2px solid var(--border);color:var(--text2);white-space:nowrap;">${c}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${shown.map(r=>`<tr style="border-bottom:1px solid var(--border2);">${r.map(v=>`<td style="padding:6px 8px;vertical-align:top;">${v??'—'}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
      ${rows.length > cap ? `<p style="font-size:11px;color:var(--text3);margin-top:6px;">Exibindo ${cap} de ${rows.length} registros.</p>` : ''}
    </div>`;
}

// ── ABA 1: Resumo Operacional ────────────────────────────────────

function _relAbaResumo(el) {
  const { userNames } = _relData;
  const aptos      = _relAptosFilter();
  const chamados   = _relChamadosFilter();
  const retrabalhos= _relRetrabalhoFilter();

  const statusInfo = [
    { key:'sujo',        label:'Sujos',        color:'#e67e22', cls:'s-orange' },
    { key:'limpando',    label:'Limpando',      color:'#2e86c1', cls:'s-blue' },
    { key:'conferencia', label:'Conferência',   color:'#8e44ad', cls:'s-purple' },
    { key:'limpo',       label:'Limpos',        color:'#1abc9c', cls:'s-green' },
    { key:'livre',       label:'Livres',        color:'#27ae60', cls:'s-green' },
    { key:'ocupado',     label:'Ocupados',      color:'#7f8c8d', cls:'s-gray' },
    { key:'bloqueado',   label:'Bloqueados',    color:'#c0392b', cls:'s-red' },
    { key:'manutencao',  label:'Manutenção',    color:'#95a5a6', cls:'s-gray' },
    { key:'pausado',     label:'Pausados',      color:'#f39c12', cls:'s-orange' },
    { key:'reprovado',   label:'Reprovados',    color:'#e74c3c', cls:'s-red' },
  ];

  const cards = statusInfo.map(s => {
    const cnt = aptos.filter(a => a.status === s.key).length;
    return `<div class="stat-card ${s.cls}">
      <div class="stat-label">${s.label}</div>
      <div class="stat-value">${cnt}</div>
    </div>`;
  }).join('');

  // tabela detalhada
  const chamadosByApto = {};
  chamados.forEach(c => { chamadosByApto[c.apartment_id] = (chamadosByApto[c.apartment_id]||0)+1; });
  const retrabByApto = {};
  retrabalhos.forEach(r => { retrabByApto[r.apartment_id] = (retrabByApto[r.apartment_id]||0)+1; });

  const rows = aptos.sort((a,b)=>{
    const na = String(a.andar||0).padStart(4,'0')+String(a.numero||'').padStart(6,'0');
    const nb = String(b.andar||0).padStart(4,'0')+String(b.numero||'').padStart(6,'0');
    return na.localeCompare(nb);
  }).map(a => [
    a.numero || '—',
    a.andar  != null ? a.andar + 'º' : '—',
    `<span class="badge badge-${a.status}">${a.status}</span>`,
    a.maid_id ? (userNames[a.maid_id] || a.maid_id) : '—',
    chamadosByApto[a.id] || 0,
    retrabByApto[a.id]   || 0,
  ]);

  el.innerHTML = `
    <div class="stats-grid" style="margin-bottom:16px;">${cards}</div>
    <div class="card">
      <div class="card-title" style="margin-bottom:10px;">
        Apartamentos (${aptos.length})
      </div>
      ${_relTable(['Apto','Andar','Status','Camareira','Chamados','Retrabalhos'], rows)}
    </div>`;
}

// ── ABA 2: Status dos Apartamentos ──────────────────────────────

function _relAbaStatus(el) {
  const { userNames } = _relData;
  const aptos   = _relAptosFilter();
  const history = _relHistoryFilter();
  const total   = aptos.length;

  const statusInfo = [
    { key:'livre',       label:'Livre',       color:'#27ae60' },
    { key:'sujo',        label:'Sujo',        color:'#e67e22' },
    { key:'limpando',    label:'Limpando',    color:'#2e86c1' },
    { key:'conferencia', label:'Conferência', color:'#8e44ad' },
    { key:'limpo',       label:'Limpo',       color:'#1abc9c' },
    { key:'ocupado',     label:'Ocupado',     color:'#7f8c8d' },
    { key:'bloqueado',   label:'Bloqueado',   color:'#c0392b' },
    { key:'manutencao',  label:'Manutenção',  color:'#f1c40f' },
    { key:'pausado',     label:'Pausado',     color:'#f39c12' },
    { key:'reprovado',   label:'Reprovado',   color:'#e74c3c' },
  ];

  const dist = statusInfo.map(s => {
    const cnt = aptos.filter(a => a.status === s.key).length;
    if (!cnt) return '';
    const pct = total ? Math.round((cnt/total)*100) : 0;
    return `<div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px;">
        <span style="color:var(--text2);">${s.label}</span>
        <span style="font-weight:700;">${cnt} <span style="color:var(--text3);">(${pct}%)</span></span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${s.color};"></div></div>
    </div>`;
  }).join('');

  const aptosById = {};
  _relData.aptos.forEach(a => { aptosById[a.id] = a; });

  const histRows = history.slice(0,200).map(h => {
    const apto = aptosById[h.apartment_id];
    return [
      apto ? (apto.numero||h.apartment_id) : h.apartment_id,
      apto ? (apto.andar!=null ? apto.andar+'º' : '—') : '—',
      h.status_anterior || '—',
      h.status_novo     || '—',
      h.alterado_por ? (userNames[h.alterado_por]||h.alterado_por) : '—',
      _fmtDt(h.created_at),
    ];
  });

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 2fr;gap:16px;align-items:start;">
      <div class="card">
        <div class="card-title" style="margin-bottom:10px;">Distribuição atual</div>
        ${dist || '<p style="font-size:12px;color:var(--text3);">Nenhum apartamento.</p>'}
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:10px;">Histórico de mudanças (${history.length})</div>
        ${_relTable(['Apto','Andar','De','Para','Por','Data'], histRows)}
      </div>
    </div>`;
}

// ── ABA 3: Apartamentos Sem Responsável ─────────────────────────

function _relAbaSemResp(el) {
  const aptos = _relAptosFilter().filter(a => !a.maid_id);
  const rows  = aptos.sort((a,b)=>{
    const na = String(a.andar||0).padStart(4,'0')+String(a.numero||'').padStart(6,'0');
    const nb = String(b.andar||0).padStart(4,'0')+String(b.numero||'').padStart(6,'0');
    return na.localeCompare(nb);
  }).map(a => [
    a.numero||'—',
    a.andar!=null ? a.andar+'º' : '—',
    a.tipo||'—',
    `<span class="badge badge-${a.status}">${a.status}</span>`,
    _fmtDt(a.updated_at),
  ]);

  el.innerHTML = `
    <div class="card">
      <div class="card-title" style="margin-bottom:10px;">
        Apartamentos sem camareira atribuída (${aptos.length})
      </div>
      ${_relTable(['Apto','Andar','Tipo','Status','Última atualização'], rows)}
    </div>`;
}

// ── ABA 4: Produtividade por Camareira ──────────────────────────

function _relAbaProdutividade(el) {
  const { equipe } = _relData;
  const history  = _relHistoryFilter();
  const camareiras = equipe.filter(u => u.perfil === 'camareira');

  if (!camareiras.length) {
    el.innerHTML = `<div class="card" style="padding:24px;text-align:center;color:var(--text3);">Nenhuma camareira ativa.</div>`;
    return;
  }

  const rows = camareiras.map(cam => {
    const hCam = history.filter(h => h.alterado_por === cam.user_id);
    const iniciadas  = hCam.filter(h => h.status_novo === 'limpando').length;
    const concluidas = hCam.filter(h => h.status_novo === 'conferencia' || h.status_novo === 'limpo').length;
    const reprovadas = hCam.filter(h => h.status_novo === 'reprovado').length;
    const aptosAtrib = _relData.aptos.filter(a => a.maid_id === cam.user_id).length;
    return { nome: cam.nome, iniciadas, concluidas, reprovadas, aptosAtrib };
  }).sort((a,b) => b.concluidas - a.concluidas);

  const tableRows = rows.map(r => [
    r.nome,
    r.aptosAtrib,
    r.iniciadas,
    r.concluidas,
    r.reprovadas,
  ]);

  // cards de resumo equipe
  const totIniciadas  = rows.reduce((s,r)=>s+r.iniciadas,0);
  const totConcluidas = rows.reduce((s,r)=>s+r.concluidas,0);
  const totReprovadas = rows.reduce((s,r)=>s+r.reprovadas,0);

  el.innerHTML = `
    <div class="stats-grid" style="margin-bottom:16px;">
      <div class="stat-card s-blue">
        <div class="stat-label">Limpezas iniciadas</div>
        <div class="stat-value">${totIniciadas}</div>
      </div>
      <div class="stat-card s-green">
        <div class="stat-label">Limpezas concluídas</div>
        <div class="stat-value">${totConcluidas}</div>
      </div>
      <div class="stat-card s-red">
        <div class="stat-label">Reprovações</div>
        <div class="stat-value">${totReprovadas}</div>
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:10px;">Produtividade por camareira</div>
      ${_relTable(['Nome','Aptos atribuídos','Iniciadas','Concluídas','Reprovações'], tableRows)}
    </div>`;
}

// ── ABA 5: Equipe ────────────────────────────────────────────────

function _relAbaEquipe(el) {
  const { equipe, aptos } = _relData;
  const f = _relFiltros;

  let lista = equipe;
  if (f.camareira) lista = lista.filter(u => u.user_id === f.camareira);

  const rows = lista.sort((a,b)=>a.nome.localeCompare(b.nome)).map(u => {
    const atrib = aptos.filter(a => a.maid_id === u.user_id).length;
    return [
      u.nome,
      u.perfil,
      u.ativo ? 'Ativo' : 'Inativo',
      atrib,
    ];
  });

  const perfilCount = {};
  equipe.forEach(u => { perfilCount[u.perfil] = (perfilCount[u.perfil]||0)+1; });
  const distPerfil = Object.entries(perfilCount).sort((a,b)=>b[1]-a[1])
    .map(([p,c]) => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:1px solid var(--border2);">
      <span>${p}</span><span style="font-weight:700;">${c}</span>
    </div>`).join('');

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 2fr;gap:16px;align-items:start;">
      <div class="card">
        <div class="card-title" style="margin-bottom:10px;">Por perfil (${equipe.length} ativos)</div>
        ${distPerfil || '<p style="font-size:12px;color:var(--text3);">Sem dados.</p>'}
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:10px;">Membros da equipe</div>
        ${_relTable(['Nome','Perfil','Situação','Aptos atribuídos'], rows)}
      </div>
    </div>`;
}

// ── Patch openPage ────────────────────────────────────────────────

(function patchOpenPageRel() {
  if (window._relPatch) return;
  window._relPatch = true;
  const _realOpen = openPage;
  openPage = function(id) {
    _realOpen(id);
    if (id === 'relatorios') renderRelatorios();
  };
})();
