import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { HttpError } from '../../lib/http-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { validate } from '../../middleware/validate.js';
import { HR_ROLES, requireAuth, requireRole } from '../../middleware/require-auth.js';

const router = Router();

const departmentBodySchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(80),
  code: z
    .string()
    .trim()
    .min(2, 'Code is required')
    .max(12)
    .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers and hyphens only')
    .transform((value) => value.toUpperCase()),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  headId: z
    .string()
    .cuid()
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

const idParamSchema = z.object({ id: z.string().cuid('Not a valid department id') });

router.use(requireAuth);

/** GET /api/v1/departments — includes headcount and payroll cost per department. */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const departments = await prisma.department.findMany({
      include: {
        head: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        _count: { select: { employees: true } },
      },
      orderBy: { name: 'asc' },
    });

    const costs = await prisma.employee.groupBy({
      by: ['departmentId'],
      _sum: { ctcAnnual: true },
      where: { status: { in: ['ACTIVE', 'PROBATION', 'ON_LEAVE', 'NOTICE_PERIOD'] } },
    });

    const costByDepartment = new Map(
      costs.map((row) => [row.departmentId, Number(row._sum.ctcAnnual ?? 0)]),
    );

    res.json({
      data: departments.map((department) => ({
        ...department,
        headcount: department._count.employees,
        annualPayrollCost: costByDepartment.get(department.id) ?? 0,
      })),
    });
  }),
);

/** GET /api/v1/departments/:id */
router.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const department = await prisma.department.findUnique({
      where: { id: (req.params as { id: string }).id },
      include: {
        head: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        employees: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            designation: true,
            status: true,
            avatarUrl: true,
          },
          orderBy: { firstName: 'asc' },
        },
      },
    });

    if (!department) throw HttpError.notFound('No department with that id');
    res.json({ data: department });
  }),
);

/** POST /api/v1/departments */
router.post(
  '/',
  requireRole(...HR_ROLES),
  validate({ body: departmentBodySchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof departmentBodySchema>;

    const department = await prisma.department.create({
      data: {
        name: body.name,
        code: body.code,
        description: body.description ?? null,
        headId: body.headId ?? null,
      },
    });

    res.status(201).json({ data: department });
  }),
);

/** PATCH /api/v1/departments/:id */
router.patch(
  '/:id',
  requireRole(...HR_ROLES),
  validate({ params: idParamSchema, body: departmentBodySchema.partial() }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const body = req.body as Partial<z.infer<typeof departmentBodySchema>>;

    const department = await prisma.department.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.code !== undefined ? { code: body.code } : {}),
        ...(body.description !== undefined ? { description: body.description ?? null } : {}),
        ...(body.headId !== undefined ? { headId: body.headId ?? null } : {}),
      },
    });

    res.json({ data: department });
  }),
);

/** DELETE /api/v1/departments/:id */
router.delete(
  '/:id',
  requireRole(...HR_ROLES),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };

    const headcount = await prisma.employee.count({ where: { departmentId: id } });
    if (headcount > 0) {
      throw HttpError.conflict(
        `This department still has ${headcount} employee(s). Move them elsewhere before deleting it.`,
      );
    }

    await prisma.department.delete({ where: { id } });
    res.status(204).send();
  }),
);

export default router;
