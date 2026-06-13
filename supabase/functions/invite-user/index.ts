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
      Deno.env.get('SUPABASE_SERVICE_ROLE')!,
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

    const { nome, email, perfil, hotel_id, ativo = true } = await req.json();

    if (!nome || !email || !perfil) {
      return new Response(JSON.stringify({ error: 'nome, email e perfil são obrigatórios' }), {
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

    // 1. Convida o usuário via auth (envia e-mail de convite com link para definir senha)
    const { data: invited, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: { nome },
      redirectTo: Deno.env.get('INVITE_REDIRECT_URL') || undefined,
    });

    if (inviteError) {
      return new Response(JSON.stringify({ error: inviteError.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Cria o user_profile vinculado ao auth user
    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .insert([{
        user_id:  invited.user.id,
        nome,
        email,
        perfil,
        hotel_id: hotel_id || null,
        ativo,
      }]);

    if (profileError) {
      // Rollback: remove auth user criado
      await supabaseAdmin.auth.admin.deleteUser(invited.user.id);
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ message: `Convite enviado para ${email}`, user_id: invited.user.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
