
/* =================================
   IMPORTAFÁCIL — AUTENTICACIÓN
   ================================= */

"use strict";

window.ImportaFacilAuth = {
  async register(email, password) {
    const { data, error } =
      await window.supabaseClient.auth.signUp({
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
    const { data, error } =
      await window.supabaseClient.auth.signInWithPassword({
        email: email.trim(),
        password
      });

    if (error) throw error;

    return data;
  },

  async logout() {
    const { error } =
      await window.supabaseClient.auth.signOut();

    if (error) throw error;
  },

  async getSession() {
    const { data, error } =
      await window.supabaseClient.auth.getSession();

    if (error) throw error;

    return data.session;
  },

  onSessionChange(callback) {
    return window.supabaseClient.auth.onAuthStateChange(
      (event, session) => {
        callback(event, session);
      }
    );
  }
};

console.info("Módulo de autenticación cargado.");
