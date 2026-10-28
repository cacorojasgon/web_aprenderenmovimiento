// Utilidades HTTP comunes a las funciones (firma Web estándar: Request -> Response).

const MAX_BODY = 16 * 1024;

export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
      ...headers,
    },
  });
}

// IP del cliente fijada por la plataforma (Vercel sobrescribe estos headers); nunca se guarda en claro.
export function ipCliente(request) {
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  const fwd = request.headers.get('x-forwarded-for');
  return fwd ? fwd.split(',')[0].trim() : 'desconocida';
}

// Rechaza peticiones que no vienen del propio sitio (CSRF) o que no son JSON.
export function validarOrigen(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const propio = new URL(request.url);
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || propio.host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function leerJson(request) {
  const tipo = request.headers.get('content-type') || '';
  if (!tipo.toLowerCase().startsWith('application/json')) return { error: json(415, { error: 'Formato no admitido.' }) };
  const texto = await request.text();
  if (texto.length > MAX_BODY) return { error: json(413, { error: 'La solicitud es demasiado grande.' }) };
  try {
    const datos = JSON.parse(texto);
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) throw new Error();
    return { datos };
  } catch {
    return { error: json(400, { error: 'Solicitud inválida.' }) };
  }
}

// Texto acotado: recorta, quita caracteres de control y valida largo.
export function texto(valor, { min = 0, max }) {
  if (valor == null) valor = '';
  if (typeof valor !== 'string') return null;
  const limpio = valor.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (limpio.length < min || limpio.length > max) return null;
  return limpio;
}

export const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;
