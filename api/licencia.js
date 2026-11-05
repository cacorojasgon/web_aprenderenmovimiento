// POST /api/licencia — entrega a quien firmó el PDF de su licencia firmada.
// Requiere el token temporal que recibió al descargar (24 h); va en el cuerpo, nunca en la URL.
import { json, ipCliente, validarOrigen, leerJson } from './_lib/http.js';
import { kvConfigurado, limitar } from './_lib/kv.js';
import { tokenValido } from './_lib/firma.js';
import { leerLicencia, pdfDe, respuestaPdf } from './_lib/licencia-firmada.js';

export async function POST(request) {
  if (!validarOrigen(request)) return json(403, { error: 'Solicitud no permitida.' });
  const { datos, error } = await leerJson(request);
  if (error) return error;
  if (!tokenValido(datos.id, datos.token)) return json(403, { error: 'El enlace de tu licencia venció. Vuelve a descargar el material para obtener una copia firmada.' });
  if (!kvConfigurado()) return json(503, { error: 'La licencia no está disponible en este momento.' });
  try {
    if (!(await limitar('licencia', ipCliente(request), 30, 600))) return json(429, { error: 'Demasiadas solicitudes. Espera unos minutos.' });
    const reg = await leerLicencia(datos.id);
    if (!reg) return json(404, { error: 'No encontramos esta licencia firmada.' });
    return respuestaPdf(reg, await pdfDe(reg));
  } catch (e) {
    console.error('licencia: no se pudo generar', e?.message);
    return json(503, { error: 'La licencia no está disponible en este momento.' });
  }
}
