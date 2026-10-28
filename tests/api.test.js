import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { validarContacto, armarCorreo } from '../api/contacto.js';
import { validarRegistro } from '../api/registro.js';
import { hashPassword, verificarCredenciales, cookieSesion, sesionValida } from '../api/_lib/auth.js';

const base = {
  nombre: 'Ana Pérez', email: 'ana@colegio.cl', institucion: 'Colegio X', cargo: 'Docente',
  pais: 'Chile', ciudad: 'Santiago', motivo: 'Solicitar un manual', mensaje: 'Hola', origen: 'aplicaciones · Solicitar el manual', consentimiento: true,
};

test('contacto: acepta un envío válido', () => {
  assert.ok(validarContacto(base).datos);
});

test('contacto: exige consentimiento explícito (true, no "on")', () => {
  assert.ok(validarContacto({ ...base, consentimiento: 'on' }).error);
});

test('contacto: rechaza motivo o país fuera de la lista', () => {
  assert.ok(validarContacto({ ...base, motivo: 'Comprar' }).error);
  assert.ok(validarContacto({ ...base, pais: 'Narnia' }).error);
});

test('contacto: acota largos y correo', () => {
  assert.ok(validarContacto({ ...base, mensaje: 'x'.repeat(3001) }).error);
  assert.ok(validarContacto({ ...base, email: 'no-es-correo' }).error);
  assert.ok(validarContacto({ ...base, institucion: { $gt: '' } }).error);
});

test('contacto: el correo escapa HTML y el asunto no admite saltos de línea', () => {
  const { datos } = validarContacto({ ...base, nombre: '<img src=x onerror=alert(1)>', institucion: 'A\r\nBcc: x@y.z', mensaje: '<script>x</script>' });
  const { asunto, html } = armarCorreo(datos);
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!/[\r\n]/.test(asunto));
  assert.ok(asunto.startsWith('[Web Cognición en Movimiento] Solicitar un manual'));
});

const sesion = '3f2b8c1e-9a4d-4c2b-8e1f-0a1b2c3d4e5f';
test('registro: guarda solo campos permitidos y normaliza el origen', () => {
  const r = validarRegistro({ evento: 'descarga', recurso: 'Plantilla de ficha de actividad en aula', version: '1.0', origen: 'zzz', sesion, extra: 'x' });
  assert.deepEqual(r, { e: 'descarga', r: 'plantilla-ficha-aula', v: '1.0', o: 'otro', s: sesion });
});

test('registro: rechaza recurso, versión, evento o sesión inválidos', () => {
  const ok = { evento: 'descarga', recurso: 'Plantilla de ficha de actividad en aula', version: '1.0', sesion };
  assert.equal(validarRegistro({ ...ok, recurso: 'Otro' }), null);
  assert.equal(validarRegistro({ ...ok, version: '9.9' }), null);
  assert.equal(validarRegistro({ ...ok, evento: '__proto__' }), null);
  assert.equal(validarRegistro({ ...ok, sesion: 'abc' }), null);
});

test('auth: verifica la contraseña con scrypt y la sesión firmada', () => {
  process.env.ADMIN_USER = 'admin';
  process.env.ADMIN_PASS_HASH = hashPassword('clave-de-prueba');
  process.env.SESSION_SECRET = randomBytes(32).toString('base64url');
  assert.equal(verificarCredenciales('admin', 'clave-de-prueba'), true);
  assert.equal(verificarCredenciales('admin', 'otra'), false);
  assert.equal(verificarCredenciales('Admin', 'clave-de-prueba'), false);

  const cookie = cookieSesion().split(';')[0];
  const req = (c) => new Request('https://x/api/admin/datos', { headers: { cookie: c } });
  assert.equal(sesionValida(req(cookie)), true);
  const [datos, firma] = cookie.split('=')[1].split('.');
  const alterada = Buffer.from(JSON.stringify({ u: 'admin', exp: Date.now() + 1e12 })).toString('base64url');
  assert.equal(sesionValida(req(`cm_admin=${alterada}.${firma}`)), false);
  assert.equal(sesionValida(req(`cm_admin=${datos}.x${firma}`)), false);
});

test('auth: un hash mal formado no lanza excepción', () => {
  process.env.ADMIN_PASS_HASH = 'scrypt$16384$8$1$abc$corto';
  assert.equal(verificarCredenciales('admin', 'x'), false);
});
