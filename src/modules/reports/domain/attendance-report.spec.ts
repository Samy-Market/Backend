import { DateTime } from 'luxon';
import { employeeReport, overtimeOf, ReportMark } from './attendance-report';

const ZONE = 'America/Guayaquil';
const local = (iso: string) => DateTime.fromISO(iso, { zone: ZONE }).toJSDate();
const shift = (startTime: string, endTime: string) => ({ id: 's', name: 'T', startTime, endTime, toleranceMinutes: 10 });

const WORKDAY = { dailyMinutes: 480, lunchMinutes: 60, lunchAfterMinutes: 240 };

describe('Horas suplementarias', () => {
  const work = { kind: 'WORK' as const };

  it('cuentan lo que pasa de las 8 horas de jornada, sin importar la hora de salida del turno', () => {
    expect(overtimeOf(480, work, null, 480)).toBe(0);
    expect(overtimeOf(570, work, null, 480)).toBe(90);
    expect(overtimeOf(300, work, null, 480)).toBe(0);
  });

  it('en descanso o feriado todo lo trabajado es suplementario', () => {
    expect(overtimeOf(240, { kind: 'REST' }, null, 480)).toBe(240);
    expect(overtimeOf(240, work, { kind: 'HOLIDAY', name: 'Feriado' } as never, 480)).toBe(240);
  });
});

describe('Jornada con almuerzo', () => {
  const morning = shift('08:00', '17:00');
  const everyDay = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, shift: morning }));
  const mk = (id: string, type: 'IN' | 'OUT', iso: string): ReportMark => ({
    id,
    type,
    timestamp: local(iso),
    isLate: false,
    lateMinutes: 0,
    preEntryMinutes: 0,
    siteId: 'site',
    justified: false,
  });
  const report = (records: ReportMark[]) =>
    employeeReport({
      employee: { id: 'e', fullName: 'E', documentId: '1', position: 'P', active: true, siteId: 'site' },
      records,
      assignments: [{ id: 'a', startDate: '2026-11-01', endDate: null, schedule: { id: 's', name: 'S', days: everyDay } }],
      transfers: [],
      siteNames: new Map([['site', 'Sede']]),
      fromKey: '2026-11-05',
      toKey: '2026-11-05',
      from: local('2026-11-05T00:00'),
      to: local('2026-11-06T00:00'),
      today: '2026-11-10',
      now: local('2026-11-10T12:00'),
      zone: ZONE,
      maxSessionHours: 16,
      workday: WORKDAY,
    }).days[0];

  it('de 08:00 a 17:00 son 8 horas: se descuenta 1 hora de almuerzo y no hay suplementarias', () => {
    const d = report([mk('1', 'IN', '2026-11-05T08:00'), mk('2', 'OUT', '2026-11-05T17:00')]);
    expect(d.workedMinutes).toBe(480);
    expect(d.lunchMinutes).toBe(60);
    expect(d.overtimeMinutes).toBe(0);
  });

  it('de 08:00 a 19:00: las suplementarias empiezan a las 17:00', () => {
    const d = report([mk('1', 'IN', '2026-11-05T08:00'), mk('2', 'OUT', '2026-11-05T19:00')]);
    expect(d.workedMinutes).toBe(600);
    expect(d.overtimeMinutes).toBe(120);
  });

  it('si marcó la salida y el regreso del almuerzo, no se descuenta otra vez', () => {
    const d = report([
      mk('1', 'IN', '2026-11-05T08:00'),
      mk('2', 'OUT', '2026-11-05T13:00'),
      mk('3', 'IN', '2026-11-05T14:00'),
      mk('4', 'OUT', '2026-11-05T17:00'),
    ]);
    expect(d.lunchMinutes).toBe(0);
    expect(d.workedMinutes).toBe(480);
  });

  it('una jornada corta (4 horas o menos) no tiene almuerzo', () => {
    const d = report([mk('1', 'IN', '2026-11-05T08:00'), mk('2', 'OUT', '2026-11-05T12:00')]);
    expect(d.lunchMinutes).toBe(0);
    expect(d.workedMinutes).toBe(240);
  });
});

describe('Atrasos justificados', () => {
  const morning = shift('08:00', '17:00');
  const everyDay = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, shift: morning }));
  const lateIn = (id: string, day: string, justified: boolean): ReportMark => ({
    id,
    type: 'IN',
    timestamp: local(`${day}T08:20`),
    isLate: true,
    lateMinutes: 20,
    preEntryMinutes: 0,
    siteId: 'm',
    justified,
  });
  const out = (id: string, day: string): ReportMark => ({
    id,
    type: 'OUT',
    timestamp: local(`${day}T17:00`),
    isLate: false,
    lateMinutes: 0,
    preEntryMinutes: 0,
    siteId: 'm',
    justified: false,
  });

  it('un atraso con justificación aprobada no suma a los totales, pero queda registrado', () => {
    const r = employeeReport({
      employee: { id: 'e1', fullName: 'Ana', documentId: '0912345675', position: 'Cajera', active: true, siteId: 'm' },
      records: [lateIn('a', '2026-11-03', true), out('b', '2026-11-03'), lateIn('c', '2026-11-04', false), out('d', '2026-11-04')],
      assignments: [{ id: 'as', startDate: '2026-11-01', endDate: null, schedule: { id: 'h', name: 'Fijo', days: everyDay } }],
      transfers: [],
      siteNames: new Map([['m', 'Matriz']]),
      fromKey: '2026-11-03',
      toKey: '2026-11-04',
      from: local('2026-11-03T00:00'),
      to: local('2026-11-05T00:00'),
      today: '2026-11-10',
      now: local('2026-11-10T12:00'),
      zone: ZONE,
      maxSessionHours: 16,
      workday: WORKDAY,
    });
    const [justifiedDay, lateDay] = r.days;
    expect(justifiedDay).toMatchObject({ isLate: false, lateJustified: true, lateMinutes: 20 });
    expect(justifiedDay.marks[0].justified).toBe(true);
    expect(lateDay).toMatchObject({ isLate: true, lateJustified: false });
    expect(r.totals).toMatchObject({ lateDays: 1, lateMinutes: 20, justifiedLateDays: 1, justifiedLateMinutes: 20 });
  });
});

describe('Ausencias justificadas', () => {
  it('un día sin marcas con justificación aprobada no cuenta como ausencia', () => {
    const everyDay = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, shift: shift('08:00', '17:00') }));
    const r = employeeReport({
      employee: { id: 'e1', fullName: 'Ana', documentId: '0912345675', position: 'Cajera', active: true, siteId: 'm' },
      records: [],
      assignments: [{ id: 'as', startDate: '2026-11-01', endDate: null, schedule: { id: 'h', name: 'Fijo', days: everyDay } }],
      transfers: [],
      justifiedAbsences: new Set(['2026-11-03']),
      siteNames: new Map([['m', 'Matriz']]),
      fromKey: '2026-11-03',
      toKey: '2026-11-04',
      from: local('2026-11-03T00:00'),
      to: local('2026-11-05T00:00'),
      today: '2026-11-10',
      now: local('2026-11-10T12:00'),
      zone: ZONE,
      maxSessionHours: 16,
      workday: WORKDAY,
    });
    expect(r.days.map((d) => [d.date, d.absent, d.absenceJustified, d.workedMinutes])).toEqual([
      ['2026-11-03', false, true, 0],
      ['2026-11-04', true, false, 0],
    ]);
    expect(r.totals).toMatchObject({ absences: 1, justifiedAbsences: 1, workedMinutes: 0 });
  });
});

describe('Feriados y vacaciones', () => {
  it('no son ausencia, no cuentan como programados y lo trabajado en feriado es suplementario', () => {
    const everyDay = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, shift: shift('08:00', '17:00') }));
    const mark = (id: string, type: 'IN' | 'OUT', iso: string, late = 0): ReportMark => ({
      id,
      type,
      timestamp: local(iso),
      isLate: late > 0,
      lateMinutes: late,
      preEntryMinutes: 0,
      siteId: 'm',
      justified: false,
    });
    const r = employeeReport({
      employee: { id: 'e1', fullName: 'Ana', documentId: '0912345675', position: 'Cajera', active: true, siteId: 'm' },
      records: [mark('a', 'IN', '2026-11-03T08:30', 30), mark('b', 'OUT', '2026-11-03T12:00')],
      assignments: [{ id: 'as', startDate: '2026-11-01', endDate: null, schedule: { id: 'h', name: 'Fijo', days: everyDay } }],
      transfers: [],
      timeOff: {
        holidays: new Map([
          ['2026-11-02', 'Día de Difuntos'],
          ['2026-11-03', 'Independencia de Cuenca'],
        ]),
        leaves: [{ id: 'l', kind: 'VACATION', startDate: '2026-11-04', endDate: '2026-11-05' }],
      },
      siteNames: new Map([['m', 'Matriz']]),
      fromKey: '2026-11-02',
      toKey: '2026-11-06',
      from: local('2026-11-02T00:00'),
      to: local('2026-11-07T00:00'),
      today: '2026-11-10',
      now: local('2026-11-10T12:00'),
      zone: ZONE,
      maxSessionHours: 16,
      workday: WORKDAY,
    });
    const byDate = new Map(r.days.map((d) => [d.date, d]));
    expect(byDate.get('2026-11-02')).toMatchObject({ absent: false, dayOff: { kind: 'HOLIDAY' } });
    expect(byDate.get('2026-11-03')).toMatchObject({ isLate: false, overtimeMinutes: 210, dayOff: { kind: 'HOLIDAY' } });
    expect(byDate.get('2026-11-04')).toMatchObject({ absent: false, dayOff: { kind: 'LEAVE', label: 'Vacaciones' } });
    expect(byDate.get('2026-11-06')).toMatchObject({ absent: true, dayOff: null });
    expect(r.totals).toMatchObject({ absences: 1, holidays: 2, leaveDays: 2, scheduledDays: 1, lateDays: 0, overtimeMinutes: 210 });
  });
});

describe('Días programados', () => {
  it('cuentan solo hasta hoy: los futuros no, y hoy solo si ya marcó', () => {
    const everyDay = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, shift: shift('08:00', '17:00') }));
    const build = (records: ReportMark[]) =>
      employeeReport({
        employee: { id: 'e1', fullName: 'Ana', documentId: '0912345675', position: 'Cajera', active: true, siteId: 'm' },
        records,
        assignments: [{ id: 'as', startDate: '2026-11-01', endDate: null, schedule: { id: 'h', name: 'Fijo', days: everyDay } }],
        transfers: [],
        siteNames: new Map([['m', 'Matriz']]),
        fromKey: '2026-11-01',
        toKey: '2026-11-30',
        from: local('2026-11-01T00:00'),
        to: local('2026-12-01T00:00'),
        today: '2026-11-12',
        now: local('2026-11-12T09:00'),
        zone: ZONE,
        maxSessionHours: 16,
        workday: WORKDAY,
      });
    expect(build([]).totals.scheduledDays).toBe(11);
    const inToday: ReportMark = {
      id: 'a',
      type: 'IN',
      timestamp: local('2026-11-12T08:00'),
      isLate: false,
      lateMinutes: 0,
      preEntryMinutes: 0,
      siteId: 'm',
      justified: false,
    };
    expect(build([inToday]).totals).toMatchObject({ scheduledDays: 12, daysWorked: 1, absences: 11 });
  });
});
