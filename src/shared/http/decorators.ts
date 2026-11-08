import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AuthUser } from '../domain/auth-user';
import { Role } from '../domain/roles';

export const IS_PUBLIC_KEY = 'isPublic';
/** La ruta no requiere sesión. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'roles';
/** Roles que pueden usar la ruta (si no se indica, cualquier usuario con sesión). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Usuario de la sesión actual. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
