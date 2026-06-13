// ================================================================
// Edge Function: invite-user
// Cria auth user + user_profile.
// Aceita login simples (ex: "joana.silva") ou e-mail completo.
// Se não tiver "@", usa email virtual: login@govhotel.local
// ================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!;

  try {
    // 1. Valida JWT do solicitante
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autorizado' }, 401);

    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: ANON_KEY },
    });
    if (!userRes.ok) return json({ error: 'Sessão inválida' }, 401);
    const { id: callerId } = await userRes.json();

    // 2. Busca perfil do solicitante
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_profiles?user_id=eq.${callerId}&select=perfil,hotel_id&limit=1`,
      { headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY } }
    );
    const profiles = await profileRes.json();
    const callerProfile = profiles?.[0];

    if (!callerProfile || !['admin_global', 'admin_hotel'].includes(callerProfile.perfil)) {
      return json({ error: 'Sem permissão para criar usuários' }, 403);
    }

    // 3. Lê payload
    const { nome, login, senha, perfil, hotel_id, ativo = true } = await req.json();

    if (!nome || !login || !senha || !perfil) {
      return json({ error: 'nome, login, senha e perfil são obrigatórios' }, 400);
    }
    if (senha.length < 6) {
      return json({ error: 'A senha deve ter pelo menos 6 caracteres' }, 400);
    }

    // Login simples → e-mail virtual para o Supabase Auth
    const email = login.includes('@') ? login : `${login}@govhotel.local`;

    // 4. Restrições admin_hotel
    if (callerProfile.perfil === 'admin_hotel') {
      if (perfil === 'admin_global') {
        return json({ error: 'admin_hotel não pode criar admin_global' }, 403);
      }
      if (hotel_id && hotel_id !== callerProfile.hotel_id) {
        return json({ error: 'Só é possível criar usuários para o próprio hotel' }, 403);
      }
    }

    // 5. Cria usuário no Auth
    const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { nome, force_password_change: true },
      }),
    });

    const created = await createRes.json();
    if (!createRes.ok) {
      return json({ error: created.message || created.msg || 'Erro ao criar usuário no Auth' }, 400);
    }

    // 6. Cria user_profile com campo login para exibição
    const profileInsertRes = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        user_id:  created.id,
        nome,
        login,
        perfil,
        hotel_id: hotel_id || null,
        ativo,
      }),
    });

    if (!profileInsertRes.ok) {
      const err = await profileInsertRes.text();
      // Rollback: remove auth user
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${created.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY },
      });
      return json({ error: err }, 400);
    }

    return json({ message: `Usuário "${login}" criado com sucesso`, user_id: created.id }, 200);

  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
