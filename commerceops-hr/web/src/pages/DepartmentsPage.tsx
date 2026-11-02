import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { ApiError } from '@/lib/api';
import {
  useDeleteDepartment,
  useDepartments,
  useEmployeeOptions,
  useSaveDepartment,
} from '@/hooks/use-api';
import { can, useAuthStore } from '@/store/auth';
import { formatCompactCurrency, formatNumber } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Avatar } from '@/components/ui/Avatar';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States';
import type { Department } from '@/types/api';

function DepartmentFormModal({
  open,
  onClose,
  department,
}: {
  open: boolean;
  onClose: () => void;
  department?: Department;
}) {
  const { data: employeeOptions } = useEmployeeOptions();
  const save = useSaveDepartment();

  const [form, setForm] = useState({ name: '', code: '', description: '', headId: '' });
  const [apiError, setApiError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({
      name: department?.name ?? '',
      code: department?.code ?? '',
      description: department?.description ?? '',
      headId: department?.headId ?? '',
    });
    setApiError(null);
  }, [open, department]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setApiError(null);
    try {
      await save.mutateAsync({
        id: department?.id,
        payload: {
          name: form.name.trim(),
          code: form.code.trim(),
          description: form.description.trim(),
          headId: form.headId,
        },
      });
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError) setApiError(caught);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={department ? `Edit ${department.name}` : 'New department'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="department-form" isLoading={save.isPending}>
            {department ? 'Save changes' : 'Create department'}
          </Button>
        </>
      }
    >
      <form id="department-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {apiError && !apiError.fieldErrors.length && (
          <div
            role="alert"
            className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-800 ring-1 ring-inset ring-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800"
          >
            {apiError.message}
          </div>
        )}

        <Input
          label="Name"
          value={form.name}
          onChange={(event) => setForm((p) => ({ ...p, name: event.target.value }))}
          error={apiError?.fieldError('name')}
          placeholder="Marketplace Operations"
          required
        />

        <Input
          label="Short code"
          value={form.code}
          onChange={(event) => setForm((p) => ({ ...p, code: event.target.value.toUpperCase() }))}
          error={apiError?.fieldError('code')}
          placeholder="MKTOPS"
          hint="Used in reports and exports"
          required
        />

        <Select
          label="Department head"
          value={form.headId}
          onChange={(event) => setForm((p) => ({ ...p, headId: event.target.value }))}
          error={apiError?.fieldError('headId')}
          hint="One person can head only one department"
        >
          <option value="">No head assigned</option>
          {(employeeOptions ?? []).map((option) => (
            <option key={option.id} value={option.id}>
              {option.firstName} {option.lastName} — {option.designation}
            </option>
          ))}
        </Select>

        <Textarea
          label="Description"
          value={form.description}
          onChange={(event) => setForm((p) => ({ ...p, description: event.target.value }))}
          placeholder="What this team owns"
          rows={3}
        />
      </form>
    </Modal>
  );
}

export function DepartmentsPage() {
  const role = useAuthStore((state) => state.user?.role);
  const { data, isLoading, isError, error, refetch } = useDepartments();
  const remove = useDeleteDepartment();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Department | undefined>();
  const [deleting, setDeleting] = useState<Department | null>(null);

  if (isLoading) return <LoadingBlock label="Loading departments…" />;

  if (isError || !data) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : undefined}
        onRetry={() => void refetch()}
      />
    );
  }

  const totalHeadcount = data.reduce((sum, department) => sum + department.headcount, 0);
  const totalCost = data.reduce((sum, department) => sum + department.annualPayrollCost, 0);

  return (
    <>
      <PageHeader
        title="Departments"
        description={`${data.length} functions · ${formatNumber(totalHeadcount)} people · ${formatCompactCurrency(totalCost)} annual cost`}
        actions={
          can.manageDepartments(role) ? (
            <Button
              onClick={() => {
                setEditing(undefined);
                setFormOpen(true);
              }}
              leadingIcon={<Plus className="h-4 w-4" aria-hidden />}
            >
              New department
            </Button>
          ) : undefined
        }
      />

      {data.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Building2 className="h-6 w-6" aria-hidden />}
            title="No departments yet"
            description="Create your first department to organise the roster."
            action={
              can.manageDepartments(role) ? (
                <Button size="sm" onClick={() => setFormOpen(true)}>
                  New department
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((department) => (
            <Card key={department.id} className="flex flex-col">
              <CardBody className="flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-ink">
                      {department.name}
                    </h2>
                    <p className="tabular mt-0.5 text-xs text-ink-muted">{department.code}</p>
                  </div>

                  {can.manageDepartments(role) && (
                    <div className="flex shrink-0 gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditing(department);
                          setFormOpen(true);
                        }}
                        aria-label={`Edit ${department.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleting(department)}
                        aria-label={`Delete ${department.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-critical" aria-hidden />
                      </Button>
                    </div>
                  )}
                </div>

                {department.description && (
                  <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-ink-secondary">
                    {department.description}
                  </p>
                )}

                <dl className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-surface-sunken px-3 py-2">
                    <dt className="text-[11px] text-ink-muted">Headcount</dt>
                    <dd className="tabular mt-0.5 text-lg font-semibold text-ink">
                      {department.headcount}
                    </dd>
                  </div>
                  {can.managePayroll(role) && (
                    <div className="rounded-lg bg-surface-sunken px-3 py-2">
                      <dt className="text-[11px] text-ink-muted">Annual cost</dt>
                      <dd className="tabular mt-0.5 text-lg font-semibold text-ink">
                        {formatCompactCurrency(department.annualPayrollCost)}
                      </dd>
                    </div>
                  )}
                </dl>
              </CardBody>

              <div className="flex items-center justify-between gap-3 border-t border-hairline px-4 py-3 sm:px-5">
                {department.head ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar
                      name={`${department.head.firstName} ${department.head.lastName}`}
                      src={department.head.avatarUrl}
                      size="xs"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-ink">
                        {department.head.firstName} {department.head.lastName}
                      </p>
                      <p className="text-[11px] text-ink-muted">Department head</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-ink-muted">No head assigned</p>
                )}

                <Link
                  to={`/employees?departmentId=${department.id}`}
                  className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                >
                  <Users className="h-3 w-3" aria-hidden />
                  Roster
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      <DepartmentFormModal
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(undefined);
        }}
        department={editing}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await remove.mutateAsync(deleting.id);
          setDeleting(null);
        }}
        title={`Delete ${deleting?.name ?? 'department'}?`}
        message={
          deleting && deleting.headcount > 0 ? (
            <>
              This department still has{' '}
              <strong className="text-ink">{deleting.headcount} employee(s)</strong>. Move them to
              another department first — the server will refuse this otherwise.
            </>
          ) : (
            'This department has no employees and can be removed safely.'
          )
        }
        confirmLabel="Delete department"
        isLoading={remove.isPending}
        destructive
      />
    </>
  );
}
