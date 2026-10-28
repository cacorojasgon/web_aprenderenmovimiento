// POST /api/admin/login — inicia la sesión del panel. Límite: 5 intentos por IP y 50 en total cada 15 minutos.
import { json, ipCliente, validarOrigen, leerJson } from '../_lib/http.js';
import { kvConfigurado, limitar } from '../_lib/kv.js';
import { authConfigurada, verificarCredenciales, cookieSesion } from '../_lib/auth.js';

export async function POST(request) {
  if (!validarOrigen(request)) return json(403, { error: 'Solicitud no permitida.' });
  // Sin almacenamiento no hay límite de intentos: el acceso queda cerrado.
  if (!authConfigurada() || !kvConfigurado()) return json(503, { error: 'El panel aún no está configurado.' });
  const { datos, error } = await leerJson(request);
  if (error) return error;
  try {
    const porIp = await limitar('login', ipCliente(request), 5, 900);
    const global = await limitar('login', 'global', 50, 900);
    if (!porIp || !global) return json(429, { error: 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.' });
  } catch {
    return json(503, { error: 'El panel no está disponible en este momento.' });
  }
  if (typeof datos.usuario !== 'string' || typeof datos.password !== 'string' || datos.password.length > 200 || !verificarCredenciales(datos.usuario, datos.password)) {
    return json(401, { error: 'Usuario o contraseña incorrectos.' });
  }
  return json(200, { ok: true }, { 'Set-Cookie': cookieSesion() });
}
