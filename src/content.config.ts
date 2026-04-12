import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    date: z.string(),
    category: z.string().default('General'),
    excerpt: z.string().default(''),
    featuredImage: z.string().default(''),
  }),
});

export const collections = { blog };
