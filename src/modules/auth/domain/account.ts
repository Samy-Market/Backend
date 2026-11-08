import { AuthUser } from '../../../shared/domain/auth-user';
import { Role } from '../../../shared/domain/roles';

/** Una cuenta de acceso: la "llave" de cada persona (correo + contraseña + rol). */
export interface Account {
  id: string;
  email: string;
  role: Role;
  active: boolean;
  passwordHash: string;
  /** Ficha de empleado, si la cuenta es de un empleado. */
  employee: { id: string; active: boolean } | null;
}

/** Puede entrar si la cuenta está activa y, si es empleado, su ficha también. */
export function canSignIn(a: Pick<Account, 'active' | 'employee'>): boolean {
  return a.active && (!a.employee || a.employee.active);
}

export function toAuthUser(a: Account): AuthUser {
  return { sub: a.id, email: a.email, role: a.role, employeeId: a.employee?.id ?? null };
}
