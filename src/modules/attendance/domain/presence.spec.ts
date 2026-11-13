import { DateTime } from 'luxon';
import { DayPlan } from '../../schedules/domain/schedule-plan';
import { MarkRecord } from './attendance-rules';
import { presenceOf } from './presence';

const ZONE = 'America/Guayaquil';
const local = (iso: string) => DateTime.fromISO(iso, { zone: ZONE }).toJSDate();
const plan = {
  date: '2026-11-13',
  kind: 'WORK',
  shift: { id: 's1', name: 'Mañana', startTime: '08:00', endTime: '18:00', toleranceMinutes: 10 },
  scheduleName: 'A',
} as unknown as DayPlan;
const lateIn = { id: 'm1', type: 'IN', timestamp: local('2026-11-13T08:13'), isLate: true, lateMinutes: 13 } as MarkRecord & { id: string };
const base = { records: [lateIn], last: lateIn, plan, now: local('2026-11-13T12:00'), zone: ZONE, maxSessionHours: 16 };

describe('Atraso de hoy en la presencia', () => {
  it('sin justificación aprobada cuenta como atraso', () => {
    const p = presenceOf(base);
    expect(p.isLate).toBe(true);
    expect(p.lateJustified).toBe(false);
  });

  it('con justificación aprobada deja de contar y se marca como justificado', () => {
    const p = presenceOf({ ...base, justifiedMarkIds: new Set(['m1']) });
    expect(p.isLate).toBe(false);
    expect(p.lateJustified).toBe(true);
    expect(p.lateMinutes).toBe(13);
  });
});

describe('Almuerzo en el contador de hoy', () => {
  const workday = { dailyMinutes: 480, lunchMinutes: 60, lunchAfterMinutes: 240 };
  const onTime = { id: 'm2', type: 'IN', timestamp: local('2026-11-13T08:00') } as MarkRecord & { id: string };
  const at = (hhmm: string) => presenceOf({ ...base, records: [onTime], last: onTime, now: local(`2026-11-13T${hhmm}`), workday });

  it('antes de 4 horas no descuenta y avisa cuándo empieza', () => {
    expect(at('11:00')).toMatchObject({ workedMinutesToday: 180, lunch: { deducted: 0, pending: 60, startsIn: 60 } });
  });

  it('entre las 4 y 5 horas el contador se detiene mientras corre el almuerzo', () => {
    expect(at('12:30')).toMatchObject({ workedMinutesToday: 240, lunch: { deducted: 30, pending: 30, startsIn: 0 } });
  });

  it('pasado el almuerzo vuelve a contar', () => {
    expect(at('17:00')).toMatchObject({ workedMinutesToday: 480, lunch: { deducted: 60, pending: 0 } });
  });
});
