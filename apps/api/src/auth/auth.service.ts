import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './jwt-payload';
import { resolveBranding } from '../tenancy/branding';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    if (dto.acceptTerms !== true) {
      throw new BadRequestException('Terms of service must be accepted');
    }
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: { name: dto.organizationName },
      });
      return tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash,
          role: 'owner',
          organizationId: organization.id,
          termsAcceptedAt: new Date(),
        },
        include: { organization: true },
      });
    });

    return this.issueToken(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: { organization: true },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const matches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueToken(user);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      organizationName: user.organization.name,
      branding: resolveBranding(user.organization),
      canWrite: user.role === 'owner' || user.role === 'member',
      beginnerMode: user.beginnerMode,
    };
  }

  async updateMe(userId: string, beginnerMode: boolean) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { beginnerMode },
      include: { organization: true },
    });
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      organizationName: user.organization.name,
      branding: resolveBranding(user.organization),
      canWrite: user.role === 'owner' || user.role === 'member',
      beginnerMode: user.beginnerMode,
    };
  }

  private issueToken(user: {
    id: string;
    email: string;
    role: string;
    organizationId: string;
    beginnerMode?: boolean;
    organization: { name: string; slug?: string | null; brandingJson?: unknown };
  }) {
    const payload: JwtPayload = {
      sub: user.id,
      organizationId: user.organizationId,
      email: user.email,
      role: user.role,
    };
    return {
      accessToken: this.jwt.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        organizationName: user.organization.name,
        branding: resolveBranding(user.organization),
        canWrite: user.role === 'owner' || user.role === 'member',
        beginnerMode: user.beginnerMode ?? true,
      },
    };
  }
}
