const express = require('express');
const { db, getSettings, getSetting, setSetting } = require('../db');
const { getSlots, nowTZ } = require('../slots');
const auth = require('../auth');
const { HttpError, isValidDate, isValidTime, cleanText, normalizePhone, rateLimit, STATUSES } = require('../util');

const router = express.Router();

/* ===== Sesión ===== */

router.post('/login', rateLimit({ windowMs: 15 * 60000, max: 10 }), (req, res) => {
  const user = cleanText(req.body?.user, 60).toLowerCase();
  const ok = user === getSetting('admin_user').toLowerCase()
    && auth.verifyPassword(req.body?.password ?? '', getSetting('admin_password_hash'));
  if (!ok) throw new HttpError(401, 'Usuario o contraseña incorrectos');
  auth.createSession(req, res);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  auth.destroySession(req, res);
  res.json({ ok: true });
});

router.use(auth.requireAdmin);

router.get('/me', (req, res) => {
  const s = getSettings();
  res.json({ name: s.admin_name, user: s.admin_user, today: nowTZ().date });
});

router.put('/password', (req, res) => {
  const { current, next } = req.body ?? {};
  if (!auth.verifyPassword(current ?? '', getSetting('admin_password_hash'))) {
    throw new HttpError(400, 'La contraseña actual no es correcta');
  }
  if (typeof next !== 'string' || next.length < 8) throw new HttpError(400, 'La nueva contraseña debe tener al menos 8 caracteres');
  setSetting('admin_password_hash', auth.hashPassword(next));
  res.json({ ok: true });
});

/* ===== Turnos ===== */

const getAppointment = id => {
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(Number(id) || 0);
  if (!appt) throw new HttpError(404, 'Turno no encontrado');
  return appt;
};

router.get('/appointments', (req, res) => {
  const where = [];
  const params = [];
  if (isValidDate(req.query.from)) { where.push('date >= ?'); params.push(req.query.from); }
  if (isValidDate(req.query.to)) { where.push('date <= ?'); params.push(req.query.to); }
  const statuses = String(req.query.status ?? '').split(',').filter(s => STATUSES.includes(s));
  if (statuses.length) { where.push(`status IN (${statuses.map(() => '?').join(',')})`); params.push(...statuses); }
  const sql = `SELECT * FROM appointments ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY date, time`;
  res.json(db.prepare(sql).all(...params));
});

// Con ?exclude=ID (reprogramar) se usa la duración guardada en ese turno
router.get('/slots', (req, res) => {
  if (!isValidDate(req.query.date)) throw new HttpError(400, 'Fecha inválida');
  const excludeId = Number(req.query.exclude) || 0;
  const source = excludeId
    ? db.prepare('SELECT duration FROM appointments WHERE id = ?').get(excludeId)
    : db.prepare('SELECT duration FROM services WHERE id = ?').get(Number(req.query.service_id) || 0);
  if (!source) throw new HttpError(404, 'Servicio no encontrado');
  res.json(getSlots(req.query.date, source.duration, { admin: true, excludeId }));
});

// Turno cargado a mano por Merce (por ejemplo, si le escribieron por Instagram)
router.post('/appointments', (req, res) => {
  const { service_id, date, time, status = 'confirmado' } = req.body ?? {};
  const name = cleanText(req.body?.name, 60);
  const phone = normalizePhone(req.body?.phone);
  const notes = cleanText(req.body?.notes, 500);
  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(Number(service_id) || 0);

  if (!service) throw new HttpError(400, 'Elegí un servicio');
  if (!isValidDate(date) || !isValidTime(time)) throw new HttpError(400, 'Fecha u horario inválido');
  if (name.length < 2) throw new HttpError(400, 'Ingresá el nombre de la clienta');
  if (!phone) throw new HttpError(400, 'Ingresá un WhatsApp válido');
  if (!STATUSES.includes(status)) throw new HttpError(400, 'Estado inválido');
  if (!getSlots(date, service.duration, { admin: true }).includes(time)) {
    throw new HttpError(409, 'Ese horario se superpone con otro turno o está fuera del horario de atención');
  }

  const { lastInsertRowid } = db.prepare(
    `INSERT INTO appointments (service_id, service_name, price, duration, date, time, client_name, client_phone, status, notes, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin')`
  ).run(service.id, service.name, service.price, service.duration, date, time, name, phone, status, notes);
  res.status(201).json(getAppointment(lastInsertRowid));
});

router.patch('/appointments/:id', (req, res) => {
  const appt = getAppointment(req.params.id);
  const body = req.body ?? {};
  const next = { status: appt.status, notes: appt.notes, date: appt.date, time: appt.time };

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) throw new HttpError(400, 'Estado inválido');
    next.status = body.status;
  }
  if (body.notes !== undefined) next.notes = cleanText(body.notes, 500);

  // Reprogramar
  if (body.date !== undefined || body.time !== undefined) {
    next.date = body.date ?? appt.date;
    next.time = body.time ?? appt.time;
    if (!isValidDate(next.date) || !isValidTime(next.time)) throw new HttpError(400, 'Fecha u horario inválido');
    const changed = next.date !== appt.date || next.time !== appt.time;
    if (changed && !getSlots(next.date, appt.duration, { admin: true, excludeId: appt.id }).includes(next.time)) {
      throw new HttpError(409, 'Ese horario no está disponible');
    }
  }

  db.prepare('UPDATE appointments SET status = ?, notes = ?, date = ?, time = ? WHERE id = ?')
    .run(next.status, next.notes, next.date, next.time, appt.id);
  res.json(getAppointment(appt.id));
});

/* ===== Servicios ===== */

function readService(body = {}) {
  const service = {
    name: cleanText(body.name, 60),
    description: cleanText(body.description, 200),
    price: Math.round(Number(body.price)),
    duration: Math.round(Number(body.duration)),
    icon: cleanText(body.icon, 20) || 'heart',
    active: body.active === false || body.active === 0 ? 0 : 1,
    sort: Math.round(Number(body.sort)) || 0,
  };
  if (!service.name) throw new HttpError(400, 'El servicio necesita un nombre');
  if (!(service.price >= 0)) throw new HttpError(400, 'Precio inválido');
  if (!(service.duration >= 5 && service.duration <= 600)) throw new HttpError(400, 'La duración debe estar entre 5 y 600 minutos');
  return service;
}

router.get('/services', (req, res) => {
  res.json(db.prepare('SELECT * FROM services ORDER BY sort, id').all());
});

router.post('/services', (req, res) => {
  const s = readService(req.body);
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO services (name, description, price, duration, icon, active, sort) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(s.name, s.description, s.price, s.duration, s.icon, s.active, s.sort);
  res.status(201).json(db.prepare('SELECT * FROM services WHERE id = ?').get(Number(lastInsertRowid)));
});

router.put('/services/:id', (req, res) => {
  const id = Number(req.params.id) || 0;
  const s = readService(req.body);
  const { changes } = db.prepare(
    'UPDATE services SET name = ?, description = ?, price = ?, duration = ?, icon = ?, active = ?, sort = ? WHERE id = ?'
  ).run(s.name, s.description, s.price, s.duration, s.icon, s.active, s.sort, id);
  if (!changes) throw new HttpError(404, 'Servicio no encontrado');
  res.json(db.prepare('SELECT * FROM services WHERE id = ?').get(id));
});

router.delete('/services/:id', (req, res) => {
  const { changes } = db.prepare('DELETE FROM services WHERE id = ?').run(Number(req.params.id) || 0);
  if (!changes) throw new HttpError(404, 'Servicio no encontrado');
  res.json({ ok: true });
});

/* ===== Horarios ===== */

router.get('/schedule', (req, res) => {
  res.json({
    slots: db.prepare('SELECT weekday, time FROM schedule_slots ORDER BY weekday, time').all(),
    blocked: db.prepare('SELECT date, reason FROM blocked_dates WHERE date >= ? ORDER BY date').all(nowTZ().date),
  });
});

router.put('/schedule', (req, res) => {
  const slots = Array.isArray(req.body?.slots) ? req.body.slots : null;
  if (!slots) throw new HttpError(400, 'Faltan los horarios');
  for (const s of slots) {
    if (!(s.weekday >= 0 && s.weekday <= 6) || !isValidTime(s.time)) throw new HttpError(400, `Horario inválido: ${s.time ?? ''}`);
  }
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM schedule_slots');
    const insert = db.prepare('INSERT OR IGNORE INTO schedule_slots (weekday, time) VALUES (?, ?)');
    for (const s of slots) insert.run(s.weekday, s.time);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  res.json({ ok: true });
});

router.post('/blocked', (req, res) => {
  const { date } = req.body ?? {};
  if (!isValidDate(date)) throw new HttpError(400, 'Fecha inválida');
  db.prepare('INSERT OR REPLACE INTO blocked_dates (date, reason) VALUES (?, ?)').run(date, cleanText(req.body.reason, 80));
  res.status(201).json({ ok: true });
});

router.delete('/blocked/:date', (req, res) => {
  db.prepare('DELETE FROM blocked_dates WHERE date = ?').run(req.params.date);
  res.json({ ok: true });
});

/* ===== Configuración ===== */

const EDITABLE_SETTINGS = {
  business_name: 60, admin_name: 40, admin_user: 40, whatsapp: 20, address: 120, maps_url: 300,
  instagram: 60, min_notice_hours: 3, max_days_ahead: 3, wa_confirm_template: 500, wa_reminder_template: 500,
};

router.get('/settings', (req, res) => {
  const s = getSettings();
  res.json(Object.fromEntries(Object.keys(EDITABLE_SETTINGS).map(k => [k, s[k]])));
});

router.put('/settings', (req, res) => {
  const body = req.body ?? {};
  const updates = {};
  for (const [key, max] of Object.entries(EDITABLE_SETTINGS)) {
    if (body[key] === undefined) continue;
    updates[key] = key.endsWith('_template') ? String(body[key]).trim().slice(0, max) : cleanText(body[key], max);
  }
  if (updates.whatsapp !== undefined && !normalizePhone(updates.whatsapp)) throw new HttpError(400, 'Número de WhatsApp inválido');
  if (updates.whatsapp) updates.whatsapp = normalizePhone(updates.whatsapp);
  if (updates.admin_user !== undefined && updates.admin_user.length < 3) throw new HttpError(400, 'El usuario debe tener al menos 3 letras');
  for (const k of ['min_notice_hours', 'max_days_ahead']) {
    if (updates[k] !== undefined && !(Number(updates[k]) >= 0 && Number(updates[k]) <= 365)) throw new HttpError(400, 'Valor inválido');
  }
  if (updates.maps_url && !/^https?:\/\//.test(updates.maps_url)) throw new HttpError(400, 'El link de Maps debe empezar con https://');
  for (const [k, v] of Object.entries(updates)) setSetting(k, v);
  res.json({ ok: true });
});

module.exports = router;
