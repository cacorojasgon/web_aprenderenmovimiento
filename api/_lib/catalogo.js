// Catálogo único del sitio. Lo usan las funciones (listas permitidas) y scripts/build.mjs,
// que falla si el HTML menciona un recurso, motivo o país que no esté aquí.

export const RECURSOS = [
  {
    id: 'plantilla-ficha-aula',
    nombre: 'Plantilla de ficha de actividad en aula',
    formato: 'Word (.docx)',
    etapas: ['Primera infancia', 'Etapa escolar'],
  },
];

export const VERSIONES_LICENCIA = ['1.0'];

export const EVENTOS = {
  descarga: 'Descarga con licencia aceptada',
  copia_licencia: 'Copia de la licencia guardada',
};

export const ORIGENES = {
  inf: 'Aplicaciones · Primera infancia',
  esc: 'Aplicaciones · Etapa escolar',
  adu: 'Aplicaciones · Adultez',
  otro: 'Otra sección',
};

export const MOTIVOS = [
  'Solicitar información general',
  'Implementar la estrategia en aula',
  'Implementar el programa deportivo Sport+EF',
  'Evaluación y formación cognitivo-motora en adultez',
  'Solicitar un manual',
  'Solicitar una jornada o formación',
  'Proponer el modelo en mi escuela',
  'Investigación, tesis o colaboración',
  'Otro',
];

export const PAISES = [
  'Chile', 'Argentina', 'Bolivia', 'Brasil', 'Colombia', 'Ecuador', 'España',
  'México', 'Perú', 'Uruguay', 'Estados Unidos', 'Otro',
];
