import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { validate } from '../../middleware/validate.js';
import { HR_ROLES, requireAuth, requireRole } from '../../middleware/require-auth.js';
import { toDateOnly } from '../../lib/dates.js';

const router = Router();

const holidayBodySchema = z.object({
  name: z.string().trim().min(2).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD'),
  isOptional: z.boolean().default(false),
});

router.use(requireAuth);

/** GET /api/v1/holidays */
router.get(
  '/',
  validate({ query: z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() }) }),
  asyncHandler(async (req, res) => {
    const { year } = req.query as { year?: number };

    res.json({
      data: await prisma.holiday.findMany({
        ...(year
          ? {
              where: {
                date: {
                  gte: new Date(Date.UTC(year, 0, 1)),
                  lte: new Date(Date.UTC(year, 11, 31)),
                },
              },
            }
          : {}),
        orderBy: { date: 'asc' },
      }),
    });
  }),
);

/** POST /api/v1/holidays */
router.post(
  '/',
  requireRole(...HR_ROLES),
  validate({ body: holidayBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof holidayBodySchema>;
    const holiday = await prisma.holiday.create({
      data: { name: body.name, date: toDateOnly(body.date), isOptional: body.isOptional },
    });
    res.status(201).json({ data: holiday });
  }),
);

/** DELETE /api/v1/holidays/:id */
router.delete(
  '/:id',
  requireRole(...HR_ROLES),
  validate({ params: z.object({ id: z.string().cuid() }) }),
  asyncHandler(async (req, res) => {
    await prisma.holiday.delete({ where: { id: (req.params as { id: string }).id } });
    res.status(204).send();
  }),
);

export default router;
