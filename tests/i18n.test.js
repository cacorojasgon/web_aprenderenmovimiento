import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { textosTraducibles, leerDiccionarios, revisarDiccionario } from '../scripts/i18n.mjs';

const html = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
const diccionarios = await leerDiccionarios(new URL('../src/i18n/', import.meta.url).pathname);

test('idiomas: existe el diccionario de inglés', () => {
  assert.ok(diccionarios.en, 'falta src/i18n/en.json');
});

test('idiomas: cada texto visible de la página tiene traducción y ninguna se repite', () => {
  for (const [idioma, dic] of Object.entries(diccionarios)) {
    const { faltan, repetidas } = revisarDiccionario(html, dic);
    assert.deepEqual(faltan, [], `textos sin traducción en ${idioma}.json`);
    assert.deepEqual(repetidas, [], `traducciones repetidas en ${idioma}.json`);
  }
});

test('idiomas: el texto firmable de la licencia y los elementos translate="no" no se traducen', () => {
  const textos = textosTraducibles(html);
  assert.ok(!textos.some((t) => t.startsWith('Cláusula Primera')), 'el texto de la licencia no debe traducirse');
  assert.ok(!textos.includes('English (US)'), 'el selector de idioma no debe traducirse');
  assert.ok(textos.includes('Licencia de uso del material'), 'el resumen de la licencia sí se traduce');
});

test('idiomas: los mensajes de error del servidor tienen traducción', async () => {
  const fuentes = ['contacto.js', 'descarga.js', 'licencia.js', 'licencia-correo.js', 'registro.js', '_lib/http.js'];
  for (const f of fuentes) {
    const codigo = await readFile(new URL(`../api/${f}`, import.meta.url), 'utf8');
    const mensajes = [...codigo.matchAll(/(?:error: |const [A-Z_]+ = )'([^']*[a-záéíóúñ][^']*\.)'/g)].map((m) => m[1]);
    for (const m of mensajes) assert.ok(diccionarios.en[m], `${f}: falta traducción de "${m}"`);
  }
});
