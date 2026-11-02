import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { ApiError } from '@/lib/api';
import {
  useCreateEmployee,
  useDepartments,
  useEmployeeOptions,
  useUpdateEmployee,
} from '@/hooks/use-api';
import { cn, toDateInput, todayInput } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/Field';
import { CHANNEL_META } from '@/components/ui/Badge';
import type { EmployeeDetail, SalesChannel } from '@/types/api';

const ALL_CHANNELS: SalesChannel[] = ['SHOPIFY', 'AMAZON', 'FLIPKART', 'MYNTRA'];

const STATUSES = [
  'ACTIVE',
  'PROBATION',
  'ON_LEAVE',
  'NOTICE_PERIOD',
  'RESIGNED',
  'TERMINATED',
] as const;

const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'FREELANCE'] as const;

const GENDERS = ['UNDISCLOSED', 'FEMALE', 'MALE', 'OTHER'] as const;

interface ChannelRow {
  channel: SalesChannel;
  allocationPct: number;
  isPrimary: boolean;
  channelRole: string;
}

interface FormState {
  employeeCode: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  personalEmail: string;
  phone: string;
  gender: string;
  dateOfBirth: string;
  addressLine: string;
  city: string;
  state: string;
  country: string;
  designation: string;
  employmentType: string;
  status: string;
  joiningDate: string;
  exitDate: string;
  ctcAnnual: string;
  departmentId: string;
  managerId: string;
  channels: ChannelRow[];
  createLogin: boolean;
  loginRole: string;
  password: string;
}

function emptyForm(): FormState {
  return {
    employeeCode: '',
    firstName: '',
    lastName: '',
    workEmail: '',
    personalEmail: '',
    phone: '',
    gender: 'UNDISCLOSED',
    dateOfBirth: '',
    addressLine: '',
    city: '',
    state: '',
    country: 'India',
    designation: '',
    employmentType: 'FULL_TIME',
    status: 'ACTIVE',
    joiningDate: todayInput(),
    exitDate: '',
    ctcAnnual: '',
    departmentId: '',
    managerId: '',
    channels: [],
    createLogin: false,
    loginRole: 'EMPLOYEE',
    password: '',
  };
}

function formFromEmployee(employee: EmployeeDetail): FormState {
  return {
    ...emptyForm(),
    employeeCode: employee.employeeCode,
    firstName: employee.firstName,
    lastName: employee.lastName,
    workEmail: employee.workEmail,
    personalEmail: employee.personalEmail ?? '',
    phone: employee.phone ?? '',
    gender: employee.gender,
    dateOfBirth: toDateInput(employee.dateOfBirth),
    addressLine: employee.addressLine ?? '',
    city: employee.city ?? '',
    state: employee.state ?? '',
    country: employee.country,
    designation: employee.designation,
    employmentType: employee.employmentType,
    status: employee.status,
    joiningDate: toDateInput(employee.joiningDate),
    exitDate: toDateInput(employee.exitDate),
    ctcAnnual: String(employee.ctcAnnual),
    departmentId: employee.departmentId ?? '',
    managerId: employee.managerId ?? '',
    channels: employee.channelAssignments.map((assignment) => ({
      channel: assignment.channel,
      allocationPct: assignment.allocationPct,
      isPrimary: assignment.isPrimary,
      channelRole: assignment.channelRole ?? '',
    })),
  };
}

export function EmployeeFormModal({
  open,
  onClose,
  employee,
}: {
  open: boolean;
  onClose: () => void;
  /** Present → edit mode. */
  employee?: EmployeeDetail;
}) {
  const isEdit = Boolean(employee);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [apiError, setApiError] = useState<ApiError | null>(null);

  const { data: departments } = useDepartments();
  const { data: employeeOptions } = useEmployeeOptions();
  const create = useCreateEmployee();
  const update = useUpdateEmployee();

  // Reset whenever the dialog opens so stale values never leak between uses.
  useEffect(() => {
    if (!open) return;
    setForm(employee ? formFromEmployee(employee) : emptyForm());
    setApiError(null);
  }, [open, employee]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const allocationTotal = useMemo(
    () => form.channels.reduce((sum, row) => sum + (Number(row.allocationPct) || 0), 0),
    [form.channels],
  );

  const overAllocated = allocationTotal > 100;

  const toggleChannel = (channel: SalesChannel) => {
    setForm((previous) => {
      const exists = previous.channels.some((row) => row.channel === channel);
      if (exists) {
        return {
          ...previous,
          channels: previous.channels.filter((row) => row.channel !== channel),
        };
      }
      const remaining = Math.max(
        1,
        100 - previous.channels.reduce((sum, row) => sum + row.allocationPct, 0),
      );
      return {
        ...previous,
        channels: [
          ...previous.channels,
          {
            channel,
            allocationPct: Math.min(100, remaining),
            isPrimary: previous.channels.length === 0,
            channelRole: '',
          },
        ],
      };
    });
  };

  const updateChannel = (channel: SalesChannel, patch: Partial<ChannelRow>) => {
    setForm((previous) => ({
      ...previous,
      channels: previous.channels.map((row) =>
        row.channel === channel
          ? { ...row, ...patch }
          : // Only one channel can be primary.
            patch.isPrimary
            ? { ...row, isPrimary: false }
            : row,
      ),
    }));
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setApiError(null);

    if (overAllocated) {
      setApiError(
        new ApiError(400, 'BAD_REQUEST', 'Channel allocation adds up to more than 100%.'),
      );
      return;
    }

    const channels = form.channels.map((row) => ({
      channel: row.channel,
      allocationPct: Number(row.allocationPct) || 1,
      isPrimary: row.isPrimary,
      ...(row.channelRole.trim() ? { channelRole: row.channelRole.trim() } : {}),
    }));

    // Only send what the server accepts; empty strings mean "clear this field".
    const payload: Record<string, unknown> = {
      employeeCode: form.employeeCode.trim(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      workEmail: form.workEmail.trim(),
      personalEmail: form.personalEmail.trim(),
      phone: form.phone.trim(),
      gender: form.gender,
      dateOfBirth: form.dateOfBirth || undefined,
      addressLine: form.addressLine.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      country: form.country.trim() || 'India',
      designation: form.designation.trim(),
      employmentType: form.employmentType,
      status: form.status,
      joiningDate: form.joiningDate,
      exitDate: form.exitDate || undefined,
      ctcAnnual: Number(form.ctcAnnual) || 0,
      departmentId: form.departmentId,
      managerId: form.managerId,
      channels,
    };

    try {
      if (isEdit && employee) {
        await update.mutateAsync({ id: employee.id, payload });
      } else {
        await create.mutateAsync({
          ...payload,
          createLogin: form.createLogin,
          ...(form.createLogin
            ? { loginRole: form.loginRole, password: form.password }
            : {}),
        });
      }
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError) setApiError(caught);
    }
  };

  const fieldError = (field: string) => apiError?.fieldError(field);
  const isPending = create.isPending || update.isPending;

  // Someone cannot be their own manager.
  const managerCandidates = (employeeOptions ?? []).filter(
    (option) => option.id !== employee?.id,
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={isEdit ? `Edit ${employee!.firstName} ${employee!.lastName}` : 'Add an employee'}
      description={
        isEdit
          ? 'Update the record. Changes are audited.'
          : 'Create the employee record and, optionally, a login for them.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" form="employee-form" isLoading={isPending}>
            {isEdit ? 'Save changes' : 'Create employee'}
          </Button>
        </>
      }
    >
      <form id="employee-form" onSubmit={onSubmit} className="space-y-7" noValidate>
        {apiError && !apiError.fieldErrors.length && (
          <div
            role="alert"
            className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-800 ring-1 ring-inset ring-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800"
          >
            {apiError.message}
          </div>
        )}

        {/* ----- Identity ----- */}
        <fieldset className="space-y-4">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Identity
          </legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Employee code"
              value={form.employeeCode}
              onChange={(event) => set('employeeCode', event.target.value.toUpperCase())}
              error={fieldError('employeeCode')}
              placeholder="YT-029"
              hint="Letters, numbers and hyphens"
              required
            />
            <Input
              label="Designation"
              value={form.designation}
              onChange={(event) => set('designation', event.target.value)}
              error={fieldError('designation')}
              placeholder="Marketplace Executive"
              required
            />
            <Input
              label="First name"
              value={form.firstName}
              onChange={(event) => set('firstName', event.target.value)}
              error={fieldError('firstName')}
              required
            />
            <Input
              label="Last name"
              value={form.lastName}
              onChange={(event) => set('lastName', event.target.value)}
              error={fieldError('lastName')}
              required
            />
            <Input
              label="Work email"
              type="email"
              value={form.workEmail}
              onChange={(event) => set('workEmail', event.target.value)}
              error={fieldError('workEmail')}
              placeholder="name@youteam.in"
              required
            />
            <Input
              label="Personal email"
              type="email"
              value={form.personalEmail}
              onChange={(event) => set('personalEmail', event.target.value)}
              error={fieldError('personalEmail')}
            />
            <Input
              label="Phone"
              value={form.phone}
              onChange={(event) => set('phone', event.target.value)}
              error={fieldError('phone')}
              placeholder="+91 98765 43210"
            />
            <Select
              label="Gender"
              value={form.gender}
              onChange={(event) => set('gender', event.target.value)}
            >
              {GENDERS.map((gender) => (
                <option key={gender} value={gender}>
                  {gender === 'UNDISCLOSED'
                    ? 'Prefer not to say'
                    : gender.charAt(0) + gender.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
            <Input
              label="Date of birth"
              type="date"
              value={form.dateOfBirth}
              onChange={(event) => set('dateOfBirth', event.target.value)}
              error={fieldError('dateOfBirth')}
            />
          </div>
        </fieldset>

        {/* ----- Employment ----- */}
        <fieldset className="space-y-4">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Employment
          </legend>

          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Department"
              value={form.departmentId}
              onChange={(event) => set('departmentId', event.target.value)}
              error={fieldError('departmentId')}
            >
              <option value="">Unassigned</option>
              {(departments ?? []).map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>

            <Select
              label="Reports to"
              value={form.managerId}
              onChange={(event) => set('managerId', event.target.value)}
              error={fieldError('managerId')}
            >
              <option value="">No manager</option>
              {managerCandidates.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.firstName} {option.lastName} — {option.designation}
                </option>
              ))}
            </Select>

            <Select
              label="Employment type"
              value={form.employmentType}
              onChange={(event) => set('employmentType', event.target.value)}
            >
              {EMPLOYMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}
                </option>
              ))}
            </Select>

            <Select
              label="Status"
              value={form.status}
              onChange={(event) => set('status', event.target.value)}
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}
                </option>
              ))}
            </Select>

            <Input
              label="Joining date"
              type="date"
              value={form.joiningDate}
              onChange={(event) => set('joiningDate', event.target.value)}
              error={fieldError('joiningDate')}
              required
            />

            <Input
              label="Exit date"
              type="date"
              value={form.exitDate}
              onChange={(event) => set('exitDate', event.target.value)}
              error={fieldError('exitDate')}
              hint="Leave blank for current employees"
            />

            <Input
              label="Annual CTC (₹)"
              type="number"
              min={0}
              step={1000}
              value={form.ctcAnnual}
              onChange={(event) => set('ctcAnnual', event.target.value)}
              error={fieldError('ctcAnnual')}
              placeholder="900000"
              hint="Drives payroll calculations"
            />
          </div>
        </fieldset>

        {/* ----- Channels ----- */}
        <fieldset className="space-y-3">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Sales channel allocation
          </legend>
          <p className="text-xs text-ink-secondary">
            Pick the marketplaces this person works on and how their time splits. The total cannot
            exceed 100%.
          </p>

          <div className="flex flex-wrap gap-2">
            {ALL_CHANNELS.map((channel) => {
              const active = form.channels.some((row) => row.channel === channel);
              return (
                <button
                  key={channel}
                  type="button"
                  onClick={() => toggleChannel(channel)}
                  aria-pressed={active}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-200'
                      : 'border-hairline text-ink-secondary hover:bg-surface-sunken',
                  )}
                >
                  <span
                    className={cn('h-2 w-2 rounded-full', CHANNEL_META[channel].dot)}
                    aria-hidden
                  />
                  {CHANNEL_META[channel].label}
                </button>
              );
            })}
          </div>

          {form.channels.length > 0 && (
            <div className="space-y-2 rounded-lg border border-hairline bg-surface-sunken p-3">
              {form.channels.map((row) => (
                <div
                  key={row.channel}
                  className="grid items-end gap-2 sm:grid-cols-[8rem_6rem_1fr_auto]"
                >
                  <div className="flex items-center gap-2 pb-2.5 text-sm font-medium text-ink">
                    <span
                      className={cn('h-2 w-2 rounded-full', CHANNEL_META[row.channel].dot)}
                      aria-hidden
                    />
                    {CHANNEL_META[row.channel].label}
                  </div>

                  <Input
                    label="Share %"
                    type="number"
                    min={1}
                    max={100}
                    value={row.allocationPct}
                    onChange={(event) =>
                      updateChannel(row.channel, { allocationPct: Number(event.target.value) })
                    }
                  />

                  <Input
                    label="Role on this channel"
                    value={row.channelRole}
                    onChange={(event) =>
                      updateChannel(row.channel, { channelRole: event.target.value })
                    }
                    placeholder="Ads Manager"
                  />

                  <div className="flex items-center gap-2 pb-2">
                    <Checkbox
                      label="Primary"
                      checked={row.isPrimary}
                      onChange={(event) =>
                        updateChannel(row.channel, { isPrimary: event.target.checked })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => toggleChannel(row.channel)}
                      aria-label={`Remove ${CHANNEL_META[row.channel].label}`}
                    >
                      <Trash2 className="h-4 w-4 text-critical" aria-hidden />
                    </Button>
                  </div>
                </div>
              ))}

              <p
                className={cn(
                  'tabular pt-1 text-xs',
                  overAllocated ? 'font-medium text-critical' : 'text-ink-secondary',
                )}
              >
                Allocated: {allocationTotal}%
                {overAllocated && ' — over 100%, reduce one of the shares'}
              </p>
            </div>
          )}
        </fieldset>

        {/* ----- Location ----- */}
        <fieldset className="space-y-4">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Location
          </legend>
          <Textarea
            label="Address"
            value={form.addressLine}
            onChange={(event) => set('addressLine', event.target.value)}
            rows={2}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="City"
              value={form.city}
              onChange={(event) => set('city', event.target.value)}
            />
            <Input
              label="State"
              value={form.state}
              onChange={(event) => set('state', event.target.value)}
            />
            <Input
              label="Country"
              value={form.country}
              onChange={(event) => set('country', event.target.value)}
            />
          </div>
        </fieldset>

        {/* ----- Login (create only) ----- */}
        {!isEdit && (
          <fieldset className="space-y-4">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Console access
            </legend>

            <Checkbox
              label="Create a login for this employee"
              hint="They will be able to sign in with their work email."
              checked={form.createLogin}
              onChange={(event) => set('createLogin', event.target.checked)}
            />

            {form.createLogin && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Role"
                  value={form.loginRole}
                  onChange={(event) => set('loginRole', event.target.value)}
                  hint="Decides what they can see and change"
                >
                  <option value="EMPLOYEE">Employee</option>
                  <option value="MANAGER">Manager</option>
                  <option value="HR_MANAGER">HR manager</option>
                </Select>
                <Input
                  label="Temporary password"
                  type="text"
                  value={form.password}
                  onChange={(event) => set('password', event.target.value)}
                  error={fieldError('password')}
                  placeholder="Welcome@123"
                  hint="At least 8 characters. Ask them to change it."
                  required
                />
              </div>
            )}
          </fieldset>
        )}
      </form>
    </Modal>
  );
}
