// Borra de Upstash todos los registros de descargas y licencias firmadas (cm:eventos y cm:lic:*).
// Sin --confirmar solo cuenta lo que hay. Requiere KV_REST_API_URL y KV_REST_API_TOKEN, por ejemplo:
//   npx vercel env pull .env.local
//   node --env-file=.env.local scripts/borrar-registros.mjs             (solo cuenta)
//   node --env-file=.env.local scripts/borrar-registros.mjs --confirmar (borra)
import { kvConfigurado, pipeline, comando, CLAVE_EVENTOS } from '../api/_lib/kv.js';
import { claveLicencia } from '../api/_lib/firma.js';

if (!kvConfigurado()) {
  console.error('Faltan KV_REST_API_URL y KV_REST_API_TOKEN (o UPSTASH_REDIS_REST_URL / _TOKEN).');
  process.exit(1);
}

const patron = claveLicencia('*');
const licencias = [];
let cursor = '0';
do {
  const [siguiente, claves] = await comando('SCAN', cursor, 'MATCH', patron, 'COUNT', '500');
  licencias.push(...claves);
  cursor = siguiente;
} while (cursor !== '0');

const eventos = await comando('LLEN', CLAVE_EVENTOS);
console.log(`Eventos en ${CLAVE_EVENTOS}: ${eventos}`);
console.log(`Licencias firmadas (${patron}): ${licencias.length}`);

if (!process.argv.includes('--confirmar')) {
  console.log('\nNo se borró nada. Agrega --confirmar para borrar estos registros.');
  process.exit(0);
}

const claves = [CLAVE_EVENTOS, ...licencias];
let borradas = 0;
for (let i = 0; i < claves.length; i += 500) {
  const [n] = await pipeline([['DEL', ...claves.slice(i, i + 500)]]);
  borradas += n;
}
const quedan = await comando('LLEN', CLAVE_EVENTOS);
console.log(`\nClaves borradas: ${borradas}. Eventos restantes: ${quedan}.`);
