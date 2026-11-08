import ExcelJS from 'exceljs';
import { buildAttendanceWorkbook } from './attendance-workbook';
import { AttendanceReport } from '../../domain/attendance-report';

const report: AttendanceReport = {
  from: '2026-11-03',
  to: '2026-11-03',
  timezone: 'America/Guayaquil',
  generatedAt: new Date('2026-11-04T12:00:00Z'),
  site: null,
  totals: {
    employees: 1,
    workedMinutes: 540,
    daysWorked: 1,
    lateDays: 1,
    lateMinutes: 14,
    openSessions: 0,
    marks: 2,
    scheduledDays: 2,
    absences: 1,
  },
  employees: [
    {
      employee: {
        id: 'e1',
        fullName: 'Ana Torres',
        documentId: '0912345678',
        position: 'Cajera',
        active: true,
        schedules: ['Rotación A'],
        homeSite: { id: 'm', name: 'Matriz' },
      },
      totals: { workedMinutes: 540, daysWorked: 1, lateDays: 1, lateMinutes: 14, openSessions: 0, marks: 2, scheduledDays: 2, absences: 1 },
      days: [
        {
          date: '2026-11-03',
          firstIn: new Date('2026-11-03T13:14:00Z'),
          lastOut: new Date('2026-11-03T22:14:00Z'),
          workedMinutes: 540,
          isLate: true,
          lateMinutes: 14,
          openSession: false,
          plan: {
            date: '2026-11-03',
            kind: 'WORK',
            scheduleName: 'Rotación A',
            shift: { id: 's1', name: 'Mañana', startTime: '08:00', endTime: '18:00', toleranceMinutes: 10 },
          },
          absent: false,
          site: { id: 'm', name: 'Matriz' },
          marks: [
            { id: 'a1', type: 'IN', timestamp: new Date('2026-11-03T13:14:00Z'), isLate: true, lateMinutes: 14 },
            { id: 'a2', type: 'OUT', timestamp: new Date('2026-11-03T22:14:00Z'), isLate: false, lateMinutes: 0 },
          ],
        },
        {
          date: '2026-11-04',
          firstIn: null,
          lastOut: null,
          workedMinutes: 0,
          isLate: false,
          lateMinutes: 0,
          openSession: false,
          plan: {
            date: '2026-11-04',
            kind: 'WORK',
            scheduleName: 'Rotación A',
            shift: { id: 's2', name: 'Tarde', startTime: '11:00', endTime: '21:00', toleranceMinutes: 10 },
          },
          absent: true,
          site: { id: 'n', name: 'Norte' },
          marks: [],
        },
      ],
    },
  ],
};

describe('Exportación a Excel', () => {
  it('genera las 3 hojas con horas locales y duraciones sumables', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildAttendanceWorkbook(report));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Resumen', 'Detalle por día', 'Marcaciones']);

    const daily = wb.getWorksheet('Detalle por día')!;
    const col = (name: string) => (daily.getRow(1).values as string[]).indexOf(name);
    expect(daily.getRow(2).getCell(col('Turno programado')).value).toBe('Mañana 08:00–18:00');
    expect(daily.getRow(2).getCell(col('Primer ingreso')).value).toBe('08:14'); // 13:14 UTC → 08:14 Guayaquil
    expect(daily.getRow(2).getCell(col('Última salida')).value).toBe('17:14');
    // Se guarda como fracción de día (9 h = 0,375) con formato [h]:mm; exceljs lo relee como fecha base 1899-12-30.
    const hours = daily.getRow(2).getCell(col('Horas trabajadas'));
    expect(hours.numFmt).toBe('[h]:mm');
    expect((hours.value as Date).toISOString()).toBe('1899-12-30T09:00:00.000Z');
    expect(daily.getRow(2).getCell(col('Atraso')).value).toBe('Sí');
    // Día de trabajo sin marcaciones → ausencia
    expect(daily.getRow(3).getCell(col('Turno programado')).value).toBe('Tarde 11:00–21:00');
    expect(daily.getRow(3).getCell(col('Ausente')).value).toBe('Sí');
    // Sede del día; si no es la base, se indica el traslado
    expect(daily.getRow(2).getCell(col('Sede')).value).toBe('Matriz');
    expect(daily.getRow(3).getCell(col('Sede')).value).toBe('Norte (traslado)');

    const summary = wb.getWorksheet('Resumen')!;
    const scol = (name: string) => (summary.getRow(1).values as string[]).indexOf(name);
    expect(summary.getRow(2).getCell(scol('Horas (decimal)')).value).toBe(9);
    expect(summary.getRow(2).getCell(scol('Horario(s)')).value).toBe('Rotación A');
    expect(summary.getRow(2).getCell(scol('Días programados')).value).toBe(2);
    expect(summary.getRow(2).getCell(scol('Ausencias')).value).toBe(1);
    expect(summary.getRow(2).getCell(scol('Sede base')).value).toBe('Matriz');
    expect(summary.getRow(3).getCell(1).value).toBe('TOTAL');

    const marks = wb.getWorksheet('Marcaciones')!;
    expect(marks.rowCount).toBe(3);
    const mcol = (name: string) => (marks.getRow(1).values as string[]).indexOf(name);
    expect(marks.getRow(2).getCell(mcol('Tipo')).value).toBe('Ingreso');
    expect(marks.getRow(2).getCell(mcol('Sede')).value).toBe('Matriz');
  });
});
