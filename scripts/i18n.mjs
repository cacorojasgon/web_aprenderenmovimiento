// Textos traducibles de src/index.html y cobertura de los diccionarios de src/i18n/.
// El español es el texto fuente; cada diccionario usa como clave el texto en español con los espacios
// normalizados, igual que el selector de idioma del sitio. No se traducen: <script>, <style>, el texto
// de la licencia (<article data-lic-texto>, es el texto que se firma) ni los elementos translate="no".
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ATRIBUTOS = ['placeholder', 'aria-label', 'title', 'alt'];
const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export const normalizar = (s) => s.replace(/\s+/g, ' ').trim();
const decodificar = (s) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1));
  return ENTIDADES[e.toLowerCase()] ?? m;
});
const conLetras = (s) => /\p{L}/u.test(s);

export function textosTraducibles(html) {
  let h = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<article\b[^>]*\bdata-lic-texto\b[^>]*>[\s\S]*?<\/article>/gi, '');
  // Elementos translate="no" (sin anidar el mismo tipo de elemento dentro).
  h = h.replace(/<(\w+)\b[^>]*\btranslate="no"[^>]*>[\s\S]*?<\/\1>/gi, '');
  const textos = new Set();
  const cuerpo = h.slice(h.search(/<body\b/i));
  for (const [, t] of cuerpo.matchAll(/>([^<]+)</g)) {
    const x = normalizar(decodificar(t));
    if (x && conLetras(x)) textos.add(x);
  }
  for (const [etiqueta] of h.matchAll(/<[a-z][^>]*>/gi)) {
    for (const a of ATRIBUTOS) {
      const v = (etiqueta.match(new RegExp(`\\s${a}="([^"]*)"`)) || [])[1];
      if (v && !v.startsWith('data:') && conLetras(v)) textos.add(normalizar(decodificar(v)));
    }
  }
  const titulo = (h.match(/<title>([^<]*)<\/title>/) || [])[1];
  const desc = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  for (const v of [titulo, desc]) if (v) textos.add(normalizar(decodificar(v)));
  return [...textos];
}

export async function leerDiccionarios(dir) {
  const salida = {};
  for (const f of (await readdir(dir).catch(() => [])).filter((x) => /^[a-z]{2}\.json$/.test(x)).sort()) {
    salida[f.slice(0, 2)] = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
  }
  return salida;
}

// Textos de la página sin traducción y traducciones repetidas (que impedirían volver al español sin ambigüedad).
export function revisarDiccionario(html, dic) {
  const faltan = textosTraducibles(html).filter((t) => typeof dic[t] !== 'string' || !dic[t].trim());
  const porValor = new Map();
  for (const [es, otro] of Object.entries(dic)) {
    const k = normalizar(otro);
    if (k === normalizar(es)) continue;
    porValor.set(k, [...(porValor.get(k) || []), es]);
  }
  const repetidas = [...porValor].filter(([, v]) => v.length > 1).map(([k, v]) => `"${k}" ← ${v.map((x) => `"${x}"`).join(', ')}`);
  return { faltan, repetidas };
}
