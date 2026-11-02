import { Router } from 'express';
import authRoutes from './modules/auth/auth.routes.js';
import employeeRoutes from './modules/employees/employees.routes.js';
import departmentRoutes from './modules/departments/departments.routes.js';
import attendanceRoutes from './modules/attendance/attendance.routes.js';
import leaveRoutes from './modules/leave/leave.routes.js';
import payrollRoutes from './modules/payroll/payroll.routes.js';
import channelRoutes from './modules/channels/channels.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import userRoutes from './modules/users/users.routes.js';
import holidayRoutes from './modules/misc/holidays.routes.js';
import announcementRoutes from './modules/misc/announcements.routes.js';

/** Everything under /api/v1. */
const apiRouter = Router();

apiRouter.get('/', (_req, res) => {
  res.json({
    name: 'You Team API',
    version: '1.0.0',
    endpoints: [
      'POST   /api/v1/auth/login',
      'POST   /api/v1/auth/refresh',
      'POST   /api/v1/auth/logout',
      'GET    /api/v1/auth/me',
      'POST   /api/v1/auth/change-password',
      'GET    /api/v1/dashboard/overview',
      'GET    /api/v1/employees',
      'GET    /api/v1/employees/options',
      'GET    /api/v1/employees/:id',
      'POST   /api/v1/employees',
      'PATCH  /api/v1/employees/:id',
      'DELETE /api/v1/employees/:id',
      'GET    /api/v1/departments',
      'GET    /api/v1/departments/:id',
      'POST   /api/v1/departments',
      'PATCH  /api/v1/departments/:id',
      'DELETE /api/v1/departments/:id',
      'GET    /api/v1/attendance',
      'GET    /api/v1/attendance/today',
      'GET    /api/v1/attendance/summary',
      'GET    /api/v1/attendance/exceptions',
      'GET    /api/v1/attendance/business-day',
      'POST   /api/v1/attendance/check-in',
      'POST   /api/v1/attendance/check-out',
      'POST   /api/v1/attendance/work-reports',
      'PATCH  /api/v1/attendance/work-reports/:id',
      'DELETE /api/v1/attendance/work-reports/:id',
      'POST   /api/v1/attendance/correction',
      'POST   /api/v1/attendance/mark',
      'GET    /api/v1/leave/types',
      'POST   /api/v1/leave/types',
      'PATCH  /api/v1/leave/types/:id',
      'GET    /api/v1/leave/balances',
      'GET    /api/v1/leave/requests',
      'POST   /api/v1/leave/requests',
      'PATCH  /api/v1/leave/requests/:id/decision',
      'PATCH  /api/v1/leave/requests/:id/cancel',
      'GET    /api/v1/payroll/runs',
      'GET    /api/v1/payroll/runs/:id',
      'POST   /api/v1/payroll/runs',
      'PATCH  /api/v1/payroll/runs/:id/status',
      'DELETE /api/v1/payroll/runs/:id',
      'GET    /api/v1/payroll/payslips',
      'GET    /api/v1/channels',
      'POST   /api/v1/channels/assignments',
      'DELETE /api/v1/channels/assignments/:employeeId/:channel',
      'GET    /api/v1/users',
      'POST   /api/v1/users',
      'PATCH  /api/v1/users/:id',
      'GET    /api/v1/users/audit-log',
      'GET    /api/v1/holidays',
      'POST   /api/v1/holidays',
      'DELETE /api/v1/holidays/:id',
      'GET    /api/v1/announcements',
      'POST   /api/v1/announcements',
      'DELETE /api/v1/announcements/:id',
    ],
  });
});

apiRouter.use('/auth', authRoutes);
apiRouter.use('/dashboard', dashboardRoutes);
apiRouter.use('/employees', employeeRoutes);
apiRouter.use('/departments', departmentRoutes);
apiRouter.use('/attendance', attendanceRoutes);
apiRouter.use('/leave', leaveRoutes);
apiRouter.use('/payroll', payrollRoutes);
apiRouter.use('/channels', channelRoutes);
apiRouter.use('/users', userRoutes);
apiRouter.use('/holidays', holidayRoutes);
apiRouter.use('/announcements', announcementRoutes);

export default apiRouter;
