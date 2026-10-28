// POST /api/admin/logout — borra la cookie de sesión.
import { json, validarOrigen } from '../_lib/http.js';
import { cookieCierre } from '../_lib/auth.js';

export async function POST(request) {
  if (!validarOrigen(request)) return json(403, { error: 'Solicitud no permitida.' });
  return json(200, { ok: true }, { 'Set-Cookie': cookieCierre() });
}
