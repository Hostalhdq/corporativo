/* ================================================
   HOSTAL HDQ — reservas.js
   Habitaciones reales · Desayunos · Descuentos
   ================================================ */

const HABITACIONES = {
  '101': { tipo: 'Doble',         precio: 35700,  piso: 1, icono: '🛏️' },
  '102': { tipo: 'Cuádruple',     precio: 80000,  piso: 1, icono: '🛏️🛏️' },
  '103': { tipo: 'Doble 2 Camas', precio: 40000,  piso: 1, icono: '🛏️🛏️' },
  '201': { tipo: 'Cuádruple',     precio: 80000,  piso: 2, icono: '🛏️🛏️' },
  '202': { tipo: 'Matrimonial',   precio: 40000,  piso: 2, icono: '🛏️' },
  '203': { tipo: 'Matrimonial',   precio: 40000,  piso: 2, icono: '🛏️' },
  '204': { tipo: '2 Camas',       precio: 45000,  piso: 2, icono: '🛏️🛏️' },
  '205': { tipo: 'Triple',        precio: 60000,  piso: 2, icono: '🛏️🛏️🛏️' },
  '206': { tipo: 'Cuádruple',     precio: 80000,  piso: 2, icono: '🛏️🛏️' },
  '207': { tipo: 'Cuádruple',     precio: 80000,  piso: 2, icono: '🛏️🛏️' }
};

const PRECIO_DESAYUNO = 4000;

/* ---- Estado de selección ---- */
let habitacionesSeleccionadas = new Set();

/* ================================================
   DISPONIBILIDAD POR FECHAS
   ================================================ */

/* Comprueba si dos rangos de fechas se solapan */
function fechasSolapan(ci1, co1, ci2, co2) {
  return ci1 < co2 && co1 > ci2;
}

/* Devuelve un Map: numHab → { estado, id, checkin, checkout }
   para las habitaciones ocupadas en el rango solicitado.
   Consulta Sheets si está configurado, localStorage como fallback. */
async function getOcupacion(checkin, checkout) {
  if (!checkin || !checkout) return new Map();

  let reservas;
  try {
    if (typeof SHEETS !== 'undefined' && SHEETS.isConfigured()) {
      const data = await SHEETS.getAll();
      reservas = Array.isArray(data) ? data : RESERVAS.getAll();
    } else {
      reservas = RESERVAS.getAll();
    }
  } catch { reservas = RESERVAS.getAll(); }

  const ocupadas = new Map();

  reservas
    .filter(r => r.estado !== 'cancelada')
    .forEach(r => {
      if (!r.checkin || !r.checkout) return;
      if (fechasSolapan(checkin, checkout, r.checkin, r.checkout)) {
        (r.habitaciones || []).forEach(h => {
          ocupadas.set(String(h.numero), {
            estado:   r.estado,
            id:       r.id,
            checkin:  r.checkin,
            checkout: r.checkout
          });
        });
      }
    });

  return ocupadas;
}

/* ================================================
   GRID DE HABITACIONES
   ================================================ */

/* ocupadas: Map<numHab, {estado, checkin, checkout}> */
function renderRoomGrid(ocupadas = new Map()) {
  const piso1 = Object.entries(HABITACIONES).filter(([, h]) => h.piso === 1);
  const piso2 = Object.entries(HABITACIONES).filter(([, h]) => h.piso === 2);

  function buildCard([num, h]) {
    const occ = ocupadas.get(num);
    const sel = habitacionesSeleccionadas.has(num);

    if (occ) {
      /* Habitación ocupada */
      const isPending   = occ.estado === 'pendiente';
      const cls         = isPending ? 'occ-pending' : 'occ-confirmed';
      const badgeCls    = isPending ? 'badge-occ-pending' : 'badge-occ-confirmed';
      const badgeText   = isPending ? '⏳ Reservada' : '✅ Confirmada';
      const tooltip     = `${formatDate(occ.checkin)} → ${formatDate(occ.checkout)}`;

      return `
        <div class="room-card occupied ${cls}"
             id="room-card-${num}"
             onclick="mostrarTooltipOcupada(event,'${num}','${tooltip}')"
             title="Ocupada: ${tooltip}">
          <div class="room-card-num" style="opacity:0.6;">${num}</div>
          <div class="room-card-ico" style="opacity:0.5;">🔒</div>
          <div class="room-card-tipo">${h.tipo}</div>
          <div class="room-card-price" style="opacity:0.5;">${formatCLP(h.precio)}<span>/noche</span></div>
          <div><span class="room-status-badge ${badgeCls}">${badgeText}</span></div>
          <div class="room-card-check"></div>
        </div>`;
    }

    /* Habitación disponible */
    return `
      <div class="room-card ${sel ? 'selected' : ''}"
           id="room-card-${num}" onclick="toggleRoom('${num}')">
        <div class="room-card-num">${num}</div>
        <div class="room-card-ico">${h.icono}</div>
        <div class="room-card-tipo">${h.tipo}</div>
        <div class="room-card-price">${formatCLP(h.precio)}<span>/noche</span></div>
        <div><span class="room-status-badge badge-available">🟢 Disponible</span></div>
        <div class="room-card-check">${sel ? '✅' : ''}</div>
      </div>`;
  }

  /* Resumen de disponibilidad */
  const total     = Object.keys(HABITACIONES).length;
  const nOcupadas = ocupadas.size;
  const nLibres   = total - nOcupadas;
  const nPend     = [...ocupadas.values()].filter(o => o.estado === 'pendiente').length;
  const nConf     = [...ocupadas.values()].filter(o => o.estado === 'confirmada').length;

  const resumen = ocupadas.size > 0
    ? `<div class="disponibilidad-resumen">
        <span class="disp-chip disp-chip-libre">🟢 ${nLibres} disponible${nLibres!==1?'s':''}</span>
        ${nPend > 0 ? `<span class="disp-chip disp-chip-pending">⏳ ${nPend} reservada${nPend!==1?'s':''} (pendiente)</span>` : ''}
        ${nConf > 0 ? `<span class="disp-chip disp-chip-occupied">🔴 ${nConf} confirmada${nConf!==1?'s':''}</span>` : ''}
       </div>`
    : '';

  document.getElementById('room-grid-container').innerHTML = `
    ${resumen}
    <div class="disponibilidad-legend">
      <div class="legend-item"><div class="legend-dot ld-available"></div> Disponible</div>
      <div class="legend-item"><div class="legend-dot ld-selected"></div> Seleccionada</div>
      <div class="legend-item"><div class="legend-dot ld-pending"></div> Reservada (pendiente)</div>
      <div class="legend-item"><div class="legend-dot ld-confirmed"></div> Confirmada</div>
    </div>
    <div class="floor-section">
      <div class="floor-label">🏠 Primer Piso</div>
      <div class="room-grid">${piso1.map(buildCard).join('')}</div>
    </div>
    <div class="floor-section">
      <div class="floor-label">🏠 Segundo Piso</div>
      <div class="room-grid">${piso2.map(buildCard).join('')}</div>
    </div>`;
}

/* Tooltip al hacer clic en habitación ocupada */
let _tooltipEl = null;
function mostrarTooltipOcupada(event, num, texto) {
  if (!_tooltipEl) {
    _tooltipEl = document.createElement('div');
    _tooltipEl.className = 'occ-tooltip';
    document.body.appendChild(_tooltipEl);
    document.addEventListener('click', () => _tooltipEl.classList.remove('show'), true);
  }
  _tooltipEl.textContent = `Hab. ${num} ocupada: ${texto}`;
  _tooltipEl.style.left = (event.clientX + 10) + 'px';
  _tooltipEl.style.top  = (event.clientY - 30) + 'px';
  _tooltipEl.classList.add('show');
  event.stopPropagation();
}

function toggleRoom(num) {
  if (habitacionesSeleccionadas.has(num)) habitacionesSeleccionadas.delete(num);
  else habitacionesSeleccionadas.add(num);

  const card = document.getElementById('room-card-' + num);
  if (card) {
    card.classList.toggle('selected', habitacionesSeleccionadas.has(num));
    const checkEl = card.querySelector('.room-card-check');
    if (checkEl) checkEl.textContent = habitacionesSeleccionadas.has(num) ? '✅' : '';
  }
  updateTotal();
}

/* Actualiza disponibilidad cuando cambian las fechas (async) */
async function actualizarDisponibilidad() {
  const checkin  = document.getElementById('checkin')?.value;
  const checkout = document.getElementById('checkout')?.value;

  if (!checkin || !checkout || calcularNoches(checkin, checkout) <= 0) {
    renderRoomGrid(new Map());
    return;
  }

  /* Indicador de carga en el grid */
  const gridEl = document.getElementById('room-grid-container');
  if (gridEl) {
    gridEl.innerHTML = `
      <div style="text-align:center;padding:24px;color:var(--text-muted);">
        <div class="spinner" style="border-color:rgba(30,58,95,0.2);
             border-top-color:var(--primary);width:22px;height:22px;
             margin:0 auto 8px;"></div>
        <p style="font-size:0.85rem;">Verificando disponibilidad...</p>
      </div>`;
  }

  const ocupadas = await getOcupacion(checkin, checkout);

  /* Quitar de seleccionadas las que quedaron ocupadas */
  let removidas = [];
  for (const num of habitacionesSeleccionadas) {
    if (ocupadas.has(num)) {
      habitacionesSeleccionadas.delete(num);
      removidas.push('Hab. ' + num);
    }
  }

  renderRoomGrid(ocupadas);

  /* Aviso si se deseleccionó alguna */
  if (removidas.length > 0) {
    showAlert('form-alert', 'warning',
      `⚠️ ${removidas.join(', ')} ya no está disponible para las fechas seleccionadas y fue quitada de tu selección.`);
  }

  updateTotal();
}

/* ================================================
   CÁLCULO DE TOTALES
   ================================================ */
function calcularNoches(checkin, checkout) {
  const a = new Date(checkin), b = new Date(checkout);
  if (isNaN(a) || isNaN(b) || b <= a) return 0;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function getDescuento(bruto) {
  const tipo  = document.getElementById('descuento-tipo')?.value || 'porcentaje';
  const valor = parseFloat(document.getElementById('descuento-valor')?.value) || 0;
  if (valor <= 0) return 0;
  return tipo === 'porcentaje'
    ? Math.round(bruto * Math.min(valor, 100) / 100)
    : Math.min(valor, bruto);
}

function updateTotal() {
  const checkin  = document.getElementById('checkin')?.value;
  const checkout = document.getElementById('checkout')?.value;
  const noches   = calcularNoches(checkin, checkout);
  const habs     = Array.from(habitacionesSeleccionadas);

  renderSelectedRooms(habs, noches);

  if (noches <= 0 || habs.length === 0) {
    setTotalDisplay(0, 0, 0, 0, 0, 0);
    return;
  }

  const subtotalHabs      = habs.reduce((s, n) => s + (HABITACIONES[n]?.precio || 0) * noches, 0);
  const numDesayunos      = parseInt(document.getElementById('num-desayunos')?.value) || 0;
  const subtotalDesayunos = numDesayunos * PRECIO_DESAYUNO * noches;
  const subtotalBruto     = subtotalHabs + subtotalDesayunos;
  const descuento         = getDescuento(subtotalBruto);
  const total             = subtotalBruto - descuento;

  setTotalDisplay(noches, habs.length, subtotalHabs, subtotalDesayunos, descuento, total);
  window._calculoActual = { noches, total, subtotalHabs, subtotalDesayunos, descuento, numDesayunos };
}

function setTotalDisplay(noches, numHabs, subtotalHabs, subtotalDesayunos, descuento, total) {
  const $ = id => document.getElementById(id);
  if ($('line-habs')) $('line-habs').textContent = numHabs > 0
    ? `${numHabs} hab. × ${noches} noche${noches !== 1 ? 's' : ''} = ${formatCLP(subtotalHabs)}`
    : '—';

  if ($('line-desayunos')) {
    const nd = parseInt(document.getElementById('num-desayunos')?.value) || 0;
    $('line-desayunos').style.display = nd > 0 ? 'flex' : 'none';
    if ($('line-desayunos-val')) $('line-desayunos-val').textContent =
      `${nd} × ${noches} noches × ${formatCLP(PRECIO_DESAYUNO)} = ${formatCLP(subtotalDesayunos)}`;
  }
  if ($('line-descuento')) {
    $('line-descuento').style.display = descuento > 0 ? 'flex' : 'none';
    if ($('line-descuento-val')) $('line-descuento-val').textContent =
      descuento > 0 ? `− ${formatCLP(descuento)}` : '';
  }
  if ($('total-amount')) $('total-amount').textContent = formatCLP(total);
  if ($('total-noches')) $('total-noches').textContent = noches > 0
    ? `${noches} noche${noches !== 1 ? 's' : ''}` : '—';
}

function renderSelectedRooms(habs, noches) {
  const container = document.getElementById('selected-rooms-list');
  if (!container) return;
  if (habs.length === 0) {
    container.innerHTML = `<p class="no-selection-hint">👆 Haz clic en una habitación para seleccionarla</p>`;
    return;
  }
  container.innerHTML = habs.map(num => {
    const h   = HABITACIONES[num];
    const sub = noches > 0 ? h.precio * noches : 0;
    return `
      <div class="selected-room-row">
        <div><strong>Hab. ${num}</strong>
          <span class="text-muted"> — ${h.tipo}</span></div>
        <div style="text-align:right;">
          <div>${formatCLP(h.precio)}/noche</div>
          ${noches > 0
            ? `<div class="text-muted" style="font-size:0.8rem;">${formatCLP(sub)} total</div>`
            : ''}
        </div>
        <button type="button" class="btn-remove-sel"
                onclick="toggleRoom('${num}')" title="Quitar">✕</button>
      </div>`;
  }).join('');
}

/* ================================================
   NOMBRE DEL HUÉSPED EN FORM (web: pre-fill SEI)
   ================================================ */
function preFillWebUser(session) {
  const empresaEl = document.getElementById('empresa_ref');
  if (empresaEl) empresaEl.value = session.displayName;
}

/* ================================================
   RUT CHILENO — formato y validación
   ================================================ */
function autoFormatRUT(input) {
  let v = input.value.replace(/[^0-9kK]/g, '').toUpperCase();
  if (v.length === 0) { input.value = ''; return; }
  const dv   = v.slice(-1);
  const body = v.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  input.value = body ? body + '-' + dv : dv;
}

function validarRUT(rut) {
  const limpio = rut.replace(/[^0-9kK]/g, '').toUpperCase();
  if (limpio.length < 2) return false;
  const body = limpio.slice(0, -1);
  const dv   = limpio.slice(-1);
  if (!/^\d+$/.test(body)) return false;
  let suma = 0, mult = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    suma += parseInt(body[i]) * mult;
    mult  = mult === 7 ? 2 : mult + 1;
  }
  const resto = suma % 11;
  const dvEsp = resto === 0 ? '0' : resto === 1 ? 'K' : String(11 - resto);
  return dv === dvEsp;
}

/* ================================================
   VALIDACIÓN Y ENVÍO
   ================================================ */
function validateForm() {
  let valid = true;

  ['checkin', 'checkout'].forEach(id => {
    const el = document.getElementById(id);
    const er = document.getElementById(id + '-error');
    if (!el?.value) { el?.classList.add('error'); er?.classList.add('show'); valid = false; }
    else            { el?.classList.remove('error'); er?.classList.remove('show'); }
  });

  if (document.getElementById('checkin')?.value && document.getElementById('checkout')?.value) {
    if (calcularNoches(
          document.getElementById('checkin').value,
          document.getElementById('checkout').value) <= 0) {
      document.getElementById('checkout').classList.add('error');
      const e = document.getElementById('checkout-error');
      if (e) { e.textContent = 'El check-out debe ser posterior al check-in.'; e.classList.add('show'); }
      valid = false;
    }
  }

  if (habitacionesSeleccionadas.size === 0) {
    showAlert('form-alert', 'error', 'Selecciona al menos una habitación.');
    valid = false;
  }

  /* Datos del huésped: ninguno es obligatorio.
     Solo validamos formato si se ingresó algo. */

  /* RUT: solo valida si se escribió algo */
  const rutEl = document.getElementById('huesped_rut');
  const rutEr = document.getElementById('huesped_rut-error');
  if (rutEl && rutEl.value.trim()) {
    if (!validarRUT(rutEl.value)) {
      rutEl.classList.add('error');
      if (rutEr) { rutEr.textContent = 'RUT inválido. Verifica el dígito verificador.'; rutEr.classList.add('show'); }
      valid = false;
    } else {
      rutEl.classList.remove('error');
      rutEr?.classList.remove('show');
    }
  }

  /* Email: solo valida formato si se escribió algo */
  const email = document.getElementById('huesped_email');
  if (email?.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    email.classList.add('error');
    const e = document.getElementById('huesped_email-error');
    if (e) { e.textContent = 'Email inválido.'; e.classList.add('show'); }
    valid = false;
  } else {
    email?.classList.remove('error');
  }
  return valid;
}

function submitReserva(e) {
  e.preventDefault();
  clearAlert('form-alert');
  if (!validateForm()) return;

  const session  = AUTH.getSession();
  const checkin  = document.getElementById('checkin').value;
  const checkout = document.getElementById('checkout').value;
  const noches   = calcularNoches(checkin, checkout);
  const habs     = Array.from(habitacionesSeleccionadas);
  const numPersonas       = parseInt(document.getElementById('num-personas')?.value) || 1;
  const numDesayunos      = parseInt(document.getElementById('num-desayunos')?.value) || 0;
  const subtotalHabs      = habs.reduce((s, n) => s + HABITACIONES[n].precio * noches, 0);
  const subtotalDesayunos = numDesayunos * PRECIO_DESAYUNO * noches;
  const subtotalBruto     = subtotalHabs + subtotalDesayunos;
  const descuento         = getDescuento(subtotalBruto);
  const total             = subtotalBruto - descuento;

  /* Origen según rol */
  const origenMap = { owner: 'Teléfono-David', staff: 'Teléfono-Nelson', web: 'Web' };
  const origen = origenMap[session.role] || 'Web';

  const reserva = {
    origen,
    registrado_por:   session.shortName,
    cliente:          session.displayName,
    cliente_id:       window._clienteIdSeleccionado || '',
    huesped_nombre:   document.getElementById('huesped_nombre')?.value.trim()   || '',
    huesped_rut:      document.getElementById('huesped_rut')?.value.trim()      || '',
    huesped_email:    document.getElementById('huesped_email')?.value.trim()    || '',
    huesped_telefono: document.getElementById('huesped_telefono')?.value.trim() || '',
    huesped_empresa:  document.getElementById('empresa_ref')?.value.trim()      || '',
    checkin, checkout, noches,
    num_personas: numPersonas,
    habitaciones: habs.map(num => ({
      numero: num, tipo: HABITACIONES[num].tipo, precio: HABITACIONES[num].precio
    })),
    desayunos: { cantidad: numDesayunos, precio_unit: PRECIO_DESAYUNO, subtotal: subtotalDesayunos },
    descuento: {
      tipo:   document.getElementById('descuento-tipo')?.value || 'porcentaje',
      valor:  parseFloat(document.getElementById('descuento-valor')?.value) || 0,
      monto:  descuento,
      motivo: document.getElementById('descuento-motivo')?.value.trim() || ''
    },
    subtotal_habs: subtotalHabs,
    subtotal_desayunos: subtotalDesayunos,
    subtotal_bruto: subtotalBruto,
    descuento_monto: descuento,
    total,
    comentarios: document.getElementById('comentarios')?.value.trim() || ''
  };

  const btn = document.getElementById('btn-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Enviando...';

  setTimeout(() => {
    const id = RESERVAS.save(reserva);
    showSuccessModal(id, reserva);
    btn.disabled = false;
    btn.innerHTML = '✅ Reserva Enviada';
  }, 800);
}

function showSuccessModal(id, reserva) {
  document.getElementById('modal-id').textContent       = id;
  document.getElementById('modal-huesped').textContent  = reserva.huesped_nombre;
  const mrut = document.getElementById('modal-rut');
  if (mrut) mrut.textContent = reserva.huesped_rut || '—';
  document.getElementById('modal-checkin').textContent  = formatDate(reserva.checkin);
  document.getElementById('modal-checkout').textContent = formatDate(reserva.checkout);
  document.getElementById('modal-habs').textContent     = reserva.habitaciones.map(h => `Hab.${h.numero}`).join(', ');
  const mpEl = document.getElementById('modal-personas');
  if (mpEl) mpEl.textContent = (reserva.num_personas || 1) + ' persona' + ((reserva.num_personas || 1) !== 1 ? 's' : '');
  document.getElementById('modal-desayunos').textContent= reserva.desayunos.cantidad > 0
    ? `${reserva.desayunos.cantidad} por día` : 'Sin desayunos';

  const elDesc = document.getElementById('modal-descuento');
  if (elDesc) elDesc.textContent = reserva.descuento_monto > 0
    ? `− ${formatCLP(reserva.descuento_monto)}` : 'Sin descuento';

  document.getElementById('modal-total').textContent    = formatCLP(reserva.total);
  document.getElementById('success-modal').classList.add('show');
}

function closeModal() {
  document.getElementById('success-modal').classList.remove('show');
  document.getElementById('reserva-form').reset();
  habitacionesSeleccionadas.clear();
  renderRoomGrid();
  updateTotal();
  document.getElementById('btn-submit').innerHTML = '📨 Enviar Reserva';
}

/* ================================================
   RESERVAS — CRUD localStorage + Google Sheets
   ================================================ */
const RESERVAS = (() => {
  const KEY = 'hdq_reservas';
  function getAll() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
  }
  function save(reserva) {
    const all = getAll();
    const id  = 'HDQ-' + Date.now().toString(36).toUpperCase();
    const nueva = { id, ...reserva, estado: 'pendiente', fecha_reserva: new Date().toISOString() };

    // 1. Guardar en localStorage (inmediato, local)
    all.push(nueva);
    localStorage.setItem(KEY, JSON.stringify(all));

    // 2. Enviar a Google Sheets en segundo plano (compartido)
    if (typeof SHEETS !== 'undefined') {
      SHEETS.save(nueva).catch(e => console.warn('[Sheets] save error:', e));
    }

    return id;
  }
  function updateEstado(id, estado) {
    const all = getAll(), i = all.findIndex(r => r.id === id);
    if (i < 0) return false;
    all[i].estado = estado;
    localStorage.setItem(KEY, JSON.stringify(all));
    return true;
  }
  function remove(id) {
    localStorage.setItem(KEY, JSON.stringify(getAll().filter(r => r.id !== id)));
  }
  function getStats(filtro) {
    const all = filtro ? getAll().filter(filtro) : getAll();
    return {
      total:      all.length,
      pendientes: all.filter(r => r.estado === 'pendiente').length,
      confirmadas:all.filter(r => r.estado === 'confirmada').length,
      canceladas: all.filter(r => r.estado === 'cancelada').length,
      ingresos:   all.filter(r => r.estado !== 'cancelada').reduce((s, r) => s + (r.total || 0), 0),
      noches:     all.filter(r => r.estado !== 'cancelada').reduce((s, r) => s + (r.noches || 0), 0)
    };
  }
  function update(id, newData) {
    const all = getAll();
    const i   = all.findIndex(r => r.id === id);
    if (i < 0) return false;
    /* Preserva id, estado y fecha original */
    all[i] = { ...all[i], ...newData, id, estado: all[i].estado, fecha_reserva: all[i].fecha_reserva };
    localStorage.setItem(KEY, JSON.stringify(all));
    /* Reenvía a Sheets (crea nueva fila actualizada) */
    if (typeof SHEETS !== 'undefined') {
      SHEETS.save({ ...all[i], _editado: true }).catch(() => {});
    }
    return true;
  }
  return { getAll, save, update, updateEstado, remove, getStats };
})();

/* ================================================
   TABLA DE RESERVAS — reutilizable
   cols: qué columnas mostrar según rol
   ================================================ */
function renderReservasTable(containerId, reservas, opts = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!reservas || reservas.length === 0) {
    container.innerHTML = `
      <div class="no-data">
        <div style="font-size:2.5rem;margin-bottom:10px">📋</div>
        <p>No hay reservas registradas aún.</p>
      </div>`;
    return;
  }

  const showOrigen  = opts.showOrigen  !== false;
  const showActions = opts.showActions === true;
  const showTotal   = opts.showTotal   !== false;  /* false → oculta montos (staff) */

  const rows = reservas.map(r => {
    const habs = Array.isArray(r.habitaciones)
      ? r.habitaciones.map(h => `<span style="font-size:0.8rem;background:#f0f4f8;
          padding:1px 5px;border-radius:4px;margin:1px;display:inline-block;">
          Hab.${h.numero}</span>`).join(' ')
      : '—';

    const accionesHtml = showActions
      ? `<td>
          <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;">
            ${r.estado === 'pendiente'
              ? `<button class="btn btn-sm"
                   style="background:var(--success);color:#fff;padding:4px 8px;"
                   onclick="cambiarEstado('${r.id}','confirmada')">✅</button>
                 <button class="btn btn-sm btn-danger" style="padding:4px 8px;"
                   onclick="cambiarEstado('${r.id}','cancelada')">❌</button>`
              : r.estado === 'confirmada'
              ? `<button class="btn btn-sm btn-danger" style="padding:4px 8px;font-size:0.78rem;"
                   onclick="cambiarEstado('${r.id}','cancelada')">Cancelar</button>`
              : `<button class="btn btn-sm btn-outline"
                   style="padding:4px 8px;font-size:0.78rem;"
                   onclick="cambiarEstado('${r.id}','pendiente')">Reactivar</button>`}
          </div>
        </td>` : '';

    return `
      <tr>
        <td><strong style="font-size:0.85rem;">${r.id}</strong></td>
        ${showOrigen ? `<td>${badgeOrigen(r.origen || 'Web')}</td>` : ''}
        <td>${r.huesped_nombre}<br>
          <small style="color:var(--text-muted);">${r.huesped_rut || ''}</small><br>
          <small style="color:var(--text-muted);">${r.huesped_email}</small></td>
        <td>${formatDate(r.checkin)}</td>
        <td>${formatDate(r.checkout)}</td>
        <td style="text-align:center;">${r.noches}</td>
        <td>${habs}</td>
        ${showTotal ? `<td><strong>${formatCLP(r.total)}</strong></td>` : ''}
        <td><span class="badge badge-${
          r.estado === 'pendiente' ? 'pending' :
          r.estado === 'confirmada' ? 'confirmed' : 'cancelled'}">
          ${r.estado}</span></td>
        ${accionesHtml}
      </tr>`;
  }).join('');

  const thOrigen  = showOrigen  ? '<th>Origen</th>' : '';
  const thTotal   = showTotal   ? '<th>Total</th>'  : '';
  const thAccion  = showActions ? '<th>Acciones</th>' : '';

  container.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>ID</th>${thOrigen}<th>Huésped</th>
            <th>Check-in</th><th>Check-out</th>
            <th>Noches</th><th>Hab.</th>${thTotal}<th>Estado</th>${thAccion}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* ================================================
   CLIENTES — CRUD localStorage + Google Sheets
   Sin campos obligatorios: puede crearse solo con nombre/empresa
   ================================================ */
const CLIENTES = (() => {
  const KEY = 'hdq_clientes';

  function getAll() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
  }

  function save(cliente) {
    const all  = getAll();
    const id   = 'CLI-' + Date.now().toString(36).toUpperCase();
    const nuevo = {
      id,
      nombre:    cliente.nombre    || '',
      empresa:   cliente.empresa   || '',
      rut:       cliente.rut       || '',
      email:     cliente.email     || '',
      telefono:  cliente.telefono  || '',
      notas:     cliente.notas     || '',
      fecha_registro: new Date().toISOString()
    };
    all.push(nuevo);
    localStorage.setItem(KEY, JSON.stringify(all));
    if (typeof SHEETS !== 'undefined') {
      SHEETS.saveCliente(nuevo).catch(() => {});
    }
    return id;
  }

  function update(id, data) {
    const all = getAll();
    const idx = all.findIndex(c => c.id === id);
    if (idx < 0) return false;
    all[idx] = {
      ...all[idx], ...data,
      id,
      fecha_registro:    all[idx].fecha_registro,
      fecha_actualizado: new Date().toISOString()
    };
    localStorage.setItem(KEY, JSON.stringify(all));
    if (typeof SHEETS !== 'undefined') {
      SHEETS.saveCliente(all[idx]).catch(() => {});
    }
    /* Actualiza huesped_* en todas las reservas vinculadas */
    _propagarCambiosCliente(id, all[idx]);
    return true;
  }

  function _propagarCambiosCliente(clienteId, c) {
    const reservas = RESERVAS.getAll();
    let changed = false;
    reservas.forEach(r => {
      if (r.cliente_id !== clienteId) return;
      if (c.nombre)   { r.huesped_nombre   = c.nombre;   changed = true; }
      if (c.rut)      { r.huesped_rut      = c.rut;      changed = true; }
      if (c.email)    { r.huesped_email    = c.email;    changed = true; }
      if (c.telefono) { r.huesped_telefono = c.telefono; changed = true; }
    });
    if (changed) localStorage.setItem('hdq_reservas', JSON.stringify(reservas));
  }

  function remove(id) {
    localStorage.setItem(KEY, JSON.stringify(getAll().filter(c => c.id !== id)));
  }

  /* Buscar por nombre, empresa, RUT o email — devuelve array */
  function buscar(query) {
    if (!query || query.trim().length < 1) return [];
    const q = query.toLowerCase().trim();
    return getAll().filter(c =>
      (c.nombre  || '').toLowerCase().includes(q) ||
      (c.empresa || '').toLowerCase().includes(q) ||
      (c.rut     || '').toLowerCase().includes(q) ||
      (c.email   || '').toLowerCase().includes(q)
    );
  }

  function getById(id) {
    return getAll().find(c => c.id === id) || null;
  }

  return { getAll, save, update, remove, buscar, getById };
})();

/* ================================================
   SIDEBAR NAV — función centralizada
   Genera el nav HTML según rol y página activa
   ================================================ */
function buildSidebarNav(role, paginaActiva) {
  const menuBase = `
    <div class="nav-section">Menú</div>
    <a href="dashboard.html"  class="nav-item${paginaActiva==='dashboard'  ?' active':''}" data-page="dashboard">
      <span class="nav-icon">📊</span> Dashboard</a>
    <a href="clientes.html"   class="nav-item${paginaActiva==='clientes'   ?' active':''}" data-page="clientes">
      <span class="nav-icon">👤</span> Clientes</a>
    <a href="reservar.html"   class="nav-item${paginaActiva==='reservar'   ?' active':''}" data-page="reservar">
      <span class="nav-icon">📅</span> Nueva Reserva</a>
    <a href="calendario.html" class="nav-item${paginaActiva==='calendario' ?' active':''}" data-page="calendario">
      <span class="nav-icon">🗓️</span> Calendario</a>`;

  const menuAdmin = (role === 'owner')
    ? `<div class="nav-section" style="margin-top:12px;">Administración</div>
       <a href="admin.html" class="nav-item${paginaActiva==='admin'?' active':''}" data-page="admin">
         <span class="nav-icon">🔧</span> Panel Admin</a>`
    : '';

  const menuWeb = `
    <div class="nav-section">Menú</div>
    <a href="dashboard.html"  class="nav-item${paginaActiva==='dashboard'  ?' active':''}" data-page="dashboard">
      <span class="nav-icon">📊</span> Mis Reservas</a>
    <a href="reservar.html"   class="nav-item${paginaActiva==='reservar'   ?' active':''}" data-page="reservar">
      <span class="nav-icon">📅</span> Nueva Reserva</a>
    <a href="calendario.html" class="nav-item${paginaActiva==='calendario' ?' active':''}" data-page="calendario">
      <span class="nav-icon">🗓️</span> Calendario</a>
    <div class="nav-section" style="margin-top:12px;">Información</div>
    <a href="#info-hostal" class="nav-item"><span class="nav-icon">ℹ️</span> Info Hostal</a>`;

  return role === 'web' ? menuWeb : menuBase + menuAdmin;
}
