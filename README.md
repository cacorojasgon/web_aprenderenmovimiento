# Cognición en Movimiento · COGNI-move

Sitio web del programa **Cognición en Movimiento (COGNI-move)**, Universidad Andrés Bello.

## Estructura

```
├── src/
│   ├── index.html        # Fuente del sitio (un solo archivo, con imágenes y descargables embebidos)
│   ├── favicon.svg       # Ícono fuente; el build genera .ico, PNG y manifest
│   └── admin/            # Panel interno /admin (registro de descargas, tablas y Excel)
├── api/
│   ├── contacto.js       # Formulario de contacto → correo (Resend)
│   ├── registro.js       # Registro de aceptación de licencia y descargas (Upstash Redis)
│   ├── admin/            # login, logout y datos del panel
│   └── _lib/             # catálogo de recursos, validación, sesión, rate limit
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
- Si se agrega o renombra un recurso descargable, actualizarlo también en `api/_lib/catalogo.js`
  (el build valida que coincidan). Lo mismo para opciones nuevas de motivo o país del formulario.

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
| `CONTACT_FROM` | Opcional. Remitente, p. ej. `Cognición en Movimiento <contacto@cognicionenmovimiento.cl>` una vez verificado el dominio en Resend. |
| `ADMIN_USER` | Usuario del panel `/admin`. |
| `ADMIN_PASS_HASH` | Hash scrypt de la contraseña (`npm run hash-password`). Nunca la contraseña en claro. |
| `SESSION_SECRET` | Secreto aleatorio (≥ 32 caracteres) para firmar la sesión y anonimizar IPs del rate limit. |

Sin estas variables el sitio sigue funcionando: el formulario responde que el envío no está disponible,
el registro de descargas no guarda nada y `/admin` permanece cerrado.

Cambiar la contraseña del panel: `npm run hash-password`, reemplazar `ADMIN_PASS_HASH` en Vercel y
redeploy. Cambiar `SESSION_SECRET` cierra todas las sesiones abiertas.

## Qué se registra

Cada descarga con licencia aceptada (y cada copia guardada de la licencia) guarda: fecha y hora del
servidor, tipo de evento, recurso, versión de licencia, sección de origen y un identificador técnico
de sesión aleatorio. No se guardan nombres, correos ni IP.
