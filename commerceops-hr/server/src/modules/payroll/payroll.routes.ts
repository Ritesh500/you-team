import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../../lib/http-error.js';
import { asyncHandler } from '../../lib/async-handler.js';
import { validate } from '../../middleware/validate.js';
import { HR_ROLES, isManagement, requireAuth, requireRole } from '../../middleware/require-auth.js';
import * as service from './payroll.service.js';

const router = Router();

const idParamSchema = z.object({ id: z.string().cuid('Not a valid payroll run id') });

const generateSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

const statusSchema = z.object({
  status: z.enum(['DRAFT', 'APPROVED', 'PAID']),
});

router.use(requireAuth);

/** GET /api/v1/payroll/runs */
router.get(
  '/runs',
  requireRole(...HR_ROLES),
  asyncHandler(async (_req, res) => {
    res.json({ data: await service.listPayrollRuns() });
  }),
);

/** GET /api/v1/payroll/runs/:id */
router.get(
  '/runs/:id',
  requireRole(...HR_ROLES),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    res.json({ data: await service.getPayrollRun(id) });
  }),
);

/** POST /api/v1/payroll/runs — generate a draft run for a month. */
router.post(
  '/runs',
  requireRole(...HR_ROLES),
  validate({ body: generateSchema }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof generateSchema>;
    const run = await service.generatePayrollRun({
      month: body.month,
      year: body.year,
      actorId: req.auth!.userId,
    });
    res.status(201).json({ data: run });
  }),
);

/** PATCH /api/v1/payroll/runs/:id/status */
router.patch(
  '/runs/:id/status',
  requireRole(...HR_ROLES),
  validate({ params: idParamSchema, body: statusSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    const body = req.body as z.infer<typeof statusSchema>;
    res.json({
      data: await service.updatePayrollRunStatus({
        id,
        status: body.status,
        actorId: req.auth!.userId,
      }),
    });
  }),
);

/** DELETE /api/v1/payroll/runs/:id */
router.delete(
  '/runs/:id',
  requireRole(...HR_ROLES),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    await service.deletePayrollRun(id);
    res.status(204).send();
  }),
);

/**
 * GET /api/v1/payroll/payslips — an employee's own payslips. HR and managers
 * can pass ?employeeId= to look at someone else's.
 */
router.get(
  '/payslips',
  validate({ query: z.object({ employeeId: z.string().cuid().optional() }) }),
  asyncHandler(async (req, res) => {
    const query = req.query as { employeeId?: string };

    const employeeId =
      query.employeeId && isManagement(req.auth!.role) ? query.employeeId : req.auth!.employeeId;

    if (!employeeId) {
      throw HttpError.forbidden('Your login is not linked to an employee record');
    }

    res.json({ data: await service.listPayslipsForEmployee(employeeId) });
  }),
);

export default router;
