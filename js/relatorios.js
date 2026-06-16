// ================================================================
// RELATÓRIOS SERVICE — GovHotel
// Dados reais do Supabase. Sem mocks, sem exports, sem financeiro.
// ================================================================

let _relHotelId = null;
let _relAba     = 'resumo';
let _relData    = null;
// { aptos, chamados, retrabalhos, equipe, history, checklists, userNames, aptoById }
let _relFiltros = { dtIni:'', dtFim:'', andar:'', camareira:'', status:'', apto:'', tipo:'', prioridade:'' };

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
  if (conteudo) conteudo.innerHTML =
    `<div style="padding:32px;text-align:center;color:var(--text3);font-size:13px;">⏳ Carregando dados...</div>`;

  const [aptosRes, chamadosRes, retrabRes, equipeRes, historyRes, checkRes] = await Promise.all([
    supabaseClient.from('apartments')
      .select('id, numero, andar, tipo, status, maid_id, updated_at')
      .eq('hotel_id', hotelId).eq('ativo', true),
    supabaseClient.from('work_orders')
      .select('id, numero, tipo, status, departamento, prioridade, apartment_id, responsavel_user_id, prazo, created_at, updated_at')
      .eq('hotel_id', hotelId)
      .order('created_at', { ascending: false }),
    supabaseClient.from('pendencias_retrabalho')
      .select('id, apartment_id, motivo, obs, status, criado_por, created_at, updated_at')
      .eq('hotel_id', hotelId)
      .order('created_at', { ascending: false }),
    supabaseClient.from('user_profiles')
      .select('user_id, nome, perfil, ativo')
      .eq('hotel_id', hotelId).eq('ativo', true),
    supabaseClient.from('apartment_status_history')
      .select('id, apartment_id, status_anterior, status_novo, alterado_por, created_at')
      .eq('hotel_id', hotelId)
      .order('created_at', { ascending: false })
      .limit(3000),
    supabaseClient.from('conferencia_supervisora_checklists')
      .select('id, apartment_id, item, resposta, observacao, resultado, user_id, camareira_id, created_at')
      .eq('hotel_id', hotelId)
      .order('created_at', { ascending: false })
      .limit(3000),
  ]);

  const aptos      = aptosRes.data    || [];
  const chamados   = chamadosRes.data || [];
  const retrabalhos= retrabRes.data   || [];
  const equipe     = equipeRes.data   || [];
  const history    = historyRes.data  || [];
  const checklists = checkRes.error   ? [] : (checkRes.data || []);

  const userNames = {};
  equipe.forEach(u => { userNames[u.user_id] = u.nome; });

  const aptoById = {};
  aptos.forEach(a => { aptoById[a.id] = a; });

  _relData    = { aptos, chamados, retrabalhos, equipe, history, checklists, userNames, aptoById };
  _relFiltros = { dtIni:'', dtFim:'', andar:'', camareira:'', status:'', apto:'', tipo:'', prioridade:'' };

  _relRenderShell();
  _relAbrirAba(_relAba);
}

// ── Shell com abas e filtros ─────────────────────────────────────

function _relRenderShell() {
  const c = document.getElementById('rel-conteudo');
  if (!c) return;

  const abas = [
    { id:'executivo',    label:'🏆 Executivo' },
    { id:'resumo',       label:'📋 Resumo Operacional' },
    { id:'status',       label:'🏠 Status dos Aptos' },
    { id:'sem-resp',     label:'👤 Sem Responsável' },
    { id:'produtividade',label:'📊 Produtividade' },
    { id:'chamados',     label:'📞 Chamados' },
    { id:'qualidade',    label:'✅ Qualidade' },
    { id:'checklists',   label:'📝 Checklists' },
    { id:'retrabalhos',  label:'🔁 Retrabalhos' },
    { id:'equipe',       label:'👥 Equipe' },
  ];

  const { aptos, equipe, chamados } = _relData;
  const andares    = [...new Set(aptos.map(a => a.andar).filter(v => v!=null))].sort((a,b)=>a-b);
  const camareiras = equipe.filter(u => u.perfil === 'camareira');
  const statusList = ['sujo','limpando','pausado','conferencia','limpo','reprovado','livre','ocupado','bloqueado','manutencao'];
  const tipoList   = [...new Set(chamados.map(c=>c.tipo).filter(Boolean))].sort();
  const prioList   = [...new Set(chamados.map(c=>c.prioridade).filter(Boolean))].sort();

  c.innerHTML = `
    <!-- Abas -->
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:16px;">
      ${abas.map(a=>`
        <button id="rel-tab-${a.id}" class="btn btn-sm ${_relAba===a.id?'btn-primary':'btn-outline'}"
          onclick="_relAbrirAba('${a.id}')">${a.label}</button>
      `).join('')}
    </div>

    <!-- Filtros -->
    <div class="card" style="padding:12px 16px;margin-bottom:16px;">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
        ${_relFiltroInput('date','rel-f-dtini','Data início',_relFiltros.dtIni,"_relFiltro('dtIni',this.value)")}
        ${_relFiltroInput('date','rel-f-dtfim','Data fim',_relFiltros.dtFim,"_relFiltro('dtFim',this.value)")}
        ${_relFiltroSel('rel-f-andar','Andar',andares.map(a=>({v:a,l:a+'º andar'})),_relFiltros.andar,"_relFiltro('andar',this.value)")}
        ${_relFiltroSel('rel-f-cam','Camareira',camareiras.map(u=>({v:u.user_id,l:u.nome})),_relFiltros.camareira,"_relFiltro('camareira',this.value)")}
        ${_relFiltroSel('rel-f-status','Status',statusList.map(s=>({v:s,l:s})),_relFiltros.status,"_relFiltro('status',this.value)")}
        ${_relFiltroSel('rel-f-tipo','Tipo chamado',tipoList.map(t=>({v:t,l:t})),_relFiltros.tipo,"_relFiltro('tipo',this.value)")}
        ${_relFiltroSel('rel-f-prio','Prioridade',prioList.map(p=>({v:p,l:p})),_relFiltros.prioridade,"_relFiltro('prioridade',this.value)")}
        ${_relFiltroInput('text','rel-f-apto','Apto',_relFiltros.apto,"_relFiltro('apto',this.value)",'80px','oninput')}
        <button class="btn btn-ghost btn-sm" onclick="_relLimparFiltros()">✕ Limpar</button>
      </div>
    </div>

    <!-- Conteúdo -->
    <div id="rel-aba-conteudo"></div>
  `;
}

function _relFiltroInput(type, id, label, val, onev, width='120px', evt='onchange') {
  return `<div style="display:flex;flex-direction:column;gap:3px;">
    <label style="font-size:11px;color:var(--text3);">${label}</label>
    <input type="${type}" id="${id}" value="${val}" ${evt}="${onev}"
      style="padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:12px;width:${width};">
  </div>`;
}

function _relFiltroSel(id, label, opts, val, onev) {
  return `<div style="display:flex;flex-direction:column;gap:3px;">
    <label style="font-size:11px;color:var(--text3);">${label}</label>
    <select id="${id}" onchange="${onev}"
      style="padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:12px;">
      <option value="">Todos</option>
      ${opts.map(o=>`<option value="${o.v}" ${val===String(o.v)?'selected':''}>${o.l}</option>`).join('')}
    </select>
  </div>`;
}

function _relFiltro(campo, valor) {
  _relFiltros[campo] = valor;
  _relAbrirAba(_relAba);
}

function _relLimparFiltros() {
  _relFiltros = { dtIni:'', dtFim:'', andar:'', camareira:'', status:'', apto:'', tipo:'', prioridade:'' };
  _relRenderShell();
  _relAbrirAba(_relAba);
}

function _relAbrirAba(id) {
  _relAba = id;
  ['executivo','resumo','status','sem-resp','produtividade','chamados','qualidade','checklists','retrabalhos','equipe'].forEach(a => {
    const btn = document.getElementById('rel-tab-' + a);
    if (btn) btn.className = 'btn btn-sm ' + (a === id ? 'btn-primary' : 'btn-outline');
  });
  const el = document.getElementById('rel-aba-conteudo');
  if (!el) return;
  if      (id==='executivo')    _relAbaExecutivo(el);
  else if (id==='resumo')       _relAbaResumo(el);
  else if (id==='status')       _relAbaStatus(el);
  else if (id==='sem-resp')     _relAbaSemResp(el);
  else if (id==='produtividade')_relAbaProdutividade(el);
  else if (id==='chamados')     _relAbaChamados(el);
  else if (id==='qualidade')    _relAbaQualidade(el);
  else if (id==='checklists')   _relAbaChecklists(el);
  else if (id==='retrabalhos')  _relAbaRetrabalhos(el);
  else if (id==='equipe')       _relAbaEquipe(el);
}

// ── Filtros aplicados em memória ─────────────────────────────────

function _relAptosFilter() {
  const f = _relFiltros;
  return _relData.aptos.filter(a => {
    if (f.andar     && String(a.andar) !== String(f.andar)) return false;
    if (f.camareira && a.maid_id       !== f.camareira)     return false;
    if (f.status    && a.status        !== f.status)        return false;
    if (f.apto      && !String(a.numero||'').toLowerCase().includes(f.apto.toLowerCase())) return false;
    return true;
  });
}

function _relChamadosFilter() {
  const f = _relFiltros;
  return _relData.chamados.filter(c => {
    if (f.dtIni    && c.created_at.slice(0,10) < f.dtIni) return false;
    if (f.dtFim    && c.created_at.slice(0,10) > f.dtFim) return false;
    if (f.tipo     && c.tipo       !== f.tipo)             return false;
    if (f.prioridade && c.prioridade !== f.prioridade)     return false;
    if (f.apto) {
      const a = _relData.aptoById[c.apartment_id];
      if (!a || !String(a.numero||'').toLowerCase().includes(f.apto.toLowerCase())) return false;
    }
    return true;
  });
}

function _relRetrabFilter() {
  const f = _relFiltros;
  return _relData.retrabalhos.filter(r => {
    if (f.dtIni && r.created_at.slice(0,10) < f.dtIni) return false;
    if (f.dtFim && r.created_at.slice(0,10) > f.dtFim) return false;
    if (f.camareira) {
      const a = _relData.aptoById[r.apartment_id];
      if (!a || a.maid_id !== f.camareira) return false;
    }
    if (f.apto) {
      const a = _relData.aptoById[r.apartment_id];
      if (!a || !String(a.numero||'').toLowerCase().includes(f.apto.toLowerCase())) return false;
    }
    return true;
  });
}

function _relCheckFilter() {
  const f = _relFiltros;
  return _relData.checklists.filter(h => {
    if (f.dtIni && h.created_at.slice(0,10) < f.dtIni) return false;
    if (f.dtFim && h.created_at.slice(0,10) > f.dtFim) return false;
    if (f.apto) {
      const a = _relData.aptoById[h.apartment_id];
      if (!a || !String(a.numero||'').toLowerCase().includes(f.apto.toLowerCase())) return false;
    }
    return true;
  });
}

function _relHistoryFilter() {
  const f = _relFiltros;
  return _relData.history.filter(h => {
    if (f.dtIni    && h.created_at.slice(0,10) < f.dtIni) return false;
    if (f.dtFim    && h.created_at.slice(0,10) > f.dtFim) return false;
    if (f.camareira && h.alterado_por !== f.camareira)     return false;
    if (f.status   && h.status_novo !== f.status && h.status_anterior !== f.status) return false;
    return true;
  });
}

// ── Utilitários ──────────────────────────────────────────────────

function _fmtDt(iso) {
  if (!iso) return '—';
  const d = iso.slice(0,10).split('-').reverse().join('/');
  const t = iso.slice(11,16);
  return t ? d + ' ' + t : d;
}

function _relTable(cols, rows, cap = 200) {
  if (!rows.length) return `<p style="font-size:12px;color:var(--text3);padding:8px 0;">Nenhum registro encontrado.</p>`;
  const shown = rows.slice(0, cap);
  return `<div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr>${cols.map(c=>`<th style="text-align:left;padding:6px 8px;border-bottom:2px solid var(--border);color:var(--text2);white-space:nowrap;">${c}</th>`).join('')}</tr></thead>
      <tbody>${shown.map(r=>`<tr style="border-bottom:1px solid var(--border2);">${r.map(v=>`<td style="padding:6px 8px;vertical-align:top;">${v??'—'}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
    ${rows.length>cap?`<p style="font-size:11px;color:var(--text3);margin-top:6px;">Exibindo ${cap} de ${rows.length} registros.</p>`:''}
  </div>`;
}

function _relCard(label, value, sub, cls='s-blue') {
  return `<div class="stat-card ${cls}">
    <div class="stat-label">${label}</div>
    <div class="stat-value">${value}</div>
    ${sub?`<div class="stat-sub">${sub}</div>`:''}
  </div>`;
}

function _relAptoNum(id) {
  const a = _relData.aptoById[id];
  return a ? (a.numero||id) : id||'—';
}

function _relNome(uid) {
  if (!uid) return '—';
  return _relData.userNames[uid] || uid;
}

const _hoje = new Date().toISOString().slice(0,10);

function _isAtrasado(c) {
  if (!c.prazo) return false;
  const fimStatus = ['concluido','resolvido','cancelado'];
  return c.prazo.slice(0,10) < _hoje && !fimStatus.includes((c.status||'').toLowerCase());
}

// ── ABA: Executivo ───────────────────────────────────────────────

function _relAbaExecutivo(el) {
  const aptos      = _relAptosFilter();
  const chamados   = _relChamadosFilter();
  const retrabalhos= _relRetrabFilter();
  const checklists = _relCheckFilter();
  const camareiras = _relData.equipe.filter(u => u.perfil === 'camareira');

  const total        = aptos.length;
  const limpos       = aptos.filter(a=>a.status==='limpo').length;
  const sujos        = aptos.filter(a=>a.status==='sujo').length;
  const conferencia  = aptos.filter(a=>a.status==='conferencia').length;
  const semCam       = aptos.filter(a=>!a.maid_id).length;
  const chamAbertos  = chamados.filter(c=>c.status==='aberto').length;
  const chamAtrasados= chamados.filter(c=>_isAtrasado(c)).length;
  const retrabAbertos= retrabalhos.filter(r=>!r.status||r.status==='aberto').length;

  let taxaReprov = '—';
  if (checklists.length) {
    const reprov = checklists.filter(h=>h.resultado==='reprovado'||h.resultado==='nao_conforme').length;
    taxaReprov = Math.round((reprov/checklists.length)*100) + '%';
  }

  el.innerHTML = `
    <div class="stats-grid">
      ${_relCard('Total de apartamentos', total, 'unidades ativas', 's-blue')}
      ${_relCard('Apartamentos limpos', limpos, `de ${total}`, 's-green')}
      ${_relCard('Apartamentos sujos', sujos, 'aguardando limpeza', 's-orange')}
      ${_relCard('Aguardando conferência', conferencia, 'em análise', 's-purple')}
      ${_relCard('Sem camareira atribuída', semCam, 'sem responsável', 's-gray')}
      ${_relCard('Chamados abertos', chamAbertos, `de ${chamados.length} total`, 's-orange')}
      ${chamAtrasados>0 ? _relCard('Chamados atrasados', chamAtrasados, 'prazo vencido', 's-red') : ''}
      ${_relCard('Retrabalhos abertos', retrabAbertos, '', 's-red')}
      ${checklists.length ? _relCard('Taxa de reprovação', taxaReprov, `${checklists.length} conferências`, 's-purple') : ''}
      ${_relCard('Camareiras ativas', camareiras.length, 'equipe de limpeza', 's-green')}
    </div>`;
}

// ── ABA: Resumo Operacional ──────────────────────────────────────

function _relAbaResumo(el) {
  const { userNames } = _relData;
  const aptos      = _relAptosFilter();
  const chamados   = _relChamadosFilter();
  const retrabalhos= _relRetrabFilter();

  const statusInfo = [
    {key:'sujo',s:'s-orange'},{key:'limpando',s:'s-blue'},{key:'conferencia',s:'s-purple'},
    {key:'limpo',s:'s-green'},{key:'livre',s:'s-green'},{key:'ocupado',s:'s-gray'},
    {key:'bloqueado',s:'s-red'},{key:'manutencao',s:'s-gray'},{key:'pausado',s:'s-orange'},{key:'reprovado',s:'s-red'},
  ];
  const cards = statusInfo.map(s=>{
    const cnt = aptos.filter(a=>a.status===s.key).length;
    return _relCard(s.key, cnt, '', s.s);
  }).join('');

  const chamByApto = {};
  chamados.forEach(c=>{ chamByApto[c.apartment_id]=(chamByApto[c.apartment_id]||0)+1; });
  const retrabByApto = {};
  retrabalhos.forEach(r=>{ retrabByApto[r.apartment_id]=(retrabByApto[r.apartment_id]||0)+1; });

  const rows = aptos.sort((a,b)=>{
    const na=String(a.andar||0).padStart(4,'0')+String(a.numero||'').padStart(6,'0');
    const nb=String(b.andar||0).padStart(4,'0')+String(b.numero||'').padStart(6,'0');
    return na.localeCompare(nb);
  }).map(a=>[
    a.numero||'—',
    a.andar!=null?a.andar+'º':'—',
    `<span class="badge badge-${a.status}">${a.status}</span>`,
    a.maid_id ? (userNames[a.maid_id]||a.maid_id) : '—',
    chamByApto[a.id]||0,
    retrabByApto[a.id]||0,
  ]);

  el.innerHTML = `
    <div class="stats-grid" style="margin-bottom:16px;">${cards}</div>
    <div class="card">
      <div class="card-title" style="margin-bottom:10px;">Apartamentos (${aptos.length})</div>
      ${_relTable(['Apto','Andar','Status','Camareira','Chamados','Retrabalhos'], rows, 9999)}
    </div>`;
}

// ── ABA: Status dos Apartamentos ────────────────────────────────

function _relAbaStatus(el) {
  const aptos   = _relAptosFilter();
  const history = _relHistoryFilter();
  const total   = aptos.length;

  const statusInfo = [
    {key:'livre',label:'Livre',color:'#27ae60'},{key:'sujo',label:'Sujo',color:'#e67e22'},
    {key:'limpando',label:'Limpando',color:'#2e86c1'},{key:'conferencia',label:'Conferência',color:'#8e44ad'},
    {key:'limpo',label:'Limpo',color:'#1abc9c'},{key:'ocupado',label:'Ocupado',color:'#7f8c8d'},
    {key:'bloqueado',label:'Bloqueado',color:'#c0392b'},{key:'manutencao',label:'Manutenção',color:'#f1c40f'},
    {key:'pausado',label:'Pausado',color:'#f39c12'},{key:'reprovado',label:'Reprovado',color:'#e74c3c'},
  ];

  const dist = statusInfo.map(s=>{
    const cnt = aptos.filter(a=>a.status===s.key).length;
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

  const histRows = history.slice(0,200).map(h=>[
    _relAptoNum(h.apartment_id),
    (()=>{ const a=_relData.aptoById[h.apartment_id]; return a&&a.andar!=null?a.andar+'º':'—'; })(),
    h.status_anterior||'—',
    h.status_novo||'—',
    _relNome(h.alterado_por),
    _fmtDt(h.created_at),
  ]);

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 2fr;gap:16px;align-items:start;">
      <div class="card">
        <div class="card-title" style="margin-bottom:10px;">Distribuição atual</div>
        ${dist||'<p style="font-size:12px;color:var(--text3);">Nenhum apartamento.</p>'}
      </div>
      <div class="card">
        <div class="card-title" style="margin-bottom:10px;">Histórico de mudanças (${history.length})</div>
        ${_relTable(['Apto','Andar','De','Para','Por','Data'], histRows)}
      </div>
    </div>`;
}

// ── ABA: Sem Responsável ─────────────────────────────────────────

function _relAbaSemResp(el) {
  const aptos = _relAptosFilter().filter(a=>!a.maid_id);
  const rows  = aptos.sort((a,b)=>{
    const na=String(a.andar||0).padStart(4,'0')+String(a.numero||'').padStart(6,'0');
    const nb=String(b.andar||0).padStart(4,'0')+String(b.numero||'').padStart(6,'0');
    return na.localeCompare(nb);
  }).map(a=>[
    a.numero||'—',
    a.andar!=null?a.andar+'º':'—',
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

// ── ABA: Produtividade ───────────────────────────────────────────

function _relAbaProdutividade(el) {
  const { equipe } = _relData;
  const history    = _relHistoryFilter();
  const camareiras = equipe.filter(u=>u.perfil==='camareira');

  if (!camareiras.length) {
    el.innerHTML = `<div class="card" style="padding:24px;text-align:center;color:var(--text3);">Nenhuma camareira ativa.</div>`;
    return;
  }

  const rows = camareiras.map(cam => {
    const h         = history.filter(x=>x.alterado_por===cam.user_id);
    const iniciadas = h.filter(x=>x.status_novo==='limpando').length;
    const concluidas= h.filter(x=>x.status_novo==='conferencia'||x.status_novo==='limpo').length;
    const reprovadas= h.filter(x=>x.status_novo==='reprovado').length;
    const atrib     = _relData.aptos.filter(a=>a.maid_id===cam.user_id).length;
    return { nome:cam.nome, atrib, iniciadas, concluidas, reprovadas };
  }).sort((a,b)=>b.concluidas-a.concluidas);

  const totI = rows.reduce((s,r)=>s+r.iniciadas,0);
  const totC = rows.reduce((s,r)=>s+r.concluidas,0);
  const totR = rows.reduce((s,r)=>s+r.reprovadas,0);

  el.innerHTML = `
    <div class="stats-grid" style="margin-bottom:16px;">
      ${_relCard('Iniciadas',''+totI,'','s-blue')}
      ${_relCard('Concluídas',''+totC,'','s-green')}
      ${_relCard('Reprovações',''+totR,'','s-red')}
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:10px;">Por camareira</div>
      ${_relTable(['Nome','Aptos atribuídos','Iniciadas','Concluídas','Reprovações'],
        rows.map(r=>[r.nome,r.atrib,r.iniciadas,r.concluidas,r.reprovadas]))}
    </div>`;
}

// ── ABA: Chamados da Governança ──────────────────────────────────

function _relAbaChamados(el) {
  const chamados = _relChamadosFilter();

  const abertos    = chamados.filter(c=>c.status==='aberto').length;
  const andamento  = chamados.filter(c=>c.status==='andamento'||c.status==='em_andamento').length;
  const concluidos = chamados.filter(c=>c.status==='concluido'||c.status==='resolvido').length;
  const cancelados = chamados.filter(c=>c.status==='cancelado').length;
  const atrasados  = chamados.filter(c=>_isAtrasado(c)).length;

  // distribuição por prioridade
  const prioCnt = {};
  chamados.forEach(c=>{ if(c.prioridade) prioCnt[c.prioridade]=(prioCnt[c.prioridade]||0)+1; });
  const prioHtml = Object.entries(prioCnt).sort((a,b)=>b[1]-a[1]).map(([p,n])=>
    `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border2);">
      <span>${p}</span><span class="badge badge-andamento">${n}</span>
    </div>`).join('') || '<p style="font-size:12px;color:var(--text3);">—</p>';

  // distribuição por tipo
  const tipoCnt = {};
  chamados.forEach(c=>{ if(c.tipo) tipoCnt[c.tipo]=(tipoCnt[c.tipo]||0)+1; });
  const tipoHtml = Object.entries(tipoCnt).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([t,n])=>
    `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border2);">
      <span>${t}</span><span class="badge badge-andamento">${n}</span>
    </div>`).join('') || '<p style="font-size:12px;color:var(--text3);">—</p>';

  // distribuição por departamento
  const deptCnt = {};
  chamados.forEach(c=>{ if(c.departamento) deptCnt[c.departamento]=(deptCnt[c.departamento]||0)+1; });
  const deptHtml = Object.entries(deptCnt).sort((a,b)=>b[1]-a[1]).map(([d,n])=>
    `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border2);">
      <span>${d}</span><span class="badge badge-andamento">${n}</span>
    </div>`).join('') || '<p style="font-size:12px;color:var(--text3);">—</p>';

  const rows = chamados.slice(0,200).map(c=>{
    const atrasado = _isAtrasado(c);
    return [
      c.numero||'—',
      _fmtDt(c.created_at),
      _relAptoNum(c.apartment_id),
      c.departamento||'—',
      c.tipo||'—',
      c.prioridade||'—',
      c.status||'—',
      _relNome(c.responsavel_user_id),
      c.prazo ? c.prazo.slice(0,10).split('-').reverse().join('/') : '—',
      c.prazo ? (atrasado
        ? '<span style="color:#c0392b;font-weight:700;">Sim</span>'
        : '<span style="color:#27ae60;">Não</span>') : '—',
    ];
  });

  el.innerHTML = `
    <div class="stats-grid" style="margin-bottom:16px;">
      ${_relCard('Abertos',''+abertos,'','s-orange')}
      ${_relCard('Em andamento',''+andamento,'','s-blue')}
      ${_relCard('Concluídos',''+concluidos,'','s-green')}
      ${_relCard('Cancelados',''+cancelados,'','s-gray')}
      ${atrasados>0?_relCard('Atrasados',''+atrasados,'prazo vencido','s-red'):''}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px;">
      <div class="card"><div class="card-title" style="margin-bottom:10px;">Por prioridade</div>${prioHtml}</div>
      <div class="card"><div class="card-title" style="margin-bottom:10px;">Por tipo</div>${tipoHtml}</div>
      <div class="card"><div class="card-title" style="margin-bottom:10px;">Por departamento</div>${deptHtml}</div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:10px;">Chamados (${chamados.length})</div>
      ${_relTable(['Nº','Abertura','Apto','Depto','Tipo','Prioridade','Status','Responsável','Prazo','Atrasado'], rows)}
    </div>`;
}

// ── ABA: Qualidade e Conferência ─────────────────────────────────

function _relAbaQualidade(el) {
  const checklists = _relCheckFilter();
  const retrabalhos= _relRetrabFilter();

  const total    = checklists.length;
  const aprovados= checklists.filter(h=>h.resultado==='aprovado'||h.resultado==='conforme').length;
  const reprovados= checklists.filter(h=>h.resultado==='reprovado'||h.resultado==='nao_conforme').length;
  const taxaPct  = total ? Math.round((reprovados/total)*100) : 0;

  // itens mais não conformes
  const itensCnt = {};
  checklists.filter(h=>(h.resposta||'').toLowerCase().includes('não')||(h.resultado||'').includes('reprov')||(h.resultado||'').includes('nao_conf'))
    .forEach(h=>{ if(h.item) itensCnt[h.item]=(itensCnt[h.item]||0)+1; });
  const itensHtml = Object.entries(itensCnt).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([item,n])=>
    `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border2);">
      <span>${item}</span><span class="badge badge-reprovado">${n}</span>
    </div>`).join('') || '<p style="font-size:12px;color:var(--text3);">Sem dados de não conformidade por item.</p>';

  // aptos mais reprovados
  const aptoReprovCnt = {};
  checklists.filter(h=>h.resultado==='reprovado'||h.resultado==='nao_conforme')
    .forEach(h=>{ aptoReprovCnt[h.apartment_id]=(aptoReprovCnt[h.apartment_id]||0)+1; });
  const aptosHtml = Object.entries(aptoReprovCnt).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([id,n])=>
    `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border2);">
      <span>Apto ${_relAptoNum(id)}</span><span class="badge badge-reprovado">${n}</span>
    </div>`).join('') || '<p style="font-size:12px;color:var(--text3);">—</p>';

  // camareiras com mais reprovações (via maid_id do apto)
  const camReprovCnt = {};
  checklists.filter(h=>h.resultado==='reprovado'||h.resultado==='nao_conforme').forEach(h=>{
    const uid = h.camareira_id || (_relData.aptoById[h.apartment_id]||{}).maid_id;
    if (uid) camReprovCnt[uid]=(camReprovCnt[uid]||0)+1;
  });
  const camHtml = Object.entries(camReprovCnt).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([uid,n])=>
    `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border2);">
      <span>${_relNome(uid)}</span><span class="badge badge-reprovado">${n}</span>
    </div>`).join('') || '<p style="font-size:12px;color:var(--text3);">Sem relação disponível.</p>';

  const rows = checklists.slice(0,200).map(h=>{
    const apto = _relData.aptoById[h.apartment_id];
    const camUid = h.camareira_id || (apto&&apto.maid_id);
    return [
      _fmtDt(h.created_at),
      apto ? (apto.numero||h.apartment_id) : (h.apartment_id||'—'),
      camUid ? _relNome(camUid) : '—',
      _relNome(h.user_id),
      h.item||'—',
      h.resposta||'—',
      h.observacao||'—',
      h.resultado||'—',
    ];
  });

  // retrabalhos associados a aptos reprovados
  const retrabPorApto = {};
  retrabalhos.forEach(r=>{ retrabPorApto[r.apartment_id]=(retrabPorApto[r.apartment_id]||0)+1; });

  el.innerHTML = `
    <div class="stats-grid" style="margin-bottom:16px;">
      ${_relCard('Conferências realizadas',''+total,'','s-blue')}
      ${_relCard('Aprovações',''+aprovados,'','s-green')}
      ${_relCard('Reprovações',''+reprovados,'','s-red')}
      ${total?_relCard('Taxa de reprovação',taxaPct+'%','','s-purple'):''}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px;">
      <div class="card"><div class="card-title" style="margin-bottom:10px;">Itens mais reprovados</div>${itensHtml}</div>
      <div class="card"><div class="card-title" style="margin-bottom:10px;">Aptos com mais reprovações</div>${aptosHtml}</div>
      <div class="card"><div class="card-title" style="margin-bottom:10px;">Camareiras com mais reprovações</div>${camHtml}</div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:10px;">Conferências (${checklists.length})</div>
      ${total
        ? _relTable(['Data','Apto','Camareira','Conferente','Item','Resposta','Obs','Resultado'], rows)
        : '<p style="font-size:12px;color:var(--text3);">Nenhuma conferência registrada.</p>'}
    </div>`;
}

// ── ABA: Checklists ──────────────────────────────────────────────

function _relAbaChecklists(el) {
  const checklists = _relCheckFilter();
  const total    = checklists.length;
  const aprovados= checklists.filter(h=>h.resultado==='aprovado'||h.resultado==='conforme').length;
  const nc       = checklists.filter(h=>h.resultado==='reprovado'||h.resultado==='nao_conforme').length;

  // itens mais reprovados
  const itensCnt = {};
  checklists.filter(h=>h.resultado==='reprovado'||h.resultado==='nao_conforme')
    .forEach(h=>{ if(h.item) itensCnt[h.item]=(itensCnt[h.item]||0)+1; });
  const itensHtml = Object.entries(itensCnt).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([item,n])=>
    `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border2);">
      <span>${item}</span><span class="badge badge-reprovado">${n}</span>
    </div>`).join('') || '<p style="font-size:12px;color:var(--text3);">Sem registros de não conformidade.</p>';

  const rows = checklists.slice(0,200).map(h=>[
    _fmtDt(h.created_at),
    _relAptoNum(h.apartment_id),
    h.item||'—',
    h.resposta||'—',
    h.observacao||'—',
    h.resultado||'—',
    _relNome(h.user_id),
  ]);

  el.innerHTML = `
    <!-- A: Conferência da Supervisora/Gestora -->
    <div class="card" style="margin-bottom:16px;">
      <div class="card-title" style="margin-bottom:12px;">A. Checklist de Conferência — Supervisora / Gestora</div>
      <div class="stats-grid" style="margin-bottom:14px;">
        ${_relCard('Checklists preenchidos',''+total,'','s-blue')}
        ${_relCard('Aprovados',''+aprovados,'','s-green')}
        ${_relCard('Com não conformidade',''+nc,'','s-red')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 2fr;gap:16px;margin-bottom:14px;">
        <div><div style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--text2);">Itens mais reprovados</div>${itensHtml}</div>
        <div>
          ${_relTable(['Data','Apto','Item','Resposta','Obs','Resultado','Usuário'], rows)}
        </div>
      </div>
    </div>

    <!-- B: Checklist de Limpeza da Camareira -->
    <div class="card">
      <div class="card-title" style="margin-bottom:10px;">B. Checklist de Limpeza — Camareira</div>
      <div style="background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--radius-sm);
                  padding:14px 16px;font-size:13px;color:var(--text2);">
        ℹ️ Relatório de checklist de limpeza por apartamento indisponível porque o sistema ainda não grava respostas
        do checklist de limpeza por apartamento.
      </div>
    </div>`;
}

// ── ABA: Retrabalhos ─────────────────────────────────────────────

function _relAbaRetrabalhos(el) {
  const retrabalhos = _relRetrabFilter();

  const abertos    = retrabalhos.filter(r=>!r.status||r.status==='aberto').length;
  const concluidos = retrabalhos.filter(r=>r.status==='concluido'||r.status==='resolvido').length;

  // motivos mais comuns
  const motivoCnt = {};
  retrabalhos.forEach(r=>{ if(r.motivo) motivoCnt[r.motivo]=(motivoCnt[r.motivo]||0)+1; });
  const motivoHtml = Object.entries(motivoCnt).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([m,n])=>
    `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border2);">
      <span>${m}</span><span class="badge badge-andamento">${n}</span>
    </div>`).join('') || '<p style="font-size:12px;color:var(--text3);">—</p>';

  // aptos com mais retrabalho
  const aptoCnt = {};
  retrabalhos.forEach(r=>{ aptoCnt[r.apartment_id]=(aptoCnt[r.apartment_id]||0)+1; });
  const aptoHtml = Object.entries(aptoCnt).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([id,n])=>
    `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border2);">
      <span>Apto ${_relAptoNum(id)}</span><span class="badge badge-andamento">${n}</span>
    </div>`).join('') || '<p style="font-size:12px;color:var(--text3);">—</p>';

  const rows = retrabalhos.slice(0,200).map(r=>{
    const apto   = _relData.aptoById[r.apartment_id];
    const camUid = apto&&apto.maid_id;
    return [
      _fmtDt(r.created_at),
      apto ? (apto.numero||r.apartment_id) : (r.apartment_id||'—'),
      r.motivo||'—',
      r.obs||'—',
      r.status||'aberto',
      camUid ? _relNome(camUid) : '—',
      _relNome(r.criado_por),
      r.updated_at&&r.status&&(r.status==='concluido'||r.status==='resolvido') ? _fmtDt(r.updated_at) : '—',
    ];
  });

  el.innerHTML = `
    <div class="stats-grid" style="margin-bottom:16px;">
      ${_relCard('Retrabalhos abertos',''+abertos,'','s-orange')}
      ${_relCard('Concluídos',''+concluidos,'','s-green')}
      ${_relCard('Total',''+retrabalhos.length,'no período','s-blue')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
      <div class="card"><div class="card-title" style="margin-bottom:10px;">Motivos mais comuns</div>${motivoHtml}</div>
      <div class="card"><div class="card-title" style="margin-bottom:10px;">Aptos com mais retrabalho</div>${aptoHtml}</div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:10px;">Retrabalhos (${retrabalhos.length})</div>
      ${_relTable(['Data abertura','Apto','Motivo','Obs','Status','Camareira','Aberto por','Data conclusão'], rows)}
    </div>`;
}

// ── ABA: Equipe ──────────────────────────────────────────────────

function _relAbaEquipe(el) {
  const { equipe, aptos } = _relData;
  const f = _relFiltros;

  let lista = equipe;
  if (f.camareira) lista = lista.filter(u=>u.user_id===f.camareira);

  const rows = lista.sort((a,b)=>a.nome.localeCompare(b.nome)).map(u=>[
    u.nome,
    u.perfil,
    u.ativo?'Ativo':'Inativo',
    aptos.filter(a=>a.maid_id===u.user_id).length,
  ]);

  const perfilCnt = {};
  equipe.forEach(u=>{ perfilCnt[u.perfil]=(perfilCnt[u.perfil]||0)+1; });
  const distHtml = Object.entries(perfilCnt).sort((a,b)=>b[1]-a[1]).map(([p,c])=>
    `<div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:1px solid var(--border2);">
      <span>${p}</span><span style="font-weight:700;">${c}</span>
    </div>`).join('');

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 2fr;gap:16px;align-items:start;">
      <div class="card">
        <div class="card-title" style="margin-bottom:10px;">Por perfil (${equipe.length} ativos)</div>
        ${distHtml||'<p style="font-size:12px;color:var(--text3);">Sem dados.</p>'}
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
