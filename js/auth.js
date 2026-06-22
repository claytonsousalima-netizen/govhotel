// ============================================================
// SERVIÇO DE AUTENTICAÇÃO — Gov Estancorp
// Depende de: supabase-client.js (supabaseClient já instanciado)
// ============================================================

// ---------- LOGIN ----------
async function doLogin() {
  const loginInput = document.getElementById('login-email').value.trim();
  const password   = document.getElementById('login-pass').value;
  const btnLogin   = document.getElementById('btn-login');

  if (!loginInput || !password) { toast('Preencha usuário e senha', 'error'); return; }

  // Remove acentos e chars inválidos antes de montar o e-mail virtual
  const loginNorm = loginInput.includes('@')
    ? loginInput
    : loginInput.normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9._-]/g, '');
  const email = loginNorm.includes('@') ? loginNorm : `${loginNorm}@govhotel.local`;

  btnLogin.disabled = true;
  btnLogin.textContent = 'Entrando...';

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  btnLogin.disabled = false;
  btnLogin.textContent = 'Entrar no Sistema';

  if (error) {
    toast('Usuário ou senha incorretos', 'error');
    return;
  }

  await loadSessionUser(data.user);
}

// ---------- LOGOUT ----------
async function doLogout() {
  if (typeof stopRealtimeChamados === 'function') stopRealtimeChamados();
  await supabaseClient.auth.signOut();
  currentUser = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

// ---------- CARREGAR PERFIL DO USUÁRIO ----------
async function loadSessionUser(authUser) {
  const { data: profile, error } = await supabaseClient
    .from('user_profiles')
    .select('*, hotels(nome)')
    .eq('user_id', authUser.id)
    .maybeSingle();

  if (error || !profile) {
    toast('Perfil de acesso não encontrado. Contate o administrador.', 'error');
    await supabaseClient.auth.signOut();
    return;
  }

  if (!profile.ativo) {
    toast('Usuário inativo. Contate o administrador.', 'error');
    await supabaseClient.auth.signOut();
    return;
  }

  currentUser = {
    id:        authUser.id,
    nome:      profile.nome,
    email:     authUser.email,
    perfil:    profile.perfil,
    hotelId:   profile.hotel_id,
    hotelNome: profile.hotels?.nome || null,
    initials:  profile.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase(),
    role:      PERFIL_LABELS[profile.perfil] || profile.perfil,
  };

  startApp();

  // Solicita permissão de notificação do navegador para perfis operacionais
  const _perfisNotif = ['camareira', 'manutencao', 'supervisora', 'gestor', 'admin'];
  if (_perfisNotif.includes(profile.perfil) && typeof solicitarPermissaoNotificacao === 'function') {
    solicitarPermissaoNotificacao();
  }

  // Primeiro acesso: força troca de senha
  if (authUser.user_metadata?.force_password_change) {
    setTimeout(() => _abrirTrocaSenhaObrigatoria(), 300);
  }
}

// ---------- VERIFICAR SESSÃO AO CARREGAR ----------
async function checkSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (session) {
    await loadSessionUser(session.user);
  } else {
    document.getElementById('login-screen').style.display = 'flex';
  }

  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') {
      currentUser = null;
      document.getElementById('app').style.display = 'none';
      document.getElementById('login-screen').style.display = 'flex';
    }
  });
}

// ---------- TROCA DE SENHA OBRIGATÓRIA (primeiro acesso) ----------
function _abrirTrocaSenhaObrigatoria() {
  const modal = document.getElementById('modal-senha');
  if (!modal) return;

  if (!document.getElementById('aviso-primeiro-acesso')) {
    const body = modal.querySelector('.modal-body');
    const aviso = document.createElement('div');
    aviso.id = 'aviso-primeiro-acesso';
    aviso.style.cssText = 'background:var(--warning-bg,#fffbe6);border:1px solid var(--warning,#f59e0b);border-radius:6px;padding:10px 14px;font-size:12px;color:var(--warning-dark,#92400e);margin-bottom:16px;';
    aviso.textContent = 'Primeiro acesso — por segurança, defina uma nova senha antes de continuar.';
    body.insertBefore(aviso, body.firstChild);
  }

  modal.dataset.obrigatorio = 'true';
  const btnClose = modal.querySelector('.btn-close');
  if (btnClose) btnClose.style.display = 'none';

  openModal('modal-senha');
}

// ---------- ALTERAR SENHA ----------
async function changePassword() {
  const nova     = document.getElementById('nova-senha').value;
  const confirma = document.getElementById('confirmar-senha').value;

  if (!nova || nova.length < 6) {
    toast('A senha deve ter pelo menos 6 caracteres', 'error'); return;
  }
  if (nova !== confirma) {
    toast('As senhas não conferem', 'error'); return;
  }

  const btn = document.getElementById('btn-salvar-senha');
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  const { error } = await supabaseClient.auth.updateUser({ password: nova });

  btn.disabled = false;
  btn.textContent = 'Salvar nova senha';

  if (error) {
    toast('Erro: ' + error.message, 'error'); return;
  }

  document.getElementById('nova-senha').value = '';
  document.getElementById('confirmar-senha').value = '';

  const modal = document.getElementById('modal-senha');
  if (modal?.dataset.obrigatorio) {
    await supabaseClient.auth.updateUser({ data: { force_password_change: false } });
    delete modal.dataset.obrigatorio;
    const aviso = document.getElementById('aviso-primeiro-acesso');
    if (aviso) aviso.remove();
    const btnClose = modal.querySelector('.btn-close');
    if (btnClose) btnClose.style.display = '';
  }

  closeModal('modal-senha');
  toast('Senha alterada com sucesso!', 'success');
}

// ---------- LABELS DE PERFIL ----------
const PERFIL_LABELS = {
  admin_global: 'Administrador Global',
  admin_hotel:  'Admin do Hotel',
  gestor:       'Gestor',
  supervisora:  'Supervisora',
  camareira:    'Camareira',
  manutencao:   'Manutenção',
};

// ---------- PERMISSÕES POR PERFIL ----------
const PERFIL_PAGES = {
  admin_global: ['hoteis','usuarios','dashboard','mapa','kanban','chamados','equipe','cadastro-apto','relatorios','config','minha-fila','integracao-xls'],
  admin_hotel:  ['usuarios','dashboard','mapa','kanban','chamados','equipe','cadastro-apto','relatorios','config','minha-fila','integracao-xls'],
  gestor:       ['dashboard','mapa','kanban','chamados','equipe','relatorios','minha-fila','integracao-xls'],
  supervisora:  ['mapa','kanban','chamados','equipe','minha-fila'],
  camareira:    ['app-camareira','mapa','chamados','minha-fila'],
  manutencao:   ['mapa','chamados'],
};

function canAccess(page) {
  if (!currentUser) return false;
  return (PERFIL_PAGES[currentUser.perfil] || []).includes(page);
}
