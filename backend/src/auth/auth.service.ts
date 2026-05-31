import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async register(
    email: string,
    password: string,
    name: string,
    role: UserRole = UserRole.ORGANIZER,
  ) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    // ADMIN is never self-assignable at signup — the controller DTO only admits
    // ORGANIZER | COACH, but guard here too in case of a future caller.
    const safeRole = role === UserRole.ADMIN ? UserRole.ORGANIZER : role;

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: { email, passwordHash, name, role: safeRole },
    });

    return { access_token: this.sign(user.id, user.email, user.role) };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return { access_token: this.sign(user.id, user.email, user.role) };
  }

  private sign(sub: string, email: string, role: UserRole) {
    return this.jwt.sign({ sub, email, role });
  }
}
