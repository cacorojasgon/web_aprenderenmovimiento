// POST /api/descarga — única vía para obtener un recurso: exige la aceptación de la licencia vigente,
// firmada con el nombre y el correo de quien descarga; deja constancia en el registro (cláusulas 12 y 14)
// y recién entonces entrega el archivo. Si no se puede registrar, no se entrega.
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { json, ipCliente, validarOrigen, leerJson, texto, EMAIL_RE } from './_lib/http.js';
import { kvConfigurado, limitar, pipeline, CLAVE_EVENTOS } from './_lib/kv.js';
import { RECURSOS, VERSION_VIGENTE, ORIGENES } from './_lib/catalogo.js';
import { LICENCIAS } from './_lib/licencias/index.js';
import { sello, codigoVerificacion, tokenLicencia, claveLicencia } from './_lib/firma.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const NOMBRE_RE = /^\p{L}[\p{L}\p{M} .'’-]*$/u;
const NO_DISPONIBLE = 'No pudimos registrar tu descarga en este momento. Inténtalo nuevamente en unos minutos.';

export function validarDescarga(d) {
  const recurso = RECURSOS.find((r) => r.nombre === d.recurso);
  if (!recurso) return { error: 'Recurso no disponible.' };
  if (d.version !== VERSION_VIGENTE) return { error: 'La licencia cambió. Recarga la página y vuelve a revisarla.' };
  if (d.acepta !== true) return { error: 'Debes aceptar la licencia para descargar.' };
  const nombre = texto(typeof d.nombre === 'string' ? d.nombre.replace(/\s+/g, ' ') : d.nombre, { min: 3, max: 100 });
  if (!nombre || !NOMBRE_RE.test(nombre)) return { error: 'Escribe tu nombre completo, solo con letras.' };
  const email = texto(d.email, { min: 6, max: 254 });
  if (!email || !EMAIL_RE.test(email)) return { error: 'Ingresa un correo electrónico válido.' };
  if (typeof d.sesion !== 'string' || !UUID_RE.test(d.sesion)) return { error: 'Solicitud inválida.' };
  const origen = Object.hasOwn(ORIGENES, d.origen) ? d.origen : 'otro';
  return {
    recurso,
    evento: { e: 'descarga', r: recurso.id, v: VERSION_VIGENTE, o: origen, s: d.sesion.toLowerCase(), m: email.toLowerCase(), n: nombre },
  };
}

// Completa el registro con el identificador, la hora del servidor, la huella del texto aceptado y el sello.
export function firmarRegistro(evento, ahora = new Date()) {
  const reg = { id: randomUUID(), t: ahora.toISOString(), ...evento, h: LICENCIAS[evento.v].SHA256 };
  reg.f = sello(reg);
  return reg;
}

export async function POST(request) {
  if (!validarOrigen(request)) return json(403, { error: 'Solicitud no permitida.' });
  const { datos, error } = await leerJson(request);
  if (error) return error;
  const { recurso, evento, error: invalido } = validarDescarga(datos);
  if (invalido) return json(400, { error: invalido });
  if (!kvConfigurado() || !LICENCIAS[VERSION_VIGENTE]) {
    console.error('descarga: almacenamiento o texto de licencia no disponible');
    return json(503, { error: NO_DISPONIBLE });
  }

  let archivo;
  try {
    archivo = await readFile(path.join(process.cwd(), 'recursos', recurso.archivo));
  } catch {
    console.error('descarga: falta el archivo del recurso', recurso.id);
    return json(503, { error: 'Este recurso no está disponible por ahora.' });
  }

  const reg = firmarRegistro(evento);
  try {
    if (!(await limitar('descarga', ipCliente(request), 20, 600))) {
      return json(429, { error: 'Hiciste varias descargas seguidas. Espera unos minutos antes de volver a intentarlo.' });
    }
    const registro = JSON.stringify(reg);
    await pipeline([['LPUSH', CLAVE_EVENTOS, registro], ['SET', claveLicencia(reg.id), registro]]);
  } catch {
    console.error('descarga: fallo de almacenamiento');
    return json(503, { error: NO_DISPONIBLE });
  }

  return new Response(archivo, {
    status: 200,
    headers: {
      'Content-Type': recurso.mime,
      'Content-Disposition': `attachment; filename="${recurso.descarga}"`,
      'Content-Length': String(archivo.length),
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
      'X-Licencia-Id': reg.id,
      'X-Licencia-Token': tokenLicencia(reg.id),
      'X-Licencia-Fecha': reg.t,
      'X-Licencia-Codigo': codigoVerificacion(reg.f),
    },
  });
}
