import * as Sentry from '@sentry/nestjs';

// Dormant by default: Sentry only initializes when SENTRY_DSN is set in the
// environment. With no deploy target today the var is unset, so this is a no-op
// and adds zero runtime behaviour. The moment matside is deployed, set
// SENTRY_DSN (and optionally SENTRY_ENVIRONMENT) and error reporting turns on
// with no code change. Imported first in main.ts so instrumentation is in place
// before Nest boots.
const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    // Conservative default; tune once we see real traffic volume.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  });
}

/** True when Sentry is active this process — lets call sites skip work cheaply. */
export const sentryEnabled = Boolean(dsn);
