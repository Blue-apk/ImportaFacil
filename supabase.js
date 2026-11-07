/* =================================
   IMPORTAFÁCIL — CONEXIÓN SUPABASE
   ================================= */

"use strict";

const SUPABASE_URL = "https://sdyknihbnmvjcwoyqctf.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_SciAQy_sOtF2m6HcElDhLg_WZYaIjok";

window.supabaseClient = window.supabase.createClient(
  SUPABASE_URL, 
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

console.info("✅ Conexión con Supabase establecida correctamente.");
