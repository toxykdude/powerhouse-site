# PowerHouse Gym Manizales — Sitio Web

Sitio web oficial de **PowerHouse Gym Manizales**, construido con [Astro](https://astro.build) como sitio estático y desplegado en [Cloudflare Pages](https://pages.cloudflare.com).

**🌐 Live**: [powerhousegym.co](https://powerhousegym.co)

---

## Stack Técnico

| Capa          | Tecnología                              |
| ------------- | --------------------------------------- |
| **Framework** | Astro 5.7 (Static SSG)                  |
| **Hosting**   | Cloudflare Pages                        |
| **Backend**   | Cloudflare Pages Functions (serverless) |
| **Media**     | Cloudflare R2 + Worker proxy            |
| **Pagos**     | Wompi Widget (Widget + API)             |
| **CI/CD**     | GitHub Actions → Cloudflare Pages       |
| **Contacto**  | Cloudflare Workers (WhatsApp)           |

---

## Estructura del Proyecto

```
powerhouse-site/
├── src/
│   ├── pages/                  → Páginas del sitio (.astro)
│   │   ├── index.astro           Homepage
│   │   ├── planes.astro          Planes con Wompi Widget
│   │   ├── nosotros.astro        Sobre nosotros + video + ubicación
│   │   ├── contacto.astro        Formulario de contacto (WhatsApp)
│   │   ├── blog/
│   │   │   ├── index.astro         Listado de posts con filtros
│   │   │   └── [slug].astro        Post individual
│   │   ├── pago/
│   │   │   └── confirmacion.astro  Resultado de pago Wompi
│   │   ├── terminos.astro
│   │   ├── privacidad.astro
│   │   └── 404.astro
│   ├── layouts/
│   │   └── Base.astro           Layout base con SEO completo
│   ├── components/              → Componentes UI reutilizables
│   ├── content/
│   │   └── blog/                → Posts en Markdown
│   ├── content.config.ts        → Schema de colecciones
│   └── styles/
│       └── theme.css            → Variables CSS del tema
├── functions/                   → Cloudflare Pages Functions (API)
│   └── api/payment/
│       ├── signature.ts           Genera firma SHA256 para Wompi
│       ├── webhook.ts             Recibe eventos de pago
│       └── status.ts              Consulta estado de transacción
├── workers/                     → Cloudflare Workers
│   ├── contact.js                Formulario de contacto → WhatsApp
│   └── media-proxy.js            Proxy R2 → media.powerhousegym.co
├── public/
│   ├── uploads/                 → Imágenes estáticas
│   ├── _headers                 → Security headers
│   └── robots.txt               → Directivas SEO
├── astro.config.mjs
├── wrangler.toml                → Config Worker contacto
├── wrangler-media.toml          → Config Worker media proxy
└── .github/workflows/deploy.yml → CI/CD automático
```

---

## Comandos

```bash
# Instalar dependencias
npm ci

# Desarrollo local (puerto 4321)
npm run dev

# Build estático (output: dist/)
npm run build

# Preview del build
npm run preview
```

---

## Despliegue

### Automático (recomendado)

Push a `main` → GitHub Actions ejecuta `npm ci` → `npm run build` → `wrangler pages deploy`.

### Manual

```bash
npm run build
CLOUDFLARE_EMAIL="..." CLOUDFLARE_API_KEY="..." \
  npx wrangler pages deploy dist \
    --project-name powerhouse-site \
    --branch main --commit-dirty=true
```

---

## Sistema de Pagos (Wompi Widget)

El flujo de pago funciona completamente in-site sin redirigir al usuario:

```
Usuario clickea "PAGAR AHORA"
  → POST /api/payment/signature { plan: "power-pack" }
    → Backend genera referencia + firma SHA256
      → WidgetCheckout se abre como modal in-site
        → Usuario paga (tarjeta/PSE/Nequi/Daviplata/Efecty)
          → Redirect a /pago/confirmacion?id={transaction_id}
            → GET /api/payment/status?id=...
              → Muestra resultado (aprobado/pendiente/rechazado)
```

### Planes configurados

| Plan ID      | Nombre            | Precio (COP) |
| ------------ | ----------------- | ------------ |
| `mensual`    | Membresía Mensual | $69.900      |
| `power-pack` | Power Pack        | $140.000     |
| `trimestral` | Plan Trimestral   | $186.000     |
| `semestral`  | Plan Semestral    | $360.000     |
| `anual`      | Plan Anual        | $620.000     |

### Variables de entorno (Cloudflare Pages)

```
WOMPI_PUBLIC_KEY=pub_prod_...
WOMPI_INTEGRITY_SECRET=prod_integrity_...
WOMPI_PRIVATE_KEY=prv_prod_...
WOMPI_EVENTS_SECRET=prod_events_...
WOMPI_API_URL=https://production.wompi.co/v1
```

---

## Blog

Los posts viven en `src/content/blog/` como archivos Markdown con frontmatter:

```markdown
---
title: "Título del Post"
slug: "url-friendly-slug"
date: "2026-04-12"
category: "Entrenamiento"
excerpt: "Descripción SEO de 120-160 caracteres con CTA."
featuredImage: "https://images.unsplash.com/..."
---

# Contenido del post...
```

**Categorías disponibles**: Nutrición, Entrenamiento, Motivación, Suplementación, General

### Crear un nuevo post

1. Crear archivo en `src/content/blog/{slug}.md`
2. Escribir frontmatter completo + contenido (800+ palabras)
3. `npm run build` → verificar que compila
4. Deployar y verificar en `/blog/{slug}/`

---

## Media (R2)

Las imágenes se sirven desde `media.powerhousegym.co` vía un Worker proxy sobre Cloudflare R2.

**Bucket**: `powerhouse-media`

**Estructura de carpetas**:

```
gym/        → Fotos del gimnasio
trainers/   → Fotos de entrenadores
blog/       → Imágenes de blog posts
planes/     → Banners y assets de planes
icons/      → Favicons y logos
```

**Subir imágenes**: Cloudflare Dashboard → R2 → `powerhouse-media` → Upload

**URLs resultantes**: `https://media.powerhousegym.co/{carpeta}/{archivo}`

El Worker agrega automáticamente:

- Cache CDN por 30 días (`max-age=2592000, immutable`)
- CORS abierto (`Access-Control-Allow-Origin: *`)
- ETags para caché condicional (304 Not Modified)

---

## SEO

El sitio incluye SEO técnico completo:

- **Meta tags**: title, description, canonical, robots, author
- **Open Graph**: type, title, description, image, url, site_name, locale
- **Twitter Cards**: summary_large_image
- **JSON-LD**: LocalBusiness + HealthClub + Gym, AggregateRating (4.8/5), Review, WebSite, BreadcrumbList, Article (blog)
- **Sitemap**: Auto-generado por Astro
- **robots.txt**: Directivas de crawling + referencia al sitemap
- **Headers de seguridad**: X-Frame-Options, X-Content-Type-Options, etc.

---

## Dominios

| Dominio                  | Destino                            |
| ------------------------ | ---------------------------------- |
| `powerhousegym.co`       | Cloudflare Pages (sitio principal) |
| `www.powerhousegym.co`   | Cloudflare Pages                   |
| `media.powerhousegym.co` | Worker proxy → R2 bucket           |

---

## Licencia

Privado. Todos los derechos reservados © PowerHouse Gym Manizales.
