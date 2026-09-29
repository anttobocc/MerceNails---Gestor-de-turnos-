const express = require('express');
const { db, getSettings } = require('../db');
const { getSlots, nowTZ, addDays } = require('../slots');
const { waLink, bookingMessage } = require('../whatsapp');
const { HttpError, isValidDate, isValidTime, cleanText, normalizePhone, rateLimit } = require('../util');

const router = express.Router();

function activeService(id) {
  const service = db.prepare('SELECT * FROM services WHERE id = ? AND active = 1').get(Number(id) || 0);
  if (!service) throw new HttpError(404, 'Servicio no encontrado');
  return service;
}

router.get('/config', (req, res) => {
  const s = getSettings();
  res.json({
    business_name: s.business_name,
    whatsapp: s.whatsapp,
    address: s.address,
    maps_url: s.maps_url,
    instagram: s.instagram,
  });
});

router.get('/services', (req, res) => {
  res.json(
    db.prepare('SELECT id, name, description, price, duration, icon FROM services WHERE active = 1 ORDER BY sort, id').all()
  );
});

// Próximos días con indicación de si hay lugar para el servicio elegido
router.get('/days', (req, res) => {
  const service = activeService(req.query.service_id);
  const today = nowTZ().date;
  const max = Number(getSettings().max_days_ahead);
  const days = [];
  for (let i = 0; i <= max; i++) {
    const date = addDays(today, i);
    days.push({ date, available: getSlots(date, service.duration).length > 0 });
  }
  res.json(days);
});

router.get('/slots', (req, res) => {
  const service = activeService(req.query.service_id);
  if (!isValidDate(req.query.date)) throw new HttpError(400, 'Fecha inválida');
  res.json(getSlots(req.query.date, service.duration));
});

router.post('/appointments', rateLimit({ windowMs: 15 * 60000, max: 6 }), (req, res) => {
  const { service_id, date, time } = req.body ?? {};
  const name = cleanText(req.body?.name, 60);
  const phone = normalizePhone(req.body?.phone);

  const service = activeService(service_id);
  if (!isValidDate(date) || !isValidTime(time)) throw new HttpError(400, 'Fecha u horario inválido');
  if (name.length < 2) throw new HttpError(400, 'Ingresá tu nombre');
  if (!phone) throw new HttpError(400, 'Ingresá un número de WhatsApp válido');

  // Se vuelve a verificar en el servidor: el horario pudo haberse ocupado mientras la clienta elegía
  if (!getSlots(date, service.duration).includes(time)) {
    throw new HttpError(409, 'Ese horario ya no está disponible. Elegí otro, por favor.');
  }

  const { lastInsertRowid } = db.prepare(
    `INSERT INTO appointments (service_id, service_name, price, duration, date, time, client_name, client_phone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(service.id, service.name, service.price, service.duration, date, time, name, phone);

  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(Number(lastInsertRowid));
  const settings = getSettings();

  res.status(201).json({
    appointment: {
      id: appt.id,
      service_name: appt.service_name,
      price: appt.price,
      duration: appt.duration,
      date: appt.date,
      time: appt.time,
      client_name: appt.client_name,
      status: appt.status,
    },
    whatsapp_url: waLink(settings.whatsapp, bookingMessage(appt, settings.business_name)),
  });
});

module.exports = router;
