// ================================================================
// MINHA FILA — GovHotel
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

  // Aptos que a camareira trabalha: reprovado > pausado > limpando > sujo
  const fila = aptos.filter(a =>
    ['sujo','limpando','pausado','reprovado'].includes(a.status)
  );

  const grupos = [
    { key:'reprovado', label:'Re-limpeza necessária', icon:'❌', color:'#e74c3c', badge:'badge-reprovado' },
    { key:'pausado',   label:'Pausados — retomar',    icon:'⏸', color:'#f39c12', badge:'badge-pausado'   },
    { key:'limpando',  label:'Em andamento',           icon:'🧹', color:'#2e86c1', badge:'badge-limpando'  },
    { key:'sujo',      label:'Para limpar',            icon:'🟠', color:'#e67e22', badge:'badge-sujo'      },
  ];

  let html = `
    <div style="background:linear-gradient(135deg,var(--primary),var(--primary-dark,#1a3a6e));
                color:white;padding:18px 20px;border-radius:var(--radius);margin-bottom:20px;">
      <div style="font-size:12px;opacity:0.75;margin-bottom:2px;">Boa operação,</div>
      <div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;">${nome}</div>
      <div style="font-size:13px;opacity:0.85;margin-top:6px;">
        ${fila.length
          ? `${fila.length} apartamento${fila.length !== 1 ? 's' : ''} na sua fila`
          : '✅ Nenhum apartamento pendente'}
      </div>
    </div>`;

  if (!fila.length) {
    html += `<div class="card" style="text-align:center;padding:40px;">
      <div style="font-size:48px;margin-bottom:12px;">🎉</div>
      <div style="font-weight:700;font-size:16px;margin-bottom:6px;">Fila zerada!</div>
      <div style="font-size:13px;color:var(--text3);">Todos os apartamentos foram tratados.</div>
    </div>`;
    el.innerHTML = html;
    return;
  }

  grupos.forEach(g => {
    const lista = fila.filter(a => a.status === g.key);
    if (!lista.length) return;

    html += `<div style="margin-bottom:22px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;
                  padding-bottom:8px;border-bottom:2px solid ${g.color};">
        <span style="font-size:15px;">${g.icon}</span>
        <span style="font-size:12px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;">${g.label}</span>
        <span style="background:${g.color};color:#fff;font-size:10px;font-weight:700;
                     padding:2px 8px;border-radius:10px;margin-left:auto;">${lista.length}</span>
      </div>`;

    lista.forEach(a => {
      html += `
      <div class="card" style="margin-bottom:10px;border-left:4px solid ${a.prioridade ? 'var(--danger)' : g.color};padding:14px 16px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px;">
          <div>
            <div style="font-size:22px;font-weight:800;color:var(--text);line-height:1;">${a.numero}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:3px;">
              ${a.tipo} &nbsp;·&nbsp; ${a.andar}º andar &nbsp;·&nbsp; ${a.leitos} leito${a.leitos !== 1 ? 's' : ''}
            </div>
            ${a.prioridade ? `<div style="font-size:11px;font-weight:700;color:var(--danger);margin-top:4px;">⚠️ PRIORIDADE</div>` : ''}
            ${a.obs        ? `<div style="font-size:11px;color:var(--text3);margin-top:4px;font-style:italic;">${a.obs}</div>` : ''}
          </div>
          <span class="badge ${g.badge}" style="flex-shrink:0;">${_STATUS_LABELS?.[a.status] || a.status}</span>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${_mfBtnsCamareira(a)}
          <button class="btn btn-ghost btn-sm" onclick="openAptoDetail('${a.id}')">👁 Ver detalhes</button>
        </div>
      </div>`;
    });

    html += `</div>`;
  });

  el.innerHTML = html;
}

function _mfBtnsCamareira(a) {
  switch (a.status) {
    case 'sujo':
    case 'reprovado':
      return `<button class="btn btn-primary btn-sm" onclick="mfAcao('${a.id}','iniciar')">▶ Iniciar limpeza</button>`;
    case 'pausado':
      return `<button class="btn btn-primary btn-sm" onclick="mfAcao('${a.id}','iniciar')">▶ Retomar</button>
              <button class="btn btn-outline btn-sm"  onclick="mfAcao('${a.id}','concluir')">🔍 Enviar conf.</button>`;
    case 'limpando':
      return `<button class="btn btn-warning btn-sm" onclick="mfAcao('${a.id}','pausar')">⏸ Pausar</button>
              <button class="btn btn-success btn-sm"  onclick="mfAcao('${a.id}','concluir')">🔍 Enviar conf.</button>`;
    default:
      return '';
  }
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
  const bloqueados   = aptos.filter(a => a.status === 'bloqueado');
  const manutencao   = aptos.filter(a => a.status === 'manutencao');

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
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:10px;margin-bottom:${bloqueados.length || manutencao.length ? '14px' : '24px'};">
      <div class="card" style="text-align:center;padding:10px;border-top:2px solid #e67e22;cursor:pointer;"
           onclick="_mfScrollTo('mf-sec-sujos')" title="Ver apartamentos sujos">
        <div style="font-size:18px;font-weight:700;color:#e67e22;">${sujos.length}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;">Sujos</div>
      </div>
      ${pausadoApts.length ? `<div class="card" style="text-align:center;padding:10px;border-top:2px solid #f39c12;cursor:pointer;"
           onclick="_mfScrollTo('mf-sec-pausados')" title="Ver apartamentos pausados">
        <div style="font-size:18px;font-weight:700;color:#f39c12;">${pausadoApts.length}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;">Pausados</div>
      </div>` : ''}
      <div class="card" style="text-align:center;padding:10px;border-top:2px solid #1abc9c;">
        <div style="font-size:18px;font-weight:700;color:#1abc9c;">${limpos.length}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;">Limpos</div>
      </div>
      <div class="card" style="text-align:center;padding:10px;border-top:2px solid var(--success);">
        <div style="font-size:18px;font-weight:700;color:var(--success);">${livres.length}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;">Livres</div>
      </div>
    </div>
    ${bloqueados.length || manutencao.length ? `
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:24px;">
      ${bloqueados.length ? `<div class="card" style="text-align:center;padding:10px;border-top:2px solid #7f8c8d;cursor:pointer;" onclick="_mfScrollTo('mf-sec-bloqueados')">
        <div style="font-size:18px;font-weight:700;color:#7f8c8d;">${bloqueados.length}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;">Bloqueados</div>
      </div>` : ''}
      ${manutencao.length ? `<div class="card" style="text-align:center;padding:10px;border-top:2px solid #e67e22;cursor:pointer;" onclick="_mfScrollTo('mf-sec-manutencao')">
        <div style="font-size:18px;font-weight:700;color:#e67e22;">${manutencao.length}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px;">Em Manutenção</div>
      </div>` : ''}
    </div>` : ''}`;

  // ── Aguardando conferência ──
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

  if (!conferencia.length) {
    html += `<div class="card" style="text-align:center;padding:24px;color:var(--text3);font-size:13px;">
      ✅ Nenhum apartamento aguardando conferência.
    </div>`;
  } else {
    conferencia.forEach(a => {
      const cam = equipe.find(e => e.id === a.camareira_id);
      html += `
      <div class="card" style="margin-bottom:10px;border-left:4px solid #8e44ad;padding:14px 16px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px;">
          <div>
            <div style="font-size:22px;font-weight:800;line-height:1;">${a.numero}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:3px;">${a.tipo} · ${a.andar}º andar</div>
            ${cam ? `<div style="font-size:11px;color:var(--text3);margin-top:3px;">🧹 ${cam.nome.split(' ')[0]}</div>` : ''}
          </div>
          <span class="badge badge-conferencia" style="flex-shrink:0;">Aguard. conf.</span>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-success btn-sm" onclick="mfAcao('${a.id}','aprovar')">✅ Aprovar limpeza</button>
          <button class="btn btn-danger btn-sm"  onclick="mfAcao('${a.id}','reprovar')">❌ Reprovar</button>
          <button class="btn btn-ghost btn-sm"   onclick="openAptoDetail('${a.id}')">👁 Ver</button>
        </div>
      </div>`;
    });
  }
  html += `</div>`;

  // ── Reprovados ──
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

  if (!reprovados.length) {
    html += `<div class="card" style="text-align:center;padding:20px;color:var(--text3);font-size:13px;">
      ✅ Nenhum apartamento reprovado no momento.
    </div>`;
  } else {
    reprovados.forEach(a => {
      const cam = equipe.find(e => e.id === a.camareira_id);
      html += `
      <div class="card" style="margin-bottom:10px;border-left:4px solid var(--danger);padding:14px 16px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div>
            <div style="font-size:22px;font-weight:800;line-height:1;">${a.numero}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:3px;">${a.tipo} · ${a.andar}º andar</div>
            ${cam ? `<div style="font-size:11px;color:var(--text3);margin-top:3px;">🧹 ${cam.nome.split(' ')[0]}</div>` : ''}
          </div>
          <span class="badge badge-reprovado" style="flex-shrink:0;">Reprovado</span>
        </div>
        <div style="margin-top:10px;">
          <button class="btn btn-ghost btn-sm" onclick="openAptoDetail('${a.id}')">👁 Ver detalhes</button>
        </div>
      </div>`;
    });
  }
  html += `</div>`;

  // ── Para limpar (Sujos) ──
  if (sujos.length) {
    html += `<div id="mf-sec-sujos" style="margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;
                  padding-bottom:8px;border-bottom:2px solid #e67e22;">
        <span style="font-size:16px;">🟠</span>
        <span style="font-size:12px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;">Para limpar</span>
        <span style="background:#e67e22;color:#fff;font-size:10px;font-weight:700;
                     padding:2px 8px;border-radius:10px;margin-left:auto;">${sujos.length}</span>
      </div>`;
    sujos.forEach(a => {
      html += `
      <div class="card" style="margin-bottom:10px;border-left:4px solid #e67e22;padding:14px 16px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div>
            <div style="font-size:22px;font-weight:800;line-height:1;">${a.numero}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:3px;">${a.tipo} · ${a.andar}º andar</div>
            ${a.obs ? `<div style="font-size:11px;color:var(--text3);margin-top:3px;font-style:italic;">${a.obs}</div>` : ''}
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
      const cam = equipe.find(e => e.id === a.camareira_id);
      html += `
      <div class="card" style="margin-bottom:10px;border-left:4px solid #2e86c1;padding:14px 16px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div>
            <div style="font-size:22px;font-weight:800;line-height:1;">${a.numero}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:3px;">${a.tipo} · ${a.andar}º andar</div>
            ${cam ? `<div style="font-size:11px;color:var(--text3);margin-top:3px;">🧹 ${cam.nome.split(' ')[0]}</div>` : ''}
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
      const cam = equipe.find(e => e.id === a.camareira_id);
      html += `
      <div class="card" style="margin-bottom:10px;border-left:4px solid #f39c12;padding:14px 16px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div>
            <div style="font-size:22px;font-weight:800;line-height:1;">${a.numero}</div>
            <div style="font-size:12px;color:var(--text2);margin-top:3px;">${a.tipo} · ${a.andar}º andar</div>
            ${cam ? `<div style="font-size:11px;color:var(--text3);margin-top:3px;">🧹 ${cam.nome.split(' ')[0]}</div>` : ''}
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
  if (acao === 'iniciar') {
    // Abre checklist sem mudar status — status só muda ao concluir o checklist
    if (typeof abrirChecklistApp === 'function') abrirChecklistApp(id);
  }
  if (acao === 'pausar')   abrirModalPausa(id);
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
