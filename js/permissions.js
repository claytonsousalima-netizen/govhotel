// ================================================================
// PERMISSIONS — GovHotel
// Camada de controle de acesso no frontend.
// O Supabase RLS é a barreira definitiva — este arquivo garante
// que a UI não exiba ações indevidas e bloqueia tentativas antes
// de chegar ao banco.
//
// Carregado DEPOIS de auth.js e de todos os serviços, pois
// sobrescreve applyProfileRestrictions() definido no script inline.
// ================================================================

// ── TABELAS DE PERMISSÃO ──────────────────────────────────────
// "write" = criar + editar; "delete" = excluir

const WRITE_PERMISSIONS = {
  admin_global: ['hotels','apartments','apartment_status','maids','users','work_orders'],
  admin_hotel:  ['apartments','apartment_status','maids','users','work_orders'],
  gestor:       ['apartments','apartment_status','maids','work_orders'],
  camareira:    ['apartment_status', 'work_orders'],
};

const DELETE_PERMISSIONS = {
  admin_global: ['hotels','apartments','maids','users','work_orders'],
  admin_hotel:  ['apartments','maids','users','work_orders'],
  gestor:       [],
  camareira:    [],
};

// ── HELPERS ───────────────────────────────────────────────────

function canWrite(resource) {
  if (!currentUser) return false;
  return (WRITE_PERMISSIONS[currentUser.perfil] || []).includes(resource);
}

function canDelete(resource) {
  if (!currentUser) return false;
  return (DELETE_PERMISSIONS[currentUser.perfil] || []).includes(resource);
}

// Verifica se hotel_id pertence ao escopo do usuário logado.
// admin_global aceita qualquer hotel.
function sameHotel(hotel_id) {
  if (!currentUser) return false;
  if (currentUser.perfil === 'admin_global') return true;
  return hotel_id === currentUser.hotelId;
}

// Retorna false e exibe toast se não houver permissão de escrita.
function requireWrite(resource) {
  if (canWrite(resource)) return true;
  toast('Você não tem permissão para esta operação', 'error');
  return false;
}

// Retorna false e exibe toast se não houver permissão de exclusão.
function requireDelete(resource) {
  if (canDelete(resource)) return true;
  toast('Você não tem permissão para excluir', 'error');
  return false;
}

// ── ACCESS-DENIED PAGE ────────────────────────────────────────

function _showPageDenied(requestedId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const denied = document.getElementById('page-denied');
  if (denied) {
    const nameEl = document.getElementById('denied-page-name');
    if (nameEl) nameEl.textContent = PAGE_TITLES[requestedId] || requestedId;
    denied.classList.add('active');
  }

  document.getElementById('topbar-title').textContent = 'Acesso Negado';
  currentPage = null;
}

// ── RESTRIÇÕES DE UI (substitui a versão do script inline) ────

function applyProfileRestrictions() {
  const isCamareira = currentUser.perfil === 'camareira';

  // Topbar: "+ Nova ação"
  const btnNovaAcao = document.getElementById('btn-nova-acao');
  if (btnNovaAcao) btnNovaAcao.style.display = isCamareira ? 'none' : '';

  // Chamados: botão "Novo Chamado"
  const btnChamado = document.getElementById('btn-novo-chamado');
  if (btnChamado) btnChamado.style.display = canWrite('work_orders') ? '' : 'none';

  // Cadastro de aptos: botão "Cadastrar Apto"
  const btnCadApto = document.getElementById('btn-cadastrar-apto');
  if (btnCadApto) btnCadApto.style.display = canWrite('apartments') ? '' : 'none';

  // Equipe: botão "Adicionar Membro"
  // A camareira não tem 'equipe' no PERFIL_PAGES, então nunca chega aqui.
  // Mas por precaução, buscamos o botão e ocultamos se não tiver permissão.
  document.querySelectorAll('[onclick="openMaidForm()"]').forEach(btn => {
    btn.style.display = canWrite('maids') ? '' : 'none';
  });

  // Mapa: ações do cabeçalho
  const mapaActions = document.getElementById('mapa-header-actions');
  if (mapaActions) {
    const editaAptos = canWrite('apartments');
    mapaActions.innerHTML = [
      editaAptos
        ? `<button class="btn btn-ghost btn-sm" onclick="openPage('cadastro-apto')">⊕ Cadastrar Apto</button>`
        : '',
      `<button class="btn btn-primary btn-sm" onclick="openModal('modal-trocar-status')">Alterar Status</button>`,
    ].join('');
  }

  // Kanban: restringe drag-and-drop de status para camareira
  // (o drag é permitido — camareira pode alterar apartment_status — mas criar chamados não)
  document.querySelectorAll('.kanban-novo-chamado').forEach(btn => {
    btn.style.display = canWrite('work_orders') ? '' : 'none';
  });
}

// ── PATCH: openPage passa a exibir página de negação ──────────
// Este bloco encapsula o openPage original adicionando feedback visual.

(function patchOpenPage() {
  const _originalOpenPage = openPage;

  openPage = function(id) {
    if (!canAccess(id)) {
      _showPageDenied(id);
      return;
    }
    _originalOpenPage(id);
  };
})();
