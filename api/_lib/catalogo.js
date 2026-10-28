// Catálogo único del sitio. Lo usan las funciones (listas permitidas) y scripts/build.mjs,
// que falla si el HTML menciona un recurso, motivo o país que no esté aquí.

// Los archivos viven en recursos/ (fuera de public/): solo /api/descarga los entrega,
// después de validar la aceptación de la licencia y registrar la descarga.
export const RECURSOS = [
  {
    id: 'plantilla-ficha-aula',
    nombre: 'Plantilla de ficha de actividad en aula',
    formato: 'Word (.docx)',
    etapas: ['Primera infancia', 'Etapa escolar'],
    archivo: 'plantilla-ficha-aula.docx',
    descarga: 'Plantilla_ficha_de_actividad_Cognicion_en_Movimiento.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    // id del <a> oculto con el archivo embebido en src/index.html, si se vuelve a pegar una versión offline
    ancla: 'archivo-plantilla-ficha',
  },
];

// Versión vigente al final; las anteriores se mantienen para leer el registro histórico.
export const VERSIONES_LICENCIA = ['1.0', '1.1'];
export const VERSION_VIGENTE = VERSIONES_LICENCIA.at(-1);

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
