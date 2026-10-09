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

const SUPABASE_URL = 'https://fjohwpkjjxeqqxudzmhz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqb2h3cGtqanhlcXF4dWR6bWh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzMDY4NjcsImV4cCI6MjA5Njg4Mjg2N30.iKFw2WNYX_PVAtAXsLT6weFf9oXjeQhR90Ny0i4pyhQ';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
