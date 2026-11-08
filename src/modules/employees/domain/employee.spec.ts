import { AssignmentView, scheduleSummary } from './employee';

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
