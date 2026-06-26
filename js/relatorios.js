// ================================================================
// RELATÓRIOS SERVICE — GovHotel  v20260616e
// Dados reais do Supabase. Sem mocks, sem exports, sem financeiro.
// ================================================================

let _relHotelId = null;
let _relAba     = 'executivo';
let _relData    = null;
let _relFiltros = { dtIni:'', dtFim:'', andar:'', camareira:'', status:'', apto:'', tipo:'', prioridade:'', situacaoPausa:'' };

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

// ── Seletor de hotel ─────────────────────────────────────────────

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
  wrap.innerHTML = `<div class="card" style="padding:10px 16px;margin-bottom:16px;">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
      <span style="font-size:13px;font-weight:600;color:var(--text2);">🏨 Hotel:</span>
      <select id="rel-hotel-select"
        style="flex:1;min-width:200px;padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;"
        onchange="_selecionarHotelRel(this.value)">
        <option value="">Selecione um hotel...</option>
        ${(hotels||[]).map(h=>`<option value="${h.id}" ${h.id===_relHotelId?'selected':''}>${h.nome}</option>`).join('')}
      </select>
    </div></div>`;
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

// ── Expansão do checklist de conferência (JSONB → linhas) ────────
// Cada sessão vira N linhas (uma por item). Cada linha carrega:
//   _sessionId, resultado (sessão), item, resposta, observacao, user_id, created_at
// Suporta dois formatos do campo respostas:
//   objeto: { [nome]: { valor: 'ok'|'nao', obs: '' } }  ← formato atual
//   array:  [ { item, resposta, obs } ]                  ← formato legado
function _expandConfChecklists(raw) {
  const out = [];
  (raw || []).forEach(r => {
    const resultadoNorm = r.resultado === 'aprovar' ? 'aprovado'
      : r.resultado === 'reprovar' ? 'reprovado'
      : r.resultado === 'aprovado' ? 'aprovado'
      : r.resultado === 'reprovado' ? 'reprovado'
      : (r.resultado || 'aprovado');

    const respostas = r.respostas;

    // Formato array (legado): [{ item, resposta, obs }]
    if (Array.isArray(respostas)) {
      if (!respostas.length) {
        out.push({ _sessionId: r.id, apartment_id: r.apartment_id, item: null,
          resposta: null, observacao: r.obs || null,
          resultado: resultadoNorm, user_id: r.usuario_id, created_at: r.created_at });
      } else {
        respostas.forEach(item => {
          const val = item.resposta || item.valor || '';
          out.push({ _sessionId: r.id, apartment_id: r.apartment_id, item: item.item || null,
            resposta: val === 'ok' || val === 'conforme' ? 'Conforme'
              : val === 'nao' || val === 'nao_conforme' ? 'Não conforme' : 'N/A',
            observacao: item.obs || item.observacao || null,
            resultado: resultadoNorm, user_id: r.usuario_id, created_at: r.created_at });
        });
      }
      return;
    }

    // Formato objeto (atual): { [nome]: { valor, obs } }
    const entries = respostas && typeof respostas === 'object' ? Object.entries(respostas) : [];
    if (!entries.length) {
      out.push({ _sessionId: r.id, apartment_id: r.apartment_id, item: null,
        resposta: null, observacao: r.obs || null,
        resultado: resultadoNorm, user_id: r.usuario_id, created_at: r.created_at });
    } else {
      entries.forEach(([nome, dados]) => {
        const val = (dados && dados.valor) || '';
        out.push({ _sessionId: r.id, apartment_id: r.apartment_id, item: nome,
          resposta: val === 'ok' ? 'Conforme' : val === 'nao' ? 'Não conforme' : 'N/A',
          observacao: (dados && dados.obs) || null,
          resultado: resultadoNorm, user_id: r.usuario_id, created_at: r.created_at });
      });
    }
  });
  return out;
}

// ── Carga de dados ───────────────────────────────────────────────

async function _relCarregarDados(hotelId) {
  const conteudo = document.getElementById('rel-conteudo');
  if (conteudo) conteudo.innerHTML =
    `<div style="padding:32px;text-align:center;color:var(--text3);font-size:13px;">⏳ Carregando dados...</div>`;

  const [aptosRes, chamadosRes, retrabRes, equipeRes, historyRes, confCheckRes, limpCheckRes, configRes, limpSessoesRes] = await Promise.all([
    supabaseClient.from('apartments')
      .select('id, numero, andar, tipo, status, maid_id, updated_at')
      .eq('hotel_id', hotelId).eq('ativo', true),
    supabaseClient.from('work_orders')
      .select('id, numero, tipo, status, departamento, prioridade, apartment_id, responsavel_user_id, prazo, resolved_at, resolved_by, created_at, updated_at')
      .eq('hotel_id', hotelId).order('created_at', { ascending: false }),
    supabaseClient.from('pendencias_retrabalho')
      .select('id, apartment_id, motivo, obs, status, criado_por, resolvido_por, resolvido_at, created_at')
      .eq('hotel_id', hotelId).order('created_at', { ascending: false }),
    supabaseClient.from('user_profiles')
      .select('user_id, nome, perfil, ativo').eq('hotel_id', hotelId),
    supabaseClient.from('apartment_status_history')
      .select('id, apartment_id, status_anterior, status_novo, alterado_por, obs, created_at')
      .order('created_at', { ascending: false }).limit(5000),
    supabaseClient.from('conferencia_supervisora_checklists')
      .select('id, apartment_id, respostas, obs, resultado, usuario_id, created_at')
      .eq('hotel_id', hotelId).order('created_at', { ascending: false }).limit(3000),
    supabaseClient.from('limpeza_checklists')
      .select('id, apartment_id, usuario_id, tipo_limpeza, respostas, obs_geral, created_at')
      .eq('hotel_id', hotelId).order('created_at', { ascending: false }).limit(2000),
    supabaseClient.from('hotel_config')
      .select('chave, valor').eq('hotel_id', hotelId)
      .in('chave', ['tempo_padrao_saida', 'tempo_padrao_permanencia', 'tempo_padrao_pos_manutencao']),
    supabaseClient.from('limpeza_sessoes')
      .select('id, apartment_id, camareira_id, tipo_limpeza, inicio_at, fim_at, obs, created_at')
      .eq('hotel_id', hotelId).order('inicio_at', { ascending: false }).limit(3000),
  ]);

  // Logar erros de cada query para facilitar diagnóstico no console
  const _queryErros = [];
  if (aptosRes.error)      _queryErros.push('apartments: ' + aptosRes.error.message);
  if (chamadosRes.error)   _queryErros.push('work_orders: ' + chamadosRes.error.message);
  if (retrabRes.error)     _queryErros.push('pendencias_retrabalho: ' + retrabRes.error.message);
  if (equipeRes.error)     _queryErros.push('user_profiles: ' + equipeRes.error.message);
  if (historyRes.error)    _queryErros.push('apartment_status_history: ' + historyRes.error.message);
  if (confCheckRes.error)  _queryErros.push('conferencia_supervisora_checklists: ' + confCheckRes.error.message);
  if (limpCheckRes.error)  _queryErros.push('limpeza_checklists: ' + limpCheckRes.error.message);
  if (configRes.error)       _queryErros.push('hotel_config: ' + configRes.error.message);
  if (limpSessoesRes.error)  _queryErros.push('limpeza_sessoes: ' + limpSessoesRes.error.message);
  if (_queryErros.length)    console.warn('[Relatórios] Erros nas queries:\n' + _queryErros.join('\n'));

  const aptos         = aptosRes.data       || [];
  const chamados      = chamadosRes.data    || [];
  const retrabalhos   = retrabRes.data      || [];
  const equipe        = equipeRes.data      || [];
  // Filtrar history pelos apartment_ids do hotel (necessário para admin_global que recebe tudo via RLS ALL)
  const _aptoIdsSet   = new Set(aptos.map(a => a.id));
  const history       = (historyRes.data || []).filter(h => _aptoIdsSet.has(h.apartment_id));
  const confChecklists= confCheckRes.error  ? [] : _expandConfChecklists(confCheckRes.data || []);
  const limpChecklists= limpCheckRes.error  ? [] : (limpCheckRes.data || []);
  const configMap     = Object.fromEntries((configRes.data || []).map(r => [r.chave, parseInt(r.valor) || 0]));
  const parametros    = {
    tempo_saida:          configMap['tempo_padrao_saida']           || 45,
    tempo_permanencia:    configMap['tempo_padrao_permanencia']     || 25,
    tempo_pos_manutencao: configMap['tempo_padrao_pos_manutencao']  || 30,
  };
  const limpezaSessoes = limpSessoesRes.data || [];

  console.log('[Relatórios] Dados carregados:', {
    aptos: aptos.length, chamados: chamados.length, retrabalhos: retrabalhos.length,
    equipe: equipe.length, history: history.length,
    confChecklists: confChecklists.length, limpChecklists: limpChecklists.length,
    limpezaSessoes: limpezaSessoes.length, erros: _queryErros.length,
  });

  const userNames = {};
  equipe.forEach(u => { userNames[u.user_id] = u.nome; });
  const aptoById = {};
  aptos.forEach(a => { aptoById[a.id] = a; });

  // Resolve nomes de usuários do histórico não encontrados na equipe do hotel
  // (ex: admin_global que não tem hotel_id, usuários de outros hotéis)
  const uidsNaoResolvidos = [...new Set(
    history.filter(h => h.alterado_por && !userNames[h.alterado_por]).map(h => h.alterado_por)
  )];
  if (uidsNaoResolvidos.length) {
    const { data: extraUsers } = await supabaseClient
      .from('user_profiles').select('user_id, nome').in('user_id', uidsNaoResolvidos);
    (extraUsers || []).forEach(u => { userNames[u.user_id] = u.nome; });
  }

  // Sessões de limpeza calculadas do histórico
  const sessoes = _relCalcSessoes(history, aptoById);
  console.log('[Relatórios] Sessões calculadas:', sessoes.length, '— com tempo:', sessoes.filter(s=>s.durBruta!=null).length);

  // Alertar no UI se dados críticos estão faltando (provável erro de banco)
  const avisos = [];
  if (historyRes.error)   avisos.push('Histórico de status indisponível (verifique console)');
  if (limpCheckRes.error) avisos.push('Checklists de limpeza indisponíveis (verifique console)');
  if (confCheckRes.error) avisos.push('Conferências de supervisora indisponíveis (verifique console)');

  _relData    = { aptos, chamados, retrabalhos, equipe, history, confChecklists, limpChecklists, limpezaSessoes, userNames, aptoById, sessoes, parametros, avisos };
  _relFiltros = { dtIni:'', dtFim:'', andar:'', camareira:'', status:'', apto:'', tipo:'', prioridade:'', situacaoPausa:'' };

  _relRenderShell();
  _relAbrirAba(_relAba);
}

// ── Calcular sessões de limpeza a partir do histórico ───────────

function _relCalcSessoes(history, aptoById) {
  const byApto = {};
  history.forEach(h => {
    if (!byApto[h.apartment_id]) byApto[h.apartment_id] = [];
    byApto[h.apartment_id].push(h);
  });
  Object.values(byApto).forEach(arr => arr.sort((a,b) => a.created_at.localeCompare(b.created_at)));

  const sessoes = [];
  Object.entries(byApto).forEach(([aptoId, events]) => {
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e.status_novo !== 'limpando') continue;
      const s = { aptoId, inicio: e.created_at, camareira_id: e.alterado_por,
        fim: null, statusFinal: null, pausas: [], retomadas: [],
        durBruta: null, durPausada: null, durLiquida: null };

      for (let j = i + 1; j < events.length; j++) {
        const ne = events[j];
        if (ne.status_novo === 'pausado') {
          s.pausas.push(ne.created_at);
        } else if (ne.status_novo === 'limpando' && s.pausas.length > s.retomadas.length) {
          s.retomadas.push(ne.created_at);
        } else if (!['limpando','pausado'].includes(ne.status_novo)) {
          s.fim = ne.created_at; s.statusFinal = ne.status_novo; break;
        }
      }

      if (s.inicio && s.fim) {
        s.durBruta = new Date(s.fim) - new Date(s.inicio);
        let pauseMs = 0;
        s.pausas.forEach((p, idx) => { if (s.retomadas[idx]) pauseMs += new Date(s.retomadas[idx]) - new Date(p); });
        s.durPausada  = pauseMs;
        s.durLiquida  = s.durBruta - pauseMs;
      }
      sessoes.push(s);
    }
  });
  return sessoes;
}

// ── Shell com abas e filtros ─────────────────────────────────────

function _relRenderShell() {
  const c = document.getElementById('rel-conteudo');
  if (!c) return;

  const abas = [
    { id:'executivo',       label:'🏆 Executivo' },
    { id:'gargalos',        label:'⚠️ Gargalos' },
    { id:'resumo',          label:'📋 Resumo' },
    { id:'status',          label:'🏠 Status' },
    { id:'sem-resp',        label:'👤 Sem Resp.' },
    { id:'tempo-limpeza',   label:'⏱ Tempo Arrumação' },
    { id:'produtividade',   label:'📊 Produtividade' },
    { id:'qualidade',       label:'✅ Qualidade' },
    { id:'checklists',      label:'📝 Checklists' },
    { id:'chamados',        label:'📞 Chamados' },
    { id:'timeline',        label:'📅 Linha do Tempo' },
    { id:'retrabalhos',     label:'🔁 Retrabalhos' },
    { id:'equipe',          label:'👥 Equipe' },
    { id:'pausas',          label:'⏸ Pausas' },
    { id:'discrepancia',    label:'🔴 Discrepância' },
    { id:'limpezas-camareira', label:'🧹 Limpezas/Camareira' },
  ];

  const { aptos, equipe, chamados, avisos } = _relData;
  const andares    = [...new Set(aptos.map(a=>a.andar).filter(v=>v!=null))].sort((a,b)=>a-b);
  const camareiras = equipe.filter(u=>u.perfil==='camareira');
  const statusList = ['sujo','limpando','pausado','conferencia','limpo','reprovado','vago','ocupado','bloqueado','manutencao'];
  const tipoList   = [...new Set(chamados.map(c=>c.tipo).filter(Boolean))].sort();
  const prioList   = [...new Set(chamados.map(c=>c.prioridade).filter(Boolean))].sort();

  const avisoBanner = (avisos && avisos.length)
    ? `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:12px;font-size:12px;color:#856404;">
        ⚠️ <strong>Atenção:</strong> Alguns dados não foram carregados. Abra o Console do navegador (F12 → Console) para ver o detalhe dos erros.<br>
        ${avisos.map(a=>`• ${a}`).join('<br>')}
       </div>`
    : '';

  c.innerHTML = `${avisoBanner}
    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:16px;">
      ${abas.map(a=>`<button id="rel-tab-${a.id}" class="btn btn-sm ${_relAba===a.id?'btn-primary':'btn-outline'}"
        onclick="_relAbrirAba('${a.id}')">${a.label}</button>`).join('')}
    </div>
    <div class="card" style="padding:12px 16px;margin-bottom:16px;">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
        ${_rFI('date','rel-f-dtini','De',_relFiltros.dtIni,"_relFiltro('dtIni',this.value)",'110px')}
        ${_rFI('date','rel-f-dtfim','Até',_relFiltros.dtFim,"_relFiltro('dtFim',this.value)",'110px')}
        ${_rFS('rel-f-andar','Andar',andares.map(a=>({v:a,l:a+'º'})),_relFiltros.andar,"_relFiltro('andar',this.value)")}
        ${_rFS('rel-f-cam','Camareira',camareiras.map(u=>({v:u.user_id,l:u.nome})),_relFiltros.camareira,"_relFiltro('camareira',this.value)")}
        ${_rFS('rel-f-status','Status',statusList.map(s=>({v:s,l:s})),_relFiltros.status,"_relFiltro('status',this.value)")}
        ${_rFS('rel-f-tipo','Tipo chamado',tipoList.map(t=>({v:t,l:t})),_relFiltros.tipo,"_relFiltro('tipo',this.value)")}
        ${_rFS('rel-f-prio','Prioridade',prioList.map(p=>({v:p,l:p})),_relFiltros.prioridade,"_relFiltro('prioridade',this.value)")}
        ${_rFI('text','rel-f-apto','Apto',_relFiltros.apto,"_relFiltro('apto',this.value)",'75px','oninput')}
        <button class="btn btn-ghost btn-sm" onclick="_relLimparFiltros()">✕ Limpar</button>
      </div>
    </div>
    <div id="rel-aba-conteudo"></div>`;
}

function _rFI(type,id,label,val,onev,width='120px',evt='onchange') {
  return `<div style="display:flex;flex-direction:column;gap:3px;">
    <label style="font-size:11px;color:var(--text3);">${label}</label>
    <input type="${type}" id="${id}" value="${val}" ${evt}="${onev}"
      style="padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:12px;width:${width};">
  </div>`;
}
function _rFS(id,label,opts,val,onev) {
  return `<div style="display:flex;flex-direction:column;gap:3px;">
    <label style="font-size:11px;color:var(--text3);">${label}</label>
    <select id="${id}" onchange="${onev}"
      style="padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:12px;">
      <option value="">Todos</option>
      ${opts.map(o=>`<option value="${o.v}" ${String(val)===String(o.v)?'selected':''}>${o.l}</option>`).join('')}
    </select>
  </div>`;
}

function _relFiltro(campo, valor) { _relFiltros[campo] = valor; _relAbrirAba(_relAba); }

function _relLimparFiltros() {
  _relFiltros = { dtIni:'', dtFim:'', andar:'', camareira:'', status:'', apto:'', tipo:'', prioridade:'', situacaoPausa:'' };
  _relRenderShell(); _relAbrirAba(_relAba);
}

const _REL_ABAS = ['executivo','gargalos','resumo','status','sem-resp','tempo-limpeza',
  'produtividade','qualidade','checklists','chamados','timeline','retrabalhos','equipe','pausas','discrepancia',
  'limpezas-camareira'];

function _relAbrirAba(id) {
  _relAba = id;
  _REL_ABAS.forEach(a => {
    const btn = document.getElementById('rel-tab-' + a);
    if (btn) btn.className = 'btn btn-sm ' + (a === id ? 'btn-primary' : 'btn-outline');
  });
  const el = document.getElementById('rel-aba-conteudo');
  if (!el) return;
  const map = {
    executivo: _relAbaExecutivo, gargalos: _relAbaGargalos, resumo: _relAbaResumo,
    status: _relAbaStatus, 'sem-resp': _relAbaSemResp, 'tempo-limpeza': _relAbaTempoLimpeza,
    produtividade: _relAbaProdutividade, qualidade: _relAbaQualidade, checklists: _relAbaChecklists,
    chamados: _relAbaChamados, timeline: _relAbaTimeline, retrabalhos: _relAbaRetrabalhos,
    equipe: _relAbaEquipe, pausas: _relAbaPausas, discrepancia: _relAbaDiscrepancia,
    'limpezas-camareira': _relAbaLimpezasCamareira,
  };
  if (map[id]) map[id](el);
}

// ── Filtros em memória ───────────────────────────────────────────

function _fApto(arr) {
  const f = _relFiltros;
  return arr.filter(a => {
    if (f.andar    && String(a.andar)  !== String(f.andar))   return false;
    if (f.camareira && a.maid_id       !== f.camareira)        return false;
    if (f.status   && a.status         !== f.status)           return false;
    if (f.apto     && !String(a.numero||'').toLowerCase().includes(f.apto.toLowerCase())) return false;
    return true;
  });
}
function _fHist(arr) {
  const f = _relFiltros;
  return arr.filter(h => {
    if (f.dtIni    && h.created_at.slice(0,10) < f.dtIni)  return false;
    if (f.dtFim    && h.created_at.slice(0,10) > f.dtFim)  return false;
    if (f.camareira && h.alterado_por !== f.camareira)       return false;
    if (f.apto) { const a = _relData.aptoById[h.apartment_id]; if (!a||!String(a.numero||'').toLowerCase().includes(f.apto.toLowerCase())) return false; }
    return true;
  });
}
function _fCham(arr) {
  const f = _relFiltros;
  return arr.filter(c => {
    if (f.dtIni    && c.created_at.slice(0,10) < f.dtIni)  return false;
    if (f.dtFim    && c.created_at.slice(0,10) > f.dtFim)  return false;
    if (f.tipo     && c.tipo       !== f.tipo)               return false;
    if (f.prioridade && c.prioridade !== f.prioridade)       return false;
    if (f.apto) { const a = _relData.aptoById[c.apartment_id]; if (!a||!String(a.numero||'').toLowerCase().includes(f.apto.toLowerCase())) return false; }
    return true;
  });
}
function _fRetrab(arr) {
  const f = _relFiltros;
  return arr.filter(r => {
    if (f.dtIni && r.created_at.slice(0,10) < f.dtIni) return false;
    if (f.dtFim && r.created_at.slice(0,10) > f.dtFim) return false;
    if (f.apto) { const a = _relData.aptoById[r.apartment_id]; if (!a||!String(a.numero||'').toLowerCase().includes(f.apto.toLowerCase())) return false; }
    if (f.andar) { const a = _relData.aptoById[r.apartment_id]; if (!a||String(a.andar)!==String(f.andar)) return false; }
    if (f.camareira) {
      // Tenta encontrar quem fez a limpeza pelo limpeza_checklist anterior à reprovação (até 4h antes)
      const retTs = new Date(r.created_at).getTime();
      const limpMatch = _relData.limpChecklists.find(c =>
        c.apartment_id === r.apartment_id &&
        c.usuario_id === f.camareira &&
        retTs - new Date(c.created_at).getTime() >= 0 &&
        retTs - new Date(c.created_at).getTime() <= 4 * 60 * 60 * 1000
      );
      // Fallback: usa maid_id atual do apto
      const a = _relData.aptoById[r.apartment_id];
      if (!limpMatch && (!a || a.maid_id !== f.camareira)) return false;
    }
    return true;
  });
}
function _fCheck(arr) {
  const f = _relFiltros;
  return arr.filter(h => {
    if (f.dtIni && h.created_at.slice(0,10) < f.dtIni) return false;
    if (f.dtFim && h.created_at.slice(0,10) > f.dtFim) return false;
    if (f.apto) { const a = _relData.aptoById[h.apartment_id]; if (!a||!String(a.numero||'').toLowerCase().includes(f.apto.toLowerCase())) return false; }
    if (f.andar) { const a = _relData.aptoById[h.apartment_id]; if (!a||String(a.andar)!==String(f.andar)) return false; }
    if (f.camareira) { const a = _relData.aptoById[h.apartment_id]; if (!a||a.maid_id!==f.camareira) return false; }
    return true;
  });
}
function _fSessoes(arr) {
  const f = _relFiltros;
  return arr.filter(s => {
    if (f.dtIni && s.inicio.slice(0,10) < f.dtIni) return false;
    if (f.dtFim && s.inicio.slice(0,10) > f.dtFim) return false;
    if (f.camareira && s.camareira_id !== f.camareira) return false;
    if (f.apto) { const a = _relData.aptoById[s.aptoId]; if (!a||!String(a.numero||'').toLowerCase().includes(f.apto.toLowerCase())) return false; }
    if (f.andar) { const a = _relData.aptoById[s.aptoId]; if (!a||String(a.andar)!==String(f.andar)) return false; }
    return true;
  });
}

// ── Utilitários ──────────────────────────────────────────────────

const _hoje = new Date().toISOString().slice(0,10);

function _fmtDt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso.slice(0,10).split('-').reverse().join('/');
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function _fmtDur(ms) {
  if (ms == null || ms < 0) return '—';
  const m = Math.round(ms / 60000);
  if (m < 60) return m + 'min';
  return Math.floor(m/60) + 'h ' + (m%60) + 'min';
}
function _isAtrasado(c) {
  if (!c.prazo) return false;
  return c.prazo.slice(0,10) < _hoje && !['resolvido','concluido','cancelado'].includes((c.status||''));
}
function _relNome(uid) { if (!uid) return '—'; return _relData.userNames[uid] || uid.slice(0,8) + '...'; }
function _relAptoNum(id) { const a = _relData.aptoById[id]; return a ? (a.numero||id) : (id||'—'); }
function _relAptoAndar(id) { const a = _relData.aptoById[id]; return a && a.andar!=null ? a.andar+'º' : '—'; }

function _relCard(label, value, sub, cls='s-blue') {
  return `<div class="stat-card ${cls}">
    <div class="stat-label">${label}</div>
    <div class="stat-value">${value??'—'}</div>
    ${sub?`<div class="stat-sub">${sub}</div>`:''}
  </div>`;
}
function _relTable(cols, rows, cap=200) {
  if (!rows.length) return `<p style="font-size:12px;color:var(--text3);padding:8px 0;">Sem dados no período.</p>`;
  const shown = rows.slice(0, cap);
  return `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead><tr>${cols.map(c=>`<th style="text-align:left;padding:6px 8px;border-bottom:2px solid var(--border);color:var(--text2);white-space:nowrap;">${c}</th>`).join('')}</tr></thead>
    <tbody>${shown.map(r=>`<tr style="border-bottom:1px solid var(--border2);">${r.map(v=>`<td style="padding:6px 8px;vertical-align:top;">${v??'—'}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>${rows.length>cap?`<p style="font-size:11px;color:var(--text3);margin-top:6px;">Exibindo ${cap} de ${rows.length} registros.</p>`:''}</div>`;
}
function _rankList(cnt, badgeCls='badge-andamento', limit=10) {
  const items = Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,limit);
  if (!items.length) return `<p style="font-size:12px;color:var(--text3);">—</p>`;
  return items.map(([k,n])=>`<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border2);">
    <span>${k}</span><span class="badge ${badgeCls}">${n}</span></div>`).join('');
}

// ── 1. EXECUTIVO ─────────────────────────────────────────────────

function _relAbaExecutivo(el) {
  const aptos      = _fApto(_relData.aptos);
  const chamados   = _fCham(_relData.chamados);
  const retrabalhos= _fRetrab(_relData.retrabalhos);
  const confChecks = _fCheck(_relData.confChecklists);
  const sessoes    = _fSessoes(_relData.sessoes);
  const camareiras = _relData.equipe.filter(u=>u.perfil==='camareira');

  const total       = aptos.length;
  const limpos      = aptos.filter(a=>a.status==='limpo').length;
  const sujos       = aptos.filter(a=>a.status==='sujo').length;
  const conferencia = aptos.filter(a=>a.status==='conferencia').length;
  const semCam      = aptos.filter(a=>!a.maid_id).length;
  const chamAbertos = chamados.filter(c=>c.status==='aberto').length;
  const chamAtras   = chamados.filter(c=>_isAtrasado(c)).length;
  const retAbertos  = retrabalhos.filter(r=>!r.status||r.status==='aberto'||r.status==='aberta').length;

  const sessConcluidas = sessoes.filter(s=>['conferencia','limpo','vago'].includes(s.statusFinal));
  let tmBruto = '—';
  if (sessConcluidas.length) {
    const avg = sessConcluidas.reduce((s,x)=>s+(x.durBruta||0),0) / sessConcluidas.length;
    tmBruto = _fmtDur(avg);
  }

  let txAprov = '—', txReprov = '—';
  if (confChecks.length) {
    const aprov  = confChecks.filter(h=>h.resultado==='aprovado'||h.resultado==='conforme').length;
    const reprov = confChecks.filter(h=>h.resultado==='reprovado'||h.resultado==='nao_conforme').length;
    const tot    = aprov + reprov;
    if (tot) { txAprov = Math.round(aprov/tot*100)+'%'; txReprov = Math.round(reprov/tot*100)+'%'; }
  }

  const retrabTotal = retrabalhos.length;
  const txRetrab = (sessConcluidas.length && retrabTotal)
    ? Math.round(retrabTotal/sessConcluidas.length*100)+'%' : '—';

  let tmChamados = '—';
  const chamRes = chamados.filter(c=>c.resolved_at&&c.created_at);
  if (chamRes.length) {
    const avg = chamRes.reduce((s,c)=>s+(new Date(c.resolved_at)-new Date(c.created_at)),0)/chamRes.length;
    tmChamados = _fmtDur(avg);
  }

  el.innerHTML = `<div class="stats-grid">
    ${_relCard('Total de apartamentos', total, 'unidades ativas','s-blue')}
    ${_relCard('Limpos', limpos, `de ${total}`,'s-green')}
    ${_relCard('Sujos', sujos, 'aguardando limpeza','s-orange')}
    ${_relCard('Arrumação', conferencia, '','s-purple')}
    ${_relCard('Sem camareira', semCam, '','s-gray')}
    ${_relCard('Arrumações concluídas', sessConcluidas.length, 'no período','s-green')}
    ${tmBruto!=='—'?_relCard('Tempo médio de arrumação', tmBruto, 'bruto','s-blue'):''}
    ${txAprov!=='—'?_relCard('Taxa de aprovação', txAprov, '','s-green'):''}
    ${txReprov!=='—'?_relCard('Taxa de reprovação', txReprov, '','s-red'):''}
    ${txRetrab!=='—'?_relCard('Taxa de retrabalho', txRetrab, '','s-orange'):''}
    ${_relCard('Chamados abertos', chamAbertos, `de ${chamados.length}`,'s-orange')}
    ${chamAtras?_relCard('Chamados atrasados', chamAtras, 'prazo vencido','s-red'):''}
    ${tmChamados!=='—'?_relCard('Tempo médio resolução', tmChamados, '','s-blue'):''}
    ${_relCard('Retrabalhos abertos', retAbertos, '','s-red')}
    ${_relCard('Camareiras ativas', camareiras.length, '','s-green')}
  </div>`;
}

// ── 2. GARGALOS ──────────────────────────────────────────────────

function _relAbaGargalos(el) {
  const aptos    = _fApto(_relData.aptos);
  const chamados = _fCham(_relData.chamados);
  const retrab   = _fRetrab(_relData.retrabalhos);
  const { aptoById, userNames } = _relData;
  const agora    = new Date();

  const sujosSemCam  = aptos.filter(a=>a.status==='sujo'&&!a.maid_id);
  const pausados     = aptos.filter(a=>a.status==='pausado');
  const emConf       = aptos.filter(a=>a.status==='conferencia');
  const reprovados   = aptos.filter(a=>a.status==='reprovado');
  const retAbertos   = retrab.filter(r=>!r.status||r.status==='aberto'||r.status==='aberta');
  const chamAtras    = chamados.filter(c=>_isAtrasado(c));
  const chamUrgentes = chamados.filter(c=>c.prioridade==='urgente'&&c.status==='aberto');

  // Limpezas em andamento há mais tempo
  const emLimpando = aptos.filter(a=>a.status==='limpando');
  const limpandoRows = emLimpando.map(a=>{
    const minutos = a.updated_at ? Math.round((agora - new Date(a.updated_at))/60000) : null;
    return {
      tipo: 'Em limpeza',
      apto: a.numero||'—',
      andar: a.andar!=null?a.andar+'º':'—',
      status: a.status,
      cam: a.maid_id ? (userNames[a.maid_id]||'—') : '—',
      tempo: minutos!=null ? (minutos<60?minutos+'min':Math.floor(minutos/60)+'h'+minutos%60+'min') : '—',
      prio: '—',
    };
  }).sort((a,b)=>{ const am=parseInt(a.tempo)||0,bm=parseInt(b.tempo)||0; return bm-am; });

  const buildRows = (list, tipo) => list.map(a=>({
    tipo, apto: a.numero||'—',
    andar: a.andar!=null?a.andar+'º':'—',
    status: a.status,
    cam: a.maid_id?(userNames[a.maid_id]||'—'):'—',
    tempo: a.updated_at ? _fmtDt(a.updated_at) : '—',
    prio: '—',
  }));

  const chamRows = chamAtras.concat(chamUrgentes.filter(c=>!chamAtras.find(x=>x.id===c.id))).map(c=>({
    tipo: _isAtrasado(c)?'Chamado atrasado':'Chamado urgente',
    apto: _relAptoNum(c.apartment_id),
    andar: _relAptoAndar(c.apartment_id),
    status: c.status,
    cam: _relNome(c.responsavel_user_id),
    tempo: c.prazo?c.prazo.slice(0,10).split('-').reverse().join('/'):_fmtDt(c.created_at),
    prio: c.prioridade||'—',
  }));

  const retRows = retAbertos.slice(0,20).map(r=>({
    tipo: 'Retrabalho aberto',
    apto: _relAptoNum(r.apartment_id),
    andar: _relAptoAndar(r.apartment_id),
    status: r.motivo||'—',
    cam: '—', tempo: _fmtDt(r.created_at), prio: '—',
  }));

  const allRows = [
    ...limpandoRows,
    ...buildRows(sujosSemCam,'Sujo sem camareira'),
    ...buildRows(pausados,'Pausado'),
    ...buildRows(emConf,'Arrumação'),
    ...buildRows(reprovados,'Reprovado'),
    ...chamRows, ...retRows,
  ];

  el.innerHTML = `
    <div class="stats-grid" style="margin-bottom:16px;">
      ${_relCard('Sujos sem camareira', sujosSemCam.length, '','s-red')}
      ${_relCard('Em Limpeza', emLimpando.length, '','s-blue')}
      ${_relCard('Pausados', pausados.length, '','s-orange')}
      ${_relCard('Arrumação', emConf.length, '','s-purple')}
      ${_relCard('Reprovados', reprovados.length, '','s-red')}
      ${_relCard('Retrabalhos abertos', retAbertos.length, '','s-orange')}
      ${_relCard('Chamados atrasados', chamAtras.length, '','s-red')}
      ${chamUrgentes.length?_relCard('Chamados urgentes', chamUrgentes.length, 'abertos','s-red'):''}
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:10px;">Gargalos operacionais (${allRows.length})</div>
      ${_relTable(['Tipo','Apto','Andar','Status/Motivo','Camareira/Resp.','Desde/Prazo','Prioridade'],
        allRows.map(r=>[r.tipo,r.apto,r.andar,r.status,r.cam,r.tempo,r.prio]))}
    </div>`;
}

// ── 3. RESUMO OPERACIONAL ────────────────────────────────────────

function _relAbaResumo(el) {
  const { userNames } = _relData;
  const aptos      = _fApto(_relData.aptos);
  const chamados   = _fCham(_relData.chamados);
  const retrabalhos= _fRetrab(_relData.retrabalhos);

  const statusInfo = [
    {key:'sujo',s:'s-orange'},{key:'limpando',s:'s-blue'},{key:'conferencia',s:'s-purple'},
    {key:'limpo',s:'s-green'},{key:'vago',s:'s-green'},{key:'ocupado',s:'s-gray'},
    {key:'bloqueado',s:'s-red'},{key:'manutencao',s:'s-gray'},{key:'pausado',s:'s-orange'},{key:'reprovado',s:'s-red'},
  ];
  const cards = statusInfo.map(s=>_relCard(s.key, aptos.filter(a=>a.status===s.key).length,'',s.s)).join('');

  const chamByApto = {}; chamados.forEach(c=>{ chamByApto[c.apartment_id]=(chamByApto[c.apartment_id]||0)+1; });
  const retByApto  = {}; retrabalhos.forEach(r=>{ retByApto[r.apartment_id]=(retByApto[r.apartment_id]||0)+1; });

  const rows = aptos.sort((a,b)=>{
    return (String(a.andar||0).padStart(4,'0')+String(a.numero||'').padStart(6,'0'))
      .localeCompare(String(b.andar||0).padStart(4,'0')+String(b.numero||'').padStart(6,'0'));
  }).map(a=>[a.numero||'—', a.andar!=null?a.andar+'º':'—',
    `<span class="badge badge-${a.status}">${a.status}</span>`,
    a.maid_id?(userNames[a.maid_id]||'—'):'—', chamByApto[a.id]||0, retByApto[a.id]||0]);

  el.innerHTML = `<div class="stats-grid" style="margin-bottom:16px;">${cards}</div>
    <div class="card">
      <div class="card-title" style="margin-bottom:10px;">Apartamentos (${aptos.length})</div>
      ${_relTable(['Apto','Andar','Status','Camareira','Chamados','Retrabalhos'], rows, 9999)}
    </div>`;
}

// ── 4. STATUS DOS APARTAMENTOS ───────────────────────────────────

function _relAbaStatus(el) {
  const aptos   = _fApto(_relData.aptos);
  const history = _fHist(_relData.history);
  const total   = aptos.length;

  const statusInfo = [
    {key:'vago',label:'Vago',color:'#27ae60'},{key:'sujo',label:'Sujo',color:'#e67e22'},
    {key:'limpando',label:'Em Limpeza',color:'#2e86c1'},{key:'conferencia',label:'Arrumação',color:'#8e44ad'},
    {key:'limpo',label:'Limpo',color:'#1abc9c'},{key:'ocupado',label:'Ocupado',color:'#7f8c8d'},
    {key:'bloqueado',label:'Bloqueado',color:'#c0392b'},{key:'manutencao',label:'Manutenção',color:'#f1c40f'},
    {key:'pausado',label:'Pausado',color:'#f39c12'},{key:'reprovado',label:'Reprovado',color:'#e74c3c'},
  ];
  const dist = statusInfo.map(s=>{
    const cnt = aptos.filter(a=>a.status===s.key).length;
    if (!cnt) return '';
    const pct = total?Math.round(cnt/total*100):0;
    return `<div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px;">
        <span style="color:var(--text2);">${s.label}</span>
        <span style="font-weight:700;">${cnt} <span style="color:var(--text3);">(${pct}%)</span></span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${s.color};"></div></div>
    </div>`;
  }).join('');

  const rows = history.slice(0,200).map(h=>[
    _fmtDt(h.created_at), _relAptoNum(h.apartment_id), _relAptoAndar(h.apartment_id),
    h.status_anterior||'—', h.status_novo||'—', _relNome(h.alterado_por), h.obs||'—',
  ]);

  el.innerHTML = `<div style="display:grid;grid-template-columns:1fr 2fr;gap:16px;align-items:start;">
    <div class="card"><div class="card-title" style="margin-bottom:10px;">Distribuição atual</div>
      ${dist||'<p style="font-size:12px;color:var(--text3);">Nenhum apartamento.</p>'}</div>
    <div class="card"><div class="card-title" style="margin-bottom:10px;">Histórico de mudanças (${history.length})</div>
      ${_relTable(['Data','Apto','Andar','De','Para','Por','Obs'], rows)}</div>
  </div>`;
}

// ── 5. SEM RESPONSÁVEL ───────────────────────────────────────────

function _relAbaSemResp(el) {
  const aptos = _fApto(_relData.aptos).filter(a=>!a.maid_id);
  const rows = aptos.sort((a,b)=>(String(a.andar||0).padStart(4)+String(a.numero||'').padStart(6))
    .localeCompare(String(b.andar||0).padStart(4)+String(b.numero||'').padStart(6)))
    .map(a=>[a.numero||'—', a.andar!=null?a.andar+'º':'—', a.tipo||'—',
      `<span class="badge badge-${a.status}">${a.status}</span>`, _fmtDt(a.updated_at)]);
  el.innerHTML = `<div class="card"><div class="card-title" style="margin-bottom:10px;">
    Sem camareira atribuída (${aptos.length})</div>
    ${_relTable(['Apto','Andar','Tipo','Status','Última atualização'], rows, 9999)}</div>`;
}

// ── 6. TEMPO DE LIMPEZA ──────────────────────────────────────────

let _tlFiltroTipo  = '';
let _tlSoAcima     = false;

function _tlMetaMs(tipo) {
  const p = _relData.parametros;
  if (tipo === 'permanencia')   return p.tempo_permanencia    * 60000;
  if (tipo === 'pos_manutencao') return p.tempo_pos_manutencao * 60000;
  return p.tempo_saida * 60000; // saida (default)
}

function _tlLabelTipo(tipo) {
  if (tipo === 'permanencia')    return 'Permanência';
  if (tipo === 'pos_manutencao') return 'Pós-manutenção';
  if (tipo === 'saida')          return 'Saída';
  return tipo || '—';
}

function _tlFiltrarSessoes() {
  const f  = _relFiltros;
  const ab = _relData.aptoById;
  return (_relData.limpezaSessoes || []).filter(s => {
    const dt = (s.inicio_at || '').slice(0,10);
    if (f.dtIni && dt < f.dtIni) return false;
    if (f.dtFim && dt > f.dtFim) return false;
    if (f.camareira && s.camareira_id !== f.camareira) return false;
    if (_tlFiltroTipo && s.tipo_limpeza !== _tlFiltroTipo) return false;
    if (f.apto) {
      const a = ab[s.apartment_id];
      if (!a || !String(a.numero||'').toLowerCase().includes(f.apto.toLowerCase())) return false;
    }
    if (f.andar) {
      const a = ab[s.apartment_id];
      if (!a || String(a.andar) !== String(f.andar)) return false;
    }
    if (_tlSoAcima) {
      if (!s.fim_at) return false;
      const dur = new Date(s.fim_at) - new Date(s.inicio_at);
      if (dur <= _tlMetaMs(s.tipo_limpeza)) return false;
    }
    return true;
  });
}

function _tlExportCsv(sessoes) {
  const ab = _relData.aptoById;
  const cols = ['Apto','Andar','Camareira','Tipo','Início','Fim','Duração (min)','Estimado (min)','Situação'];
  const linhas = sessoes.map(s => {
    const a    = ab[s.apartment_id];
    const dur  = s.fim_at ? Math.round((new Date(s.fim_at) - new Date(s.inicio_at)) / 60000) : '';
    const meta = Math.round(_tlMetaMs(s.tipo_limpeza) / 60000);
    const sit  = !s.fim_at ? 'Em andamento' : dur <= meta ? 'No prazo' : 'Acima do estimado';
    return [
      a?.numero||'', a?.andar!=null?a.andar+'º':'', _relNome(s.camareira_id),
      _tlLabelTipo(s.tipo_limpeza), _fmtDt(s.inicio_at), _fmtDt(s.fim_at),
      dur, meta, sit,
    ].map(v => `"${String(v??'').replace(/"/g,'""')}"`).join(',');
  });
  const csv  = [cols.join(','), ...linhas].join('\r\n');
  const blob = new Blob(['﻿'+csv], { type:'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'tempo-limpeza.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function _relAbaTempoLimpeza(el) {
  const sessoes  = _tlFiltrarSessoes();
  const ab       = _relData.aptoById;
  const concluidas = sessoes.filter(s => s.fim_at);
  const andamento  = sessoes.filter(s => !s.fim_at);

  // Calcula durações e situação
  const enriquecidas = concluidas.map(s => {
    const dur  = new Date(s.fim_at) - new Date(s.inicio_at);
    const meta = _tlMetaMs(s.tipo_limpeza);
    return { ...s, durMs: dur, metaMs: meta, noPrazo: dur <= meta };
  });

  const total       = sessoes.length;
  const noPrazo     = enriquecidas.filter(s=>s.noPrazo).length;
  const pctPrazo    = enriquecidas.length ? Math.round(noPrazo/enriquecidas.length*100) : null;
  const avgMs       = enriquecidas.length ? enriquecidas.reduce((acc,s)=>acc+s.durMs,0)/enriquecidas.length : null;
  const maxS        = enriquecidas.length ? enriquecidas.reduce((mx,s)=>s.durMs>mx.durMs?s:mx) : null;

  // Tempo médio por camareira
  const byCam = {};
  enriquecidas.forEach(s => {
    if (!s.camareira_id) return;
    if (!byCam[s.camareira_id]) byCam[s.camareira_id] = { cnt:0, total:0 };
    byCam[s.camareira_id].cnt++;
    byCam[s.camareira_id].total += s.durMs;
  });
  const camHtml = Object.entries(byCam)
    .sort((a,b) => b[1].total/b[1].cnt - a[1].total/a[1].cnt).slice(0,10)
    .map(([uid,d]) => `<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border2);">
      <span>${_relNome(uid)}</span><span>${_fmtDur(d.total/d.cnt)}</span></div>`).join('')
    || '<p style="font-size:12px;color:var(--text3);">—</p>';

  // Tempo médio por tipo
  const byTipo = {};
  enriquecidas.forEach(s => {
    const t = s.tipo_limpeza || 'saida';
    if (!byTipo[t]) byTipo[t] = { cnt:0, total:0, meta: s.metaMs };
    byTipo[t].cnt++; byTipo[t].total += s.durMs;
  });
  const tipoHtml = Object.entries(byTipo)
    .map(([t,d]) => {
      const avg = d.total/d.cnt;
      const ok  = avg <= d.meta;
      return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border2);">
        <span>${_tlLabelTipo(t)} <span style="font-size:10px;color:var(--text3);">(meta ${_fmtDur(d.meta)})</span></span>
        <span style="font-weight:700;color:${ok?'var(--success)':'var(--danger);'};">${_fmtDur(avg)}</span></div>`;
    }).join('') || '<p style="font-size:12px;color:var(--text3);">—</p>';

  // Tabela principal
  const rows = [...enriquecidas.map(s => {
    const a   = ab[s.apartment_id];
    const sit = s.noPrazo
      ? `<span style="color:var(--success);font-weight:700;">✅ No prazo</span>`
      : `<span style="color:var(--danger);font-weight:700;">⚠️ Acima</span>`;
    return [
      a?.numero||'—', a?.andar!=null?a.andar+'º':'—',
      _relNome(s.camareira_id), _tlLabelTipo(s.tipo_limpeza),
      _fmtDt(s.inicio_at), _fmtDt(s.fim_at),
      _fmtDur(s.durMs), _fmtDur(s.metaMs), sit,
    ];
  }), ...andamento.map(s => {
    const a = ab[s.apartment_id];
    return [
      a?.numero||'—', a?.andar!=null?a.andar+'º':'—',
      _relNome(s.camareira_id), _tlLabelTipo(s.tipo_limpeza),
      _fmtDt(s.inicio_at), '—', '—', _fmtDur(_tlMetaMs(s.tipo_limpeza)),
      `<span style="color:var(--primary);font-weight:700;">🔄 Em andamento</span>`,
    ];
  })];

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
      <select onchange="_tlFiltroTipo=this.value;_relAbaTempoLimpeza(document.getElementById('rel-aba-conteudo'))"
        style="padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:12px;">
        <option value="" ${!_tlFiltroTipo?'selected':''}>Todos os tipos</option>
        <option value="saida" ${_tlFiltroTipo==='saida'?'selected':''}>Saída</option>
        <option value="permanencia" ${_tlFiltroTipo==='permanencia'?'selected':''}>Permanência</option>
        <option value="pos_manutencao" ${_tlFiltroTipo==='pos_manutencao'?'selected':''}>Pós-manutenção</option>
      </select>
      <label style="font-size:12px;display:flex;align-items:center;gap:5px;cursor:pointer;">
        <input type="checkbox" ${_tlSoAcima?'checked':''} onchange="_tlSoAcima=this.checked;_relAbaTempoLimpeza(document.getElementById('rel-aba-conteudo'))">
        Somente acima do estimado
      </label>
      <button class="btn btn-ghost btn-sm" onclick="_tlExportCsv(_tlFiltrarSessoes())">⬇ CSV</button>
    </div>
    <div class="stats-grid" style="margin-bottom:16px;">
      ${_relCard('Total de limpezas', total, '', 's-blue')}
      ${_relCard('Concluídas', enriquecidas.length, `${andamento.length} em andamento`, 's-green')}
      ${pctPrazo!==null ? _relCard('No prazo', pctPrazo+'%', `${noPrazo} de ${enriquecidas.length}`, pctPrazo>=80?'s-green':'s-orange') : ''}
      ${avgMs!==null ? _relCard('Tempo médio', _fmtDur(avgMs), '', 's-blue') : ''}
      ${maxS ? _relCard('Mais demorada', _fmtDur(maxS.durMs), `Apto ${ab[maxS.apartment_id]?.numero||'—'}`, 's-gray') : ''}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
      <div class="card"><div class="card-title" style="margin-bottom:8px;">Tempo médio por camareira</div>${camHtml}</div>
      <div class="card"><div class="card-title" style="margin-bottom:8px;">Tempo médio por tipo vs meta</div>${tipoHtml}</div>
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:10px;">Detalhamento (${rows.length})</div>
      ${_relTable(['Apto','Andar','Camareira','Tipo','Início','Fim','Duração','Estimado','Situação'], rows, 300)}
    </div>`;
}

// ── 7. PRODUTIVIDADE ─────────────────────────────────────────────

function _relAbaProdutividade(el) {
  const { equipe, aptos, limpChecklists, parametros } = _relData;
  const sessoes    = _fSessoes(_relData.sessoes);
  const retrabalhos= _fRetrab(_relData.retrabalhos);
  const confChecks = _fCheck(_relData.confChecklists);
  const camareiras = equipe.filter(u=>u.perfil==='camareira');
  const metaSaida  = parametros.tempo_saida;       // minutos
  const metaPerm   = parametros.tempo_permanencia; // minutos

  if (!camareiras.length) {
    el.innerHTML = `<div class="card" style="padding:24px;text-align:center;color:var(--text3);">Nenhuma camareira ativa.</div>`; return;
  }

  // Enriquecer sessões com tipo_limpeza a partir dos checklists
  // Associação: mesmo apartment_id + checklist.created_at próximo ao fim da sessão (± 10 min)
  const limpFilt = _relData.limpChecklists; // já filtrado pelo período via _relFiltros se necessário
  sessoes.forEach(s => {
    if (s.tipo_limpeza || !s.fim) return;
    const fimTs = new Date(s.fim).getTime();
    const iniTs = new Date(s.inicio).getTime();
    const match = limpFilt.find(c =>
      c.apartment_id === s.aptoId &&
      (!s.camareira_id || c.usuario_id === s.camareira_id) &&
      new Date(c.created_at).getTime() >= iniTs - 120000 &&
      new Date(c.created_at).getTime() <= fimTs + 600000
    );
    s.tipo_limpeza = match?.tipo_limpeza || null;
  });

  const _avgMs = arr => arr.length ? arr.reduce((s,x)=>s+x,0)/arr.length : null;
  const _slaOk = (msMedia, metaMin) => msMedia !== null ? msMedia <= metaMin * 60000 : null;
  const _slaCell = (msMedia, metaMin) => {
    const ok = _slaOk(msMedia, metaMin);
    if (ok === null) return '—';
    return ok
      ? `<span style="color:var(--success);font-weight:700;">✅ ${_fmtDur(msMedia)}</span>`
      : `<span style="color:var(--danger);font-weight:700;">⚠️ ${_fmtDur(msMedia)}</span>`;
  };

  const rows = camareiras.map(cam=>{
    const sSes  = sessoes.filter(s=>s.camareira_id===cam.user_id);
    const sConc = sSes.filter(s=>['conferencia','limpo','vago'].includes(s.statusFinal));
    const sCan  = sSes.filter(s=>s.statusFinal==='sujo'||s.statusFinal==='vago'&&s.pausas.length>0);
    const sPaus = sSes.filter(s=>s.pausas.length>0);

    // confChecks tem uma linha por item — conta sessões únicas por _sessionId
    const confCam = confChecks.filter(h=>(_relData.aptoById[h.apartment_id]||{}).maid_id===cam.user_id);
    const aprovados  = new Set(confCam.filter(h=>h.resultado==='aprovado').map(h=>h._sessionId)).size;
    const reprovados = new Set(confCam.filter(h=>h.resultado==='reprovado').map(h=>h._sessionId)).size;
    const retrabCam = retrabalhos.filter(r=>{ const a=_relData.aptoById[r.apartment_id]; return a&&a.maid_id===cam.user_id; }).length;
    const atrib     = aptos.filter(a=>a.maid_id===cam.user_id).length;

    const avgBruto  = sConc.length ? _fmtDur(sConc.reduce((s,x)=>s+x.durBruta,0)/sConc.length) : '—';
    const avgLiq    = sConc.filter(s=>s.durPausada>0).length
      ? _fmtDur(sConc.filter(s=>s.durPausada>0).reduce((s,x)=>s+x.durLiquida,0)/sConc.filter(s=>s.durPausada>0).length) : '—';
    const txAprov   = (aprovados+reprovados) ? Math.round(aprovados/(aprovados+reprovados)*100)+'%' : '—';
    const txRetrab  = sConc.length ? Math.round(retrabCam/sConc.length*100)+'%' : '—';

    // Por tipo
    const sSaida = sConc.filter(s=>s.tipo_limpeza && s.tipo_limpeza.toLowerCase().includes('saíd') || s.tipo_limpeza?.toLowerCase().includes('said') || s.tipo_limpeza?.toLowerCase().includes('checkout'));
    const sPerm  = sConc.filter(s=>s.tipo_limpeza && s.tipo_limpeza.toLowerCase().includes('perm'));
    const msAvgSaida = _avgMs(sSaida.filter(s=>s.durBruta).map(s=>s.durBruta));
    const msAvgPerm  = _avgMs(sPerm.filter(s=>s.durBruta).map(s=>s.durBruta));
    const slaSaida   = _slaCell(msAvgSaida, metaSaida);
    const slaPerm    = _slaCell(msAvgPerm,  metaPerm);
    const nSaida     = sSaida.length || (limpFilt.filter(c=>c.usuario_id===cam.user_id&&(c.tipo_limpeza||'').toLowerCase().includes('said')).length);
    const nPerm      = sPerm.length  || (limpFilt.filter(c=>c.usuario_id===cam.user_id&&(c.tipo_limpeza||'').toLowerCase().includes('perm')).length);

    return { nome:cam.nome, atrib, ini:sSes.length, conc:sConc.length, can:sCan.length, paus:sPaus.length,
      aprov:aprovados, reprov:reprovados, retrab:retrabCam, avgBruto, avgLiq, txAprov, txRetrab,
      nSaida, slaSaida, nPerm, slaPerm };
  }).sort((a,b)=>b.conc-a.conc);

  const totConc = rows.reduce((s,r)=>s+r.conc,0);
  const totAprov= rows.reduce((s,r)=>s+r.aprov,0);
  const totReprov=rows.reduce((s,r)=>s+r.reprov,0);
  const totRet  = rows.reduce((s,r)=>s+r.retrab,0);

  el.innerHTML = `
    <div class="card" style="margin-bottom:14px;background:linear-gradient(135deg,#f0f9ff,#fff);border-left:4px solid var(--primary);">
      <div class="card-title" style="margin-bottom:8px;">⏱ Metas de tempo configuradas</div>
      <div style="display:flex;gap:20px;flex-wrap:wrap;font-size:13px;">
        <div>🛏 <strong>Saída/Checkout:</strong> até <strong>${metaSaida} min</strong></div>
        <div>🏠 <strong>Permanência:</strong> até <strong>${metaPerm} min</strong></div>
        <div style="font-size:11px;color:var(--text3);align-self:center;">✅ dentro da meta &nbsp; ⚠️ acima da meta</div>
      </div>
    </div>
    <div class="stats-grid" style="margin-bottom:16px;">
      ${_relCard('Limpezas concluídas', totConc,'','s-green')}
      ${_relCard('Aprovações', totAprov,'','s-green')}
      ${_relCard('Reprovações', totReprov,'','s-red')}
      ${_relCard('Retrabalhos', totRet,'','s-orange')}
    </div>
    <div class="card" style="margin-bottom:14px;">
      <div class="card-title" style="margin-bottom:10px;">Por camareira — visão geral</div>
      ${_relTable(
        ['Camareira','Atrib.','Inic.','Conc.','Canc.','Pausas','Aprov.','Reprov.','Retrab.','T.Médio','T.Médio Liq.','Tx.Aprov','Tx.Retrab'],
        rows.map(r=>[r.nome,r.atrib,r.ini,r.conc,r.can,r.paus,r.aprov,r.reprov,r.retrab,r.avgBruto,r.avgLiq,r.txAprov,r.txRetrab])
      )}
    </div>
    <div class="card">
      <div class="card-title" style="margin-bottom:4px;">⏱ Tempo médio por tipo de limpeza vs. meta</div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:10px;">✅ dentro da meta configurada &nbsp;·&nbsp; ⚠️ acima da meta &nbsp;·&nbsp; — sem dados suficientes</div>
      ${_relTable(
        ['Camareira','Qtd. Saída','T.Médio Saída','Qtd. Perm.','T.Médio Perm.'],
        rows.map(r=>[r.nome, r.nSaida||'—', r.slaSaida, r.nPerm||'—', r.slaPerm])
      )}
    </div>`;
}

// ── 8. QUALIDADE E CONFERÊNCIA ───────────────────────────────────

function _relAbaQualidade(el) {
  const checks  = _fCheck(_relData.confChecklists);
  const retrab  = _fRetrab(_relData.retrabalhos);
  const { aptoById } = _relData;

  // Contagens por sessão (não por item — cada sessão pode ter N linhas)
  const sessoes     = [...new Set(checks.map(h=>h._sessionId))];
  const total       = sessoes.length;
  const sessoesRep  = new Set(checks.filter(h=>h.resultado==='reprovado').map(h=>h._sessionId));
  const aprovados   = total - sessoesRep.size;
  const reprovados  = sessoesRep.size;
  const taxaPct     = total ? Math.round(reprovados/total*100) : 0;

  // Itens mais não conformes (filtra por resposta do item, não resultado da sessão)
  const itensCnt = {};
  checks.filter(h=>h.resposta==='Não conforme')
    .forEach(h=>{ if(h.item) itensCnt[h.item]=(itensCnt[h.item]||0)+1; });

  // Aptos com reprovação reincidente (conta sessões reprovadas, não itens)
  const aptoRepSessoes = {};
  checks.filter(h=>h.resultado==='reprovado').forEach(h=>{
    if (!aptoRepSessoes[h.apartment_id]) aptoRepSessoes[h.apartment_id] = new Set();
    aptoRepSessoes[h.apartment_id].add(h._sessionId);
  });
  const reincidentes = Object.entries(aptoRepSessoes)
    .map(([id,s])=>({v:id,n:s.size})).filter(x=>x.n>1)
    .sort((a,b)=>b.n-a.n).slice(0,10);
  const reincHtml = reincidentes.length
    ? reincidentes.map(x=>`<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border2);">
        <span>Apto ${_relAptoNum(x.v)}</span><span class="badge badge-reprovado">${x.n}x</span></div>`).join('')
    : '<p style="font-size:12px;color:var(--text3);">Nenhum.</p>';

  // Camareiras com mais sessões reprovadas
  const camRepSessoes = {};
  checks.filter(h=>h.resultado==='reprovado').forEach(h=>{
    const uid = (aptoById[h.apartment_id]||{}).maid_id;
    if (!uid) return;
    if (!camRepSessoes[uid]) camRepSessoes[uid] = new Set();
    camRepSessoes[uid].add(h._sessionId);
  });
  const camRepCnt = Object.fromEntries(Object.entries(camRepSessoes).map(([k,s])=>[k,s.size]));

  // Retrabalhos gerados por apartamento reprovado
  const retByApto = {};
  retrab.forEach(r=>{ retByApto[r.apartment_id]=(retByApto[r.apartment_id]||0)+1; });

  const rows = checks.slice(0,500).map(h=>{
    const a = aptoById[h.apartment_id];
    const camUid = (a&&a.maid_id);
    const temRet = retByApto[h.apartment_id]>0;
    return [
      _fmtDt(h.created_at), a?(a.numero||'—'):'—',
      camUid?_relNome(camUid):'—', _relNome(h.user_id),
      h.item||'—', h.resposta||'—', h.observacao||'—', h.resultado||'—',
      '—', temRet?'Sim':'Não',
    ];
  });

  el.innerHTML = `
    <div class="stats-grid" style="margin-bottom:16px;">
      ${_relCard('Inspeções realizadas', total,'','s-blue')}
      ${_relCard('Aprovações', aprovados,'','s-green')}
      ${_relCard('Reprovações', reprovados,'','s-red')}
      ${total?_relCard('Taxa de reprovação', taxaPct+'%','','s-purple'):''}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px;">
      <div class="card"><div class="card-title" style="margin-bottom:8px;">Itens mais reprovados</div>
        ${_rankList(itensCnt,'badge-reprovado')}</div>
      <div class="card"><div class="card-title" style="margin-bottom:8px;">Camareiras com mais reprovações</div>
        ${_rankList(Object.fromEntries(Object.entries(camRepCnt).map(([k,v])=>[_relNome(k),v])),'badge-reprovado')}</div>
      <div class="card"><div class="card-title" style="margin-bottom:8px;">Aptos com reprovação reincidente</div>
        ${reincHtml}</div>
    </div>
    <div class="card"><div class="card-title" style="margin-bottom:10px;">Inspeções (${checks.length})</div>
      ${total ? _relTable(
        ['Data','Apto','Camareira','Conferente','Item','Resposta','Obs','Resultado','Motivo reprovação','Retrabalho'],
        rows
      ) : '<p style="font-size:12px;color:var(--text3);">Sem dados no período.</p>'}
    </div>`;
}

// ── 9. CHECKLISTS ────────────────────────────────────────────────

function _relAbaChecklists(el) {
  const confChecks = _fCheck(_relData.confChecklists);
  const limpChecks = _fCheck(_relData.limpChecklists);

  // ── Seção A: Conferência ──
  const confSessoes = new Set(confChecks.map(h=>h._sessionId));
  const confTotal   = confSessoes.size;
  const confRepSet  = new Set(confChecks.filter(h=>h.resultado==='reprovado').map(h=>h._sessionId));
  const confNC      = confRepSet.size;
  const confAprov   = confTotal - confNC;
  const confItens   = {};
  confChecks.filter(h=>h.resposta==='Não conforme')
    .forEach(h=>{ if(h.item) confItens[h.item]=(confItens[h.item]||0)+1; });
  const confRows = confChecks.slice(0,300).map(h=>[
    _fmtDt(h.created_at), _relAptoNum(h.apartment_id),
    h.item||'—', h.resposta||'—', h.observacao||'—', h.resultado||'—', _relNome(h.user_id),
  ]);

  // ── Seção B: Limpeza ──
  // Explode respostas JSONB
  const limpRows = [];
  limpChecks.forEach(cl=>{
    const a = _relData.aptoById[cl.apartment_id];
    const respostas = Array.isArray(cl.respostas) ? cl.respostas : [];
    if (!respostas.length) {
      limpRows.push([_fmtDt(cl.created_at), a?(a.numero||'—'):'—', _relNome(cl.usuario_id),
        '—','—', cl.obs_geral||'—', cl.tipo_limpeza||'—']);
    } else {
      respostas.forEach(r=>limpRows.push([
        _fmtDt(cl.created_at), a?(a.numero||'—'):'—', _relNome(cl.usuario_id),
        r.item||'—', r.resposta||'—', cl.obs_geral||'—', cl.tipo_limpeza||'—',
      ]));
    }
  });

  const limpNC = limpRows.filter(r=>r[4]==='nao_conforme').length;
  const limpNCSel = {};
  limpRows.filter(r=>r[4]==='nao_conforme').forEach(r=>{ limpNCSel[r[3]]=(limpNCSel[r[3]]||0)+1; });
  const camNCSel = {};
  limpChecks.forEach(cl=>{
    const nc = (cl.respostas||[]).filter(r=>r.resposta==='nao_conforme').length;
    if (nc && cl.usuario_id) camNCSel[cl.usuario_id]=(camNCSel[cl.usuario_id]||0)+nc;
  });
  const aptoNCSel = {};
  limpChecks.forEach(cl=>{
    const nc = (cl.respostas||[]).filter(r=>r.resposta==='nao_conforme').length;
    if (nc) aptoNCSel[cl.apartment_id]=(aptoNCSel[cl.apartment_id]||0)+nc;
  });
  const limpTotalItems = limpRows.filter(r=>r[4]).length;
  const limpPctConf = limpTotalItems ? Math.round((limpTotalItems-limpNC)/limpTotalItems*100)+'%' : '—';

  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-title" style="margin-bottom:12px;">A. Checklist de Inspeção — Supervisora / Gestora</div>
      <div class="stats-grid" style="margin-bottom:14px;">
        ${_relCard('Checklists preenchidos', confTotal,'','s-blue')}
        ${_relCard('Aprovados', confAprov,'','s-green')}
        ${_relCard('Com não conformidade', confNC,'','s-red')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 2fr;gap:16px;">
        <div><div style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--text2);">Itens mais reprovados</div>
          ${_rankList(confItens,'badge-reprovado')}</div>
        <div>${_relTable(['Data','Apto','Item','Resposta','Obs','Resultado','Usuário'], confRows)}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title" style="margin-bottom:12px;">B. Checklist de Limpeza — Camareira</div>
      ${limpChecks.length ? `
        <div class="stats-grid" style="margin-bottom:14px;">
          ${_relCard('Checklists preenchidos', limpChecks.length,'execuções','s-blue')}
          ${_relCard('Aptos com checklist', new Set(limpChecks.map(c=>c.apartment_id)).size,'','s-blue')}
          ${_relCard('Itens Não conforme', limpNC,'','s-red')}
          ${limpPctConf!=='—'?_relCard('% conformidade', limpPctConf,'','s-green'):''}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:14px;">
          <div><div style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--text2);">Itens mais Não conformes</div>
            ${_rankList(limpNCSel,'badge-reprovado')}</div>
          <div><div style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--text2);">Camareiras com mais NC</div>
            ${_rankList(Object.fromEntries(Object.entries(camNCSel).map(([k,v])=>[_relNome(k),v])),'badge-reprovado')}</div>
          <div><div style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--text2);">Aptos com mais NC</div>
            ${_rankList(Object.fromEntries(Object.entries(aptoNCSel).map(([k,v])=>['Apto '+_relAptoNum(k),v])),'badge-reprovado')}</div>
        </div>
        ${_relTable(['Data','Apto','Camareira','Item','Resposta','Obs geral','Tipo limpeza'], limpRows.slice(0,200))}
      ` : `<div style="background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--radius-sm);
            padding:14px 16px;font-size:13px;color:var(--text2);">
          Sem dados no período. Os checklists de limpeza serão registrados a partir das próximas execuções.</div>`}
    </div>`;
}

// ── 10. CHAMADOS ─────────────────────────────────────────────────

function _relAbaChamados(el) {
  const chamados = _fCham(_relData.chamados);

  const abertos    = chamados.filter(c=>c.status==='aberto').length;
  const andamento  = chamados.filter(c=>c.status==='andamento'||c.status==='em_analise').length;
  const concluidos = chamados.filter(c=>c.status==='concluido'||c.status==='resolvido').length;
  const cancelados = chamados.filter(c=>c.status==='cancelado').length;
  const atrasados  = chamados.filter(c=>_isAtrasado(c)).length;

  // Tempo médio de resolução (somente com resolved_at real)
  const comResolucao = chamados.filter(c=>c.resolved_at&&c.created_at);
  let tmResolucao = '—';
  if (comResolucao.length) {
    const avg = comResolucao.reduce((s,c)=>s+(new Date(c.resolved_at)-new Date(c.created_at)),0)/comResolucao.length;
    tmResolucao = _fmtDur(avg);
  }

  // Rankings
  const prioCnt = {}, tipoCnt = {}, deptCnt = {}, respCnt = {};
  chamados.forEach(c=>{
    if(c.prioridade) prioCnt[c.prioridade]=(prioCnt[c.prioridade]||0)+1;
    if(c.tipo) tipoCnt[c.tipo]=(tipoCnt[c.tipo]||0)+1;
    if(c.departamento) deptCnt[c.departamento]=(deptCnt[c.departamento]||0)+1;
    if(c.responsavel_user_id) {
      const n=_relNome(c.responsavel_user_id);
      respCnt[n]=(respCnt[n]||0)+1;
    }
  });

  // Mais demorados (com resolved_at)
  const masDemorados = comResolucao.map(c=>({
    ...c, dur: new Date(c.resolved_at)-new Date(c.created_at)
  })).sort((a,b)=>b.dur-a.dur).slice(0,5);

  const rows = chamados.slice(0,200).map(c=>{
    const atrasado = _isAtrasado(c);
    const durRes = c.resolved_at&&c.created_at ? _fmtDur(new Date(c.resolved_at)-new Date(c.created_at)) : '—';
    return [
      c.numero||'—', _fmtDt(c.created_at),
      c.resolved_at ? _fmtDt(c.resolved_at) : '—',
      _relAptoNum(c.apartment_id), c.departamento||'—', c.tipo||'—',
      c.prioridade||'—', c.status||'—', _relNome(c.responsavel_user_id),
      c.prazo?c.prazo.slice(0,10).split('-').reverse().join('/'):'—',
      c.prazo?(atrasado?'<span style="color:#c0392b;font-weight:700;">Sim</span>':'<span style="color:#27ae60;">Não</span>'):'—',
      durRes,
    ];
  });

  el.innerHTML = `
    <div class="stats-grid" style="margin-bottom:16px;">
      ${_relCard('Abertos', abertos,'','s-orange')}
      ${_relCard('Em andamento/análise', andamento,'','s-blue')}
      ${_relCard('Concluídos/Resolvidos', concluidos,'','s-green')}
      ${_relCard('Cancelados', cancelados,'','s-gray')}
      ${atrasados?_relCard('Atrasados', atrasados,'prazo vencido','s-red'):''}
      ${tmResolucao!=='—'?_relCard('Tempo médio resolução', tmResolucao,`${comResolucao.length} chamados`,'s-blue'):''}
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:16px;">
      <div class="card"><div class="card-title" style="margin-bottom:8px;">Por prioridade</div>${_rankList(prioCnt)}</div>
      <div class="card"><div class="card-title" style="margin-bottom:8px;">Por tipo</div>${_rankList(tipoCnt)}</div>
      <div class="card"><div class="card-title" style="margin-bottom:8px;">Por departamento</div>${_rankList(deptCnt)}</div>
      <div class="card"><div class="card-title" style="margin-bottom:8px;">Por responsável</div>${_rankList(respCnt)}</div>
    </div>
    ${masDemorados.length?`<div class="card" style="margin-bottom:16px;">
      <div class="card-title" style="margin-bottom:8px;">Chamados mais demorados</div>
      ${_relTable(['Nº','Tipo','Apto','Status','Tempo resolução'],
        masDemorados.map(c=>[c.numero||'—',c.tipo||'—',_relAptoNum(c.apartment_id),c.status,_fmtDur(c.dur)]))}
    </div>`:''}
    <div class="card"><div class="card-title" style="margin-bottom:10px;">Chamados (${chamados.length})</div>
      ${_relTable(['Nº','Abertura','Conclusão','Apto','Depto','Tipo','Prioridade','Status','Responsável','Prazo','Atrasado','T. Resolução'], rows)}
    </div>`;
}

// ── 11. LINHA DO TEMPO ───────────────────────────────────────────

function _relAbaTimeline(el) {
  const f = _relFiltros;
  const { history, confChecklists, limpChecklists, retrabalhos, chamados, aptoById, userNames } = _relData;

  // Exige filtro por apartamento específico ou limitado
  const aptos = _fApto(_relData.aptos);

  // Agregar todos os eventos
  const eventos = [];

  history.forEach(h=>{
    const a = aptoById[h.apartment_id];
    if (!a) return;
    if (f.apto && !String(a.numero||'').toLowerCase().includes(f.apto.toLowerCase())) return;
    if (f.andar && String(a.andar)!==String(f.andar)) return;
    if (f.camareira && h.alterado_por!==f.camareira) return;
    if (f.dtIni && h.created_at.slice(0,10)<f.dtIni) return;
    if (f.dtFim && h.created_at.slice(0,10)>f.dtFim) return;
    const ev = h.status_novo==='limpando'?'Início limpeza'
      : h.status_novo==='pausado'?'Pausa'
      : h.status_novo==='conferencia'?'Arrumação'
      : h.status_novo==='limpo'?'Concluído (limpo)'
      : h.status_novo==='reprovado'?'Reprovado'
      : h.status_novo==='vago'?'Vago'
      : 'Mudança status';
    eventos.push({ dt: h.created_at, apto: a.numero||h.apartment_id, evento: ev,
      anterior: h.status_anterior||'—', novo: h.status_novo||'—',
      usuario: _relNome(h.alterado_por), cam: a.maid_id?_relNome(a.maid_id):'—', obs: h.obs||'—' });
  });

  confChecklists.forEach(h=>{
    const a = aptoById[h.apartment_id];
    if (!a) return;
    if (f.apto && !String(a.numero||'').toLowerCase().includes(f.apto.toLowerCase())) return;
    if (f.andar && String(a.andar)!==String(f.andar)) return;
    if (f.dtIni && h.created_at.slice(0,10)<f.dtIni) return;
    if (f.dtFim && h.created_at.slice(0,10)>f.dtFim) return;
    const res = h.resultado==='aprovado'||h.resultado==='conforme'?'Aprovado na inspeção':'Checklist inspeção ('+(h.resultado||'registrado')+')';
    eventos.push({ dt: h.created_at, apto: a.numero||h.apartment_id, evento: res,
      anterior: '—', novo: h.resultado||'—',
      usuario: _relNome(h.user_id), cam: h.camareira_id?_relNome(h.camareira_id):(a.maid_id?_relNome(a.maid_id):'—'),
      obs: h.item?(h.item+': '+h.resposta):'—' });
  });

  limpChecklists.forEach(cl=>{
    const a = aptoById[cl.apartment_id];
    if (!a) return;
    if (f.apto && !String(a.numero||'').toLowerCase().includes(f.apto.toLowerCase())) return;
    if (f.andar && String(a.andar)!==String(f.andar)) return;
    if (f.camareira && cl.usuario_id!==f.camareira) return;
    if (f.dtIni && cl.created_at.slice(0,10)<f.dtIni) return;
    if (f.dtFim && cl.created_at.slice(0,10)>f.dtFim) return;
    eventos.push({ dt: cl.created_at, apto: a.numero||cl.apartment_id, evento: 'Checklist limpeza',
      anterior: '—', novo: 'registrado', usuario: _relNome(cl.usuario_id), cam: _relNome(cl.usuario_id),
      obs: cl.obs_geral||'—' });
  });

  retrabalhos.forEach(r=>{
    const a = aptoById[r.apartment_id];
    if (!a) return;
    if (f.apto && !String(a.numero||'').toLowerCase().includes(f.apto.toLowerCase())) return;
    if (f.andar && String(a.andar)!==String(f.andar)) return;
    if (f.dtIni && r.created_at.slice(0,10)<f.dtIni) return;
    if (f.dtFim && r.created_at.slice(0,10)>f.dtFim) return;
    eventos.push({ dt: r.created_at, apto: a.numero||r.apartment_id, evento: 'Retrabalho',
      anterior: '—', novo: r.status||'aberta', usuario: _relNome(r.criado_por),
      cam: a.maid_id?_relNome(a.maid_id):'—', obs: r.motivo||r.obs||'—' });
  });

  chamados.forEach(c=>{
    const a = aptoById[c.apartment_id];
    if (!a) return;
    if (f.apto && !String(a.numero||'').toLowerCase().includes(f.apto.toLowerCase())) return;
    if (f.andar && String(a.andar)!==String(f.andar)) return;
    if (f.dtIni && c.created_at.slice(0,10)<f.dtIni) return;
    if (f.dtFim && c.created_at.slice(0,10)>f.dtFim) return;
    eventos.push({ dt: c.created_at, apto: a.numero||c.apartment_id,
      evento: 'Chamado aberto ('+(c.tipo||'—')+')',
      anterior: '—', novo: c.status||'—', usuario: _relNome(c.responsavel_user_id),
      cam: a.maid_id?_relNome(a.maid_id):'—', obs: (c.numero||'')+(c.prioridade?' ['+c.prioridade+']':'') });
  });

  eventos.sort((a,b)=>b.dt.localeCompare(a.dt));

  const rows = eventos.slice(0,200).map(e=>[
    _fmtDt(e.dt), e.apto, e.evento, e.anterior, e.novo, e.usuario, e.cam, e.obs,
  ]);

  const aviso = !f.apto && !f.andar && eventos.length > 200
    ? `<div style="background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--radius-sm);
        padding:10px 14px;font-size:12px;color:var(--text2);margin-bottom:12px;">
        💡 Filtre por <strong>Apto</strong> ou <strong>Andar</strong> para ver a linha do tempo completa de uma UH.
       </div>` : '';

  el.innerHTML = `${aviso}
    <div class="card"><div class="card-title" style="margin-bottom:10px;">
      Linha do tempo — ${eventos.length} eventos</div>
      ${eventos.length
        ? _relTable(['Data/Hora','Apto','Evento','Status anterior','Novo status','Usuário','Camareira','Obs/Motivo'], rows)
        : '<p style="font-size:12px;color:var(--text3);">Sem eventos no período. Use os filtros para refinar a busca.</p>'}
    </div>`;
}

// ── 12. RETRABALHOS ──────────────────────────────────────────────

function _relAbaRetrabalhos(el) {
  const retrabalhos = _fRetrab(_relData.retrabalhos);
  const abertos  = retrabalhos.filter(r=>!r.status||r.status==='aberto'||r.status==='aberta').length;
  const concluidos=retrabalhos.filter(r=>r.status==='resolvida'||r.status==='resolvido'||r.status==='concluido').length;

  const motivoCnt={}, aptoCnt={};
  retrabalhos.forEach(r=>{ if(r.motivo) motivoCnt[r.motivo]=(motivoCnt[r.motivo]||0)+1; });
  retrabalhos.forEach(r=>{ aptoCnt[r.apartment_id]=(aptoCnt[r.apartment_id]||0)+1; });
  const aptoHtml = Object.entries(aptoCnt).sort((a,b)=>b[1]-a[1]).slice(0,8)
    .map(([id,n])=>`<div style="display:flex;justify-content:space-between;font-size:12px;padding:4px 0;border-bottom:1px solid var(--border2);">
      <span>Apto ${_relAptoNum(id)}</span><span class="badge badge-andamento">${n}</span></div>`).join('')
    || '<p style="font-size:12px;color:var(--text3);">—</p>';

  // ── Ranking por camareira ─────────────────────────────────────
  const camRanking = {}; // uid → { reprovacoes, retrabalhos }

  // Reprovações: rastreia quem fez o limpando anterior a cada reprovado no histórico
  const byAptoH = {};
  _relData.history.forEach(h => {
    if (!byAptoH[h.apartment_id]) byAptoH[h.apartment_id] = [];
    byAptoH[h.apartment_id].push(h);
  });
  Object.values(byAptoH).forEach(evs => evs.sort((a,b) => a.created_at.localeCompare(b.created_at)));
  Object.values(byAptoH).forEach(evs => {
    evs.forEach((ev, i) => {
      if (ev.status_novo !== 'reprovado') return;
      for (let k = i - 1; k >= 0; k--) {
        if (evs[k].status_novo === 'limpando' && evs[k].alterado_por) {
          const uid = evs[k].alterado_por;
          if (!camRanking[uid]) camRanking[uid] = { reprovacoes: 0, retrabalhos: 0 };
          camRanking[uid].reprovacoes++;
          break;
        }
      }
    });
  });

  // Retrabalhos: agrupa pelo maid_id atual do apartamento
  retrabalhos.forEach(r => {
    const a = _relData.aptoById[r.apartment_id];
    const uid = a?.maid_id;
    if (!uid) return;
    if (!camRanking[uid]) camRanking[uid] = { reprovacoes: 0, retrabalhos: 0 };
    camRanking[uid].retrabalhos++;
  });

  const rankingEntries = Object.entries(camRanking)
    .map(([uid, d]) => ({ nome: _relNome(uid), reprovacoes: d.reprovacoes, retrabalhos: d.retrabalhos, total: d.reprovacoes + d.retrabalhos }))
    .sort((a, b) => b.total - a.total);

  const rankingHtml = rankingEntries.length === 0
    ? '<p style="font-size:12px;color:var(--text3);">—</p>'
    : rankingEntries.map((r, i) => {
        const medal = i === 0 ? '🔴' : i === 1 ? '🟠' : i === 2 ? '🟡' : '⚪';
        return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border2);">
          <span style="font-size:14px;">${medal}</span>
          <span style="flex:1;font-size:12px;font-weight:600;">${r.nome}</span>
          <span title="Reprovações" style="font-size:11px;color:var(--danger);font-weight:700;min-width:28px;text-align:center;">${r.reprovacoes > 0 ? '❌ '+r.reprovacoes : ''}</span>
          <span title="Retrabalhos" style="font-size:11px;color:var(--warning);font-weight:700;min-width:28px;text-align:center;">${r.retrabalhos > 0 ? '🔁 '+r.retrabalhos : ''}</span>
          <span style="font-size:12px;font-weight:800;min-width:22px;text-align:right;">${r.total}</span>
        </div>`;
      }).join('');

  // ─────────────────────────────────────────────────────────────

  const rows = retrabalhos.slice(0,200).map(r=>{
    const a = _relData.aptoById[r.apartment_id];
    return [
      _fmtDt(r.created_at), a?(a.numero||'—'):'—', r.motivo||'—', r.obs||'—',
      r.status||'aberta', a&&a.maid_id?_relNome(a.maid_id):'—', _relNome(r.criado_por),
      r.resolvido_at?_fmtDt(r.resolvido_at):'—',
    ];
  });

  el.innerHTML = `
    <div class="stats-grid" style="margin-bottom:16px;">
      ${_relCard('Abertos', abertos,'','s-orange')}
      ${_relCard('Concluídos', concluidos,'','s-green')}
      ${_relCard('Total', retrabalhos.length,'no período','s-blue')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:16px;">
      <div class="card"><div class="card-title" style="margin-bottom:8px;">Motivos mais comuns</div>${_rankList(motivoCnt)}</div>
      <div class="card"><div class="card-title" style="margin-bottom:8px;">Aptos com mais retrabalho</div>${aptoHtml}</div>
      <div class="card">
        <div class="card-title" style="margin-bottom:4px;">🏆 Ranking por camareira</div>
        <div style="font-size:10px;color:var(--text3);margin-bottom:8px;">❌ reprovações &nbsp;🔁 retrabalhos &nbsp;Total</div>
        ${rankingHtml}
      </div>
    </div>
    <div class="card"><div class="card-title" style="margin-bottom:10px;">Retrabalhos (${retrabalhos.length})</div>
      ${_relTable(['Data','Apto','Motivo','Obs','Status','Camareira','Aberto por','Data conclusão'], rows)}
    </div>`;
}

// ── 13. EQUIPE ───────────────────────────────────────────────────

function _relAbaEquipe(el) {
  const { equipe, aptos } = _relData;
  const f = _relFiltros;
  const ativos = equipe.filter(u => u.ativo !== false);
  let lista = equipe; // tabela mostra todos (ativos e inativos)
  if (f.camareira) lista = lista.filter(u=>u.user_id===f.camareira);

  const perfilCnt = {};
  ativos.forEach(u=>{ perfilCnt[u.perfil]=(perfilCnt[u.perfil]||0)+1; });
  const distHtml = Object.entries(perfilCnt).sort((a,b)=>b[1]-a[1])
    .map(([p,c])=>`<div style="display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:1px solid var(--border2);">
      <span>${p}</span><span style="font-weight:700;">${c}</span></div>`).join('');

  const rows = lista.sort((a,b)=>a.nome.localeCompare(b.nome)).map(u=>[
    u.nome, u.perfil, u.ativo?'Ativo':'Inativo',
    aptos.filter(a=>a.maid_id===u.user_id).length,
  ]);

  el.innerHTML = `<div style="display:grid;grid-template-columns:1fr 2fr;gap:16px;align-items:start;">
    <div class="card"><div class="card-title" style="margin-bottom:10px;">Por perfil (${ativos.length} ativos)</div>
      ${distHtml||'<p style="font-size:12px;color:var(--text3);">—</p>'}</div>
    <div class="card"><div class="card-title" style="margin-bottom:10px;">Membros da equipe</div>
      ${_relTable(['Nome','Perfil','Situação','Aptos atribuídos'], rows, 9999)}</div>
  </div>`;
}

// ── 14. PAUSAS ───────────────────────────────────────────────────

function _relAbaPausas(el) {
  const { history, aptos, userNames } = _relData;
  const f = _relFiltros;

  const aptoMap  = Object.fromEntries(aptos.map(a => [a.id, a]));
  const userMap  = userNames; // inclui todos os usuários resolvidos, incluindo admin_global

  // Pega todos os eventos de pausa e de saída de pausa em ordem cronológica por apto
  const byApto = {};
  history.forEach(h => {
    if (!byApto[h.apartment_id]) byApto[h.apartment_id] = [];
    byApto[h.apartment_id].push(h);
  });
  Object.values(byApto).forEach(evs => evs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));

  const pausas = [];
  Object.entries(byApto).forEach(([aptoId, evs]) => {
    const apto = aptoMap[aptoId];
    if (!apto) return;
    if (f.andar  && String(apto.andar) !== String(f.andar)) return;
    if (f.apto   && !String(apto.numero||'').toLowerCase().includes(f.apto.toLowerCase())) return;

    for (let i = 0; i < evs.length; i++) {
      const ev = evs[i];
      if (ev.status_novo !== 'pausado') continue;

      // Filtros de data no evento de pausa
      if (f.dtIni && ev.created_at < f.dtIni) continue;
      if (f.dtFim && ev.created_at.slice(0,10) > f.dtFim) continue;

      // Filtro de camareira (quem pausou)
      if (f.camareira && ev.alterado_por !== f.camareira) continue;

      // Encontra próximo evento do mesmo apto que sai do pausado
      let fimEv = null;
      for (let j = i + 1; j < evs.length; j++) {
        if (evs[j].status_anterior === 'pausado') { fimEv = evs[j]; break; }
      }

      const inicio   = new Date(ev.created_at);
      const fim      = fimEv ? new Date(fimEv.created_at) : null;
      const durMs    = fim ? fim - inicio : null;
      const durMin   = durMs !== null ? Math.round(durMs / 60000) : null;
      const quem     = userMap[ev.alterado_por] || ev.alterado_por || '—';
      const retomadoPor = fimEv ? (userMap[fimEv.alterado_por] || fimEv.alterado_por || '—') : '—';

      pausas.push({
        numero:      apto.numero,
        andar:       apto.andar,
        inicio:      inicio,
        fim:         fim,
        durMin,
        quem,
        retomadoPor,
        obs:         ev.obs || '—',
        statusRetomada: fimEv ? fimEv.status_novo : 'em aberto',
      });
    }
  });

  // Retomadas órfãs: existe evento status_anterior='pausado' mas o evento status_novo='pausado'
  // nunca foi gravado (INSERT falhou por constraint antiga). Mostra o que existe.
  const pausasAptoIds = new Set(pausas.map(p => p.numero));
  Object.entries(byApto).forEach(([aptoId, evs]) => {
    const apto = aptoMap[aptoId];
    if (!apto) return;
    if (f.andar && String(apto.andar) !== String(f.andar)) return;
    if (f.apto  && !String(apto.numero||'').toLowerCase().includes(f.apto.toLowerCase())) return;

    // Índices dos eventos de pausa gravados para este apto
    const pausaIdxSet = new Set(evs.reduce((acc, ev, i) => { if (ev.status_novo === 'pausado') acc.push(i); return acc; }, []));

    evs.forEach((ev, j) => {
      if (ev.status_anterior !== 'pausado') return;
      // Verifica se existe um evento de pausa antes deste que "cobre" esta retomada
      let coberto = false;
      for (let k = j - 1; k >= 0; k--) {
        if (evs[k].status_novo === 'pausado') { coberto = true; break; }
        if (evs[k].status_anterior === 'pausado') break; // outra retomada antes
      }
      if (coberto) return; // já contabilizado no loop principal

      // Filtros de data na retomada (único timestamp que temos)
      if (f.dtIni && ev.created_at.slice(0,10) < f.dtIni) return;
      if (f.dtFim && ev.created_at.slice(0,10) > f.dtFim) return;
      if (f.camareira) return; // sem registro de quem pausou, não dá para filtrar

      pausas.push({
        numero:      apto.numero,
        andar:       apto.andar,
        inicio:      null,
        fim:         new Date(ev.created_at),
        durMin:      null,
        quem:        '—',
        retomadoPor: userMap[ev.alterado_por] || ev.alterado_por || '—',
        obs:         '⚠️ Registro de início não encontrado — retomada em ' + new Date(ev.created_at).toLocaleString('pt-BR'),
        statusRetomada: ev.status_novo || '—',
      });
    });
  });

  // Aptos atualmente pausados sem registro de pausa no histórico (insert falhou silenciosamente)
  const aptosComPausaHistorico = new Set(pausas.map(p => p.numero));
  aptos.forEach(apto => {
    if (apto.status !== 'pausado') return;
    if (aptosComPausaHistorico.has(apto.numero)) return;
    if (f.andar && String(apto.andar) !== String(f.andar)) return;
    if (f.apto  && !String(apto.numero||'').toLowerCase().includes(f.apto.toLowerCase())) return;
    if (f.camareira) return; // sem registro, não dá para filtrar por camareira
    pausas.push({
      numero:      apto.numero,
      andar:       apto.andar,
      inicio:      null,
      fim:         null,
      durMin:      null,
      quem:        '—',
      retomadoPor: '—',
      obs:         '⚠️ Sem registro de início (apto atualmente pausado)',
      statusRetomada: 'em aberto',
    });
  });

  // Filtro por situação da pausa
  let pausasFiltradas = pausas;
  if (f.situacaoPausa === 'aberto')     pausasFiltradas = pausas.filter(p => !p.fim && p.durMin === null);
  if (f.situacaoPausa === 'finalizada') pausasFiltradas = pausas.filter(p => p.fim !== null || p.durMin !== null);

  pausasFiltradas.sort((a, b) => {
    if (!a.inicio && !b.inicio) return 0;
    if (!a.inicio) return 1;
    if (!b.inicio) return -1;
    return b.inicio - a.inicio;
  });

  const fmt  = d => d ? new Date(d).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
  const fmtD = (m, temFim) => {
    if (m === null && !temFim) return '<span style="color:var(--warning);font-weight:600;">Em aberto</span>';
    if (m === null &&  temFim) return '<span style="color:var(--text3);">Desconhecida</span>';
    if (m < 30) return `<span style="color:var(--success)">${m} min</span>`;
    if (m < 60) return `<span style="color:var(--warning);font-weight:600;">${m} min</span>`;
    return `<span style="color:var(--danger);font-weight:600;">${Math.floor(m/60)}h ${m%60}min</span>`;
  };

  const totalMin = pausasFiltradas.reduce((s, p) => s + (p.durMin || 0), 0);
  const emAberto = pausas.filter(p => p.durMin === null && !p.fim).length; // sempre conta o total real

  const rows = pausasFiltradas.map(p => [
    `<strong>${p.numero}</strong>`, `${p.andar}º`,
    fmt(p.inicio), fmt(p.fim),
    fmtD(p.durMin, p.fim),
    p.quem, p.retomadoPor,
    `<span style="font-size:11px;">${p.obs}</span>`,
  ]);

  el.innerHTML = `
  <div class="card" style="padding:14px 18px;margin-bottom:16px;">
    <div style="display:flex;gap:24px;flex-wrap:wrap;">
      <div><div style="font-size:22px;font-weight:700;">${pausas.length}</div><div style="font-size:12px;color:var(--text3);">Total de pausas</div></div>
      <div><div style="font-size:22px;font-weight:700;color:var(--warning);">${emAberto}</div><div style="font-size:12px;color:var(--text3);">Em aberto</div></div>
      <div><div style="font-size:22px;font-weight:700;">${totalMin >= 60 ? Math.floor(totalMin/60)+'h '+(totalMin%60)+'min' : totalMin+' min'}</div><div style="font-size:12px;color:var(--text3);">Tempo total pausado</div></div>
      <div><div style="font-size:22px;font-weight:700;">${pausas.length ? Math.round(pausas.filter(p=>p.durMin!==null).reduce((s,p)=>s+p.durMin,0)/(pausas.filter(p=>p.durMin!==null).length||1))+' min' : '—'}</div><div style="font-size:12px;color:var(--text3);">Duração média</div></div>
    </div>
  </div>
  <div class="card" style="padding:14px 18px;">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
      <div class="card-title" style="margin:0;">⏸ Histórico de Pausas por Apartamento</div>
      <select onchange="_relFiltro('situacaoPausa',this.value)"
        style="padding:6px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--surface);color:var(--text1);font-size:13px;cursor:pointer;">
        <option value=""   ${f.situacaoPausa===''          ?'selected':''}>Todas as situações</option>
        <option value="aberto"    ${f.situacaoPausa==='aberto'    ?'selected':''}>⏳ Em aberto (${emAberto})</option>
        <option value="finalizada" ${f.situacaoPausa==='finalizada'?'selected':''}>✅ Finalizadas</option>
      </select>
    </div>
    ${pausasFiltradas.length === 0
      ? '<p style="color:var(--text3);text-align:center;padding:32px;">Nenhuma pausa encontrada.</p>'
      : _relTable(['Apto','Andar','Início da Pausa','Fim da Pausa','Duração','Quem Pausou','Retomado por','Observação'], rows, 9999)}
  </div>`;
}

// ══════════════════════════════════════════════════════════════════
// ABA DISCREPÂNCIA — Relatório de Discrepância da Integração XLS
// ══════════════════════════════════════════════════════════════════

// Estado próprio da aba (não mistura com _relFiltros das outras abas)
let _discFiltros = { data: new Date().toISOString().slice(0,10), apenasDisc: false, statusApto: '', statusGov: '', apto: '' };

// Labels visuais dos status internos — limpando nunca exibe como "Limpando"
const _DISC_LABEL = {
  vago:'Vago', ocupado:'Ocupado', bloqueado:'Bloqueado',
  nao_perturbe:'Não Perturbe', nao_quis_arrumacao:'Não quis arrumação',
  limpo:'Limpo', sujo:'Sujo', limpando:'Em Limpeza',
  inspecao:'Inspeção', manutencao:'Manutenção',
};

function _discLabel(v) { return _DISC_LABEL[v] || v || '—'; }

// Cores por tipo para badges
const _DISC_COR = {
  vago:'#22c55e', ocupado:'#ef4444', bloqueado:'#6b7280',
  nao_perturbe:'#8b5cf6', nao_quis_arrumacao:'#ec4899',
  limpo:'#22c55e', sujo:'#f97316', limpando:'#2e86c1',
  inspecao:'#8e44ad', manutencao:'#f59e0b',
};

function _discBadge(v) {
  const cor = _DISC_COR[v] || '#6b7280';
  const lbl = _discLabel(v);
  return `<span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;background:${cor}22;color:${cor};border:1px solid ${cor}55;white-space:nowrap;">${lbl}</span>`;
}

// ── Regras de discrepância (função pura) ─────────────────────────
// Recebe um registro de integracao_xls_status_diario + qtdPessoasLimpeza (da camareira, só Permanência).
// status_apto   = STATUS GOV do XLS  (ocupação: vago/ocupado/bloqueado/nao_perturbe/nao_quis_arrumacao)
// status_governanca = STATUS APTO do XLS (limpeza: limpo/sujo/limpando/inspecao/manutencao)

function calcularDiscrepanciasIntegracaoXls(r, dataIntegracao, qtdPessoasLimpeza, qtdCriancasLimpeza) {
  const disc = [];
  const gov     = r.status_apto        || '';
  const limpeza = r.status_governanca  || '';
  const adultos  = r.adultos  ?? 0;
  const criancas = r.criancas ?? 0;
  const partida  = r.data_partida || '';

  // Regra 1: Ocupado sem hóspedes informados
  if (gov === 'ocupado' && adultos === 0)
    disc.push('Ocupado sem hóspedes informados');

  // Regra 2: Vago com hóspedes informados
  if (gov === 'vago' && adultos > 0)
    disc.push('Vago com hóspedes informados');

  // Regra 3: Bloqueado com hóspedes informados
  if (gov === 'bloqueado' && adultos > 0)
    disc.push('Bloqueado com hóspedes informados');

  // Regra 4: Ocupado com status de limpeza/inspeção/conferência (sujo é normal para ocupado)
  if (gov === 'ocupado' && ['limpando','inspecao','conferencia'].includes(limpeza))
    disc.push('Ocupado com status de limpeza/inspeção');

  // Regra 5: Possível saída do dia
  if (partida && partida === dataIntegracao && gov === 'ocupado')
    disc.push('Possível saída do dia');

  // Regras 6–9 — comparação com o que a camareira registrou na Permanência
  const temLimpeza = qtdPessoasLimpeza != null || qtdCriancasLimpeza != null;
  if (temLimpeza) {
    // Regra 6: adultos divergem
    if (qtdPessoasLimpeza != null && adultos !== qtdPessoasLimpeza)
      disc.push(`Adultos divergem — XLS: ${adultos}, Limpeza: ${qtdPessoasLimpeza}`);

    // Regra 7: crianças divergem
    if (qtdCriancasLimpeza != null && criancas !== qtdCriancasLimpeza)
      disc.push(`Crianças divergem — XLS: ${criancas}, Limpeza: ${qtdCriancasLimpeza}`);

    // Regra 8: XLS diz Vago mas camareira encontrou hóspedes
    const totalLimpeza = (qtdPessoasLimpeza ?? 0) + (qtdCriancasLimpeza ?? 0);
    if (gov === 'vago' && totalLimpeza > 0)
      disc.push(`Vago no XLS mas camareira registrou ${totalLimpeza} hóspede(s)`);

    // Regra 9: total de hóspedes diverge (adultos + crianças)
    const totalXls = adultos + criancas;
    if (totalXls !== totalLimpeza && !disc.some(d => d.startsWith('Adultos divergem') || d.startsWith('Crianças divergem')))
      disc.push(`Total hóspedes diverge — XLS: ${totalXls}, Limpeza: ${totalLimpeza}`);
  }

  return disc;
}

// ── Observações informativas (não são discrepâncias críticas) ─────
function _discObs(r) {
  const obs = [];
  if (r.status_apto === 'nao_quis_arrumacao') obs.push('Não quis arrumação');
  if (r.status_apto === 'nao_perturbe')        obs.push('Não Perturbe');
  if (r.status_governanca === 'nao_perturbe')   obs.push('Não Perturbe (limpeza)');
  return obs.join('; ');
}

// ── Exportação CSV ────────────────────────────────────────────────
function _discExportarCsv(registros, dataIntegracao) {
  const header = ['Apto','Status Apto','Status Governança','Adultos XLS','Crianças XLS','Adultos Limpeza','Crianças Limpeza','Data Partida','Discrepâncias','Observação'];
  const linhas = registros.map(r => {
    const disc = calcularDiscrepanciasIntegracaoXls(r, dataIntegracao, r.qtdPessoasLimpeza ?? null, r.qtdCriancasLimpeza ?? null);
    const obs  = _discObs(r);
    return [
      r.apto,
      _discLabel(r.status_apto),
      _discLabel(r.status_governanca),
      r.adultos  ?? 0,
      r.criancas ?? 0,
      r.qtdPessoasLimpeza  ?? '',
      r.qtdCriancasLimpeza ?? '',
      r.data_partida || '',
      disc.join(' | '),
      obs,
    ].map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',');
  });
  const csv  = [header.join(','), ...linhas].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `discrepancia_${dataIntegracao}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Render da aba ─────────────────────────────────────────────────
async function _relAbaDiscrepancia(el) {
  const hotelId = _relHotelId;
  if (!hotelId) { el.innerHTML = '<p style="color:var(--text3);padding:24px;">Selecione um hotel.</p>'; return; }

  // Render imediato do shell com filtros
  el.innerHTML = `
    <div class="card" style="padding:14px 18px;margin-bottom:16px;">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
        <div style="display:flex;flex-direction:column;gap:3px;">
          <label style="font-size:11px;color:var(--text3);">Data da integração</label>
          <input type="date" id="disc-f-data" value="${_discFiltros.data}"
            onchange="_discFiltro('data',this.value)"
            style="padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:12px;width:130px;">
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;">
          <label style="font-size:11px;color:var(--text3);">Status Apto (ocupação)</label>
          <select id="disc-f-sapto" onchange="_discFiltro('statusApto',this.value)"
            style="padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:12px;">
            <option value="">Todos</option>
            <option value="ocupado"  ${_discFiltros.statusApto==='ocupado'?'selected':''}>Ocupado</option>
            <option value="vago"     ${_discFiltros.statusApto==='vago'?'selected':''}>Vago</option>
            <option value="bloqueado"${_discFiltros.statusApto==='bloqueado'?'selected':''}>Bloqueado</option>
            <option value="nao_perturbe"${_discFiltros.statusApto==='nao_perturbe'?'selected':''}>Não Perturbe</option>
            <option value="nao_quis_arrumacao"${_discFiltros.statusApto==='nao_quis_arrumacao'?'selected':''}>Não quis arrumação</option>
          </select>
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;">
          <label style="font-size:11px;color:var(--text3);">Status Gov (limpeza)</label>
          <select id="disc-f-sgov" onchange="_discFiltro('statusGov',this.value)"
            style="padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:12px;">
            <option value="">Todos</option>
            <option value="limpo"     ${_discFiltros.statusGov==='limpo'?'selected':''}>Limpo</option>
            <option value="sujo"      ${_discFiltros.statusGov==='sujo'?'selected':''}>Sujo</option>
            <option value="limpando"  ${_discFiltros.statusGov==='limpando'?'selected':''}>Em Limpeza</option>
            <option value="inspecao"  ${_discFiltros.statusGov==='inspecao'?'selected':''}>Inspeção</option>
            <option value="manutencao"${_discFiltros.statusGov==='manutencao'?'selected':''}>Manutenção</option>
          </select>
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;">
          <label style="font-size:11px;color:var(--text3);">Apto</label>
          <input type="text" id="disc-f-apto" value="${_discFiltros.apto}"
            oninput="_discFiltro('apto',this.value)"
            placeholder="ex: 301"
            style="padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:12px;width:80px;">
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;">
          <label style="font-size:11px;color:var(--text3);">Mostrar</label>
          <select id="disc-f-apenas" onchange="_discFiltro('apenasDisc',this.value==='1')"
            style="padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:12px;">
            <option value="0" ${!_discFiltros.apenasDisc?'selected':''}>Todos os aptos</option>
            <option value="1" ${_discFiltros.apenasDisc?'selected':''}>Apenas discrepâncias</option>
          </select>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="_discLimparFiltros()">✕ Limpar</button>
        <button class="btn btn-outline btn-sm" onclick="_discExportarCsv(_discDadosAtuais||[],_discFiltros.data)">⬇ CSV</button>
      </div>
    </div>
    <div id="disc-conteudo"><div style="padding:32px;text-align:center;color:var(--text3);font-size:13px;">⏳ Carregando...</div></div>
  `;

  await _discCarregarERender();
}

// Dados em memória para exportação CSV
let _discDadosAtuais = [];

async function _discCarregarERender() {
  const el = document.getElementById('disc-conteudo');
  if (!el) return;

  const dataInicio = _discFiltros.data + 'T00:00:00';
  const dataFim    = _discFiltros.data + 'T23:59:59';

  const [xlsRes, limpRes] = await Promise.all([
    supabaseClient
      .from('integracao_xls_status_diario')
      .select('apto, status_apto, status_apto_original, status_governanca, status_governanca_original, adultos, criancas, data_partida, data_integracao')
      .eq('hotel_id', _relHotelId)
      .eq('data_integracao', _discFiltros.data)
      .order('apto'),
    supabaseClient
      .from('limpeza_checklists')
      .select('apartment_id, qtd_pessoas, qtd_criancas, apartments(numero)')
      .eq('hotel_id', _relHotelId)
      .eq('tipo_limpeza', 'permanencia')
      .gte('created_at', dataInicio)
      .lte('created_at', dataFim),
  ]);

  if (xlsRes.error) {
    el.innerHTML = `<div class="card" style="padding:24px;color:#991b1b;">Erro ao carregar dados: ${xlsRes.error.message}</div>`;
    return;
  }

  const data = xlsRes.data || [];

  if (!data.length) {
    el.innerHTML = `<div class="card" style="padding:32px;text-align:center;color:var(--text3);">
      Nenhum dado de integração encontrado para <strong>${_discFiltros.data}</strong>.<br>
      <span style="font-size:12px;margin-top:8px;display:block;">Realize primeiro a Integração XLS para esta data.</span>
    </div>`;
    return;
  }

  // Monta mapa apto → { pessoas, criancas } registrado pela camareira (Permanência)
  const mapLimpeza = {};
  (limpRes.data || []).forEach(c => {
    const num = c.apartments?.numero;
    if (num) mapLimpeza[num] = {
      pessoas:  c.qtd_pessoas  ?? null,
      criancas: c.qtd_criancas ?? null,
    };
  });

  // Enriquece cada registro com dados de limpeza para uso no CSV e cálculo
  _discDadosAtuais = data.map(r => ({
    ...r,
    qtdPessoasLimpeza:   mapLimpeza[r.apto]?.pessoas  ?? null,
    qtdCriancasLimpeza:  mapLimpeza[r.apto]?.criancas ?? null,
  }));

  // Aplica filtros de tela
  let filtrados = data.filter(r => {
    if (_discFiltros.statusApto && r.status_apto !== _discFiltros.statusApto) return false;
    if (_discFiltros.statusGov  && r.status_governanca !== _discFiltros.statusGov) return false;
    if (_discFiltros.apto && !String(r.apto||'').includes(_discFiltros.apto)) return false;
    return true;
  });

  // Calcula discrepâncias de cada registro, cruzando com dados da limpeza
  const comDisc = filtrados.map(r => {
    const limpPessoas  = mapLimpeza[r.apto]?.pessoas  ?? null;
    const limpCriancas = mapLimpeza[r.apto]?.criancas ?? null;
    return {
      ...r,
      qtdPessoasLimpeza:  limpPessoas,
      qtdCriancasLimpeza: limpCriancas,
      disc: calcularDiscrepanciasIntegracaoXls(r, _discFiltros.data, limpPessoas, limpCriancas),
      obs:  _discObs(r),
    };
  });

  if (_discFiltros.apenasDisc) {
    filtrados = comDisc.filter(r => r.disc.length > 0);
  } else {
    filtrados = comDisc;
  }

  // ── Indicadores ──────────────────────────────────────────────────
  const total      = data.length;
  const ocupados   = data.filter(r => r.status_apto === 'ocupado').length;
  const vagos      = data.filter(r => r.status_apto === 'vago').length;
  const comAdultos = data.filter(r => (r.adultos ?? 0) > 0).length;
  const totalDisc  = comDisc.filter(r => r.disc.length > 0).length;
  const pctDisc    = total ? Math.round((totalDisc / total) * 100) : 0;

  // ── Tabela ────────────────────────────────────────────────────────
  const rows = filtrados.map(r => {
    const temDisc    = r.disc.length > 0;
    const rowStyle   = temDisc ? 'background:#fff1f2;' : '';
    const discTags   = r.disc.map(d =>
      `<div style="margin-bottom:3px;padding:2px 7px;border-radius:5px;font-size:11px;font-weight:700;background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;white-space:nowrap;">${d}</div>`
    ).join('');
    const obsTag = r.obs
      ? `<span style="font-size:11px;color:#6b7280;font-style:italic;">${r.obs}</span>`
      : '';
    const _cel = (xlsVal, limpVal) => {
      if (limpVal == null) return `<span style="color:#6b7280;">${xlsVal}</span>`;
      const dif = xlsVal !== limpVal;
      const style = dif ? 'font-weight:700;color:#991b1b;' : 'color:#16a34a;font-weight:600;';
      return `<span style="${style}">${xlsVal}</span>`
           + ` <span style="font-size:10px;color:#6b7280;">XLS</span>`
           + ` / <span style="${style}">${limpVal}</span>`
           + ` <span style="font-size:10px;color:#6b7280;">Lim.</span>`;
    };
    return [
      `<strong>${r.apto}</strong>`,
      _discBadge(r.status_apto),
      _discBadge(r.status_governanca),
      _cel(r.adultos ?? 0, r.qtdPessoasLimpeza),
      _cel(r.criancas ?? 0, r.qtdCriancasLimpeza),
      r.data_partida ? r.data_partida.split('-').reverse().join('/') : '—',
      discTags || '<span style="color:#9ca3af;font-size:11px;">—</span>',
      obsTag || '—',
    ].map((v,i) => {
      const s = i === 0 ? rowStyle : (temDisc && i > 0 ? rowStyle : '');
      return `<td style="padding:7px 10px;border-bottom:1px solid var(--border2);vertical-align:top;${s}">${v}</td>`;
    }).join('');
  });

  const tabelaHtml = filtrados.length
    ? `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:var(--surface2,#f9fafb);">
          ${['Apto','Status Apto','Status Gov (Limpeza)','Adultos','Crianças','Data Partida','Tipo de Discrepância','Observação']
            .map(c=>`<th style="text-align:left;padding:8px 10px;border-bottom:2px solid var(--border);color:var(--text2);white-space:nowrap;font-size:12px;">${c}</th>`).join('')}
        </tr></thead>
        <tbody>${rows.map(r=>`<tr>${r}</tr>`).join('')}</tbody>
      </table>
      ${filtrados.length > 500 ? `<p style="font-size:11px;color:var(--text3);margin-top:6px;">Exibindo ${filtrados.length} registros.</p>` : ''}
      </div>`
    : `<p style="color:var(--text3);padding:16px 0;font-size:13px;">Nenhum registro para os filtros aplicados.</p>`;

  el.innerHTML = `
    <!-- Cards indicadores -->
    <div class="stats-grid" style="margin-bottom:16px;">
      ${_relCard('Total importados', total, '', 's-blue')}
      ${_relCard('Ocupados', ocupados, '', 's-red')}
      ${_relCard('Vagos', vagos, '', 's-green')}
      ${_relCard('Com adultos', comAdultos, '', 's-blue')}
      ${_relCard('Discrepâncias', totalDisc, `${pctDisc}% do total`, totalDisc > 0 ? 's-red' : 's-green')}
      ${_relCard('% Discrepância', pctDisc + '%', `${totalDisc} de ${total}`, pctDisc > 10 ? 's-red' : pctDisc > 0 ? 's-orange' : 's-green')}
    </div>

    <!-- Tabela -->
    <div class="card" style="padding:18px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
        <div style="font-weight:600;">
          Aptos em ${_discFiltros.data.split('-').reverse().join('/')}
          ${_discFiltros.apenasDisc ? ' — apenas discrepâncias' : ''}
          <span style="font-size:12px;font-weight:400;color:var(--text3);margin-left:8px;">${filtrados.length} registro(s)</span>
        </div>
      </div>
      ${tabelaHtml}
    </div>
  `;
}

function _discFiltro(campo, valor) {
  _discFiltros[campo] = valor;
  _discCarregarERender();
}

function _discLimparFiltros() {
  _discFiltros = { data: new Date().toISOString().slice(0,10), apenasDisc: false, statusApto: '', statusGov: '', apto: '' };
  _relAbaDiscrepancia(document.getElementById('rel-aba-conteudo'));
}

// ── ABA: LIMPEZAS / CONFERÊNCIAS POR USUÁRIO ─────────────────────
// Filtros próprios, independentes do filtro global. Queries próprias ao Supabase.

let _lcF = null; // { dtIni, dtFim, camareira }

function _lcFmtMin(min) {
  if (min == null || min < 0) return '—';
  if (min < 60) return min + 'min';
  return Math.floor(min / 60) + 'h ' + (min % 60) + 'min';
}

async function _relAbaLimpezasCamareira(el) {
  const { equipe } = _relData;
  const todosUsuarios = equipe.filter(u => u.ativo).sort((a,b) => (a.nome||'').localeCompare(b.nome||''));

  // Inicializar filtros com padrão dos últimos 30 dias
  if (!_lcF) {
    const hoje = new Date().toISOString().slice(0, 10);
    const ha30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    _lcF = { dtIni: ha30, dtFim: hoje, camareira: '' };
  }

  const opsCam = todosUsuarios.map(u =>
    `<option value="${u.user_id}" ${u.user_id === _lcF.camareira ? 'selected' : ''}>${u.nome}${u.perfil ? ' (' + u.perfil + ')' : ''}</option>`
  ).join('');

  el.innerHTML = `
    <div id="lc-print-area">
      <!-- Cabeçalho impressão -->
      <div class="lc-print-header">
        <div style="font-size:20px;font-weight:700;margin-bottom:6px;">Relatório de Limpezas e Conferências por Usuário</div>
        <div id="lc-print-subtitulo" style="font-size:13px;"></div>
        <div id="lc-print-emitido"  style="font-size:11px;color:#666;margin-top:3px;"></div>
        <hr style="margin:12px 0 16px;">
      </div>

      <!-- Filtros próprios -->
      <div class="card lc-screen-only" style="padding:14px 16px;margin-bottom:14px;">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
          <div style="display:flex;flex-direction:column;gap:3px;">
            <label style="font-size:11px;color:var(--text3);">Usuário</label>
            <select id="lc-f-cam" onchange="_lcFiltrar()"
              style="padding:5px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;min-width:200px;">
              <option value="">— Todos —</option>
              ${opsCam}
            </select>
          </div>
          <div style="display:flex;flex-direction:column;gap:3px;">
            <label style="font-size:11px;color:var(--text3);">De</label>
            <input type="date" id="lc-f-ini" value="${_lcF.dtIni}" onchange="_lcFiltrar()"
              style="padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;">
          </div>
          <div style="display:flex;flex-direction:column;gap:3px;">
            <label style="font-size:11px;color:var(--text3);">Até</label>
            <input type="date" id="lc-f-fim" value="${_lcF.dtFim}" onchange="_lcFiltrar()"
              style="padding:5px 8px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;">
          </div>
          <button class="btn btn-primary btn-sm" onclick="_lcBuscar()">🔍 Buscar</button>
          <button class="btn btn-ghost btn-sm" onclick="_lcLimpar()">✕ Limpar</button>
          <button class="btn btn-outline btn-sm" onclick="window.print()" style="margin-left:auto;">🖨 Imprimir</button>
        </div>
      </div>

      <!-- Resultado -->
      <div id="lc-resultado">
        <div style="padding:32px;text-align:center;color:var(--text3);">⏳ Carregando...</div>
      </div>
    </div>`;

  await _lcBuscar();
}

function _lcFiltrar() {
  _lcF.camareira = document.getElementById('lc-f-cam')?.value  || '';
  _lcF.dtIni     = document.getElementById('lc-f-ini')?.value  || '';
  _lcF.dtFim     = document.getElementById('lc-f-fim')?.value  || '';
}

function _lcLimpar() {
  const hoje = new Date().toISOString().slice(0, 10);
  const ha30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  _lcF = { dtIni: ha30, dtFim: hoje, camareira: '' };
  _relAbaLimpezasCamareira(document.getElementById('rel-aba-conteudo'));
}

async function _lcBuscar() {
  _lcFiltrar();
  const res = document.getElementById('lc-resultado');
  if (res) res.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text3);">⏳ Buscando...</div>';

  const hotelId = _relHotelId || currentUser?.hotelId;

  // Query 1: total sem filtro de data para diagnóstico
  const { data: totalData, error: totalErr } = await supabaseClient
    .from('limpeza_sessoes')
    .select('id, created_at', { count: 'exact' })
    .eq('hotel_id', hotelId)
    .limit(1);
  const totalBanco = totalErr ? null : (totalData?.length >= 0 ? 'ok' : '?');

  // Query 2: sem hotel_id para verificar se há dados sem hotel vinculado
  const { data: semHotel } = await supabaseClient
    .from('limpeza_sessoes')
    .select('id, hotel_id, created_at')
    .is('hotel_id', null)
    .limit(5);

  // Query 3: tudo sem filtro de hotel (limitado)
  const { data: todosSemFiltro } = await supabaseClient
    .from('limpeza_sessoes')
    .select('id, hotel_id, created_at, camareira_id')
    .order('created_at', { ascending: false })
    .limit(10);

  // Query principal com filtros
  let q = supabaseClient.from('limpeza_sessoes')
    .select('id, apartment_id, camareira_id, tipo_limpeza, inicio_at, fim_at, obs, created_at')
    .order('created_at', { ascending: true })
    .limit(2000);

  if (hotelId)        q = q.eq('hotel_id', hotelId);
  if (_lcF.camareira) q = q.eq('camareira_id', _lcF.camareira);
  if (_lcF.dtIni)     q = q.gte('created_at', _lcF.dtIni + 'T00:00:00');
  if (_lcF.dtFim)     q = q.lte('created_at', _lcF.dtFim + 'T23:59:59');

  // Query conferências aprovadas — executa em paralelo com limpeza_sessoes
  let qConf = supabaseClient.from('conferencia_supervisora_checklists')
    .select('id, apartment_id, obs, resultado, usuario_id, created_at')
    .eq('hotel_id', hotelId)
    .in('resultado', ['aprovado', 'aprovar'])
    .order('created_at', { ascending: true })
    .limit(2000);
  if (_lcF.camareira) qConf = qConf.eq('usuario_id', _lcF.camareira);
  if (_lcF.dtIni)     qConf = qConf.gte('created_at', _lcF.dtIni + 'T00:00:00');
  if (_lcF.dtFim)     qConf = qConf.lte('created_at', _lcF.dtFim + 'T23:59:59');

  const [{ data, error }, { data: confData }] = await Promise.all([q, qConf]);
  if (error) {
    if (res) res.innerHTML = `<div style="padding:24px;text-align:center;color:var(--danger);">Erro ao buscar dados: ${error.message}</div>`;
    return;
  }

  const sessoes      = data || [];
  const conferencias = confData || [];
  const { aptoById, equipe } = _relData;

  // Unificar e ordenar cronologicamente
  const registros = [
    ...sessoes.map(s => ({ ...s, _tipo: 'limpeza' })),
    ...conferencias.map(c => ({ ...c, _tipo: 'conferencia' })),
  ].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  const totalLimpezas    = sessoes.length;
  const totalConferencias = conferencias.length;
  const comFim   = sessoes.filter(s => s.fim_at).length;
  const minTotal = sessoes.reduce((acc, s) => {
    if (!s.fim_at || !s.created_at) return acc;
    return acc + Math.round((new Date(s.fim_at) - new Date(s.created_at)) / 60000);
  }, 0);
  const mediaMin = comFim > 0 ? Math.round(minTotal / comFim) : null;

  const nomeUsuario = _lcF.camareira
    ? (equipe.find(u => u.user_id === _lcF.camareira)?.nome || '—')
    : 'Todos os usuários';
  const periodoTx = (_lcF.dtIni || _lcF.dtFim)
    ? `${_lcF.dtIni ? _lcF.dtIni.split('-').reverse().join('/') : '…'} a ${_lcF.dtFim ? _lcF.dtFim.split('-').reverse().join('/') : '…'}`
    : 'Todo o período';

  const printSub = document.getElementById('lc-print-subtitulo');
  const printEmt = document.getElementById('lc-print-emitido');
  if (printSub) printSub.innerHTML = `Usuário: <strong>${nomeUsuario}</strong> &nbsp;|&nbsp; Período: <strong>${periodoTx}</strong>`;
  if (printEmt) printEmt.textContent = `Emitido em ${new Date().toLocaleString('pt-BR')}`;

  function _durMin(s) {
    if (!s.fim_at) return null;
    const ini = s.inicio_at || s.created_at;
    if (!ini) return null;
    return Math.round((new Date(s.fim_at) - new Date(ini)) / 60000);
  }

  const thStyle = 'padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--text3);white-space:nowrap;';

  const linhas = registros.map(r => {
    const apto   = aptoById[r.apartment_id];
    const isLimp = r._tipo === 'limpeza';
    const _dtRef  = new Date(isLimp ? (r.inicio_at || r.created_at) : r.created_at);
    const dataExib = isNaN(_dtRef) ? '—' : _dtRef.toLocaleDateString('pt-BR');
    const hrIni    = isNaN(_dtRef) ? '—' : _dtRef.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const hrFim    = isLimp && r.fim_at
      ? new Date(r.fim_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : (isLimp ? '—' : hrIni);
    const dur      = isLimp ? _durMin(r) : null;
    const atrasado = isLimp && dur != null && r.tipo_limpeza && dur > (_tlMetaMs(r.tipo_limpeza) / 60000 * 1.2);
    const usuarioId = isLimp ? r.camareira_id : r.usuario_id;
    const nomeUser  = equipe.find(u => u.user_id === usuarioId)?.nome || '—';
    const atividadeBadge = isLimp
      ? `<span style="background:#dbeafe;color:#1d4ed8;border-radius:10px;padding:2px 8px;font-size:11px;font-weight:600;">${_tlLabelTipo(r.tipo_limpeza)}</span>`
      : `<span style="background:#dcfce7;color:#166534;border-radius:10px;padding:2px 8px;font-size:11px;font-weight:600;">Confer\xEAncia ✓</span>`;
    return `<tr style="border-bottom:1px solid var(--border);">
      <td style="padding:8px 12px;white-space:nowrap;">${dataExib}</td>
      <td style="padding:8px 12px;font-weight:700;">${apto?.numero || '—'}</td>
      <td style="padding:8px 12px;">${nomeUser}</td>
      <td style="padding:8px 12px;">${atividadeBadge}</td>
      <td style="padding:8px 12px;">${hrIni}</td>
      <td style="padding:8px 12px;">${hrFim}</td>
      <td style="padding:8px 12px;${atrasado ? 'color:#dc2626;font-weight:600;' : ''}">${isLimp ? _lcFmtMin(dur) : '—'}</td>
      <td style="padding:8px 12px;">${r.obs || '—'}</td>
    </tr>`;
  }).join('');

  const tabelaHtml = registros.length === 0
    ? `<div style="padding:40px;text-align:center;color:var(--text3);font-size:13px;">
        Nenhum registro encontrado para os filtros selecionados.</div>`
    : `<div style="overflow:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:var(--surface2);">
            <th style="${thStyle}">Data</th><th style="${thStyle}">Apto</th>
            <th style="${thStyle}">Usu\xE1rio</th>
            <th style="${thStyle}">Atividade</th>
            <th style="${thStyle}">In\xEDcio</th><th style="${thStyle}">Fim</th>
            <th style="${thStyle}">Dura\xE7\xE3o</th><th style="${thStyle}">Observa\xE7\xF5es</th>
          </tr></thead>
          <tbody>${linhas}</tbody>
        </table>
       </div>`;

  if (res) res.innerHTML = `
    <!-- Totalizadores -->
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
      <div class="card" style="padding:14px 18px;flex:1;min-width:120px;text-align:center;">
        <div style="font-size:26px;font-weight:700;color:var(--primary);">${totalLimpezas}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px;">Limpezas</div>
      </div>
      <div class="card" style="padding:14px 18px;flex:1;min-width:120px;text-align:center;">
        <div style="font-size:26px;font-weight:700;color:#166534;">${totalConferencias}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px;">Confer\xEAncias ✓</div>
      </div>
      <div class="card" style="padding:14px 18px;flex:1;min-width:120px;text-align:center;">
        <div style="font-size:26px;font-weight:700;color:var(--primary);">${_lcFmtMin(minTotal)}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px;">Tempo total limpeza</div>
      </div>
      <div class="card" style="padding:14px 18px;flex:1;min-width:120px;text-align:center;">
        <div style="font-size:26px;font-weight:700;color:var(--primary);">${_lcFmtMin(mediaMin)}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px;">Dura\xE7\xE3o m\xE9dia</div>
      </div>
    </div>
    <!-- Tabela -->
    <div class="card" style="padding:0;overflow:hidden;">${tabelaHtml}</div>`;
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
