/* =================================
   IMPORTAFÁCIL — AUTENTICACIÓN (v2)
   ================================= */

"use strict";

// Función auxiliar para obtener el cliente de forma segura
function getSupabase() {
  const client = window.supabaseClient;
  if (!client) {
    console.error("❌ Error: window.supabaseClient no está definido. Revisa supabase.js.");
    throw new Error("Error de conexión con la base de datos.");
  }
  return client;
}

window.ImportaFacilAuth = {
  async register(email, password) {
    const client = getSupabase();
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password
    });

    if (error) throw error;

    return {
      user: data.user,
      session: data.session,
      message: data.session
        ? "Cuenta creada e iniciada."
        : "Cuenta creada. Revisa tu correo para confirmar el registro."
    };
  },

  async login(email, password) {
    const client = getSupabase();
    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error) throw error;

    return data;
  },

  async logout() {
    const client = getSupabase();
    const { error } = await client.auth.signOut();

    if (error) throw error;
  },

  async getSession() {
    const client = getSupabase();
    const { data, error } = await client.auth.getSession();

    if (error) throw error;

    return data.session;
  },

  onSessionChange(callback) {
    const client = getSupabase();
    return client.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
  }
};

console.info("Módulo de autenticación cargado.");