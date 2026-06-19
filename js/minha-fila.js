// ================================================================
// MINHA FILA — Gov Estancorp
// Visualização operacional por perfil.
// Reutiliza: aptos[], equipe[], mudarStatusApto(), iniciarLimpeza(),
//            abrirModalPausa(), concluirLimpeza(), aprovarLimpeza(),
//            abrirModalReprovacao(), openAptoDetail()
// ================================================================

async function renderMinhaFila() {
  const el = document.getElementById('mf-content');
  if (!el) return;

  // Seletor de hotel para admin_global; chip informativo para os demais
  if (currentUser.perfil === 'admin_global') {
    await _mfSetupHotelSelector();
    if (!_aptoViewHotelId) {
      el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text3);">
        Selecione um hotel para visualizar a fila.</div>`;
      return;
    }
  } else {
    if (typeof _renderHotelChip === 'function') _renderHotelChip('mf-hotel-selector');
  }

  el.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text3);">
    <div class="spinner" style="margin:0 auto 12px;border-top-color:var(--primary-light);"></div>
    Carregando fila...
  </div>`;

  // Garante que aptos estão carregados para o hotel correto
  const hotelId = currentUser.perfil === 'admin_global'
    ? _aptoViewHotelId
    : currentUser.hotelId;
  if (hotelId && (!aptos.length || aptos[0]?.hotel_id !== hotelId)) {
    if (typeof _aptoViewHotelId !== 'undefined') _aptoViewHotelId = hotelId;
    if (typeof syncApartamentos === 'function') await syncApartamentos();
  }

  const perfil = currentUser.perfil;
  if (perfil === 'camareira') {
    _mfRenderCamareira(el);
  } else {
    _mfRenderGestor(el);
  }
}

async function _mfSetupHotelSelector() {
  const wrap = document.getElementById('mf-hotel-selector');
  if (!wrap) return;
  wrap.style.display = '';
  if (wrap.querySelector('select')) {
    // Já renderizado — apenas sincroniza seleção
    const sel = document.getElementById('mf-hotel-select');
    if (sel && _aptoViewHotelId) sel.value = _aptoViewHotelId;
    return;
  }
  const { data: hotels } = await supabaseClient
    .from('hotels').select('id, nome').eq('ativo', true).order('nome');
  wrap.innerHTML = `
    <div class="card" style="padding:10px 16px;margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <span style="font-size:13px;font-weight:600;color:var(--text2);">🏨 Hotel:</span>
        <select id="mf-hotel-select"
          style="flex:1;min-width:200px;padding:7px 10px;border:1.5px solid var(--border);
                 border-radius:var(--radius-sm);font-size:13px;"
          onchange="_mfSelecionarHotel(this.value)">
          <option value="">Selecione um hotel...</option>
          ${(hotels||[]).map(h =>
            `<option value="${h.id}" ${h.id === _aptoViewHotelId ? 'selected' : ''}>${h.nome}</option>`
          ).join('')}
        </select>
      </div>
    </div>`;
}

async function _mfSelecionarHotel(hotelId) {
  if (typeof _aptoViewHotelId !== 'undefined') _aptoViewHotelId = hotelId || null;
  await renderMinhaFila();
}

// ── CAMAREIRA: fila de limpeza ────────────────────────────────

function _mfRenderCamareira(el) {
  const nome = currentUser.nome?.split(' ')[0] || 'Camareira';
  const uid  = currentUser.id;

  // limpando é estado transitório (modal aberto) — não aparece na fila
  const statusUrgencia = { reprovado:0, pausado:1, sujo:2, conferencia:3 };

  // 1. Minha atribuição — qualquer status operacional com meu maid_id
  const meusAptos = aptos
    .filter(a => a.camareira_id === uid && a.status in statusUrgencia)
    .sort((a, b) => (statusUrgencia[a.status] ?? 9) - (statusUrgencia[b.status] ?? 9));

  const meusIds = new Set(meusAptos.map(a => a.id));

  // 2. Reprovados disponíveis (não atribuídos a mim)
  const reprovDisp = aptos.filter(a => a.status === 'reprovado' && !meusIds.has(a.id));

  // 3. Sujos sem responsável (sem nenhuma camareira, não atribuído a mim)
  const sujosSemCam = aptos.filter(a => a.status === 'sujo' && !a.camareira_id && !meusIds.has(a.id));

  // 4. Demais (pausados/limpando não meus, conferencia não minha, etc.)
  const demaisIds = new Set([...meusIds, ...reprovDisp.map(a=>a.id), ...sujosSemCam.map(a=>a.id)]);
  const demais = aptos.filter(a => !demaisIds.has(a.id) && a.status in statusUrgencia);

  const _camLineCam = a => {
    const cam = (typeof equipe !== 'undefined' ? equipe : []).find(e => e.id === a.camareira_id);
    return cam
      ? `<div style="font-size:11px;color:var(--text3);margin-top:3px;">🧹 ${cam.nome}</div>`
      : `<div style="font-size:11px;font-weight:700;color:var(--danger);margin-top:3px;">👤 Sem responsável</div>`;
  };

  const _cardCamareira = (a, corBorda, corTexto = 'var(--text)') => `
    <div class="card" style="margin-bottom:10px;border-left:4px solid ${corBorda};padding:14px 16px;">
      ${a.prioridade ? `<div style="font-size:11px;font-weight:700;color:var(--danger);margin-bottom:6px;">⚠️ PRIORIDADE</div>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px;">
        <div>
          <div style="font-size:22px;font-weight:800;color:${corTexto};line-height:1;">${a.numero}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:3px;">
            ${a.tipo} &nbsp;·&nbsp; ${a.andar}º andar &nbsp;·&nbsp; ${a.leitos} leito${a.leitos !== 1 ? 's' : ''}
          </div>
          ${_camLineCam(a)}
        </div>
        <span class="badge badge-${a.status}" style="flex-shrink:0;">${_STATUS_LABELS?.[a.status] || a.status}</span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${_mfBtnsCamareira(a)}
        <button class="btn btn-ghost btn-sm" onclick="openAptoDetail('${a.id}')">👁 Ver</button>
      </div>
    </div>`;

  const _secao = (id, icon, label, cor, lista, renderFn) => {
    if (!lista.length) return '';
    return `<div id="${id}" style="margin-bottom:22px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid ${cor};">
        <span style="font-size:15px;">${icon}</span>
        <span style="font-size:12px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;">${label}</span>
        <span style="background:${cor};color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;margin-left:auto;">${lista.length}</span>
      </div>
      ${lista.map(renderFn).join('')}
    </div>`;
  };

  let html = `
    <div style="background:linear-gradient(135deg,var(--primary),var(--primary-dark,#1a3a6e));
                color:white;padding:18px 20px;border-radius:var(--radius);margin-bottom:20px;">
      <div style="font-size:12px;opacity:0.75;margin-bottom:2px;">Olá,</div>
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;">${nome}</div>
      <div style="font-size:13px;opacity:0.85;margin-top:6px;">${aptos.length} apartamento${aptos.length !== 1 ? 's' : ''} no hotel</div>
    </div>`;

  // 1. Minha atribuição
  html += _secao('mf-sec-meus', '📌', 'Minha atribuição', '#1d4ed8', meusAptos,
    a => `<div class="card" style="margin-bottom:10px;border-left:4px solid #1d4ed8;padding:14px 16px;
              background:linear-gradient(135deg,#eff6ff 0%,#fff 60%);box-shadow:0 2px 12px rgba(29,78,216,0.10);">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;
          background:#dbeafe;color:#1d4ed8;padding:5px 10px;border-radius:6px;font-size:11px;font-weight:700;">
        📌 Atribuído a mim</div>
      ${a.prioridade ? `<div style="font-size:11px;font-weight:700;color:var(--danger);margin-bottom:6px;">⚠️ PRIORIDADE</div>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px;">
        <div>
          <div style="font-size:22px;font-weight:800;color:#1d4ed8;line-height:1;">${a.numero}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:3px;">
            ${a.tipo} &nbsp;·&nbsp; ${a.andar}º andar &nbsp;·&nbsp; ${a.leitos} leito${a.leitos !== 1 ? 's' : ''}
          </div>
          ${_camLineCam(a)}
        </div>
        <span class="badge badge-${a.status}" style="flex-shrink:0;">${_STATUS_LABELS?.[a.status] || a.status}</span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${_mfBtnsCamareira(a)}
        <button class="btn btn-ghost btn-sm" onclick="openAptoDetail('${a.id}')">👁 Ver</button>
      </div>
    </div>`);

  // 2. Reprovados disponíveis
  html += _secao('mf-sec-reprov', '❌', 'Reprovados — disponíveis', '#e74c3c', reprovDisp,
    a => _cardCamareira(a, '#e74c3c'));

  // 3. Sujos sem responsável
  html += _secao('mf-sec-sem-cam', '🟠', 'Para limpar — sem responsável', '#e67e22', sujosSemCam,
    a => `<div class="card" style="margin-bottom:10px;border-left:4px solid #e67e22;padding:14px 16px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px;">
        <div>
          <div style="font-size:22px;font-weight:800;line-height:1;">${a.numero}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:3px;">${a.tipo} &nbsp;·&nbsp; ${a.andar}º andar</div>
          ${_camLineCam(a)}
        </div>
        <span class="badge badge-sujo" style="flex-shrink:0;">Sujo</span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${_mfBtnsCamareira(a)}
        <button class="btn btn-ghost btn-sm" onclick="openAptoDetail('${a.id}')">👁 Ver</button>
      </div>
    </div>`);

  // 4. Demais
  if (demais.length) {
    const dGrupos = [
      { key:'pausado',    label:'Pausados',   icon:'⏸', color:'#f39c12' },
      { key:'sujo',       label:'Para limpar',icon:'🟠', color:'#e67e22' },
      { key:'conferencia',label:'Ag. conf.',  icon:'🔍', color:'#8e44ad' },
    ];
    dGrupos.forEach(g => {
      const lista = demais.filter(a => a.status === g.key);
      html += _secao(`mf-sec-dem-${g.key}`, g.icon, g.label, g.color, lista,
        a => _cardCamareira(a, g.color));
    });
  }

  el.innerHTML = html;
}

function _mfBtnsCamareira(a) {
  switch (a.status) {
    case 'sujo':
      return `<button class="btn btn-primary btn-sm" onclick="mfAcao('${a.id}','iniciar')">▶ Iniciar limpeza</button>`;
    case 'reprovado':
      return `<button class="btn btn-primary btn-sm" onclick="mfAcao('${a.id}','relimpar')">▶ Re-limpar</button>`;
    case 'pausado':
      return `<button class="btn btn-primary btn-sm" onclick="mfAcao('${a.id}','retomar')">▶ Retomar limpeza</button>`;
    case 'limpando':
      return `<button class="btn btn-warning btn-sm" onclick="mfAcao('${a.id}','pausar')">⏸ Pausar</button>
              <button class="btn btn-danger btn-sm"   onclick="mfAcao('${a.id}','cancelar')">🚫 Cancelar</button>
              <button class="btn btn-success btn-sm"  onclick="mfAcao('${a.id}','concluir')">🔍 Enviar conf.</button>`;
    default:
      return '';
  }
}

// ── MANUTENÇÃO: redirecionamento simples ──────────────────────
function _mfRenderManutencao(el) {
  const chamados = (typeof aptos !== 'undefined' ? aptos : []).filter(a => a.status === 'manutencao');
  el.innerHTML = `
    <div class="card" style="text-align:center;padding:32px 20px;">
      <div style="font-size:40px;margin-bottom:12px;">🔧</div>
      <div style="font-size:16px;font-weight:700;margin-bottom:6px;">Olá, ${currentUser.nome?.split(' ')[0] || 'Manutenção'}!</div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:18px;">
        Sua fila de trabalho está nos <strong>Chamados</strong>.<br>
        Apartamentos em manutenção: <strong>${chamados.length}</strong>
      </div>
      <button class="btn btn-primary" onclick="openPage('chamados')">🔧 Ver meus chamados</button>
    </div>`;
}

// ── GESTOR / SUPERVISORA / ADMIN: fila de supervisão ─────────

function _mfRenderGestor(el) {
  const conferencia  = aptos.filter(a => a.status === 'conferencia');
  const reprovados   = aptos.filter(a => a.status === 'reprovado');
  const limpandoApts = aptos.filter(a => a.status === 'limpando');
  const pausadoApts  = aptos.filter(a => a.status === 'pausado');
  const limpando     = [...limpandoApts, ...pausadoApts];
  const sujos        = aptos.filter(a => a.status === 'sujo');
  const limpos       = aptos.filter(a => a.status === 'limpo');
  const livres       = aptos.filter(a => a.status === 'livre');
  const ocupados     = aptos.filter(a => a.status === 'ocupado');
  const bloqueados   = aptos.filter(a => a.status === 'bloqueado');
  const manutencao   = aptos.filter(a => a.status === 'manutencao');
  const podeAprovar  = ['admin_global','admin_hotel','gestor','supervisora','governanta'].includes(currentUser?.perfil);

  // linha de responsável padronizada para todos os cards
  const _camLine = a => {
    const cam = (typeof equipe !== 'undefined' ? equipe : []).find(e => e.id === a.camareira_id);
    return cam
      ? `<div style="font-size:11px;color:var(--text3);margin-top:3px;">🧹 ${cam.nome}</div>`
      : `<div style="font-size:11px;font-weight:700;color:var(--danger);margin-top:3px;">👤 Sem responsável</div>`;
  };

  // ── Painel de contadores ──
  let html = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px;">
      <div class="card" style="text-align:center;padding:14px 10px;border-top:3px solid #8e44ad;cursor:pointer;"
           onclick="_mfScrollTo('mf-sec-conferencia')" title="Ver apartamentos aguardando conferência">
        <div style="font-size:30px;font-weight:800;color:#8e44ad;line-height:1;">${conferencia.length}</div>
        <div style="font-size:10px;color:var(--text2);font-weight:700;margin-top:4px;text-transform:uppercase;">Aguard. conf.</div>
      </div>
      <div class="card" style="text-align:center;padding:14px 10px;border-top:3px solid var(--danger);cursor:pointer;"
           onclick="_mfScrollTo('mf-sec-reprovados')" title="Ver apartamentos reprovados">
        <div style="font-size:30px;font-weight:800;color:var(--danger);line-height:1;">${reprovados.length}</div>
        <div style="font-size:10px;color:var(--text2);font-weight:700;margin-top:4px;text-transform:uppercase;">Reprovados</div>
      </div>
      <div class="card" style="text-align:center;padding:14px 10px;border-top:3px solid #2e86c1;cursor:pointer;"
           onclick="_mfScrollTo('mf-sec-limpando')" title="Ver apartamentos em limpeza">
        <div style="font-size:30px;font-weight:800;color:#2e86c1;line-height:1;">${limpandoApts.length}</div>
        <div style="font-size:10px;color:var(--text2);font-weight:700;margin-top:4px;text-transform:uppercase;">Em limpeza</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(72px,1fr));gap:10px;margin-bottom:14px;">
      <div class="card" style="text-align:center;padding:10px;border-top:2px solid #e67e22;cursor:pointer;"
           onclick="_mfScrollTo('mf-sec-sujos')">
        <div style="font-size:18px;font-weight:700;color:#e67e22;">${sujos.length}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;">Sujos</div>
      </div>
      ${pausadoApts.length ? `<div class="card" style="text-align:center;padding:10px;border-top:2px solid #f39c12;cursor:pointer;"
           onclick="_mfScrollTo('mf-sec-pausados')">
        <div style="font-size:18px;font-weight:700;color:#f39c12;">${pausadoApts.length}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;">Pausados</div>
      </div>` : ''}
      <div class="card" style="text-align:center;padding:10px;border-top:2px solid #1abc9c;cursor:pointer;"
           onclick="_mfScrollTo('mf-sec-limpos')">
        <div style="font-size:18px;font-weight:700;color:#1abc9c;">${limpos.length}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;">Limpos</div>
      </div>
      <div class="card" style="text-align:center;padding:10px;border-top:2px solid var(--success);cursor:pointer;"
           onclick="_mfScrollTo('mf-sec-livres')">
        <div style="font-size:18px;font-weight:700;color:var(--success);">${livres.length}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;">Vagos</div>
      </div>
      ${ocupados.length ? `<div class="card" style="text-align:center;padding:10px;border-top:2px solid #7f8c8d;cursor:pointer;"
           onclick="_mfScrollTo('mf-sec-ocupados')">
        <div style="font-size:18px;font-weight:700;color:#7f8c8d;">${ocupados.length}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;">Ocupados</div>
      </div>` : ''}
      ${bloqueados.length ? `<div class="card" style="text-align:center;padding:10px;border-top:2px solid #c0392b;cursor:pointer;"
           onclick="_mfScrollTo('mf-sec-bloqueados')">
        <div style="font-size:18px;font-weight:700;color:#c0392b;">${bloqueados.length}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;">Bloqueados</div>
      </div>` : ''}
      ${manutencao.length ? `<div class="card" style="text-align:center;padding:10px;border-top:2px solid #e67e22;cursor:pointer;"
           onclick="_mfScrollTo('mf-sec-manutencao')">
        <div style="font-size:18px;font-weight:700;color:#e67e22;">${manutencao.length}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;">Manutenção</div>
      </div>` : ''}
    </div>`;

  // ── Aguardando conferência ──
  if (conferencia.length) {
    html += `<div id="mf-sec-conferencia" style="margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;
                  padding-bottom:8px;border-bottom:2px solid #8e44ad;">
        <span style="font-size:16px;">🔍</span>
        <span style="font-size:12px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;">
          Aguardando conferência
        </span>
        <span style="background:#8e44ad;color:#fff;font-size:10px;font-weight:700;
                     padding:2px 8px;border-radius:10px;margin-left:auto;">${conferencia.length}</span>
      </div>`;
    conferencia.forEach(a => {
      html += `
      <div class="card" style="margin-bottom:10px;border-left:4px solid #8e44ad;padding:14px 16px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px;">
          <div>
            <div style="font-size:22px;font-weight:800;line-height:1;">${a.numero}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:3px;">${a.tipo} · ${a.andar}º andar</div>
            ${_camLine(a)}
          </div>
          <span class="badge badge-conferencia" style="flex-shrink:0;">Aguard. conf.</span>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${podeAprovar ? `
          <button class="btn btn-success btn-sm" onclick="mfAcao('${a.id}','aprovar')">✅ Aprovar limpeza</button>
          <button class="btn btn-danger btn-sm"  onclick="mfAcao('${a.id}','reprovar')">❌ Reprovar</button>` : ''}
          <button class="btn btn-ghost btn-sm"   onclick="openAptoDetail('${a.id}')">👁 Ver</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // ── Reprovados ──
  if (reprovados.length) {
    html += `<div id="mf-sec-reprovados" style="margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;
                  padding-bottom:8px;border-bottom:2px solid var(--danger);">
        <span style="font-size:16px;">❌</span>
        <span style="font-size:12px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;">
          Reprovados — aguardando re-limpeza
        </span>
        <span style="background:var(--danger);color:#fff;font-size:10px;font-weight:700;
                     padding:2px 8px;border-radius:10px;margin-left:auto;">${reprovados.length}</span>
      </div>`;
    reprovados.forEach(a => {
      html += `
      <div class="card" style="margin-bottom:10px;border-left:4px solid var(--danger);padding:14px 16px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div>
            <div style="font-size:22px;font-weight:800;line-height:1;">${a.numero}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:3px;">${a.tipo} · ${a.andar}º andar</div>
            ${_camLine(a)}
          </div>
          <span class="badge badge-reprovado" style="flex-shrink:0;">Reprovado</span>
        </div>
        <div style="margin-top:10px;">
          <button class="btn btn-ghost btn-sm" onclick="openAptoDetail('${a.id}')">👁 Ver detalhes</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // ── Para limpar (Sujos) — sem responsável primeiro ──
  if (sujos.length) {
    // Ordenar: sem camareira primeiro, depois com camareira
    const sujosOrdenados = [...sujos].sort((a, b) => {
      if (!a.camareira_id && b.camareira_id) return -1;
      if (a.camareira_id && !b.camareira_id) return 1;
      return 0;
    });
    html += `<div id="mf-sec-sujos" style="margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;
                  padding-bottom:8px;border-bottom:2px solid #e67e22;">
        <span style="font-size:16px;">🟠</span>
        <span style="font-size:12px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;">Para limpar</span>
        <span style="background:#e67e22;color:#fff;font-size:10px;font-weight:700;
                     padding:2px 8px;border-radius:10px;margin-left:auto;">${sujos.length}</span>
      </div>`;
    sujosOrdenados.forEach(a => {
      const semResp = !a.camareira_id;
      html += `
      <div class="card" style="margin-bottom:10px;border-left:4px solid ${semResp ? 'var(--danger)' : '#e67e22'};padding:14px 16px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div>
            <div style="font-size:22px;font-weight:800;line-height:1;">${a.numero}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:3px;">${a.tipo} · ${a.andar}º andar</div>
            ${_camLine(a)}
          </div>
          <span class="badge badge-sujo" style="flex-shrink:0;">Sujo</span>
        </div>
        <div style="margin-top:10px;">
          <button class="btn btn-ghost btn-sm" onclick="openAptoDetail('${a.id}')">👁 Ver detalhes</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // ── Em limpeza ──
  if (limpandoApts.length) {
    html += `<div id="mf-sec-limpando" style="margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;
                  padding-bottom:8px;border-bottom:2px solid #2e86c1;">
        <span style="font-size:16px;">🧹</span>
        <span style="font-size:12px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;">Em limpeza agora</span>
        <span style="background:#2e86c1;color:#fff;font-size:10px;font-weight:700;
                     padding:2px 8px;border-radius:10px;margin-left:auto;">${limpandoApts.length}</span>
      </div>`;
    limpandoApts.forEach(a => {
      html += `
      <div class="card" style="margin-bottom:10px;border-left:4px solid #2e86c1;padding:14px 16px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div>
            <div style="font-size:22px;font-weight:800;line-height:1;">${a.numero}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:3px;">${a.tipo} · ${a.andar}º andar</div>
            ${_camLine(a)}
          </div>
          <span class="badge badge-limpando" style="flex-shrink:0;">Limpando</span>
        </div>
        <div style="margin-top:10px;">
          <button class="btn btn-ghost btn-sm" onclick="openAptoDetail('${a.id}')">👁 Ver detalhes</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // ── Pausados ──
  if (pausadoApts.length) {
    html += `<div id="mf-sec-pausados" style="margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;
                  padding-bottom:8px;border-bottom:2px solid #f39c12;">
        <span style="font-size:16px;">⏸</span>
        <span style="font-size:12px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;">Pausados — limpeza interrompida</span>
        <span style="background:#f39c12;color:#fff;font-size:10px;font-weight:700;
                     padding:2px 8px;border-radius:10px;margin-left:auto;">${pausadoApts.length}</span>
      </div>`;
    pausadoApts.forEach(a => {
      html += `
      <div class="card" style="margin-bottom:10px;border-left:4px solid #f39c12;padding:14px 16px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div>
            <div style="font-size:22px;font-weight:800;line-height:1;">${a.numero}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:3px;">${a.tipo} · ${a.andar}º andar</div>
            ${_camLine(a)}
            ${a.obs ? `<div style="font-size:11px;color:var(--text3);margin-top:3px;font-style:italic;">${a.obs}</div>` : ''}
          </div>
          <span class="badge badge-pausado" style="flex-shrink:0;">Pausado</span>
        </div>
        <div style="margin-top:10px;">
          <button class="btn btn-ghost btn-sm" onclick="openAptoDetail('${a.id}')">👁 Ver detalhes</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // ── Bloqueados ──
  if (bloqueados.length) {
    html += `<div id="mf-sec-bloqueados" style="margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;
                  padding-bottom:8px;border-bottom:2px solid #7f8c8d;">
        <span style="font-size:16px;">🔒</span>
        <span style="font-size:12px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;">
          Bloqueados
        </span>
        <span style="background:#7f8c8d;color:#fff;font-size:10px;font-weight:700;
                     padding:2px 8px;border-radius:10px;margin-left:auto;">${bloqueados.length}</span>
      </div>`;
    bloqueados.forEach(a => {
      html += `
      <div class="card" style="margin-bottom:10px;border-left:4px solid #7f8c8d;padding:14px 16px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div>
            <div style="font-size:22px;font-weight:800;line-height:1;">${a.numero}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:3px;">${a.tipo} · ${a.andar}º andar</div>
            ${_camLine(a)}
            ${a.obs ? `<div style="font-size:11px;color:var(--text3);margin-top:3px;font-style:italic;">${a.obs}</div>` : ''}
          </div>
          <span class="badge badge-bloqueado" style="flex-shrink:0;">Bloqueado</span>
        </div>
        <div style="margin-top:10px;">
          <button class="btn btn-ghost btn-sm" onclick="openAptoDetail('${a.id}')">👁 Ver detalhes</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // ── Em Manutenção ──
  if (manutencao.length) {
    html += `<div id="mf-sec-manutencao" style="margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;
                  padding-bottom:8px;border-bottom:2px solid #e67e22;">
        <span style="font-size:16px;">🔧</span>
        <span style="font-size:12px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;">
          Em Manutenção
        </span>
        <span style="background:#e67e22;color:#fff;font-size:10px;font-weight:700;
                     padding:2px 8px;border-radius:10px;margin-left:auto;">${manutencao.length}</span>
      </div>`;
    manutencao.forEach(a => {
      html += `
      <div class="card" style="margin-bottom:10px;border-left:4px solid #e67e22;padding:14px 16px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div>
            <div style="font-size:22px;font-weight:800;line-height:1;">${a.numero}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:3px;">${a.tipo} · ${a.andar}º andar</div>
            ${_camLine(a)}
            ${a.obs ? `<div style="font-size:11px;color:var(--text3);margin-top:3px;font-style:italic;">${a.obs}</div>` : ''}
          </div>
          <span class="badge" style="background:#fdebd0;color:#b9770e;flex-shrink:0;">🔧 Manutenção</span>
        </div>
        <div style="margin-top:10px;">
          <button class="btn btn-ghost btn-sm" onclick="openAptoDetail('${a.id}')">👁 Ver detalhes</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // ── Limpos ──
  if (limpos.length) {
    html += `<div id="mf-sec-limpos" style="margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;
                  padding-bottom:8px;border-bottom:2px solid #1abc9c;">
        <span style="font-size:16px;">✨</span>
        <span style="font-size:12px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;">Limpos</span>
        <span style="background:#1abc9c;color:#fff;font-size:10px;font-weight:700;
                     padding:2px 8px;border-radius:10px;margin-left:auto;">${limpos.length}</span>
      </div>`;
    limpos.forEach(a => {
      html += `
      <div class="card" style="margin-bottom:10px;border-left:4px solid #1abc9c;padding:14px 16px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div>
            <div style="font-size:22px;font-weight:800;line-height:1;">${a.numero}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:3px;">${a.tipo} · ${a.andar}º andar</div>
            ${_camLine(a)}
          </div>
          <span class="badge badge-limpo" style="flex-shrink:0;">Limpo</span>
        </div>
        <div style="margin-top:10px;">
          <button class="btn btn-ghost btn-sm" onclick="openAptoDetail('${a.id}')">👁 Ver detalhes</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // ── Livres ──
  if (livres.length) {
    html += `<div id="mf-sec-livres" style="margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;
                  padding-bottom:8px;border-bottom:2px solid var(--success);">
        <span style="font-size:16px;">✅</span>
        <span style="font-size:12px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;">Vagos</span>
        <span style="background:var(--success);color:#fff;font-size:10px;font-weight:700;
                     padding:2px 8px;border-radius:10px;margin-left:auto;">${livres.length}</span>
      </div>`;
    livres.forEach(a => {
      html += `
      <div class="card" style="margin-bottom:10px;border-left:4px solid var(--success);padding:14px 16px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div>
            <div style="font-size:22px;font-weight:800;line-height:1;">${a.numero}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:3px;">${a.tipo} · ${a.andar}º andar</div>
            ${_camLine(a)}
          </div>
          <span class="badge badge-livre" style="flex-shrink:0;">Vago</span>
        </div>
        <div style="margin-top:10px;">
          <button class="btn btn-ghost btn-sm" onclick="openAptoDetail('${a.id}')">👁 Ver detalhes</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // ── Ocupados ──
  if (ocupados.length) {
    html += `<div id="mf-sec-ocupados" style="margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;
                  padding-bottom:8px;border-bottom:2px solid #7f8c8d;">
        <span style="font-size:16px;">🏠</span>
        <span style="font-size:12px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;">Ocupados</span>
        <span style="background:#7f8c8d;color:#fff;font-size:10px;font-weight:700;
                     padding:2px 8px;border-radius:10px;margin-left:auto;">${ocupados.length}</span>
      </div>`;
    ocupados.forEach(a => {
      html += `
      <div class="card" style="margin-bottom:10px;border-left:4px solid #7f8c8d;padding:14px 16px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div>
            <div style="font-size:22px;font-weight:800;line-height:1;">${a.numero}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:3px;">${a.tipo} · ${a.andar}º andar</div>
            ${_camLine(a)}
            ${a.obs ? `<div style="font-size:11px;color:var(--text3);margin-top:3px;font-style:italic;">${a.obs}</div>` : ''}
          </div>
          <span class="badge badge-ocupado" style="flex-shrink:0;">Ocupado</span>
        </div>
        <div style="margin-top:10px;">
          <button class="btn btn-ghost btn-sm" onclick="openAptoDetail('${a.id}')">👁 Ver detalhes</button>
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // ── Atalhos ──
  html += `<div class="card" style="padding:14px 16px;">
    <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:10px;">Navegação rápida</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-ghost btn-sm" onclick="openPage('mapa')">🗺️ Mapa completo</button>
      <button class="btn btn-ghost btn-sm" onclick="openPage('kanban')">📋 Kanban</button>
    </div>
  </div>`;

  el.innerHTML = html;
}

// ── SCROLL HELPER ─────────────────────────────────────────────
function _mfScrollTo(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior:'smooth', block:'start' });
}

// ── DISPATCHER DE AÇÕES ───────────────────────────────────────
function mfAcao(id, acao) {
  selectedAptoId = id;
  if (acao === 'iniciar')  { iniciarLimpeza(); }
  if (acao === 'relimpar') { iniciarLimpeza(); }
  if (acao === 'retomar')  { iniciarLimpeza(); }
  if (acao === 'pausar')   abrirModalPausa(id);
  if (acao === 'cancelar') { _carregarMotivosCancelModal(); }
  if (acao === 'concluir') concluirLimpeza();
  if (acao === 'aprovar')  aprovarLimpeza();
  if (acao === 'reprovar') abrirModalReprovacao();
}

// RE-RENDER após mudança de status é gerenciado por apartments.js
// (window.mudarStatusApto já chama renderMinhaFila quando currentPage === 'minha-fila')

// ── PATCH openPage ────────────────────────────────────────────
(function patchOpenPageMinhaFila() {
  if (window._minhaFilaPatch) return;
  window._minhaFilaPatch = true;
  const _prev = openPage;
  openPage = function(id) {
    _prev(id);
    if (id === 'minha-fila') renderMinhaFila();
  };
})();
