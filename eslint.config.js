import eslintPluginAstro from "eslint-plugin-astro";
import tseslint from "typescript-eslint";

export default [
  // Ignore patterns
  {
    ignores: [
      "dist/",
      ".astro/",
      ".wrangler/",
      "node_modules/",
      "coverage/",
      // Astro parser edge case with ${} template expressions in HTML
      "src/pages/privacidad.astro",
      "src/pages/terminos.astro",
    ],
  },

  // Astro plugin recommended config (handles .astro files with its own parser)
  ...eslintPluginAstro.configs.recommended,

  // TypeScript support — scoped to .ts files only so it doesn't override .astro parsing
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.ts"],
  })),

  // Astro file overrides — relax TS rules in Astro <script> sections (false positives)
  // The plugin creates virtual .ts/.js files for <script> blocks, so we match those too
  {
    files: ["**/*.astro", "**/*.astro/**"],
    rules: {
      "astro/no-set-html-directive": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
