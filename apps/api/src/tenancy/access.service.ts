import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload } from "../auth/jwt-payload";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** Agency staff (owner/admin or contextologist), not a read-only client. */
  isAgency(role: string): boolean {
    return role === "owner" || role === "member";
  }

  /** Owner/admin: unfiltered organization portfolio. */
  isOrgWide(role: string): boolean {
    return role === "owner";
  }

  canWrite(role: string): boolean {
    return this.isAgency(role);
  }

  isProjectId(value: string | undefined): value is string {
    return Boolean(value && UUID_RE.test(value));
  }

  assertAgency(user: JwtPayload): void {
    if (!this.isAgency(user.role)) {
      throw new ForbiddenException("Client access is read-only");
    }
  }

  assertOrgWide(user: JwtPayload): void {
    if (!this.isOrgWide(user.role)) {
      throw new ForbiddenException(
        "Only the organization owner can manage the agency",
      );
    }
  }

  listWhere(user: JwtPayload): Prisma.ProjectWhereInput {
    if (this.isOrgWide(user.role)) {
      return { organizationId: user.organizationId };
    }
    return {
      organizationId: user.organizationId,
      clientAccess: { some: { userId: user.sub } },
    };
  }

  async assertProject(
    user: JwtPayload,
    projectId: string,
    mode: "read" | "write",
  ) {
    if (mode === "write") {
      this.assertAgency(user);
    }
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId: user.organizationId },
    });
    if (!project) {
      throw new NotFoundException("Project not found");
    }
    if (this.isOrgWide(user.role)) {
      return project;
    }
    const grant = await this.prisma.projectAccess.findUnique({
      where: {
        projectId_userId: { projectId, userId: user.sub },
      },
    });
    if (!grant) {
      throw new NotFoundException("Project not found");
    }
    return project;
  }
}
