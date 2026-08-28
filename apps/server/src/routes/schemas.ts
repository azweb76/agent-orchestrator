import type express from 'express';
import { z } from 'zod';
import { param } from './helpers.js';

export const sessionTemplate = z.enum([
  'chat',
  'build',
  'create-draft-pr',
  'review',
  'address-review',
  'fix-ci',
]);

export const mentionBody = z
  .array(
    z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('diff') }),
      z.object({ kind: z.literal('file'), path: z.string().min(1) }),
    ]),
  )
  .optional();

export const chatBody = z
  .object({
    message: z.string(),
    force: z.boolean().optional(),
    images: z
      .array(
        z.object({
          name: z.string().min(1),
          mimeType: z.string().min(1),
          dataBase64: z.string().min(1),
        }),
      )
      .optional(),
    mentions: mentionBody,
  })
  .refine(
    (value) =>
      value.message.trim().length > 0 ||
      (value.images?.length ?? 0) > 0 ||
      (value.mentions?.length ?? 0) > 0,
    { message: 'Message, image, or mention required' },
  );

export const queueBody = z
  .object({
    message: z.string(),
    images: z
      .array(
        z.object({
          name: z.string().min(1),
          mimeType: z.string().min(1),
          dataBase64: z.string().min(1),
        }),
      )
      .optional(),
    mentions: mentionBody,
  })
  .refine(
    (value) =>
      value.message.trim().length > 0 ||
      (value.images?.length ?? 0) > 0 ||
      (value.mentions?.length ?? 0) > 0,
    { message: 'Message, image, or mention required' },
  );

export function prRef(req: express.Request): { owner: string; repo: string; prNumber: number } {
  const segment = z.string().min(1).max(100).regex(/^[A-Za-z0-9._-]+$/);
  const parsed = z
    .object({
      owner: segment,
      repo: segment,
      number: z.coerce.number().int().positive(),
    })
    .parse({
      owner: param(req.params.owner),
      repo: param(req.params.repo),
      number: param(req.params.number),
    });
  return { owner: parsed.owner, repo: parsed.repo, prNumber: parsed.number };
}
