// POST /api/contacto — valida el formulario y lo envía por correo (Resend) con el contexto de quien escribe.
import { json, ipCliente, validarOrigen, leerJson, texto, EMAIL_RE } from './_lib/http.js';
import { kvConfigurado, limitar } from './_lib/kv.js';
import { MOTIVOS, PAISES } from './_lib/catalogo.js';

const ERROR_GENERICO = 'No pudimos enviar tu mensaje. Inténtalo nuevamente en unos minutos.';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const unaLinea = (s) => String(s).replace(/[\r\n]+/g, ' ');

export function validarContacto(d) {
  const v = {
    nombre: texto(d.nombre, { min: 2, max: 100 }),
    email: texto(d.email, { min: 6, max: 254 }),
    institucion: texto(d.institucion, { max: 150 }),
    cargo: texto(d.cargo, { max: 100 }),
    pais: texto(d.pais, { max: 40 }),
    ciudad: texto(d.ciudad, { max: 100 }),
    motivo: texto(d.motivo, { max: 80 }),
    mensaje: texto(d.mensaje, { min: 1, max: 3000 }),
    origen: texto(d.origen, { max: 160 }),
  };
  if (v.nombre === null) return { error: 'Revisa tu nombre (entre 2 y 100 caracteres).' };
  if (v.email === null || !EMAIL_RE.test(v.email)) return { error: 'Revisa tu correo electrónico.' };
  if (v.mensaje === null) return { error: 'Escribe un mensaje de hasta 3.000 caracteres.' };
  if (!MOTIVOS.includes(v.motivo)) return { error: 'Selecciona un motivo de la lista.' };
  if (!PAISES.includes(v.pais)) return { error: 'Selecciona un país de la lista.' };
  if ([v.institucion, v.cargo, v.ciudad, v.origen].includes(null)) return { error: 'Algún campo supera el largo permitido.' };
  if (d.consentimiento !== true) return { error: 'Debes aceptar el uso de tus datos para responder tu solicitud.' };
  return { datos: v };
}

export function armarCorreo(v, fecha = new Date()) {
  const cuando = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', dateStyle: 'full', timeStyle: 'short' }).format(fecha);
  const filas = [
    ['Nombre', v.nombre],
    ['Correo', v.email],
    ['Institución', v.institucion || '—'],
    ['Cargo', v.cargo || '—'],
    ['País', v.pais],
    ['Ciudad', v.ciudad || '—'],
    ['Motivo', v.motivo],
    ['Llegó desde', v.origen || 'Formulario de contacto'],
    ['Fecha', `${cuando} (hora de Chile)`],
    ['Consentimiento', 'Aceptó que la Universidad Andrés Bello use estos datos solo para responder su solicitud'],
  ];
  const quien = v.institucion ? `${v.nombre} (${v.institucion})` : v.nombre;
  const asunto = unaLinea(`[Web Cognición en Movimiento] ${v.motivo} · ${quien}`).slice(0, 200);
  const html = `<div style="font-family:Arial,sans-serif;color:#14213D;max-width:640px">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#2346C8">Contacto desde cognicionenmovimiento.cl</p>
<h2 style="margin:0 0 16px;font-size:20px">${esc(v.motivo)}</h2>
<table style="border-collapse:collapse;width:100%;font-size:14px">${filas
    .map(([k, x]) => `<tr><th style="text-align:left;vertical-align:top;padding:6px 12px 6px 0;color:#3B4763;white-space:nowrap">${esc(k)}</th><td style="padding:6px 0">${esc(x)}</td></tr>`)
    .join('')}</table>
<h3 style="margin:20px 0 8px;font-size:15px">Mensaje</h3>
<div style="white-space:pre-wrap;background:#F2F5FC;border-radius:8px;padding:12px 14px;font-size:14px">${esc(v.mensaje)}</div>
<p style="margin:16px 0 0;font-size:12px;color:#5A6683">Responde directamente a este correo para contestar a ${esc(v.nombre)}.</p></div>`;
  const text = `Contacto desde cognicionenmovimiento.cl\n\n${filas.map(([k, x]) => `${k}: ${x}`).join('\n')}\n\nMensaje:\n${v.mensaje}\n`;
  return { asunto, html, text };
}

export async function POST(request) {
  if (!validarOrigen(request)) return json(403, { error: 'Solicitud no permitida.' });
  const { datos: crudo, error } = await leerJson(request);
  if (error) return error;

  // Trampa para bots: el campo oculto debe venir vacío. Se responde como éxito para no dar pistas.
  if (crudo.sitio_web) return json(200, { ok: true, mensaje: '¡Gracias! Recibimos tu mensaje y te responderemos pronto.' });

  const { datos, error: invalido } = validarContacto(crudo);
  if (invalido) return json(400, { error: invalido });

  if (!process.env.RESEND_API_KEY || !process.env.CONTACT_TO) {
    console.error('contacto: falta RESEND_API_KEY o CONTACT_TO');
    return json(503, { error: ERROR_GENERICO });
  }
  try {
    if (kvConfigurado() && !(await limitar('contacto', ipCliente(request), 5, 600))) {
      return json(429, { error: 'Recibimos varios mensajes desde tu conexión. Espera unos minutos antes de volver a escribir.' });
    }
  } catch {
    // Si el almacenamiento falla, no se bloquea el contacto.
  }

  const { asunto, html, text } = armarCorreo(datos);
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.CONTACT_FROM || 'Cognición en Movimiento <onboarding@resend.dev>',
        to: process.env.CONTACT_TO.split(',').map((s) => s.trim()).filter(Boolean),
        reply_to: datos.email,
        subject: asunto,
        html,
        text,
      }),
    });
    if (!r.ok) {
      console.error('contacto: Resend respondió', r.status);
      return json(502, { error: ERROR_GENERICO });
    }
  } catch {
    console.error('contacto: no se pudo conectar con Resend');
    return json(502, { error: ERROR_GENERICO });
  }
  return json(200, { ok: true, mensaje: '¡Gracias! Recibimos tu mensaje y te responderemos pronto.' });
}
