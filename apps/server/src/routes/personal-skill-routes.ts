import express from 'express';
import { z } from 'zod';
import {
  createPersonalSkill,
  deletePersonalSkill,
  getPersonalSkill,
  listPersonalSkills,
  updatePersonalSkill,
} from '../services/personal-skills.js';
import { asyncHandler, param } from './helpers.js';

const createBody = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(2000).optional(),
  content: z.string().min(1).max(200_000),
});

const updateBody = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(2000).optional(),
  content: z.string().min(1).max(200_000).optional(),
});

export function registerPersonalSkillRoutes(router: express.Router): void {
  router.get(
    '/personal-skills',
    asyncHandler(async (_req, res) => {
      res.json(await listPersonalSkills());
    }),
  );

  router.get(
    '/personal-skills/:slug',
    asyncHandler(async (req, res) => {
      res.json(await getPersonalSkill(param(req.params.slug)));
    }),
  );

  router.post(
    '/personal-skills',
    asyncHandler(async (req, res) => {
      const body = createBody.parse(req.body ?? {});
      res.status(201).json(await createPersonalSkill(body));
    }),
  );

  router.put(
    '/personal-skills/:slug',
    asyncHandler(async (req, res) => {
      const body = updateBody.parse(req.body ?? {});
      res.json(await updatePersonalSkill(param(req.params.slug), body));
    }),
  );

  router.delete(
    '/personal-skills/:slug',
    asyncHandler(async (req, res) => {
      await deletePersonalSkill(param(req.params.slug));
      res.status(204).end();
    }),
  );
}
