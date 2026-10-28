// POST /api/registro — eventos complementarios de la ventana de licencia (hoy, la copia guardada):
// fecha y hora (del servidor), versión, recurso y un identificador técnico de sesión. Nada más.
// Las descargas no pasan por aquí: las registra /api/descarga junto con el correo.
import { json, ipCliente, validarOrigen, leerJson } from './_lib/http.js';
import { kvConfigurado, limitar, comando, CLAVE_EVENTOS } from './_lib/kv.js';
import { RECURSOS, VERSION_VIGENTE, ORIGENES } from './_lib/catalogo.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENTOS_CLIENTE = ['copia_licencia'];

export function validarRegistro(d) {
  const recurso = RECURSOS.find((r) => r.nombre === d.recurso);
  if (!EVENTOS_CLIENTE.includes(d.evento)) return null;
  if (!recurso) return null;
  if (d.version !== VERSION_VIGENTE) return null;
  if (typeof d.sesion !== 'string' || !UUID_RE.test(d.sesion)) return null;
  const origen = Object.hasOwn(ORIGENES, d.origen) ? d.origen : 'otro';
  return { e: d.evento, r: recurso.id, v: d.version, o: origen, s: d.sesion.toLowerCase() };
}

export async function POST(request) {
  if (!validarOrigen(request)) return json(403, { error: 'Solicitud no permitida.' });
  const { datos, error } = await leerJson(request);
  if (error) return error;
  const evento = validarRegistro(datos);
  if (!evento) return json(400, { error: 'Registro inválido.' });
  if (!kvConfigurado()) return json(503, { error: 'Registro no disponible.' });
  try {
    if (!(await limitar('registro', ipCliente(request), 60, 600))) return json(429, { error: 'Demasiadas solicitudes.' });
    await comando('LPUSH', CLAVE_EVENTOS, JSON.stringify({ t: new Date().toISOString(), ...evento }));
  } catch {
    console.error('registro: fallo de almacenamiento');
    return json(503, { error: 'Registro no disponible.' });
  }
  return json(201, { ok: true });
}
