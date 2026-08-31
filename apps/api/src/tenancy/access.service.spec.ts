import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AccessService } from './access.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/jwt-payload';

const owner: JwtPayload = {
  sub: 'user-owner',
  organizationId: 'org-a',
  email: 'owner@agency.test',
  role: 'owner',
};

const client: JwtPayload = {
  sub: 'user-client',
  organizationId: 'org-a',
  email: 'client@shop.test',
  role: 'client',
};

const member: JwtPayload = {
  sub: 'user-member',
  organizationId: 'org-a',
  email: 'spec@agency.test',
  role: 'member',
};

describe('AccessService', () => {
  const prisma = {
    project: { findFirst: jest.fn() },
    projectAccess: { findUnique: jest.fn() },
  };
  const access = new AccessService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists all organization projects for the owner', () => {
    expect(access.listWhere(owner)).toEqual({ organizationId: 'org-a' });
  });

  it('lists only granted projects for a contextologist', () => {
    expect(access.listWhere(member)).toEqual({
      organizationId: 'org-a',
      clientAccess: { some: { userId: 'user-member' } },
    });
  });

  it('lists only granted projects for a client in the same org', () => {
    expect(access.listWhere(client)).toEqual({
      organizationId: 'org-a',
      clientAccess: { some: { userId: 'user-client' } },
    });
  });

  it('allows an owner to read any project of the organization', async () => {
    prisma.project.findFirst.mockResolvedValue({ id: 'p1', organizationId: 'org-a' });
    await expect(access.assertProject(owner, 'p1', 'read')).resolves.toEqual({
      id: 'p1',
      organizationId: 'org-a',
    });
    expect(prisma.projectAccess.findUnique).not.toHaveBeenCalled();
  });

  it('hides a sibling project from a client without a grant', async () => {
    prisma.project.findFirst.mockResolvedValue({ id: 'p2', organizationId: 'org-a' });
    prisma.projectAccess.findUnique.mockResolvedValue(null);
    await expect(access.assertProject(client, 'p2', 'read')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('allows a client to read a granted project', async () => {
    prisma.project.findFirst.mockResolvedValue({ id: 'p1', organizationId: 'org-a' });
    prisma.projectAccess.findUnique.mockResolvedValue({
      projectId: 'p1',
      userId: 'user-client',
    });
    await expect(access.assertProject(client, 'p1', 'read')).resolves.toMatchObject({
      id: 'p1',
    });
  });

  it('forbids client writes even on a granted project', async () => {
    await expect(access.assertProject(client, 'p1', 'write')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.project.findFirst).not.toHaveBeenCalled();
  });

  it('allows a contextologist to write a granted project', async () => {
    prisma.project.findFirst.mockResolvedValue({ id: 'p1', organizationId: 'org-a' });
    prisma.projectAccess.findUnique.mockResolvedValue({
      projectId: 'p1',
      userId: 'user-member',
    });
    await expect(access.assertProject(member, 'p1', 'write')).resolves.toMatchObject({
      id: 'p1',
    });
  });

  it('hides a project from a contextologist without a grant', async () => {
    prisma.project.findFirst.mockResolvedValue({ id: 'p2', organizationId: 'org-a' });
    prisma.projectAccess.findUnique.mockResolvedValue(null);
    await expect(access.assertProject(member, 'p2', 'read')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('does not look up projects of another organization', async () => {
    prisma.project.findFirst.mockResolvedValue(null);
    await expect(
      access.assertProject({ ...client, organizationId: 'org-b' }, 'p1', 'read'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: { id: 'p1', organizationId: 'org-b' },
    });
  });
});
