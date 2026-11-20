import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { jsonLd, scriptJsonLd, publicaciones, equipo, preguntas, robots, sitemap, SITIO } from '../scripts/seo.mjs';

const html = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');

test('seo: título y descripción dentro del largo que muestran los buscadores', () => {
  const titulo = html.match(/<title>([^<]*)<\/title>/)[1];
  const desc = html.match(/<meta name="description" content="([^"]*)"/)[1];
  assert.ok(titulo.length <= 60, `título de ${titulo.length} caracteres`);
  assert.ok(desc.length >= 110 && desc.length <= 160, `descripción de ${desc.length} caracteres`);
  assert.match(titulo, /cognitivo-motora/);
  assert.match(desc, /funciones ejecutivas/);
});

test('seo: URL canónica, Open Graph y marca para los datos estructurados', () => {
  assert.match(html, new RegExp(`<link rel="canonical" href="${SITIO}/">`));
  for (const p of ['og:type', 'og:title', 'og:description', 'og:url', 'og:locale']) assert.match(html, new RegExp(`property="${p}"`));
  assert.ok(html.includes('<!-- seo:jsonld -->'));
});

test('seo: los datos estructurados salen de la página (publicaciones, equipo y preguntas)', () => {
  const pubs = publicaciones(html);
  assert.ok(pubs.length >= 3);
  for (const p of pubs) assert.match(p.doi, /^10\.\d{4,}\/\S+$/);
  assert.equal(equipo(html).length, 2);
  for (const p of equipo(html)) assert.match(p.orcid || '', /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/, `${p.nombre} sin ORCID`);
  const personas = jsonLd(html)['@graph'].filter((n) => n['@type'] === 'Person');
  for (const p of personas) assert.match(p.sameAs[0], /^https:\/\/orcid\.org\//);
  assert.ok(preguntas(html).length >= 10);
  const datos = jsonLd(html);
  const tipos = datos['@graph'].map((n) => n['@type']);
  for (const t of ['ResearchOrganization', 'CollegeOrUniversity', 'WebSite', 'WebPage', 'ResearchProject', 'Person', 'ScholarlyArticle', 'FAQPage']) {
    assert.ok(tipos.includes(t), `falta ${t}`);
  }
  // Toda referencia @id apunta a un nodo del grafo.
  const ids = new Set(datos['@graph'].map((n) => n['@id']));
  const refs = JSON.stringify(datos).match(/\{"@id":"[^"]+"\}/g) || [];
  for (const r of refs) assert.ok(ids.has(JSON.parse(r)['@id']), `referencia rota ${r}`);
});

test('seo: el JSON-LD no puede cerrar la etiqueta <script>', () => {
  const s = scriptJsonLd({ texto: '</script><script>alert(1)</script>' });
  assert.equal(s.match(/<\/script>/g).length, 1);
  assert.deepEqual(JSON.parse(s.replace(/^<script[^>]*>|<\/script>$/g, '')), { texto: '</script><script>alert(1)</script>' });
});

test('seo: robots.txt anuncia el sitemap y el sitemap usa el dominio canónico', () => {
  assert.match(robots(), new RegExp(`Sitemap: ${SITIO}/sitemap.xml`));
  assert.match(robots(), /Disallow: \/api\//);
  assert.match(sitemap(), new RegExp(`<loc>${SITIO}/</loc>`));
});
