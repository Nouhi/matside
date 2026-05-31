import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ROLES_KEY } from './roles.decorator';

// When a non-public route has no @Roles, it requires the historical
// "authenticated == organizer" roles. This is the fail-closed default: a new
// route someone forgets to annotate admits only organizers, never the newer
// COACH role. Coach routes MUST opt in explicitly with @Roles(UserRole.COACH).
const DEFAULT_REQUIRED: UserRole[] = [UserRole.ORGANIZER, UserRole.ADMIN];

/**
 * Global authorization guard. Runs after JwtAuthGuard. @Public routes pass
 * through; everything else must carry a role in the route's @Roles set (or the
 * organizer/admin default).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const required =
      this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEFAULT_REQUIRED;

    const { user } = context
      .switchToHttp()
      .getRequest<{ user?: { role?: UserRole } }>();

    if (!user?.role || !required.includes(user.role)) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
