import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Lock, Mail, ShoppingBag } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { cn } from '@/lib/utils';

/** Seeded accounts, offered as one-click fills so the app is explorable. */
const DEMO_ACCOUNTS = [
  { label: 'Super admin', email: 'admin@youteam.in', password: 'Admin@12345' },
  { label: 'HR manager', email: 'meera.krishnan@youteam.in', password: 'Welcome@123' },
  { label: 'Manager', email: 'priya.nair@youteam.in', password: 'Welcome@123' },
  { label: 'Employee', email: 'karthik.subramanian@youteam.in', password: 'Welcome@123' },
];

const CHANNELS = [
  { name: 'Shopify', dot: 'bg-shopify' },
  { name: 'Amazon', dot: 'bg-amazon' },
  { name: 'Flipkart', dot: 'bg-flipkart' },
  { name: 'Myntra', dot: 'bg-myntra' },
];

export function LoginPage() {
  const login = useAuthStore((state) => state.login);
  const user = useAuthStore((state) => state.user);
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping);
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isBootstrapping && user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />;
  }

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, 'UNKNOWN', 'Could not sign in. Please try again.'),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel — hidden on small screens where it would just push the form down. */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-700 p-10 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, white 0, transparent 45%), radial-gradient(circle at 80% 70%, white 0, transparent 40%)',
          }}
          aria-hidden
        />

        <div className="relative flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 text-lg font-bold backdrop-blur">
            Y
          </span>
          <div className="leading-tight">
            <p className="font-semibold">You Team</p>
            <p className="text-xs text-white/70">HR &amp; People Ops</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-balance text-3xl font-semibold leading-tight">
            One place for the people behind every order.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-white/80">
            Headcount, attendance, leave and payroll for a team that ships across four
            marketplaces — with each person&apos;s channel allocation tracked where it belongs.
          </p>

          <ul className="mt-8 flex flex-wrap gap-2">
            {CHANNELS.map((channel) => (
              <li
                key={channel.name}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur"
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', channel.dot)} aria-hidden />
                {channel.name}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/50">
          © {new Date().getFullYear()} You Team Retail Pvt. Ltd.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-plane px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="mb-5 flex items-center gap-2.5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-600 text-lg font-bold text-white">
                Y
              </span>
              <div className="leading-tight">
                <p className="font-semibold text-ink">You Team</p>
                <p className="text-xs text-ink-muted">HR &amp; People Ops</p>
              </div>
            </div>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h2>
          <p className="mt-1.5 text-sm text-ink-secondary">
            Use your work email to access the HR console.
          </p>

          <form onSubmit={onSubmit} className="mt-7 space-y-4" noValidate>
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-800 ring-1 ring-inset ring-rose-200 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>{error.message}</span>
              </div>
            )}

            <Input
              label="Work email"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@youteam.in"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={error?.fieldError('email')}
              leadingIcon={<Mail className="h-4 w-4" aria-hidden />}
              required
              autoFocus
            />

            <Input
              label="Password"
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              error={error?.fieldError('password')}
              leadingIcon={<Lock className="h-4 w-4" aria-hidden />}
              required
            />

            <Button
              type="submit"
              fullWidth
              size="lg"
              isLoading={isSubmitting}
              trailingIcon={<ArrowRight className="h-4 w-4" aria-hidden />}
            >
              Sign in
            </Button>
          </form>

          <div className="mt-8 rounded-card border border-hairline bg-surface p-4">
            <div className="mb-3 flex items-center gap-1.5">
              <ShoppingBag className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
              <p className="text-xs font-semibold text-ink">Demo accounts</p>
            </div>
            <p className="mb-3 text-xs text-ink-secondary">
              Seeded by <code className="rounded bg-surface-sunken px-1 py-0.5">npm run db:seed</code>.
              Each role sees a different slice of the app.
            </p>
            <ul className="space-y-1">
              {DEMO_ACCOUNTS.map((account) => (
                <li key={account.email}>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail(account.email);
                      setPassword(account.password);
                      setError(null);
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-surface-sunken"
                  >
                    <span className="font-medium text-ink">{account.label}</span>
                    <span className="truncate text-ink-muted">{account.email}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
