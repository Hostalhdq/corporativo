/* ================================================
   HOSTAL HDQ — app.js (versión móvil)
   SPA con rutas por hash. Reutiliza la capa de datos
   del sistema de escritorio: AUTH (auth.js), SHEETS
   (sheets.js), HABITACIONES / RESERVAS / CLIENTES
   (reservas.js). Todo queda envuelto en una IIFE para
   no chocar con los globales de esos archivos.
   ================================================ */

(() => {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ================================================
     ESTADO
     ================================================ */
  const state = {
    session:   null,
    reservas:  [],
    fuente:    'local',
    cargadoEn: 0,
    cargando:  null,
    filtro:    'proximas',
    busqueda:  '',
    calDia:    null,
    cliBusqueda: ''
  };

  const DIAS   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const DIAS_L = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const MESES  = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto',
                  'septiembre','octubre','noviembre','diciembre'];
  const PISOS  = [
    { label: 'Primer piso',  nums: ['101','102','103'] },
    { label: 'Segundo piso', nums: ['201','202','203','204','205','206','207'] }
  ];

  /* ================================================
     UTILIDADES
     ================================================ */
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
      ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  /* 'YYYY-MM-DD' en hora local (evita desfase UTC en Chile) */
  function ymd(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  function parseYmd(s) { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d, 12); }
  function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  function hoy() { return ymd(new Date()); }
  function d10(s) { return String(s || '').slice(0, 10); }

  function fechaCorta(s) {
    if (!s) return '—';
    const d = parseYmd(s);
    return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()].slice(0,3)}`;
  }
  function fechaLarga(s) {
    const d = parseYmd(s);
    return `${DIAS_L[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
  }
  function lunesDe(s) {
    const d = parseYmd(s);
    const dia = d.getDay();
    d.setDate(d.getDate() + (dia === 0 ? -6 : 1 - dia));
    return ymd(d);
  }

  function role()      { return state.session?.role; }
  function isInternal(){ return role() === 'owner' || role() === 'staff'; }
  function verMontos() { return role() !== 'staff'; }   /* Nelson no ve montos (igual que escritorio) */

  function habsTexto(r) { return (r.habitaciones || []).map(h => h.numero).join(', ') || '—'; }
  function nombreRes(r) { return r.huesped_nombre || r.cliente || 'Sin nombre'; }

  function badgeEstado(e) {
    const m = { pendiente: ['b-pend','Pendiente'], confirmada: ['b-conf','Confirmada'], cancelada: ['b-canc','Cancelada'] };
    const [c, l] = m[e] || m.pendiente;
    return `<span class="badge ${c}">${l}</span>`;
  }
  function badgeOrigenM(o) {
    const m = {
      'Teléfono':        ['', '📞 Teléfono'],
      'Teléfono-David':  ['', '📞 David'],
      'Teléfono-Nelson': ['nelson', '📞 Nelson'],
      'Web':             ['web', '🌐 Web'],
      'Online':          ['web', '🌐 Online'],
      'Booking':         ['booking', '🅱️ Booking']
    };
    const [c, l] = m[o] || m['Teléfono'];
    return `<span class="badge b-org ${c}">${l}</span>`;
  }

  function telLimpio(t) {
    let n = String(t || '').replace(/[^\d+]/g, '');
    if (!n) return '';
    if (!n.startsWith('+')) {
      if (n.startsWith('56')) n = '+' + n;
      else if (n.length === 9 && n.startsWith('9')) n = '+56' + n;
    }
    return n;
  }

  let _toastT;
  function toast(msg, ms = 2600) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(_toastT);
    _toastT = setTimeout(() => { el.hidden = true; }, ms);
  }

  function vibrar() { try { navigator.vibrate?.(12); } catch {} }

  /* ================================================
     DATOS
     ================================================ */

  /* Carga reservas desde Sheets (o localStorage si falla).
     Agrega reservas locales recién creadas que Sheets aún no devuelve:
     el guardado en Sheets es "fire & forget" y puede tardar unos segundos. */
  async function cargarReservas(forzar = false) {
    if (!forzar && state.cargadoEn && Date.now() - state.cargadoEn < 30000) return state.reservas;
    if (state.cargando) return state.cargando;

    $('#btn-refresh')?.classList.add('spin');
    state.cargando = (async () => {
      const { fuente, reservas } = await cargarReservasCloud();
      let lista = Array.isArray(reservas) ? reservas.slice() : [];
      if (fuente === 'sheets') {
        const ids = new Set(lista.map(r => r.id));
        const limite = Date.now() - 10 * 60 * 1000;
        RESERVAS.getAll().forEach(r => {
          if (!ids.has(r.id) && r.fecha_reserva && new Date(r.fecha_reserva).getTime() > limite) lista.push(r);
        });
      }
      lista.forEach(r => { r.checkin = d10(r.checkin); r.checkout = d10(r.checkout); });
      state.reservas  = lista;
      state.fuente    = fuente;
      state.cargadoEn = Date.now();
      $('#offline-banner').hidden = fuente === 'sheets' || !SHEETS.isConfigured();
      return lista;
    })();

    try { return await state.cargando; }
    finally {
      state.cargando = null;
      $('#btn-refresh')?.classList.remove('spin');
    }
  }

  /* Reservas visibles según rol (igual que el dashboard de escritorio) */
  function reservasDelRol() {
    const todas = state.reservas;
    if (role() === 'owner') return todas;
    if (role() === 'staff') return todas.filter(r => ['Teléfono-Nelson','Teléfono-David','Teléfono','Booking'].includes(r.origen));
    return todas.filter(r => r.origen === 'Web' || !r.origen);
  }

  function activas() { return state.reservas.filter(r => r.estado !== 'cancelada'); }

  /* Map numHab → reserva que ocupa esa habitación en la noche `dia` */
  function ocupacionNoche(dia, lista = activas()) {
    const map = new Map();
    lista.forEach(r => {
      if (r.checkin <= dia && r.checkout > dia) {
        (r.habitaciones || []).forEach(h => map.set(String(h.numero), r));
      }
    });
    return map;
  }

  async function cambiarEstado(id, estado) {
    const verbo = { confirmada: 'Confirmar', cancelada: 'Cancelar', pendiente: 'Reactivar' }[estado] || estado;
    if (!confirm(`¿${verbo} la reserva ${id}?`)) return false;
    vibrar();
    RESERVAS.updateEstado(id, estado);
    const r = state.reservas.find(x => x.id === id);
    if (r) r.estado = estado;
    await SHEETS.updateEstado(id, estado);
    toast({ confirmada: '✅ Reserva confirmada', cancelada: '❌ Reserva cancelada', pendiente: '↩️ Reserva reactivada' }[estado] || 'Listo');
    return true;
  }

  /* ================================================
     HOJA INFERIOR (bottom sheet)
     ================================================ */
  /* La hoja agrega "~sheet" al hash para que el botón Atrás de Android la cierre.
     Al cerrarla por código se hace history.back() y lo que venga después (`luego`)
     se ejecuta recién cuando ese retroceso terminó, para no pisar la navegación. */
  let _sheetOnClose = null;
  let _trasRetroceso = null;
  let _hashHoja = '';
  function abrirSheet(html, onClose) {
    _hashHoja = location.hash.replace('~sheet', '');
    $('#sheet-body').innerHTML = html;
    $('#sheet').hidden = false;
    $('#sheet-backdrop').hidden = false;
    $('#sheet-body').scrollTop = 0;
    document.body.style.overflow = 'hidden';
    _sheetOnClose = onClose || null;
    if (location.hash.indexOf('~sheet') < 0) history.pushState({ sheet: true }, '', location.hash + '~sheet');
  }
  function cerrarSheet(desdeHistorial = false, luego = null) {
    if ($('#sheet').hidden) { luego?.(); return; }
    $('#sheet').hidden = true;
    $('#sheet-backdrop').hidden = true;
    document.body.style.overflow = '';
    const cb = _sheetOnClose; _sheetOnClose = null;
    const despues = () => { cb?.(); luego?.(); };
    if (!desdeHistorial && location.hash.indexOf('~sheet') >= 0) {
      _trasRetroceso = despues;
      history.back();
    } else {
      despues();
    }
  }

  /* Deslizar hacia abajo para cerrar */
  (() => {
    let y0 = null, dy = 0;
    const sheet = $('#sheet');
    sheet.addEventListener('touchstart', e => {
      if ($('#sheet-body').scrollTop > 0 && !e.target.closest('.sheet-handle')) { y0 = null; return; }
      y0 = e.touches[0].clientY; dy = 0;
    }, { passive: true });
    sheet.addEventListener('touchmove', e => {
      if (y0 === null) return;
      dy = e.touches[0].clientY - y0;
      if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    sheet.addEventListener('touchend', () => {
      sheet.style.transform = '';
      if (y0 !== null && dy > 110) cerrarSheet();
      y0 = null;
    });
    $('#sheet-backdrop').addEventListener('click', () => cerrarSheet());
  })();

  /* ================================================
     DETALLE DE RESERVA
     ================================================ */
  function abrirReserva(id) {
    const r = state.reservas.find(x => x.id === id);
    if (!r) return toast('No se encontró la reserva');

    /* Cliente web solo ve el detalle de sus propias reservas */
    const propia = isInternal() || r.origen === 'Web' || !r.origen;
    if (!propia) return toast('Habitación ocupada');

    const tel   = telLimpio(r.huesped_telefono);
    const wa    = tel.replace('+', '');
    const mail  = r.huesped_email;
    const contacto = isInternal() && (tel || mail) ? `
      <div class="contact-row">
        ${tel  ? `<a class="btn btn-ghost" href="tel:${esc(tel)}"><b>📞</b>Llamar</a>` : ''}
        ${tel  ? `<a class="btn btn-ghost" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener"><b>💬</b>WhatsApp</a>` : ''}
        ${mail ? `<a class="btn btn-ghost" href="mailto:${esc(mail)}"><b>✉️</b>Email</a>` : ''}
      </div>` : '';

    const des = r.desayunos?.cantidad || 0;
    const dm  = r.descuento_monto || r.descuento?.monto || 0;

    const acciones = isInternal() ? `
      <div class="btn-row">
        ${r.estado === 'pendiente'  ? `<button class="btn btn-success" data-estado="confirmada">✅ Confirmar</button>` : ''}
        ${r.estado !== 'cancelada' ? `<button class="btn btn-danger"  data-estado="cancelada">Cancelar</button>` : ''}
        ${r.estado === 'cancelada' ? `<button class="btn btn-ghost"   data-estado="pendiente">↩️ Reactivar</button>` : ''}
      </div>` : '';

    abrirSheet(`
      <div class="res-head">
        <div style="min-width:0;">
          <h3>${esc(nombreRes(r))}</h3>
          <div class="muted small">${esc(r.id)} · ${badgeEstado(r.estado)}</div>
        </div>
        ${isInternal() ? `<button class="btn btn-primary btn-mod" id="det-modificar">✏️ Modificar</button>` : ''}
      </div>
      ${contacto}
      <div class="card" style="box-shadow:none;background:var(--bg);">
        <dl class="dl">
          <dt>Check-in</dt><dd>${fechaCorta(r.checkin)}</dd>
          <dt>Check-out</dt><dd>${fechaCorta(r.checkout)}</dd>
          <dt>Noches</dt><dd>${r.noches || 0}</dd>
          <dt>Habitaciones</dt><dd>${(r.habitaciones||[]).map(h => `Hab. ${esc(h.numero)} <span class="muted">${esc(h.tipo||'')}</span>`).join('<br>') || '—'}</dd>
          <dt>Personas</dt><dd>${r.num_personas || '—'}</dd>
          <dt>Desayunos</dt><dd>${des > 0 ? des + ' por día' : 'No'}</dd>
          ${isInternal() ? `<dt>Origen</dt><dd>${badgeOrigenM(r.origen || 'Web')}</dd>` : ''}
          ${r.huesped_rut      ? `<dt>RUT</dt><dd>${esc(r.huesped_rut)}</dd>` : ''}
          ${r.huesped_telefono ? `<dt>Teléfono</dt><dd>${esc(r.huesped_telefono)}</dd>` : ''}
          ${r.huesped_email    ? `<dt>Email</dt><dd>${esc(r.huesped_email)}</dd>` : ''}
          ${r.huesped_empresa  ? `<dt>Empresa</dt><dd>${esc(r.huesped_empresa)}</dd>` : ''}
          ${verMontos() && dm > 0 ? `<dt>Descuento</dt><dd>− ${formatCLP(dm)}</dd>` : ''}
          ${verMontos() ? `<dt>Total</dt><dd style="font-size:17px;">${formatCLP(r.total)}</dd>` : ''}
          ${r.comentarios ? `<dt>Notas</dt><dd style="font-weight:500;">${esc(r.comentarios)}</dd>` : ''}
        </dl>
      </div>
      ${acciones}
      <button class="btn btn-outline btn-block" data-close>Cerrar</button>
    `);

    $$('#sheet-body [data-estado]').forEach(b => b.onclick = async () => {
      if (await cambiarEstado(r.id, b.dataset.estado)) cerrarSheet(false, render);
    });
    $('#sheet-body [data-close]').onclick = () => cerrarSheet();
    const mod = $('#det-modificar');
    if (mod) mod.onclick = () => abrirModificar(r.id);
  }

  /* ================================================
     MODIFICAR RESERVA (sumar/quitar noches, datos, eliminar)
     ================================================ */

  /* Recalcula montos con una nueva cantidad de noches, respetando
     precios, desayunos y descuento que ya tenía la reserva */
  function recalcularReserva(r, noches) {
    const habs  = r.habitaciones || [];
    const subtotalHabs = habs.reduce((s, h) =>
      s + (Number(h.precio) || HABITACIONES[h.numero]?.precio || 0) * noches, 0);
    const cant  = r.desayunos?.cantidad || 0;
    const pUnit = r.desayunos?.precio_unit || PRECIO_DESAYUNO;
    const subtotalDes = cant * pUnit * noches;
    const bruto = subtotalHabs + subtotalDes;
    const d = r.descuento || {};
    let desc = 0;
    if (d.tipo === 'porcentaje' && d.valor > 0)  desc = Math.round(bruto * Math.min(d.valor, 100) / 100);
    else if (d.tipo === 'monto' && d.valor > 0)  desc = Math.min(d.valor, bruto);
    else if ((r.descuento_monto || 0) > 0)       desc = Math.min(r.descuento_monto, bruto);
    return {
      noches,
      desayunos: { ...(r.desayunos || {}), cantidad: cant, precio_unit: pUnit, subtotal: subtotalDes },
      descuento: { ...d, monto: desc },
      subtotal_habs: subtotalHabs,
      subtotal_desayunos: subtotalDes,
      subtotal_bruto: bruto,
      descuento_monto: desc,
      total: bruto - desc
    };
  }

  /* Guarda cambios de una reserva existente (local + Sheets), igual que
     guardarEdicion() de escritorio: si vino solo de Sheets se inserta
     primero en localStorage para que RESERVAS.update la encuentre. */
  function guardarReservaEditada(id, orig, cambios) {
    if (!RESERVAS.getAll().some(x => x.id === id) && orig) {
      const todas = RESERVAS.getAll();
      todas.push({ ...orig, id });
      localStorage.setItem('hdq_reservas', JSON.stringify(todas));
    }
    RESERVAS.update(id, cambios);
    const r = state.reservas.find(x => x.id === id);
    if (r) Object.assign(r, cambios);
  }

  /* Primera fecha en que otra reserva ocupa alguna de estas habitaciones
     después del check-out actual: límite para extender la estadía */
  function limiteExtension(r) {
    const nums = new Set((r.habitaciones || []).map(h => String(h.numero)));
    let lim = null;
    activas().forEach(o => {
      if (o.id === r.id || o.checkin < r.checkout) return;
      const choca = (o.habitaciones || []).find(h => nums.has(String(h.numero)));
      if (choca && (!lim || o.checkin < lim.fecha)) lim = { fecha: o.checkin, hab: choca.numero, quien: nombreRes(o) };
    });
    return lim;
  }

  async function eliminarReserva(r) {
    if (!confirm(`¿Eliminar DEFINITIVAMENTE la reserva de ${nombreRes(r)} (${r.id})?\n\nLa habitación queda libre y esto no se puede deshacer.`)) return false;
    vibrar();
    RESERVAS.remove(r.id);
    state.reservas = state.reservas.filter(x => x.id !== r.id);
    /* Primero se cancela (libera la fecha aunque Code.gs aún no tenga
       la acción de borrar) y luego se borra la fila de la planilla. */
    await SHEETS.updateEstado(r.id, 'cancelada');
    await SHEETS.deleteReserva(r.id);
    toast('🗑️ Reserva eliminada');
    return true;
  }

  function abrirModificar(id) {
    const r = state.reservas.find(x => x.id === id);
    if (!r || !isInternal()) return;
    const M = {
      noches: calcularNoches(r.checkin, r.checkout) || 1,
      nombre: r.huesped_nombre || '', tel: r.huesped_telefono || '',
      email: r.huesped_email || '', rut: r.huesped_rut || '',
      comentarios: r.comentarios || ''
    };
    const lim = limiteExtension(r);
    const maxNoches = lim ? calcularNoches(r.checkin, lim.fecha) : 60;

    abrirSheet(`
      <div class="res-head">
        <div style="min-width:0;">
          <h3>Modificar reserva</h3>
          <div class="muted small">${esc(nombreRes(r))} · ${esc(r.id)}</div>
        </div>
        <button class="btn btn-outline" id="mod-volver" style="min-height:40px;">‹ Volver</button>
      </div>
      <div id="mod-alert"></div>

      <div class="card" style="display:flex;flex-direction:column;gap:12px;">
        <b>🌙 Noches</b>
        <div class="stepper">
          <button type="button" id="mod-menos" aria-label="Quitar un día">−</button>
          <output id="mod-noches"></output>
          <button type="button" id="mod-mas" aria-label="Sumar un día">+</button>
        </div>
        <div class="chips" style="margin:0;padding:0;">
          <button type="button" class="chip" data-sumar="1">+1 día</button>
          <button type="button" class="chip" data-sumar="2">+2 días</button>
          <button type="button" class="chip" data-sumar="7">+1 semana</button>
        </div>
        <div class="summary-line"><span>Check-in</span><b>${fechaCorta(r.checkin)}</b></div>
        <div class="summary-line"><span>Check-out</span><b id="mod-co"></b></div>
        <div class="small muted" id="mod-hint"></div>
        ${verMontos() ? `<div class="summary-line total"><span>Nuevo total</span><span id="mod-total"></span></div>
          <div class="small muted" style="text-align:right;margin-top:-6px;">Antes: ${formatCLP(r.total)}</div>` : ''}
      </div>

      <div class="card" style="display:flex;flex-direction:column;gap:12px;">
        <b>📝 Datos del huésped</b>
        <label class="field"><span>Nombre</span><input id="mod-nombre" value="${esc(M.nombre)}" autocapitalize="words" /></label>
        <div class="grid-2">
          <label class="field"><span>Teléfono</span><input id="mod-tel" type="tel" inputmode="tel" value="${esc(M.tel)}" /></label>
          <label class="field"><span>RUT</span><input id="mod-rut" value="${esc(M.rut)}" autocapitalize="characters" /></label>
        </div>
        <label class="field"><span>Email</span><input id="mod-email" type="email" inputmode="email" autocapitalize="none" value="${esc(M.email)}" /></label>
        <label class="field"><span>Comentarios</span><textarea id="mod-com" placeholder="Hora de llegada, patente, solicitudes…">${esc(M.comentarios)}</textarea></label>
      </div>

      <button class="btn btn-primary btn-block btn-lg" id="mod-guardar">💾 Guardar cambios</button>
      <button class="btn btn-outline btn-block" id="mod-completa">Cambiar habitaciones, desayunos o descuento</button>
      <button class="btn btn-danger btn-block" id="mod-eliminar">🗑️ Eliminar reserva</button>
    `);

    const pintar = () => {
      const co = addDays(r.checkin, M.noches);
      $('#mod-noches').textContent = `${M.noches} noche${M.noches === 1 ? '' : 's'}`;
      $('#mod-co').textContent = fechaCorta(co);
      $('#mod-menos').disabled = M.noches <= 1;
      $('#mod-mas').disabled = M.noches >= maxNoches;
      $$('[data-sumar]').forEach(b => { b.disabled = M.noches + Number(b.dataset.sumar) > maxNoches; });
      const dif = M.noches - (r.noches || calcularNoches(r.checkin, r.checkout));
      $('#mod-hint').innerHTML = [
        dif > 0 ? `➕ Suma ${dif} día${dif === 1 ? '' : 's'}` : dif < 0 ? `➖ Quita ${-dif} día${dif === -1 ? '' : 's'}` : '',
        lim && M.noches >= maxNoches ? `🔒 Hab. ${esc(lim.hab)} está reservada desde el ${fechaCorta(lim.fecha)} (${esc(lim.quien)})` : ''
      ].filter(Boolean).join('<br>');
      if ($('#mod-total')) $('#mod-total').textContent = formatCLP(recalcularReserva(r, M.noches).total);
    };
    $('#mod-menos').onclick = () => { M.noches = Math.max(1, M.noches - 1); vibrar(); pintar(); };
    $('#mod-mas').onclick   = () => { M.noches = Math.min(maxNoches, M.noches + 1); vibrar(); pintar(); };
    $$('[data-sumar]').forEach(b => b.onclick = () => {
      M.noches = Math.min(maxNoches, M.noches + Number(b.dataset.sumar)); vibrar(); pintar();
    });
    pintar();

    const rut = $('#mod-rut');
    rut.addEventListener('input', () => autoFormatRUT(rut));
    $('#mod-volver').onclick = () => abrirReserva(r.id);

    $('#mod-guardar').onclick = () => {
      const datos = {
        huesped_nombre: $('#mod-nombre').value.trim(), huesped_telefono: $('#mod-tel').value.trim(),
        huesped_email: $('#mod-email').value.trim(), huesped_rut: $('#mod-rut').value.trim(),
        comentarios: $('#mod-com').value.trim()
      };
      const err = m => { $('#mod-alert').innerHTML = `<div class="alert alert-error">${m}</div>`; $('#sheet-body').scrollTop = 0; };
      if (datos.huesped_rut && !validarRUT(datos.huesped_rut)) return err('RUT inválido. Verifica el dígito verificador.');
      if (datos.huesped_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.huesped_email)) return err('Email inválido.');
      const cambios = { ...datos, checkout: addDays(r.checkin, M.noches), ...recalcularReserva(r, M.noches) };
      guardarReservaEditada(r.id, r, cambios);
      vibrar(); toast('💾 Reserva actualizada');
      abrirReserva(r.id);
      render();
    };
    $('#mod-completa').onclick = () => cerrarSheet(false, () => irA('#editar/' + encodeURIComponent(r.id)));
    $('#mod-eliminar').onclick = async () => {
      if (await eliminarReserva(r)) cerrarSheet(false, render);
    };
  }

  /* Tarjeta de reserva reutilizable */
  function tarjetaReserva(r, opts = {}) {
    const acciones = opts.acciones && isInternal() && r.estado === 'pendiente' ? `
      <div class="quick-actions">
        <button class="btn btn-success" data-q="confirmada" data-id="${esc(r.id)}">✅ Confirmar</button>
        <button class="btn btn-danger"  data-q="cancelada"  data-id="${esc(r.id)}">Cancelar</button>
      </div>` : '';
    return `
      <div class="card res-card" data-res="${esc(r.id)}" role="button" tabindex="0">
        <div class="res-head">
          <div style="min-width:0;">
            <div class="res-name">${esc(nombreRes(r))}</div>
            ${isInternal() ? `<div style="margin-top:3px;">${badgeOrigenM(r.origen || 'Web')}</div>` : ''}
          </div>
          ${badgeEstado(r.estado)}
        </div>
        <div class="res-dates">
          📅 <b>${fechaCorta(r.checkin)}</b> → <b>${fechaCorta(r.checkout)}</b>
          <span class="muted">· ${r.noches || 0} noche${r.noches === 1 ? '' : 's'}</span>
        </div>
        <div class="res-foot">
          <div>${(r.habitaciones||[]).map(h => `<span class="chip-hab">Hab. ${esc(h.numero)}</span>`).join('')}</div>
          ${verMontos() ? `<div class="res-total">${formatCLP(r.total)}</div>` : ''}
        </div>
        ${acciones}
      </div>`;
  }

  /* Delegación de clics para tarjetas de reserva dentro de la vista */
  function enlazarTarjetas(root) {
    $$('[data-q]', root).forEach(b => b.onclick = async e => {
      e.stopPropagation();
      if (await cambiarEstado(b.dataset.id, b.dataset.q)) render();
    });
    $$('[data-res]', root).forEach(c => c.onclick = () => abrirReserva(c.dataset.res));
  }

  /* ================================================
     VISTA: HOY
     ================================================ */
  async function vistaHoy(v) {
    setTop('Hoy', fechaLarga(hoy()));
    v.innerHTML = `<div class="loading">Cargando…</div>`;
    await cargarReservas();
    if (role() === 'web') return vistaInicioWeb(v);

    const h   = hoy();
    const man = addDays(h, 1);
    const act = activas();
    const total = Object.keys(HABITACIONES).length;
    const ocup  = ocupacionNoche(h, act);
    const pct   = Math.round(ocup.size / total * 100);

    const llegan    = act.filter(r => r.checkin === h);
    const salen     = act.filter(r => r.checkout === h);
    const llegaMan  = act.filter(r => r.checkin === man);
    const enCasa    = act.filter(r => r.checkin < h && r.checkout > h);
    const pendientes = reservasDelRol().filter(r => r.estado === 'pendiente' && r.checkout >= h)
                                       .sort((a, b) => a.checkin.localeCompare(b.checkin));

    const mes = h.slice(0, 7);
    const ingresosMes = act.filter(r => r.checkin.slice(0, 7) === mes).reduce((s, r) => s + (r.total || 0), 0);

    const fila = (r, cls, etiqueta) => `
      <button class="row" data-res="${esc(r.id)}">
        <div class="room-num ${cls}">${esc(habsTexto(r).split(', ')[0])}</div>
        <div class="row-main">
          <div class="row-title">${esc(nombreRes(r))}</div>
          <div class="row-sub">${(r.habitaciones||[]).length > 1 ? 'Habs. ' + esc(habsTexto(r)) + ' · ' : ''}${etiqueta(r)}</div>
        </div>
        ${r.estado === 'pendiente' ? '<span class="badge b-pend">Pend.</span>' : ''}
        <span class="row-chev">›</span>
      </button>`;

    const bloque = (titulo, lista, cls, etiqueta, vacio) => `
      <div class="section-title">${titulo}<span class="count">${lista.length}</span></div>
      <div class="card-list">
        ${lista.length ? lista.map(r => fila(r, cls, etiqueta)).join('') : `<div class="empty small">${vacio}</div>`}
      </div>`;

    v.innerHTML = `
      <div class="hero">
        <h2>¡Hola, ${esc(state.session.shortName)}!</h2>
        <p>${fechaLarga(h)} · ${ocup.size} de ${total} habitaciones ocupadas</p>
        <div class="occ-bar"><i style="width:${pct}%"></i></div>
        <div class="kpis">
          <div class="kpi"><b>${pct}%</b><span>Ocupación</span></div>
          <div class="kpi"><b>${llegan.length}</b><span>Llegan</span></div>
          <div class="kpi"><b>${salen.length}</b><span>Salen</span></div>
          <div class="kpi"><b>${pendientes.length}</b><span>Pendientes</span></div>
        </div>
        ${role() === 'owner' ? `<div class="money-row"><span>Ingresos ${MESES[parseYmd(h).getMonth()]}</span><b>${formatCLP(ingresosMes)}</b></div>` : ''}
      </div>

      ${bloque('🛬 Llegan hoy', llegan, 'in', r => `${r.noches} noche${r.noches === 1 ? '' : 's'} · hasta ${fechaCorta(r.checkout)}`, 'Nadie llega hoy')}
      ${bloque('🧳 Salen hoy (11:00)', salen, 'out', r => `Llegó ${fechaCorta(r.checkin)}`, 'Nadie sale hoy')}
      ${bloque('🏠 En el hostal', enCasa, '', r => `Sale ${fechaCorta(r.checkout)}`, 'Sin huéspedes que continúan')}
      ${bloque('📆 Llegan mañana', llegaMan, 'pend', r => `${r.noches} noche${r.noches === 1 ? '' : 's'}`, 'Nadie llega mañana')}

      ${pendientes.length ? `
        <div class="section-title">⏳ Por confirmar<span class="count">${pendientes.length}</span></div>
        ${pendientes.slice(0, 10).map(r => tarjetaReserva(r, { acciones: true })).join('')}` : ''}
    `;
    enlazarTarjetas(v);
  }

  /* Inicio para cliente corporativo (rol web) */
  function vistaInicioWeb(v) {
    setTop('Inicio', state.session.displayName);
    const h = hoy();
    const mias = reservasDelRol().filter(r => r.estado !== 'cancelada');
    const proximas = mias.filter(r => r.checkout >= h).sort((a, b) => a.checkin.localeCompare(b.checkin));
    v.innerHTML = `
      <div class="hero">
        <h2>Bienvenido</h2>
        <p>${esc(state.session.displayName)} · Portal corporativo</p>
        <div class="kpis" style="grid-template-columns:repeat(3,1fr);">
          <div class="kpi"><b>${proximas.length}</b><span>Próximas</span></div>
          <div class="kpi"><b>${proximas.filter(r => r.estado === 'pendiente').length}</b><span>Pendientes</span></div>
          <div class="kpi"><b>${proximas.filter(r => r.estado === 'confirmada').length}</b><span>Confirmadas</span></div>
        </div>
      </div>
      <a class="btn btn-primary btn-lg btn-block" href="#nueva">📅 Nueva reserva</a>
      <div class="section-title">Próximas estadías<span class="count">${proximas.length}</span></div>
      ${proximas.length ? proximas.map(r => tarjetaReserva(r)).join('') :
        `<div class="card empty"><div class="big">🛏️</div>No tienes reservas próximas.</div>`}
      ${infoHostalHtml()}
    `;
    enlazarTarjetas(v);
  }

  function infoHostalHtml() {
    return `
      <div class="section-title">Información del hostal</div>
      <div class="card">
        <p><b>📍 Chiloé 1130, Sector Collao</b><br><span class="muted small">Concepción, Región del Biobío</span></p>
        <p style="margin-top:8px;" class="small">⏰ Check-in desde las <b>15:00</b> · Check-out hasta las <b>11:00</b></p>
        <div class="btn-row" style="margin-top:12px;">
          <a class="btn btn-ghost" href="tel:+56987752280">📞 Llamar</a>
          <a class="btn btn-ghost" href="https://wa.me/56987752280" target="_blank" rel="noopener">💬 WhatsApp</a>
        </div>
        <a class="btn btn-outline btn-block" style="margin-top:10px;"
           href="https://www.google.com/maps/search/?api=1&query=Chilo%C3%A9+1130+Concepci%C3%B3n+Chile" target="_blank" rel="noopener">🗺️ Cómo llegar</a>
      </div>
      <div class="section-title">Tarifas por noche</div>
      <div class="card">
        ${Object.entries(HABITACIONES).map(([n, h]) => `
          <div class="rate-row"><span>Hab. ${n} · ${esc(h.tipo)}</span><b>${formatCLP(h.precio)}</b></div>`).join('')}
        <p class="small muted" style="margin-top:8px;">☕ Desayuno opcional: ${formatCLP(PRECIO_DESAYUNO)} por persona/día.</p>
      </div>`;
  }

  /* ================================================
     VISTA: RESERVAS (lista con filtros)
     ================================================ */
  async function vistaReservas(v) {
    setTop(role() === 'web' ? 'Mis reservas' : 'Reservas', '');
    v.innerHTML = `<div class="loading">Cargando…</div>`;
    await cargarReservas();

    const filtros = [
      ['proximas', 'Próximas'], ['pendiente', 'Pendientes'], ['confirmada', 'Confirmadas'],
      ['pasadas', 'Pasadas'], ['cancelada', 'Canceladas'], ['todas', 'Todas']
    ];

    v.innerHTML = `
      <input type="search" class="search" id="res-q" placeholder="Buscar nombre, RUT, habitación, ID…"
             value="${esc(state.busqueda)}" autocomplete="off" />
      <div class="chips" id="res-chips">
        ${filtros.map(([k, l]) => `<button class="chip${state.filtro === k ? ' on' : ''}" data-f="${k}">${l}</button>`).join('')}
      </div>
      <div id="res-list" style="display:flex;flex-direction:column;gap:12px;"></div>
    `;

    const pintar = () => {
      const h = hoy();
      const q = state.busqueda.toLowerCase().trim();
      let lista = reservasDelRol().slice();
      const f = state.filtro;
      if (f === 'proximas')        lista = lista.filter(r => r.estado !== 'cancelada' && r.checkout >= h);
      else if (f === 'pasadas')    lista = lista.filter(r => r.estado !== 'cancelada' && r.checkout < h);
      else if (f === 'pendiente' || f === 'confirmada') lista = lista.filter(r => r.estado === f && r.checkout >= addDays(h, -30));
      else if (f === 'cancelada')  lista = lista.filter(r => r.estado === 'cancelada');

      if (q) lista = lista.filter(r => [
        r.id, r.huesped_nombre, r.huesped_rut, r.huesped_email, r.huesped_telefono, r.cliente, r.huesped_empresa,
        ...(r.habitaciones || []).map(x => String(x.numero))
      ].some(x => String(x || '').toLowerCase().includes(q)));

      const asc = f === 'proximas' || f === 'pendiente' || f === 'confirmada';
      lista.sort((a, b) => asc ? a.checkin.localeCompare(b.checkin) : b.checkin.localeCompare(a.checkin));

      const max = 60;
      $('#res-list').innerHTML = lista.length
        ? `<div class="muted small">${lista.length} reserva${lista.length === 1 ? '' : 's'}</div>` +
          lista.slice(0, max).map(r => tarjetaReserva(r, { acciones: true })).join('') +
          (lista.length > max ? `<div class="muted small" style="text-align:center;">Mostrando ${max} de ${lista.length}. Usa la búsqueda para afinar.</div>` : '')
        : `<div class="card empty"><div class="big">📋</div>No hay reservas en este filtro.</div>`;
      enlazarTarjetas($('#res-list'));
    };

    $('#res-q').addEventListener('input', e => { state.busqueda = e.target.value; pintar(); });
    $$('#res-chips .chip').forEach(c => c.onclick = () => {
      state.filtro = c.dataset.f;
      $$('#res-chips .chip').forEach(x => x.classList.toggle('on', x === c));
      pintar();
    });
    pintar();
  }

  /* ================================================
     VISTA: NUEVA / EDITAR RESERVA (asistente por pasos)
     ================================================ */
  let W = null;   /* estado del asistente */

  function nuevoWizard(pre = {}) {
    const h = hoy();
    return {
      editId: null, orig: null, paso: 1,
      checkin: pre.checkin || h,
      checkout: pre.checkout || addDays(pre.checkin || h, 1),
      personas: 1,
      rooms: new Set(pre.room ? [pre.room] : []),
      desayuno: false,
      descTipo: 'porcentaje', descValor: 0, descMotivo: '',
      nombre: '', rut: '', email: '', tel: '',
      empresa: role() === 'web' ? state.session.displayName : '',
      comentarios: '', clienteId: ''
    };
  }

  function wizardDesdeReserva(r) {
    const w = nuevoWizard();
    Object.assign(w, {
      editId: r.id, orig: r,
      checkin: r.checkin, checkout: r.checkout,
      personas: r.num_personas || 1,
      rooms: new Set((r.habitaciones || []).map(h => String(h.numero))),
      desayuno: (r.desayunos?.cantidad || 0) > 0,
      descTipo: r.descuento?.tipo || 'porcentaje',
      descValor: r.descuento?.valor || 0,
      descMotivo: r.descuento?.motivo || '',
      nombre: r.huesped_nombre || '', rut: r.huesped_rut || '',
      email: r.huesped_email || '', tel: r.huesped_telefono || '',
      empresa: r.huesped_empresa || '', comentarios: r.comentarios || '',
      clienteId: r.cliente_id || ''
    });
    if (r.desayunos?.cantidad > 0) w.personas = Math.max(w.personas, r.desayunos.cantidad);
    return w;
  }

  function calcular() {
    const noches = calcularNoches(W.checkin, W.checkout);
    const habs   = [...W.rooms];
    const subtotalHabs = habs.reduce((s, n) => s + (HABITACIONES[n]?.precio || 0) * noches, 0);
    const numDesayunos = W.desayuno ? W.personas : 0;
    const subtotalDesayunos = numDesayunos * PRECIO_DESAYUNO * noches;
    const bruto = subtotalHabs + subtotalDesayunos;
    let descuento = 0;
    if (isInternal() && W.descValor > 0) {
      descuento = W.descTipo === 'porcentaje'
        ? Math.round(bruto * Math.min(W.descValor, 100) / 100)
        : Math.min(W.descValor, bruto);
    }
    return { noches, habs, subtotalHabs, numDesayunos, subtotalDesayunos, bruto, descuento, total: bruto - descuento };
  }

  /* Habitaciones ocupadas para las fechas del asistente (excluye la reserva en edición) */
  function ocupadasWizard() {
    const map = new Map();
    activas().forEach(r => {
      if (W.editId && r.id === W.editId) return;
      if (fechasSolapan(W.checkin, W.checkout, r.checkin, r.checkout)) {
        (r.habitaciones || []).forEach(h => map.set(String(h.numero), r));
      }
    });
    return map;
  }

  async function vistaNueva(v, editId, query) {
    if (editId) {
      if (!isInternal()) return irA('#hoy', true);
      await cargarReservas();
      const r = state.reservas.find(x => x.id === editId) || RESERVAS.getAll().find(x => x.id === editId);
      if (!r) { toast('No se encontró la reserva'); return irA('#reservas', true); }
      if (!W || W.editId !== editId) W = wizardDesdeReserva(r);
    } else if (!W || W.editId || query) {
      W = nuevoWizard(query || {});
      if (query?.room) W.paso = 3;   /* desde el calendario: directo a registrar al huésped */
      /* Consumir los parámetros para que un re-render no reinicie el asistente */
      if (query) history.replaceState(null, '', '#nueva');
    }
    cargarReservas();   /* refresca disponibilidad en segundo plano */
    pintarWizard(v);
  }

  function pintarWizard(v) {
    const titulos = ['Fechas', 'Habitaciones', 'Huésped', 'Confirmar'];
    setTop(W.editId ? 'Editar reserva' : 'Nueva reserva', `Paso ${W.paso} de 4 · ${titulos[W.paso - 1]}`);
    v.classList.add('has-actionbar');

    const head = `
      <div class="steps">${[1,2,3,4].map(i => `<i class="${i <= W.paso ? 'on' : ''}"></i>`).join('')}</div>
      <div class="step-label">${W.editId ? `Editando ${esc(W.editId)} · ` : ''}${titulos[W.paso - 1]}</div>
      <div id="wz-alert"></div>`;

    const c = calcular();
    let body = '';

    if (W.paso === 1) {
      const min = role() === 'web' ? `min="${hoy()}"` : '';
      body = `
        <div class="card" style="display:flex;flex-direction:column;gap:14px;">
          <div class="grid-2">
            <label class="field"><span>Check-in</span>
              <input type="date" id="wz-ci" value="${W.checkin}" ${min} /></label>
            <label class="field"><span>Check-out</span>
              <input type="date" id="wz-co" value="${W.checkout}" min="${addDays(W.checkin, 1)}" /></label>
          </div>
          <div class="nights-pill" id="wz-noches">${c.noches > 0 ? `🌙 ${c.noches} noche${c.noches === 1 ? '' : 's'} · ${fechaCorta(W.checkin)} → ${fechaCorta(W.checkout)}` : 'Elige fechas válidas'}</div>
          <div class="field"><span>Personas</span>
            <div class="stepper">
              <button type="button" data-p="-1" aria-label="Menos">−</button>
              <output id="wz-pers">${W.personas}</output>
              <button type="button" data-p="1" aria-label="Más">+</button>
            </div>
          </div>
          <div class="field"><span>Atajos</span>
            <div class="chips" style="margin:0;padding:0;">
              ${[1,2,3,5,7].map(n => `<button type="button" class="chip" data-n="${n}">${n} noche${n === 1 ? '' : 's'}</button>`).join('')}
            </div>
          </div>
        </div>`;
    }

    if (W.paso === 2) {
      const occ = ocupadasWizard();
      const libres = Object.keys(HABITACIONES).filter(n => !occ.has(n)).length;
      body = `
        <div class="alert alert-info">${fechaCorta(W.checkin)} → ${fechaCorta(W.checkout)} · ${libres} disponible${libres === 1 ? '' : 's'}</div>
        ${PISOS.map(p => `
          <div class="floor">🏠 ${p.label}</div>
          <div class="room-grid">
            ${p.nums.map(n => {
              const h = HABITACIONES[n], o = occ.get(n);
              if (o) return `
                <div class="room-tile occ"><b>${n}</b><span class="t">${esc(h.tipo)}</span>
                  <span class="p">${o.estado === 'pendiente' ? '⏳ Reservada' : '🔒 Ocupada'} hasta ${fechaCorta(o.checkout)}</span></div>`;
              return `
                <button type="button" class="room-tile${W.rooms.has(n) ? ' sel' : ''}" data-room="${n}">
                  <b>${n}</b><span class="t">${esc(h.tipo)}</span>
                  <span class="p">${formatCLP(h.precio)}<span class="muted" style="font-weight:500;"> /noche</span></span>
                </button>`;
            }).join('')}
          </div>`).join('')}`;
    }

    if (W.paso === 3) {
      const vinculado = W.clienteId ? CLIENTES.getById(W.clienteId) : null;
      body = `
        <div class="alert alert-info" style="display:flex;align-items:center;gap:10px;">
          <span style="flex:1;">🛏️ Hab. ${[...W.rooms].join(', ') || '—'} · ${fechaCorta(W.checkin)} → ${fechaCorta(W.checkout)} (${c.noches} noche${c.noches === 1 ? '' : 's'})</span>
          <button type="button" class="btn btn-outline" id="wz-cambiar" style="min-height:36px;padding:0 12px;font-size:13px;">Cambiar</button>
        </div>
        <div class="card" style="display:flex;flex-direction:column;gap:14px;">
          ${vinculado ? `<div class="linked">👤 Cliente: ${esc(vinculado.nombre || vinculado.empresa)}<button type="button" id="wz-unlink">Quitar</button></div>` : ''}
          <label class="field"><span>Nombre del huésped</span>
            <input type="text" id="wz-nombre" value="${esc(W.nombre)}" autocomplete="off" autocapitalize="words" placeholder="${isInternal() ? 'Escribe para buscar clientes…' : 'Nombre y apellido'}" /></label>
          <div id="wz-ac"></div>
          <label class="field"><span>RUT</span>
            <input type="text" id="wz-rut" value="${esc(W.rut)}" inputmode="text" autocapitalize="characters" placeholder="12.345.678-9" />
            <span class="err" id="wz-rut-err"></span></label>
          <label class="field"><span>Teléfono</span>
            <input type="tel" id="wz-tel" value="${esc(W.tel)}" inputmode="tel" placeholder="+56 9 1234 5678" /></label>
          <label class="field"><span>Email</span>
            <input type="email" id="wz-email" value="${esc(W.email)}" inputmode="email" autocapitalize="none" placeholder="correo@ejemplo.cl" />
            <span class="err" id="wz-email-err"></span></label>
          <label class="field"><span>Empresa</span>
            <input type="text" id="wz-empresa" value="${esc(W.empresa)}" placeholder="Opcional" /></label>
          <p class="hint muted small">Ningún dato es obligatorio; si ingresas RUT o email se valida el formato.</p>
        </div>`;
    }

    if (W.paso === 4) {
      body = `
        <button type="button" class="toggle-card${W.desayuno ? ' on' : ''}" id="wz-des">
          <div style="font-size:26px;">☕</div>
          <div style="flex:1;"><b>Incluir desayunos</b><br>
            <span class="small muted">${formatCLP(PRECIO_DESAYUNO)} × ${W.personas} persona${W.personas === 1 ? '' : 's'} × ${c.noches} noche${c.noches === 1 ? '' : 's'}</span></div>
          <div class="switch"></div>
        </button>
        ${isInternal() ? `
          <div class="card" style="display:flex;flex-direction:column;gap:12px;">
            <b>🏷️ Descuento</b>
            <div class="seg" id="wz-dtipo">
              <button type="button" data-t="porcentaje" class="${W.descTipo === 'porcentaje' ? 'on' : ''}">Porcentaje %</button>
              <button type="button" data-t="monto" class="${W.descTipo === 'monto' ? 'on' : ''}">Monto $</button>
            </div>
            <div class="grid-2">
              <label class="field"><span>${W.descTipo === 'porcentaje' ? 'Descuento (%)' : 'Descuento ($)'}</span>
                <input type="number" id="wz-dval" inputmode="numeric" min="0" ${W.descTipo === 'porcentaje' ? 'max="100"' : ''} value="${W.descValor || ''}" placeholder="0" /></label>
              <label class="field"><span>Motivo</span>
                <input type="text" id="wz-dmot" value="${esc(W.descMotivo)}" placeholder="Ej: convenio" /></label>
            </div>
          </div>` : ''}
        <label class="field"><span>Comentarios</span>
          <textarea id="wz-com" placeholder="Hora de llegada, solicitudes especiales…">${esc(W.comentarios)}</textarea></label>
        <div class="card">
          <div class="summary-line"><span>Huésped</span><b>${esc(W.nombre || '—')}</b></div>
          <div class="summary-line"><span>Fechas</span><b>${fechaCorta(W.checkin)} → ${fechaCorta(W.checkout)}</b></div>
          <div class="summary-line"><span>Habitaciones</span><b>${c.habs.map(n => 'Hab. ' + n).join(', ') || '—'}</b></div>
          <div class="summary-line"><span>${c.habs.length} hab. × ${c.noches} noche${c.noches === 1 ? '' : 's'}</span><span>${formatCLP(c.subtotalHabs)}</span></div>
          ${c.subtotalDesayunos ? `<div class="summary-line"><span>Desayunos</span><span>${formatCLP(c.subtotalDesayunos)}</span></div>` : ''}
          ${c.descuento ? `<div class="summary-line" style="color:var(--success);"><span>Descuento</span><span>− ${formatCLP(c.descuento)}</span></div>` : ''}
          <div class="summary-line total"><span>Total</span><span id="wz-total">${formatCLP(c.total)}</span></div>
        </div>
        ${role() === 'web' ? `<div class="alert alert-info">Te confirmaremos en menos de 24 horas hábiles.</div>` : ''}`;
    }

    const btnTxt = W.paso < 4 ? 'Siguiente →' : (W.editId ? '💾 Guardar cambios' : '📨 Enviar reserva');
    v.innerHTML = `${head}${body}
      <div class="actionbar">
        ${W.paso > 1 ? `<button type="button" class="btn btn-outline" id="wz-prev" style="min-width:0;">←</button>` : ''}
        <div class="ab-total">
          <b id="ab-total">${formatCLP(c.total)}</b>
          <span id="ab-sub">${c.habs.length} hab. · ${c.noches} noche${c.noches === 1 ? '' : 's'}</span>
        </div>
        <button type="button" class="btn btn-primary" id="wz-next">${btnTxt}</button>
      </div>`;

    enlazarWizard(v);
  }

  function refrescarTotales() {
    const c = calcular();
    if ($('#ab-total')) $('#ab-total').textContent = formatCLP(c.total);
    if ($('#ab-sub'))   $('#ab-sub').textContent = `${c.habs.length} hab. · ${c.noches} noche${c.noches === 1 ? '' : 's'}`;
    if ($('#wz-total')) $('#wz-total').textContent = formatCLP(c.total);
  }

  function guardarCamposPaso() {
    const val = id => $(id) ? $(id).value.trim() : undefined;
    if (W.paso === 3) {
      W.nombre = val('#wz-nombre'); W.rut = val('#wz-rut'); W.tel = val('#wz-tel');
      W.email = val('#wz-email'); W.empresa = val('#wz-empresa');
    }
    if (W.paso === 4) {
      W.comentarios = val('#wz-com') || '';
      if ($('#wz-dval')) W.descValor = parseFloat($('#wz-dval').value) || 0;
      if ($('#wz-dmot')) W.descMotivo = val('#wz-dmot');
    }
  }

  function wzAlert(tipo, msg) {
    $('#wz-alert').innerHTML = msg ? `<div class="alert alert-${tipo}">${msg}</div>` : '';
    if (msg) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function validarPaso() {
    if (W.paso === 1) {
      if (!W.checkin || !W.checkout || calcularNoches(W.checkin, W.checkout) <= 0) {
        wzAlert('error', 'El check-out debe ser posterior al check-in.'); return false;
      }
      if (role() === 'web' && W.checkin < hoy()) { wzAlert('error', 'El check-in no puede ser en el pasado.'); return false; }
    }
    if (W.paso === 2) {
      const occ = ocupadasWizard();
      const quitadas = [...W.rooms].filter(n => occ.has(n));
      quitadas.forEach(n => W.rooms.delete(n));
      if (quitadas.length) { wzAlert('warning', `Hab. ${quitadas.join(', ')} ya no está disponible y se quitó.`); return false; }
      if (W.rooms.size === 0) { wzAlert('error', 'Selecciona al menos una habitación.'); return false; }
    }
    if (W.paso === 3) {
      let ok = true;
      $('#wz-rut-err').textContent = ''; $('#wz-email-err').textContent = '';
      $('#wz-rut').classList.remove('error'); $('#wz-email').classList.remove('error');
      if (W.rut && !validarRUT(W.rut)) {
        $('#wz-rut-err').textContent = 'RUT inválido. Verifica el dígito verificador.';
        $('#wz-rut').classList.add('error'); ok = false;
      }
      if (W.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(W.email)) {
        $('#wz-email-err').textContent = 'Email inválido.';
        $('#wz-email').classList.add('error'); ok = false;
      }
      return ok;
    }
    return true;
  }

  function enlazarWizard(v) {
    /* Paso 1 */
    const ci = $('#wz-ci'), co = $('#wz-co');
    if (ci) {
      const pintarNoches = () => {
        const n = calcularNoches(W.checkin, W.checkout);
        $('#wz-noches').textContent = n > 0
          ? `🌙 ${n} noche${n === 1 ? '' : 's'} · ${fechaCorta(W.checkin)} → ${fechaCorta(W.checkout)}`
          : 'Elige fechas válidas';
        refrescarTotales();
      };
      ci.onchange = () => {
        W.checkin = ci.value;
        co.min = W.checkin ? addDays(W.checkin, 1) : '';
        if (W.checkin && (!W.checkout || W.checkout <= W.checkin)) { W.checkout = addDays(W.checkin, 1); co.value = W.checkout; }
        pintarNoches();
      };
      co.onchange = () => { W.checkout = co.value; pintarNoches(); };
      $$('[data-p]', v).forEach(b => b.onclick = () => {
        W.personas = Math.max(1, Math.min(20, W.personas + Number(b.dataset.p)));
        $('#wz-pers').textContent = W.personas; vibrar(); refrescarTotales();
      });
      $$('[data-n]', v).forEach(b => b.onclick = () => {
        if (!W.checkin) return;
        W.checkout = addDays(W.checkin, Number(b.dataset.n)); co.value = W.checkout; pintarNoches();
      });
    }

    /* Paso 2 */
    $$('[data-room]', v).forEach(b => b.onclick = () => {
      const n = b.dataset.room;
      W.rooms.has(n) ? W.rooms.delete(n) : W.rooms.add(n);
      b.classList.toggle('sel', W.rooms.has(n)); vibrar(); refrescarTotales();
    });

    /* Paso 3: autocompletar clientes */
    const nom = $('#wz-nombre');
    if (nom && isInternal()) {
      nom.oninput = () => {
        const q = nom.value.trim();
        const res = q ? CLIENTES.buscar(q).slice(0, 6) : [];
        $('#wz-ac').innerHTML = res.length ? `<div class="ac-list">${res.map(cl => `
          <button type="button" class="row" data-cli="${esc(cl.id)}" style="min-height:52px;">
            <div class="row-main"><div class="row-title">${esc(cl.nombre || cl.empresa)}</div>
            <div class="row-sub">${esc([cl.empresa !== cl.nombre ? cl.empresa : '', cl.rut, cl.telefono].filter(Boolean).join(' · '))}</div></div>
          </button>`).join('')}</div>` : '';
        $$('[data-cli]', v).forEach(b => b.onclick = () => {
          const cl = CLIENTES.getById(b.dataset.cli); if (!cl) return;
          Object.assign(W, { clienteId: cl.id, nombre: cl.nombre || cl.empresa || '', rut: cl.rut || '',
            email: cl.email || '', tel: cl.telefono || '', empresa: cl.empresa || '' });
          pintarWizard(v);
        });
      };
    }
    const rut = $('#wz-rut');
    if (rut) rut.addEventListener('input', () => autoFormatRUT(rut));
    const camb = $('#wz-cambiar');
    if (camb) camb.onclick = () => { guardarCamposPaso(); W.paso = 1; pintarWizard(v); window.scrollTo(0, 0); };
    const un = $('#wz-unlink');
    if (un) un.onclick = () => { guardarCamposPaso(); W.clienteId = ''; pintarWizard(v); };

    /* Paso 4 */
    const des = $('#wz-des');
    if (des) des.onclick = () => { guardarCamposPaso(); W.desayuno = !W.desayuno; pintarWizard(v); };
    $$('#wz-dtipo [data-t]', v).forEach(b => b.onclick = () => {
      guardarCamposPaso(); W.descTipo = b.dataset.t; W.descValor = 0; pintarWizard(v);
    });
    /* Mientras se escribe solo se actualizan los totales (sin perder el foco);
       al salir del campo se repinta el resumen completo con la línea de descuento. */
    const dval = $('#wz-dval');
    if (dval) {
      dval.oninput = () => { W.descValor = parseFloat(dval.value) || 0; refrescarTotales(); };
      dval.onchange = () => { guardarCamposPaso(); pintarWizard(v); };
    }

    /* Navegación */
    const prev = $('#wz-prev');
    if (prev) prev.onclick = () => { guardarCamposPaso(); W.paso--; pintarWizard(v); window.scrollTo(0, 0); };
    $('#wz-next').onclick = async () => {
      guardarCamposPaso();
      if (W.paso === 1 || W.paso === 2) await cargarReservas();
      if (!validarPaso()) return;
      if (W.paso < 4) { W.paso++; pintarWizard(v); window.scrollTo(0, 0); return; }
      enviarReserva();
    };
  }

  function construirReserva() {
    const c = calcular();
    return {
      checkin: W.checkin, checkout: W.checkout, noches: c.noches,
      num_personas: W.personas,
      habitaciones: c.habs.map(n => ({ numero: n, tipo: HABITACIONES[n].tipo, precio: HABITACIONES[n].precio })),
      huesped_nombre: W.nombre, huesped_rut: W.rut, huesped_email: W.email,
      huesped_telefono: W.tel, huesped_empresa: W.empresa,
      cliente_id: W.clienteId || '',
      desayunos: { cantidad: c.numDesayunos, precio_unit: PRECIO_DESAYUNO, subtotal: c.subtotalDesayunos },
      descuento: { tipo: W.descTipo, valor: isInternal() ? W.descValor : 0, monto: c.descuento, motivo: isInternal() ? W.descMotivo : '' },
      subtotal_habs: c.subtotalHabs,
      subtotal_desayunos: c.subtotalDesayunos,
      subtotal_bruto: c.bruto,
      descuento_monto: c.descuento,
      total: c.total,
      comentarios: W.comentarios
    };
  }

  async function enviarReserva() {
    const btn = $('#wz-next');
    btn.disabled = true; btn.textContent = 'Guardando…';
    await cargarReservas(true);
    const occ = ocupadasWizard();
    const choque = [...W.rooms].filter(n => occ.has(n));
    if (choque.length) {
      choque.forEach(n => W.rooms.delete(n));
      W.paso = 2; pintarWizard($('#view'));
      wzAlert('warning', `Hab. ${choque.join(', ')} acaba de ser reservada por otra persona. Elige otra.`);
      return;
    }

    const datos = construirReserva();
    try {
      if (W.editId) {
        guardarReservaEditada(W.editId, W.orig, datos);
        const id = W.editId;
        W = null; vibrar();
        toast('💾 Cambios guardados');
        irA('#reservas', true);
        setTimeout(() => abrirReserva(id), 150);
      } else {
        const origen = { owner: 'Teléfono-David', staff: 'Teléfono-Nelson', web: 'Web' }[role()] || 'Web';
        const reserva = { origen, registrado_por: state.session.shortName, cliente: state.session.displayName, ...datos };
        const id = RESERVAS.save(reserva);
        state.reservas.push({ id, ...reserva, estado: 'pendiente', fecha_reserva: new Date().toISOString() });
        W = null; vibrar();
        mostrarExito(id, reserva);
      }
    } catch (err) {
      btn.disabled = false; btn.textContent = 'Reintentar';
      wzAlert('error', 'Error al guardar: ' + esc(err.message));
    }
  }

  function mostrarExito(id, r) {
    abrirSheet(`
      <div style="text-align:center;padding-top:6px;">
        <div style="font-size:52px;">✅</div>
        <h3>¡Reserva enviada!</h3>
        <p class="muted small">${role() === 'web' ? 'Te contactaremos en menos de 24 horas hábiles para confirmar.' : 'Quedó como pendiente de confirmación.'}</p>
      </div>
      <div class="card" style="box-shadow:none;background:var(--bg);">
        <dl class="dl">
          <dt>ID</dt><dd>${esc(id)}</dd>
          <dt>Huésped</dt><dd>${esc(r.huesped_nombre || '—')}</dd>
          <dt>Fechas</dt><dd>${fechaCorta(r.checkin)} → ${fechaCorta(r.checkout)}</dd>
          <dt>Habitaciones</dt><dd>${r.habitaciones.map(h => 'Hab. ' + h.numero).join(', ')}</dd>
          <dt>Total</dt><dd>${formatCLP(r.total)}</dd>
        </dl>
      </div>
      <button class="btn btn-primary btn-block btn-lg" id="ok-otra">+ Otra reserva</button>
      <button class="btn btn-outline btn-block" id="ok-ver">Ver reservas</button>
    `, () => { if (location.hash.startsWith('#nueva')) irA('#reservas', true); });
    $('#ok-otra').onclick = () => { _sheetOnClose = null; W = null; cerrarSheet(false, () => irA('#nueva', true)); };
    $('#ok-ver').onclick  = () => { _sheetOnClose = null; cerrarSheet(false, () => irA('#reservas', true)); };
  }

  /* ================================================
     VISTA: CALENDARIO (semana + detalle por día)
     ================================================ */
  async function vistaCalendario(v) {
    setTop('Calendario del día', '');
    if (!state.calDia) state.calDia = hoy();
    v.innerHTML = `<div class="loading">Cargando…</div>`;
    await cargarReservas();

    const total = Object.keys(HABITACIONES).length;
    const dia = state.calDia;
    const h = hoy();
    const lunes = lunesDe(dia);
    const dias = [...Array(7)].map((_, i) => addDays(lunes, i));
    const act = activas();
    const occDia = dias.map(d => ocupacionNoche(d, act));
    const occ = ocupacionNoche(dia, act);
    setTop('Calendario del día', fechaLarga(dia));

    /* Estado de cada habitación en el día elegido */
    const info = Object.keys(HABITACIONES).map(n => {
      const r = occ.get(n);
      const sale = act.find(x => x.checkout === dia && (x.habitaciones || []).some(y => String(y.numero) === n));
      const propia = r && (isInternal() || r.origen === 'Web' || !r.origen);
      let est = 'libre';
      if (r) est = r.estado === 'pendiente' ? 'pend' : 'ocup';
      return { n, r, sale, propia, est };
    });
    const nLibres = info.filter(x => x.est === 'libre').length;
    const nOcup   = info.filter(x => x.est === 'ocup').length;
    const nPend   = info.filter(x => x.est === 'pend').length;
    const puedeReservar = dia >= h || isInternal();

    const tile = x => {
      const hab = HABITACIONES[x.n];
      if (x.r) {
        const llega = x.r.checkin === dia;
        const n = calcularNoches(x.r.checkin, x.r.checkout);
        const noche = calcularNoches(x.r.checkin, dia) + 1;
        return `
          <button class="dtile ocup${x.est === 'pend' ? ' pend' : ''}" ${x.propia ? `data-res="${esc(x.r.id)}"` : ''}>
            <div class="dt-top"><b>${x.n}</b><span class="dt-pill">${x.est === 'pend' ? 'Por confirmar' : 'Ocupada'}</span></div>
            <div class="dt-guest">${x.propia ? esc(nombreRes(x.r)) : 'Reservada'}</div>
            <div class="dt-sub">${llega ? '🛬 Llega hoy' : `Noche ${noche}/${n}`} · sale ${fechaCorta(x.r.checkout)}</div>
          </button>`;
      }
      return `
        <button class="dtile libre" ${puedeReservar ? `data-libre="${x.n}"` : ''}>
          <div class="dt-top"><b>${x.n}</b><span class="dt-pill">Libre</span></div>
          <div class="dt-guest">${esc(hab.tipo)}</div>
          <div class="dt-sub">${x.sale ? `🧳 Libre desde 11:00` : (puedeReservar ? '+ Registrar huésped' : formatCLP(hab.precio))}</div>
        </button>`;
    };

    const ingresosDia = role() === 'owner'
      ? [...occ.entries()].filter(([, r]) => r.estado === 'confirmada').reduce((s, [n]) => s + (HABITACIONES[n]?.precio || 0), 0)
      : null;

    v.innerHTML = `
      <div class="day-nav">
        <button class="btn btn-outline" id="cal-prev" aria-label="Día anterior">‹</button>
        <label class="day-nav-lbl">
          <b>${fechaLarga(dia)}</b>
          <span>${dia === h ? 'Hoy' : dia === addDays(h, 1) ? 'Mañana' : dia === addDays(h, -1) ? 'Ayer' : 'Toca para elegir fecha'}</span>
          <input type="date" id="cal-fecha" value="${dia}" aria-label="Elegir fecha" />
        </label>
        <button class="btn btn-outline" id="cal-next" aria-label="Día siguiente">›</button>
      </div>
      <div class="days">
        ${dias.map((d, i) => {
          const dd = parseYmd(d), pct = Math.round(occDia[i].size / total * 100);
          return `<button class="day${d === dia ? ' on' : ''}${d === h ? ' today' : ''}" data-dia="${d}">
            <div class="dn">${DIAS[dd.getDay()]}</div><div class="dd">${dd.getDate()}</div>
            <div class="dot"><i style="width:${pct}%"></i></div></button>`;
        }).join('')}
      </div>
      ${dia !== h ? `<button class="btn btn-ghost btn-block" id="cal-hoy" style="min-height:40px;">Volver a hoy</button>` : ''}
      <div class="disp">
        <span class="libre">🟩 ${nLibres} libre${nLibres === 1 ? '' : 's'}</span>
        <span class="ocup">🟨 ${nOcup + nPend} ocupada${nOcup + nPend === 1 ? '' : 's'}${nPend ? ` (${nPend} por confirmar)` : ''}</span>
      </div>
      ${ingresosDia !== null ? `<div class="muted small" style="margin:-6px 2px 0;">Ingresos confirmados de la noche: <b>${formatCLP(ingresosDia)}</b></div>` : ''}
      <div class="dgrid">${PISOS.flatMap(p => p.nums).map(n => tile(info.find(x => x.n === n))).join('')}</div>
      <p class="muted small" style="text-align:center;">Verde: libre, toca para registrar · Amarillo: ocupada, toca para ver o modificar</p>
    `;

    const mover = d => { state.calDia = d; vistaCalendario(v); };
    $('#cal-prev').onclick = () => mover(addDays(dia, -1));
    $('#cal-next').onclick = () => mover(addDays(dia, 1));
    if ($('#cal-hoy')) $('#cal-hoy').onclick = () => mover(h);
    $('#cal-fecha').onchange = e => { if (e.target.value) mover(e.target.value); };
    $$('[data-dia]', v).forEach(b => b.onclick = () => mover(b.dataset.dia));
    $$('[data-res]', v).forEach(b => b.onclick = () => opcionesOcupada(b.dataset.res, b.querySelector('b').textContent));
    $$('[data-libre]', v).forEach(b => b.onclick = () => {
      W = null;
      irA(`#nueva?ci=${dia}&room=${b.dataset.libre}`);
    });

    /* Deslizar a los lados cambia de día */
    let t0 = null;
    v.ontouchstart = e => { t0 = e.target.closest('.days, input') ? null : e.touches[0]; t0 = t0 && { x: t0.clientX, y: t0.clientY }; };
    v.ontouchend = e => {
      if (!t0 || !location.hash.startsWith('#calendario')) return;
      const dx = e.changedTouches[0].clientX - t0.x, dy = e.changedTouches[0].clientY - t0.y; t0 = null;
      if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) mover(addDays(dia, dx < 0 ? 1 : -1));
    };
  }

  /* Menú corto al tocar una habitación ocupada en el calendario */
  function opcionesOcupada(id, hab) {
    const r = state.reservas.find(x => x.id === id);
    if (!r) return;
    if (!isInternal()) return abrirReserva(id);
    abrirSheet(`
      <div class="opc-head">
        <div class="opc-hab">${esc(hab)}</div>
        <div style="min-width:0;">
          <h3>${esc(nombreRes(r))}</h3>
          <div class="muted small">${fechaCorta(r.checkin)} → ${fechaCorta(r.checkout)} · ${r.noches || calcularNoches(r.checkin, r.checkout)} noche${r.noches === 1 ? '' : 's'} · ${badgeEstado(r.estado)}</div>
        </div>
      </div>
      <button class="btn btn-ghost btn-block btn-lg" id="opc-ver">📋 Ver detalle</button>
      <button class="btn btn-primary btn-block btn-lg" id="opc-mod">✏️ Modificar reserva</button>
      <button class="btn btn-outline btn-block" data-close>Cerrar</button>
    `);
    $('#opc-ver').onclick = () => abrirReserva(id);
    $('#opc-mod').onclick = () => abrirModificar(id);
    $('#sheet-body [data-close]').onclick = () => cerrarSheet();
  }

  /* ================================================
     VISTA: CLIENTES
     ================================================ */
  /* Altas, cambios y bajas de clientes hechas en el computador (ver CLIENTES.syncFromCloud) */
  function sincronizarClientes() { return CLIENTES.syncFromCloud(); }

  function vistaClientes(v) {
    if (!isInternal()) return irA('#hoy', true);
    setTop('Clientes', '');
    v.innerHTML = `
      <input type="search" class="search" id="cli-q" placeholder="Buscar nombre, empresa, RUT, email…"
             value="${esc(state.cliBusqueda)}" autocomplete="off" />
      <div class="card-list" id="cli-list"></div>
      <button class="fab" id="cli-nuevo" aria-label="Nuevo cliente">+</button>`;

    const pintar = () => {
      const q = state.cliBusqueda.trim();
      const lista = (q ? CLIENTES.buscar(q) : CLIENTES.getAll())
        .slice().sort((a, b) => (a.nombre || a.empresa || '').localeCompare(b.nombre || b.empresa || '', 'es'));
      $('#cli-list').innerHTML = lista.length ? lista.map(c => `
        <button class="row" data-cli="${esc(c.id)}">
          <div class="room-num">${esc((c.nombre || c.empresa || '?').charAt(0).toUpperCase())}</div>
          <div class="row-main">
            <div class="row-title">${esc(c.nombre || c.empresa || '—')}</div>
            <div class="row-sub">${esc([c.empresa && c.empresa !== c.nombre ? c.empresa : '', c.telefono, c.rut].filter(Boolean).join(' · ') || 'Sin datos de contacto')}</div>
          </div>
          <span class="row-chev">›</span>
        </button>`).join('')
        : `<div class="empty"><div class="big">👤</div>${q ? 'Sin resultados.' : 'No hay clientes registrados aún.'}</div>`;
      $$('[data-cli]', v).forEach(b => b.onclick = () => fichaCliente(b.dataset.cli, pintar));
    };

    $('#cli-q').addEventListener('input', e => { state.cliBusqueda = e.target.value; pintar(); });
    $('#cli-nuevo').onclick = () => fichaCliente(null, pintar);
    pintar();
    sincronizarClientes().then(n => { if (n && location.hash.startsWith('#clientes')) pintar(); });
  }

  function fichaCliente(id, alCambiar) {
    const c = id ? CLIENTES.getById(id) : {};
    if (id && !c) return;
    const tel = telLimpio(c.telefono);
    const hist = id ? state.reservas.filter(r => r.cliente_id === id)
      .sort((a, b) => b.checkin.localeCompare(a.checkin)) : [];

    abrirSheet(`
      <h3>${id ? esc(c.nombre || c.empresa) : 'Nuevo cliente'}</h3>
      ${id && (tel || c.email) ? `<div class="contact-row">
        ${tel ? `<a class="btn btn-ghost" href="tel:${esc(tel)}"><b>📞</b>Llamar</a>` : ''}
        ${tel ? `<a class="btn btn-ghost" href="https://wa.me/${esc(tel.replace('+',''))}" target="_blank" rel="noopener"><b>💬</b>WhatsApp</a>` : ''}
        ${c.email ? `<a class="btn btn-ghost" href="mailto:${esc(c.email)}"><b>✉️</b>Email</a>` : ''}
      </div>` : ''}
      <div id="cf-alert"></div>
      <label class="field"><span>Nombre</span><input id="cf-nombre" value="${esc(c.nombre || '')}" autocapitalize="words" /></label>
      <label class="field"><span>Empresa</span><input id="cf-empresa" value="${esc(c.empresa || '')}" /></label>
      <div class="grid-2">
        <label class="field"><span>RUT</span><input id="cf-rut" value="${esc(c.rut || '')}" autocapitalize="characters" /></label>
        <label class="field"><span>Teléfono</span><input id="cf-tel" type="tel" inputmode="tel" value="${esc(c.telefono || '')}" /></label>
      </div>
      <label class="field"><span>Email</span><input id="cf-email" type="email" inputmode="email" autocapitalize="none" value="${esc(c.email || '')}" /></label>
      <label class="field"><span>Notas</span><textarea id="cf-notas">${esc(c.notas || '')}</textarea></label>
      <button class="btn btn-primary btn-block btn-lg" id="cf-save">💾 ${id ? 'Actualizar' : 'Guardar'} cliente</button>
      ${id ? `<button class="btn btn-ghost btn-block" id="cf-reservar">📅 Nueva reserva para este cliente</button>` : ''}
      ${hist.length ? `<div class="section-title">Historial<span class="count">${hist.length}</span></div>
        <div class="card-list">${hist.map(r => `
          <button class="row" data-res="${esc(r.id)}">
            <div class="row-main"><div class="row-title">${fechaCorta(r.checkin)} → ${fechaCorta(r.checkout)}</div>
            <div class="row-sub">Hab. ${esc(habsTexto(r))} · ${esc(r.id)}</div></div>${badgeEstado(r.estado)}
          </button>`).join('')}</div>` : ''}
      ${id ? `<button class="btn btn-danger btn-block" id="cf-del">Eliminar cliente</button>` : ''}
      <button class="btn btn-outline btn-block" data-close>Cerrar</button>
    `);

    const rut = $('#cf-rut');
    rut.addEventListener('input', () => autoFormatRUT(rut));
    $('#sheet-body [data-close]').onclick = () => cerrarSheet();
    $$('#sheet-body [data-res]').forEach(b => b.onclick = () => cerrarSheet(false, () => abrirReserva(b.dataset.res)));

    $('#cf-save').onclick = () => {
      const data = {
        nombre: $('#cf-nombre').value.trim(), empresa: $('#cf-empresa').value.trim(),
        rut: $('#cf-rut').value.trim(), telefono: $('#cf-tel').value.trim(),
        email: $('#cf-email').value.trim(), notas: $('#cf-notas').value.trim()
      };
      const err = m => { $('#cf-alert').innerHTML = `<div class="alert alert-error">${m}</div>`; $('#sheet-body').scrollTop = 0; };
      if (!data.nombre && !data.empresa) return err('Ingresa al menos el nombre o la empresa.');
      if (data.rut && !validarRUT(data.rut)) return err('El RUT no es válido. Verifica el dígito verificador.');
      if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return err('Email inválido.');
      if (id) CLIENTES.update(id, data); else CLIENTES.save(data);
      vibrar(); toast(id ? '✅ Cliente actualizado' : '✅ Cliente guardado');
      cerrarSheet(); alCambiar?.();
    };
    const del = $('#cf-del');
    if (del) del.onclick = () => {
      if (!confirm(`¿Eliminar a "${c.nombre || c.empresa}"? Esta acción no se puede deshacer.`)) return;
      CLIENTES.remove(id); toast('Cliente eliminado'); cerrarSheet(); alCambiar?.();
    };
    const resv = $('#cf-reservar');
    if (resv) resv.onclick = () => {
      W = nuevoWizard();
      Object.assign(W, { clienteId: c.id, nombre: c.nombre || c.empresa || '', rut: c.rut || '',
        email: c.email || '', tel: c.telefono || '', empresa: c.empresa || '' });
      cerrarSheet(false, () => irA('#nueva'));
    };
  }

  /* ================================================
     VISTA: ASEO (misma lógica que aseo.html)
     ================================================ */
  async function vistaAseo(v) {
    if (!isInternal()) return irA('#hoy', true);
    setTop('Aseo de hoy', fechaLarga(hoy()));
    v.innerHTML = `<div class="loading">Cargando…</div>`;
    await cargarReservas();

    const h = hoy(), man = addDays(h, 1);
    const act = activas();
    const g = { checkout: [], preparar: [], ocupada: [], libre: [] };
    Object.keys(HABITACIONES).forEach(num => {
      const rel = act.filter(r => (r.habitaciones || []).some(x => String(x.numero) === num));
      const sale   = rel.find(r => r.checkout === h);
      const entra  = rel.find(r => r.checkin === man);
      const ocup   = rel.find(r => r.checkin <= h && r.checkout > h);
      if (sale)       g.checkout.push({ num, r: sale, sig: entra });
      else if (entra) g.preparar.push({ num, r: entra });
      else if (ocup)  g.ocupada.push({ num, r: ocup });
      else            g.libre.push({ num });
    });

    const fila = (num, cls, det, tag, tagCls) => `
      <div class="row">
        <div class="room-num ${cls}">${num}</div>
        <div class="row-main"><div class="row-title">${esc(HABITACIONES[num].tipo)}</div><div class="row-sub">${det}</div></div>
        ${tag ? `<span class="aseo-tag ${tagCls}">${tag}</span>` : ''}
      </div>`;
    const bloque = (t, arr, fn) => arr.length ? `<div class="section-title">${t}<span class="count">${arr.length}</span></div><div class="card-list">${arr.map(fn).join('')}</div>` : '';

    v.innerHTML = `
      ${bloque('🔴 Se van — cambio de sábanas', g.checkout, x => fila(x.num, 'out',
        `Sale: ${esc(nombreRes(x.r))}${x.sig ? ` · Entra mañana: ${esc(nombreRes(x.sig))}` : ''}`, 'CAMBIO', 'b-canc'))}
      ${bloque('🟡 Preparar — entra alguien mañana', g.preparar, x => fila(x.num, 'pend',
        `Entra mañana: ${esc(nombreRes(x.r))}`, 'PREPARAR', 'b-pend'))}
      ${bloque('🟢 Ocupadas — aseo rápido', g.ocupada, x => fila(x.num, 'in',
        `${esc(nombreRes(x.r))} · hasta ${fechaCorta(x.r.checkout)}`, 'ASEO', 'b-conf'))}
      ${bloque('⚪ Libres', g.libre, x => fila(x.num, 'free', 'Sin reserva', '', ''))}
      <p class="muted small" style="text-align:center;">Actualizado ${new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</p>
    `;
  }

  /* ================================================
     VISTA: MÁS
     ================================================ */
  function vistaMas(v) {
    setTop('Más', '');
    const s = state.session;
    const labels = { owner: 'Dueño — HDQ', staff: 'Staff — HDQ', web: 'Cliente corporativo' };
    const av = { owner: '👑', staff: '📞', web: '🏢' }[s.role] || '👤';
    const item = (href, ico, t, sub, extra = '') => `
      <a class="row" href="${href}" ${extra} style="text-decoration:none;color:inherit;">
        <div class="menu-ico">${ico}</div>
        <div class="row-main"><div class="row-title">${t}</div>${sub ? `<div class="row-sub">${sub}</div>` : ''}</div>
        <span class="row-chev">›</span>
      </a>`;

    v.innerHTML = `
      <div class="card profile">
        <div class="avatar">${av}</div>
        <div style="min-width:0;"><b>${esc(s.displayName)}</b><div class="muted small">${labels[s.role] || s.role}</div></div>
      </div>

      ${isInternal() ? `
        <div class="section-title">Gestión</div>
        <div class="card-list">
          ${item('#clientes', '👤', 'Clientes', 'Buscar, crear y editar fichas')}
          ${item('#aseo', '🧹', 'Aseo de hoy', 'Cambios de sábanas y habitaciones a preparar')}
        </div>` : ''}

      <div class="section-title">Sistema</div>
      <div class="card-list">
        <button class="row" id="m-sync">
          <div class="menu-ico">🔄</div>
          <div class="row-main"><div class="row-title">Sincronizar ahora</div>
          <div class="row-sub">${state.fuente === 'sheets' ? 'Conectado a Google Sheets' : 'Datos locales de este teléfono'}${state.cargadoEn ? ' · ' + new Date(state.cargadoEn).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : ''}</div></div>
        </button>
        <button class="row" id="m-install" hidden>
          <div class="menu-ico">📲</div>
          <div class="row-main"><div class="row-title">Instalar app</div><div class="row-sub">Acceso directo en tu pantalla de inicio</div></div>
        </button>
        ${item('../dashboard.html', '🖥️', 'Versión escritorio', role() === 'owner' ? 'Panel Admin, EMAT y reportes completos' : 'Abrir el portal completo', 'id="m-desk"')}
      </div>

      <div id="m-ios" class="card small" hidden>
        <b>📲 Instalar en iPhone:</b> toca <b>Compartir</b> (□↑) en Safari y luego <b>“Agregar a pantalla de inicio”</b>.
      </div>

      ${role() === 'web' ? '' : infoHostalHtml()}

      <button class="btn btn-danger btn-block btn-lg" id="m-logout">🚪 Cerrar sesión</button>
      <p class="muted small" style="text-align:center;">Hostal HDQ · Versión móvil</p>
    `;

    $('#m-sync').onclick = async () => { await cargarReservas(true); await sincronizarClientes(); toast('🔄 Datos actualizados'); vistaMas(v); };
    $('#m-logout').onclick = () => { if (confirm('¿Cerrar sesión?')) AUTH.logout(); };
    $('#m-desk').onclick = () => { try { sessionStorage.setItem('hdq_prefer_desktop', '1'); } catch {} };

    const inst = $('#m-install');
    if (_installEvt) { inst.hidden = false; inst.onclick = async () => { _installEvt.prompt(); _installEvt = null; inst.hidden = true; }; }
    const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (esIOS && !standalone) $('#m-ios').hidden = false;
  }

  /* ================================================
     ROUTER
     ================================================ */
  function setTop(t, sub) {
    $('#topbar-title').textContent = t;
    $('#topbar-sub').textContent = sub || '';
    document.title = `${t} · HDQ Móvil`;
  }

  function irA(hash, reemplazar = false) {
    if (reemplazar) { history.replaceState(null, '', hash); render(); }
    else location.hash = hash;
  }

  function tabs() {
    const r = role();
    const t = r === 'web'
      ? [['#hoy','🏠','Inicio'], ['#reservas','📋','Mis reservas'], ['#nueva','+',''], ['#calendario','🗓️','Calendario'], ['#mas','☰','Más']]
      : [['#hoy','🏠','Hoy'], ['#reservas','📋','Reservas'], ['#nueva','+',''], ['#calendario','🗓️','Calendario'], ['#mas','☰','Más']];
    $('#tabbar').innerHTML = t.map(([h, i, l]) => h === '#nueva'
      ? `<a class="tab tab-plus" href="#nueva" data-tab="#nueva" aria-label="Nueva reserva"><span class="plus">+</span></a>`
      : `<a class="tab" href="${h}" data-tab="${h}"><span class="ti">${i}</span>${l}</a>`).join('');
    /* Tocar "+" estando ya en el asistente lo reinicia; desde otra pestaña conserva el borrador */
    $$('#tabbar .tab').forEach(a => a.addEventListener('click', () => {
      if (a.dataset.tab === '#nueva' && location.hash.startsWith('#nueva')) {
        W = null;
        if (location.hash === '#nueva') render();
      }
    }));
  }

  function render() {
    if (!state.session) return;
    const raw = (location.hash || '#hoy').replace('~sheet', '');
    if (location.hash.includes('~sheet') && $('#sheet').hidden) {
      history.replaceState(null, '', raw);
    }
    const [path, qs] = raw.split('?');
    const [ruta, param] = path.split('/');
    const query = qs ? Object.fromEntries(new URLSearchParams(qs)) : null;

    const v = $('#view');
    v.classList.remove('has-actionbar');
    $$('#tabbar .tab').forEach(a => a.classList.toggle('on',
      a.dataset.tab === ruta || (ruta === '#editar' && a.dataset.tab === '#reservas') ||
      ((ruta === '#clientes' || ruta === '#aseo') && a.dataset.tab === '#mas')));

    const sub = ['#editar', '#clientes', '#aseo'].includes(ruta);
    $('#btn-back').hidden = !sub;

    switch (ruta) {
      case '#reservas':   return vistaReservas(v);
      case '#nueva':      return vistaNueva(v, null, query ? { checkin: query.ci, room: query.room } : null);
      case '#editar':     return vistaNueva(v, decodeURIComponent(param || ''));
      case '#calendario': return vistaCalendario(v);
      case '#clientes':   return vistaClientes(v);
      case '#aseo':       return vistaAseo(v);
      case '#mas':        return vistaMas(v);
      default:            return vistaHoy(v);
    }
  }

  window.addEventListener('hashchange', () => {
    if (_trasRetroceso) { const f = _trasRetroceso; _trasRetroceso = null; f(); return; }
    if (!$('#sheet').hidden && !location.hash.includes('~sheet')) {
      cerrarSheet(true);
      /* Atrás solo cierra la hoja; si se navegó a otra pantalla, hay que mostrarla */
      if (location.hash === _hashHoja) return;
    }
    if (location.hash.includes('~sheet')) return;
    render();
    window.scrollTo(0, 0);
  });

  /* ================================================
     LOGIN
     ================================================ */
  function mostrarLogin() {
    $('#app').hidden = true;
    $('#login').hidden = false;
    $('#lg-toggle').onclick = () => {
      const p = $('#lg-pass');
      p.type = p.type === 'password' ? 'text' : 'password';
      $('#lg-toggle').textContent = p.type === 'password' ? '👁️' : '🙈';
    };
    $('#login-form').onsubmit = e => {
      e.preventDefault();
      const u = $('#lg-user').value.trim(), p = $('#lg-pass').value;
      if (!u || !p) { $('#login-alert').innerHTML = '<div class="alert alert-error">Ingresa usuario y contraseña.</div>'; return; }
      const res = AUTH.login(u, p);
      if (!res.success) {
        $('#login-alert').innerHTML = `<div class="alert alert-error">${esc(res.error || 'Credenciales incorrectas.')}</div>`;
        $('#lg-pass').value = ''; $('#lg-pass').focus(); vibrar();
        return;
      }
      iniciarApp();
    };
  }

  function iniciarApp() {
    state.session = AUTH.getSession();
    $('#login').hidden = true;
    $('#app').hidden = false;
    tabs();
    $('#btn-refresh').onclick = async () => { await cargarReservas(true); render(); };
    $('#btn-back').onclick = () => history.length > 1 ? history.back() : irA('#hoy');
    if (!location.hash) history.replaceState(null, '', '#hoy');
    render();
  }

  /* Cada minuto (y al volver a la app) trae lo que se registró en el computador.
     No refresca mientras se llena una reserva, hay una hoja abierta o se escribe. */
  autoActualizar(async () => {
    await Promise.all([cargarReservas(true), sincronizarClientes()]);
    render();
  }, 60000, () => state.session && $('#sheet').hidden
      && !/^#(nueva|editar)/.test(location.hash)
      && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || ''));
  window.addEventListener('online',  () => { if (state.session) cargarReservas(true).then(render); });

  /* Instalación como app (PWA) */
  let _installEvt = null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); _installEvt = e; });
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  /* Arranque */
  if (AUTH.getSession()) iniciarApp();
  else mostrarLogin();
})();
