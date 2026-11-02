import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { validate } from '../../middleware/validate.js';
import { HR_ROLES, requireAuth, requireRole } from '../../middleware/require-auth.js';

const router = Router();

const announcementBodySchema = z.object({
  title: z.string().trim().min(3, 'Give the announcement a title').max(150),
  body: z.string().trim().min(5, 'Write at least a sentence').max(4000),
  channel: z.enum(['SHOPIFY', 'AMAZON', 'FLIPKART', 'MYNTRA']).optional(),
  pinned: z.boolean().default(false),
});

router.use(requireAuth);

/** GET /api/v1/announcements */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({
      data: await prisma.announcement.findMany({
        include: { author: { select: { id: true, email: true } } },
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        take: 50,
      }),
    });
  }),
);

/** POST /api/v1/announcements */
router.post(
  '/',
  requireRole(...HR_ROLES),
  validate({ body: announcementBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof announcementBodySchema>;

    const announcement = await prisma.announcement.create({
      data: {
        title: body.title,
        body: body.body,
        channel: body.channel ?? null,
        pinned: body.pinned,
        authorId: req.auth!.userId,
      },
      include: { author: { select: { id: true, email: true } } },
    });

    res.status(201).json({ data: announcement });
  }),
);

/** DELETE /api/v1/announcements/:id */
router.delete(
  '/:id',
  requireRole(...HR_ROLES),
  validate({ params: z.object({ id: z.string().cuid() }) }),
  asyncHandler(async (req, res) => {
    await prisma.announcement.delete({ where: { id: (req.params as { id: string }).id } });
    res.status(204).send();
  }),
);

export default router;
