import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://powerhousegym.co',
  output: 'static',
  integrations: [sitemap({
    filter: (page) => !page.includes('/_emdash'),
    changefreq: 'weekly',
    priority: 0.7,
    lastmod: new Date(),
  })],
  vite: {
    build: {
      cssMinify: true,
    },
  },
});
