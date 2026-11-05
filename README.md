# Cognición en Movimiento · COGNI-move

Sitio web del programa **Cognición en Movimiento (COGNI-move)**, Universidad Andrés Bello.

## Estructura

```
├── src/
│   ├── index.html        # Fuente del sitio (un solo archivo, con imágenes embebidas)
│   ├── favicon.svg       # Ícono fuente; el build genera .ico, PNG y manifest
│   └── admin/            # Panel interno /admin (registro de descargas, tablas y Excel)
├── api/
│   ├── contacto.js       # Formulario de contacto → correo (Resend)
│   ├── descarga.js       # Única vía de descarga: valida licencia + nombre + correo, firma, registra y entrega el archivo
│   ├── licencia.js       # PDF de la licencia firmada para quien la firmó (token de 24 h)
│   ├── licencia-correo.js # Envía esa copia firmada al correo indicado al firmar
│   ├── registro.js       # Eventos complementarios de la licencia (copia sin firmar guardada)
│   ├── admin/            # login, logout, datos del panel y licencias firmadas (PDF)
│   └── _lib/             # catálogo, firma y PDF de la licencia, validación, sesión, rate limit
│       └── licencias/    # Texto canónico de cada versión de la licencia (lo genera el build; no editar)
├── recursos/             # Archivos descargables (no se publican; solo los entrega /api/descarga)
├── scripts/
│   ├── build.mjs         # src/ → public/ (optimiza imágenes, separa JS, genera favicons)
│   ├── dev.mjs           # Servidor local que imita Vercel
│   └── hash-password.mjs # Genera ADMIN_PASS_HASH y SESSION_SECRET
├── tests/                # node --test
└── vercel.json           # Build, cabeceras de seguridad y CSP
```

`public/` se genera en cada build y no se versiona.

## Editar el sitio

Toda edición parte de **`src/index.html`** (no de una copia offline anterior). Se puede seguir trabajando
como archivo único con imágenes en base64: el build las extrae, deduplica y optimiza.

Reglas para que el build no falle:

- Sin manejadores inline (`onclick="..."`): usar `data-*` y `addEventListener`. La CSP no permite JS inline.
- Todo material descargable pasa por la ventana de licencia: botón con `data-licencia` y `data-recurso`, archivo
  en `recursos/` y entrada en `RECURSOS` de `api/_lib/catalogo.js`. El build se detiene si encuentra un enlace
  directo a un archivo (PDF, Word, Excel, etc.) o un recurso sin archivo. Si una versión offline trae el archivo
  embebido (`<div hidden><a id="…" href="data:…">`), el build local actualiza `recursos/`: hay que incluirlo en el commit.
- Si cambia el texto de la licencia, subir la versión en `VERSIONES_LICENCIA` (catálogo) y en `VERSION` de `src/index.html`.
  El texto de cada versión queda congelado en `api/_lib/licencias/v<versión>.js` (con su huella SHA-256) y es el
  que se imprime en las copias firmadas: el build se detiene si el texto cambia sin subir la versión. Al publicar una
  versión nueva, el build local crea su archivo y hay que incluirlo en el commit; nunca borrar versiones anteriores.
- Opciones nuevas de motivo o país del formulario también van en el catálogo (el build valida que coincidan).

## Build y pruebas locales

Requiere Node 22.

```bash
npm ci
```

```bash
npm run build
```

```bash
npm test
```

Servidor local con almacenamiento y correo simulados (no necesita credenciales; los correos se
muestran en consola y en `/__correos`):

```bash
DEV_MOCK=1 npm run dev
```

Para probar `/admin` en local, crear `.env.local` (ignorado por git) con `ADMIN_USER`, `ADMIN_PASS_HASH`
y `SESSION_SECRET` generados con `npm run hash-password`.

El build es reproducible: misma entrada → mismos archivos y mismos nombres con hash.

## Variables de entorno en Vercel

El repositorio es público: **ninguna credencial va en el código**. Se configuran en
Vercel → Project → Settings → Environment Variables (Production).

| Variable | Uso |
|---|---|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis (Vercel → Storage / Marketplace → Upstash). Se crean solas al conectar la base al proyecto. |
| `RESEND_API_KEY` | Envío de correos del formulario (resend.com). |
| `CONTACT_TO` | Destinatario del formulario (por ahora `christian.campos@unab.cl`). Admite varios separados por coma. |
| `CONTACT_FROM` | Remitente de los correos, p. ej. `Cognición en Movimiento <contacto@cognicionenmovimiento.cl>` con el dominio verificado en Resend. **Necesario** para enviar la licencia firmada a quienes descargan (sin dominio verificado, Resend solo entrega al dueño de la cuenta). |
| `ADMIN_USER` | Usuario del panel `/admin`. |
| `ADMIN_PASS_HASH` | Hash scrypt de la contraseña (`npm run hash-password`). Nunca la contraseña en claro. |
| `SESSION_SECRET` | Secreto aleatorio (≥ 32 caracteres) para firmar la sesión, sellar las licencias firmadas y anonimizar IPs del rate limit. |

Sin estas variables el sitio sigue cargando, pero el formulario responde que el envío no está disponible,
las descargas no se entregan (no se pueden registrar) y `/admin` permanece cerrado.

Cambiar la contraseña del panel: `npm run hash-password`, reemplazar `ADMIN_PASS_HASH` en Vercel y
redeploy. Cambiar `SESSION_SECRET` cierra todas las sesiones abiertas y vence los enlaces de 24 h a las licencias
firmadas; las licencias ya emitidas conservan su sello y siguen disponibles en el panel.

## Qué se registra

Cada descarga guarda: fecha y hora del servidor, recurso, versión de licencia aceptada, nombre y correo
electrónico de quien firma, sección de origen y un identificador técnico de sesión aleatorio. Si el registro no
está disponible, el archivo no se entrega. Las copias sin firmar de la licencia se registran sin datos personales.
No se guardan IP.

## Licencia firmada

La descarga funciona como firma electrónica simple (Ley N° 19.799): la persona indica su
nombre y correo, marca la casilla y presiona «Firmar y descargar». El servidor guarda la constancia (`cm:lic:<id>`
en Upstash, además del registro de eventos) con la fecha y hora del servidor, la huella SHA-256 del texto aceptado
y un sello HMAC; los primeros 20 caracteres del sello son el **código de verificación** que aparece en el PDF.

- Quien firma descarga el PDF o se lo envía por correo durante 24 horas (máx. 3 envíos por licencia y día).
- En `/admin` → Tablas → Registro de aceptaciones, el botón **PDF** de cada fila regenera la copia firmada
  (mismo contenido que la entregada); el Excel incluye nombre, ID de aceptación y código de verificación.
- Para verificar una copia presentada: buscar su ID en el panel y comparar el código de verificación.
