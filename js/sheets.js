/* ====================================================
   HOSTAL HDQ — sheets.js
   Cliente para Google Apps Script / Google Sheets

   ⚠️  PASO OBLIGATORIO:
   Reemplaza SHEETS_URL con la URL real de tu Apps Script
   después de desplegarlo.
   ==================================================== */

const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbyIRVp3Ikj3OYDyVaJBeu7si6k5EsUzvuOO--H1_VkNsSXYkgfkFYtlwiEOT_uoyVlMFA/exec';

/* ──────────────────────────────────────────────────
   ESTADO DE CONEXIÓN
   ────────────────────────────────────────────────── */
const SHEETS = {

  isConfigured() {
    return SHEETS_URL && SHEETS_URL !== 'PENDIENTE';
  },

  /* ── GUARDAR RESERVA ──
     Usa no-cors (fire & forget) para evitar bloqueos CORS.
     No podemos leer la respuesta, pero la reserva SÍ se guarda. */
  async save(reserva) {
    if (!this.isConfigured()) {
      console.info('[Sheets] No configurado — solo localStorage.');
      return { ok: false, razon: 'no-configurado' };
    }
    try {
      await fetch(SHEETS_URL, {
        method:  'POST',
        mode:    'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body:    JSON.stringify({ action: 'save', reserva })
      });
      return { ok: true };
    } catch (err) {
      console.warn('[Sheets] Error al guardar:', err);
      return { ok: false, error: err.message };
    }
  },

  /* ── OBTENER TODAS LAS RESERVAS ──
     GET con CORS normal — devuelve JSON. */
  async getAll() {
    if (!this.isConfigured()) return null;
    try {
      const res = await fetch(SHEETS_URL + '?action=getAll', {
        method: 'GET',
        cache:  'no-store'
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      return data.ok ? (data.reservas || []) : null;
    } catch (err) {
      console.warn('[Sheets] Error al obtener reservas:', err);
      return null; // null = usar localStorage como fallback
    }
  },

  /* ── CAMBIAR ESTADO ── */
  async updateEstado(id, estado) {
    if (!this.isConfigured()) return { ok: false };
    try {
      await fetch(SHEETS_URL, {
        method:  'POST',
        mode:    'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body:    JSON.stringify({ action: 'updateEstado', id, estado })
      });
      return { ok: true };
    } catch (err) {
      console.warn('[Sheets] Error al actualizar estado:', err);
      return { ok: false };
    }
  },

  /* ── GUARDAR CLIENTE ── */
  async saveCliente(cliente) {
    if (!this.isConfigured()) return { ok: false };
    try {
      await fetch(SHEETS_URL, {
        method:  'POST',
        mode:    'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body:    JSON.stringify({ action: 'saveCliente', cliente })
      });
      return { ok: true };
    } catch (err) {
      console.warn('[Sheets] Error al guardar cliente:', err);
      return { ok: false };
    }
  },

  /* ── VERIFICAR CONEXIÓN ── */
  async ping() {
    if (!this.isConfigured()) return false;
    try {
      const res  = await fetch(SHEETS_URL + '?action=ping', { cache: 'no-store' });
      const data = await res.json();
      return data.ok === true;
    } catch {
      return false;
    }
  }
};

/* ──────────────────────────────────────────────────
   BANNER DE ESTADO DE CONEXIÓN
   Muestra si los datos vienen de Sheets o localStorage
   ────────────────────────────────────────────────── */
async function mostrarEstadoConexion(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (!SHEETS.isConfigured()) {
    el.innerHTML = `
      <div class="alert alert-warning" style="margin-bottom:0;">
        <span>⚠️</span>
        <span><strong>Modo local:</strong> los datos se guardan solo en este navegador.
        Configura Google Sheets para compartir entre usuarios.
        <a href="#" onclick="verInstrucciones()" style="font-weight:700;">Ver instrucciones →</a></span>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="alert alert-info" style="margin-bottom:0;">
      <span>🔄</span><span>Conectando con Google Sheets...</span>
    </div>`;

  const ok = await SHEETS.ping();
  el.innerHTML = ok
    ? `<div class="alert alert-success" style="margin-bottom:0;">
        <span>✅</span>
        <span><strong>Conectado a Google Sheets.</strong>
        Los datos se sincronizan entre todos los usuarios en tiempo real.</span>
       </div>`
    : `<div class="alert alert-warning" style="margin-bottom:0;">
        <span>⚠️</span>
        <span><strong>Sin conexión a Sheets.</strong>
        Mostrando datos locales. Verifica tu URL de Apps Script.</span>
       </div>`;
}

/* ──────────────────────────────────────────────────
   CARGA UNIFICADA DE RESERVAS
   Intenta Sheets primero, cae a localStorage si falla
   ────────────────────────────────────────────────── */
async function cargarReservasCloud() {
  if (SHEETS.isConfigured()) {
    const data = await SHEETS.getAll();
    if (data !== null) return { fuente: 'sheets', reservas: data };
  }
  // Fallback: localStorage
  return { fuente: 'local', reservas: RESERVAS.getAll() };
}
