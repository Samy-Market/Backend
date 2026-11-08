import { DateTime } from 'luxon';
import {
  buildSessions,
  computeLateness,
  MarkRecord,
  nextMarkType,
  summarizeByDay,
  sumWorkedMinutes,
  validateRequestedType,
} from './attendance-rules';

const ZONE = 'America/Guayaquil';
/** Crea una fecha UTC a partir de una hora local de Guayaquil. */
const local = (iso: string) => DateTime.fromISO(iso, { zone: ZONE }).toJSDate();
const mark = (type: 'IN' | 'OUT', iso: string, extra: Partial<MarkRecord> = {}): MarkRecord => ({
  type,
  timestamp: local(iso),
  ...extra,
});

describe('Alternancia IN/OUT', () => {
  const now = local('2026-11-05T12:00');

  it('sin marcas previas la siguiente es IN', () => {
    expect(nextMarkType(null, now)).toBe('IN');
  });

  it('después de IN la siguiente es OUT', () => {
    expect(nextMarkType(mark('IN', '2026-11-05T08:00'), now)).toBe('OUT');
  });

  it('después de OUT la siguiente es IN', () => {
    expect(nextMarkType(mark('OUT', '2026-11-05T11:00'), now)).toBe('IN');
  });

  it('un IN más antiguo que la duración máxima abre una nueva jornada (olvidó marcar salida)', () => {
    expect(nextMarkType(mark('IN', '2026-11-04T08:00'), now, 16)).toBe('IN');
  });

  it('un IN de ayer en la noche dentro del máximo sigue esperando OUT (turno nocturno)', () => {
    expect(nextMarkType(mark('IN', '2026-11-04T22:00'), local('2026-11-05T06:00'), 16)).toBe('OUT');
  });

  it('rechaza duplicados consecutivos con un mensaje claro', () => {
    expect(validateRequestedType('OUT', 'IN')).toMatch(/Ya registraste tu ingreso/);
    expect(validateRequestedType('IN', 'OUT')).toMatch(/No tienes un ingreso abierto/);
    expect(validateRequestedType('IN', 'IN')).toBeNull();
    expect(validateRequestedType('OUT', undefined)).toBeNull();
  });
});

describe('Atraso', () => {
  const shift = { startTime: '08:00', toleranceMinutes: 10 };

  it('a tiempo antes de la hora de entrada', () => {
    expect(computeLateness(local('2026-11-05T07:55'), shift, ZONE)).toEqual({ isLate: false, lateMinutes: 0 });
  });

  it('dentro de la tolerancia no es atraso (límite inclusivo)', () => {
    expect(computeLateness(local('2026-11-05T08:10'), shift, ZONE).isLate).toBe(false);
  });

  it('después de la tolerancia es atraso, medido desde la hora de entrada', () => {
    expect(computeLateness(local('2026-11-05T08:11'), shift, ZONE)).toEqual({ isLate: true, lateMinutes: 11 });
    expect(computeLateness(local('2026-11-05T09:30'), shift, ZONE)).toEqual({ isLate: true, lateMinutes: 90 });
  });

  it('usa la hora local aunque la fecha esté en UTC (08:15 local = 13:15 UTC)', () => {
    const utc = new Date('2026-11-05T13:15:00Z');
    expect(computeLateness(utc, shift, ZONE)).toEqual({ isLate: true, lateMinutes: 15 });
  });

  it('sin turno asignado no hay atraso', () => {
    expect(computeLateness(local('2026-11-05T11:00'), null, ZONE).isLate).toBe(false);
  });
});

describe('Horas trabajadas', () => {
  it('suma intervalos IN→OUT', () => {
    const recs = [
      mark('IN', '2026-11-05T08:00'),
      mark('OUT', '2026-11-05T12:00'),
      mark('IN', '2026-11-05T13:00'),
      mark('OUT', '2026-11-05T17:30'),
    ];
    const sessions = buildSessions(recs, local('2026-11-05T20:00'));
    expect(sessions).toHaveLength(2);
    expect(sumWorkedMinutes(sessions)).toBe(8 * 60 + 30);
  });

  it('ignora el orden de entrada de los registros', () => {
    const recs = [mark('OUT', '2026-11-05T12:00'), mark('IN', '2026-11-05T08:00')];
    expect(sumWorkedMinutes(buildSessions(recs, local('2026-11-05T20:00')))).toBe(240);
  });

  it('jornada abierta en curso cuenta hasta ahora', () => {
    const sessions = buildSessions([mark('IN', '2026-11-05T08:00')], local('2026-11-05T10:30'));
    expect(sessions[0]).toMatchObject({ open: true, stale: false, minutes: 150 });
  });

  it('jornada abierta abandonada (IN sin OUT) no suma horas y se marca como abierta', () => {
    const recs = [mark('IN', '2026-11-03T08:00'), mark('IN', '2026-11-04T08:00'), mark('OUT', '2026-11-04T16:00')];
    const days = summarizeByDay(recs, ZONE, local('2026-11-05T10:00'));
    expect(days.map((d) => d.date)).toEqual(['2026-11-03', '2026-11-04']);
    expect(days[0]).toMatchObject({ openSession: true, workedMinutes: 0 });
    expect(days[1]).toMatchObject({ openSession: false, workedMinutes: 480 });
  });

  it('un OUT sin IN previo se ignora', () => {
    const sessions = buildSessions([mark('OUT', '2026-11-05T09:00')], local('2026-11-05T10:00'));
    expect(sessions).toHaveLength(0);
  });

  it('un turno que cruza medianoche se asigna al día del ingreso', () => {
    const recs = [mark('IN', '2026-11-04T22:00'), mark('OUT', '2026-11-05T06:00')];
    const days = summarizeByDay(recs, ZONE, local('2026-11-05T12:00'));
    const d4 = days.find((d) => d.date === '2026-11-04')!;
    expect(d4.workedMinutes).toBe(480);
    expect(d4.lastOut).toEqual(local('2026-11-05T06:00'));
  });

  it('agrupa por día local, no UTC (19:30 local = 00:30 UTC del día siguiente)', () => {
    const recs = [mark('IN', '2026-11-05T15:00'), mark('OUT', '2026-11-05T19:30')];
    const days = summarizeByDay(recs, ZONE, local('2026-11-06T08:00'));
    expect(days).toHaveLength(1);
    expect(days[0].date).toBe('2026-11-05');
  });

  it('el resumen diario refleja el atraso del primer ingreso', () => {
    const recs = [mark('IN', '2026-11-05T08:20', { isLate: true, lateMinutes: 20 }), mark('OUT', '2026-11-05T17:00')];
    const [day] = summarizeByDay(recs, ZONE, local('2026-11-05T18:00'));
    expect(day).toMatchObject({ isLate: true, lateMinutes: 20, workedMinutes: 520 });
  });
});
