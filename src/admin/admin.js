// Panel de descargas: login, filtros, KPIs, gráficos SVG, tablas y exportación a Excel.
// Todo texto proveniente de datos se inserta con textContent (nunca innerHTML).
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var SVG = 'http://www.w3.org/2000/svg';
  var ZONA = 'America/Santiago';
  var POR_PAGINA = 50;
  var datos = null, pagina = 0;
  var fmt = new Intl.NumberFormat('es-CL');

  // ---------- Fechas en hora de Chile ----------
  var partesFmt = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  function partes(iso) {
    var p = {};
    partesFmt.formatToParts(new Date(iso)).forEach(function (x) { p[x.type] = x.value; });
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, dia: p.year + '-' + p.month + '-' + p.day };
  }
  function diaAPartes(dia) { var a = dia.split('-'); return { y: +a[0], m: +a[1], d: +a[2], h: 0, mi: 0, s: 0 }; }
  function sumarDias(dia, n) { var d = new Date(dia + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function hoy() { return partes(new Date().toISOString()).dia; }
  function diaCorto(dia) { var a = dia.split('-'); return a[2] + '-' + a[1]; }
  function diaLargo(dia) { return new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(dia + 'T12:00:00Z')); }
  function fechaHora(iso) { return new Intl.DateTimeFormat('es-CL', { timeZone: ZONA, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)); }
  function lunes(dia) { var d = new Date(dia + 'T12:00:00Z'); return sumarDias(dia, -((d.getUTCDay() + 6) % 7)); }

  // ---------- API ----------
  function api(ruta, opciones) {
    opciones = opciones || {};
    return fetch(ruta, {
      method: opciones.method || 'GET',
      credentials: 'same-origin',
      headers: opciones.body ? { 'Content-Type': 'application/json' } : {},
      body: opciones.body ? JSON.stringify(opciones.body) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, ok: r.ok, j: j }; });
    });
  }

  function mostrar(vista) {
    $('vista-login').hidden = vista !== 'login';
    $('vista-panel').hidden = vista !== 'panel';
    $('vista-error').hidden = vista !== 'error';
  }

  function cargar() {
    $('vista-panel').classList.add('cargando');
    return api('/api/admin/datos').then(function (r) {
      $('vista-panel').classList.remove('cargando');
      if (r.status === 401) { mostrar('login'); $('form-login').elements.usuario.focus(); return; }
      if (!r.ok) { $('vista-error').textContent = r.j.error || 'No se pudo cargar el panel.'; mostrar('error'); return; }
      datos = r.j;
      prepararFiltroRecursos();
      $('actualizado').textContent = 'Actualizado ' + new Intl.DateTimeFormat('es-CL', { timeZone: ZONA, timeStyle: 'short' }).format(new Date(datos.generado));
      mostrar('panel');
      render();
    }).catch(function () {
      $('vista-panel').classList.remove('cargando');
      $('vista-error').textContent = 'No hay conexión con el servidor.';
      mostrar('error');
    });
  }

  // ---------- Login ----------
  $('form-login').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, boton = f.querySelector('button');
    boton.disabled = true;
    $('login-estado').textContent = '';
    api('/api/admin/login', { method: 'POST', body: { usuario: f.elements.usuario.value, password: f.elements.password.value } })
      .then(function (r) {
        boton.disabled = false;
        if (r.ok) { f.reset(); cargar(); }
        else { $('login-estado').textContent = r.j.error || 'No se pudo ingresar.'; f.elements.password.select(); }
      })
      .catch(function () { boton.disabled = false; $('login-estado').textContent = 'No hay conexión con el servidor.'; });
  });

  $('btn-salir').addEventListener('click', function () {
    api('/api/admin/logout', { method: 'POST', body: {} }).then(function () { datos = null; mostrar('login'); });
  });
  $('btn-actualizar').addEventListener('click', cargar);

  // ---------- Filtros ----------
  function prepararFiltroRecursos() {
    var sel = $('f-recurso'), actual = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    datos.recursos.forEach(function (r) { sel.add(new Option(r.nombre, r.id)); });
    sel.value = actual;
  }

  function rango() {
    var p = $('f-periodo').value, h = hoy();
    if (p === 'rango') {
      var desde = $('f-desde').value || h, hasta = $('f-hasta').value || h;
      return desde <= hasta ? { desde: desde, hasta: hasta } : { desde: hasta, hasta: desde };
    }
    if (p === 'todo') {
      var dias = datos.eventos.map(function (e) { return partes(e.t).dia; }).sort();
      return { desde: dias[0] || h, hasta: h };
    }
    return { desde: sumarDias(h, -(+p - 1)), hasta: h };
  }

  function textoFiltros(r) {
    var rec = $('f-recurso');
    return diaLargo(r.desde) + ' – ' + diaLargo(r.hasta) + ' · ' + rec.options[rec.selectedIndex].text;
  }

  $('f-periodo').addEventListener('change', function () {
    var personalizado = this.value === 'rango';
    document.querySelectorAll('.rango').forEach(function (l) { l.hidden = !personalizado; });
    if (personalizado && !$('f-desde').value) { var r = { desde: sumarDias(hoy(), -29), hasta: hoy() }; $('f-desde').value = r.desde; $('f-hasta').value = r.hasta; }
    pagina = 0; render();
  });
  ['f-desde', 'f-hasta', 'f-recurso'].forEach(function (id) { $(id).addEventListener('change', function () { pagina = 0; render(); }); });

  // ---------- Pestañas Resumen / Tablas ----------
  var tabs = [$('tab-resumen'), $('tab-tablas')];
  function activarTab(t) {
    tabs.forEach(function (x) {
      var on = x === t;
      x.setAttribute('aria-selected', String(on));
      x.tabIndex = on ? 0 : -1;
      $(x.getAttribute('aria-controls')).hidden = !on;
    });
    if (t === tabs[0]) renderGraficos();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { activarTab(t); });
    t.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var otro = tabs[(i + 1) % 2]; activarTab(otro); otro.focus();
    });
  });

  // ---------- Agregación ----------
  function calcular() {
    var r = rango(), recurso = $('f-recurso').value;
    var eventos = datos.eventos.map(function (e) { return Object.assign({ dia: partes(e.t).dia }, e); });
    var enRango = eventos.filter(function (e) { return e.dia >= r.desde && e.dia <= r.hasta && (!recurso || e.r === recurso); });
    var descargas = enRango.filter(function (e) { return e.e === 'descarga'; });

    var semanal = Math.round((new Date(r.hasta) - new Date(r.desde)) / 864e5) + 1 > 92;
    var cubetas = [], indice = {};
    for (var d = semanal ? lunes(r.desde) : r.desde; d <= r.hasta; d = sumarDias(d, semanal ? 7 : 1)) {
      indice[d] = cubetas.length; cubetas.push({ dia: d, n: 0 });
    }
    descargas.forEach(function (e) { var k = semanal ? lunes(e.dia) : e.dia; if (k in indice) cubetas[indice[k]].n++; });

    var porOrigen = Object.keys(datos.origenes).map(function (k) {
      return { id: k, nombre: datos.origenes[k], n: descargas.filter(function (e) { return e.o === k; }).length };
    });

    var porRecurso = datos.recursos.filter(function (x) { return !recurso || x.id === recurso; }).map(function (x) {
      var hist = eventos.filter(function (e) { return e.r === x.id && e.e === 'descarga'; });
      var per = enRango.filter(function (e) { return e.r === x.id; });
      var perDesc = per.filter(function (e) { return e.e === 'descarga'; });
      var ultima = hist.reduce(function (m, e) { return !m || e.t > m ? e.t : m; }, null);
      return {
        recurso: x,
        descargas: perDesc.length,
        historico: hist.length,
        sesiones: new Set(perDesc.map(function (e) { return e.s; })).size,
        copias: per.filter(function (e) { return e.e === 'copia_licencia'; }).length,
        ultima: ultima,
        versiones: Array.from(new Set(perDesc.map(function (e) { return e.v; }))).sort().join(', ') || '—',
      };
    });

    return {
      rango: r, semanal: semanal, enRango: enRango, cubetas: cubetas, porOrigen: porOrigen, porRecurso: porRecurso,
      kpi: {
        descargas: descargas.length,
        historico: eventos.filter(function (e) { return e.e === 'descarga' && (!recurso || e.r === recurso); }).length,
        sesiones: new Set(descargas.map(function (e) { return e.s; })).size,
        copias: enRango.filter(function (e) { return e.e === 'copia_licencia'; }).length,
        recursos: new Set(descargas.map(function (e) { return e.r; })).size,
        totalRecursos: porRecurso.length,
      },
    };
  }

  var calc = null;
  function render() {
    calc = calcular();
    var k = calc.kpi;
    $('k-descargas').textContent = fmt.format(k.descargas);
    $('k-descargas-nota').textContent = 'Total histórico: ' + fmt.format(k.historico);
    $('k-sesiones').textContent = fmt.format(k.sesiones);
    $('k-copias').textContent = fmt.format(k.copias);
    $('k-recursos').textContent = fmt.format(k.recursos);
    $('k-recursos-nota').textContent = 'de ' + fmt.format(k.totalRecursos) + ' disponible' + (k.totalRecursos === 1 ? '' : 's');
    $('g-dia-titulo').textContent = calc.semanal ? 'Descargas por semana' : 'Descargas por día';
    renderActivos();
    renderTablas();
    if (!$('vista-resumen').hidden) renderGraficos();
  }

  // ---------- Gráficos ----------
  function el(tag, attrs, padre) {
    var n = document.createElementNS(SVG, tag);
    for (var a in attrs) n.setAttribute(a, attrs[a]);
    if (padre) padre.appendChild(n);
    return n;
  }
  function pasoLimpio(max) {
    var bruto = Math.max(1, max / 4), p = Math.pow(10, Math.floor(Math.log10(bruto)));
    var paso = [1, 2, 5, 10].map(function (m) { return m * p; }).find(function (s) { return s >= bruto; });
    return Math.max(1, Math.round(paso));
  }
  // Barra con extremo de dato redondeado (4px) y base recta.
  function rutaBarra(x, y, w, h, vertical) {
    var r = Math.min(4, w / 2, h);
    if (vertical) return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
    return 'M' + x + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h - r) + 'Q' + (x + w) + ',' + (y + h) + ' ' + (x + w - r) + ',' + (y + h) + 'H' + x + 'Z';
  }

  var tooltip = $('tooltip');
  function verTooltip(valor, etiqueta, x, y) {
    tooltip.textContent = '';
    var s = document.createElement('strong'); s.textContent = valor; tooltip.appendChild(s);
    tooltip.appendChild(document.createTextNode(etiqueta));
    tooltip.hidden = false;
    var w = tooltip.offsetWidth;
    tooltip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2)) + 'px';
    tooltip.style.top = Math.max(8, y - tooltip.offsetHeight - 10) + 'px';
  }
  function ocultarTooltip() { tooltip.hidden = true; }

  function vacio(cont, texto) {
    cont.textContent = '';
    var d = document.createElement('div'); d.className = 'vacio'; d.textContent = texto; cont.appendChild(d);
  }

  function graficoColumnas(cont, cubetas, semanal) {
    var total = cubetas.reduce(function (s, c) { return s + c.n; }, 0);
    if (!total) return vacio(cont, 'Aún no hay descargas registradas en este período.');
    cont.textContent = '';
    var W = Math.max(280, cont.clientWidth), H = 240, M = { l: 36, r: 8, t: 20, b: 28 };
    var pw = W - M.l - M.r, ph = H - M.t - M.b;
    var max = Math.max.apply(null, cubetas.map(function (c) { return c.n; }));
    var paso = pasoLimpio(max), techo = Math.ceil(max / paso) * paso;
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', tabindex: '0' }, cont);
    svg.setAttribute('aria-label', (semanal ? 'Descargas por semana' : 'Descargas por día') + ': ' + fmt.format(total) + ' en total, máximo ' + fmt.format(max) + '. Usa las flechas para recorrer las barras; el detalle está en la vista Tablas.');
    for (var v = 0; v <= techo; v += paso) {
      var y = M.t + ph - (v / techo) * ph;
      el('line', { x1: M.l, x2: W - M.r, y1: y, y2: y, 'class': v === 0 ? 'base' : 'grid' }, svg);
      el('text', { x: M.l - 6, y: y + 4, 'text-anchor': 'end', 'class': 'eje' }, svg).textContent = fmt.format(v);
    }
    var banda = pw / cubetas.length, ancho = Math.max(1, Math.min(24, banda - 2));
    var cadaN = Math.ceil(cubetas.length / Math.max(1, Math.floor(pw / 52)));
    var barras = [], iMax = cubetas.findIndex(function (c) { return c.n === max; });
    cubetas.forEach(function (c, i) {
      var x = M.l + i * banda + (banda - ancho) / 2, h = (c.n / techo) * ph, y = M.t + ph - h;
      barras.push(c.n ? el('path', { d: rutaBarra(x, y, ancho, h, true), 'class': 'barra-dato' }, svg) : null);
      if (i % cadaN === 0 || i === cubetas.length - 1) {
        el('text', { x: M.l + i * banda + banda / 2, y: H - 8, 'text-anchor': 'middle', 'class': 'eje' }, svg).textContent = diaCorto(c.dia);
      }
      if (i === iMax) el('text', { x: x + ancho / 2, y: y - 6, 'text-anchor': 'middle', 'class': 'valor' }, svg).textContent = fmt.format(c.n);
    });
    // Zonas de hover del alto completo de cada banda (más grandes que la marca).
    var activa = -1;
    function marcar(i, px, py) {
      if (activa >= 0 && barras[activa]) barras[activa].classList.remove('activa');
      activa = i;
      if (barras[i]) barras[i].classList.add('activa');
      var c = cubetas[i];
      verTooltip(fmt.format(c.n) + (c.n === 1 ? ' descarga' : ' descargas'), (semanal ? 'Semana del ' : '') + diaLargo(c.dia), px, py);
    }
    function soltar() { if (activa >= 0 && barras[activa]) barras[activa].classList.remove('activa'); activa = -1; ocultarTooltip(); }
    cubetas.forEach(function (c, i) {
      var zona = el('rect', { x: M.l + i * banda, y: M.t, width: banda, height: ph, fill: 'transparent' }, svg);
      zona.addEventListener('pointermove', function (e) { marcar(i, e.clientX, e.clientY); });
      zona.addEventListener('pointerleave', soltar);
    });
    svg.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      var i = activa < 0 ? (e.key === 'ArrowRight' ? 0 : cubetas.length - 1) : Math.max(0, Math.min(cubetas.length - 1, activa + (e.key === 'ArrowRight' ? 1 : -1)));
      var b = svg.getBoundingClientRect(), esc = b.width / W;
      marcar(i, b.left + (M.l + i * banda + banda / 2) * esc, b.top + (M.t + ph - (cubetas[i].n / techo) * ph) * esc);
    });
    svg.addEventListener('blur', soltar);
  }

  function graficoBarras(cont, filas) {
    var total = filas.reduce(function (s, f) { return s + f.n; }, 0);
    if (!total) return vacio(cont, 'Sin descargas en este período.');
    cont.textContent = '';
    var W = Math.max(280, cont.clientWidth), fila = 50, H = filas.length * fila + 4, valorW = 48;
    var max = Math.max.apply(null, filas.map(function (f) { return f.n; }));
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' }, cont);
    svg.setAttribute('aria-label', 'Descargas por sección de origen: ' + filas.map(function (f) { return f.nombre + ' ' + f.n; }).join(', '));
    filas.forEach(function (f, i) {
      var y = i * fila;
      el('text', { x: 0, y: y + 16, 'class': 'etiqueta' }, svg).textContent = f.nombre;
      var w = max ? (f.n / max) * (W - valorW) : 0;
      el('line', { x1: 0, x2: 0, y1: y + 22, y2: y + 42, 'class': 'base' }, svg);
      var barra = f.n ? el('path', { d: rutaBarra(0, y + 22, w, 20, false), 'class': 'barra-dato' }, svg) : null;
      el('text', { x: w + 8, y: y + 37, 'class': 'valor' }, svg).textContent = fmt.format(f.n);
      var zona = el('rect', { x: 0, y: y, width: W, height: fila, fill: 'transparent' }, svg);
      zona.addEventListener('pointermove', function (e) { if (barra) barra.classList.add('activa'); verTooltip(fmt.format(f.n) + (f.n === 1 ? ' descarga' : ' descargas'), f.nombre + ' · ' + Math.round((f.n / total) * 100) + '% del período', e.clientX, e.clientY); });
      zona.addEventListener('pointerleave', function () { if (barra) barra.classList.remove('activa'); ocultarTooltip(); });
    });
  }

  function renderGraficos() {
    if (!calc) return;
    graficoColumnas($('g-dia'), calc.cubetas, calc.semanal);
    graficoBarras($('g-origen'), calc.porOrigen);
  }

  var temporizador;
  window.addEventListener('resize', function () { clearTimeout(temporizador); temporizador = setTimeout(renderGraficos, 150); });

  // ---------- Activos descargables ----------
  function renderActivos() {
    var cont = $('activos');
    cont.textContent = '';
    calc.porRecurso.forEach(function (p) {
      var art = document.createElement('article'); art.className = 'activo';
      var h = document.createElement('h3'); h.textContent = p.recurso.nombre; art.appendChild(h);
      var chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = p.recurso.formato + ' · ' + p.recurso.etapas.join(', '); art.appendChild(chip);
      var dl = document.createElement('dl');
      [['Descargas en el período', fmt.format(p.descargas)], ['Total histórico', fmt.format(p.historico)], ['Sesiones únicas', fmt.format(p.sesiones)],
        ['Copias de la licencia', fmt.format(p.copias)], ['Versión de licencia', p.versiones], ['Última descarga', p.ultima ? fechaHora(p.ultima) : '—']]
        .forEach(function (x) {
          var dt = document.createElement('dt'); dt.textContent = x[0];
          var dd = document.createElement('dd'); dd.textContent = x[1];
          dl.appendChild(dt); dl.appendChild(dd);
        });
      art.appendChild(dl);
      cont.appendChild(art);
    });
  }

  // ---------- Tablas ----------
  function tabla(id, columnas, filas) {
    var t = $(id); t.textContent = '';
    var thead = t.createTHead().insertRow();
    columnas.forEach(function (c) { var th = document.createElement('th'); th.textContent = c.titulo; if (c.num) th.className = 'num'; thead.appendChild(th); });
    var tb = t.createTBody();
    if (!filas.length) { var td = tb.insertRow().insertCell(); td.colSpan = columnas.length; td.textContent = 'Sin registros en este período.'; return; }
    filas.forEach(function (f) {
      var tr = tb.insertRow();
      f.forEach(function (v, i) { var td = tr.insertCell(); td.textContent = v; if (columnas[i].num) td.className = 'num'; if (columnas[i].clase) td.className = columnas[i].clase; });
    });
  }

  function nombreRecurso(id) { var r = datos.recursos.find(function (x) { return x.id === id; }); return r ? r.nombre : id; }
  function eventosOrdenados() { return calc.enRango.slice().sort(function (a, b) { return a.t < b.t ? 1 : -1; }); }

  function renderTablas() {
    tabla('t-recursos', [{ titulo: 'Recurso' }, { titulo: 'Formato' }, { titulo: 'Descargas (período)', num: 1 }, { titulo: 'Total histórico', num: 1 }, { titulo: 'Sesiones únicas', num: 1 }, { titulo: 'Copias de licencia', num: 1 }, { titulo: 'Versión de licencia' }, { titulo: 'Última descarga' }],
      calc.porRecurso.map(function (p) { return [p.recurso.nombre, p.recurso.formato, fmt.format(p.descargas), fmt.format(p.historico), fmt.format(p.sesiones), fmt.format(p.copias), p.versiones, p.ultima ? fechaHora(p.ultima) : '—']; }));
    tabla('t-dias', [{ titulo: calc.semanal ? 'Semana desde' : 'Día' }, { titulo: 'Descargas', num: 1 }],
      calc.cubetas.slice().reverse().map(function (c) { return [diaLargo(c.dia), fmt.format(c.n)]; }));
    var totalOrigen = calc.porOrigen.reduce(function (s, f) { return s + f.n; }, 0);
    tabla('t-origen', [{ titulo: 'Sección' }, { titulo: 'Descargas', num: 1 }, { titulo: '% del período', num: 1 }],
      calc.porOrigen.map(function (f) { return [f.nombre, fmt.format(f.n), totalOrigen ? Math.round((f.n / totalOrigen) * 100) + '%' : '—']; }));

    var evs = eventosOrdenados(), paginas = Math.max(1, Math.ceil(evs.length / POR_PAGINA));
    pagina = Math.min(pagina, paginas - 1);
    tabla('t-eventos', [{ titulo: 'Fecha y hora (Chile)' }, { titulo: 'Evento' }, { titulo: 'Recurso' }, { titulo: 'Versión' }, { titulo: 'Origen' }, { titulo: 'Sesión', clase: 'sesion' }],
      evs.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA).map(function (e) {
        return [fechaHora(e.t), datos.tiposEvento[e.e] || e.e, nombreRecurso(e.r), e.v, datos.origenes[e.o] || e.o, e.s];
      }));
    $('t-eventos-nota').textContent = fmt.format(evs.length) + ' registros · ' + textoFiltros(calc.rango);
    $('pag-info').textContent = 'Página ' + (pagina + 1) + ' de ' + paginas;
    $('pag-ant').disabled = pagina === 0;
    $('pag-sig').disabled = pagina >= paginas - 1;
  }
  $('pag-ant').addEventListener('click', function () { pagina--; renderTablas(); });
  $('pag-sig').addEventListener('click', function () { pagina++; renderTablas(); });

  // ---------- Excel ----------
  $('btn-excel').addEventListener('click', function () {
    if (!calc) return;
    var k = calc.kpi, recSel = $('f-recurso');
    var hojas = [
      { nombre: 'Resumen', columnas: [{ titulo: 'Indicador', ancho: 38 }, { titulo: 'Valor', ancho: 46 }], filas: [
        ['Período', textoFiltros(calc.rango)],
        ['Recurso', recSel.options[recSel.selectedIndex].text],
        ['Descargas con licencia aceptada (período)', String(k.descargas)],
        ['Descargas totales (histórico)', String(k.historico)],
        ['Sesiones únicas (período)', String(k.sesiones)],
        ['Copias de la licencia guardadas (período)', String(k.copias)],
        ['Recursos descargados', k.recursos + ' de ' + k.totalRecursos],
        ['Generado', fechaHora(new Date().toISOString()) + ' (hora de Chile)'],
      ] },
      { nombre: 'Por recurso', columnas: [{ titulo: 'Recurso', ancho: 44 }, { titulo: 'Formato', ancho: 14 }, { titulo: 'Etapas', ancho: 30 }, { titulo: 'Descargas (período)', tipo: 'numero', ancho: 20 }, { titulo: 'Total histórico', tipo: 'numero', ancho: 16 }, { titulo: 'Sesiones únicas', tipo: 'numero', ancho: 16 }, { titulo: 'Copias de licencia', tipo: 'numero', ancho: 18 }, { titulo: 'Versión de licencia', ancho: 18 }, { titulo: 'Última descarga', tipo: 'fecha', ancho: 18 }],
        filas: calc.porRecurso.map(function (p) { return [p.recurso.nombre, p.recurso.formato, p.recurso.etapas.join(', '), p.descargas, p.historico, p.sesiones, p.copias, p.versiones, p.ultima ? partes(p.ultima) : null]; }) },
      { nombre: calc.semanal ? 'Por semana' : 'Por día', columnas: [{ titulo: calc.semanal ? 'Semana desde' : 'Día', tipo: 'dia', ancho: 14 }, { titulo: 'Descargas', tipo: 'numero', ancho: 12 }],
        filas: calc.cubetas.map(function (c) { return [diaAPartes(c.dia), c.n]; }) },
      { nombre: 'Por origen', columnas: [{ titulo: 'Sección', ancho: 34 }, { titulo: 'Descargas', tipo: 'numero', ancho: 12 }],
        filas: calc.porOrigen.map(function (f) { return [f.nombre, f.n]; }) },
      { nombre: 'Registro', columnas: [{ titulo: 'Fecha y hora (Chile)', tipo: 'fecha', ancho: 20 }, { titulo: 'Evento', ancho: 32 }, { titulo: 'Recurso', ancho: 44 }, { titulo: 'Versión de licencia', ancho: 18 }, { titulo: 'Origen', ancho: 32 }, { titulo: 'Sesión', ancho: 40 }],
        filas: eventosOrdenados().map(function (e) { return [partes(e.t), datos.tiposEvento[e.e] || e.e, nombreRecurso(e.r), e.v, datos.origenes[e.o] || e.o, e.s]; }) },
    ];
    XLSXMin.descargar('COGNI-move_descargas_' + hoy() + '.xlsx', hojas);
  });

  cargar();
})();
