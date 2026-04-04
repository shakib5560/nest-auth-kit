import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {ROLES_KEY} from "../decorator/roles.decorator";
import {Role} from "../enum/auth.enum";

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles =
            this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
                context.getHandler(),
                context.getClass(),
            ]);

        // If no roles defined → allow access
        if (!requiredRoles || requiredRoles.length === 0) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user;

        // Ensure user exists
        if (!user) {
            throw new ForbiddenException('User not found in request');
        }

        // Ensure roles exist on user
        if (!Array.isArray(user.roles)) {
            throw new ForbiddenException('User roles not defined');
        }

        const hasRole = requiredRoles.some((role) =>
            user.roles.includes(role),
        );

        if (!hasRole) {
            throw new ForbiddenException(
                `Access denied. Required roles: ${requiredRoles.join(', ')}`,
            );
        }

        return true;
    }
}