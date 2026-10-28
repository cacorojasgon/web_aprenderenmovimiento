# Cognición en Movimiento · COGNI-move

Sitio web del programa **Cognición en Movimiento (COGNI-move)**, Universidad Andrés Bello.

## Estructura

```
├── index.html     # Sitio completo en un solo archivo (HTML + CSS + JS + imágenes embebidas)
├── vercel.json    # Cabeceras de seguridad (CSP, HSTS, etc.)
└── .vercelignore  # Archivos que no se despliegan
```

## Uso local

```bash
npx serve .
```

## Deploy en Vercel

Sitio 100% estático (sin build). Importa el repositorio en [vercel.com/new](https://vercel.com/new) con Framework Preset **Other**.

## Importante al editar `index.html`

La CSP de `vercel.json` autoriza el único `<script>` inline por su hash SHA-256. Si modificas ese script, hay que recalcular el hash y actualizar `script-src` en `vercel.json`; de lo contrario el navegador lo bloqueará (la descarga con licencia dejaría de funcionar).

```bash
node -e "const h=require('fs').readFileSync('index.html','utf8');const s=h.match(/<script>([\s\S]*?)<\/script>/)[1];console.log('sha256-'+require('crypto').createHash('sha256').update(s,'utf8').digest('base64'))"
```
