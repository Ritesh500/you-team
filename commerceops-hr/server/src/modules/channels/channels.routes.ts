import { Router } from 'express';
import { z } from 'zod';
import type { SalesChannel } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { validate } from '../../middleware/validate.js';
import { HR_ROLES, requireAuth, requireRole } from '../../middleware/require-auth.js';

const router = Router();

const ALL_CHANNELS: SalesChannel[] = ['SHOPIFY', 'AMAZON', 'FLIPKART', 'MYNTRA'];

/** Presentation metadata for each marketplace, served so the UI stays in sync. */
const CHANNEL_META: Record<SalesChannel, { label: string; accent: string; kind: string }> = {
  SHOPIFY: { label: 'Shopify', accent: '#95BF47', kind: 'Own storefront (D2C)' },
  AMAZON: { label: 'Amazon', accent: '#FF9900', kind: 'Marketplace' },
  FLIPKART: { label: 'Flipkart', accent: '#2874F0', kind: 'Marketplace' },
  MYNTRA: { label: 'Myntra', accent: '#FF3F6C', kind: 'Fashion marketplace' },
};

const channelEnum = z.enum(['SHOPIFY', 'AMAZON', 'FLIPKART', 'MYNTRA']);

const assignSchema = z.object({
  employeeId: z.string().cuid(),
  channel: channelEnum,
  allocationPct: z.coerce.number().int().min(1).max(100).default(100),
  isPrimary: z.boolean().default(false),
  channelRole: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

router.use(requireAuth);

/**
 * GET /api/v1/channels — headcount, cost and staffing mix per sales channel.
 * This is the view HR and the ops lead use to see whether a marketplace is
 * under-staffed relative to the others.
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const assignments = await prisma.channelAssignment.findMany({
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            designation: true,
            avatarUrl: true,
            status: true,
            ctcAnnual: true,
            department: { select: { id: true, name: true } },
          },
        },
      },
    });

    const data = ALL_CHANNELS.map((channel) => {
      const forChannel = assignments.filter((assignment) => assignment.channel === channel);
      const active = forChannel.filter((assignment) =>
        ['ACTIVE', 'PROBATION', 'ON_LEAVE'].includes(assignment.employee.status),
      );

      // Cost is pro-rated by allocation: someone split 50/50 across two
      // marketplaces only burdens each with half their CTC.
      const allocatedCost = active.reduce(
        (sum, assignment) =>
          sum + Number(assignment.employee.ctcAnnual) * (assignment.allocationPct / 100),
        0,
      );

      const fte = active.reduce((sum, assignment) => sum + assignment.allocationPct / 100, 0);

      return {
        channel,
        ...CHANNEL_META[channel],
        headcount: active.length,
        /** Full-time equivalents, accounting for split allocations. */
        fte: Math.round(fte * 100) / 100,
        allocatedAnnualCost: Math.round(allocatedCost),
        primaryOwners: forChannel
          .filter((assignment) => assignment.isPrimary)
          .map((assignment) => ({
            id: assignment.employee.id,
            name: `${assignment.employee.firstName} ${assignment.employee.lastName}`,
            designation: assignment.employee.designation,
            avatarUrl: assignment.employee.avatarUrl,
            channelRole: assignment.channelRole,
          })),
        team: active
          .map((assignment) => ({
            id: assignment.employee.id,
            employeeCode: assignment.employee.employeeCode,
            name: `${assignment.employee.firstName} ${assignment.employee.lastName}`,
            designation: assignment.employee.designation,
            avatarUrl: assignment.employee.avatarUrl,
            department: assignment.employee.department,
            allocationPct: assignment.allocationPct,
            channelRole: assignment.channelRole,
            isPrimary: assignment.isPrimary,
          }))
          .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name)),
      };
    });

    res.json({ data });
  }),
);

/** POST /api/v1/channels/assignments — assign or re-assign an employee. */
router.post(
  '/assignments',
  requireRole(...HR_ROLES),
  validate({ body: assignSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof assignSchema>;

    const employee = await prisma.employee.findUnique({
      where: { id: body.employeeId },
      select: { id: true, channelAssignments: true },
    });

    if (!employee) throw HttpError.notFound('No employee with that id');

    const totalOther = employee.channelAssignments
      .filter((assignment) => assignment.channel !== body.channel)
      .reduce((sum, assignment) => sum + assignment.allocationPct, 0);

    if (totalOther + body.allocationPct > 100) {
      throw HttpError.unprocessable(
        `This employee is already allocated ${totalOther}% across other channels. ` +
          `At most ${100 - totalOther}% is available.`,
      );
    }

    const assignment = await prisma.$transaction(async (tx) => {
      // A single primary channel per employee.
      if (body.isPrimary) {
        await tx.channelAssignment.updateMany({
          where: { employeeId: body.employeeId },
          data: { isPrimary: false },
        });
      }

      return tx.channelAssignment.upsert({
        where: {
          employeeId_channel: { employeeId: body.employeeId, channel: body.channel },
        },
        create: {
          employeeId: body.employeeId,
          channel: body.channel,
          allocationPct: body.allocationPct,
          isPrimary: body.isPrimary,
          channelRole: body.channelRole ?? null,
        },
        update: {
          allocationPct: body.allocationPct,
          isPrimary: body.isPrimary,
          channelRole: body.channelRole ?? null,
        },
      });
    });

    res.status(201).json({ data: assignment });
  }),
);

/** DELETE /api/v1/channels/assignments/:employeeId/:channel */
router.delete(
  '/assignments/:employeeId/:channel',
  requireRole(...HR_ROLES),
  validate({
    params: z.object({ employeeId: z.string().cuid(), channel: channelEnum }),
  }),
  asyncHandler(async (req, res) => {
    const params = req.params as unknown as { employeeId: string; channel: SalesChannel };

    const deleted = await prisma.channelAssignment.deleteMany({
      where: { employeeId: params.employeeId, channel: params.channel },
    });

    if (deleted.count === 0) {
      throw HttpError.notFound('That employee is not assigned to this channel');
    }

    res.status(204).send();
  }),
);

export default router;
