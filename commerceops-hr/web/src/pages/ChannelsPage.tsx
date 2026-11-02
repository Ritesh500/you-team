import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ShoppingBag, UserMinus } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useChannelActions, useChannels, useEmployeeOptions } from '@/hooks/use-api';
import { can, useAuthStore } from '@/store/auth';
import { cn, formatCompactCurrency, formatNumber } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Checkbox, Input, Select } from '@/components/ui/Field';
import { Avatar } from '@/components/ui/Avatar';
import { Badge, CHANNEL_META } from '@/components/ui/Badge';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States';
import { StatTile } from '@/components/charts/StatTile';
import type { SalesChannel } from '@/types/api';

function AssignModal({
  open,
  onClose,
  channel,
}: {
  open: boolean;
  onClose: () => void;
  channel: SalesChannel | null;
}) {
  const { data: employeeOptions } = useEmployeeOptions();
  const { assign } = useChannelActions();

  const [form, setForm] = useState({
    employeeId: '',
    allocationPct: 100,
    isPrimary: false,
    channelRole: '',
  });
  const [apiError, setApiError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({ employeeId: '', allocationPct: 100, isPrimary: false, channelRole: '' });
    setApiError(null);
  }, [open]);

  if (!channel) return null;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setApiError(null);
    try {
      await assign.mutateAsync({
        employeeId: form.employeeId,
        channel,
        allocationPct: Number(form.allocationPct),
        isPrimary: form.isPrimary,
        ...(form.channelRole.trim() ? { channelRole: form.channelRole.trim() } : {}),
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
      title={`Assign someone to ${CHANNEL_META[channel].label}`}
      description="The server rejects allocations that would push this person past 100% across all channels."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={assign.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="assign-form" isLoading={assign.isPending}>
            Assign
          </Button>
        </>
      }
    >
      <form id="assign-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {apiError && (
          <div
            role="alert"
            className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-800 ring-1 ring-inset ring-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800"
          >
            {apiError.message}
          </div>
        )}

        <Select
          label="Employee"
          value={form.employeeId}
          onChange={(event) => setForm((p) => ({ ...p, employeeId: event.target.value }))}
          required
        >
          <option value="">Select someone…</option>
          {(employeeOptions ?? []).map((option) => (
            <option key={option.id} value={option.id}>
              {option.firstName} {option.lastName} — {option.designation}
            </option>
          ))}
        </Select>

        <Input
          label="Time allocated to this channel (%)"
          type="number"
          min={1}
          max={100}
          value={form.allocationPct}
          onChange={(event) =>
            setForm((p) => ({ ...p, allocationPct: Number(event.target.value) }))
          }
          required
        />

        <Input
          label="Role on this channel"
          value={form.channelRole}
          onChange={(event) => setForm((p) => ({ ...p, channelRole: event.target.value }))}
          placeholder="Catalogue Lead"
        />

        <Checkbox
          label="Make this their primary channel"
          hint="Replaces any existing primary assignment."
          checked={form.isPrimary}
          onChange={(event) => setForm((p) => ({ ...p, isPrimary: event.target.checked }))}
        />
      </form>
    </Modal>
  );
}

export function ChannelsPage() {
  const role = useAuthStore((state) => state.user?.role);
  const { data, isLoading, isError, error, refetch } = useChannels();
  const { unassign } = useChannelActions();

  const [assigning, setAssigning] = useState<SalesChannel | null>(null);
  const [removing, setRemoving] = useState<{
    employeeId: string;
    name: string;
    channel: SalesChannel;
  } | null>(null);

  if (isLoading) return <LoadingBlock label="Loading channel staffing…" />;

  if (isError || !data) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : undefined}
        onRetry={() => void refetch()}
      />
    );
  }

  const totalFte = data.reduce((sum, channel) => sum + channel.fte, 0);
  const totalCost = data.reduce((sum, channel) => sum + channel.allocatedAnnualCost, 0);

  return (
    <>
      <PageHeader
        title="Sales channels"
        description="Who works on which marketplace, and what each channel costs in people. Split allocations are pro-rated, so the numbers add up."
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {data.map((channel) => (
          <StatTile
            key={channel.channel}
            label={channel.label}
            value={formatNumber(channel.headcount)}
            sublabel={`${channel.fte.toFixed(2)} FTE${
              can.managePayroll(role)
                ? ` · ${formatCompactCurrency(channel.allocatedAnnualCost)}`
                : ''
            }`}
            icon={
              <span
                className={cn('block h-3 w-3 rounded-full', CHANNEL_META[channel.channel].dot)}
                aria-hidden
              />
            }
          />
        ))}
      </div>

      <div className="mb-5 card flex flex-wrap items-center justify-between gap-4 px-4 py-3">
        <p className="text-sm text-ink-secondary">
          Across all four channels:{' '}
          <span className="tabular font-semibold text-ink">{totalFte.toFixed(2)} FTE</span>
          {can.managePayroll(role) && (
            <>
              {' · '}
              <span className="tabular font-semibold text-ink">
                {formatCompactCurrency(totalCost)}
              </span>{' '}
              allocated annual cost
            </>
          )}
        </p>
        <p className="text-xs text-ink-muted">
          Totals are below full headcount because unassigned staff (warehouse, finance, HR) are
          not channel-specific.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {data.map((channel) => (
          <Card key={channel.channel} className="flex flex-col">
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      'h-2.5 w-2.5 shrink-0 rounded-full',
                      CHANNEL_META[channel.channel].dot,
                    )}
                    aria-hidden
                  />
                  {channel.label}
                </span>
              }
              description={`${channel.kind} · ${channel.headcount} ${channel.headcount === 1 ? 'person' : 'people'} · ${channel.fte.toFixed(2)} FTE`}
              action={
                can.manageChannels(role) ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setAssigning(channel.channel)}
                    leadingIcon={<Plus className="h-3.5 w-3.5" aria-hidden />}
                  >
                    Assign
                  </Button>
                ) : undefined
              }
            />

            {channel.primaryOwners.length > 0 && (
              <CardBody className="border-b border-hairline bg-surface-sunken">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  Channel owner
                </p>
                {channel.primaryOwners.map((owner) => (
                  <div key={owner.id} className="flex items-center gap-2.5">
                    <Avatar name={owner.name} src={owner.avatarUrl} size="sm" />
                    <div className="min-w-0">
                      <Link
                        to={`/employees/${owner.id}`}
                        className="block truncate text-sm font-medium text-ink hover:underline"
                      >
                        {owner.name}
                      </Link>
                      <p className="truncate text-xs text-ink-secondary">
                        {owner.channelRole ?? owner.designation}
                      </p>
                    </div>
                  </div>
                ))}
              </CardBody>
            )}

            {channel.team.length === 0 ? (
              <EmptyState
                icon={<ShoppingBag className="h-6 w-6" aria-hidden />}
                title="Nobody assigned"
                description="This marketplace has no one staffed on it."
                action={
                  can.manageChannels(role) ? (
                    <Button size="sm" onClick={() => setAssigning(channel.channel)}>
                      Assign someone
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <ul className="flex-1 divide-y divide-hairline">
                {channel.team.map((member) => (
                  <li
                    key={member.id}
                    className="flex items-center gap-3 px-4 py-2.5 sm:px-5"
                  >
                    <Avatar name={member.name} src={member.avatarUrl} size="xs" />

                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/employees/${member.id}`}
                        className="block truncate text-sm font-medium text-ink hover:underline"
                      >
                        {member.name}
                      </Link>
                      <p className="truncate text-xs text-ink-secondary">
                        {member.channelRole ?? member.designation}
                        {member.department ? ` · ${member.department.name}` : ''}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {member.isPrimary && <Badge tone="info">Primary</Badge>}
                      <span className="tabular text-xs font-medium text-ink-secondary">
                        {member.allocationPct}%
                      </span>
                      {can.manageChannels(role) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            setRemoving({
                              employeeId: member.id,
                              name: member.name,
                              channel: channel.channel,
                            })
                          }
                          aria-label={`Remove ${member.name} from ${channel.label}`}
                        >
                          <UserMinus className="h-3.5 w-3.5 text-critical" aria-hidden />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>

      <AssignModal
        open={Boolean(assigning)}
        onClose={() => setAssigning(null)}
        channel={assigning}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return;
          await unassign.mutateAsync({
            employeeId: removing.employeeId,
            channel: removing.channel,
          });
          setRemoving(null);
        }}
        title="Remove from channel?"
        message={
          removing ? (
            <>
              <strong className="text-ink">{removing.name}</strong> will no longer be staffed on{' '}
              {CHANNEL_META[removing.channel].label}. Their employee record is untouched.
            </>
          ) : null
        }
        confirmLabel="Remove"
        isLoading={unassign.isPending}
        destructive
      />
    </>
  );
}
