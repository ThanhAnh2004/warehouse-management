import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // No specific roles required
    }

    const { user } = context.switchToHttp().getRequest();
    
    // AuthGuard ensures user is attached. If no user, or no role, forbid.
    if (!user || !user.role) {
      throw new ForbiddenException('You do not have permission (No role assigned)');
    }

    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
       throw new ForbiddenException(`You do not have permission. Requires one of: ${requiredRoles.join(', ')}`);
    }

    return true;
  }
}
