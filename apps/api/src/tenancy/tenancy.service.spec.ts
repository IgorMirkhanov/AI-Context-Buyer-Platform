import { ConflictException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { AccessService } from './access.service';
import { TenancyService } from './tenancy.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/jwt-payload';

const owner: JwtPayload = {
  sub: 'user-owner',
  organizationId: 'org-a',
  email: 'owner@agency.test',
  role: 'owner',
};

describe('TenancyService invites', () => {
  const prisma = {
    user: { findUnique: jest.fn(), create: jest.fn() },
    projectAccess: { upsert: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
    organization: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    project: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const jwt = {
    sign: jest.fn().mockReturnValue('invite-jwt'),
    verify: jest.fn(),
  };
  let service: TenancyService;
  let access: AccessService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.project.findFirst.mockResolvedValue({
      id: 'p1',
      organizationId: 'org-a',
    });
    access = new AccessService(prisma as unknown as PrismaService);
    service = new TenancyService(
      prisma as unknown as PrismaService,
      jwt as unknown as JwtService,
      access,
    );
  });

  it('invites a new client bound to the project and organization', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'user-client',
      email: 'client@shop.test',
      role: UserRole.client,
      organizationId: 'org-a',
    });
    prisma.projectAccess.upsert.mockResolvedValue({});

    const result = await service.inviteClient(owner, 'p1', 'Client@shop.test');
    expect(result.email).toBe('client@shop.test');
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'client@shop.test',
          role: UserRole.client,
          organizationId: 'org-a',
        }),
      }),
    );
    expect(prisma.projectAccess.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { projectId: 'p1', userId: 'user-client' },
      }),
    );
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        typ: 'project_invite',
        email: 'client@shop.test',
        projectId: 'p1',
        organizationId: 'org-a',
      }),
      expect.any(Object),
    );
  });

  it('refuses to attach an email from another organization', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'other',
      organizationId: 'org-b',
      role: UserRole.client,
    });
    await expect(
      service.inviteClient(owner, 'p1', 'other@x.test'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.projectAccess.upsert).not.toHaveBeenCalled();
  });

  it('does not let a client invite anyone', async () => {
    await expect(
      service.inviteClient(
        { ...owner, role: 'client', sub: 'user-client' },
        'p1',
        'x@y.test',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('invites a contextologist when the owner assigns a project', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'user-member',
      email: 'spec@agency.test',
      role: UserRole.member,
      organizationId: 'org-a',
    });
    prisma.projectAccess.upsert.mockResolvedValue({});

    const result = await service.inviteClient(
      owner,
      'p1',
      'Spec@agency.test',
      'member',
    );
    expect(result.email).toBe('spec@agency.test');
    expect(result.role).toBe(UserRole.member);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'spec@agency.test',
          role: UserRole.member,
        }),
      }),
    );
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.member }),
      expect.any(Object),
    );
  });

  it('does not let a contextologist invite another contextologist', async () => {
    prisma.projectAccess.findUnique.mockResolvedValue({
      projectId: 'p1',
      userId: 'user-member',
    });
    await expect(
      service.inviteClient(
        { ...owner, role: 'member', sub: 'user-member' },
        'p1',
        'other@agency.test',
        'member',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.projectAccess.upsert).not.toHaveBeenCalled();
  });
});
