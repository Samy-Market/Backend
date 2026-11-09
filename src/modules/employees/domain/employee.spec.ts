import { AssignmentView, employeeDeletionBlocker, scheduleSummary } from './employee';

const a = (id: string, startDate: string, endDate: string | null = null): AssignmentView => ({
  id,
  scheduleId: id,
  scheduleName: id,
  startDate,
  endDate,
});

describe('scheduleSummary', () => {
  it('separa el horario vigente del siguiente', () => {
    const s = scheduleSummary([a('A', '2026-08-01', '2026-11-30'), a('B', '2026-12-01')], '2026-11-07');
    expect(s.currentSchedule?.id).toBe('A');
    expect(s.nextSchedule?.id).toBe('B');
  });

  it('sin asignaciones no hay horario', () => {
    expect(scheduleSummary([], '2026-11-07')).toEqual({ currentSchedule: null, nextSchedule: null });
  });

  it('una asignación que empieza mañana es la siguiente, no la vigente', () => {
    const s = scheduleSummary([a('A', '2026-11-08')], '2026-11-07');
    expect(s.currentSchedule).toBeNull();
    expect(s.nextSchedule?.id).toBe('A');
  });
});

describe('Eliminar empleado', () => {
  const clean = { activeAssignments: 0, pastAssignments: 0, attendances: 0, justifications: 0, transfers: 0, auditLogs: 0 };

  it('sin historial se puede eliminar', () => {
    expect(employeeDeletionBlocker(clean)).toBeNull();
  });

  it('con horario asignado hay que quitarlo primero', () => {
    expect(employeeDeletionBlocker({ ...clean, activeAssignments: 1 })).toContain('Quítalo primero');
  });

  it('con marcaciones, justificaciones o historial se desactiva', () => {
    expect(employeeDeletionBlocker({ ...clean, attendances: 5 })).toContain('Desactívalo');
    expect(employeeDeletionBlocker({ ...clean, justifications: 1 })).toContain('Desactívalo');
    expect(employeeDeletionBlocker({ ...clean, pastAssignments: 1 })).toContain('Desactívalo');
    expect(employeeDeletionBlocker({ ...clean, transfers: 1 })).toContain('Desactívalo');
  });

  it('si tiene marcaciones, avisa eso antes que el horario (quitarlo no bastaría)', () => {
    expect(employeeDeletionBlocker({ ...clean, attendances: 3, activeAssignments: 1 })).toContain('marcaciones');
  });
});
