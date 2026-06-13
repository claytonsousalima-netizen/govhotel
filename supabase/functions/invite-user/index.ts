// ================================================================
// Edge Function: invite-user
// Cria um auth user + user_profile via service role key (server-side).
//
// Deploy: supabase functions deploy invite-user
// Secrets necessários (supabase secrets set):
//   SUPABASE_URL          → URL do seu projeto
//   SUPABASE_SERVICE_ROLE → service_role key (NÃO a anon key)
// ================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Valida que a requisição vem de um usuário autenticado
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verifica perfil do solicitante
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: caller } } = await supabaseUser.auth.getUser();
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Sessão inválida' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('perfil, hotel_id')
      .eq('user_id', caller.id)
      .single();

    if (!callerProfile || !['admin_global', 'admin_hotel'].includes(callerProfile.perfil)) {
      return new Response(JSON.stringify({ error: 'Sem permissão para criar usuários' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { nome, email, senha, perfil, hotel_id, ativo = true } = await req.json();

    if (!nome || !email || !senha || !perfil) {
      return new Response(JSON.stringify({ error: 'nome, email, senha e perfil são obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (senha.length < 6) {
      return new Response(JSON.stringify({ error: 'A senha deve ter pelo menos 6 caracteres' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // admin_hotel não pode criar admin_global e só pode criar para o próprio hotel
    if (callerProfile.perfil === 'admin_hotel') {
      if (perfil === 'admin_global') {
        return new Response(JSON.stringify({ error: 'admin_hotel não pode criar admin_global' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (hotel_id && hotel_id !== callerProfile.hotel_id) {
        return new Response(JSON.stringify({ error: 'Só é possível criar usuários para o próprio hotel' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 1. Cria o usuário com senha definida pelo admin; força troca no primeiro acesso
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome, force_password_change: true },
    });

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Cria o user_profile vinculado ao auth user
    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .insert([{
        user_id:  created.user.id,
        nome,
        perfil,
        hotel_id: hotel_id || null,
        ativo,
      }]);

    if (profileError) {
      // Rollback: remove auth user criado
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ message: `Usuário ${email} criado com sucesso`, user_id: created.user.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
