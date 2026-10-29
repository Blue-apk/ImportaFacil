
/* =================================
   IMPORTAFÁCIL — CONEXIÓN A SUPABASE
   ================================= */

// Reemplaza estos valores con los datos
// de tu propio proyecto de Supabase.
const SUPABASE_URL = "https://sdyknihbnmvjcwoyqctf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_3oUDcNDtr50Bgv3vFCQ-yA_gtNykJxk";

// El cliente se inicializará en el siguiente paso.
window.importaFacilConfig = {
  supabaseUrl: SUPABASE_URL,
  supabaseKey: SUPABASE_PUBLISHABLE_KEY
};
/* =================================
   IMPORTAFÁCIL — CLIENTE SUPABASE
   ================================= */

(() => {
  "use strict";

  const config = window.importaFacilConfig;

  if (!config) {
    console.error("No se encontró la configuración de Supabase.");
    return;
  }

  if (
    !config.supabaseUrl ||
    config.supabaseUrl.includes("PEGA_AQUI") ||
    !config.supabaseKey ||
    config.supabaseKey.includes("PEGA_AQUI")
  ) {
    console.error("Revisa la URL y la clave publicable de Supabase.");
    return;
  }

  if (!window.supabase?.createClient) {
    console.error("No se pudo cargar la biblioteca de Supabase.");
    return;
  }

  window.supabaseClient = window.supabase.createClient(
    config.supabaseUrl,
    config.supabaseKey
  );

  console.info("Cliente de Supabase inicializado.");
})();

