// Build reproducible: src/ -> public/
// - Extrae las imágenes embebidas en base64, las deduplica y las guarda con nombre por hash de
//   contenido (caché inmutable).
// - Los descargables nunca van a public/: viven en recursos/ y solo los entrega /api/descarga tras
//   aceptar la licencia. Si src/index.html trae uno embebido (versión offline), se compara con
//   recursos/; en local se actualiza el archivo, en Vercel una diferencia detiene el build.
// - Imágenes: solo se reducen si superan 3x su alto máximo en pantalla; PNG -> WebP sin pérdida;
//   JPEG sin reducir se copia byte a byte. Nunca se recomprime con pérdida algo que no cambió de tamaño.
// - Mueve los <script> inline a archivos externos (la CSP queda en script-src 'self', sin hashes).
// - Genera el set de favicon desde src/favicon.svg.
// - Falla si el HTML no coincide con api/_lib/catalogo.js o si quedan manejadores inline.
import { readFile, writeFile, mkdir, rm, copyFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { RECURSOS, MOTIVOS, PAISES } from '../api/_lib/catalogo.js';

const RAIZ = path.resolve(import.meta.dirname, '..');
const SRC = path.join(RAIZ, 'src');
const OUT = path.join(RAIZ, 'public');
const DPR = 3;

const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 10);
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'recurso';
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const errores = [];

async function escribir(rel, buf) {
  const destino = path.join(OUT, rel);
  await mkdir(path.dirname(destino), { recursive: true });
  await writeFile(destino, buf);
  return '/' + rel.split(path.sep).join('/');
}

function altoCss(atributos) {
  const m = atributos.match(/height:\s*([^;"]+)/);
  if (!m) return null;
  const px = [...m[1].matchAll(/(\d+(?:\.\d+)?)px/g)].map((x) => +x[1]);
  return px.length ? Math.max(...px) : null;
}

// ---------- 1. Validación contra el catálogo ----------
const EXT_DESCARGABLE = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|zip|rar|7z|epub)(?:[?#"]|$)/i;

async function validarCatalogo(html) {
  const nombres = RECURSOS.map((r) => r.nombre);
  for (const [, nombre] of html.matchAll(/data-recurso="([^"]+)"/g)) {
    if (!nombres.includes(nombre)) errores.push(`Recurso "${nombre}" no está en api/_lib/catalogo.js`);
  }
  for (const [boton] of html.matchAll(/<[a-z]+\b[^>]*\bdata-licencia\b[^>]*>/g)) {
    if (!/data-recurso="[^"]+"/.test(boton)) errores.push(`Botón de descarga sin data-recurso: ${boton.slice(0, 80)}…`);
  }
  for (const r of RECURSOS) {
    try { await readFile(path.join(RAIZ, 'recursos', r.archivo)); } catch { errores.push(`Falta recursos/${r.archivo} (${r.nombre})`); }
  }
  // Toda descarga debe pasar por la ventana de licencia: no se admiten enlaces directos a archivos.
  const sinIncrustados = html.replace(/<div hidden>\s*<a id="[^"]+" href="data:[^"]*"[^>]*>[^<]*<\/a>\s*<\/div>/g, '');
  for (const [enlace] of sinIncrustados.matchAll(/<a\b[^>]*>/g)) {
    const href = (enlace.match(/\bhref="([^"]*)"/) || [])[1] || '';
    if (/\bdownload\b/.test(enlace) || href.startsWith('data:') || (EXT_DESCARGABLE.test(href) && !/^https:\/\/doi\.org\//.test(href))) {
      errores.push(`Descarga directa sin licencia: ${enlace.slice(0, 100)}… (usa data-licencia + api/_lib/catalogo.js)`);
    }
  }
  for (const [, motivo] of html.matchAll(/data-motivo="([^"]+)"/g)) {
    if (!MOTIVOS.includes(motivo)) errores.push(`data-motivo "${motivo}" no está en MOTIVOS`);
  }
  const opciones = (nombre) => {
    const sel = html.match(new RegExp(`<select[^>]*name="${nombre}"[^>]*>([\\s\\S]*?)</select>`));
    return sel ? [...sel[1].matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]) : null;
  };
  if (JSON.stringify(opciones('motivo')) !== JSON.stringify(MOTIVOS)) errores.push('Las opciones de "Motivo" no coinciden con MOTIVOS');
  if (JSON.stringify(opciones('pais')) !== JSON.stringify(PAISES)) errores.push('Las opciones de "País" no coinciden con PAISES');
  if (/\son[a-z]+\s*=\s*["']/i.test(html)) errores.push('Hay manejadores de eventos inline (onclick=...): la CSP los bloquea');
}

// ---------- 2a. Descargables embebidos (versión offline) -> recursos/ ----------
async function retirarDescargables(html) {
  const re = /<div hidden>\s*<a id="([^"]+)" href="data:[^;]+;base64,([A-Za-z0-9+/=]+)"[^>]*>[^<]*<\/a>\s*<\/div>\n?/g;
  const enVercel = Boolean(process.env.VERCEL || process.env.CI);
  for (const [, id, b64] of html.matchAll(re)) {
    const recurso = RECURSOS.find((r) => r.ancla === id);
    if (!recurso) { errores.push(`Archivo embebido "${id}" sin recurso en api/_lib/catalogo.js (campo ancla)`); continue; }
    const nuevo = Buffer.from(b64, 'base64');
    const ruta = path.join(RAIZ, 'recursos', recurso.archivo);
    const actual = await readFile(ruta).catch(() => null);
    if (actual && actual.equals(nuevo)) continue;
    if (enVercel) { errores.push(`recursos/${recurso.archivo} no coincide con el archivo embebido en src/index.html`); continue; }
    await mkdir(path.dirname(ruta), { recursive: true });
    await writeFile(ruta, nuevo);
    console.warn(`Aviso: se actualizó recursos/${recurso.archivo} desde src/index.html. Inclúyelo en el commit.`);
  }
  return html.replace(re, '');
}

// ---------- 2b. Imágenes embebidas ----------
async function extraerRecursos(html) {
  const re = /<(img)\b([^>]*?)\b(src)="data:([a-z0-9/.+-]+);base64,([A-Za-z0-9+/=]+)"([^>]*)>/g;
  const ocurrencias = [...html.matchAll(re)];
  const grupos = new Map();
  for (const m of ocurrencias) {
    const bytes = Buffer.from(m[5], 'base64');
    const k = hash(bytes);
    const g = grupos.get(k) || { bytes, mime: m[4], tag: m[1], altos: [], atributos: m[2] + m[6] };
    const h = altoCss(m[2] + m[6]);
    if (h) g.altos.push(h);
    grupos.set(k, g);
  }

  const reporte = [];
  for (const [k, g] of grupos) {
    const meta = await sharp(g.bytes).metadata();
    const objetivo = g.altos.length ? Math.ceil(Math.max(...g.altos) * DPR) : meta.height;
    const reducir = objetivo < meta.height;
    const nombre = slug((g.atributos.match(/alt="([^"]*)"/) || [])[1] || k);
    let salida, ext;
    if (g.mime === 'image/png') {
      let img = sharp(g.bytes);
      if (reducir) img = img.resize({ height: objetivo, kernel: 'lanczos3' });
      const webp = await img.webp({ lossless: true, effort: 6 }).toBuffer();
      // Si el WebP sin pérdida no es más liviano y no hubo reducción, se conserva el PNG original.
      if (!reducir && webp.length >= g.bytes.length) [salida, ext] = [g.bytes, 'png'];
      else [salida, ext] = [webp, 'webp'];
    } else if (g.mime === 'image/jpeg') {
      if (reducir) [salida, ext] = [await sharp(g.bytes).resize({ height: objetivo, kernel: 'lanczos3' }).jpeg({ quality: 92, mozjpeg: true }).toBuffer(), 'jpg'];
      else [salida, ext] = [g.bytes, 'jpg'];
    } else {
      [salida, ext] = [g.bytes, g.mime.split('/')[1]];
    }
    const final = await sharp(salida).metadata();
    g.url = await escribir(path.join('assets', 'img', `${nombre}.${hash(salida)}.${ext}`), salida);
    g.dim = { w: final.width, h: final.height };
    reporte.push([nombre, kb(g.bytes.length), kb(salida.length), `${meta.width}x${meta.height} -> ${final.width}x${final.height}`]);
  }

  let primera = true;
  html = html.replace(re, (todo, tag, antes, attr, mime, b64, despues) => {
    const g = grupos.get(hash(Buffer.from(b64, 'base64')));
    const carga = primera ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"';
    primera = false;
    return `<img${antes}src="${g.url}" width="${g.dim.w}" height="${g.dim.h}"${carga}${despues}>`;
  });
  return { html, reporte, ocurrencias: ocurrencias.length, unicos: grupos.size };
}

// ---------- 3. Scripts inline -> archivos ----------
async function externalizarScripts(html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  for (const [todo, codigo] of scripts) {
    const buf = Buffer.from(codigo.trim() + '\n');
    const url = await escribir(path.join('assets', 'js', `sitio.${hash(buf)}.js`), buf);
    html = html.replace(todo, () => `<script src="${url}"></script>`);
  }
  return html;
}

// ---------- 4. Favicon ----------
function ico(pngs) {
  const cab = Buffer.alloc(6 + 16 * pngs.length);
  cab.writeUInt16LE(0, 0); cab.writeUInt16LE(1, 2); cab.writeUInt16LE(pngs.length, 4);
  let offset = cab.length;
  pngs.forEach(({ size, buf }, i) => {
    const e = 6 + i * 16;
    cab.writeUInt8(size >= 256 ? 0 : size, e); cab.writeUInt8(size >= 256 ? 0 : size, e + 1);
    cab.writeUInt16LE(1, e + 4); cab.writeUInt16LE(32, e + 6);
    cab.writeUInt32LE(buf.length, e + 8); cab.writeUInt32LE(offset, e + 12);
    offset += buf.length;
  });
  return Buffer.concat([cab, ...pngs.map((p) => p.buf)]);
}

async function favicons() {
  const svg = await readFile(path.join(SRC, 'favicon.svg'));
  const png = (n, fondo) => {
    let img = sharp(svg, { density: Math.ceil((72 * n) / 64) * 4 }).resize(n, n);
    if (fondo) img = img.flatten({ background: '#0C1630' });
    return img.png({ compressionLevel: 9 }).toBuffer();
  };
  await escribir('favicon.svg', svg);
  await escribir('favicon.ico', ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, buf: await png(size) })))));
  await escribir('apple-touch-icon.png', await png(180, true));
  await escribir('icon-192.png', await png(192, true));
  await escribir('icon-512.png', await png(512, true));
  await escribir('site.webmanifest', Buffer.from(JSON.stringify({
    name: 'Cognición en Movimiento · COGNI-move',
    short_name: 'COGNI-move',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
    theme_color: '#0C1630',
    background_color: '#FFFFFF',
    display: 'browser',
    start_url: '/',
  }, null, 2)));
}

// ---------- 5. Panel de administración ----------
async function copiarAdmin() {
  for (const f of await readdir(path.join(SRC, 'admin'))) {
    await mkdir(path.join(OUT, 'admin'), { recursive: true });
    await copyFile(path.join(SRC, 'admin', f), path.join(OUT, 'admin', f));
  }
}

// ---------- Ejecución ----------
const inicio = Date.now();
await rm(OUT, { recursive: true, force: true });
const fuente = await readFile(path.join(SRC, 'index.html'), 'utf8');
const sinDescargables = await retirarDescargables(fuente);
await validarCatalogo(fuente);
if (errores.length) {
  console.error('Build detenido:\n- ' + errores.join('\n- '));
  process.exit(1);
}
let { html, reporte, ocurrencias, unicos } = await extraerRecursos(sinDescargables);
html = await externalizarScripts(html);
if (/(src|href)="data:/.test(html)) throw new Error('Quedó un recurso embebido sin extraer');
await escribir('index.html', Buffer.from(html));
await escribir('robots.txt', Buffer.from('User-agent: *\nDisallow: /api/\n'));
await favicons();
await copiarAdmin();

const pesoOriginal = Buffer.byteLength(fuente);
const pesoHtml = Buffer.byteLength(html);
console.log(`\nRecursos embebidos: ${ocurrencias} referencias, ${unicos} archivos únicos`);
console.table(reporte.map(([nombre, antes, despues, dim]) => ({ nombre, antes, despues, dim })));
console.log(`HTML: ${kb(pesoOriginal)} -> ${kb(pesoHtml)}  ·  build en ${Date.now() - inicio} ms`);
