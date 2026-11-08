/** Un empleado: la persona que marca. Su cuenta de acceso (correo, contraseña) es un usuario con rol EMPLOYEE. */
export interface Employee {
  id: string;
  fullName: string;
  documentId: string;
  position: string;
  active: boolean;
  siteId: string;
  site: { id: string; name: string };
  user: { id: string; email: string; role: string; active: boolean };
}

/** Una asignación de horario vista desde el empleado. */
export interface AssignmentView {
  id: string;
  scheduleId: string;
  scheduleName: string;
  startDate: string;
  endDate: string | null;
}

/**
 * De las asignaciones vigentes o futuras (ordenadas por inicio), cuál rige hoy y cuál viene después.
 */
export function scheduleSummary(assignments: AssignmentView[], today: string) {
  return {
    currentSchedule: assignments.find((a) => a.startDate <= today) ?? null,
    nextSchedule: assignments.find((a) => a.startDate > today) ?? null,
  };
}
