const { db, getSettings } = require('./db');

const TZ = 'America/Argentina/Buenos_Aires';

const toMin = t => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const fromMin = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// Fecha y minutos actuales en Argentina, sin depender de la zona horaria del servidor
function nowTZ() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = type => parts.find(p => p.type === type).value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

const dayNumber = date => Date.UTC(...date.split('-').map((n, i) => (i === 1 ? n - 1 : +n))) / 86400000;

function addDays(date, n) {
  return new Date((dayNumber(date) + n) * 86400000).toISOString().slice(0, 10);
}

const weekday = date => new Date(date + 'T12:00:00Z').getUTCDay();

/**
 * Horarios libres para un día y una duración de servicio.
 * - admin: ignora la anticipación mínima y el máximo de días (Merce puede cargar turnos a mano).
 * - excludeId: ignora un turno existente (para reprogramarlo).
 */
function getSlots(date, duration, { admin = false, excludeId = 0 } = {}) {
  const settings = getSettings();
  const now = nowTZ();
  const daysAhead = dayNumber(date) - dayNumber(now.date);

  if (daysAhead < 0) return [];
  if (!admin && daysAhead > Number(settings.max_days_ahead)) return [];
  if (db.prepare('SELECT 1 FROM blocked_dates WHERE date = ?').get(date)) return [];

  const earliest = admin ? now.minutes : now.minutes + Number(settings.min_notice_hours) * 60;

  const times = db.prepare('SELECT time FROM schedule_slots WHERE weekday = ? ORDER BY time').all(weekday(date));
  const busy = db.prepare(
    `SELECT time, duration FROM appointments
     WHERE date = ? AND status IN ('pendiente', 'confirmado') AND id != ?`
  ).all(date, excludeId).map(a => [toMin(a.time), toMin(a.time) + a.duration]);

  // Cada horario fijo se ofrece si ya no pasó y no se superpone con otro turno
  return times.map(r => r.time).filter(t => {
    const s = toMin(t);
    if (daysAhead * 1440 + s < earliest) return false;
    return !busy.some(([bs, be]) => s < be && s + duration > bs);
  });
}

module.exports = { getSlots, nowTZ, addDays, weekday, toMin, fromMin, TZ };
