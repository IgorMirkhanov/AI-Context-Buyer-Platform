import { ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    organization: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('jwt-token') },
        },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  it('registers a user inside a new organization', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const createdUser = {
      id: 'user-1',
      email: 'owner@agency.test',
      role: 'owner',
      organizationId: 'org-1',
      organization: { name: 'Agency' },
    };
    prisma.$transaction.mockImplementation(
      async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma),
    );
    prisma.organization.create.mockResolvedValue({
      id: 'org-1',
      name: 'Agency',
    });
    prisma.user.create.mockResolvedValue(createdUser);

    const result = await service.register({
      email: 'Owner@agency.test',
      password: 'password1',
      organizationName: 'Agency',
      acceptTerms: true,
    });

    expect(result.accessToken).toBe('jwt-token');
    expect(result.user.organizationId).toBe('org-1');
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'owner@agency.test',
          organizationId: 'org-1',
          termsAcceptedAt: expect.any(Date),
        }),
      }),
    );
    const storedHash = prisma.user.create.mock.calls[0][0].data
      .passwordHash as string;
    expect(await bcrypt.compare('password1', storedHash)).toBe(true);
  });

  it('rejects duplicate email', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(
      service.register({
        email: 'owner@agency.test',
        password: 'password1',
        organizationName: 'Agency',
        acceptTerms: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects registration without terms acceptance', async () => {
    await expect(
      service.register({
        email: 'owner@agency.test',
        password: 'password1',
        organizationName: 'Agency',
        acceptTerms: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects invalid password on login', async () => {
    const passwordHash = await bcrypt.hash('password1', 4);
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'owner@agency.test',
      passwordHash,
      role: 'owner',
      organizationId: 'org-1',
      organization: { name: 'Agency' },
    });
    await expect(
      service.login({ email: 'owner@agency.test', password: 'wrongpass' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns beginnerMode on /me and persists the toggle', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'owner@agency.test',
      role: 'owner',
      organizationId: 'org-1',
      beginnerMode: true,
      organization: { name: 'Agency' },
    });
    const me = await service.me('user-1');
    expect(me.beginnerMode).toBe(true);

    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'owner@agency.test',
      role: 'owner',
      organizationId: 'org-1',
      beginnerMode: false,
      organization: { name: 'Agency' },
    });
    const updated = await service.updateMe('user-1', false);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: { beginnerMode: false },
      }),
    );
    expect(updated.beginnerMode).toBe(false);
  });
});
