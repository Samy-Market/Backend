import { BusinessRuleError } from '../../../shared/domain/errors';
import { Role } from '../../../shared/domain/roles';

/** Usuarios del personal (administradores y supervisores). Los empleados tienen su propia sección. */
export const STAFF_ROLES = [Role.ADMIN, Role.SUPERVISOR] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export interface StaffUser {
  id: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StaffChanges {
  email?: string;
  role?: StaffRole;
  active?: boolean;
}

/** Nadie se desactiva a sí mismo ni se cambia su propio rol (para no quedarse fuera). */
export function assertSelfChangeAllowed(before: StaffUser, changes: StaffChanges, isSelf: boolean) {
  if (!isSelf) return;
  if (changes.active === false) throw new BusinessRuleError('No puedes desactivar tu propio usuario.');
  if (changes.role && changes.role !== before.role) throw new BusinessRuleError('No puedes cambiar tu propio rol.');
}

/** ¿El cambio deja a este usuario sin ser administrador activo? */
export function losesAdmin(before: StaffUser, changes: StaffChanges): boolean {
  return before.role === Role.ADMIN && before.active && (changes.active === false || (!!changes.role && changes.role !== Role.ADMIN));
}

/** Tras desactivarlo o cambiarle el rol, debe reconectarse con sus nuevos permisos. */
export function mustReconnect(before: StaffUser, changes: StaffChanges): boolean {
  return changes.active === false || (!!changes.role && changes.role !== before.role);
}
