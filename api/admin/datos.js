// GET /api/admin/datos — catálogo de recursos y registro completo de eventos, solo con sesión válida.
import { json } from '../_lib/http.js';
import { kvConfigurado, comando, CLAVE_EVENTOS } from '../_lib/kv.js';
import { sesionValida } from '../_lib/auth.js';
import { RECURSOS, EVENTOS, ORIGENES } from '../_lib/catalogo.js';

export async function GET(request) {
  if (!sesionValida(request)) return json(401, { error: 'Sesión expirada. Vuelve a ingresar.' });
  if (!kvConfigurado()) return json(503, { error: 'El almacenamiento no está configurado.' });
  let crudos;
  try {
    crudos = await comando('LRANGE', CLAVE_EVENTOS, '0', '-1');
  } catch {
    return json(503, { error: 'No se pudo leer el registro.' });
  }
  const eventos = [];
  for (const c of crudos || []) {
    try {
      eventos.push(JSON.parse(c));
    } catch {
      // Se omite cualquier entrada corrupta.
    }
  }
  return json(200, { generado: new Date().toISOString(), recursos: RECURSOS, tiposEvento: EVENTOS, origenes: ORIGENES, eventos });
}
