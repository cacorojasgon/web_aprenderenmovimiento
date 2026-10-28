// Genera ADMIN_PASS_HASH y un SESSION_SECRET para las variables de entorno de Vercel.
// Uso: npm run hash-password   (pide la contraseña por la terminal; no queda en el historial)
import { createInterface } from 'node:readline';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../api/_lib/auth.js';

const rl = createInterface({ input: process.stdin, output: process.stdout });
rl.question('Contraseña del panel: ', (password) => {
  rl.close();
  if (password.length < 8) {
    console.error('Usa al menos 8 caracteres.');
    process.exit(1);
  }
  console.log(`\nADMIN_PASS_HASH=${hashPassword(password)}`);
  console.log(`SESSION_SECRET=${randomBytes(32).toString('base64url')}`);
});
