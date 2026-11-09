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

export interface AssignmentView {
  id: string;
  scheduleId: string;
  scheduleName: string;
  startDate: string;
  endDate: string | null;
}

export function scheduleSummary(assignments: AssignmentView[], today: string) {
  return {
    currentSchedule: assignments.find((a) => a.startDate <= today) ?? null,
    nextSchedule: assignments.find((a) => a.startDate > today) ?? null,
  };
}

export interface EmployeeUsage {
  activeAssignments: number;
  pastAssignments: number;
  attendances: number;
  justifications: number;
  transfers: number;
  auditLogs: number;
}

export function employeeDeletionBlocker(u: EmployeeUsage): string | null {
  if (u.attendances || u.justifications) {
    return 'Ya tiene marcaciones registradas y su historial de asistencia debe conservarse. Desactívalo en su lugar.';
  }
  if (u.activeAssignments) {
    return 'Tiene un horario asignado. Quítalo primero desde Horarios › Ver asignados (o desde su historial de horarios).';
  }
  if (u.pastAssignments || u.transfers || u.auditLogs) {
    return 'Tiene horarios o traslados en su historial. Desactívalo en su lugar.';
  }
  return null;
}
