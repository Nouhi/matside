import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { IS_PUBLIC_KEY } from './public.decorator';
import { ROLES_KEY } from './roles.decorator';

// Builds an ExecutionContext whose reflector returns the given public/roles
// metadata and whose request carries the given user.
function ctx(user?: { role?: UserRole }): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardWith(meta: { isPublic?: boolean; roles?: UserRole[] }) {
  const reflector = {
    getAllAndOverride: (key: string) =>
      key === IS_PUBLIC_KEY ? meta.isPublic : key === ROLES_KEY ? meta.roles : undefined,
  } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('allows @Public routes regardless of user', () => {
    expect(guardWith({ isPublic: true }).canActivate(ctx())).toBe(true);
  });

  it('default-denies a non-organizer when @Roles is absent (fail closed)', () => {
    // No @Roles → requires ORGANIZER/ADMIN. A COACH must NOT slip through.
    expect(() => guardWith({}).canActivate(ctx({ role: UserRole.COACH }))).toThrow(
      ForbiddenException,
    );
  });

  it('admits ORGANIZER on the default (no @Roles) path', () => {
    expect(guardWith({}).canActivate(ctx({ role: UserRole.ORGANIZER }))).toBe(true);
  });

  it('admits a role present in @Roles', () => {
    expect(
      guardWith({ roles: [UserRole.COACH] }).canActivate(ctx({ role: UserRole.COACH })),
    ).toBe(true);
  });

  it('denies a role absent from @Roles', () => {
    expect(() =>
      guardWith({ roles: [UserRole.COACH] }).canActivate(ctx({ role: UserRole.ORGANIZER })),
    ).toThrow(ForbiddenException);
  });

  it('denies when the request has no user/role at all', () => {
    expect(() => guardWith({}).canActivate(ctx(undefined))).toThrow(ForbiddenException);
    expect(() => guardWith({}).canActivate(ctx({}))).toThrow(ForbiddenException);
  });
});
