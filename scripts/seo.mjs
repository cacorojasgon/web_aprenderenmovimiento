// Datos estructurados (JSON-LD de schema.org) y archivos para buscadores, generados desde src/index.html.
// Las publicaciones, el equipo y las preguntas frecuentes se leen de la propia página, así que se mantienen
// al día solos al editar el contenido. Prioridad de audiencia: académica, docente e institucional.

export const SITIO = 'https://cognicionenmovimiento.cl';

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const limpiar = (s) => s
  .replace(/<[^>]+>/g, ' ')
  .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => (e[0] === '#'
    ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1))
    : ENTIDADES[e.toLowerCase()] ?? m))
  .replace(/\s+/g, ' ')
  .trim();

const UNAB = {
  '@type': 'CollegeOrUniversity',
  '@id': 'https://www.unab.cl/#universidad',
  name: 'Universidad Andrés Bello',
  alternateName: 'UNAB',
  url: 'https://www.unab.cl/',
};
const FACULTAD = {
  '@type': 'Organization',
  '@id': `${SITIO}/#facultad`,
  name: 'Facultad de Ciencias de la Rehabilitación, Universidad Andrés Bello',
  parentOrganization: { '@id': UNAB['@id'] },
};
const ANID = {
  '@type': 'GovernmentOrganization',
  '@id': 'https://anid.cl/#anid',
  name: 'Agencia Nacional de Investigación y Desarrollo (ANID)',
  url: 'https://anid.cl/',
};

export function publicaciones(html) {
  const re = /<a\b[^>]*href="https:\/\/doi\.org\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  return [...html.matchAll(re)].map(([, doi, cuerpo]) => {
    const partes = [...cuerpo.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/g)].map((m) => limpiar(m[1]));
    const [revista, anio] = (partes[0] || '').split(' · ');
    return { doi, revista, anio, titulo: partes[1] || '' };
  }).filter((p) => p.titulo && /^\d{4}$/.test(p.anio || ''));
}

export function equipo(html) {
  const seccion = (html.match(/<section id="equipo"[\s\S]*?<\/section>/) || [''])[0];
  return [...seccion.matchAll(/<h3\b[^>]*>(Dra?\.\s[^<]+)<\/h3>\s*<p\b[^>]*>([\s\S]*?)<\/p>/g)]
    .map(([, nombre, desc]) => ({ nombre: limpiar(nombre), descripcion: limpiar(desc) }));
}

export function preguntas(html) {
  return [...html.matchAll(/<details class="faq-q"><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
    .map(([, p, r]) => ({ pregunta: limpiar(p), respuesta: limpiar(r) }));
}

export function jsonLd(html) {
  const titulo = limpiar((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
  const descripcion = limpiar((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '');
  const programa = {
    '@type': 'ResearchOrganization',
    '@id': `${SITIO}/#programa`,
    name: 'Cognición en Movimiento',
    alternateName: ['COGNI-move', 'Cognition in Motion'],
    url: `${SITIO}/`,
    logo: `${SITIO}/icon-512.png`,
    description: descripcion,
    parentOrganization: { '@id': FACULTAD['@id'] },
    knowsAbout: [
      'estrategia cognitivo-motora', 'actividad física cognitivamente enriquecida', 'funciones ejecutivas',
      'cognición corporizada', 'teoría de la carga cognitiva', 'aprendizaje con movimiento en el aula',
      'deporte cognitivamente enriquecido', 'evaluación cognitivo-motora', 'formación docente',
    ],
    areaServed: 'Chile',
  };
  const personas = equipo(html).map((p, i) => ({
    '@type': 'Person',
    '@id': `${SITIO}/#persona-${i + 1}`,
    name: p.nombre.replace(/^Dra?\.\s/, ''),
    honorificPrefix: p.nombre.split(' ')[0],
    description: p.descripcion,
    affiliation: { '@id': UNAB['@id'] },
    worksFor: { '@id': programa['@id'] },
  }));
  const articulos = publicaciones(html).map((a) => ({
    '@type': 'ScholarlyArticle',
    '@id': `https://doi.org/${a.doi}`,
    headline: a.titulo,
    name: a.titulo,
    datePublished: a.anio,
    inLanguage: 'en',
    isAccessibleForFree: true,
    identifier: { '@type': 'PropertyValue', propertyID: 'DOI', value: a.doi },
    url: `https://doi.org/${a.doi}`,
    isPartOf: { '@type': 'Periodical', name: a.revista },
    sourceOrganization: { '@id': programa['@id'] },
  }));
  const proyecto = {
    '@type': 'ResearchProject',
    '@id': `${SITIO}/#sport-ef`,
    name: 'Sport+EF: deporte cognitivamente enriquecido',
    description: 'Proyecto FONDECYT de Iniciación en Investigación 2024, Folio 11240068: talleres deportivos cognitivamente enriquecidos y su efecto en las funciones ejecutivas y el rendimiento académico de escolares de 3° y 4° básico.',
    identifier: 'FONDECYT 11240068',
    funder: { '@id': ANID['@id'] },
    parentOrganization: { '@id': programa['@id'] },
  };
  const sitio = {
    '@type': 'WebSite',
    '@id': `${SITIO}/#sitio`,
    url: `${SITIO}/`,
    name: 'Cognición en Movimiento · COGNI-move',
    inLanguage: ['es-CL', 'en-US'],
    publisher: { '@id': programa['@id'] },
  };
  const pagina = {
    '@type': 'WebPage',
    '@id': `${SITIO}/#pagina`,
    url: `${SITIO}/`,
    name: titulo,
    description: descripcion,
    inLanguage: 'es-CL',
    isPartOf: { '@id': sitio['@id'] },
    about: { '@id': programa['@id'] },
  };
  const faq = preguntas(html);
  const grafo = [programa, FACULTAD, UNAB, ANID, sitio, pagina, proyecto, ...personas, ...articulos];
  if (faq.length) {
    grafo.push({
      '@type': 'FAQPage',
      '@id': `${SITIO}/#preguntas`,
      isPartOf: { '@id': pagina['@id'] },
      mainEntity: faq.map((q) => ({ '@type': 'Question', name: q.pregunta, acceptedAnswer: { '@type': 'Answer', text: q.respuesta } })),
    });
  }
  return { '@context': 'https://schema.org', '@graph': grafo };
}

// JSON dentro de <script>: se escapa "<" para que ningún texto pueda cerrar la etiqueta.
export const scriptJsonLd = (datos) => `<script type="application/ld+json">${JSON.stringify(datos).replace(/</g, '\\u003c')}</script>`;

export const robots = () => `User-agent: *\nDisallow: /api/\n\nSitemap: ${SITIO}/sitemap.xml\n`;

export const sitemap = () => '<?xml version="1.0" encoding="UTF-8"?>\n'
  + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  + `  <url><loc>${SITIO}/</loc></url>\n`
  + '</urlset>\n';
