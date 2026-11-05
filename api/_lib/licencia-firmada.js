// Lectura de una licencia firmada y armado de su PDF; común a /api/licencia, /api/licencia-correo y el panel.
import { comando } from './kv.js';
import { RECURSOS } from './catalogo.js';
import { LICENCIAS } from './licencias/index.js';
import { claveLicencia } from './firma.js';
import { pdfLicenciaFirmada } from './licencia-pdf.js';

export const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// El registro guardado (solo lo escribe el servidor) es la referencia; su sello se calculó al firmar.
export async function leerLicencia(id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) return null;
  const crudo = await comando('GET', claveLicencia(id));
  if (!crudo) return null;
  const reg = JSON.parse(crudo);
  if (!LICENCIAS[reg.v] || typeof reg.f !== 'string' || typeof reg.n !== 'string') return null;
  return reg;
}

export const nombreArchivo = (reg) => `Licencia_firmada_COGNI-move_${reg.id.slice(0, 8)}.pdf`;

export async function pdfDe(reg) {
  return pdfLicenciaFirmada(reg, RECURSOS.find((r) => r.id === reg.r), LICENCIAS[reg.v]);
}

export function respuestaPdf(reg, bytes) {
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${nombreArchivo(reg)}"`,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
