# Aprender en Movimiento

Landing page de **Aprender en Movimiento**, una metodología de aprendizaje activo que integra el movimiento físico al proceso educativo.

## Estructura

```
├── index.html          # Página principal
├── css/styles.css       # Estilos (paleta e identidad de marca)
├── js/main.js            # Menú móvil y formulario de contacto
├── assets/logo.png       # Logo oficial
└── assets/favicon.png    # Ícono del sitio
```

## Paleta de marca

| Color | Hex |
|---|---|
| Azul marino | `#1B3A6B` |
| Naranja | `#FF6B35` |
| Verde / Teal | `#06A77D` |

## Uso local

Abre `index.html` directamente en el navegador, o sirve la carpeta con cualquier servidor estático:

```bash
npx serve .
```

## Deploy en Vercel

Sitio 100% estático (sin build). Para desplegarlo:

1. En [vercel.com/new](https://vercel.com/new), importa el repositorio `web_aprenderenmovimiento`.
2. Framework Preset: **Other** (Vercel lo detecta automáticamente, no requiere build command ni output directory).
3. Deploy.

También puedes desplegar con la CLI:

```bash
npm i -g vercel
vercel --prod
```

`vercel.json` define cache-control para `assets/`, `css/` y `js/`, y `.vercelignore` excluye los archivos fuente de marca en `assets/brand/` que no se usan en el sitio.
