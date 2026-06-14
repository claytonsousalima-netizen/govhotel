// ================================================================
// CHAMADOS SERVICE — GovHotel
// Depende de: supabase-client.js, auth.js, apartments.js
// ================================================================

let _chamadosCache    = [];
let _chamadoHotelId   = null;
let _chamadoDept      = null;   // null=todos | 'governanca' | 'manutencao'
let _tiposChamado     = [];
let _chamadoDetalheId = null;

const _GOV_STATUS = {
  aberto:     { label:'Aberto',       badge:'badge-sujo'        },
  em_analise: { label:'Em análise',   badge:'badge-conferencia' },
  andamento:  { label:'Em andamento', badge:'badge-limpando'    },
  pausado:    { label:'Pausado',      badge:'badge-pausado'     },
  resolvido:  { label:'Resolvido',    badge:'badge-limpo'       },
  reaberto:   { label:'Reaberto',     badge:'badge-reprovado'   },
  cancelado:  { label:'Cancelado',    badge:'badge-bloqueado'   },
  concluido:  { label:'Concluído',    badge:'badge-limpo'       },
};

const _GOV_PRIO = {
  baixa:   { label:'Baixa',   badge:'badge-livre'     },
  normal:  { label:'Normal',  badge:'badge-limpando'  },
  alta:    { label:'Alta',    badge:'badge-sujo'      },
  urgente: { label:'Urgente', badge:'badge-bloqueado' },
};

// Categorias hardcoded removidas — carregadas do Supabase via _popularCategoriasSelect()

// Fluxo de status — próximos estados permitidos
const _GOV_NEXT = {
  aberto:     ['em_analise','andamento','cancelado'],
  em_analise: ['andamento','cancelado'],
  andamento:  ['pausado','resolvido','cancelado'],
  pausado:    ['andamento','resolvido','cancelado'],
  resolvido:  ['reaberto'],
  reaberto:   ['em_analise','andamento','cancelado'],
  cancelado:  ['reaberto'],
  concluido:  ['reaberto'],
};

// ── CARREGAR TIPOS DO CHAMADO ──────────────────────────────────
async function _loadTiposChamado() {
  const { data } = await supabaseClient
    .from('chamado_tipos').select('id, nome, departamento')
    .eq('ativo', true).order('ordem');
  _tiposChamado = data || [];
}

// ── POPULAR SELECT DE TIPOS ────────────────────────────────────
function _populateTipoSelect(selId, departamento) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const filtrados = _tiposChamado.filter(t =>
    !t.departamento || t.departamento === 'ambos' || t.departamento === (departamento || 'ambos')
  );
  sel.innerHTML = filtrados.map(t =>
    `<option value="${t.id}">${t.nome}</option>`
  ).join('');
}

// ── POPULAR SELECT DE CATEGORIAS (do Supabase por departamento) ───────────────
async function _popularCategoriasSelect(departamento) {
  const sel = document.getElementById('nc-categoria');
  if (!sel) return;

  // Garante que _tiposChamado esteja carregado
  if (!_tiposChamado.length) await _loadTiposChamado();

  const tipos = _tiposChamado.filter(t =>
    t.departamento === departamento || t.departamento === 'ambos'
  );

  if (!tipos.length) {
    sel.innerHTML = `<option value="">Nenhuma categoria cadastrada para este tipo</option>`;
    return;
  }
  sel.innerHTML = '<option value="">Selecionar categoria *</option>' +
    tipos.map(t => `<option value="${t.nome}">${t.nome}</option>`).join('');
}

// ── TOGGLE CAMPOS POR DEPARTAMENTO ───────────────────────────
// Usa apenas nc-categoria para ambos os departamentos; nc-tipo-wrap está oculto
function _toggleCamposDepartamento(dept) {
  const wrapCat  = document.getElementById('nc-categoria-wrap');
  const wrapTipo = document.getElementById('nc-tipo-wrap');
  if (wrapCat)  wrapCat.style.display  = '';       // sempre visível
  if (wrapTipo) wrapTipo.style.display = 'none';   // não mais utilizado
}

// ── FILTRO DE HOTEL (admin_global) ────────────────────────────
function setDeptFilterChamados(dept, btn) {
  _chamadoDept = dept;
  document.querySelectorAll('[id^="dept-btn-"]').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderChamados();
}

async function _popularFiltroHotelChamados() {
  if (currentUser.perfil !== 'admin_global') {
    ['chamados-hotel-filter', 'kanban-hotel-filter'].forEach(id => {
      if (typeof _renderHotelChip === 'function') _renderHotelChip(id);
    });
    return;
  }
  const { data: hotels } = await supabaseClient
    .from('hotels').select('id, nome').eq('ativo', true).order('nome');

  // pré-seleciona o hotel já escolhido anteriormente (persiste entre páginas)
  const presel = _chamadoHotelId || '';

  ['chamados-hotel-filter','kanban-hotel-filter'].forEach(filterId => {
    const wrap = document.getElementById(filterId);
    if (!wrap) return;
    wrap.innerHTML = `
      <div class="card" style="padding:10px 16px;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <span style="font-size:13px;font-weight:600;color:var(--text2);">🏨 Hotel:</span>
          <select style="flex:1;min-width:180px;padding:7px 10px;border:1.5px solid var(--border);border-radius:var(--radius-sm);font-size:13px;"
            onchange="_filtrarChamadosPorHotel(this.value)">
            <option value="">Todos os hotéis</option>
            ${(hotels||[]).map(h =>
              `<option value="${h.id}" ${h.id === presel ? 'selected' : ''}>${h.nome}</option>`
            ).join('')}
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
      id, numero, tipo, categoria, prioridade, status,
      solicitante, hospede, descricao, prazo, created_at,
      departamento, responsavel_user_id,
      hotel_id, hotels(nome),
      apartment_id, apartments(numero)
    `)
    .order('created_at', { ascending: false });

  if (currentUser.perfil === 'camareira' || currentUser.perfil === 'manutencao') {
    // Vê todos os chamados do hotel (governança + manutenção) para consulta cruzada.
    // A separação de o que pode atuar é feita no frontend via _podeAtualizarChamado().
    query = query.eq('hotel_id', currentUser.hotelId);
  } else if (currentUser.perfil !== 'admin_global' && currentUser.hotelId) {
    query = query.eq('hotel_id', currentUser.hotelId);
  } else if (_chamadoHotelId) {
    query = query.eq('hotel_id', _chamadoHotelId);
  }

  const { data, error } = await query;
  if (error) { console.error('Chamados:', error.message); return; }

  const responsavelIds = [...new Set((data||[])
    .filter(c => c.responsavel_user_id).map(c => c.responsavel_user_id))];
  let responsavelMap = {};
  if (responsavelIds.length) {
    const { data: profiles } = await supabaseClient
      .from('user_profiles').select('user_id, nome').in('user_id', responsavelIds);
    (profiles||[]).forEach(p => { responsavelMap[p.user_id] = p.nome; });
  }

  _chamadosCache = (data || []).map(c => ({
    id:                  c.id,
    numero:              c.numero || null,
    apto:                c.apartments?.numero || '—',
    tipo:                c.tipo,
    categoria:           c.categoria || null,
    prioridade:          c.prioridade,
    status:              c.status,
    solicitante:         c.solicitante || '',
    hospede:             c.hospede || '',
    desc:                c.descricao || '',
    prazo_raw:           c.prazo || null,
    prazo:               c.prazo ? new Date(c.prazo).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}) : '',
    criado:              new Date(c.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}),
    criadoFull:          new Date(c.created_at).toLocaleString('pt-BR'),
    camareira:           responsavelMap[c.responsavel_user_id] || null,
    departamento:        c.departamento || 'governanca',
    responsavel_user_id: c.responsavel_user_id,
    hotel_id:            c.hotel_id,
    hotelNome:           c.hotels?.nome || null,
    apartment_id:        c.apartment_id,
    created_at:          c.created_at,
  }));

  chamados = _chamadosCache;

  // Atualiza badge do menu lateral com a contagem real já filtrada por perfil
  if (typeof buildSidebar === 'function') buildSidebar();
}

// ── POPULAR ATRIBUÍDOS ────────────────────────────────────────
async function _popularAtribuidosModal(departamento, hotelId) {
  const sel  = document.getElementById('nc-camareira');
  const hint = document.getElementById('nc-atribuir-hint');
  if (!sel) return;

  const perfil = departamento === 'manutencao' ? 'manutencao' : 'camareira';
  const hId    = hotelId || currentUser.hotelId;
  let q = supabaseClient.from('user_profiles')
    .select('user_id, nome').eq('perfil', perfil).eq('ativo', true).order('nome');
  if (hId) q = q.eq('hotel_id', hId);
  const { data } = await q;

  if (!data || !data.length) {
    sel.innerHTML = `<option value="">Nenhum(a) ${perfil === 'camareira' ? 'camareira' : 'técnico'} cadastrado(a)</option>`;
    if (hint) {
      hint.style.display = '';
      hint.innerHTML = perfil === 'camareira'
        ? '⚠️ Nenhuma camareira cadastrada. <a href="#" onclick="openPage(\'usuarios\');return false;" style="color:var(--primary);">Cadastrar →</a>'
        : '⚠️ Nenhum técnico de manutenção cadastrado. <a href="#" onclick="openPage(\'usuarios\');return false;" style="color:var(--primary);">Cadastrar →</a>';
    }
  } else {
    sel.innerHTML = '<option value="">Não atribuído</option>' +
      data.map(u => `<option value="${u.user_id}">${u.nome}</option>`).join('');
    if (hint) hint.style.display = 'none';
  }
}

// ── POPULAR APTOS NO MODAL ────────────────────────────────────
async function _popularAptosModalChamado(hotelId) {
  const sel = document.getElementById('nc-apto');
  if (!sel) return;
  sel.innerHTML = '<option value="">Carregando...</option>';
  const hId = hotelId || currentUser?.hotelId;
  if (!hId) {
    sel.innerHTML = '<option value="">— Selecione o hotel primeiro —</option>';
    return;
  }
  const { data, error } = await supabaseClient
    .from('apartments')
    .select('id, numero, tipo')
    .eq('ativo', true)
    .eq('hotel_id', hId)
    .order('numero');
  sel.innerHTML = '<option value="">Selecionar apartamento...</option>' +
    (data||[]).map(a=>`<option value="${a.id}">${a.numero} — ${a.tipo}</option>`).join('');
  if (!data?.length) {
    sel.innerHTML = '<option value="">— Nenhum apartamento cadastrado —</option>';
  }
  sel.onchange = () => { if (sel.value) _verificarDuplicidadeChamado(sel.value); };
}

// ── AVISO DE CHAMADO DUPLICADO ────────────────────────────────
async function _verificarDuplicidadeChamado(aptoId) {
  if (!aptoId) return;
  const { data } = await supabaseClient
    .from('work_orders')
    .select('id')
    .eq('apartment_id', aptoId)
    .in('status', ['aberto','em_analise','andamento','pausado','reaberto']);
  if (data && data.length > 0) {
    toast(`⚠️ Já existe ${data.length} chamado(s) aberto(s) para este apartamento. Verifique antes de criar outro.`, 'warning');
  }
}

// ── ABRIR MODAL CHAMADO ───────────────────────────────────────
async function openModalNovoChamado() {
  // Perfil manutenção abre no departamento correto por padrão
  const defaultDept = currentUser.perfil === 'manutencao' ? 'manutencao' : 'governanca';
  const deptSel = document.getElementById('nc-departamento');
  if (deptSel) deptSel.value = defaultDept;
  _atualizarLabelAtribuir(defaultDept);
  _toggleCamposDepartamento(defaultDept);

  const hotelWrap = document.getElementById('nc-hotel-wrap');
  if (hotelWrap) {
    if (currentUser.perfil === 'admin_global') {
      hotelWrap.style.display = '';
      document.getElementById('nc-hotel-label-wrap').style.display = 'none';
      const { data: hotels } = await supabaseClient
        .from('hotels').select('id, nome').eq('ativo', true).order('nome');
      const sel = document.getElementById('nc-hotel-id');
      // Pré-seleciona o hotel já filtrado na tela de chamados
      const preHotel = _chamadoHotelId || '';
      if (sel) {
        sel.innerHTML = '<option value="">Selecione o hotel *</option>' +
          (hotels||[]).map(h =>
            `<option value="${h.id}" ${h.id === preHotel ? 'selected' : ''}>${h.nome}</option>`
          ).join('');
        sel.onchange = async () => {
          const dept = document.getElementById('nc-departamento')?.value || defaultDept;
          await _popularAptosModalChamado(sel.value);
          await _popularAtribuidosModal(dept, sel.value);
        };
      }
      // Carrega aptos e responsáveis do hotel pré-selecionado (ou limpa se nenhum)
      await _popularAptosModalChamado(preHotel || null);
      await _popularAtribuidosModal(defaultDept, preHotel || null);
    } else {
      hotelWrap.style.display = 'none';
      document.getElementById('nc-hotel-label-wrap').style.display = '';
      document.getElementById('nc-hotel-label').textContent = currentUser.hotelNome || '';
      await _popularAptosModalChamado(currentUser.hotelId);
      await _popularAtribuidosModal(defaultDept, currentUser.hotelId);
    }
  }

  await _loadTiposChamado();
  await _popularCategoriasSelect(defaultDept);
  openModal('modal-novo-chamado');
}

// ── LABEL "ATRIBUIR PARA" ─────────────────────────────────────
function _atualizarLabelAtribuir(departamento) {
  const label = document.querySelector('.nc-atribuir-label');
  if (label) {
    label.textContent = departamento === 'manutencao'
      ? 'Responsável (Manutenção)' : 'Atribuir para (Camareira)';
  }
}

// ── HANDLER: MUDAR DEPARTAMENTO ──────────────────────────────
async function _onChangeDepartamento(valor) {
  _atualizarLabelAtribuir(valor);
  _toggleCamposDepartamento(valor);
  await _popularCategoriasSelect(valor);
  const hotelId = document.getElementById('nc-hotel-id')?.value || currentUser.hotelId;
  await _popularAtribuidosModal(valor, hotelId);
}

// ── SALVAR CHAMADO ────────────────────────────────────────────
async function salvarNovoChamado() {
  const isAdmin  = currentUser.perfil === 'admin_global';
  const hotel_id = isAdmin
    ? document.getElementById('nc-hotel-id')?.value
    : currentUser.hotelId;
  if (!hotel_id) { toast('Selecione o hotel', 'error'); return; }

  const departamento = document.getElementById('nc-departamento')?.value || 'governanca';
  const apartment_id = document.getElementById('nc-apto')?.value || null;
  const prioridade   = document.getElementById('nc-prioridade')?.value || 'normal';
  const solicitante  = document.getElementById('nc-solicitante')?.value || '';
  const atribuido    = document.getElementById('nc-camareira')?.value || null;
  const prazo        = document.getElementById('nc-prazo')?.value || null;
  const descricao    = document.getElementById('nc-desc')?.value || '';
  const hospede      = document.getElementById('nc-hospede')?.value || '';

  const categoria = document.getElementById('nc-categoria')?.value || null;
  if (!categoria) { toast('Selecione a categoria', 'error'); return; }
  const tipo = categoria;

  const { data: inserted, error } = await supabaseClient
    .from('work_orders').insert([{
      hotel_id,
      apartment_id:        apartment_id || null,
      responsavel_user_id: atribuido || null,
      departamento,
      tipo,
      categoria,
      prioridade,
      status:      'aberto',
      solicitante,
      hospede,
      descricao,
      prazo:       prazo || null,
      criado_por:  currentUser.id,
    }]).select('id, numero').single();

  if (error) { toast('Erro: ' + error.message, 'error'); return; }

  if (inserted?.id) {
    await _gravarHistorico(inserted.id, hotel_id, 'criacao',
      `Chamado aberto por ${currentUser.nome}${categoria ? ' — ' + categoria : ''}.`);
  }

  closeModal('modal-novo-chamado');
  const numLabel = inserted?.numero ? ` (${inserted.numero})` : '';
  toast(`Chamado aberto${numLabel}!`, 'success');
  await _fetchChamados();
  renderChamados();
  renderKanban();
}

// ── GRAVAR HISTÓRICO ─────────────────────────────────────────
async function _gravarHistorico(chamadoId, hotelId, tipoEvento, descricao) {
  await supabaseClient.from('chamado_historico').insert([{
    chamado_id:  chamadoId,
    hotel_id:    hotelId,
    tipo_evento: tipoEvento,
    descricao,
    usuario_id:  currentUser.id,
  }]);
}

// ── ATUALIZAR STATUS COM HISTÓRICO ────────────────────────────
async function atualizarStatusChamado(id, novoStatus) {
  const c = _chamadosCache.find(x => x.id === id);
  if (!c) return;

  const { error } = await supabaseClient
    .from('work_orders').update({ status: novoStatus }).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }

  const prevLabel  = _GOV_STATUS[c.status]?.label  || c.status;
  const nextLabel  = _GOV_STATUS[novoStatus]?.label || novoStatus;
  const tipoEvento = novoStatus === 'resolvido' || novoStatus === 'concluido' ? 'conclusao'
    : novoStatus === 'reaberto'  ? 'reabertura'
    : novoStatus === 'cancelado' ? 'cancelamento'
    : 'status';

  await _gravarHistorico(id, c.hotel_id, tipoEvento,
    `Status alterado de "${prevLabel}" para "${nextLabel}" por ${currentUser.nome}.`);

  c.status  = novoStatus;
  chamados  = _chamadosCache;
  renderChamados();
  renderKanban();

  // Atualiza o modal de detalhe se estiver aberto neste chamado
  if (_chamadoDetalheId === id) {
    _renderDetalheConteudo(c);
    await _carregarHistoricoChamado(id);
  }
}

// ── ABRIR DETALHE DO CHAMADO ──────────────────────────────────
async function abrirDetalheChamado(id) {
  _chamadoDetalheId = id;
  const c = _chamadosCache.find(x => x.id === id);
  if (!c) return;
  _renderDetalheConteudo(c);
  const ta = document.getElementById('cd-comentario');
  if (ta) ta.value = '';
  openModal('modal-chamado-detalhe');
  await _carregarHistoricoChamado(id);
}

function _renderDetalheConteudo(c) {
  const elNum = document.getElementById('cd-numero');
  if (elNum) elNum.textContent = c.numero || '—';

  const elTit = document.getElementById('cd-titulo');
  if (elTit) elTit.textContent = c.tipo;

  const st   = _GOV_STATUS[c.status] || { label: c.status, badge: '' };
  const pr   = _GOV_PRIO[c.prioridade] || { label: c.prioridade, badge: '' };
  const dB   = c.departamento === 'manutencao'
    ? `<span style="font-size:11px;background:#fef9e7;color:#d4ac0d;padding:3px 8px;border-radius:10px;font-weight:600;">🔧 Manutenção</span>`
    : `<span style="font-size:11px;background:#e8f6f3;color:#148f77;padding:3px 8px;border-radius:10px;font-weight:600;">🧹 Governança</span>`;

  const somenteLeitura = !_podeAtualizarChamado(c);
  const slBadge = somenteLeitura
    ? `<span style="font-size:11px;background:#f1f5f9;color:#64748b;padding:3px 8px;border-radius:10px;font-weight:600;">👁 Somente leitura</span>`
    : '';

  const elBadges = document.getElementById('cd-badges');
  if (elBadges) elBadges.innerHTML =
    `<span class="badge ${st.badge}">${st.label}</span>` +
    `<span class="badge ${pr.badge}">${pr.label}</span>` +
    (c.categoria ? `<span style="font-size:11px;background:var(--surface2);color:var(--text2);padding:3px 8px;border-radius:10px;">📁 ${c.categoria}</span>` : '') +
    dB +
    (!c.responsavel_user_id ? `<span style="font-size:11px;background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:10px;font-weight:600;">📋 Disponível</span>` : '') +
    slBadge;

  // Bloco "Assumir chamado"
  const elAssumirWrap = document.getElementById('cd-assumir-wrap');
  if (elAssumirWrap) {
    if (_podeAssumirChamado(c)) {
      elAssumirWrap.style.display = 'flex';
      elAssumirWrap.innerHTML = `
        <div style="flex:1;font-size:13px;color:#78350f;">
          <strong>Chamado sem responsável.</strong> Clique para assumir o atendimento.
        </div>
        <button class="btn btn-primary btn-sm" onclick="assumirChamado('${c.id}')">✋ Assumir chamado</button>`;
    } else {
      elAssumirWrap.style.display = 'none';
      elAssumirWrap.innerHTML = '';
    }
  }

  const elInfo = document.getElementById('cd-info');
  if (elInfo) elInfo.innerHTML = `
    <div><span style="font-size:11px;color:var(--text3);">Apartamento</span><div style="font-weight:600;">${c.apto}</div></div>
    <div><span style="font-size:11px;color:var(--text3);">Solicitante</span><div>${c.solicitante || '—'}</div></div>
    <div><span style="font-size:11px;color:var(--text3);">Responsável</span><div>${c.camareira ? (c.departamento === 'manutencao' ? '🔧 ' : '🧹 ') + c.camareira : '<em style="color:var(--text3);">Sem responsável</em>'}</div></div>
    ${c.hospede ? `<div><span style="font-size:11px;color:var(--text3);">Hóspede</span><div>${c.hospede}</div></div>` : ''}
    <div><span style="font-size:11px;color:var(--text3);">Criado em</span><div>${c.criadoFull}</div></div>
    ${c.prazo ? `<div><span style="font-size:11px;color:var(--text3);">Prazo</span><div style="${_isAtrasado(c) ? 'color:#dc2626;font-weight:700;' : ''}">${c.prazo}${_isAtrasado(c) ? ' ⚠' : ''}</div></div>` : ''}
    ${c.desc ? `<div style="grid-column:1/-1;"><span style="font-size:11px;color:var(--text3);">Descrição</span><div style="margin-top:2px;">${c.desc}</div></div>` : ''}
  `;

  const elAcoes        = document.getElementById('cd-acoes');
  const elComentWrap   = document.getElementById('cd-comentario-wrap');

  if (somenteLeitura) {
    // Perfil vendo chamado da outra área — apenas consulta
    if (elAcoes)      elAcoes.innerHTML = `<div style="font-size:12px;color:var(--text3);padding:4px 0;">Chamado de outra área — consulta apenas.</div>`;
    if (elComentWrap) elComentWrap.style.display = 'none';
  } else {
    if (elComentWrap) elComentWrap.style.display = '';
    const nexts = _GOV_NEXT[c.status] || [];
    if (elAcoes) {
      if (!nexts.length) {
        elAcoes.innerHTML = `<div style="font-size:12px;color:var(--text3);">Nenhuma ação disponível.</div>`;
      } else {
        const btns = nexts.map(ns => {
          const sl  = _GOV_STATUS[ns]?.label || ns;
          const cls = ns === 'cancelado' ? 'btn-danger'
            : ns === 'resolvido' || ns === 'concluido' ? 'btn-success'
            : ns === 'reaberto' ? 'btn-danger'
            : 'btn-primary';
          return `<button class="btn ${cls} btn-sm" onclick="atualizarStatusChamado('${c.id}','${ns}')">→ ${sl}</button>`;
        }).join('');
        elAcoes.innerHTML = `
          <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:8px;">Ações</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">${btns}</div>`;
      }
    }
  }
}

// ── CARREGAR HISTÓRICO ────────────────────────────────────────
async function _carregarHistoricoChamado(id) {
  const el = document.getElementById('cd-historico');
  if (!el) return;
  el.innerHTML = `<div style="font-size:12px;color:var(--text3);padding:8px;">Carregando...</div>`;

  const { data, error } = await supabaseClient
    .from('chamado_historico')
    .select('tipo_evento, descricao, created_at')
    .eq('chamado_id', id)
    .order('created_at', { ascending: true });

  if (error || !data?.length) {
    el.innerHTML = `<div style="font-size:12px;color:var(--text3);padding:8px;">Sem histórico registrado.</div>`;
    return;
  }

  const icons = {
    criacao:'🆕', status:'🔄', responsavel:'👤', comentario:'💬',
    conclusao:'✅', reabertura:'🔁', cancelamento:'❌', prioridade:'⚡'
  };
  el.innerHTML = data.map(h => `
    <div style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
      <div style="font-size:16px;flex-shrink:0;">${icons[h.tipo_evento] || '📋'}</div>
      <div>
        <div style="font-size:12px;color:var(--text);">${h.descricao}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px;">${new Date(h.created_at).toLocaleString('pt-BR')}</div>
      </div>
    </div>`).join('');
  el.scrollTop = el.scrollHeight;
}

// ── SALVAR COMENTÁRIO ─────────────────────────────────────────
async function salvarComentarioChamado() {
  const id   = _chamadoDetalheId;
  const ta   = document.getElementById('cd-comentario');
  const text = ta?.value?.trim();
  if (!id || !text) { toast('Digite o comentário', 'error'); return; }

  const c = _chamadosCache.find(x => x.id === id);
  if (!c) return;

  await _gravarHistorico(id, c.hotel_id, 'comentario',
    `${currentUser.nome}: ${text}`);

  ta.value = '';
  toast('Comentário adicionado', 'success');
  await _carregarHistoricoChamado(id);
}

// ── HELPER: CHAMADO ATRASADO ─────────────────────────────────
const _STATUS_ATIVOS = ['aberto','em_analise','andamento','pausado','reaberto'];
function _isAtrasado(c) {
  if (!c.prazo_raw) return false;
  if (!_STATUS_ATIVOS.includes(c.status)) return false;
  return new Date(c.prazo_raw) < new Date();
}
const _BADGE_ATRASADO = `<span style="font-size:10px;background:#fee2e2;color:#991b1b;padding:2px 7px;border-radius:10px;font-weight:700;">⚠ Atrasado</span>`;

// ── ASSUMIR CHAMADO ───────────────────────────────────────────
function _podeAssumirChamado(c) {
  if (c.responsavel_user_id) return false; // já tem responsável
  if (currentUser.perfil === 'camareira')  return c.departamento === 'governanca';
  if (currentUser.perfil === 'manutencao') return c.departamento === 'manutencao';
  return ['gestor','admin_hotel','admin_global'].includes(currentUser.perfil);
}

// ── PERMISSÃO DE ATUALIZAR CHAMADO ───────────────────────────
// Retorna false quando o perfil está visualizando chamado da outra área (somente leitura)
function _podeAtualizarChamado(c) {
  if (['admin_global','admin_hotel','gestor','supervisora'].includes(currentUser.perfil)) return true;
  if (currentUser.perfil === 'camareira')  return c.departamento === 'governanca';
  if (currentUser.perfil === 'manutencao') return c.departamento === 'manutencao';
  return false;
}

async function assumirChamado(id) {
  const c = _chamadosCache.find(x => x.id === id);
  if (!c) return;

  const payload = { responsavel_user_id: currentUser.id };
  // Avança para andamento se ainda estiver aberto
  if (c.status === 'aberto') payload.status = 'andamento';

  const { error } = await supabaseClient
    .from('work_orders').update(payload).eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }

  await _gravarHistorico(id, c.hotel_id, 'responsavel',
    `Chamado assumido por ${currentUser.nome}.`);

  c.responsavel_user_id = currentUser.id;
  c.camareira = currentUser.nome;
  if (payload.status) c.status = payload.status;
  chamados = _chamadosCache;

  toast('Chamado assumido com sucesso.', 'success');
  _renderDetalheConteudo(c);
  await _carregarHistoricoChamado(id);
  renderChamados();
  renderKanban();
}

// ── RENDER CHAMADOS ───────────────────────────────────────────
function renderChamados() {
  const showHotel = currentUser.perfil === 'admin_global';
  const deptFn    = _chamadoDept ? (c => c.departamento === _chamadoDept) : () => true;
  const tabFilter = {
    todos:        c => deptFn(c),
    disponiveis:  c => deptFn(c) && !c.responsavel_user_id && ['aberto','em_analise','reaberto'].includes(c.status),
    meus:         c => deptFn(c) && c.responsavel_user_id === currentUser.id,
    abertos:      c => deptFn(c) && ['aberto','em_analise','reaberto'].includes(c.status),
    andamento:    c => deptFn(c) && ['andamento','pausado'].includes(c.status),
    concluidos:   c => deptFn(c) && ['resolvido','concluido','cancelado'].includes(c.status),
  };
  const prioColors = { urgente:'var(--danger)', alta:'#e67e22', normal:'var(--warning)', baixa:'var(--success)' };

  // Atualiza badge numérico da aba Disponíveis
  const dispCount = _chamadosCache.filter(tabFilter.disponiveis).length;
  const btnDisp = document.getElementById('tab-btn-disponiveis');
  if (btnDisp) btnDisp.textContent = dispCount > 0 ? `Disponíveis (${dispCount})` : 'Disponíveis';

  Object.entries(tabFilter).forEach(([tab, fn]) => {
    const lista = _chamadosCache.filter(fn);
    const el    = document.getElementById('chamados-list-' + tab);
    if (!el) return;

    if (!lista.length) {
      const msg = tab === 'disponiveis'
        ? 'Nenhum chamado disponível no momento.'
        : tab === 'meus'
        ? 'Você não possui chamados atribuídos.'
        : 'Nenhum chamado encontrado.';
      el.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text3);">${msg}</div>`;
      return;
    }

    el.innerHTML = lista.map(c => {
      const st  = _GOV_STATUS[c.status] || { label: c.status, badge: '' };
      const pr  = _GOV_PRIO[c.prioridade] || { label: c.prioridade, badge: 'badge-limpando' };
      const dB  = c.departamento === 'manutencao'
        ? `<span style="font-size:10px;background:#fef9e7;color:#d4ac0d;padding:2px 6px;border-radius:10px;font-weight:600;">🔧 Manutenção</span>`
        : `<span style="font-size:10px;background:#e8f6f3;color:#148f77;padding:2px 6px;border-radius:10px;font-weight:600;">🧹 Governança</span>`;
      const dispBadge = !c.responsavel_user_id
        ? `<span style="font-size:10px;background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:10px;font-weight:600;">📋 Disponível</span>`
        : '';

      return `
      <div class="card" style="margin-bottom:10px;border-left:4px solid ${prioColors[c.prioridade]||'var(--border)'};cursor:pointer;"
           onclick="abrirDetalheChamado('${c.id}')">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
          <div style="flex:1;min-width:0;">
            ${showHotel && c.hotelNome ? `<div style="font-size:10px;font-weight:700;color:var(--primary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;">🏨 ${c.hotelNome}</div>` : ''}
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px;">
              ${c.numero ? `<span style="font-size:11px;font-weight:700;color:var(--primary);background:var(--surface2);padding:2px 7px;border-radius:4px;">${c.numero}</span>` : ''}
              <div style="font-weight:700;font-size:14px;">${c.tipo}</div>
              ${dB}
              ${dispBadge}
            </div>
            <div style="font-size:12px;color:var(--text2);">
              Apto ${c.apto}${c.hospede ? ` · ${c.hospede}` : ''}${c.camareira ? ` · ${c.departamento === 'manutencao' ? '🔧' : '🧹'} ${c.camareira}` : ' · Sem responsável'}
            </div>
            ${c.categoria ? `<div style="font-size:11px;color:var(--text3);margin-top:2px;">📁 ${c.categoria}</div>` : ''}
            ${c.desc ? `<div style="font-size:12px;color:var(--text3);margin-top:4px;">${c.desc.substring(0,80)}${c.desc.length>80?'…':''}</div>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;">
            ${_isAtrasado(c) ? _BADGE_ATRASADO : ''}
            <span class="badge ${pr.badge}">${pr.label}</span>
            <span class="badge ${st.badge}">${st.label}</span>
            <span style="font-size:10px;color:var(--text3);">${c.criado}</span>
          </div>
        </div>
      </div>`;
    }).join('');
  });
}

// ── RENDER KANBAN ─────────────────────────────────────────────
function renderKanban() {
  const showHotel = currentUser.perfil === 'admin_global';
  const cols = [
    { key:'aberto',     label:'Aberto',       color:'var(--danger)'  },
    { key:'em_analise', label:'Em análise',    color:'#8e44ad'        },
    { key:'andamento',  label:'Em andamento',  color:'var(--warning)' },
    { key:'pausado',    label:'Pausado',       color:'#f39c12'        },
    { key:'resolvido',  label:'Resolvido',     color:'var(--success)' },
    { key:'reaberto',   label:'Reaberto',      color:'var(--danger)'  },
    { key:'cancelado',  label:'Cancelado',     color:'var(--text3)'   },
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
      ${items.map(c => {
        const pr      = _GOV_PRIO[c.prioridade] || { badge:'badge-limpando', label:c.prioridade };
        const deptIcon = c.departamento === 'manutencao' ? '🔧' : '🧹';
        return `
        <div class="kanban-card" style="border-left:3px solid ${col.color};cursor:pointer;"
             onclick="abrirDetalheChamado('${c.id}')">
          ${showHotel && c.hotelNome ? `<div style="font-size:10px;font-weight:700;color:var(--primary);margin-bottom:2px;">🏨 ${c.hotelNome}</div>` : ''}
          ${c.numero ? `<div style="font-size:10px;font-weight:700;color:var(--primary);margin-bottom:2px;">${c.numero}</div>` : ''}
          <div style="font-weight:600;font-size:13px;">${deptIcon} ${c.tipo}</div>
          <div style="font-size:11px;color:var(--text2);margin-top:2px;">Apto ${c.apto}</div>
          ${c.camareira ? `<div style="font-size:11px;color:var(--text3);">${c.departamento === 'manutencao' ? '🔧' : '🧹'} ${c.camareira}</div>` : ''}
          <div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap;">
            <span class="badge ${pr.badge}">${pr.label}</span>
            ${_isAtrasado(c) ? _BADGE_ATRASADO : ''}
          </div>
        </div>`;
      }).join('') || `<div style="font-size:12px;color:var(--text3);padding:12px;text-align:center;">Vazio</div>`}
    </div>`;
  }).join('');

  if (typeof applyProfileRestrictions === 'function') applyProfileRestrictions();
}

// ── REALTIME — NOTIFICAÇÕES DE NOVOS CHAMADOS ────────────────
let _realtimeChannel = null;

function _initRealtimeChamados() {
  if (_realtimeChannel) return; // já inscrito

  const isAdminGlobal = currentUser.perfil === 'admin_global';
  const hotelId       = currentUser.hotelId;

  const pgConfig = { event: '*', schema: 'public', table: 'work_orders' };
  if (!isAdminGlobal && hotelId) pgConfig.filter = `hotel_id=eq.${hotelId}`;

  _realtimeChannel = supabaseClient
    .channel('govhotel_work_orders')
    .on('postgres_changes', pgConfig, async (payload) => {
      const rec = payload.new || {};

      // Camareira: só governança | Manutenção: só manutenção
      if (currentUser.perfil === 'camareira'  && rec.departamento !== 'governanca')  return;
      if (currentUser.perfil === 'manutencao' && rec.departamento !== 'manutencao') return;

      if (payload.eventType === 'INSERT') {
        // Não notifica quem abriu o chamado
        if (rec.criado_por === currentUser.id) return;
        const dept = rec.departamento === 'manutencao' ? '🔧 Manutenção' : '🧹 Governança';
        const cat  = rec.categoria || rec.tipo || '';
        toast(`${dept}: novo chamado${cat ? ' — ' + cat : ''}`, 'info');
      }

      // Atualiza cache e UI sem travar
      await _fetchChamados();
      if (currentPage === 'chamados') { renderChamados(); }
      if (currentPage === 'kanban')   { renderKanban();   }
    })
    .subscribe();
}

function stopRealtimeChamados() {
  if (_realtimeChannel) {
    supabaseClient.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }
}

// ── INICIALIZAR CHAMADOS ─────────────────────────────────────
async function _initChamados() {
  await _loadTiposChamado();
  await _popularFiltroHotelChamados();
  await _fetchChamados();
  _initRealtimeChamados();
}

(function patchOpenPageChamados() {
  if (window._chamadosPatch) return;
  window._chamadosPatch = true;
  const _realOpen = openPage;
  openPage = function(id) {
    _realOpen(id);
    if (id === 'chamados') {
      _fetchChamados().then(() => renderChamados());
    }
  };
})();

document.addEventListener('govhotel:ready', () => _initChamados());
