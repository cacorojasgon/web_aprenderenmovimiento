// Cliente mínimo de Upstash Redis por REST (integración de Vercel Marketplace), sin dependencias.
import { createHmac } from 'node:crypto';

const URL_KV = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN_KV = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const CLAVE_EVENTOS = 'cm:eventos';

export function kvConfigurado() {
  return Boolean(URL_KV() && TOKEN_KV());
}

export async function pipeline(comandos) {
  const r = await fetch(`${URL_KV()}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN_KV()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(comandos),
  });
  if (!r.ok) throw new Error(`KV ${r.status}`);
  const res = await r.json();
  const fallo = res.find((x) => x.error);
  if (fallo) throw new Error('KV comando');
  return res.map((x) => x.result);
}

export async function comando(...args) {
  return (await pipeline([args]))[0];
}

// Límite de frecuencia por ventana fija. La IP se guarda solo como HMAC y expira con la ventana.
export async function limitar(alcance, ip, maximo, ventanaSeg) {
  const secreto = process.env.SESSION_SECRET || '';
  const id = createHmac('sha256', secreto).update(ip).digest('base64url').slice(0, 22);
  const ventana = Math.floor(Date.now() / 1000 / ventanaSeg);
  const clave = `cm:rl:${alcance}:${id}:${ventana}`;
  const [n] = await pipeline([['INCR', clave], ['EXPIRE', clave, String(ventanaSeg)]]);
  return n <= maximo;
}
