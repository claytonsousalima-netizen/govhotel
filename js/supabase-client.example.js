// ============================================================
// TEMPLATE — copie este arquivo como supabase-client.js
// e preencha com as credenciais do seu projeto Supabase.
//
// Onde encontrar:
//   1. Acesse https://supabase.com/dashboard
//   2. Selecione seu projeto
//   3. Vá em Project Settings → API
//   4. Copie "Project URL" → SUPABASE_URL
//   5. Copie "anon public"  → SUPABASE_KEY
//
// ATENÇÃO:
//   ✅ "anon public" → pode ficar no repositório público
//   ❌ "service_role" → NUNCA coloque aqui; use Supabase Secrets
// ============================================================

const SUPABASE_URL = 'https://XXXXXXXXXXXXXXXX.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
