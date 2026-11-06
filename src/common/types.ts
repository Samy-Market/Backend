import { Role } from '@prisma/client';

/** Payload firmado en el JWT y adjuntado a req.user / socket.data.user. */
export interface AuthUser {
  sub: string; // userId
  email: string;
  role: Role;
  employeeId: string | null;
}
