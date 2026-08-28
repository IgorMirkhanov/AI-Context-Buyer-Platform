import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtPayload } from "../auth/jwt-payload";
import { ROLES_KEY } from "./roles.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) {
      return true;
    }
    const user = context.switchToHttp().getRequest<{ user?: JwtPayload }>()
      .user;
    if (!user || !roles.includes(user.role)) {
      throw new ForbiddenException("Insufficient role");
    }
    return true;
  }
}
