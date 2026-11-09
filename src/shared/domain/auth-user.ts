import { Role } from './roles';

export interface AuthUser {
  sub: string;
  email: string;
  role: Role;
  employeeId: string | null;
}
