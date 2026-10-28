// Servidor local que imita Vercel: sirve public/ con los headers de vercel.json y ejecuta api/*.js.
// Con DEV_MOCK=1 simula Upstash (en memoria) y Resend (los correos se muestran en consola),
// así se prueba todo sin credenciales reales.
// Uso: npm run build && DEV_MOCK=1 npm run dev
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RAIZ = path.resolve(import.meta.dirname, '..');
// Variables locales opcionales en .env.local (ignorado por git), formato CLAVE=valor.
try {
  for (const linea of (await readFile(path.join(RAIZ, '.env.local'), 'utf8')).split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch {
  // Sin .env.local se usan solo las variables del entorno.
}
const PUERTO = +(process.env.PORT || 5180);
const cfg = JSON.parse(await readFile(path.join(RAIZ, 'vercel.json'), 'utf8'));
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

const reglas = cfg.headers.map((h) => ({ re: new RegExp('^' + h.source.replace('/:path*', '(?:/.*)?') + '$'), headers: h.headers }));
function headersPara(ruta) {
  const out = {};
  for (const r of reglas) if (r.re.test(ruta)) for (const h of r.headers) out[h.key] = h.value;
  return out;
}

// ---------- Simulaciones ----------
const correos = [];
if (process.env.DEV_MOCK) {
  process.env.KV_REST_API_URL = `http://localhost:${PUERTO}/__kv`;
  process.env.KV_REST_API_TOKEN = 'dev';
  process.env.RESEND_API_KEY ||= 'dev';
  process.env.CONTACT_TO ||= 'christian.campos@unab.cl';
  const fetchReal = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    if (String(url).startsWith('https://api.resend.com/')) {
      const correo = JSON.parse(opts.body);
      correos.push(correo);
      console.log(`\n[correo simulado] Para: ${correo.to} · Responder a: ${correo.reply_to}\nAsunto: ${correo.subject}\n${correo.text}`);
      return new Response(JSON.stringify({ id: 'dev-' + correos.length }), { status: 200 });
    }
    return fetchReal(url, opts);
  };
}
const kv = new Map();
function kvComando([cmd, clave, ...args]) {
  switch (cmd.toUpperCase()) {
    case 'INCR': kv.set(clave, (+kv.get(clave) || 0) + 1); return kv.get(clave);
    case 'EXPIRE': return 1;
    case 'LPUSH': { const l = kv.get(clave) || []; l.unshift(...args); kv.set(clave, l); return l.length; }
    case 'LRANGE': { const l = kv.get(clave) || []; const fin = +args[1] < 0 ? l.length + +args[1] + 1 : +args[1] + 1; return l.slice(+args[0], fin); }
    default: throw new Error('comando no simulado: ' + cmd);
  }
}

// ---------- Servidor ----------
async function leerCuerpo(req) {
  const partes = [];
  for await (const p of req) partes.push(p);
  return Buffer.concat(partes);
}

async function api(req, res, ruta) {
  const archivo = path.join(RAIZ, ruta + '.js');
  try { await stat(archivo); } catch { res.writeHead(404).end(); return; }
  const mod = await import(pathToFileURL(archivo).href);
  const fn = mod[req.method];
  if (!fn) { res.writeHead(405).end(); return; }
  const cuerpo = ['GET', 'HEAD'].includes(req.method) ? undefined : await leerCuerpo(req);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  headers.set('x-real-ip', req.socket.remoteAddress || '127.0.0.1');
  const respuesta = await fn(new Request(`http://localhost:${PUERTO}${req.url}`, { method: req.method, headers, body: cuerpo }));
  const salida = Object.fromEntries(respuesta.headers);
  res.writeHead(respuesta.status, salida).end(Buffer.from(await respuesta.arrayBuffer()));
}

http.createServer(async (req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    if (ruta === '/__kv/pipeline' && process.env.DEV_MOCK) {
      const comandos = JSON.parse(await leerCuerpo(req));
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(comandos.map((c) => ({ result: kvComando(c) }))));
      return;
    }
    if (ruta === '/__correos' && process.env.DEV_MOCK) { res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(correos)); return; }
    if (ruta.startsWith('/api/')) return await api(req, res, ruta.slice(1));
    let archivo = path.join(RAIZ, 'public', ruta);
    if (!archivo.startsWith(path.join(RAIZ, 'public'))) { res.writeHead(403).end(); return; }
    let s = await stat(archivo).catch(() => null);
    if (s?.isDirectory()) { archivo = path.join(archivo, 'index.html'); s = await stat(archivo).catch(() => null); }
    if (!s) { archivo += '.html'; s = await stat(archivo).catch(() => null); }
    if (!s) { res.writeHead(404, headersPara(ruta)).end('No encontrado'); return; }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream', ...headersPara(ruta) });
    res.end(await readFile(archivo));
  } catch (e) {
    console.error(e);
    res.writeHead(500).end('Error');
  }
}).listen(PUERTO, () => console.log(`Sitio en http://localhost:${PUERTO}${process.env.DEV_MOCK ? '  (almacenamiento y correo simulados)' : ''}`));
