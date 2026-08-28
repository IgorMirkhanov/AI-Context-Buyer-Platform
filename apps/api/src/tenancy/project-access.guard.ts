import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtPayload } from "../auth/jwt-payload";
import { AccessService } from "./access.service";

@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(private readonly access: AccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      user?: JwtPayload;
      method?: string;
      params?: { id?: string };
      path?: string;
      originalUrl?: string;
    }>();
    const user = req.user;
    const projectId = req.params?.id;
    if (!user || !this.access.isProjectId(projectId)) {
      return true;
    }
    const path = (req.path ?? req.originalUrl ?? "").split("?")[0];
    const favoriteWrite = path.endsWith("/favorite");
    const write =
      req.method !== "GET" && req.method !== "HEAD" && !favoriteWrite;
    await this.access.assertProject(user, projectId, write ? "write" : "read");
    return true;
  }
}
