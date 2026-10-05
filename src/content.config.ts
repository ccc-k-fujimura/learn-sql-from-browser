import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { lessonId } from './lessons';

const lessons = defineCollection({
  loader: glob({
    pattern: '*/*.md',
    base: './src/content/lessons',
    generateId: ({ entry }) => lessonId(entry),
  }),
  // 項目名の書き間違い（orderd など）が既定値のまま素通りしないよう、知らない項目もエラーにする
  schema: z.strictObject({
    title: z.string(),
    goal: z.string(),
    exercises: z.array(
      z.strictObject({
        prompt: z.string(),
        answer: z.string(),
        hints: z.array(z.string()),
        ordered: z.boolean().default(false),
        checkNames: z.boolean().default(false),
      }),
    ),
  }),
});

export const collections = { lessons };
