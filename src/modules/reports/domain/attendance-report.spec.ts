import { DateTime } from 'luxon';
import { overtimeOf } from './attendance-report';

const ZONE = 'America/Guayaquil';
const local = (iso: string) => DateTime.fromISO(iso, { zone: ZONE }).toJSDate();
const shift = (startTime: string, endTime: string) => ({ id: 's', name: 'T', startTime, endTime, toleranceMinutes: 10 });

describe('Horas suplementarias', () => {
  it('cuenta el tiempo después de la hora de salida del turno', () => {
    const plan = { kind: 'WORK' as const, shift: shift('08:00', '18:00') };
    expect(overtimeOf({ date: '2026-11-05', lastOut: local('2026-11-05T19:30'), workedMinutes: 690 }, plan, ZONE)).toBe(90);
    expect(overtimeOf({ date: '2026-11-05', lastOut: local('2026-11-05T17:45'), workedMinutes: 585 }, plan, ZONE)).toBe(0);
    expect(overtimeOf({ date: '2026-11-05', lastOut: null, workedMinutes: 0 }, plan, ZONE)).toBe(0);
  });

  it('turno nocturno: la salida es al día siguiente', () => {
    const plan = { kind: 'WORK' as const, shift: shift('22:00', '06:00') };
    expect(overtimeOf({ date: '2026-11-05', lastOut: local('2026-11-06T06:20'), workedMinutes: 500 }, plan, ZONE)).toBe(20);
    expect(overtimeOf({ date: '2026-11-05', lastOut: local('2026-11-06T05:50'), workedMinutes: 470 }, plan, ZONE)).toBe(0);
  });

  it('en día de descanso todo lo trabajado es suplementario; sin horario, nada', () => {
    expect(
      overtimeOf({ date: '2026-11-08', lastOut: local('2026-11-08T12:00'), workedMinutes: 240 }, { kind: 'REST', shift: null }, ZONE),
    ).toBe(240);
    expect(
      overtimeOf({ date: '2026-11-08', lastOut: local('2026-11-08T12:00'), workedMinutes: 240 }, { kind: 'UNASSIGNED', shift: null }, ZONE),
    ).toBe(0);
  });
});
