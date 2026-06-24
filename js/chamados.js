// ================================================================
// CHAMADOS SERVICE — Gov Estancorp
// Depende de: supabase-client.js, auth.js, apartments.js
// ================================================================

let _chamadosCache    = [];
let _chamadoHotelId   = null;
let _chamadoDept      = null;   // null=todos | 'governanca' | 'manutencao'
let _tiposChamado     = [];
let _chamadoDetalheId = null;
let _chamadosKnownIds        = new Set(); // IDs já vistos — evita notificar chamados antigos
let _chamadosIniciado        = false;     // false até a primeira _fetchChamados() concluir
let _chamadosResponsavelMap  = new Map(); // chamadoId → responsavel_user_id anterior
let _chamadosAutoAssumidos   = new Set(); // IDs assumidos pelo próprio usuário — sem notificar
let _chamadosAckIds          = new Set(); // IDs reconhecidos pela camareira (fechou o modal)
let _chamadosLembreteInterval = null;     // intervalo de renotificação periódica

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
  baixa:   { label:'Baixa',   badge:'badge-vago'     },
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
    sel.innerHTML = `<option value="">Nenhum tipo de chamado cadastrado para este departamento</option>`;
    return;
  }
  sel.innerHTML = '<option value="">Selecionar tipo de chamado *</option>' +
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
      solicitante, hospede, descricao, prazo, created_at, criado_por,
      departamento, responsavel_user_id,
      hotel_id, hotels(nome),
      apartment_id, apartments(numero, leitos, status_apto, status_governanca_manual)
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
    leitos:              c.apartments?.leitos || null,
    status_apto:         c.apartments?.status_apto || null,
    status_gov:          c.apartments?.status_governanca_manual || null,
    created_at:          c.created_at,
    criado_por:          c.criado_por || null,
  }));

  chamados = _chamadosCache;

  // Detecta novos chamados e notifica somente quem está atribuído ao apartamento
  if (_chamadosIniciado) {
    const perfil = currentUser?.perfil;
    if (perfil === 'camareira' || perfil === 'manutencao') {
      _chamadosCache.forEach(c => {
        // Verifica se este chamado é direcionado ao usuário atual
        const _ehMeuChamado = (() => {
          if (perfil === 'camareira' && c.departamento === 'governanca') {
            const aptoDoC = Array.isArray(aptos) ? aptos.find(a => a.id === c.apartment_id) : null;
            // Se apto não tem camareira atribuída → notifica todas as camareiras
            if (!aptoDoC?.camareira_id) return true;
            // Senão, somente a atribuída
            return aptoDoC.camareira_id === currentUser.id;
          }
          if (perfil === 'manutencao' && c.departamento === 'manutencao') {
            // Se chamado sem responsável → notifica todos de manutenção
            if (!c.responsavel_user_id) return true;
            // Senão, somente o responsável
            return c.responsavel_user_id === currentUser.id;
          }
          return false;
        })();

        // Notifica chamado novo (INSERT) — somente se atribuído a mim
        if (!_chamadosKnownIds.has(c.id)) {
          if (c.criado_por !== currentUser.id && _ehMeuChamado) {
            if (typeof _showNovoChamadoNotif === 'function') _showNovoChamadoNotif(c);
          }
        }

        // Notifica atribuição direta (UPDATE responsavel_user_id → currentUser.id)
        // Ignora se foi o próprio usuário que assumiu (auto-atribuição)
        const anteriorResp = _chamadosResponsavelMap.get(c.id);
        const atualResp    = c.responsavel_user_id || null;
        if (
          _chamadosKnownIds.has(c.id) &&
          anteriorResp !== currentUser.id &&
          atualResp    === currentUser.id &&
          !_chamadosAutoAssumidos.has(c.id) &&
          typeof _showNovoChamadoNotif === 'function'
        ) {
          _showNovoChamadoNotif(c, 'atribuido');
        }
        _chamadosAutoAssumidos.delete(c.id);
      });
    }
  }
  // Atualiza mapas de estado
  _chamadosCache.forEach(c => {
    _chamadosKnownIds.add(c.id);
    _chamadosResponsavelMap.set(c.id, c.responsavel_user_id || null);
  });
  _chamadosIniciado = true;

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
  // Limpa campos que podem ter ficado preenchidos do chamado anterior
  const descEl    = document.getElementById('nc-desc');
  const hospedeEl = document.getElementById('nc-hospede');
  if (descEl)    descEl.value    = '';
  if (hospedeEl) hospedeEl.value = '';

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
  await _popularSolicitantesSelect();
  openModal('modal-novo-chamado');
}

async function _popularSolicitantesSelect() {
  const sel = document.getElementById('nc-solicitante');
  if (!sel) return;
  const hotelId = currentUser.hotelId;
  let query = supabaseClient.from('solicitantes').select('id, nome').eq('ativo', true).order('ordem');
  if (hotelId) query = query.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);
  else         query = query.is('hotel_id', null);
  const { data } = await query;
  const lista = data || [];
  sel.innerHTML = lista.map(s => `<option value="${s.nome}">${s.nome}</option>`).join('');
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
  if (!categoria) { toast('Selecione o tipo de chamado', 'error'); return; }
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

  const _statusConclusao = ['resolvido','concluido','cancelado'];
  const _updatePayload = { status: novoStatus };
  if (_statusConclusao.includes(novoStatus)) {
    _updatePayload.resolved_at = new Date().toISOString();
    _updatePayload.resolved_by = currentUser.id;
  }
  const { error } = await supabaseClient
    .from('work_orders').update(_updatePayload).eq('id', id);
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

// ── CANCELAMENTO DE CHAMADO COM MOTIVO ───────────────────────
let _cancelChamadoId = null;

async function abrirModalCancelarChamado(id) {
  _cancelChamadoId = id;
  const sel   = document.getElementById('cancel-chamado-motivo');
  const obsEl = document.getElementById('cancel-chamado-obs');
  if (obsEl) obsEl.value = '';
  if (sel) {
    sel.innerHTML = '<option value="">Carregando...</option>';
    const hotelId = currentUser?.hotelId;
    let q = supabaseClient.from('motivos_cancelamento').select('id, nome').eq('ativo', true).order('ordem');
    if (hotelId) q = q.or(`hotel_id.eq.${hotelId},hotel_id.is.null`);
    const { data } = await q;
    sel.innerHTML = '<option value="">Selecione o motivo *</option>' +
      (data || []).map(m => `<option value="${m.nome}">${m.nome}</option>`).join('');
  }
  _onCancelChamadoMotivoChange();
  openModal('modal-cancelar-chamado');
}

function _onCancelChamadoMotivoChange() {
  const motivo = (document.getElementById('cancel-chamado-motivo')?.value || '').toLowerCase().trim();
  const label  = document.getElementById('cancel-chamado-obs-label');
  if (label) label.textContent = motivo === 'outro'
    ? 'Observação *' : 'Observação (obrigatória para "Outro")';
}

async function confirmarCancelarChamado() {
  const motivo = document.getElementById('cancel-chamado-motivo')?.value || '';
  const obs    = (document.getElementById('cancel-chamado-obs')?.value || '').trim();
  if (!motivo) { toast('Selecione o motivo do cancelamento', 'error'); return; }
  if (motivo.toLowerCase().trim() === 'outro' && !obs) {
    toast('Para o motivo "Outro", a observação é obrigatória', 'error'); return;
  }
  closeModal('modal-cancelar-chamado');
  const id = _cancelChamadoId;
  _cancelChamadoId = null;

  const c = _chamadosCache.find(x => x.id === id);
  if (!c) return;
  const { error } = await supabaseClient.from('work_orders')
    .update({ status: 'cancelado', resolved_at: new Date().toISOString(), resolved_by: currentUser.id })
    .eq('id', id);
  if (error) { toast('Erro: ' + error.message, 'error'); return; }

  const texto = `Cancelado por ${currentUser.nome}. Motivo: ${motivo}${obs ? ' — ' + obs : ''}`;
  await _gravarHistorico(id, c.hotel_id, 'cancelamento', texto);
  c.status = 'cancelado';
  chamados = _chamadosCache;
  renderChamados();
  renderKanban();
  if (_chamadoDetalheId === id) { _renderDetalheConteudo(c); await _carregarHistoricoChamado(id); }
  toast('Chamado cancelado', 'success');
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
    <div><span style="font-size:11px;color:var(--text3);">Apartamento</span><div style="font-weight:600;">${c.apto}${c.leitos ? ` · ${c.leitos}🛏` : ''}</div></div>
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
    // Manutenção usa 'concluido'; governança usa 'resolvido'
    const _nextMap = c.departamento === 'manutencao'
      ? { ..._GOV_NEXT, andamento: ['pausado','concluido','cancelado'], pausado: ['andamento','concluido','cancelado'] }
      : _GOV_NEXT;
    const nexts = _nextMap[c.status] || [];
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
          const fn = ns === 'cancelado'
            ? `abrirModalCancelarChamado('${c.id}')`
            : `atualizarStatusChamado('${c.id}','${ns}')`;
          return `<button class="btn ${cls} btn-sm" onclick="${fn}">→ ${sl}</button>`;
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

  _chamadosAutoAssumidos.add(id); // marca para não notificar no próximo sync
  const { error } = await supabaseClient
    .from('work_orders').update(payload).eq('id', id);
  if (error) { _chamadosAutoAssumidos.delete(id); toast('Erro: ' + error.message, 'error'); return; }

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

  // Atualiza contadores de todas as abas
  const _tabLabels = {
    todos:       'Todos',
    disponiveis: 'Disponíveis',
    meus:        'Meus',
    abertos:     'Em aberto',
    andamento:   'Em andamento',
    concluidos:  'Concluídos',
  };
  Object.entries(_tabLabels).forEach(([tab, label]) => {
    const btn = document.getElementById('tab-btn-' + tab);
    if (!btn) return;
    const count = _chamadosCache.filter(tabFilter[tab]).length;
    btn.textContent = count > 0 ? `${label} (${count})` : label;
  });

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
              Apto ${c.apto}${c.leitos ? ` · ${c.leitos}🛏` : ''}${c.hospede ? ` · ${c.hospede}` : ''}${c.camareira ? ` · ${c.departamento === 'manutencao' ? '🔧' : '🧹'} ${c.camareira}` : ' · <span style="color:#dc2626;font-weight:700;">👤 Sem responsável</span>'}
            </div>
            ${(() => {
              const aptoOpcoes = typeof _statusAptoOpcoes !== 'undefined' ? _statusAptoOpcoes : [];
              const govOpcoes  = typeof _statusGovOpcoes  !== 'undefined' ? _statusGovOpcoes  : [];
              const bApto = (() => {
                if (!c.status_apto) return '';
                const op = aptoOpcoes.find(o => o.nome === c.status_apto);
                const cor = op?.cor || '#6b7280';
                return `<span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;background:${cor}22;color:${cor};border:1px solid ${cor}55;white-space:nowrap;">🏠 ${c.status_apto}</span>`;
              })();
              const bGov = (() => {
                if (!c.status_gov) return '';
                const op = govOpcoes.find(o => o.nome === c.status_gov);
                const cor = op?.cor || '#6b7280';
                return `<span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;background:${cor}22;color:${cor};border:1px solid ${cor}55;white-space:nowrap;">🏛 ${c.status_gov}</span>`;
              })();
              return (bApto || bGov) ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">${bApto}${bGov}</div>` : '';
            })()}
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
  // Não sobrescreve o board quando o kanban está em modo limpeza
  if (currentPage === 'kanban' && typeof _kanbanModo !== 'undefined' && _kanbanModo !== 'chamados') return;
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
        const _govHtml = (() => {
          if (!c.status_gov) return '';
          const govOpcoes = typeof _statusGovOpcoes !== 'undefined' ? _statusGovOpcoes : [];
          const op = govOpcoes.find(o => o.nome === c.status_gov);
          const cor = op?.cor || '#6b7280';
          return `<div style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:5px;background:${cor}22;color:${cor};border:1px solid ${cor}55;display:inline-block;margin-top:4px;">🏛 ${c.status_gov}</div>`;
        })();
        const _aptoHtml = (() => {
          if (!c.status_apto) return '';
          const aptoOpcoes = typeof _statusAptoOpcoes !== 'undefined' ? _statusAptoOpcoes : [];
          const op = aptoOpcoes.find(o => o.nome === c.status_apto);
          const cor = op?.cor || '#6b7280';
          return `<div style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:5px;background:${cor}22;color:${cor};border:1px solid ${cor}55;display:inline-block;margin-top:3px;">🏠 ${c.status_apto}</div>`;
        })();
        return `
        <div class="kanban-card" style="border-left:3px solid ${col.color};cursor:pointer;margin-bottom:10px;border-bottom:1px solid var(--border);"
             onclick="abrirDetalheChamado('${c.id}')">
          ${showHotel && c.hotelNome ? `<div style="font-size:10px;font-weight:700;color:var(--primary);margin-bottom:2px;">🏨 ${c.hotelNome}</div>` : ''}
          ${c.numero ? `<div style="font-size:10px;font-weight:700;color:var(--primary);margin-bottom:2px;">${c.numero}</div>` : ''}
          <div style="font-weight:600;font-size:13px;">${deptIcon} ${c.tipo}</div>
          <div style="font-size:11px;color:var(--text2);margin-top:2px;">Apto ${c.apto}${c.leitos ? ` · ${c.leitos}🛏` : ''}</div>
          ${(_govHtml || _aptoHtml) ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">${_govHtml}${_aptoHtml}</div>` : ''}
          ${c.camareira ? `<div style="font-size:11px;color:var(--text3);margin-top:3px;">${c.departamento === 'manutencao' ? '🔧' : '🧹'} ${c.camareira}</div>` : ''}
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
let _realtimeChannel  = null;
let _pollingInterval  = null;

function _initRealtimeChamados() {
  if (_realtimeChannel) return; // já inscrito

  // Sem filtro de coluna: filtros de coluna (hotel_id=eq.X) no Realtime só funcionam
  // para UPDATE/DELETE quando a tabela tem REPLICA IDENTITY FULL. Para INSERT, o evento
  // não seria entregue. A filtragem por hotel é feita dentro de _fetchChamados() via SQL.
  const pgConfig = { event: '*', schema: 'public', table: 'work_orders' };

  _realtimeChannel = supabaseClient
    .channel('govhotel_work_orders')
    .on('postgres_changes', pgConfig, async () => {
      await _fetchChamados();
      if (currentPage === 'chamados') { renderChamados(); }
      if (currentPage === 'kanban')   { renderKanban();   }
    })
    .subscribe();

  // Polling a cada 30 s como fallback caso o Realtime caia (troca de rede, tela bloqueada etc.)
  _pollingInterval = setInterval(async () => {
    await _fetchChamados();
    if (currentPage === 'chamados') { renderChamados(); }
    if (currentPage === 'kanban')   { renderKanban();   }
  }, 30000);
}

function stopRealtimeChamados() {
  if (_realtimeChannel) {
    supabaseClient.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }
  if (_pollingInterval) {
    clearInterval(_pollingInterval);
    _pollingInterval = null;
  }
  if (_chamadosLembreteInterval) {
    clearInterval(_chamadosLembreteInterval);
    _chamadosLembreteInterval = null;
  }
  _chamadosIniciado = false;
  _chamadosKnownIds.clear();
  _chamadosResponsavelMap.clear();
  _chamadosAckIds.clear();
}

// Notificação bloqueante de novo chamado ou atribuição
function _showNovoChamadoNotif(c, tipo) {
  const aptoLabel = c.apto ? `Apto ${c.apto}` : '';
  const titulo    = tipo === 'atribuido'  ? 'Chamado atribuído a você'
                  : tipo === 'lembrete'   ? '⏰ Lembrete — chamado pendente'
                  : 'Novo chamado';
  const partes    = [aptoLabel, c.categoria, c.descricao].filter(Boolean);
  const corpo     = partes.join('\n');
  const urgente   = tipo === 'atribuido';
  const icon      = tipo === 'atribuido'  ? '🔧'
                  : tipo === 'lembrete'   ? '⏰'
                  : '🔔';
  _chamadosAckIds.add(c.id);
  if (typeof _enfileirarAlerta === 'function') {
    _enfileirarAlerta(icon, titulo, corpo, urgente);
  }
}

// ── NOTIFICAR PENDENTES AO FAZER LOGIN ───────────────────────
// Chamada uma única vez após o primeiro _fetchChamados().
// Busca chamados ativos atribuídos ao usuário que ele ainda não viu.
function _notificarChamadosPendentesLogin() {
  const perfil = currentUser?.perfil;
  if (perfil !== 'camareira' && perfil !== 'manutencao') return;

  const pendentes = _chamadosPendentesDoUsuario();
  if (!pendentes.length) return;

  // Agrupa em uma única notificação para não abrir N modais de vez
  const linhas = pendentes.map(c => {
    const partes = [`Apto ${c.apto}`, c.categoria].filter(Boolean);
    return partes.join(' — ');
  });
  const titulo = `📋 Você tem ${pendentes.length} chamado(s) pendente(s)`;
  const corpo  = linhas.join('\n');

  pendentes.forEach(c => _chamadosAckIds.add(c.id));
  if (typeof _enfileirarAlerta === 'function') {
    _enfileirarAlerta('📋', titulo, corpo, false);
  }
}

// ── LEMBRETE PERIÓDICO DE CHAMADOS NÃO RESOLVIDOS ────────────
// Retorna chamados abertos/pausados/reabertos atribuídos ao usuário atual.
function _chamadosPendentesDoUsuario() {
  const perfil = currentUser?.perfil;
  const STATUS_PENDENTE = new Set(['aberto', 'pausado', 'reaberto', 'em_analise']);

  return _chamadosCache.filter(c => {
    if (!STATUS_PENDENTE.has(c.status)) return false;

    if (perfil === 'camareira' && c.departamento === 'governanca') {
      const aptoDoC = Array.isArray(aptos) ? aptos.find(a => a.id === c.apartment_id) : null;
      if (!aptoDoC?.camareira_id) return true;           // sem atribuição → avisa todas
      return aptoDoC.camareira_id === currentUser.id;
    }
    if (perfil === 'manutencao' && c.departamento === 'manutencao') {
      if (!c.responsavel_user_id) return true;           // sem responsável → avisa todos
      return c.responsavel_user_id === currentUser.id;
    }
    return false;
  });
}

function _iniciarLembreteChamados() {
  if (_chamadosLembreteInterval) return;
  const perfil = currentUser?.perfil;
  if (perfil !== 'camareira' && perfil !== 'manutencao') return;

  // Lembrete a cada 5 minutos para chamados ainda pendentes
  _chamadosLembreteInterval = setInterval(() => {
    if (!currentUser) {
      clearInterval(_chamadosLembreteInterval);
      _chamadosLembreteInterval = null;
      return;
    }
    const pendentes = _chamadosPendentesDoUsuario();
    if (!pendentes.length) return;

    const linhas = pendentes.map(c => {
      const partes = [`Apto ${c.apto}`, c.categoria].filter(Boolean);
      return partes.join(' — ');
    });
    const titulo = `⏰ Lembrete — ${pendentes.length} chamado(s) aguardando`;
    const corpo  = linhas.join('\n');

    pendentes.forEach(c => _chamadosAckIds.add(c.id));
    if (typeof _enfileirarAlerta === 'function') {
      _enfileirarAlerta('⏰', titulo, corpo, false);
    }
  }, 5 * 60 * 1000);
}

// ── INICIALIZAR CHAMADOS ─────────────────────────────────────
async function _initChamados() {
  await _loadTiposChamado();
  await _popularFiltroHotelChamados();
  await _fetchChamados();
  _notificarChamadosPendentesLogin();
  _iniciarLembreteChamados();
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
