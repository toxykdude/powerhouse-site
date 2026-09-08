import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://powerhousegym.co",
  output: "static",
  integrations: [
    sitemap({
      // Only indexable marketing/content pages belong in the sitemap.
      // Utility flows (member portal, payment, checkout, thank-you) are
      // either noindex or auth-walled; listing them in the sitemap sent
      // mixed signals and produced the 401/noindex exclusions in GSC.
      filter: (page) =>
        !page.includes("/_emdash") &&
        !page.includes("/portal") &&
        !page.includes("/pago/") &&
        !page.includes("/comprar") &&
        !page.includes("/evaluacion/gracias"),
      changefreq: "weekly",
      priority: 0.7,
      lastmod: new Date(),
    }),
  ],
  vite: {
    build: {
      cssMinify: true,
    },
  },
});
