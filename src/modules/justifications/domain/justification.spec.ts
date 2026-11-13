import { BusinessRuleError, ForbiddenError } from '../../../shared/domain/errors';
import {
  absenceProblem,
  assertCanReview,
  creditProblem,
  creditWindow,
  exitProblem,
  missingExitWindow,
  workedDayProblem,
} from './justification';

describe('assertCanReview', () => {
  it('permite revisar una pendiente de otra persona', () => {
    expect(() => assertCanReview({ status: 'PENDING', employeeId: 'e1' }, null)).not.toThrow();
    expect(() => assertCanReview({ status: 'PENDING', employeeId: 'e1' }, 'e2')).not.toThrow();
  });

  it('no permite revisar dos veces', () => {
    expect(() => assertCanReview({ status: 'APPROVED', employeeId: 'e1' }, null)).toThrow(BusinessRuleError);
  });

  it('nadie revisa su propia justificación', () => {
    expect(() => assertCanReview({ status: 'PENDING', employeeId: 'e1' }, 'e1')).toThrow(ForbiddenError);
  });
});

describe('Justificar una ausencia', () => {
  const day = { date: '2026-11-05', today: '2026-11-12', planKind: 'WORK' as const, marks: 0 };
  it('se permite en un día de trabajo pasado sin marcas', () => {
    expect(absenceProblem(day)).toBeNull();
  });
  it('no se permite hoy, en el futuro, en descanso ni si hubo marcas', () => {
    expect(absenceProblem({ ...day, date: '2026-11-12' })).toMatch('ya pasaron');
    expect(absenceProblem({ ...day, date: '2026-11-20' })).toMatch('ya pasaron');
    expect(absenceProblem({ ...day, planKind: 'REST' })).toMatch('no tenías turno');
    expect(absenceProblem({ ...day, planKind: 'UNASSIGNED' })).toMatch('no tenías turno');
    expect(absenceProblem({ ...day, marks: 1 })).toMatch('justifica la marcación');
  });
});

describe('Registrar la salida que faltó', () => {
  const at = (iso: string) => new Date(iso);
  const inMark = { type: 'IN' as const, timestamp: at('2026-11-10T13:00:00Z') };
  const now = at('2026-11-12T12:00:00Z');

  it('solo para un ingreso sin salida', () => {
    expect(missingExitWindow({ ...inMark, type: 'OUT' }, null, now, 16, null, true)).toBeNull();
    expect(missingExitWindow(inMark, { type: 'OUT', timestamp: at('2026-11-10T22:00:00Z') }, now, 16, null, true)).toBeNull();
    expect(missingExitWindow(inMark, null, now, 16, null, true)).not.toBeNull();
  });

  it('entre el ingreso y el menor de: siguiente marca, máximo de jornada y ahora', () => {
    const next = { type: 'IN' as const, timestamp: at('2026-11-10T20:00:00Z') };
    const w = missingExitWindow(inMark, next, now, 16, null, true)!;
    expect(w.earliest).toEqual(at('2026-11-10T13:01:00Z'));
    expect(w.latest).toEqual(at('2026-11-10T19:59:00Z'));
    const w2 = missingExitWindow(inMark, null, now, 16, null, true)!;
    expect(w2.latest).toEqual(at('2026-11-11T05:00:00Z'));
    const w3 = missingExitWindow(
      inMark,
      { type: 'IN', timestamp: at('2026-11-10T16:00:00Z') },
      at('2026-11-10T17:00:00Z'),
      16,
      null,
      false,
    )!;
    expect(w3.latest).toEqual(at('2026-11-10T15:59:00Z'));
  });

  it('sugiere la hora de salida del turno solo si cae dentro del rango', () => {
    expect(missingExitWindow(inMark, null, now, 16, at('2026-11-10T23:00:00Z'), true)!.suggested).toBe('2026-11-10T23:00:00.000Z');
    expect(missingExitWindow(inMark, null, now, 16, at('2026-11-11T09:00:00Z'), true)!.suggested).toBeNull();
  });

  it('rechaza horas antes del ingreso o fuera del rango', () => {
    const w = missingExitWindow(inMark, null, now, 16, null, true)!;
    expect(exitProblem(at('2026-11-10T12:00:00Z'), w)).toMatch('después del ingreso');
    expect(exitProblem(at('2026-11-11T06:00:00Z'), w)).toMatch('no es válida');
    expect(exitProblem(at('2026-11-10T23:00:00Z'), w)).toBeNull();
  });

  it('no se ofrece mientras la jornada sigue en curso', () => {
    const during = at('2026-11-10T16:00:00Z');
    const shiftEnd = at('2026-11-10T23:00:00Z');
    expect(missingExitWindow(inMark, null, during, 16, shiftEnd, false)).toBeNull();
    expect(missingExitWindow(inMark, null, at('2026-11-10T23:05:00Z'), 16, shiftEnd, false)).not.toBeNull();
    expect(missingExitWindow(inMark, null, during, 16, null, false)).toBeNull();
    expect(missingExitWindow(inMark, null, during, 16, null, true)).not.toBeNull();
  });
});

describe('Registrar un día trabajado sin marcas', () => {
  const at = (iso: string) => new Date(iso);
  const now = at('2026-11-12T12:00:00Z');

  it('acepta una jornada normal ya terminada', () => {
    expect(workedDayProblem(at('2026-11-10T13:00:00Z'), at('2026-11-10T23:00:00Z'), now, 16)).toBeNull();
  });

  it('rechaza salida antes del ingreso, en el futuro o jornadas demasiado largas', () => {
    expect(workedDayProblem(at('2026-11-10T13:00:00Z'), at('2026-11-10T13:00:00Z'), now, 16)).toMatch('después del ingreso');
    expect(workedDayProblem(at('2026-11-12T11:00:00Z'), at('2026-11-12T20:00:00Z'), now, 16)).toMatch('futuro');
    expect(workedDayProblem(at('2026-11-10T05:00:00Z'), at('2026-11-10T23:00:00Z'), now, 16)).toMatch('16 horas');
  });
});

describe('Contar las horas desde la hora real de llegada', () => {
  const at = (iso: string) => new Date(iso);
  const inMark = { type: 'IN' as const, timestamp: at('2026-11-10T13:13:00Z'), isLate: true };
  const shiftStart = at('2026-11-10T13:00:00Z');

  it('va desde el inicio del turno hasta un minuto antes de la marca, y sugiere el inicio del turno', () => {
    const w = creditWindow(inMark, { timestamp: at('2026-11-09T23:00:00Z') }, shiftStart, 16)!;
    expect(w.earliest).toEqual(shiftStart);
    expect(w.latest).toEqual(at('2026-11-10T13:12:00Z'));
    expect(w.suggested).toBe(shiftStart.toISOString());
  });

  it('no permite pasar por encima de la marca anterior ni aplica a salidas', () => {
    const w = creditWindow(inMark, { timestamp: at('2026-11-10T13:05:00Z') }, shiftStart, 16)!;
    expect(w.earliest).toEqual(at('2026-11-10T13:06:00Z'));
    expect(w.suggested).toBeNull();
    expect(creditWindow({ ...inMark, type: 'OUT' }, null, shiftStart, 16)).toBeNull();
  });

  it('rechaza horas después de la marca o antes del turno', () => {
    const w = creditWindow(inMark, null, shiftStart, 16)!;
    expect(creditProblem(at('2026-11-10T13:20:00Z'), w)).toMatch('antes de la hora en que marcó');
    expect(creditProblem(at('2026-11-10T12:50:00Z'), w)).toMatch('inicio del turno');
    expect(creditProblem(shiftStart, w)).toBeNull();
  });

  it('solo se ofrece si el ingreso tuvo atraso y había turno', () => {
    expect(creditWindow({ ...inMark, isLate: false }, null, shiftStart, 16)).toBeNull();
    expect(creditWindow(inMark, null, null, 16)).toBeNull();
  });
});
