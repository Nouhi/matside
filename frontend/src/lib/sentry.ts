import * as Sentry from '@sentry/react';

// Dormant by default: only initializes when VITE_SENTRY_DSN is set at build
// time. With no deploy target today the var is unset, so this is a no-op. Set
// VITE_SENTRY_DSN (and optionally VITE_SENTRY_ENVIRONMENT) when deploying to
// turn on error reporting with no code change.
const dsn = import.meta.env.VITE_SENTRY_DSN;

export const sentryEnabled = Boolean(dsn);

export function initSentry() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? import.meta.env.MODE,
  });
}

/** Report a caught error. No-op when Sentry is dormant. */
export function reportError(error: unknown, info?: Record<string, unknown>) {
  if (!dsn) return;
  Sentry.captureException(error, info ? { extra: info } : undefined);
}
