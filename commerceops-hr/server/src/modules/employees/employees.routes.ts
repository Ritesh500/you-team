import { Router } from 'express';
import { asyncHandler } from '../../lib/async-handler.js';
import { HttpError } from '../../lib/http-error.js';
import { validate } from '../../middleware/validate.js';
import { HR_ROLES, isManagement, requireAuth, requireRole } from '../../middleware/require-auth.js';
import {
  createEmployeeSchema,
  employeeIdParamSchema,
  listEmployeesSchema,
  updateEmployeeSchema,
  type ListEmployeesQuery,
} from './employees.schema.js';
import * as service from './employees.service.js';

const router = Router();

router.use(requireAuth);

/** GET /api/v1/employees */
router.get(
  '/',
  validate({ query: listEmployeesSchema }),
  asyncHandler(async (req, res) => {
    const query = { ...(req.query as unknown as ListEmployeesQuery) };

    // Individual contributors only see their own department's roster.
    if (!isManagement(req.auth!.role)) {
      const self = req.auth!.employeeId;
      if (!self) throw HttpError.forbidden('Your login is not linked to an employee record');
      const me = await service.getEmployee(self);
      query.departmentId = me.departmentId ?? undefined;
    }

    res.json(await service.listEmployees(query));
  }),
);

/** GET /api/v1/employees/options — compact list for pickers */
router.get(
  '/options',
  asyncHandler(async (_req, res) => {
    res.json({ data: await service.listEmployeeOptions() });
  }),
);

/** GET /api/v1/employees/:id */
router.get(
  '/:id',
  validate({ params: employeeIdParamSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };

    if (!isManagement(req.auth!.role) && req.auth!.employeeId !== id) {
      throw HttpError.forbidden('You can only view your own profile');
    }

    res.json({ data: await service.getEmployee(id) });
  }),
);

/** POST /api/v1/employees */
router.post(
  '/',
  requireRole(...HR_ROLES),
  validate({ body: createEmployeeSchema }),
  asyncHandler(async (req, res) => {
    const employee = await service.createEmployee(req.body, req.auth!.userId);
    res.status(201).json({ data: employee });
  }),
);

/** PATCH /api/v1/employees/:id */
router.patch(
  '/:id',
  requireRole(...HR_ROLES),
  validate({ params: employeeIdParamSchema, body: updateEmployeeSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    res.json({ data: await service.updateEmployee(id, req.body, req.auth!.userId) });
  }),
);

/** DELETE /api/v1/employees/:id */
router.delete(
  '/:id',
  requireRole('SUPER_ADMIN'),
  validate({ params: employeeIdParamSchema }),
  asyncHandler(async (req, res) => {
    const { id } = req.params as { id: string };
    await service.deleteEmployee(id, req.auth!.userId);
    res.status(204).send();
  }),
);

export default router;
