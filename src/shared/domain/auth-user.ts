import { Role } from './roles';

/** Identidad de quien hace la petición (viene del token y se adjunta a cada request/socket). */
export interface AuthUser {
  sub: string; // userId
  email: string;
  role: Role;
  employeeId: string | null;
}
