import { computeLateness } from '../../attendance/domain/attendance-rules';
import { dayKeyInZone, findCovering, rangesOverlap, weekdayOf } from '../../../shared/domain/calendar';
import { AssignmentRule, planForDay, planForRange, ScheduleRule, trimmedEndFor } from './schedule-plan';

const ZONE = 'America/Guayaquil';
const manana = { id: 's1', name: 'Mañana', startTime: '08:00', endTime: '18:00', toleranceMinutes: 10 };
const tarde = { id: 's2', name: 'Tarde', startTime: '11:00', endTime: '21:00', toleranceMinutes: 10 };

/** Ejemplo del centro comercial: L mañana, M tarde, X mañana, J tarde, V mañana, S tarde, D descanso. */
const rotacionA: ScheduleRule = {
  id: 'A',
  name: 'Rotación A',
  days: [
    { weekday: 1, shift: manana },
    { weekday: 2, shift: tarde },
    { weekday: 3, shift: manana },
    { weekday: 4, shift: tarde },
    { weekday: 5, shift: manana },
    { weekday: 6, shift: tarde },
    { weekday: 7, shift: null },
  ],
};
/** La rotación siguiente invierte mañana/tarde y descansa el lunes. */
const rotacionB: ScheduleRule = {
  id: 'B',
  name: 'Rotación B',
  days: [
    { weekday: 1, shift: null },
    { weekday: 2, shift: manana },
    { weekday: 3, shift: tarde },
    { weekday: 4, shift: manana },
    { weekday: 5, shift: tarde },
    { weekday: 6, shift: manana },
    { weekday: 7, shift: tarde },
  ],
};

// Noviembre 2026: lunes 2, martes 3, miércoles 4 … domingo 8.
const trimestre1: AssignmentRule = { id: 'a1', startDate: '2026-11-01', endDate: '2027-01-31', schedule: rotacionA };
const trimestre2: AssignmentRule = { id: 'a2', startDate: '2027-02-01', endDate: '2027-04-30', schedule: rotacionB };

describe('Horarios rotativos: qué turno toca cada día', () => {
  it('calcula el día de la semana ISO (1 = lunes, 7 = domingo)', () => {
    expect(weekdayOf('2026-11-02')).toBe(1);
    expect(weekdayOf('2026-11-08')).toBe(7);
  });

  it('aplica el patrón semanal: lunes mañana, martes tarde, miércoles mañana', () => {
    const p = (d: string) => planForDay([trimestre1], d);
    expect(p('2026-11-02')).toMatchObject({ kind: 'WORK', shift: { name: 'Mañana' } });
    expect(p('2026-11-03')).toMatchObject({ kind: 'WORK', shift: { name: 'Tarde' } });
    expect(p('2026-11-04')).toMatchObject({ kind: 'WORK', shift: { name: 'Mañana' } });
  });

  it('el patrón se repite cada semana durante toda la rotación', () => {
    expect(planForDay([trimestre1], '2027-01-26')).toMatchObject({ kind: 'WORK', shift: { name: 'Tarde' } }); // martes
  });

  it('el domingo es descanso en la Rotación A', () => {
    expect(planForDay([trimestre1], '2026-11-08')).toMatchObject({ kind: 'REST', scheduleName: 'Rotación A' });
  });

  it('al cambiar de trimestre se aplica la nueva rotación', () => {
    const asignaciones = [trimestre1, trimestre2];
    expect(planForDay(asignaciones, '2027-01-31')).toMatchObject({ kind: 'REST', scheduleName: 'Rotación A' }); // domingo
    expect(planForDay(asignaciones, '2027-02-01')).toMatchObject({ kind: 'REST', scheduleName: 'Rotación B' }); // lunes
    expect(planForDay(asignaciones, '2027-02-02')).toMatchObject({ kind: 'WORK', shift: { name: 'Mañana' } }); // martes
  });

  it('fuera de cualquier asignación el empleado no tiene horario', () => {
    expect(planForDay([trimestre1], '2026-10-31')).toEqual({ kind: 'UNASSIGNED', date: '2026-10-31' });
    expect(planForDay([trimestre1, trimestre2], '2027-05-01')).toMatchObject({ kind: 'UNASSIGNED' });
  });

  it('una asignación sin fecha de fin sigue vigente indefinidamente', () => {
    const abierta: AssignmentRule = { ...trimestre1, endDate: null };
    expect(planForDay([abierta], '2030-06-03')).toMatchObject({ kind: 'WORK' }); // lunes
  });

  it('genera el plan de una semana completa', () => {
    const semana = planForRange([trimestre1], '2026-11-02', '2026-11-08');
    expect(semana.map((d) => (d.kind === 'WORK' ? d.shift.name : d.kind))).toEqual([
      'Mañana',
      'Tarde',
      'Mañana',
      'Tarde',
      'Mañana',
      'Tarde',
      'REST',
    ]);
  });
});

describe('Horarios rotativos: atraso según el turno del día', () => {
  const lateFor = (iso: string) => {
    const at = new Date(iso);
    const plan = planForDay([trimestre1], dayKeyInZone(at, ZONE));
    return computeLateness(at, plan.kind === 'WORK' ? plan.shift : null, ZONE);
  };

  it('a las 10:30 del lunes (turno mañana 08:00) hay atraso', () => {
    expect(lateFor('2026-11-02T15:30:00Z')).toEqual({ isLate: true, lateMinutes: 150 }); // 10:30 local
  });

  it('a las 10:30 del martes (turno tarde 11:00) NO hay atraso', () => {
    expect(lateFor('2026-11-03T15:30:00Z')).toEqual({ isLate: false, lateMinutes: 0 });
  });

  it('a las 11:20 del martes hay 20 min de atraso', () => {
    expect(lateFor('2026-11-03T16:20:00Z')).toEqual({ isLate: true, lateMinutes: 20 });
  });

  it('marcar en día de descanso no cuenta como atraso', () => {
    expect(lateFor('2026-11-08T17:00:00Z').isLate).toBe(false); // domingo 12:00 local
  });
});

describe('Horarios rotativos: periodos', () => {
  it('detecta superposición de periodos (fin nulo = sin fin)', () => {
    expect(rangesOverlap({ startDate: '2026-11-01', endDate: '2027-01-31' }, { startDate: '2027-01-31', endDate: null })).toBe(true);
    expect(rangesOverlap({ startDate: '2026-11-01', endDate: '2027-01-31' }, { startDate: '2027-02-01', endDate: null })).toBe(false);
    expect(rangesOverlap({ startDate: '2026-11-01', endDate: null }, { startDate: '2030-01-01', endDate: '2030-02-01' })).toBe(true);
  });

  it('al rotar, la asignación anterior termina el día previo a la nueva', () => {
    expect(trimmedEndFor({ startDate: '2026-11-01', endDate: null }, '2027-02-01')).toBe('2027-01-31');
    expect(trimmedEndFor({ startDate: '2026-11-01', endDate: '2027-03-31' }, '2027-02-01')).toBe('2027-01-31');
  });

  it('no recorta asignaciones que ya terminaron ni las que empiezan después', () => {
    expect(trimmedEndFor({ startDate: '2026-11-01', endDate: '2027-01-15' }, '2027-02-01')).toBeNull();
    expect(trimmedEndFor({ startDate: '2027-03-01', endDate: null }, '2027-02-01')).toBeNull();
  });

  it('si dos asignaciones cubren el mismo día, gana la más reciente', () => {
    const vieja = { startDate: '2026-01-01', endDate: null, id: 'v' };
    const nueva = { startDate: '2026-11-01', endDate: null, id: 'n' };
    expect(findCovering([vieja, nueva], '2026-12-01')?.id).toBe('n');
  });
});
