import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to the listed roles. Absent on a non-@Public route, the
 * RolesGuard falls back to ORGANIZER/ADMIN (default-deny against COACH) — so a
 * forgotten annotation fails closed, never open.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
