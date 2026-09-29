const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'mercenails.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS services (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    price       INTEGER NOT NULL DEFAULT 0,
    duration    INTEGER NOT NULL DEFAULT 60,
    icon        TEXT    NOT NULL DEFAULT 'heart',
    active      INTEGER NOT NULL DEFAULT 1,
    sort        INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    service_id   INTEGER REFERENCES services(id) ON DELETE SET NULL,
    service_name TEXT    NOT NULL,
    price        INTEGER NOT NULL,
    duration     INTEGER NOT NULL,
    date         TEXT    NOT NULL,
    time         TEXT    NOT NULL,
    client_name  TEXT    NOT NULL,
    client_phone TEXT    NOT NULL,
    status       TEXT    NOT NULL DEFAULT 'pendiente'
                 CHECK (status IN ('pendiente', 'confirmado', 'realizado', 'cancelado')),
    notes        TEXT    NOT NULL DEFAULT '',
    source       TEXT    NOT NULL DEFAULT 'web',
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date, time);

  -- Horarios fijos de turno por día de la semana (0 = domingo ... 6 = sábado)
  DROP TABLE IF EXISTS availability;
  CREATE TABLE IF NOT EXISTS schedule_slots (
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    time    TEXT    NOT NULL,
    PRIMARY KEY (weekday, time)
  );

  -- Días sin atención (feriados, vacaciones)
  CREATE TABLE IF NOT EXISTS blocked_dates (
    date   TEXT PRIMARY KEY,
    reason TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL
  );
`);

const DEFAULT_SETTINGS = {
  business_name: 'Merce Nails',
  admin_name: 'Merce',
  admin_user: 'merce',
  whatsapp: '5493790000000',
  address: 'Valparahizo 2878, Corrientes',
  maps_url: 'https://www.google.com/maps/search/?api=1&query=Valparahizo%202878%2C%20Corrientes%2C%20Corrientes',
  instagram: '',
  min_notice_hours: '2',
  max_days_ahead: '30',
  wa_confirm_template:
    'Hola {nombre}! 💅 Te confirmo tu turno de {servicio} para el {dia} {fecha} a las {hora}. ¡Te espero! — Merce Nails',
  wa_reminder_template:
    'Hola {nombre}! Te recuerdo tu turno de {servicio} mañana {fecha} a las {hora}. Si no podés venir avisame. 💖',
};

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(key, value);

// Datos de ejemplo la primera vez: servicios y horarios que Merce puede editar desde el panel
if (db.prepare('SELECT COUNT(*) AS n FROM services').get().n === 0) {
  const insert = db.prepare(
    'INSERT INTO services (name, description, price, duration, icon, sort) VALUES (?, ?, ?, ?, ?, ?)'
  );
  [
    ['Soft Gel', 'Uñas resistentes, naturales y elegantes.', 18000, 120, 'polish'],
    ['Soft Acrílico', 'Diseños personalizados a tu gusto.', 20000, 150, 'nail'],
    ['Capping', 'Más firmeza y durabilidad sobre tu uña natural.', 15000, 90, 'sparkles'],
    ['Semipermanente', 'Color y brillo por más tiempo.', 10000, 60, 'heart'],
    ['Dipping', 'Una técnica innovadora y de larga duración.', 16000, 90, 'flower'],
    ['Nail Art', 'Diseños a mano alzada, piedras y detalles (por uña).', 1500, 30, 'brush'],
  ].forEach((s, i) => insert.run(...s, i));
}

// Lunes a viernes: 14, 17 y 20 hs. Sábados: 10, 14, 17 y 20 hs.
if (db.prepare('SELECT COUNT(*) AS n FROM schedule_slots').get().n === 0) {
  const insert = db.prepare('INSERT INTO schedule_slots (weekday, time) VALUES (?, ?)');
  for (let d = 1; d <= 5; d++) ['14:00', '17:00', '20:00'].forEach(t => insert.run(d, t));
  ['10:00', '14:00', '17:00', '20:00'].forEach(t => insert.run(6, t));
}
db.prepare("DELETE FROM settings WHERE key = 'slot_interval'").run();

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

function getSetting(key) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
}

function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

module.exports = { db, getSettings, getSetting, setSetting, dataDir };
