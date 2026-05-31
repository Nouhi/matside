import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or whole controller) as unauthenticated. The global
 * JwtAuthGuard and RolesGuard both short-circuit to `allow` when this is set.
 * Use for the spectator surface, health checks, auth endpoints, and public
 * self-registration.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
