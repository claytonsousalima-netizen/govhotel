// ============================================================
// SUPABASE CLIENT — GovHotel
//
// Substitua os dois valores abaixo pelos do seu projeto:
//   Dashboard Supabase → Project Settings → API
//
// SUPABASE_URL  : "Project URL"   (https://xxxx.supabase.co)
// SUPABASE_KEY  : "anon public"   (começa com eyJ...)
//
// A chave "anon public" é SEGURA para ficar no frontend.
// Ela é protegida pelas políticas RLS do banco.
//
// NUNCA coloque a "service_role" key aqui.
// Ela deve ficar apenas nos Secrets da Edge Function.
// ============================================================

const SUPABASE_URL = 'https://SEU_PROJETO.supabase.co';
const SUPABASE_KEY = 'SUA_CHAVE_ANON_PUBLICA';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
