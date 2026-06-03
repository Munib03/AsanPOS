import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/role.decorator';
import { Role } from '../utils/role.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(), 
      context.getClass(),   
    ]);

    if (!requiredRoles || requiredRoles.length === 0) 
        return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user?.role) 
      throw new ForbiddenException('No role assigned');

    const hasRole = requiredRoles.includes(user.role as Role);
    if (!hasRole) 
      throw new ForbiddenException('Insufficient permissions');

    return true;
  }
}