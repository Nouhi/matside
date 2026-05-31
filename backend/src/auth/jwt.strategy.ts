import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRole } from '@prisma/client';

interface JwtPayload {
  sub: string;
  email: string;
  // Optional: tokens issued before the role-aware auth layer lack this claim.
  role?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: JwtPayload) {
    // Enum-validate the role claim. A tampered/unknown value is NOT trusted —
    // it falls back to ORGANIZER (the historical implicit role), never silently
    // granting a higher role. Pre-existing roleless tokens also default here so
    // logged-in organizers keep working without a forced re-login.
    const role = isUserRole(payload.role) ? payload.role : UserRole.ORGANIZER;
    return { sub: payload.sub, email: payload.email, role };
  }
}

function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === 'string' &&
    Object.values(UserRole).includes(value as UserRole)
  );
}
