// Generador mínimo de archivos .xlsx (Office Open XML) sin dependencias.
// Hojas con encabezado en negrita, fila fija, autofiltro, números y fechas reales de Excel.
// Uso: XLSXMin.descargar('archivo.xlsx', [{ nombre, columnas: [{ titulo, ancho, tipo: 'texto'|'numero'|'fecha' }], filas: [[...]] }])
(function () {
  'use strict';

  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // ZIP sin compresión (método "store"): válido para Excel y simple de verificar.
  function zip(archivos) {
    var enc = new TextEncoder();
    var partes = [], central = [], offset = 0;
    var ahora = new Date();
    var hora = (ahora.getHours() << 11) | (ahora.getMinutes() << 5) | (ahora.getSeconds() >> 1);
    var fecha = ((ahora.getFullYear() - 1980) << 9) | ((ahora.getMonth() + 1) << 5) | ahora.getDate();
    archivos.forEach(function (a) {
      var nombre = enc.encode(a.nombre), datos = enc.encode(a.contenido), crc = crc32(datos);
      var loc = new DataView(new ArrayBuffer(30));
      loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true);
      loc.setUint16(8, 0, true); loc.setUint16(10, hora, true); loc.setUint16(12, fecha, true);
      loc.setUint32(14, crc, true); loc.setUint32(18, datos.length, true); loc.setUint32(22, datos.length, true);
      loc.setUint16(26, nombre.length, true); loc.setUint16(28, 0, true);
      var cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
      cen.setUint16(10, 0, true); cen.setUint16(12, hora, true); cen.setUint16(14, fecha, true);
      cen.setUint32(16, crc, true); cen.setUint32(20, datos.length, true); cen.setUint32(24, datos.length, true);
      cen.setUint16(28, nombre.length, true); cen.setUint32(42, offset, true);
      partes.push(new Uint8Array(loc.buffer), nombre, datos);
      central.push(new Uint8Array(cen.buffer), nombre);
      offset += 30 + nombre.length + datos.length;
    });
    var tamCentral = central.reduce(function (s, p) { return s + p.length; }, 0);
    var fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
    fin.setUint32(12, tamCentral, true); fin.setUint32(16, offset, true);
    return new Blob(partes.concat(central, [new Uint8Array(fin.buffer)]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function xml(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; })
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }

  function columna(i) {
    var s = '';
    for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  }

  // Fecha -> número de serie de Excel, usando la hora local que entrega `partes` (Chile).
  function serieExcel(d) {
    return (Date.UTC(d.y, d.m - 1, d.d, d.h, d.mi, d.s) - Date.UTC(1899, 11, 30)) / 86400000;
  }

  function hoja(h) {
    var filas = [];
    var cab = h.columnas.map(function (c, i) {
      return '<c r="' + columna(i) + '1" t="inlineStr" s="1"><is><t>' + xml(c.titulo) + '</t></is></c>';
    }).join('');
    filas.push('<row r="1">' + cab + '</row>');
    h.filas.forEach(function (f, n) {
      var r = n + 2;
      var celdas = f.map(function (v, i) {
        var ref = columna(i) + r, tipo = h.columnas[i].tipo;
        if (v === null || v === undefined || v === '') return '';
        if (tipo === 'numero') return '<c r="' + ref + '"><v>' + Number(v) + '</v></c>';
        if (tipo === 'fecha') return '<c r="' + ref + '" s="2"><v>' + serieExcel(v) + '</v></c>';
        if (tipo === 'dia') return '<c r="' + ref + '" s="3"><v>' + serieExcel(v) + '</v></c>';
        return '<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + xml(v) + '</t></is></c>';
      }).join('');
      filas.push('<row r="' + r + '">' + celdas + '</row>');
    });
    var ultima = columna(h.columnas.length - 1) + (h.filas.length + 1);
    var cols = '<cols>' + h.columnas.map(function (c, i) {
      return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + (c.ancho || 16) + '" customWidth="1"/>';
    }).join('') + '</cols>';
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      cols + '<sheetData>' + filas.join('') + '</sheetData>' +
      (h.filas.length ? '<autoFilter ref="A1:' + ultima + '"/>' : '') +
      '</worksheet>';
  }

  function libro(hojas) {
    var NS = 'http://schemas.openxmlformats.org/';
    var archivos = [
      { nombre: '[Content_Types].xml', contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="' + NS + 'package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        hojas.map(function (_, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') + '</Types>' },
      { nombre: '_rels/.rels', contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="' + NS + 'package/2006/relationships"><Relationship Id="rId1" Type="' + NS + 'officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { nombre: 'xl/workbook.xml', contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="' + NS + 'spreadsheetml/2006/main" xmlns:r="' + NS + 'officeDocument/2006/relationships"><sheets>' +
        hojas.map(function (h, i) { return '<sheet name="' + xml(h.nombre.slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets>' +
        '<definedNames>' + hojas.map(function (h, i) { return h.filas.length ? '<definedName name="_xlnm._FilterDatabase" localSheetId="' + i + '" hidden="1">\'' + xml(h.nombre.slice(0, 31)) + '\'!$A$1:$' + columna(h.columnas.length - 1) + '$' + (h.filas.length + 1) + '</definedName>' : ''; }).join('') + '</definedNames></workbook>' },
      { nombre: 'xl/_rels/workbook.xml.rels', contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="' + NS + 'package/2006/relationships">' +
        hojas.map(function (_, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="' + NS + 'officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
        '<Relationship Id="rId' + (hojas.length + 1) + '" Type="' + NS + 'officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { nombre: 'xl/styles.xml', contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="' + NS + 'spreadsheetml/2006/main">' +
        '<numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd"/></numFmts>' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE3E9FB"/></patternFill></fill></fills>' +
        '<borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs>' +
        '<cellXfs count="4"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="165" applyNumberFormat="1"/></cellXfs>' +
        '</styleSheet>' },
    ];
    hojas.forEach(function (h, i) { archivos.push({ nombre: 'xl/worksheets/sheet' + (i + 1) + '.xml', contenido: hoja(h) }); });
    return zip(archivos);
  }

  function descargar(nombre, hojas) {
    var url = URL.createObjectURL(libro(hojas));
    var a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  window.XLSXMin = { libro: libro, descargar: descargar };
})();
