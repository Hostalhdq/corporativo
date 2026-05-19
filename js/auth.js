/* ================================================
   HOSTAL HDQ — auth.js
   3 entornos: owner · staff · web
   ================================================ */

const AUTH = (() => {

  const USERS = {
    /* ── Entorno 1: Dueño ──────────────────────── */
    'david': {
      password:    'hdq2026',
      role:        'owner',
      displayName: 'David — Hostal HDQ',
      shortName:   'David',
      origen:      'Teléfono',
      email:       'davidquiero@gmail.com'
    },
    /* ── Entorno 2: Staff ──────────────────────── */
    'nelson': {
      password:    'nelson2026',
      role:        'staff',
      displayName: 'Nelson — Hostal HDQ',
      shortName:   'Nelson',
      origen:      'Teléfono',
      email:       'davidquiero@gmail.com'
    },
    /* ── Entorno 3: Web / Cliente corporativo ──── */
    'sei-consultores': {
      password:    'sei2026',
      role:        'web',
      displayName: 'EMPRESA DE INVENTARIOS SEI',
      shortName:   'SEI Consultores',
      origen:      'Web',
      email:       'ftapia@seiconsultores.cl'
    }
  };

  const SESSION_KEY = 'hdq_session';

  function login(username, password) {
    const key  = username.trim().toLowerCase();
    const user = USERS[key];
    if (!user)              return { success: false, error: 'Usuario no encontrado.' };
    if (user.password !== password) return { success: false, error: 'Contraseña incorrecta.' };

    const session = {
      username:    key,
      role:        user.role,
      displayName: user.displayName,
      shortName:   user.shortName,
      origen:      user.origen,
      email:       user.email,
      loginTime:   new Date().toISOString()
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return { success: true, role: user.role, session };
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    window.location.href = 'index.html';
  }

  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  /* Redirige si no hay sesión.
     roles válidos: 'owner' | 'staff' | 'web' | null (cualquiera)
     Llama a esto en un <script> dentro del <head> para evitar parpadeo. */
  function requireAuth(allowedRoles) {
    const session = getSession();
    if (!session) {
      window.location.replace('index.html');
      return null;
    }
    if (allowedRoles) {
      const list = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
      if (!list.includes(session.role)) {
        window.location.replace('index.html');
        return null;
      }
    }
    /* Auth OK → mostrar página (venía oculta para evitar parpadeo) */
    document.documentElement.style.visibility = 'visible';
    return session;
  }

  /* Para index.html: si ya hay sesión, redirigir sin mostrar login */
  function redirectIfLoggedIn() {
    const s = getSession();
    if (s) {
      window.location.replace('dashboard.html');
      return true;
    }
    document.documentElement.style.visibility = 'visible';
    return false;
  }

  function isOwner()  { return getSession()?.role === 'owner'; }
  function isStaff()  { return getSession()?.role === 'staff'; }
  function isInternal(){ const r = getSession()?.role; return r === 'owner' || r === 'staff'; }
  function isWeb()    { return getSession()?.role === 'web'; }

  return { login, logout, getSession, requireAuth, isOwner, isStaff, isInternal, isWeb };
})();

/* ================================================
   HELPERS GLOBALES
   ================================================ */
function formatCLP(amount) {
  return '$' + Number(amount || 0).toLocaleString('es-CL');
}
function formatDate(isoStr) {
  if (!isoStr) return '—';
  /* Forzar hora local para evitar desfase UTC en Chile (UTC-4).
     '2026-05-13' sin hora se interpreta como UTC midnight → en Chile
     aparece como May 12 a las 20:00 → día incorrecto.
     Agregando 'T12:00:00' lo forzamos a mediodía local. */
  const safe = isoStr.length === 10 ? isoStr + 'T12:00:00' : isoStr;
  return new Date(safe).toLocaleDateString('es-CL',
    { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  const safe = isoStr.length === 10 ? isoStr + 'T12:00:00' : isoStr;
  return new Date(safe).toLocaleString('es-CL',
    { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function showAlert(containerId, type, message) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  el.innerHTML = `<div class="alert alert-${type}">
    <span>${icons[type] || 'ℹ️'}</span><span>${message}</span></div>`;
}
function clearAlert(id) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = '';
}

/* ---- Badge de origen (con color) ---- */
function badgeOrigen(origen) {
  const map = {
    'Teléfono':        { color: '#1e3a5f', bg: '#e8f1fb', label: '📞 Teléfono' },
    'Teléfono-David':  { color: '#1e3a5f', bg: '#e8f1fb', label: '📞 David' },
    'Teléfono-Nelson': { color: '#6b21a8', bg: '#f5f3ff', label: '📞 Nelson' },
    'Web':             { color: '#065f46', bg: '#ecfdf5', label: '🌐 Web' }
  };
  const cfg = map[origen] || map['Teléfono'];
  return `<span style="
    display:inline-block;padding:2px 9px;border-radius:20px;font-size:0.75rem;font-weight:700;
    background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.color}33;"
  >${cfg.label}</span>`;
}

/* ---- Inicializar layout lateral ---- */
function initLayout(pageId) {
  const session = AUTH.getSession();
  if (!session) return;

  const nameEl = document.getElementById('sidebar-username');
  const roleEl = document.getElementById('sidebar-role');
  const footEl = document.getElementById('sidebar-username-footer');
  if (nameEl) nameEl.textContent = session.shortName;
  if (footEl) footEl.textContent = session.shortName;
  if (roleEl) {
    const labels = { owner: 'Dueño — HDQ', staff: 'Staff — HDQ', web: 'Cliente Corporativo' };
    roleEl.textContent = labels[session.role] || session.role;
  }

  const dateEl = document.getElementById('topbar-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('es-CL',
      { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  document.querySelectorAll('.nav-item[data-page]').forEach(link => {
    if (link.dataset.page === pageId) link.classList.add('active');
  });

  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', () => AUTH.logout());

  // Mobile sidebar toggle
  const menuToggle = document.getElementById('menu-toggle');
  const sidebar    = document.getElementById('sidebar');
  const overlay    = document.getElementById('sidebar-overlay');
  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay?.classList.toggle('show');
    });
    overlay?.addEventListener('click', () => {
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
    });
  }
}
