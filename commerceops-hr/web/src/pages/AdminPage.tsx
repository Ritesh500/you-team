import { useEffect, useState } from 'react';
import { KeyRound, Plus, ShieldCheck, UserCheck, UserX } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useAuditLog, useEmployeeOptions, useUserActions, useUsers } from '@/hooks/use-api';
import { ROLE_LABELS, useAuthStore } from '@/store/auth';
import { cn, formatDate, formatRelative, humanizeEnum } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Field';
import { Table, TableWrap, Td, Th, Tr } from '@/components/ui/Table';
import { PersonCell } from '@/components/ui/Avatar';
import { Badge, InactiveBadge } from '@/components/ui/Badge';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States';
import type { AppUser, Role } from '@/types/api';

const ASSIGNABLE_ROLES: Role[] = ['EMPLOYEE', 'MANAGER', 'HR_MANAGER', 'SUPER_ADMIN'];

function CreateUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const myRole = useAuthStore((state) => state.user?.role);
  const { data: employeeOptions } = useEmployeeOptions();
  const { create } = useUserActions();

  const [form, setForm] = useState({
    email: '',
    password: '',
    role: 'EMPLOYEE' as Role,
    employeeId: '',
  });
  const [apiError, setApiError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({ email: '', password: '', role: 'EMPLOYEE', employeeId: '' });
    setApiError(null);
  }, [open]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setApiError(null);
    try {
      await create.mutateAsync({
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        ...(form.employeeId ? { employeeId: form.employeeId } : {}),
      });
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError) setApiError(caught);
    }
  };

  // Only a super admin can mint another super admin.
  const roles = ASSIGNABLE_ROLES.filter(
    (role) => role !== 'SUPER_ADMIN' || myRole === 'SUPER_ADMIN',
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a login"
      description="Optionally link it to an existing employee record."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="user-form" isLoading={create.isPending}>
            Create login
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {apiError && !apiError.fieldErrors.length && (
          <div
            role="alert"
            className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-800 ring-1 ring-inset ring-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800"
          >
            {apiError.message}
          </div>
        )}

        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={(event) => setForm((p) => ({ ...p, email: event.target.value }))}
          error={apiError?.fieldError('email')}
          placeholder="name@youteam.in"
          required
        />

        <Input
          label="Temporary password"
          type="text"
          value={form.password}
          onChange={(event) => setForm((p) => ({ ...p, password: event.target.value }))}
          error={apiError?.fieldError('password')}
          hint="At least 8 characters, with a letter and a number"
          required
        />

        <Select
          label="Role"
          value={form.role}
          onChange={(event) => setForm((p) => ({ ...p, role: event.target.value as Role }))}
        >
          {roles.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </Select>

        <Select
          label="Link to employee"
          value={form.employeeId}
          onChange={(event) => setForm((p) => ({ ...p, employeeId: event.target.value }))}
          error={apiError?.fieldError('employeeId')}
          hint="Needed for attendance, leave and payslips to work for this person"
        >
          <option value="">Not linked</option>
          {(employeeOptions ?? []).map((option) => (
            <option key={option.id} value={option.id}>
              {option.firstName} {option.lastName} — {option.designation}
            </option>
          ))}
        </Select>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({
  user,
  onClose,
}: {
  user: AppUser | null;
  onClose: () => void;
}) {
  const { update } = useUserActions();
  const [password, setPassword] = useState('');
  const [apiError, setApiError] = useState<ApiError | null>(null);

  useEffect(() => {
    setPassword('');
    setApiError(null);
  }, [user]);

  if (!user) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title="Reset password"
      description={`Sets a new password for ${user.email} and signs out their other sessions.`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button
            isLoading={update.isPending}
            onClick={async () => {
              setApiError(null);
              try {
                await update.mutateAsync({ id: user.id, payload: { password } });
                onClose();
              } catch (caught) {
                if (caught instanceof ApiError) setApiError(caught);
              }
            }}
          >
            Reset password
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {apiError && (
          <div
            role="alert"
            className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-800 ring-1 ring-inset ring-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800"
          >
            {apiError.message}
          </div>
        )}
        <Input
          label="New password"
          type="text"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={apiError?.fieldError('password')}
          hint="At least 8 characters, with a letter and a number"
          required
        />
      </div>
    </Modal>
  );
}

export function AdminPage() {
  const me = useAuthStore((state) => state.user);
  const { data: users, isLoading, isError, error, refetch } = useUsers();
  const { data: auditLog } = useAuditLog();
  const { update } = useUserActions();

  const [createOpen, setCreateOpen] = useState(false);
  const [resetting, setResetting] = useState<AppUser | null>(null);
  const [toggling, setToggling] = useState<AppUser | null>(null);

  if (isLoading) return <LoadingBlock label="Loading users…" />;

  if (isError || !users) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : undefined}
        onRetry={() => void refetch()}
      />
    );
  }

  const canEdit = (user: AppUser) => {
    if (user.id === me?.id) return false;
    if (user.role === 'SUPER_ADMIN' && me?.role !== 'SUPER_ADMIN') return false;
    return true;
  };

  return (
    <>
      <PageHeader
        title="Users &amp; access"
        description="Who can sign in, what they can do, and a log of administrative changes."
        actions={
          <Button
            onClick={() => setCreateOpen(true)}
            leadingIcon={<Plus className="h-4 w-4" aria-hidden />}
          >
            Create login
          </Button>
        }
      />

      <div className="space-y-5">
        <Card>
          <CardHeader
            title="Logins"
            description={`${users.length} accounts · ${users.filter((user) => user.isActive).length} active`}
          />
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Account</Th>
                  <Th>Role</Th>
                  <Th className="hidden lg:table-cell">Linked employee</Th>
                  <Th className="hidden sm:table-cell">Last sign-in</Th>
                  <Th align="right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <Tr key={user.id}>
                    <Td>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{user.email}</p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          {!user.isActive && <InactiveBadge />}
                          {user.id === me?.id && <Badge tone="info">You</Badge>}
                        </div>
                      </div>
                    </Td>

                    <Td>
                      {canEdit(user) ? (
                        <select
                          value={user.role}
                          onChange={(event) =>
                            update.mutate({
                              id: user.id,
                              payload: { role: event.target.value },
                            })
                          }
                          aria-label={`Role for ${user.email}`}
                          className="h-8 rounded-md border border-hairline bg-surface px-2 text-xs text-ink"
                        >
                          {ASSIGNABLE_ROLES.filter(
                            (role) => role !== 'SUPER_ADMIN' || me?.role === 'SUPER_ADMIN',
                          ).map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Badge tone={user.role === 'SUPER_ADMIN' ? 'critical' : 'neutral'}>
                          {ROLE_LABELS[user.role]}
                        </Badge>
                      )}
                    </Td>

                    <Td className="hidden lg:table-cell">
                      {user.employee ? (
                        <PersonCell
                          name={`${user.employee.firstName} ${user.employee.lastName}`}
                          secondary={user.employee.designation}
                          src={user.employee.avatarUrl}
                        />
                      ) : (
                        <span className="text-xs text-ink-muted">Not linked</span>
                      )}
                    </Td>

                    <Td className="tabular hidden text-xs text-ink-secondary sm:table-cell">
                      {user.lastLoginAt ? formatRelative(user.lastLoginAt) : 'Never'}
                    </Td>

                    <Td align="right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setResetting(user)}
                          aria-label={`Reset password for ${user.email}`}
                          title="Reset password"
                        >
                          <KeyRound className="h-3.5 w-3.5" aria-hidden />
                        </Button>

                        {canEdit(user) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setToggling(user)}
                            aria-label={
                              user.isActive
                                ? `Deactivate ${user.email}`
                                : `Reactivate ${user.email}`
                            }
                            title={user.isActive ? 'Deactivate' : 'Reactivate'}
                            className={cn(
                              user.isActive
                                ? 'text-critical hover:bg-rose-50 dark:hover:bg-rose-950'
                                : 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950',
                            )}
                          >
                            {user.isActive ? (
                              <UserX className="h-3.5 w-3.5" aria-hidden />
                            ) : (
                              <UserCheck className="h-3.5 w-3.5" aria-hidden />
                            )}
                          </Button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </Card>

        <Card>
          <CardHeader title="Audit log" description="The 50 most recent administrative changes" />
          {!auditLog || auditLog.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="h-6 w-6" aria-hidden />}
              title="Nothing logged yet"
              description="Creating, editing and deleting records will show up here."
            />
          ) : (
            <TableWrap className="max-h-96 overflow-y-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th>Action</Th>
                    <Th className="hidden sm:table-cell">Entity</Th>
                    <Th className="hidden md:table-cell">By</Th>
                  </tr>
                </thead>
                <tbody>
                  {auditLog.map((entry) => (
                    <Tr key={entry.id}>
                      <Td className="tabular whitespace-nowrap text-xs text-ink-secondary">
                        {formatDate(entry.createdAt)}
                      </Td>
                      <Td>
                        <Badge tone={entry.action.includes('delete') ? 'critical' : 'neutral'}>
                          {humanizeEnum(entry.action.replace(/\./g, ' '))}
                        </Badge>
                      </Td>
                      <Td className="hidden text-xs text-ink-secondary sm:table-cell">
                        {entry.entity}
                      </Td>
                      <Td className="hidden truncate text-xs text-ink-secondary md:table-cell">
                        {entry.actor?.email ?? 'system'}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </Card>
      </div>

      <CreateUserModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />

      <ConfirmDialog
        open={Boolean(toggling)}
        onClose={() => setToggling(null)}
        onConfirm={async () => {
          if (!toggling) return;
          await update.mutateAsync({
            id: toggling.id,
            payload: { isActive: !toggling.isActive },
          });
          setToggling(null);
        }}
        title={toggling?.isActive ? 'Deactivate this login?' : 'Reactivate this login?'}
        message={
          toggling?.isActive
            ? `${toggling.email} will be signed out immediately and unable to sign back in.`
            : `${toggling?.email ?? ''} will be able to sign in again.`
        }
        confirmLabel={toggling?.isActive ? 'Deactivate' : 'Reactivate'}
        isLoading={update.isPending}
        destructive={toggling?.isActive}
      />
    </>
  );
}
