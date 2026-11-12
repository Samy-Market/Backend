import { AuthUser } from '../../../shared/domain/auth-user';
import { Role } from '../../../shared/domain/roles';

export interface Account {
  id: string;
  email: string;
  role: Role;
  active: boolean;
  passwordHash: string;
  passwordChangedAt: Date | null;
  employee: { id: string; active: boolean } | null;
}

export function canSignIn(a: Pick<Account, 'active' | 'employee'>): boolean {
  return a.active && (!a.employee || a.employee.active);
}

export function toAuthUser(a: Account): AuthUser {
  return { sub: a.id, email: a.email, role: a.role, employeeId: a.employee?.id ?? null };
}
