/* ====================================================
   HOSTAL HDQ — Google Apps Script
   Pegar este código completo en Apps Script
   ==================================================== */

const HOJA_NOMBRE = 'Reservas';

/* ──────────────────────────────────────────────────
   CABECERAS de la hoja (columnas visibles en Sheets)
   ────────────────────────────────────────────────── */
const CABECERAS = [
  'ID',
  'Estado',
  'Origen',
  'Registrado Por',
  'Cliente / Empresa',
  'Huésped',
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
  '_json'           // ← columna oculta: datos completos para la app
];

/* ──────────────────────────────────────────────────
   ENDPOINTS
   ────────────────────────────────────────────────── */
function doGet(e) {
  try {
    const action = (e.parameter.action || '').trim();

    if (action === 'getAll') {
      return resp(getAll());
    }
    if (action === 'updateEstado') {
      return resp(updateEstado(e.parameter.id, e.parameter.estado));
    }
    if (action === 'ping') {
      return resp({ ok: true, mensaje: 'Hostal HDQ API activa ✅' });
    }

    return resp({ ok: false, error: 'Acción no reconocida: ' + action });

  } catch (err) {
    return resp({ ok: false, error: err.toString() });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = (body.action || '').trim();

    if (action === 'save') {
      return resp(guardarReserva(body.reserva));
    }
    if (action === 'updateEstado') {
      return resp(updateEstado(body.id, body.estado));
    }

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
   OBTENER / CREAR HOJA
   ────────────────────────────────────────────────── */
function getHoja() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let hoja = ss.getSheetByName(HOJA_NOMBRE);

  if (!hoja) {
    hoja = ss.insertSheet(HOJA_NOMBRE);

    // Encabezados con formato
    const rango = hoja.getRange(1, 1, 1, CABECERAS.length);
    rango.setValues([CABECERAS]);
    rango.setFontWeight('bold');
    rango.setBackground('#1e3a5f');
    rango.setFontColor('#ffffff');
    hoja.setFrozenRows(1);

    // Ocultar columna _json (última)
    hoja.hideColumns(CABECERAS.length);

    // Anchos de columna legibles
    hoja.setColumnWidth(1, 130);   // ID
    hoja.setColumnWidth(2, 100);   // Estado
    hoja.setColumnWidth(3, 120);   // Origen
    hoja.setColumnWidth(6, 160);   // Huésped
    hoja.setColumnWidth(7, 190);   // Email
    hoja.setColumnWidth(9, 90);    // Check-in
    hoja.setColumnWidth(10, 90);   // Check-out
    hoja.setColumnWidth(12, 200);  // Habitaciones
    hoja.setColumnWidth(18, 100);  // Total
  }

  return hoja;
}

/* ──────────────────────────────────────────────────
   GUARDAR RESERVA
   ────────────────────────────────────────────────── */
function guardarReserva(r) {
  if (!r) return { ok: false, error: 'Datos de reserva vacíos.' };

  const hoja = getHoja();
  const id   = r.id || ('HDQ-' + Date.now().toString(36).toUpperCase());
  r.id       = id;
  r.estado   = r.estado || 'pendiente';

  const habTexto = (r.habitaciones || [])
    .map(h => 'Hab.' + h.numero + ' (' + h.tipo + ')')
    .join(' | ');

  const fila = [
    id,
    'pendiente',
    r.origen            || 'Web',
    r.registrado_por    || '',
    r.cliente           || '',
    r.huesped_nombre    || '',
    r.huesped_email     || '',
    r.huesped_telefono  || '',
    r.checkin           || '',
    r.checkout          || '',
    r.noches            || 0,
    habTexto,
    r.desayunos?.cantidad     || 0,
    r.subtotal_habs           || 0,
    r.subtotal_desayunos      || 0,
    r.descuento?.monto        || 0,
    r.descuento?.motivo       || '',
    r.total                   || 0,
    new Date().toLocaleString('es-CL'),
    r.comentarios             || '',
    JSON.stringify(r)         // columna _json
  ];

  hoja.appendRow(fila);

  // Formato de moneda en columnas de precio
  const ultimaFila = hoja.getLastRow();
  [14, 15, 16, 18].forEach(col => {
    hoja.getRange(ultimaFila, col)
        .setNumberFormat('$#,##0');
  });

  // Color de fondo alternado
  if (ultimaFila % 2 === 0) {
    hoja.getRange(ultimaFila, 1, 1, CABECERAS.length - 1)
        .setBackground('#f0f4f8');
  }

  return { ok: true, id };
}

/* ──────────────────────────────────────────────────
   OBTENER TODAS LAS RESERVAS (devuelve JSON completo)
   ────────────────────────────────────────────────── */
function getAll() {
  const hoja = getHoja();
  const datos = hoja.getDataRange().getValues();

  if (datos.length <= 1) return { ok: true, reservas: [] };

  const jsonCol = CABECERAS.length - 1; // índice columna _json

  const reservas = datos.slice(1).map(fila => {
    try {
      // Reconstruir desde columna _json
      const obj = JSON.parse(fila[jsonCol] || '{}');
      // Sobreescribir estado con el valor actual de la hoja
      // (puede haber sido editado manualmente o desde el panel)
      obj.estado = fila[1] || obj.estado || 'pendiente';
      obj.id     = fila[0] || obj.id;
      return obj;
    } catch (e) {
      // Fallback: construir desde columnas visibles
      return {
        id:              fila[0],
        estado:          fila[1],
        origen:          fila[2],
        registrado_por:  fila[3],
        cliente:         fila[4],
        huesped_nombre:  fila[5],
        huesped_email:   fila[6],
        huesped_telefono:fila[7],
        checkin:         fila[8],
        checkout:        fila[9],
        noches:          fila[10],
        total:           fila[17],
        fecha_reserva:   fila[18]
      };
    }
  }).filter(r => r.id); // descartar filas vacías

  return { ok: true, reservas };
}

/* ──────────────────────────────────────────────────
   CAMBIAR ESTADO
   ────────────────────────────────────────────────── */
function updateEstado(id, estado) {
  if (!id || !estado) return { ok: false, error: 'Parámetros faltantes.' };

  const hoja  = getHoja();
  const datos = hoja.getDataRange().getValues();
  const colEstado = 2; // columna B (índice 1 → columna 2)

  for (let i = 1; i < datos.length; i++) {
    if (String(datos[i][0]) === String(id)) {
      hoja.getRange(i + 1, colEstado).setValue(estado);

      // Color de fila según estado
      const colores = {
        pendiente:  '#fef9e7',
        confirmada: '#eafaf1',
        cancelada:  '#fdedec'
      };
      const bg = colores[estado] || null;
      if (bg) {
        hoja.getRange(i + 1, 1, 1, CABECERAS.length - 1).setBackground(bg);
      }

      return { ok: true };
    }
  }

  return { ok: false, error: 'No se encontró la reserva: ' + id };
}

/* ──────────────────────────────────────────────────
   TRIGGER: Notificación por email cuando llega reserva nueva
   (Opcional — activar en triggers de Apps Script)
   ────────────────────────────────────────────────── */
function enviarNotificacionEmail(reserva) {
  const destino = 'david@hostalhdq.cl'; // ← Cambia por tu email real
  const asunto  = '🏨 Nueva Reserva HDQ — ' + reserva.id;

  const cuerpo = `
Nueva reserva recibida en Hostal HDQ.

ID:          ${reserva.id}
Origen:      ${reserva.origen}
Huésped:     ${reserva.huesped_nombre}
Email:       ${reserva.huesped_email}
Teléfono:    ${reserva.huesped_telefono}
Check-in:    ${reserva.checkin}
Check-out:   ${reserva.checkout}
Noches:      ${reserva.noches}
Habitaciones:${(reserva.habitaciones||[]).map(h=>'Hab.'+h.numero).join(', ')}
Desayunos:   ${reserva.desayunos?.cantidad || 0} por día
Total:       $${Number(reserva.total||0).toLocaleString('es-CL')} CLP
Comentarios: ${reserva.comentarios || '—'}
  `;

  MailApp.sendEmail(destino, asunto, cuerpo);
}
