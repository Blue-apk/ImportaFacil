/* =================================
   IMPORTAFÁCIL — CONEXIÓN SUPABASE
   ================================= */

"use strict";

const SUPABASE_URL = "https://sdyknihbnmvjcwoyqctf.supabase.co"; 
const SUPABASE_ANON_KEY = "sb_publishable_3oUDcNDtr50Bgv3vFCQ-yA_gtNykJxk";

// Creamos el cliente y lo guardamos en window
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.info("✅ Conexión con Supabase establecida correctamente.");