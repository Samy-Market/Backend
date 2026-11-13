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
