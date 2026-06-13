// ============================================================
// SERVIÇO DE AUTENTICAÇÃO — GovHotel
// Depende de: supabase-client.js (supabaseClient já instanciado)
// ============================================================

// ---------- LOGIN ----------
async function doLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-pass').value;
  const btnLogin = document.getElementById('btn-login');

  if (!email || !password) { toast('Preencha e-mail e senha', 'error'); return; }

  btnLogin.disabled = true;
  btnLogin.textContent = 'Entrando...';

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  btnLogin.disabled = false;
  btnLogin.textContent = 'Entrar no Sistema';

  if (error) {
    toast('E-mail ou senha incorretos', 'error');
    return;
  }

  await loadSessionUser(data.user);
}

// ---------- LOGOUT ----------
async function doLogout() {
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
    id:       authUser.id,
    nome:     profile.nome,
    email:    authUser.email,
    perfil:   profile.perfil,          // admin_global | admin_hotel | gestor | camareira
    hotelId:  profile.hotel_id,
    hotelNome: profile.hotels?.nome || null,
    initials: profile.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase(),
    role:     PERFIL_LABELS[profile.perfil] || profile.perfil,
  };

  startApp();
}

// ---------- VERIFICAR SESSÃO AO CARREGAR ----------
async function checkSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (session) {
    await loadSessionUser(session.user);
  } else {
    document.getElementById('login-screen').style.display = 'flex';
  }

  // Listener para mudanças de sessão (ex: expiração do token)
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') {
      currentUser = null;
      document.getElementById('app').style.display = 'none';
      document.getElementById('login-screen').style.display = 'flex';
    }
    if (event === 'TOKEN_REFRESHED') {
      // sessão renovada automaticamente — sem ação necessária
    }
  });
}

// ---------- ALTERAR SENHA ----------
async function changePassword() {
  const nova      = document.getElementById('nova-senha').value;
  const confirma  = document.getElementById('confirmar-senha').value;

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
  closeModal('modal-senha');
  toast('Senha alterada com sucesso!', 'success');
}

// ---------- LABELS DE PERFIL ----------
const PERFIL_LABELS = {
  admin_global: 'Administrador Global',
  admin_hotel:  'Admin do Hotel',
  gestor:       'Gestor',
  camareira:    'Camareira',
};

// ---------- PERMISSÕES POR PERFIL ----------
const PERFIL_PAGES = {
  admin_global: ['hoteis','usuarios','dashboard','mapa','kanban','chamados','equipe','cadastro-apto','relatorios','config'],
  admin_hotel:  ['usuarios','dashboard','mapa','kanban','chamados','equipe','cadastro-apto','relatorios','config'],
  gestor:       ['dashboard','mapa','kanban','chamados','equipe','relatorios'],
  camareira:    ['app-camareira','mapa'],
};

function canAccess(page) {
  if (!currentUser) return false;
  return (PERFIL_PAGES[currentUser.perfil] || []).includes(page);
}
