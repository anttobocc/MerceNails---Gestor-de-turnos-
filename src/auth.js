const crypto = require('node:crypto');
const { db, getSetting, setSetting } = require('./db');

const COOKIE = 'mn_session';
const SESSION_DAYS = 30;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  const calc = crypto.scryptSync(String(password), Buffer.from(salt, 'hex'), 64);
  return crypto.timingSafeEqual(calc, Buffer.from(hash, 'hex'));
}

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

// Primera vez: toma ADMIN_PASSWORD del entorno o genera una clave y la muestra en consola
function ensureAdminPassword() {
  if (getSetting('admin_password_hash')) return;
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(6).toString('base64url');
  setSetting('admin_password_hash', hashPassword(password));
  if (!process.env.ADMIN_PASSWORD) {
    console.log('\n  Panel creado. Usuario: %s  Contraseña: %s', getSetting('admin_user'), password);
    console.log('  Cambiala desde Configuración en el panel.\n');
  }
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map(c => c.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))])
  );
}

function cookieFlags(req) {
  const secure = req.secure || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `; HttpOnly; Path=/; SameSite=Strict${secure}`;
}

function createSession(req, res) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = Date.now() + SESSION_DAYS * 86400000;
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions (token_hash, expires_at) VALUES (?, ?)').run(sha256(token), expires);
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Max-Age=${SESSION_DAYS * 86400}${cookieFlags(req)}`);
}

function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  res.setHeader('Set-Cookie', `${COOKIE}=; Max-Age=0${cookieFlags(req)}`);
}

function requireAdmin(req, res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  const session = token && db.prepare('SELECT expires_at FROM sessions WHERE token_hash = ?').get(sha256(token));
  if (!session || session.expires_at < Date.now()) return res.status(401).json({ error: 'Sesión vencida. Ingresá de nuevo.' });
  next();
}

module.exports = { hashPassword, verifyPassword, ensureAdminPassword, createSession, destroySession, requireAdmin };
