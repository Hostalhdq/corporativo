/* ====================================================
   HOSTAL HDQ — Google Apps Script
   Pegar este código completo en Apps Script
   Maneja dos hojas: "Reservas" y "Clientes"
   ==================================================== */

/* ──────────────────────────────────────────────────
   CONFIGURACIÓN
   ────────────────────────────────────────────────── */
const HOJA_RESERVAS  = 'Reservas';
const HOJA_CLIENTES  = 'Clientes';

const CABECERAS_RESERVAS = [
  'ID',
  'Estado',
  'Origen',
  'Registrado Por',
  'Cliente / Empresa',
  'Huésped',
  'RUT',
  'Email',
  'Teléfono',
  'Check-in',
  'Check-out',
  'Noches',
  'Habitaciones',
  'N° Desayunos',
  'Subtotal Hab.',
  'Subtotal Desayunos',
  'Descuento $',
  'Motivo Descuento',
  'Total CLP',
  'Fecha Reserva',
  'Comentarios',
  '_json'
];

const CABECERAS_CLIENTES = [
  'ID',
  'Nombre',
  'Empresa',
  'RUT',
  'Email',
  'Teléfono',
  'Notas',
  'Fecha Registro',
  'Fecha Actualización',
  '_json'
];

/* ──────────────────────────────────────────────────
   ENDPOINTS GET
   ────────────────────────────────────────────────── */
function doGet(e) {
  try {
    const action = (e.parameter.action || '').trim();

    if (action === 'getAll')           return resp(getAllReservas());
    if (action === 'getClientes')      return resp(getAllClientes());
    if (action === 'updateEstado')     return resp(updateEstado(e.parameter.id, e.parameter.estado));
    if (action === 'getDisponibilidad') return resp(getDisponibilidad(e.parameter.checkin, e.parameter.checkout));
    if (action === 'ping')             return resp({ ok: true, mensaje: 'Hostal HDQ API activa ✅' });

    return resp({ ok: false, error: 'Acción no reconocida: ' + action });

  } catch (err) {
    return resp({ ok: false, error: err.toString() });
  }
}

/* ──────────────────────────────────────────────────
   ENDPOINTS POST
   ────────────────────────────────────────────────── */
function doPost(e) {
  try {
    const body   = JSON.parse(e.postData.contents);
    const action = (body.action || '').trim();

    if (action === 'save')          return resp(guardarReserva(body.reserva));
    if (action === 'updateEstado')  return resp(updateEstado(body.id, body.estado));
    if (action === 'saveCliente')   return resp(guardarCliente(body.cliente));

    return resp({ ok: false, error: 'Acción no reconocida: ' + action });

  } catch (err) {
    return resp({ ok: false, error: err.toString() });
  }
}

function resp(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ──────────────────────────────────────────────────
   OBTENER / CREAR HOJA RESERVAS
   ────────────────────────────────────────────────── */
function getHojaReservas() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  let hoja   = ss.getSheetByName(HOJA_RESERVAS);

  if (!hoja) {
    hoja = ss.insertSheet(HOJA_RESERVAS);

    const rango = hoja.getRange(1, 1, 1, CABECERAS_RESERVAS.length);
    rango.setValues([CABECERAS_RESERVAS]);
    rango.setFontWeight('bold');
    rango.setBackground('#1e3a5f');
    rango.setFontColor('#ffffff');
    hoja.setFrozenRows(1);
    hoja.hideColumns(CABECERAS_RESERVAS.length);

    hoja.setColumnWidth(1, 130);
    hoja.setColumnWidth(2, 100);
    hoja.setColumnWidth(3, 120);
    hoja.setColumnWidth(6, 160);
    hoja.setColumnWidth(7, 110);
    hoja.setColumnWidth(8, 190);
    hoja.setColumnWidth(10, 90);
    hoja.setColumnWidth(11, 90);
    hoja.setColumnWidth(13, 200);
    hoja.setColumnWidth(19, 100);
  }

  return hoja;
}

/* ──────────────────────────────────────────────────
   OBTENER / CREAR HOJA CLIENTES
   ────────────────────────────────────────────────── */
function getHojaClientes() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  let hoja   = ss.getSheetByName(HOJA_CLIENTES);

  if (!hoja) {
    hoja = ss.insertSheet(HOJA_CLIENTES);

    const rango = hoja.getRange(1, 1, 1, CABECERAS_CLIENTES.length);
    rango.setValues([CABECERAS_CLIENTES]);
    rango.setFontWeight('bold');
    rango.setBackground('#065f46');
    rango.setFontColor('#ffffff');
    hoja.setFrozenRows(1);
    hoja.hideColumns(CABECERAS_CLIENTES.length);

    hoja.setColumnWidth(1, 140);   // ID
    hoja.setColumnWidth(2, 180);   // Nombre
    hoja.setColumnWidth(3, 160);   // Empresa
    hoja.setColumnWidth(4, 110);   // RUT
    hoja.setColumnWidth(5, 190);   // Email
    hoja.setColumnWidth(6, 120);   // Teléfono
    hoja.setColumnWidth(7, 220);   // Notas
    hoja.setColumnWidth(8, 130);   // Fecha Registro
    hoja.setColumnWidth(9, 130);   // Fecha Actualización
  }

  return hoja;
}

/* ──────────────────────────────────────────────────
   GUARDAR / ACTUALIZAR CLIENTE
   Si el ID ya existe → actualiza la fila.
   Si no existe      → agrega fila nueva.
   ────────────────────────────────────────────────── */
function guardarCliente(c) {
  if (!c) return { ok: false, error: 'Datos de cliente vacíos.' };

  const hoja  = getHojaClientes();
  const datos = hoja.getDataRange().getValues();

  const fila = [
    c.id               || '',
    c.nombre           || '',
    c.empresa          || '',
    c.rut              || '',
    c.email            || '',
    c.telefono         || '',
    c.notas            || '',
    c.fecha_registro   ? new Date(c.fecha_registro).toLocaleString('es-CL') : new Date().toLocaleString('es-CL'),
    c.fecha_actualizado ? new Date(c.fecha_actualizado).toLocaleString('es-CL') : '',
    JSON.stringify(c)
  ];

  /* Buscar fila existente por ID */
  for (let i = 1; i < datos.length; i++) {
    if (String(datos[i][0]) === String(c.id)) {
      /* Actualizar fila existente */
      hoja.getRange(i + 1, 1, 1, fila.length).setValues([fila]);
      hoja.getRange(i + 1, 1, 1, CABECERAS_CLIENTES.length - 1).setBackground('#f0fdf4');
      return { ok: true, accion: 'actualizado', id: c.id };
    }
  }

  /* Cliente nuevo → agregar fila */
  hoja.appendRow(fila);
  const ultimaFila = hoja.getLastRow();
  if (ultimaFila % 2 === 0) {
    hoja.getRange(ultimaFila, 1, 1, CABECERAS_CLIENTES.length - 1)
        .setBackground('#ecfdf5');
  }

  return { ok: true, accion: 'creado', id: c.id };
}

/* ──────────────────────────────────────────────────
   OBTENER TODOS LOS CLIENTES
   ────────────────────────────────────────────────── */
function getAllClientes() {
  const hoja  = getHojaClientes();
  const datos = hoja.getDataRange().getValues();

  if (datos.length <= 1) return { ok: true, clientes: [] };

  const jsonCol = CABECERAS_CLIENTES.length - 1;

  const clientes = datos.slice(1).map(fila => {
    try {
      return JSON.parse(fila[jsonCol] || '{}');
    } catch {
      return {
        id:       fila[0],
        nombre:   fila[1],
        empresa:  fila[2],
        rut:      fila[3],
        email:    fila[4],
        telefono: fila[5],
        notas:    fila[6]
      };
    }
  }).filter(c => c.id);

  return { ok: true, clientes };
}

/* ──────────────────────────────────────────────────
   GUARDAR RESERVA
   ────────────────────────────────────────────────── */
function guardarReserva(r) {
  if (!r) return { ok: false, error: 'Datos de reserva vacíos.' };

  const hoja = getHojaReservas();
  const id   = r.id || ('HDQ-' + Date.now().toString(36).toUpperCase());
  r.id       = id;
  r.estado   = r.estado || 'pendiente';

  const habTexto = (r.habitaciones || [])
    .map(h => 'Hab.' + h.numero + ' (' + h.tipo + ')')
    .join(' | ');

  const fila = [
    id,
    r.estado,
    r.origen             || 'Web',
    r.registrado_por     || '',
    r.cliente            || '',
    r.huesped_nombre     || '',
    r.huesped_rut        || '',
    r.huesped_email      || '',
    r.huesped_telefono   || '',
    r.checkin            || '',
    r.checkout           || '',
    r.noches             || 0,
    habTexto,
    r.desayunos?.cantidad      || 0,
    r.subtotal_habs            || 0,
    r.subtotal_desayunos       || 0,
    r.descuento?.monto         || 0,
    r.descuento?.motivo        || '',
    r.total                    || 0,
    new Date().toLocaleString('es-CL'),
    r.comentarios              || '',
    JSON.stringify(r)
  ];

  hoja.appendRow(fila);

  const ultimaFila = hoja.getLastRow();
  [15, 16, 17, 19].forEach(col => {
    hoja.getRange(ultimaFila, col).setNumberFormat('$#,##0');
  });

  if (ultimaFila % 2 === 0) {
    hoja.getRange(ultimaFila, 1, 1, CABECERAS_RESERVAS.length - 1)
        .setBackground('#f0f4f8');
  }

  /* Email al huésped si viene de Online y tiene email */
  if (r.origen === 'Online' && r.huesped_email) {
    try { enviarEmailRecibo(r); } catch(ex) {}
  }
  /* Email a David */
  try { enviarNotificacionEmail(r); } catch(ex) {}

  return { ok: true, id };
}

/* ──────────────────────────────────────────────────
   OBTENER TODAS LAS RESERVAS
   ────────────────────────────────────────────────── */
function getAllReservas() {
  const hoja  = getHojaReservas();
  const datos = hoja.getDataRange().getValues();

  if (datos.length <= 1) return { ok: true, reservas: [] };

  const jsonCol = CABECERAS_RESERVAS.length - 1;

  const reservas = datos.slice(1).map(fila => {
    try {
      const obj  = JSON.parse(fila[jsonCol] || '{}');
      obj.estado = fila[1] || obj.estado || 'pendiente';
      obj.id     = fila[0] || obj.id;
      return obj;
    } catch {
      return {
        id:               fila[0],
        estado:           fila[1],
        origen:           fila[2],
        registrado_por:   fila[3],
        cliente:          fila[4],
        huesped_nombre:   fila[5],
        huesped_rut:      fila[6],
        huesped_email:    fila[7],
        huesped_telefono: fila[8],
        checkin:          fila[9],
        checkout:         fila[10],
        noches:           fila[11],
        total:            fila[18],
        fecha_reserva:    fila[19]
      };
    }
  }).filter(r => r.id);

  return { ok: true, reservas };
}

/* ──────────────────────────────────────────────────
   DISPONIBILIDAD — devuelve números de habitación ocupados
   para el rango de fechas solicitado
   ────────────────────────────────────────────────── */
function getDisponibilidad(checkin, checkout) {
  if (!checkin || !checkout) return { ok: false, error: 'Fechas requeridas.' };
  const hoja  = getHojaReservas();
  const datos = hoja.getDataRange().getValues();
  const jsonCol = CABECERAS_RESERVAS.length;
  const ocupadas = [];
  for (let i = 1; i < datos.length; i++) {
    const estado = String(datos[i][1] || '');
    if (estado === 'cancelada') continue;
    try {
      const obj = JSON.parse(datos[i][jsonCol - 1] || '{}');
      const ci  = String(obj.checkin  || '').slice(0, 10);
      const co  = String(obj.checkout || '').slice(0, 10);
      if (!ci || !co) continue;
      /* Solapan si ci < checkout Y co > checkin */
      if (ci < checkout && co > checkin) {
        (obj.habitaciones || []).forEach(h => {
          if (h.numero && h.numero !== 'TBD') ocupadas.push(String(h.numero));
        });
      }
    } catch(e) {}
  }
  return { ok: true, ocupadas };
}

/* ──────────────────────────────────────────────────
   CAMBIAR ESTADO DE RESERVA
   ────────────────────────────────────────────────── */
function updateEstado(id, estado) {
  if (!id || !estado) return { ok: false, error: 'Parámetros faltantes.' };

  const hoja  = getHojaReservas();
  const datos = hoja.getDataRange().getValues();

  for (let i = 1; i < datos.length; i++) {
    if (String(datos[i][0]) === String(id)) {
      hoja.getRange(i + 1, 2).setValue(estado);

      const colores = { pendiente: '#fef9e7', confirmada: '#eafaf1', cancelada: '#fdedec' };
      const bg = colores[estado];
      if (bg) hoja.getRange(i + 1, 1, 1, CABECERAS_RESERVAS.length - 1).setBackground(bg);

      /* Actualizar también el _json con el nuevo estado */
      const jsonCol = CABECERAS_RESERVAS.length;
      try {
        const obj = JSON.parse(datos[i][jsonCol - 1] || '{}');
        obj.estado = estado;
        hoja.getRange(i + 1, jsonCol).setValue(JSON.stringify(obj));
      } catch (e) {}

      /* Email de confirmación al huésped */
      if (estado === 'confirmada') {
        try {
          const objConf = JSON.parse(datos[i][jsonCol - 1] || '{}');
          objConf.estado = 'confirmada';
          objConf.id = id;
          if (objConf.huesped_email) enviarEmailConfirmacion(objConf);
        } catch(ex) {}
      }

      return { ok: true };
    }
  }

  return { ok: false, error: 'No se encontró la reserva: ' + id };
}

/* ──────────────────────────────────────────────────
   EMAIL — Notificación interna a David
   ────────────────────────────────────────────────── */
function enviarNotificacionEmail(reserva) {
  const destino = 'david@hostalhdq.cl';
  const asunto  = '🏨 Nueva Reserva HDQ — ' + reserva.id;
  const cuerpo  = `
Nueva reserva en Hostal HDQ.

ID:           ${reserva.id}
Origen:       ${reserva.origen}
Huésped:      ${reserva.huesped_nombre}
RUT:          ${reserva.huesped_rut || '—'}
Email:        ${reserva.huesped_email}
Teléfono:     ${reserva.huesped_telefono}
Check-in:     ${reserva.checkin}
Check-out:    ${reserva.checkout}
Noches:       ${reserva.noches}
Habitaciones: ${(reserva.habitaciones||[]).map(h=>'Hab.'+h.numero).join(', ')}
Desayunos:    ${reserva.desayunos?.cantidad || 0} por día
Total:        $${Number(reserva.total||0).toLocaleString('es-CL')} CLP
Comentarios:  ${reserva.comentarios || '—'}
  `;
  MailApp.sendEmail(destino, asunto, cuerpo);
}

/* ──────────────────────────────────────────────────
   EMAIL — Recibo al huésped (solicitud recibida)
   ────────────────────────────────────────────────── */
function enviarEmailRecibo(r) {
  const destino = r.huesped_email;
  if (!destino) return;
  const asunto = '✅ Solicitud recibida — Hostal HDQ | ' + r.id;
  const tipo   = (r.habitaciones || []).map(h => h.tipo).join(', ') || '—';
  const total  = '$' + Number(r.total || 0).toLocaleString('es-CL') + ' CLP';
  const cuerpo =
    'Hola ' + (r.huesped_nombre || 'estimado/a') + ',\n\n' +
    'Hemos recibido tu solicitud de reserva en Hostal HDQ Concepción.\n\n' +
    '── DETALLES DE TU SOLICITUD ──\n' +
    'ID:           ' + r.id + '\n' +
    'Check-in:     ' + r.checkin + '\n' +
    'Check-out:    ' + r.checkout + '\n' +
    'Noches:       ' + r.noches + '\n' +
    'Habitación:   ' + tipo + '\n' +
    'Total est.:   ' + total + '\n\n' +
    '⏳ ESTADO: PENDIENTE DE CONFIRMACIÓN\n\n' +
    'Tu reserva será revisada y recibirás un email de confirmación a la brevedad.\n' +
    'Guarda este ID para cualquier consulta: ' + r.id + '\n\n' +
    'Hostal HDQ Concepción\n' +
    '📞 +56 9 8775 2280\n' +
    '📧 david@hostalhdq.cl\n\n' +
    '(Mensaje automático — no respondas a este correo)';
  MailApp.sendEmail(destino, asunto, cuerpo);
}

/* ──────────────────────────────────────────────────
   EMAIL — Confirmación al huésped (reserva confirmada)
   ────────────────────────────────────────────────── */
function enviarEmailConfirmacion(r) {
  const destino = r.huesped_email;
  if (!destino) return;
  const asunto = '🏨 Reserva CONFIRMADA — Hostal HDQ | ' + r.id;
  const tipo   = (r.habitaciones || []).map(h => h.tipo).join(', ') || '—';
  const total  = '$' + Number(r.total || 0).toLocaleString('es-CL') + ' CLP';
  const cuerpo =
    'Hola ' + (r.huesped_nombre || 'estimado/a') + ',\n\n' +
    '¡Tu reserva en Hostal HDQ Concepción ha sido CONFIRMADA! 🎉\n\n' +
    '── DETALLES DE TU RESERVA ──\n' +
    'ID:           ' + r.id + '\n' +
    'Check-in:     ' + r.checkin + '\n' +
    'Check-out:    ' + r.checkout + '\n' +
    'Noches:       ' + r.noches + '\n' +
    'Habitación:   ' + tipo + '\n' +
    'Total:        ' + total + '\n\n' +
    '── INFORMACIÓN DEL HOSTAL ──\n' +
    '📞 +56 9 8775 2280\n' +
    '📧 david@hostalhdq.cl\n\n' +
    '¡Te esperamos en Hostal HDQ!\n\n' +
    '(Mensaje automático — no respondas a este correo)';
  MailApp.sendEmail(destino, asunto, cuerpo);
}
