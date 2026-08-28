import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, UserRole } from '@prisma/client';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/jwt-payload';
import { AccessService } from './access.service';
import {
  BrandingInput,
  brandingToJson,
  resolveBranding,
  sanitizeSlug,
} from './branding';

const SALT_ROUNDS = 10;

type InvitePayload = {
  typ: 'project_invite';
  email: string;
  organizationId: string;
  projectId: string;
};

@Injectable()
export class TenancyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly access: AccessService,
  ) {}

  async publicBranding(slug: string) {
    const normalized = sanitizeSlug(slug);
    if (!normalized) {
      throw new NotFoundException('Branding not found');
    }
    const org = await this.prisma.organization.findUnique({
      where: { slug: normalized },
    });
    if (!org) {
      throw new NotFoundException('Branding not found');
    }
    return resolveBranding(org);
  }

  async getOrganization(user: JwtPayload) {
    const org = await this.prisma.organization.findUnique({
      where: { id: user.organizationId },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      branding: resolveBranding(org),
      canWrite: this.access.isAgency(user.role),
    };
  }

  async updateBranding(user: JwtPayload, input: BrandingInput) {
    if (user.role !== 'owner') {
      throw new BadRequestException('Only the organization owner can edit branding');
    }
    const slug = input.slug === undefined ? undefined : sanitizeSlug(input.slug);
    if (input.slug && !slug) {
      throw new BadRequestException(
        'Slug must be 3–40 characters: lowercase letters, digits, hyphen',
      );
    }
    if (slug) {
      const taken = await this.prisma.organization.findFirst({
        where: { slug, NOT: { id: user.organizationId } },
      });
      if (taken) {
        throw new ConflictException('This slug is already taken');
      }
    }
    const org = await this.prisma.organization.update({
      where: { id: user.organizationId },
      data: {
        brandingJson: brandingToJson(input) as Prisma.InputJsonValue,
        ...(input.slug !== undefined ? { slug } : {}),
      },
    });
    return resolveBranding(org);
  }

  async listAccess(user: JwtPayload, projectId: string) {
    await this.access.assertProject(user, projectId, 'write');
    const rows = await this.prisma.projectAccess.findMany({
      where: { projectId },
      include: { user: { select: { id: true, email: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      userId: row.user.id,
      email: row.user.email,
      role: row.user.role,
      createdAt: row.createdAt,
    }));
  }

  async inviteClient(user: JwtPayload, projectId: string, emailRaw: string) {
    const project = await this.access.assertProject(user, projectId, 'write');
    const email = emailRaw.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing && existing.organizationId !== project.organizationId) {
      throw new ConflictException('Email already belongs to another organization');
    }
    if (existing && this.access.isAgency(existing.role)) {
      throw new ConflictException('Cannot invite agency staff as a client');
    }

    let client = existing;
    if (!client) {
      const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), SALT_ROUNDS);
      client = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          role: UserRole.client,
          organizationId: project.organizationId,
        },
      });
    }

    await this.prisma.projectAccess.upsert({
      where: {
        projectId_userId: { projectId: project.id, userId: client.id },
      },
      update: {},
      create: { projectId: project.id, userId: client.id },
    });

    const inviteToken = this.jwt.sign(
      {
        typ: 'project_invite',
        email,
        organizationId: project.organizationId,
        projectId: project.id,
      } satisfies InvitePayload,
      { expiresIn: '7d' },
    );

    return {
      email,
      userId: client.id,
      inviteToken,
      invitePath: `/invite?token=${encodeURIComponent(inviteToken)}`,
    };
  }

  async revokeAccess(user: JwtPayload, projectId: string, userId: string) {
    await this.access.assertProject(user, projectId, 'write');
    const grant = await this.prisma.projectAccess.findFirst({
      where: { projectId, userId },
    });
    if (!grant) {
      throw new NotFoundException('Access grant not found');
    }
    await this.prisma.projectAccess.delete({ where: { id: grant.id } });
    return { ok: true };
  }

  async acceptInvite(token: string, password: string) {
    if (!password || password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }
    let payload: InvitePayload;
    try {
      payload = this.jwt.verify<InvitePayload>(token);
    } catch {
      throw new BadRequestException('Invite token is invalid or expired');
    }
    if (payload.typ !== 'project_invite' || !payload.email || !payload.projectId) {
      throw new BadRequestException('Invite token is invalid or expired');
    }

    const project = await this.prisma.project.findFirst({
      where: {
        id: payload.projectId,
        organizationId: payload.organizationId,
      },
      include: { organization: true },
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const email = payload.email.toLowerCase();
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const client = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email } });
      if (existing && existing.organizationId !== payload.organizationId) {
        throw new ConflictException('Email already belongs to another organization');
      }
      if (existing && this.access.isAgency(existing.role)) {
        throw new ConflictException('Cannot accept invite for an agency user');
      }
      const user = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: { passwordHash, role: UserRole.client },
            include: { organization: true },
          })
        : await tx.user.create({
            data: {
              email,
              passwordHash,
              role: UserRole.client,
              organizationId: payload.organizationId,
            },
            include: { organization: true },
          });
      await tx.projectAccess.upsert({
        where: {
          projectId_userId: { projectId: payload.projectId, userId: user.id },
        },
        update: {},
        create: { projectId: payload.projectId, userId: user.id },
      });
      return user;
    });

    return {
      accessToken: this.jwt.sign({
        sub: client.id,
        organizationId: client.organizationId,
        email: client.email,
        role: client.role,
      } satisfies JwtPayload),
      user: {
        id: client.id,
        email: client.email,
        role: client.role,
        organizationId: client.organizationId,
        organizationName: client.organization.name,
        branding: resolveBranding(client.organization),
        canWrite: false,
        beginnerMode: client.beginnerMode ?? true,
      },
    };
  }
}
