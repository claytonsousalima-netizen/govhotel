// ============================================================
// SUPABASE CLIENT — Gov Estancorp
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

const SUPABASE_URL = 'https://api.govhotel.tools.estancorp.com.br';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg1MzQ1NDUwLCJleHAiOjE5NDMwMjU0NTB9.dJigBkn3o_Awz3olnsQEBC0SLMXQvxfuoUYz2rgvx9c';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
