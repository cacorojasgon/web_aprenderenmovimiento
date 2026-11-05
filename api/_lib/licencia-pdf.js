// Genera el PDF de la licencia firmada a partir del registro y del texto exacto de la versión
// aceptada. Es determinista: el mismo registro produce siempre el mismo archivo, por lo que la
// copia del panel /admin es idéntica a la que recibió la persona.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { codigoVerificacion } from './firma.js';

const MM = 72 / 25.4;
const W = 210 * MM, H = 297 * MM;
const ML = 22 * MM, MR = 22 * MM, MT = 27 * MM, MB = 24 * MM, CW = W - ML - MR;
const C = {
  navy: rgb(20 / 255, 33 / 255, 61 / 255), texto: rgb(45 / 255, 52 / 255, 72 / 255), gris: rgb(112 / 255, 121 / 255, 141 / 255),
  linea: rgb(212 / 255, 218 / 255, 232 / 255), azul: rgb(35 / 255, 70 / 255, 200 / 255), fondo: rgb(243 / 255, 246 / 255, 251 / 255),
  verde: rgb(15 / 255, 124 / 255, 110 / 255),
};

// Helvetica estándar usa WinAnsi: lo que no se pueda codificar se reduce a su letra base.
const WIN = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
function win(s) {
  return [...String(s).normalize('NFC')].map((c) => {
    const n = c.codePointAt(0);
    if ((n >= 0x20 && n <= 0x7e) || (n >= 0xa0 && n <= 0xff) || WIN.includes(c)) return c;
    const base = c.normalize('NFD').replace(/\p{M}/gu, '');
    return base.length === 1 && base.codePointAt(0) < 0x7f ? base : '?';
  }).join('');
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function limpiar(html) {
  return html.replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (t, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? t))
    .replace(/\s+/g, ' ').trim();
}

// Estructura del <article> de la licencia: h2, p.lic-sub, h3, h4, p, ul/ol > li, dl > dt/dd.
export function bloquesLicencia(html) {
  const out = [];
  for (const [, tag, attrs, cuerpo] of html.matchAll(/<(h2|h3|h4|p|ul|ol|dl)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    if (tag === 'ul' || tag === 'ol') out.push({ tag, letra: /type="a"/.test(attrs), items: [...cuerpo.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => limpiar(m[1])) });
    else if (tag === 'dl') out.push({ tag, filas: [...cuerpo.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)].map((m) => [limpiar(m[1]), limpiar(m[2])]) });
    else out.push({ tag, sub: /lic-sub/.test(attrs), texto: limpiar(cuerpo) });
  }
  return out;
}

export function fechaChile(iso) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day}-${p.month}-${p.year}, ${p.hour}:${p.minute}:${p.second}`;
}

export async function pdfLicenciaFirmada(reg, recurso, licencia) {
  const doc = await PDFDocument.create({ updateMetadata: false });
  const fecha = new Date(reg.t);
  doc.setTitle(`Licencia de uso firmada · ${win(reg.n)}`);
  doc.setAuthor('Universidad Andrés Bello');
  doc.setSubject(`Licencia de usuario final, versión ${reg.v} · ID ${reg.id}`);
  doc.setCreator('Sitio web Cognición en Movimiento');
  doc.setProducer('Cognición en Movimiento');
  doc.setCreationDate(fecha);
  doc.setModificationDate(fecha);
  const F = await doc.embedFont(StandardFonts.Helvetica);
  const FB = await doc.embedFont(StandardFonts.HelveticaBold);

  let page, y;
  const lh = (fs) => fs * 1.42;
  function encabezado() {
    page.drawText(win('Universidad Andrés Bello · Programa Cognición en Movimiento (COGNI-move)'), { x: ML, y: H - 14 * MM, size: 7.5, font: F, color: C.gris });
    const t = win(`Licencia de uso del material · v${reg.v} · Copia firmada`);
    page.drawText(t, { x: W - MR - F.widthOfTextAtSize(t, 7.5), y: H - 14 * MM, size: 7.5, font: F, color: C.gris });
    page.drawLine({ start: { x: ML, y: H - 17 * MM }, end: { x: W - MR, y: H - 17 * MM }, thickness: 0.85, color: C.linea });
  }
  function nuevaPagina() { page = doc.addPage([W, H]); encabezado(); y = H - MT; }
  function asegurar(h) { if (y - h < MB) nuevaPagina(); }
  function partir(texto, font, fs, ancho) {
    const lineas = [];
    for (const parrafo of win(texto).split('\n')) {
      let linea = '';
      for (const palabra of parrafo.split(' ')) {
        const prueba = linea ? `${linea} ${palabra}` : palabra;
        if (font.widthOfTextAtSize(prueba, fs) <= ancho || !linea) linea = prueba;
        else { lineas.push(linea); linea = palabra; }
      }
      lineas.push(linea);
    }
    return lineas;
  }
  function bloque(texto, { fs = 9.5, font = F, color = C.texto, x = ML, ancho = CW, despues = 5, mantener = 0 } = {}) {
    const ls = partir(texto, font, fs, ancho);
    if (mantener) asegurar(lh(fs) * Math.min(ls.length, 2) + mantener);
    for (const l of ls) { asegurar(lh(fs)); page.drawText(l, { x, y: y - fs, size: fs, font, color }); y -= lh(fs); }
    y -= despues;
  }

  nuevaPagina();
  const bloques = bloquesLicencia(licencia.HTML);
  page.drawText('LICENCIA DE USUARIO FINAL · COPIA FIRMADA', { x: ML, y: y - 7.5, size: 7.5, font: FB, color: C.azul });
  y -= 20;
  const titulo = bloques.find((b) => b.tag === 'h2');
  const sub = bloques.find((b) => b.sub);
  if (titulo) bloque(titulo.texto, { fs: 15, font: FB, color: C.navy, despues: 3 });
  if (sub) bloque(sub.texto, { fs: 8.5, color: C.gris, despues: 8 });

  // Constancia de firma
  const filas = [
    ['Firmante', reg.n],
    ['Correo electrónico', reg.m],
    ['Recurso', recurso ? `${recurso.nombre} (${recurso.formato})` : reg.r],
    ['Versión de la licencia', reg.v],
    ...(typeof reg.sg === 'boolean' ? [['Contacto para seguimiento', reg.sg ? 'Sí autoriza (consentimiento opcional y revocable)' : 'No autoriza']] : []),
    ['Fecha y hora de la firma', `${fechaChile(reg.t)} (hora de Chile) · ${reg.t} UTC`],
    ['ID de aceptación', reg.id],
    ['Huella SHA-256 del texto', reg.h],
    ['Código de verificación', codigoVerificacion(reg.f)],
  ];
  const fsC = 8.6, colEt = 44 * MM, anchoVal = CW - colEt - 8 * MM;
  const medidas = filas.map(([et, val]) => partir(val, et === 'Firmante' ? FB : F, fsC, anchoVal));
  const nota = 'Firmada electrónicamente en el sitio web del programa al indicar nombre y correo, marcar la casilla de aceptación y presionar "Firmar y descargar", conforme a la Ley N° 19.799. La Universidad conserva un registro de igual contenido; el código de verificación permite comprobar la autenticidad de esta copia ante la Universidad.';
  const notaL = partir(nota, F, 7.8, CW - 8 * MM);
  const altoCaja = 16 + medidas.reduce((s, l) => s + l.length * lh(fsC) + 2, 0) + 6 + notaL.length * lh(7.8) + 8;
  asegurar(altoCaja + 10);
  const techo = y;
  page.drawRectangle({ x: ML, y: techo - altoCaja, width: CW, height: altoCaja, color: C.fondo });
  page.drawRectangle({ x: ML, y: techo - altoCaja, width: 1.4 * MM, height: altoCaja, color: C.verde });
  y -= 12;
  page.drawText(win('CONSTANCIA DE ACEPTACIÓN Y FIRMA ELECTRÓNICA'), { x: ML + 5 * MM, y: y - 8, size: 8, font: FB, color: C.verde });
  y -= 16;
  filas.forEach(([et, val], i) => {
    page.drawText(win(et), { x: ML + 5 * MM, y: y - fsC, size: fsC, font: FB, color: C.navy });
    medidas[i].forEach((l, j) => page.drawText(l, { x: ML + 5 * MM + colEt, y: y - fsC - j * lh(fsC), size: fsC, font: et === 'Firmante' ? FB : F, color: C.texto }));
    y -= medidas[i].length * lh(fsC) + 2;
  });
  y -= 6;
  notaL.forEach((l) => { page.drawText(l, { x: ML + 5 * MM, y: y - 7.8, size: 7.8, font: F, color: C.gris }); y -= lh(7.8); });
  y = techo - altoCaja - 16;

  // Texto de la licencia
  for (const b of bloques) {
    if (b.tag === 'h2' || b.sub) continue;
    if (b.tag === 'h3') {
      y -= 6; asegurar(50);
      page.drawText(win(b.texto.toUpperCase()), { x: ML, y: y - 10, size: 10, font: FB, color: C.navy });
      y -= lh(10) + 2;
      page.drawLine({ start: { x: ML, y }, end: { x: W - MR, y }, thickness: 1.1, color: C.navy });
      y -= 10;
    } else if (b.tag === 'h4') {
      y -= 4; bloque(b.texto, { fs: 9.8, font: FB, color: C.navy, mantener: 26, despues: 3 });
    } else if (b.tag === 'p') {
      bloque(b.texto);
    } else if (b.tag === 'ul' || b.tag === 'ol') {
      b.items.forEach((item, i) => {
        const marca = b.letra ? `${String.fromCharCode(97 + i)})` : '•';
        const ls = partir(item, F, 9.5, CW - 6 * MM);
        asegurar(lh(9.5) * Math.min(ls.length, 2));
        page.drawText(marca, { x: ML + 1, y: y - 9.5, size: 9.5, font: F, color: C.navy });
        ls.forEach((l) => { asegurar(lh(9.5)); page.drawText(l, { x: ML + 6 * MM, y: y - 9.5, size: 9.5, font: F, color: C.texto }); y -= lh(9.5); });
        y -= 3;
      });
      y -= 3;
    } else if (b.tag === 'dl') {
      const fs = 9, colDt = 42 * MM;
      page.drawLine({ start: { x: ML, y }, end: { x: W - MR, y }, thickness: 0.7, color: C.linea });
      for (const [dt, dd] of b.filas) {
        const a = partir(dt, FB, fs, colDt - 5 * MM), d = partir(dd, F, fs, CW - colDt - 4 * MM);
        const alto = Math.max(a.length, d.length) * lh(fs) + 14;
        if (y - alto < MB) { nuevaPagina(); page.drawLine({ start: { x: ML, y }, end: { x: W - MR, y }, thickness: 0.7, color: C.linea }); }
        page.drawRectangle({ x: ML, y: y - alto, width: colDt, height: alto, color: C.fondo });
        a.forEach((l, i) => page.drawText(l, { x: ML + 2.5 * MM, y: y - 7 - fs - i * lh(fs), size: fs, font: FB, color: C.navy }));
        d.forEach((l, i) => page.drawText(l, { x: ML + colDt + 2.5 * MM, y: y - 7 - fs - i * lh(fs), size: fs, font: F, color: C.texto }));
        y -= alto;
        page.drawLine({ start: { x: ML, y }, end: { x: W - MR, y }, thickness: 0.7, color: C.linea });
      }
      y -= 10;
    }
  }

  // Pie de página con identificación de la copia
  const paginas = doc.getPages();
  paginas.forEach((p, i) => {
    p.drawLine({ start: { x: ML, y: 15 * MM }, end: { x: W - MR, y: 15 * MM }, thickness: 0.85, color: C.linea });
    const firmante = reg.n.length > 38 ? `${reg.n.slice(0, 37)}…` : reg.n;
    p.drawText(win(`Firmada por ${firmante} · ${fechaChile(reg.t)} · ID ${reg.id}`), { x: ML, y: 10 * MM, size: 7.2, font: F, color: C.gris });
    const t = `Página ${i + 1} de ${paginas.length}`;
    p.drawText(win(t), { x: W - MR - F.widthOfTextAtSize(win(t), 7.2), y: 10 * MM, size: 7.2, font: F, color: C.gris });
  });
  return doc.save({ useObjectStreams: false });
}
