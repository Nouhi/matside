import { Body, Controller, Post } from '@nestjs/common';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

// Self-service signup may only create ORGANIZER or COACH. ADMIN is never
// self-assignable; the service double-guards this.
const SIGNUP_ROLES = [UserRole.ORGANIZER, UserRole.COACH] as const;

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsIn(SIGNUP_ROLES)
  role?: (typeof SIGNUP_ROLES)[number];
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.email, dto.password, dto.name, dto.role);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }
}
