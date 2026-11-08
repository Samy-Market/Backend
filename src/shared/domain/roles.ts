/** Roles del sistema (mismos valores que guarda la base de datos). */
export const Role = { EMPLOYEE: 'EMPLOYEE', SUPERVISOR: 'SUPERVISOR', ADMIN: 'ADMIN' } as const;
export type Role = (typeof Role)[keyof typeof Role];

export const isStaff = (role: Role) => role === Role.ADMIN || role === Role.SUPERVISOR;
