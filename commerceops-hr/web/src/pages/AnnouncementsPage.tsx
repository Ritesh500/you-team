import { useEffect, useState } from 'react';
import { Megaphone, Pin, Plus, Trash2 } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useAnnouncementActions, useAnnouncements } from '@/hooks/use-api';
import { can, useAuthStore } from '@/store/auth';
import { formatRelative } from '@/lib/utils';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/Field';
import { ChannelChip } from '@/components/ui/Badge';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, LoadingBlock } from '@/components/ui/States';
import type { Announcement, SalesChannel } from '@/types/api';

function ComposeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { create } = useAnnouncementActions();
  const [form, setForm] = useState({ title: '', body: '', channel: '', pinned: false });
  const [apiError, setApiError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm({ title: '', body: '', channel: '', pinned: false });
    setApiError(null);
  }, [open]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setApiError(null);
    try {
      await create.mutateAsync({
        title: form.title.trim(),
        body: form.body.trim(),
        ...(form.channel ? { channel: form.channel as SalesChannel } : {}),
        pinned: form.pinned,
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
      title="Post an announcement"
      description="Everyone with a login sees this on their dashboard."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="announcement-form" isLoading={create.isPending}>
            Post
          </Button>
        </>
      }
    >
      <form id="announcement-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {apiError && !apiError.fieldErrors.length && (
          <div
            role="alert"
            className="rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-800 ring-1 ring-inset ring-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800"
          >
            {apiError.message}
          </div>
        )}

        <Input
          label="Title"
          value={form.title}
          onChange={(event) => setForm((p) => ({ ...p, title: event.target.value }))}
          error={apiError?.fieldError('title')}
          placeholder="Festive sale readiness"
          required
        />

        <Textarea
          label="Message"
          value={form.body}
          onChange={(event) => setForm((p) => ({ ...p, body: event.target.value }))}
          error={apiError?.fieldError('body')}
          rows={6}
          placeholder="What the team needs to know, and who to contact."
          required
        />

        <Select
          label="Relevant channel"
          value={form.channel}
          onChange={(event) => setForm((p) => ({ ...p, channel: event.target.value }))}
          hint="Optional — tags the post to one marketplace"
        >
          <option value="">Company-wide</option>
          <option value="SHOPIFY">Shopify</option>
          <option value="AMAZON">Amazon</option>
          <option value="FLIPKART">Flipkart</option>
          <option value="MYNTRA">Myntra</option>
        </Select>

        <Checkbox
          label="Pin to the top"
          hint="Pinned posts stay above the rest."
          checked={form.pinned}
          onChange={(event) => setForm((p) => ({ ...p, pinned: event.target.checked }))}
        />
      </form>
    </Modal>
  );
}

export function AnnouncementsPage() {
  const role = useAuthStore((state) => state.user?.role);
  const { data, isLoading, isError, error, refetch } = useAnnouncements();
  const { remove } = useAnnouncementActions();

  const [composeOpen, setComposeOpen] = useState(false);
  const [deleting, setDeleting] = useState<Announcement | null>(null);

  if (isLoading) return <LoadingBlock label="Loading announcements…" />;

  if (isError || !data) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : undefined}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Announcements"
        description="Company-wide and channel-specific updates."
        actions={
          can.postAnnouncements(role) ? (
            <Button
              onClick={() => setComposeOpen(true)}
              leadingIcon={<Plus className="h-4 w-4" aria-hidden />}
            >
              Post announcement
            </Button>
          ) : undefined
        }
      />

      {data.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Megaphone className="h-6 w-6" aria-hidden />}
            title="Nothing posted yet"
            description="Announcements show up here and on everyone's dashboard."
            action={
              can.postAnnouncements(role) ? (
                <Button size="sm" onClick={() => setComposeOpen(true)}>
                  Post the first one
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4">
          {data.map((announcement) => (
            <Card key={announcement.id}>
              <CardBody>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      {announcement.pinned && (
                        <Pin
                          className="mt-1 h-3.5 w-3.5 shrink-0 text-brand-600"
                          aria-label="Pinned"
                        />
                      )}
                      <h2 className="text-base font-semibold text-ink">{announcement.title}</h2>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      {announcement.channel && <ChannelChip channel={announcement.channel} />}
                      <span className="text-xs text-ink-muted">
                        {announcement.author.email} · {formatRelative(announcement.createdAt)}
                      </span>
                    </div>
                  </div>

                  {can.postAnnouncements(role) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleting(announcement)}
                      aria-label={`Delete "${announcement.title}"`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-critical" aria-hidden />
                    </Button>
                  )}
                </div>

                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-secondary">
                  {announcement.body}
                </p>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await remove.mutateAsync(deleting.id);
          setDeleting(null);
        }}
        title="Delete this announcement?"
        message={`"${deleting?.title ?? ''}" will be removed for everyone.`}
        confirmLabel="Delete"
        isLoading={remove.isPending}
        destructive
      />
    </>
  );
}
