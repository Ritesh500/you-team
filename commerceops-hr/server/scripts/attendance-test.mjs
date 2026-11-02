/**
 * Attendance workflow tests against a running server.
 *
 *   node scripts/attendance-test.mjs
 *
 * Covers the check-in/check-out lifecycle, duplicate and concurrent requests,
 * IST business-day handling, working-hour maths, role scoping, and the audited
 * HR correction path.
 */
const BASE = process.env.BASE ?? 'http://localhost:4000';

const ADMIN = { email: 'admin@youteam.in', password: 'Admin@12345' };
const HR = { email: 'meera.krishnan@youteam.in', password: 'Welcome@123' };
const MANAGER = { email: 'priya.nair@youteam.in', password: 'Welcome@123' };
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

async function login(creds) {
  const result = await api('/api/v1/auth/login', { method: 'POST', body: creds });
  if (result.status !== 200) throw new Error(`login failed for ${creds.email}`);
  return { token: result.body.accessToken, user: result.body.user };
}

function section(title) {
  console.log(`\n${title}`);
}

/** The Asia/Kolkata calendar day, computed independently of the server. */
function istBusinessDay(instant = new Date()) {
  return new Date(instant.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

const run = async () => {
  section('Setup');
  const admin = await login(ADMIN);
  const hr = await login(HR);
  const manager = await login(MANAGER);
  const employee = await login(EMPLOYEE);
  check('all four roles can sign in', true);

  // Work against a throwaway employee so the demo data stays intact.
  const stamp = Date.now().toString().slice(-6);
  const created = await api('/api/v1/employees', {
    method: 'POST',
    token: admin.token,
    body: {
      employeeCode: `ATT-${stamp}`,
      firstName: 'Attendance',
      lastName: 'Probe',
      workEmail: `att.${stamp}@youteam.in`,
      designation: 'QA Probe',
      joiningDate: '2026-01-01',
      ctcAnnual: 600000,
      createLogin: true,
      loginRole: 'EMPLOYEE',
      password: 'Probe@12345',
    },
  });
  check('created a probe employee with a login', created.status === 201,
    JSON.stringify(created.body).slice(0, 200));

  const probeId = created.body?.data?.id;
  const probe = await login({ email: `att.${stamp}@youteam.in`, password: 'Probe@12345' });
  check('probe employee can sign in', Boolean(probe.token));

  section('Business day (Asia/Kolkata)');
  const businessDay = await api('/api/v1/attendance/business-day', { token: probe.token });
  check('server reports a business day', businessDay.status === 200);
  check('business day matches the IST calendar date, not UTC',
    businessDay.body?.data?.businessDate === istBusinessDay(),
    `server=${businessDay.body?.data?.businessDate} expected=${istBusinessDay()}`);
  check('server declares the Asia/Kolkata timezone',
    businessDay.body?.data?.timeZone === 'Asia/Kolkata');

  section('Initial state');
  const before = await api('/api/v1/attendance/today', { token: probe.token });
  check('today starts with no record', before.status === 200 && before.body?.data?.record === null,
    JSON.stringify(before.body?.data?.record));
  check('can check in, cannot check out',
    before.body?.data?.canCheckIn === true && before.body?.data?.canCheckOut === false);
  check('not working yet', before.body?.data?.isWorking === false);

  section('Work location validation');
  const noLocation = await api('/api/v1/attendance/check-in', {
    method: 'POST',
    token: probe.token,
    body: {},
  });
  check('check-in without a work location is rejected', noLocation.status === 400,
    `got ${noLocation.status}`);

  const homeNoDetail = await api('/api/v1/attendance/check-in', {
    method: 'POST',
    token: probe.token,
    body: { workLocation: 'HOME' },
  });
  check('work-from-home without a location is rejected', homeNoDetail.status === 400,
    `got ${homeNoDetail.status}`);

  const otherNoDetail = await api('/api/v1/attendance/check-in', {
    method: 'POST',
    token: probe.token,
    body: { workLocation: 'OTHER', workLocationDetail: '  ' },
  });
  check('"other" with a blank location is rejected', otherNoDetail.status === 400,
    `got ${otherNoDetail.status}`);

  const badLocation = await api('/api/v1/attendance/check-in', {
    method: 'POST',
    token: probe.token,
    body: { workLocation: 'MOON' },
  });
  check('an unknown work location is rejected', badLocation.status === 400,
    `got ${badLocation.status}`);

  const stillNoRecord = await api('/api/v1/attendance/today', { token: probe.token });
  check('no attendance row was created by the rejected attempts',
    stillNoRecord.body?.data?.record === null);

  section('Work reports before check-in');
  const earlyReport = await api('/api/v1/attendance/work-reports', {
    method: 'POST',
    token: probe.token,
    body: { details: 'Should not be allowed yet', status: 'IN_PROGRESS' },
  });
  check('adding a work report before check-in is rejected', earlyReport.status === 400,
    `got ${earlyReport.status}`);

  section('Check-in');
  const checkIn = await api('/api/v1/attendance/check-in', {
    method: 'POST',
    token: probe.token,
    body: { workLocation: 'HOME', workLocationDetail: 'Home — Bengaluru' },
  });
  check('check-in succeeds', checkIn.status === 201, `got ${checkIn.status}`);
  check('the work location is stored',
    checkIn.body?.data?.record?.workLocation === 'HOME' &&
      checkIn.body?.data?.record?.workLocationDetail === 'Home — Bengaluru',
    `${checkIn.body?.data?.record?.workLocation} / ${checkIn.body?.data?.record?.workLocationDetail}`);
  check('work reports become editable after check-in',
    checkIn.body?.data?.canEditWorkReports === true &&
      checkIn.body?.data?.workReportsLocked === false);
  check('server recorded a check-in timestamp',
    Boolean(checkIn.body?.data?.record?.checkIn));
  check('status flips to "working"', checkIn.body?.data?.isWorking === true);
  check('check-out is now enabled',
    checkIn.body?.data?.canCheckOut === true && checkIn.body?.data?.canCheckIn === false);
  check('record belongs to the IST business day',
    checkIn.body?.data?.record?.date?.slice(0, 10) === istBusinessDay(),
    `record=${checkIn.body?.data?.record?.date?.slice(0, 10)}`);

  const checkInAt = new Date(checkIn.body.data.record.checkIn);
  check('check-in time is server-generated and recent',
    Math.abs(Date.now() - checkInAt.getTime()) < 60_000,
    `drift ${Math.round((Date.now() - checkInAt.getTime()) / 1000)}s`);

  section('Duplicate and concurrent check-ins');
  const punch = { workLocation: 'OFFICE' };
  const dupCheckIn = await api('/api/v1/attendance/check-in', {
    method: 'POST',
    token: probe.token,
    body: punch,
  });
  check('a second check-in is rejected with 409', dupCheckIn.status === 409,
    `got ${dupCheckIn.status}`);

  const burst = await Promise.all(
    Array.from({ length: 5 }, () =>
      api('/api/v1/attendance/check-in', { method: 'POST', token: probe.token, body: punch }),
    ),
  );
  check('5 simultaneous check-ins are all rejected',
    burst.every((r) => r.status === 409),
    burst.map((r) => r.status).join(','));

  const afterBurst = await api('/api/v1/attendance?pageSize=100', { token: probe.token });
  const todayRows = (afterBurst.body?.data ?? []).filter(
    (row) => row.date.slice(0, 10) === istBusinessDay(),
  );
  check('exactly one attendance row exists for today', todayRows.length === 1,
    `${todayRows.length} rows`);
  check('the check-in time was not overwritten by the retries',
    todayRows[0]?.checkIn === checkIn.body.data.record.checkIn);

  section('Persistence');
  const reRead = await api('/api/v1/attendance/today', { token: probe.token });
  check('state survives a fresh request', reRead.body?.data?.isWorking === true);

  const reLogin = await login({ email: `att.${stamp}@youteam.in`, password: 'Probe@12345' });
  const afterRelogin = await api('/api/v1/attendance/today', { token: reLogin.token });
  check('state survives logout and login',
    afterRelogin.body?.data?.isWorking === true &&
      afterRelogin.body?.data?.record?.checkIn === checkIn.body.data.record.checkIn);
  check('elapsed minutes are reported while working',
    typeof afterRelogin.body?.data?.elapsedMinutes === 'number');

  section('Work reports while the day is open');
  const tooShort = await api('/api/v1/attendance/work-reports', {
    method: 'POST',
    token: probe.token,
    body: { details: 'ab', status: 'PENDING' },
  });
  check('an empty task description is rejected', tooShort.status === 400,
    `got ${tooShort.status}`);

  const r1 = await api('/api/v1/attendance/work-reports', {
    method: 'POST',
    token: probe.token,
    body: { details: 'Reconciled the Amazon settlement report', status: 'COMPLETED' },
  });
  check('a work report can be added', r1.status === 201, `got ${r1.status}`);

  const r2 = await api('/api/v1/attendance/work-reports', {
    method: 'POST',
    token: probe.token,
    body: { details: 'Drafted the Flipkart pricing sheet', status: 'IN_PROGRESS' },
  });
  const r3 = await api('/api/v1/attendance/work-reports', {
    method: 'POST',
    token: probe.token,
    body: { details: 'Myntra catalogue QA', status: 'PENDING' },
  });
  check('multiple reports can be added for one day',
    r3.body?.data?.record?.workReports?.length === 3,
    `${r3.body?.data?.record?.workReports?.length} reports`);
  check('each status is preserved',
    new Set(r3.body.data.record.workReports.map((w) => w.status)).size === 3,
    JSON.stringify(r3.body?.data?.record?.workReports?.map((w) => w.status)));

  const secondId = r2.body.data.record.workReports.find(
    (w) => w.details === 'Drafted the Flipkart pricing sheet',
  ).id;

  const edited = await api(`/api/v1/attendance/work-reports/${secondId}`, {
    method: 'PATCH',
    token: probe.token,
    body: { status: 'COMPLETED' },
  });
  check('a report can be updated while the day is open', edited.status === 200,
    `got ${edited.status}`);
  check('the status change stuck',
    edited.body.data.record.workReports.find((w) => w.id === secondId).status === 'COMPLETED');

  const thirdId = r3.body.data.record.workReports.find(
    (w) => w.details === 'Myntra catalogue QA',
  ).id;
  const removed = await api(`/api/v1/attendance/work-reports/${thirdId}`, {
    method: 'DELETE',
    token: probe.token,
  });
  check('a report can be removed while the day is open', removed.status === 200,
    `got ${removed.status}`);
  check('two reports remain', removed.body?.data?.record?.workReports?.length === 2,
    `${removed.body?.data?.record?.workReports?.length}`);

  const foreign = await api(`/api/v1/attendance/work-reports/${secondId}`, {
    method: 'PATCH',
    token: employee.token,
    body: { status: 'PENDING' },
  });
  check("another employee cannot edit someone else's report",
    foreign.status === 403 || foreign.status === 400,
    `got ${foreign.status}`);

  section('Check-out');
  const checkOut = await api('/api/v1/attendance/check-out', { method: 'POST', token: probe.token });
  check('check-out succeeds', checkOut.status === 200, `got ${checkOut.status}`);
  check('server recorded a check-out timestamp',
    Boolean(checkOut.body?.data?.record?.checkOut));
  check('no longer working', checkOut.body?.data?.isWorking === false);
  check('neither button is enabled afterwards',
    checkOut.body?.data?.canCheckIn === false && checkOut.body?.data?.canCheckOut === false);

  const outRecord = checkOut.body.data.record;
  const expectedMinutes = Math.max(
    0,
    Math.round((new Date(outRecord.checkOut) - new Date(outRecord.checkIn)) / 60_000),
  );
  check('worked minutes match the two timestamps',
    outRecord.workedMinutes === expectedMinutes,
    `stored=${outRecord.workedMinutes} computed=${expectedMinutes}`);
  check('a short session is recorded as a half day',
    outRecord.status === 'HALF_DAY',
    `status=${outRecord.status}`);

  section('Work reports are locked after check-out');
  check('reports are linked to the day and still present',
    checkOut.body?.data?.record?.workReports?.length === 2,
    `${checkOut.body?.data?.record?.workReports?.length} reports`);
  check('the lock flags flip at check-out',
    checkOut.body?.data?.workReportsLocked === true &&
      checkOut.body?.data?.canEditWorkReports === false);

  const lateAdd = await api('/api/v1/attendance/work-reports', {
    method: 'POST',
    token: probe.token,
    body: { details: 'Trying to add after checking out', status: 'PENDING' },
  });
  check('adding a report after check-out is rejected', lateAdd.status === 409,
    `got ${lateAdd.status}`);

  const lateEdit = await api(`/api/v1/attendance/work-reports/${secondId}`, {
    method: 'PATCH',
    token: probe.token,
    body: { details: 'Trying to edit after checking out' },
  });
  check('editing a report after check-out is rejected', lateEdit.status === 409,
    `got ${lateEdit.status}`);

  const lateDelete = await api(`/api/v1/attendance/work-reports/${secondId}`, {
    method: 'DELETE',
    token: probe.token,
  });
  check('deleting a report after check-out is rejected', lateDelete.status === 409,
    `got ${lateDelete.status}`);

  const sealed = await api('/api/v1/attendance/today', { token: probe.token });
  check('the sealed reports are unchanged',
    sealed.body?.data?.record?.workReports?.length === 2 &&
      sealed.body.data.record.workReports.every((w) => w.status === 'COMPLETED'),
    JSON.stringify(sealed.body?.data?.record?.workReports?.map((w) => w.status)));

  section('Duplicate and concurrent check-outs');
  const dupOut = await api('/api/v1/attendance/check-out', { method: 'POST', token: probe.token });
  check('a second check-out is rejected with 409', dupOut.status === 409, `got ${dupOut.status}`);

  const outBurst = await Promise.all(
    Array.from({ length: 5 }, () =>
      api('/api/v1/attendance/check-out', { method: 'POST', token: probe.token }),
    ),
  );
  check('5 simultaneous check-outs are all rejected',
    outBurst.every((r) => r.status === 409),
    outBurst.map((r) => r.status).join(','));

  const finalToday = await api('/api/v1/attendance/today', { token: probe.token });
  check('the check-out time was not overwritten',
    finalToday.body?.data?.record?.checkOut === outRecord.checkOut);
  check('worked minutes were not inflated by the retries',
    finalToday.body?.data?.record?.workedMinutes === outRecord.workedMinutes);

  section('Check-out before check-in');
  const freshStamp = `${Date.now()}`.slice(-6);
  const other = await api('/api/v1/employees', {
    method: 'POST',
    token: admin.token,
    body: {
      employeeCode: `ATT2-${freshStamp}`,
      firstName: 'NoPunch',
      lastName: 'Probe',
      workEmail: `nopunch.${freshStamp}@youteam.in`,
      designation: 'QA Probe',
      joiningDate: '2026-01-01',
      createLogin: true,
      loginRole: 'EMPLOYEE',
      password: 'Probe@12345',
    },
  });
  const otherId = other.body?.data?.id;
  const otherSession = await login({
    email: `nopunch.${freshStamp}@youteam.in`,
    password: 'Probe@12345',
  });
  const earlyOut = await api('/api/v1/attendance/check-out', {
    method: 'POST',
    token: otherSession.token,
  });
  check('checking out without checking in is rejected', earlyOut.status === 400,
    `got ${earlyOut.status}`);

  section('Missing check-out');
  // Record a past day that was checked into but never closed.
  const past = '2026-09-15';
  const seedOpen = await api('/api/v1/attendance/correction', {
    method: 'POST',
    token: hr.token,
    body: {
      employeeId: otherId,
      date: past,
      status: 'PRESENT',
      checkIn: `${past}T03:30:00.000Z`,
      reason: 'Seeding an open day for the missing-checkout test',
    },
  });
  check('HR can record a past day with no check-out', seedOpen.status === 200,
    `got ${seedOpen.status}`);

  const exceptions = await api('/api/v1/attendance/exceptions', { token: hr.token });
  const flagged = (exceptions.body?.data ?? []).find((r) => r.employeeId === otherId);
  check('the open day is flagged as MISSING_CHECKOUT',
    flagged?.status === 'MISSING_CHECKOUT', `status=${flagged?.status}`);
  check('no checkout time was invented', flagged?.checkOut === null,
    `checkOut=${flagged?.checkOut}`);
  check('no working hours were credited', flagged?.workedMinutes === 0,
    `minutes=${flagged?.workedMinutes}`);

  section('HR correction and audit');
  const noReason = await api('/api/v1/attendance/correction', {
    method: 'POST',
    token: hr.token,
    body: { employeeId: otherId, date: past, status: 'PRESENT' },
  });
  check('a correction without a reason is rejected', noReason.status === 400,
    `got ${noReason.status}`);

  const shortReason = await api('/api/v1/attendance/correction', {
    method: 'POST',
    token: hr.token,
    body: { employeeId: otherId, date: past, status: 'PRESENT', reason: 'oops' },
  });
  check('a too-short reason is rejected', shortReason.status === 400,
    `got ${shortReason.status}`);

  const backwards = await api('/api/v1/attendance/correction', {
    method: 'POST',
    token: hr.token,
    body: {
      employeeId: otherId,
      date: past,
      status: 'PRESENT',
      checkIn: `${past}T12:00:00.000Z`,
      checkOut: `${past}T09:00:00.000Z`,
      reason: 'Attempting an inverted range, which must fail',
    },
  });
  check('check-out before check-in is rejected', backwards.status === 400,
    `got ${backwards.status}`);

  const fixed = await api('/api/v1/attendance/correction', {
    method: 'POST',
    token: hr.token,
    body: {
      employeeId: otherId,
      date: past,
      status: 'PRESENT',
      checkIn: `${past}T03:30:00.000Z`,
      checkOut: `${past}T12:30:00.000Z`,
      reason: 'Employee forgot to check out; exit confirmed with the warehouse lead',
    },
  });
  check('a valid correction succeeds', fixed.status === 200, `got ${fixed.status}`);
  check('corrected hours are recomputed', fixed.body?.data?.workedMinutes === 540,
    `minutes=${fixed.body?.data?.workedMinutes}`);
  check('the correction reason is stored on the record',
    typeof fixed.body?.data?.correctionReason === 'string' &&
      fixed.body.data.correctionReason.length > 10);

  const audit = await api('/api/v1/users/audit-log', { token: admin.token });
  const entry = (audit.body?.data ?? []).find(
    (row) => row.entity === 'Attendance' && row.meta?.employeeId === otherId,
  );
  check('the correction is in the audit log', Boolean(entry), 'no Attendance entry found');
  check('the audit entry records who and why',
    Boolean(entry?.actor?.email) && typeof entry?.meta?.reason === 'string');
  check('the audit entry keeps before and after values',
    entry?.meta?.after !== undefined && 'before' in (entry?.meta ?? {}));

  const futureDate = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const future = await api('/api/v1/attendance/correction', {
    method: 'POST',
    token: hr.token,
    body: {
      employeeId: otherId,
      date: futureDate,
      status: 'PRESENT',
      reason: 'Attempting to record a future day, which must fail',
    },
  });
  check('attendance cannot be recorded for a future date', future.status === 400,
    `got ${future.status}`);

  section('Permissions');
  const empCorrect = await api('/api/v1/attendance/correction', {
    method: 'POST',
    token: employee.token,
    body: {
      employeeId: otherId,
      date: past,
      status: 'ABSENT',
      reason: 'An employee should never be able to do this',
    },
  });
  check('an employee cannot correct attendance', empCorrect.status === 403,
    `got ${empCorrect.status}`);

  const empExceptions = await api('/api/v1/attendance/exceptions', { token: employee.token });
  check('an employee cannot read the exceptions queue', empExceptions.status === 403,
    `got ${empExceptions.status}`);

  const empHistory = await api('/api/v1/attendance?pageSize=100', { token: employee.token });
  check('an employee sees only their own records',
    empHistory.status === 200 &&
      empHistory.body.data.every((row) => row.employeeId === employee.user.employeeId),
    `saw ${new Set(empHistory.body?.data?.map((r) => r.employeeId)).size} employees`);

  const empPeek = await api(`/api/v1/attendance?employeeId=${otherId}`, { token: employee.token });
  check("an employee cannot read someone else's records by id",
    empPeek.status === 200 && empPeek.body.meta.total === 0,
    `total=${empPeek.body?.meta?.total}`);

  const mgrHistory = await api('/api/v1/attendance?pageSize=100', { token: manager.token });
  const mgrEmployeeIds = new Set(mgrHistory.body?.data?.map((r) => r.employeeId));
  check('a manager sees their team', mgrHistory.status === 200 && mgrEmployeeIds.size > 1,
    `${mgrEmployeeIds.size} employees`);
  check('a manager does not see the whole company',
    !mgrEmployeeIds.has(otherId),
    'manager could see an unrelated employee');

  const hrHistory = await api('/api/v1/attendance?pageSize=100', { token: hr.token });
  const hrEmployeeIds = new Set(hrHistory.body?.data?.map((r) => r.employeeId));
  check('HR sees more employees than the manager', hrEmployeeIds.size > mgrEmployeeIds.size,
    `hr=${hrEmployeeIds.size} manager=${mgrEmployeeIds.size}`);

  section('Cleanup');
  const d1 = await api(`/api/v1/employees/${probeId}`, { method: 'DELETE', token: admin.token });
  const d2 = await api(`/api/v1/employees/${otherId}`, { method: 'DELETE', token: admin.token });
  check('probe employees removed', d1.status === 204 && d2.status === 204,
    `${d1.status}/${d2.status}`);

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
  console.error('\nAttendance test crashed:', error);
  process.exit(1);
});
