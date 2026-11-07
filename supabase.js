/* =================================
   IMPORTAFÁCIL — CONEXIÓN SUPABASE
   ================================= */

"use strict";

const SUPABASE_URL = "https://sdyknihbnmvjcwoyqctf.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_3oUDcNDtr50Bgv3vFCQ-yA_gtNykJxk";

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