// Autenticación del panel: contraseña con scrypt (solo el hash vive en variables de entorno)
// y sesión en cookie firmada con HMAC, HttpOnly, Secure y SameSite=Strict.
import { createHmac, scryptSync, timingSafeEqual, randomBytes, createHash } from 'node:crypto';

const COOKIE = 'cm_admin';
const DURACION_MS = 8 * 60 * 60 * 1000;

export function authConfigurada() {
  return Boolean(process.env.ADMIN_USER && process.env.ADMIN_PASS_HASH && (process.env.SESSION_SECRET || '').length >= 32);
}

export function hashPassword(password, salt = randomBytes(16)) {
  const N = 16384, r = 8, p = 1;
  const hash = scryptSync(password, salt, 32, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function iguales(a, b) {
  // Compara en tiempo constante aunque los largos difieran.
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function verificarCredenciales(usuario, password) {
  const [alg, N, r, p, salt, esperado] = (process.env.ADMIN_PASS_HASH || '').split('$');
  const esperadoBuf = Buffer.from(esperado || '', 'base64');
  if (alg !== 'scrypt' || !salt || esperadoBuf.length !== 32) return false;
  const hash = scryptSync(String(password), Buffer.from(salt, 'base64'), 32, { N: +N, r: +r, p: +p });
  const passOk = timingSafeEqual(hash, esperadoBuf);
  const userOk = iguales(String(usuario), process.env.ADMIN_USER);
  return passOk && userOk;
}

function firmar(datos) {
  return createHmac('sha256', process.env.SESSION_SECRET).update(datos).digest('base64url');
}

export function cookieSesion() {
  const datos = Buffer.from(JSON.stringify({ u: process.env.ADMIN_USER, exp: Date.now() + DURACION_MS })).toString('base64url');
  const valor = `${datos}.${firmar(datos)}`;
  return `${COOKIE}=${valor}; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${DURACION_MS / 1000}`;
}

export function cookieCierre() {
  return `${COOKIE}=; Path=/api/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function sesionValida(request) {
  if (!authConfigurada()) return false;
  const cookies = request.headers.get('cookie') || '';
  const valor = cookies.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`));
  if (!valor) return false;
  const [datos, firma] = valor.slice(COOKIE.length + 1).split('.');
  if (!datos || !firma || !iguales(firma, firmar(datos))) return false;
  try {
    const { u, exp } = JSON.parse(Buffer.from(datos, 'base64url').toString());
    return u === process.env.ADMIN_USER && Date.now() < exp;
  } catch {
    return false;
  }
}
