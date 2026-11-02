import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export function NotFoundPage() {
  return (
    <Card className="mx-auto max-w-lg">
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <div className="mb-4 rounded-full bg-surface-sunken p-3.5 text-ink-muted">
          <Compass className="h-7 w-7" aria-hidden />
        </div>
        <p className="text-sm font-semibold text-brand-600">404</p>
        <h1 className="mt-1 text-xl font-semibold text-ink">This page does not exist</h1>
        <p className="mt-2 max-w-sm text-balance text-sm text-ink-secondary">
          The link may be out of date, or you may not have access to it.
        </p>
        <Link to="/" className="mt-5">
          <Button>Back to the dashboard</Button>
        </Link>
      </div>
    </Card>
  );
}
