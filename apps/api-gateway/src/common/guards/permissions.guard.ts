import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY, ANY_PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const anyPermissions = this.reflector.getAllAndOverride<string[]>(ANY_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (
      (!requiredPermissions || requiredPermissions.length === 0) &&
      (!anyPermissions || anyPermissions.length === 0)
    ) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException('Access denied. Unauthenticated user.');
    }

    if (user.isSystemAdmin || /^(admin|quản trị viên)$/i.test((user.role || '').trim())) {
      return true;
    }

    const userPerms = Array.isArray(user.permissions) ? user.permissions : [];

    if (requiredPermissions && requiredPermissions.length > 0) {
      const hasAll = requiredPermissions.every((perm) => userPerms.includes(perm));
      if (!hasAll) {
        throw new ForbiddenException(
          `Access denied. Missing required permissions: ${requiredPermissions.join(', ')}`,
        );
      }
    }

    if (anyPermissions && anyPermissions.length > 0) {
      const hasAny = anyPermissions.some((perm) => userPerms.includes(perm));
      if (!hasAny) {
        throw new ForbiddenException(
          `Access denied. Missing one of required permissions: ${anyPermissions.join(', ')}`,
        );
      }
    }

    return true;
  }
}
