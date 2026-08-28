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
  → POST /api/payment/signature { plan: "trimestral" }
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
| `trimestral` | Plan Trimestral   | $195.000     |
| `semestral`  | Plan Semestral    | $375.000     |
| `anual`      | Plan Anual        | $620.000     |

### Variables de entorno (Cloudflare Pages)

```
WOMPI_PUBLIC_KEY=pub_prod_...
WOMPI_INTEGRITY_SECRET=prod_integrity_...
WOMPI_PRIVATE_KEY=prv_prod_...
WOMPI_EVENTS_SECRET=prod_events_...
WOMPI_API_URL=https://production.wompi.co/v1
FACEGYM_API_URL=https://faceapp.powerhousegym.co
FACEGYM_PORTAL_INTERNAL_KEY=<PORTAL_INTERNAL_API_KEY del backend FaceGYM>
```

> `FACEGYM_PORTAL_INTERNAL_KEY` debe ser igual al `PORTAL_INTERNAL_API_KEY` del backend FaceGYM (clave dedicada de solo-lectura de pagos pendientes, diseño WS-1/D2). El webhook la usa como header `X-API-Key` al consultar `pending-payment/{reference}`. Si falta, el relay falla cerrado: no consulta ni reenvía nada (Wompi sigue recibiendo 200). La firma del body usa HMAC-SHA256 (`X-Signature`) con `WOMPI_INTEGRITY_SECRET`.
>
> `FACEGYM_INTERNAL_API_KEY` (el `SECRET_KEY` global del backend) quedó **deprecado y eliminado**: FaceGYM ya no lo acepta para lecturas de pagos pendientes — una fuga del SECRET_KEY no debe exponer referencias de pago. Elimínalo del dashboard de Cloudflare al provisionar la clave nueva.

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

## Evaluación de Entrenadores (Customer Experience)

Sistema de evaluación de la experiencia con entrenadores: página pública
`/evaluacion/` + API serverless + D1 + reporte por email.

**Flujo**: `/evaluacion/` (selección de entrenador) → `/evaluacion/[slug]/`
(cuestionario de 4 pasos: Experiencia → Desempeño profesional →
Recomendación → Comentarios) → pantalla de agradecimiento. Anónimo,
mobile-first, ~2–4 minutos.

### Arquitectura

```
src/data/evaluation.ts             ← ÚNICA fuente de verdad del cuestionario
src/data/evaluation-trainers.ts    ← los 3 entrenadores evaluables
src/pages/evaluacion/              ← index / [slug] / gracias (SSG)
src/components/evaluation/EvaluationForm.astro  ← isla vanilla TS (4 pasos)
functions/api/evaluations/index.ts ← POST /api/evaluations (valida, anti-spam,
                                      puntúa, persiste, envía email)
functions/api/evaluations/_*.ts    ← validate / score / email / store /
                                      turnstile / types
functions/api/admin/trainer-stats.ts ← GET protegido por X-API-Key (analytics)
migrations/0001_evaluation_schema.sql ← D1: trainers + evaluations
migrations/0002_seed_trainers.sql     ← seed Harold / Esteban / Brayan
wrangler-pages.toml                ← config D1 (solo dev local + migraciones)
scripts/dev-d1-setup.sh            ← aplica migraciones al D1 local de pages dev
```

El modelo de puntaje distingue **experiencia del cliente** (7 dimensiones)
de **desempeño profesional** (conocimiento técnico + orientación
personalizada) — requisito del negocio para detectar casos como "alta
técnica + baja empatía". Los puntajes se calculan server-side y se
persisten por evaluación (`overall_score`, `experience_score`,
`professional_score`).

Los entrenadores evaluables viven en `src/data/evaluation-trainers.ts`
(Harold, Esteban y Brayan reutilizan su perfil oficial, con foto). Si un
entrenador sale o entra al equipo: edita ese archivo + la tabla `trainers`
(en producción desactiva con `active = 0` en vez de borrar, para conservar
evaluaciones históricas; los slugs deben coincidir).

### Variables de entorno

Ver `.env.example` (local) — en producción se configuran en Cloudflare
Pages → Settings → Environment variables:

| Variable                    | Requerida  | Descripción                                                                                   |
| --------------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| `EMAIL_PROVIDER`            | sí (prod)  | `resend` para envío real; `console` registra y no envía (dev)                                 |
| `RESEND_API_KEY`            | con resend | API key de Resend (nunca en el frontend)                                                      |
| `EMAIL_FROM`                | con resend | Remitente, ej. `PowerHouse GYM <evaluaciones@powerhousegym.co>` (verificar dominio en Resend) |
| `EVALUATIONS_TO_EMAIL`      | no         | Destinatario del reporte. Default: `powerhousegymmanizales@gmail.com`                         |
| `RATE_LIMIT_SALT`           | sí (prod)  | Salt para hashear IPs (SHA-256) — no se almacena la IP real                                   |
| `PUBLIC_TURNSTILE_SITE_KEY` | no         | Site key de Cloudflare Turnstile (se renderiza solo si existe)                                |
| `TURNSTILE_SECRET_KEY`      | no         | Si existe, la verificación es obligatoria (fail-closed)                                       |
| `ADMIN_API_KEY`             | no         | Protege `GET /api/admin/trainer-stats` (header `X-API-Key`)                                   |
| `EVAL_RATE_LIMIT_PER_HOUR`  | no         | Default 5 por IP/hora                                                                         |
| `EVAL_DUPLICATE_WINDOW_MIN` | no         | Default 15 min anti-duplicado por IP+entrenador                                               |

### Base de datos (D1)

```bash
# 1) Crear la DB (una vez) y copiar el database_id en wrangler-pages.toml
npx wrangler d1 create powerhouse-evaluations

# 2) Aplicar migraciones en producción
npx wrangler d1 migrations apply powerhouse-evaluations --remote --config wrangler-pages.toml

# 3) Binding en el dashboard: Pages → powerhouse-site → Settings →
#    Bindings → D1 → nombre `DB` → powerhouse-evaluations
```

> El proveedor de almacenamiento está aislado en
> `functions/api/evaluations/_store.ts` (consultas SQL estándar). Migrar a
> PostgreSQL (Neon/Supabase) en el futuro solo requiere reimplementar ese
> módulo; el schema ANSI de `migrations/` es portable.

### Desarrollo local (functions + D1)

`astro dev` no sirve `functions/`. Para probar el flujo completo:

```bash
npm run build
npx wrangler pages dev dist --d1 DB --port 8799   # boot #1 crea el sqlite local
./scripts/dev-d1-setup.sh                          # aplica migraciones + seed
# repetir d1-setup con --reset para empezar de cero
```

> Gotcha verificado: `wrangler pages dev --d1 DB` persiste su sqlite local
> bajo una clave distinta a `wrangler d1 migrations apply --config`; por eso
> existe `scripts/dev-d1-setup.sh` (usa solo python3 stdlib).

Prueba rápida:

```bash
curl -X POST http://127.0.0.1:8799/api/evaluations \
  -H "Content-Type: application/json" \
  -d '{"trainerSlug":"harold-giraldo","ratings":{"empathy":5,"respect":5,"attention":4,"availability":5,"communication":4,"motivation":5,"technicalExpertise":5,"personalizedGuidance":4,"professionalism":5,"overallExperience":5},"recommendation":"definitely_yes","company":""}'
# → 201 {"ok":true}; el reporte se imprime en consola (EMAIL_PROVIDER=console)
```

### Protecciones activas

Server-side only (nunca confiar en el cliente): validación estricta
tipada (10 ratings 1–5 exactos, enums, máx 2000 caracteres), CHECK
constraints en DB, honeypot `company` (drop silencioso), Turnstile
opcional fail-closed, rate limiting durable en D1 (por IP hash: 5/hora,
1 por entrenador/15 min), verificación de Origin (CSRF), límite 32 KB,
XSS-escaping de todo texto en el email, secretos solo en el backend.

### Analytics (privado)

```bash
curl -H "X-API-Key: $ADMIN_API_KEY" https://powerhousegym.co/api/admin/trainer-stats
```

Devuelve por entrenador: número de evaluaciones, promedio por dimensión,
experiencia vs profesional, tasa de recomendación, tendencia 30 días y
últimos comentarios. No está enlazado públicamente ni expone datos
personales — base para un dashboard futuro.

### Tests

```bash
npm test   # incluye __tests__/evaluation/* y __tests__/api/evaluations*
```

Cubren: validación (tipos, rangos, sanitización), scoring exacto por
grupo, template de email (escaping XSS), rate limits, honeypot, CSRF,
Turnstile y el endpoint admin.

---

## Licencia

Privado. Todos los derechos reservados © PowerHouse Gym Manizales.
