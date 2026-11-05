// GET /api/admin/licencia?id=… — copia de una licencia firmada para el panel, solo con sesión válida.
import { json } from '../_lib/http.js';
import { kvConfigurado } from '../_lib/kv.js';
import { sesionValida } from '../_lib/auth.js';
import { leerLicencia, pdfDe, respuestaPdf } from '../_lib/licencia-firmada.js';

export async function GET(request) {
  if (!sesionValida(request)) return json(401, { error: 'Sesión expirada. Vuelve a ingresar.' });
  if (!kvConfigurado()) return json(503, { error: 'El almacenamiento no está configurado.' });
  try {
    const reg = await leerLicencia(new URL(request.url).searchParams.get('id'));
    if (!reg) return json(404, { error: 'No hay licencia firmada para este registro, o su sello no es válido.' });
    return respuestaPdf(reg, await pdfDe(reg));
  } catch (e) {
    console.error('admin/licencia: no se pudo generar', e?.message);
    return json(503, { error: 'No se pudo generar la licencia.' });
  }
}
