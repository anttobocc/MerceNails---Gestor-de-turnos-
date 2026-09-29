// Uso: npm run set-password -- "nueva-clave"
try { process.loadEnvFile(); } catch {}

const { setSetting } = require('../src/db');
const { hashPassword } = require('../src/auth');

const password = process.argv[2];
if (!password || password.length < 8) {
  console.error('Uso: npm run set-password -- "nueva-clave"   (mínimo 8 caracteres)');
  process.exit(1);
}
setSetting('admin_password_hash', hashPassword(password));
console.log('Contraseña del panel actualizada.');
