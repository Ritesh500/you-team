/**
 * End-to-end API smoke test against a running server.
 *
 *   node scripts/smoke-test.mjs            # expects http://localhost:4000
 *   BASE=http://host:port node scripts/smoke-test.mjs
 *
 * Exercises authentication, RBAC, every list endpoint, and a full
 * create → update → delete employee cycle plus a leave approval.
 */
const BASE = process.env.BASE ?? 'http://localhost:4000';
const ADMIN = { email: 'admin@youteam.in', password: 'Admin@12345' };
const EMPLOYEE = { email: 'karthik.subramanian@youteam.in', password: 'Welcome@123' };

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function api(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  return { status: response.status, body: json };
}

function section(title) {
  console.log(`\n${title}`);
}

const run = async () => {
  section('Health');
  const health = await api('/health');
  check('GET /health returns ok', health.status === 200 && health.body?.status === 'ok',
    JSON.stringify(health.body));

  section('Authentication');
  const badLogin = await api('/api/v1/auth/login', {
    method: 'POST',
    body: { email: ADMIN.email, password: 'wrong-password' },
  });
  check('rejects a wrong password with 401', badLogin.status === 401, `got ${badLogin.status}`);

  const badPayload = await api('/api/v1/auth/login', {
    method: 'POST',
    body: { email: 'not-an-email', password: '' },
  });
  check('rejects a malformed body with 400', badPayload.status === 400, `got ${badPayload.status}`);
  check('validation errors name the fields',
    Array.isArray(badPayload.body?.error?.details) && badPayload.body.error.details.length === 2,
    JSON.stringify(badPayload.body?.error?.details));

  const login = await api('/api/v1/auth/login', { method: 'POST', body: ADMIN });
  check('admin can sign in', login.status === 200 && Boolean(login.body?.accessToken),
    JSON.stringify(login.body).slice(0, 200));

  const adminToken = login.body?.accessToken;
  const refreshToken = login.body?.refreshToken;
  check('login returns the SUPER_ADMIN role', login.body?.user?.role === 'SUPER_ADMIN',
    login.body?.user?.role);

  const noAuth = await api('/api/v1/employees');
  check('unauthenticated request is rejected', noAuth.status === 401, `got ${noAuth.status}`);

  const badToken = await api('/api/v1/employees', { token: 'not.a.real.token' });
  check('a garbage token is rejected', badToken.status === 401, `got ${badToken.status}`);

  const me = await api('/api/v1/auth/me', { token: adminToken });
  check('GET /auth/me resolves the session', me.status === 200 && me.body?.user?.email === ADMIN.email,
    JSON.stringify(me.body));

  const refreshed = await api('/api/v1/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
  });
  check('refresh token exchanges for a new pair',
    refreshed.status === 200 && Boolean(refreshed.body?.accessToken) &&
      refreshed.body.refreshToken !== refreshToken,
    `status ${refreshed.status}`);

  const reused = await api('/api/v1/auth/refresh', { method: 'POST', body: { refreshToken } });
  check('a rotated refresh token cannot be reused', reused.status === 401, `got ${reused.status}`);

  section('Dashboard');
  const dashboard = await api('/api/v1/dashboard/overview', { token: adminToken });
  const kpis = dashboard.body?.data?.kpis;
  // Counts are checked as "at least the seeded set" rather than pinned to it:
  // adding a real employee through the UI should not fail the suite.
  check('overview returns KPIs', dashboard.status === 200 && kpis?.totalEmployees >= 28,
    `totalEmployees=${kpis?.totalEmployees}`);
  check('payroll cost is a number, not a Decimal string',
    typeof kpis?.annualPayrollCost === 'number' && kpis.annualPayrollCost > 0,
    `${typeof kpis?.annualPayrollCost}: ${kpis?.annualPayrollCost}`);
  check('channel staffing covers all four marketplaces',
    dashboard.body?.data?.channelStaffing?.length === 4);
  check('headcount trend has six points',
    dashboard.body?.data?.headcountTrend?.length === 6);

  section('Employees');
  const employees = await api('/api/v1/employees?pageSize=5', { token: adminToken });
  check('list is paginated', employees.status === 200 && employees.body?.data?.length === 5,
    `got ${employees.body?.data?.length}`);
  check('pagination meta is correct',
    employees.body?.meta?.total >= 28 &&
      employees.body?.meta?.totalPages === Math.ceil(employees.body.meta.total / 5),
    JSON.stringify(employees.body?.meta));

  const search = await api('/api/v1/employees?search=priya', { token: adminToken });
  check('search matches by name', search.body?.data?.[0]?.firstName === 'Priya',
    JSON.stringify(search.body?.data?.map((e) => e.firstName)));

  const byChannel = await api('/api/v1/employees?channel=MYNTRA', { token: adminToken });
  check('filter by sales channel works', byChannel.body?.meta?.total > 0,
    `total=${byChannel.body?.meta?.total}`);

  const options = await api('/api/v1/employees/options', { token: adminToken });
  check('options endpoint returns pickable employees', options.body?.data?.length > 20,
    `${options.body?.data?.length}`);

  section('Employee create → update → delete');
  const code = `TEST-${Date.now().toString().slice(-6)}`;
  const created = await api('/api/v1/employees', {
    method: 'POST',
    token: adminToken,
    body: {
      employeeCode: code,
      firstName: 'Smoke',
      lastName: 'Tester',
      workEmail: `smoke.${Date.now()}@youteam.in`,
      designation: 'QA Engineer',
      joiningDate: '2026-01-15',
      ctcAnnual: 900000,
      channels: [{ channel: 'AMAZON', allocationPct: 60, isPrimary: true }],
    },
  });
  check('creates an employee', created.status === 201 && Boolean(created.body?.data?.id),
    JSON.stringify(created.body).slice(0, 300));

  const newId = created.body?.data?.id;

  const duplicate = await api('/api/v1/employees', {
    method: 'POST',
    token: adminToken,
    body: {
      employeeCode: code,
      firstName: 'Dupe',
      lastName: 'Tester',
      workEmail: `dupe.${Date.now()}@youteam.in`,
      designation: 'QA Engineer',
      joiningDate: '2026-01-15',
    },
  });
  check('duplicate employee code returns 409', duplicate.status === 409, `got ${duplicate.status}`);

  const badChannels = await api('/api/v1/employees', {
    method: 'POST',
    token: adminToken,
    body: {
      employeeCode: `BAD-${Date.now().toString().slice(-5)}`,
      firstName: 'Bad',
      lastName: 'Channels',
      workEmail: `bad.${Date.now()}@youteam.in`,
      designation: 'QA',
      joiningDate: '2026-01-15',
      channels: [
        { channel: 'AMAZON', allocationPct: 50, isPrimary: true },
        { channel: 'AMAZON', allocationPct: 50 },
      ],
    },
  });
  check('rejects a duplicated channel assignment', badChannels.status === 400,
    `got ${badChannels.status}`);

  const selfManager = await api(`/api/v1/employees/${newId}`, {
    method: 'PATCH',
    token: adminToken,
    body: { managerId: newId },
  });
  check('rejects self-reporting', selfManager.status === 400, `got ${selfManager.status}`);

  const updated = await api(`/api/v1/employees/${newId}`, {
    method: 'PATCH',
    token: adminToken,
    body: { designation: 'Senior QA Engineer', ctcAnnual: 1150000 },
  });
  check('updates an employee',
    updated.status === 200 && updated.body?.data?.designation === 'Senior QA Engineer',
    JSON.stringify(updated.body).slice(0, 200));
  check('CTC comes back as a number', updated.body?.data?.ctcAnnual === 1150000,
    `${typeof updated.body?.data?.ctcAnnual}: ${updated.body?.data?.ctcAnnual}`);

  const detail = await api(`/api/v1/employees/${newId}`, { token: adminToken });
  check('detail view includes leave balances',
    detail.status === 200 && Array.isArray(detail.body?.data?.leaveBalances) &&
      detail.body.data.leaveBalances.length === 6,
    `${detail.body?.data?.leaveBalances?.length} balances`);

  const missing = await api('/api/v1/employees/clzzzzzzzzzzzzzzzzzzzzzzz', { token: adminToken });
  check('unknown employee id returns 404 or 400', [400, 404].includes(missing.status),
    `got ${missing.status}`);

  section('Departments & channels');
  const departments = await api('/api/v1/departments', { token: adminToken });
  check('departments carry headcount and cost',
    departments.status === 200 && departments.body?.data?.length >= 9 &&
      departments.body.data.every((d) => typeof d.headcount === 'number' &&
        typeof d.annualPayrollCost === 'number'),
    `${departments.body?.data?.length} departments`);

  const channels = await api('/api/v1/channels', { token: adminToken });
  check('channel overview returns all four with teams',
    channels.status === 200 && channels.body?.data?.length === 4 &&
      channels.body.data.every((c) => Array.isArray(c.team) && typeof c.fte === 'number'),
    JSON.stringify(channels.body?.data?.map((c) => [c.channel, c.headcount, c.fte])));

  const overAllocate = await api('/api/v1/channels/assignments', {
    method: 'POST',
    token: adminToken,
    body: { employeeId: newId, channel: 'FLIPKART', allocationPct: 60 },
  });
  check('rejects allocation beyond 100%', overAllocate.status === 422, `got ${overAllocate.status}`);

  const okAllocate = await api('/api/v1/channels/assignments', {
    method: 'POST',
    token: adminToken,
    body: { employeeId: newId, channel: 'FLIPKART', allocationPct: 40 },
  });
  check('accepts an allocation that fits', okAllocate.status === 201, `got ${okAllocate.status}`);

  section('Attendance');
  const attendance = await api('/api/v1/attendance?pageSize=10', { token: adminToken });
  check('attendance list works',
    attendance.status === 200 && attendance.body?.data?.length === 10,
    `got ${attendance.body?.data?.length}`);

  const now = new Date();
  const summary = await api(
    `/api/v1/attendance/summary?year=${now.getUTCFullYear()}&month=${now.getUTCMonth() + 1}`,
    { token: adminToken },
  );
  check('attendance summary returns a series',
    summary.status === 200 && Array.isArray(summary.body?.data?.series) &&
      summary.body.data.series.length > 0,
    `${summary.body?.data?.series?.length} days`);

  const mark = await api('/api/v1/attendance/mark', {
    method: 'POST',
    token: adminToken,
    body: { employeeId: newId, date: '2026-02-02', status: 'WORK_FROM_HOME' },
  });
  check('HR can mark attendance', mark.status === 200, `got ${mark.status}`);

  const badMark = await api('/api/v1/attendance/mark', {
    method: 'POST',
    token: adminToken,
    body: {
      employeeId: newId,
      date: '2026-02-03',
      status: 'PRESENT',
      checkIn: '2026-02-03T12:00:00.000Z',
      checkOut: '2026-02-03T09:00:00.000Z',
    },
  });
  check('rejects check-out before check-in', badMark.status === 400, `got ${badMark.status}`);

  section('Leave');
  const leaveTypes = await api('/api/v1/leave/types', { token: adminToken });
  check('leave types are seeded', leaveTypes.body?.data?.length === 6,
    `${leaveTypes.body?.data?.length}`);

  // Not pinned to the seed's exact count: approving a request through the UI
  // legitimately changes it, and that should not fail the suite.
  const pending = await api('/api/v1/leave/requests?status=PENDING', { token: adminToken });
  check('pending requests are listed',
    pending.status === 200 && Number.isInteger(pending.body?.meta?.total) &&
      pending.body.data.every((request) => request.status === 'PENDING'),
    `status ${pending.status}, total=${pending.body?.meta?.total}`);

  const elType = leaveTypes.body.data.find((t) => t.code === 'EL');
  const filed = await api('/api/v1/leave/requests', {
    method: 'POST',
    token: adminToken,
    body: {
      employeeId: newId,
      leaveTypeId: elType.id,
      startDate: '2026-03-16',
      endDate: '2026-03-18',
      reason: 'Smoke test leave request',
    },
  });
  check('files a leave request', filed.status === 201 && filed.body?.data?.days === 3,
    `status ${filed.status}, days ${filed.body?.data?.days}`);

  const overlap = await api('/api/v1/leave/requests', {
    method: 'POST',
    token: adminToken,
    body: {
      employeeId: newId,
      leaveTypeId: elType.id,
      startDate: '2026-03-17',
      endDate: '2026-03-19',
      reason: 'Overlapping request should fail',
    },
  });
  check('rejects an overlapping request', overlap.status === 409, `got ${overlap.status}`);

  const weekendOnly = await api('/api/v1/leave/requests', {
    method: 'POST',
    token: adminToken,
    body: {
      employeeId: newId,
      leaveTypeId: elType.id,
      startDate: '2026-03-21',
      endDate: '2026-03-22',
      reason: 'Weekend only, no working days',
    },
  });
  check('rejects a range with no working days', weekendOnly.status === 400,
    `got ${weekendOnly.status}`);

  const approved = await api(`/api/v1/leave/requests/${filed.body.data.id}/decision`, {
    method: 'PATCH',
    token: adminToken,
    body: { decision: 'APPROVED', note: 'Approved by smoke test' },
  });
  check('approves a leave request',
    approved.status === 200 && approved.body?.data?.status === 'APPROVED',
    `got ${approved.status}`);

  const balances = await api(`/api/v1/leave/balances?employeeId=${newId}`, { token: adminToken });
  const elBalance = balances.body?.data?.find((b) => b.leaveType.code === 'EL');
  check('approval debited the leave balance', elBalance?.used === 3,
    `used=${elBalance?.used}, available=${elBalance?.available}`);

  const reDecide = await api(`/api/v1/leave/requests/${filed.body.data.id}/decision`, {
    method: 'PATCH',
    token: adminToken,
    body: { decision: 'REJECTED' },
  });
  check('cannot decide an already-decided request', reDecide.status === 409, `got ${reDecide.status}`);

  const cancelled = await api(`/api/v1/leave/requests/${filed.body.data.id}/cancel`, {
    method: 'PATCH',
    token: adminToken,
  });
  check('cancels an approved request', cancelled.status === 200, `got ${cancelled.status}`);

  const balancesAfter = await api(`/api/v1/leave/balances?employeeId=${newId}`, { token: adminToken });
  const elAfter = balancesAfter.body?.data?.find((b) => b.leaveType.code === 'EL');
  check('cancellation credited the days back', elAfter?.used === 0, `used=${elAfter?.used}`);

  section('Payroll');
  const runs = await api('/api/v1/payroll/runs', { token: adminToken });
  check('payroll runs are listed', runs.status === 200 && runs.body?.data?.length === 1,
    `${runs.body?.data?.length} runs`);
  check('run totals are computed', runs.body?.data?.[0]?.totalNetPay > 0,
    `netPay=${runs.body?.data?.[0]?.totalNetPay}`);

  const runDetail = await api(`/api/v1/payroll/runs/${runs.body.data[0].id}`, { token: adminToken });
  check('run detail includes payslips',
    runDetail.status === 200 && runDetail.body?.data?.payslips?.length >= 28,
    `${runDetail.body?.data?.payslips?.length} payslips`);

  const paidRun = runs.body.data[0];
  const badTransition = await api(`/api/v1/payroll/runs/${paidRun.id}/status`, {
    method: 'PATCH',
    token: adminToken,
    body: { status: 'DRAFT' },
  });
  check('a PAID run cannot go back to DRAFT', badTransition.status === 409,
    `got ${badTransition.status}`);

  const duplicateRun = await api('/api/v1/payroll/runs', {
    method: 'POST',
    token: adminToken,
    body: { month: paidRun.month, year: paidRun.year },
  });
  check('refuses to duplicate an existing run', duplicateRun.status === 409,
    `got ${duplicateRun.status}`);

  const newRun = await api('/api/v1/payroll/runs', {
    method: 'POST',
    token: adminToken,
    body: { month: 1, year: 2026 },
  });
  check('generates a new draft run', newRun.status === 201, `got ${newRun.status}`);

  if (newRun.status === 201) {
    const approveRun = await api(`/api/v1/payroll/runs/${newRun.body.data.id}/status`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'APPROVED' },
    });
    check('draft → approved transition works', approveRun.status === 200, `got ${approveRun.status}`);

    const deleteApproved = await api(`/api/v1/payroll/runs/${newRun.body.data.id}`, {
      method: 'DELETE',
      token: adminToken,
    });
    check('an approved run cannot be deleted', deleteApproved.status === 409,
      `got ${deleteApproved.status}`);

    await api(`/api/v1/payroll/runs/${newRun.body.data.id}/status`, {
      method: 'PATCH',
      token: adminToken,
      body: { status: 'DRAFT' },
    });
    const deleteDraft = await api(`/api/v1/payroll/runs/${newRun.body.data.id}`, {
      method: 'DELETE',
      token: adminToken,
    });
    check('a draft run can be deleted', deleteDraft.status === 204, `got ${deleteDraft.status}`);
  }

  section('Role-based access control');
  const empLogin = await api('/api/v1/auth/login', { method: 'POST', body: EMPLOYEE });
  check('an employee can sign in', empLogin.status === 200, `got ${empLogin.status}`);
  const empToken = empLogin.body?.accessToken;

  const empCreate = await api('/api/v1/employees', {
    method: 'POST',
    token: empToken,
    body: {
      employeeCode: 'NOPE-1',
      firstName: 'Should',
      lastName: 'Fail',
      workEmail: 'nope@youteam.in',
      designation: 'Nothing',
      joiningDate: '2026-01-01',
    },
  });
  check('an employee cannot create employees', empCreate.status === 403, `got ${empCreate.status}`);

  const empUsers = await api('/api/v1/users', { token: empToken });
  check('an employee cannot list users', empUsers.status === 403, `got ${empUsers.status}`);

  const empPayroll = await api('/api/v1/payroll/runs', { token: empToken });
  check('an employee cannot see payroll runs', empPayroll.status === 403, `got ${empPayroll.status}`);

  const empOther = await api(`/api/v1/employees/${newId}`, { token: empToken });
  check("an employee cannot read someone else's profile", empOther.status === 403,
    `got ${empOther.status}`);

  const empSelf = await api(`/api/v1/employees/${empLogin.body.user.employeeId}`, {
    token: empToken,
  });
  check('an employee can read their own profile', empSelf.status === 200, `got ${empSelf.status}`);

  const empPayslips = await api('/api/v1/payroll/payslips', { token: empToken });
  check('an employee can read their own payslips',
    empPayslips.status === 200 && empPayslips.body?.data?.length >= 1,
    `${empPayslips.body?.data?.length} payslips`);

  const empDelete = await api(`/api/v1/employees/${newId}`, { method: 'DELETE', token: empToken });
  check('an employee cannot delete employees', empDelete.status === 403, `got ${empDelete.status}`);

  section('Admin safety rails');
  const selfDeactivate = await api(`/api/v1/users/${login.body.user.id}`, {
    method: 'PATCH',
    token: adminToken,
    body: { isActive: false },
  });
  check('admin cannot deactivate their own account', selfDeactivate.status === 400,
    `got ${selfDeactivate.status}`);

  const users = await api('/api/v1/users', { token: adminToken });
  check('user list works', users.status === 200 && users.body?.data?.length >= 11,
    `${users.body?.data?.length} users`);

  const audit = await api('/api/v1/users/audit-log', { token: adminToken });
  check('audit log recorded our changes', audit.status === 200 && audit.body?.data?.length > 0,
    `${audit.body?.data?.length} entries`);

  section('Cleanup');
  const deleted = await api(`/api/v1/employees/${newId}`, { method: 'DELETE', token: adminToken });
  check('deletes the test employee', deleted.status === 204, `got ${deleted.status}`);

  const notFound = await api('/api/v1/nope');
  check('unknown route returns 404', notFound.status === 404, `got ${notFound.status}`);

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${passed} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const failure of failures) console.log(`  • ${failure}`);
  }
  console.log(`${'─'.repeat(60)}\n`);

  process.exit(failed > 0 ? 1 : 0);
};

run().catch((error) => {
  console.error('\nSmoke test crashed:', error);
  process.exit(1);
});
