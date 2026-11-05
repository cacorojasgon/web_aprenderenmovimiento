// Firma electrónica de la licencia: sello de integridad del registro y token temporal para que
// quien firmó pueda obtener o recibir su copia. El sello se guarda junto al registro, así que
// rotar SESSION_SECRET no invalida las firmas ya emitidas (solo los tokens vigentes).
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

const secreto = () => process.env.SESSION_SECRET || '';
const HORAS_TOKEN = 24;

export const claveLicencia = (id) => `cm:lic:${id}`;

export function sello(reg) {
  const campos = ['cm-licencia', reg.id, reg.t, reg.n, reg.m, reg.r, reg.v, reg.h];
  if (typeof reg.sg === 'boolean') campos.push(reg.sg);
  return createHmac('sha256', secreto()).update(JSON.stringify(campos)).digest('hex');
}

// Código legible que aparece en el PDF: los primeros 20 dígitos del sello, en grupos de 4.
export function codigoVerificacion(selloHex) {
  return selloHex.slice(0, 20).toUpperCase().match(/.{4}/g).join('-');
}

function mac(id, exp) {
  return createHmac('sha256', secreto()).update(`lic|${id}|${exp}`).digest('base64url').slice(0, 32);
}

export function tokenLicencia(id, ahora = Date.now()) {
  const exp = ahora + HORAS_TOKEN * 3600 * 1000;
  return `${exp}.${mac(id, exp)}`;
}

export function tokenValido(id, token, ahora = Date.now()) {
  if (typeof token !== 'string') return false;
  const [exp, firma] = token.split('.');
  if (!/^\d{13}$/.test(exp || '') || +exp < ahora || !firma) return false;
  const a = createHash('sha256').update(firma).digest();
  const b = createHash('sha256').update(mac(id, exp)).digest();
  return timingSafeEqual(a, b);
}
