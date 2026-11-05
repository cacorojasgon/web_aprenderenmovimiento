// POST /api/licencia-correo — envía la licencia firmada (PDF adjunto) al correo con que se firmó.
// El destinatario sale del registro, nunca de la solicitud; el contenido es fijo salvo el nombre.
import { json, ipCliente, validarOrigen, leerJson } from './_lib/http.js';
import { kvConfigurado, limitar } from './_lib/kv.js';
import { tokenValido, codigoVerificacion } from './_lib/firma.js';
import { leerLicencia, pdfDe, nombreArchivo } from './_lib/licencia-firmada.js';
import { fechaChile } from './_lib/licencia-pdf.js';
import { RECURSOS } from './_lib/catalogo.js';

const NO_ENVIADO = 'No pudimos enviar el correo en este momento. Descarga el PDF desde esta ventana o inténtalo más tarde.';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function armarCorreoLicencia(reg) {
  const recurso = RECURSOS.find((r) => r.id === reg.r)?.nombre || reg.r;
  const lineas = [
    `Hola, ${reg.n}:`,
    `Adjuntamos tu copia de la Licencia de uso del material del programa Cognición en Movimiento (versión ${reg.v}), firmada electrónicamente el ${fechaChile(reg.t)} (hora de Chile) al descargar «${recurso}».`,
    `Código de verificación: ${codigoVerificacion(reg.f)}. ID de aceptación: ${reg.id}.`,
    reg.sg
      ? 'Recibes este correo porque lo solicitaste desde el sitio web del programa. Tus datos se usan para el registro interno de la aceptación de la licencia y, porque lo autorizaste, para que el equipo de investigación te contacte con fines de seguimiento del impacto del programa. Puedes retirar esa autorización en cualquier momento a través del formulario de contacto del sitio.'
      : 'Recibes este correo porque lo solicitaste desde el sitio web del programa. Tus datos se usan solo con fines de registro interno de la aceptación de la licencia.',
    'Programa Cognición en Movimiento (COGNI-move) · Facultad de Ciencias de la Rehabilitación · Universidad Andrés Bello',
  ];
  return {
    asunto: `Tu licencia firmada · Cognición en Movimiento (v${reg.v})`,
    text: lineas.join('\n\n'),
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#14213D">${lineas.map((l, i) => `<p style="margin:0 0 12px${i >= 3 ? ';font-size:13px;color:#5A6683' : ''}">${esc(l)}</p>`).join('')}</div>`,
  };
}

export async function POST(request) {
  if (!validarOrigen(request)) return json(403, { error: 'Solicitud no permitida.' });
  const { datos, error } = await leerJson(request);
  if (error) return error;
  if (!tokenValido(datos.id, datos.token)) return json(403, { error: 'El enlace de tu licencia venció. Vuelve a descargar el material para obtener una copia firmada.' });
  if (!kvConfigurado() || !process.env.RESEND_API_KEY) return json(503, { error: NO_ENVIADO });

  let reg, pdf;
  try {
    if (!(await limitar('licencia-correo', ipCliente(request), 10, 3600))) return json(429, { error: 'Demasiadas solicitudes. Espera un rato antes de volver a intentarlo.' });
    if (!(await limitar('licencia-correo-id', datos.id, 3, 86400))) return json(429, { error: 'Ya enviamos esta licencia varias veces hoy. Revisa tu bandeja de entrada y la carpeta de spam.' });
    reg = await leerLicencia(datos.id);
    if (!reg) return json(404, { error: 'No encontramos esta licencia firmada.' });
    pdf = await pdfDe(reg);
  } catch (e) {
    console.error('licencia-correo: no se pudo preparar', e?.message);
    return json(503, { error: NO_ENVIADO });
  }

  const { asunto, text, html } = armarCorreoLicencia(reg);
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.CONTACT_FROM || 'Cognición en Movimiento <onboarding@resend.dev>',
        to: [reg.m],
        subject: asunto,
        text,
        html,
        attachments: [{ filename: nombreArchivo(reg), content: Buffer.from(pdf).toString('base64') }],
      }),
    });
    if (!r.ok) {
      console.error('licencia-correo: Resend respondió', r.status);
      return json(502, { error: NO_ENVIADO });
    }
  } catch {
    console.error('licencia-correo: no se pudo conectar con Resend');
    return json(502, { error: NO_ENVIADO });
  }
  return json(200, { ok: true, mensaje: `Te enviamos la licencia firmada a ${reg.m}. Si no la ves en unos minutos, revisa la carpeta de spam.` });
}
