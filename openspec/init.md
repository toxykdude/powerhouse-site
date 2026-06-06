# SDD Init Report — powerhouse-site

**Date**: 2026-06-06
**Status**: success
**Persistence**: openspec (file-based)

---

## Project Overview

PowerHouse Gym Manizales official website — a static site with serverless API backend, payment integration, member portal, and blog.

**Live URL**: https://powerhousegym.co
**Repository**: https://github.com/toxykdude/powerhouse-site

---

## Detected Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Framework** | Astro (Static SSG) | ^5.7.0 |
| **Runtime** | Node.js (build), Cloudflare Workers/Pages (deploy) | 20 |
| **Language** | TypeScript + JavaScript (workers) | strict tsconfig |
| **Build Tool** | Vite (via Astro) | bundled |
| **Package Manager** | npm | lockfile present |
| **CSS** | Custom CSS with design tokens | no preprocessor |
| **Fonts** | Google Fonts (Bebas Neue, Space Mono) | external |
| **Integrations** | @astrojs/sitemap | ^3.3.0 |
| **Image Processing** | sharp | ^0.33.0 |
| **Deployment** | Cloudflare Pages + Workers | wrangler ^4.81.1 |
| **Payments** | Wompi Widget (Widget + API) | production |
| **Email** | MailChannels (via Workers) | free tier |
| **Media Storage** | Cloudflare R2 | powerhouse-media bucket |
| **Backend Proxy** | FaceGYM API | faceapp.powerhousegym.co |

---

## Architecture

```
Static SSG (Astro)
├── Pages (.astro) → static HTML at build time
├── Content Collections (blog) → Markdown + Zod schema
├── Components (.astro) → 8 reusable UI components
├── Layout (Base.astro) → SEO, nav, footer, global styles
│
Serverless API (Cloudflare Pages Functions)
├── /api/payment/signature → Wompi integrity signature
├── /api/payment/status → Wompi transaction query
├── /api/payment/webhook → Wompi event processing → FaceGYM activation
├── /api/auth/* → Proxy to FaceGYM (login, verify, resend)
└── /api/portal/* → Proxy to FaceGYM (me, plans, renew, pending-payment)
│
Cloudflare Workers
├── powerhouse-contact → Contact form → MailChannels + WhatsApp
└── powerhouse-media-proxy → R2 bucket → media.powerhousegym.co
```

### Key Patterns

- **SSG + Serverless**: Static pages built at deploy time; API functions run on Cloudflare edge
- **Proxy Pattern**: Most `/api/*` endpoints proxy to FaceGYM backend (shared utility in `_shared.ts`)
- **Content Collections**: Blog posts as Markdown with Zod-validated frontmatter
- **Payment Flow**: Client → signature API → Wompi Widget modal → webhook → FaceGYM activation
- **SEO-first**: Full JSON-LD (LocalBusiness, WebSite, Article, BreadcrumbList), Open Graph, Twitter Cards, sitemap
- **Security Headers**: X-Frame-Options DENY, nosniff, strict referrer policy

---

## Project Structure

```
powerhouse-site/
├── src/
│   ├── pages/                  9 pages + blog + pago + portal directories
│   │   ├── index.astro           Homepage
│   │   ├── planes.astro          Plans with Wompi Widget
│   │   ├── nosotros.astro        About + video + location
│   │   ├── contacto.astro        Contact form (WhatsApp)
│   │   ├── blog/
│   │   │   ├── index.astro         Blog listing with filters
│   │   │   └── [slug].astro        Individual blog post
│   │   ├── pago/
│   │   │   └── confirmacion.astro  Payment result (Wompi)
│   │   ├── portal/
│   │   │   ├── index.astro         Login
│   │   │   ├── dashboard.astro     Member dashboard
│   │   │   ├── renovar.astro       Renew membership
│   │   │   └── salir.astro         Logout
│   │   ├── terminos.astro        Terms
│   │   ├── privacidad.astro      Privacy
│   │   └── 404.astro             Not found
│   ├── components/              8 reusable UI components
│   ├── content/
│   │   └── blog/                7 Markdown blog posts
│   ├── layouts/
│   │   └── Base.astro           Single layout (SEO + nav + footer)
│   ├── styles/
│   │   └── theme.css            CSS custom properties
│   └── content.config.ts        Zod schema for blog collection
├── functions/api/               Cloudflare Pages Functions
│   ├── _shared.ts               CORS + FaceGYM proxy utility
│   ├── payment/                 Wompi integration (3 endpoints)
│   ├── auth/                    Member auth proxy (3 endpoints)
│   └── portal/                  Member portal proxy (5 endpoints + subdir)
├── workers/                     Cloudflare Workers
│   ├── contact.js               Contact form handler
│   └── media-proxy.js           R2 media proxy
├── public/                      Static assets
│   ├── uploads/                 Images
│   ├── images/                  Additional images
│   ├── _headers                 Security headers (Cloudflare)
│   └── robots.txt               SEO directives
├── astro.config.mjs             Astro config (static output, sitemap)
├── tsconfig.json                Extends astro/tsconfigs/strict
├── wrangler.toml                Contact worker config
├── wrangler-media.toml          Media proxy worker config
└── .github/workflows/deploy.yml CI/CD pipeline
```

---

## Testing Capabilities

**Strict TDD Mode**: disabled
**Detected**: 2026-06-06

### Test Runner

- Command: _none_
- Framework: _none detected_

### Test Layers

| Layer       | Available | Tool |
|-------------|-----------|------|
| Unit        | ❌        | —    |
| Integration | ❌        | —    |
| E2E         | ❌        | —    |

### Coverage

- Available: ❌
- Command: —

### Quality Tools

| Tool         | Available | Command |
|--------------|-----------|---------|
| Linter       | ❌        | —       |
| Type checker | ❌ (local only via `astro check`) | — |
| Formatter    | ❌        | —       |

---

## CI/CD

**Platform**: GitHub Actions
**File**: `.github/workflows/deploy.yml`
**Trigger**: Push to `main` + manual dispatch

### Pipeline

```
actions/checkout@v4 → setup-node@v4 (node 20) → npm ci → npm run build → wrangler pages deploy
```

### Secrets Used

- `CLOUDFLARE_EMAIL`
- `CLOUDFLARE_API_KEY`
- `CLOUDFLARE_ACCOUNT_ID`

### Missing from CI

- ❌ No test step
- ❌ No lint step
- ❌ No type-check step
- ❌ No preview deploy for PRs

---

## Environment Configuration

### Cloudflare Pages Environment Variables

| Variable | Purpose |
|----------|---------|
| `WOMPI_PUBLIC_KEY` | Wompi checkout widget |
| `WOMPI_INTEGRITY_SECRET` | Payment signature generation |
| `WOMPI_PRIVATE_KEY` | Transaction status queries |
| `WOMPI_EVENTS_SECRET` | Webhook signature verification |
| `WOMPI_API_URL` | Wompi API base URL |
| `FACEGYM_API_URL` | FaceGYM backend URL (optional, has default) |

### Cloudflare Workers Bindings

| Worker | Binding | Resource |
|--------|---------|----------|
| powerhouse-media-proxy | `MEDIA_BUCKET` | R2 bucket `powerhouse-media` |

---

## Risks

### Critical

1. **Secrets in `.env` file**: The `.env` file contains a GitHub PAT and Cloudflare tokens in plain text. If this file is committed to the repository (it's in `.gitignore` but should be verified), it's a critical security leak. **Recommendation**: Rotate all exposed tokens immediately; use GitHub Secrets + Cloudflare dashboard for env vars only.

### High

2. **No test framework**: Zero testing infrastructure. Any change requires manual verification only.
3. **No linter/formatter**: Code quality enforcement is entirely manual.
4. **No type-check in CI**: TypeScript strict mode is configured but not enforced by CI (`astro check` is not run).

### Medium

5. **Single CI pipeline**: No PR previews, no staging environment.
6. **No lockfile validation**: `npm ci` runs but no integrity check beyond npm's built-in.
7. **FaceGYM coupling**: Portal and webhook features depend entirely on external FaceGYM API availability.

---

## Available Commands

```bash
npm ci          # Install dependencies
npm run dev     # Development server (port 4321)
npm run build   # Static build → dist/
npm run preview # Preview build locally
```

---

## Next Steps

Recommended next phase: **sdd-explore** — explore the codebase interactively to understand specific areas before proposing changes.
