import ExcelJS from 'exceljs';
import { buildAttendanceWorkbook } from './excel';
import { AttendanceReport } from './reports.service';

const report: AttendanceReport = {
  from: '2026-11-03',
  to: '2026-11-03',
  timezone: 'America/Guayaquil',
  generatedAt: new Date('2026-11-04T12:00:00Z'),
  totals: { employees: 1, workedMinutes: 540, daysWorked: 1, lateDays: 1, lateMinutes: 14, openSessions: 0, marks: 2 },
  employees: [
    {
      employee: { id: 'e1', fullName: 'Ana Torres', documentId: '0912345678', position: 'Cajera', active: true, shift: 'Matutino (08:00–17:00)' },
      totals: { workedMinutes: 540, daysWorked: 1, lateDays: 1, lateMinutes: 14, openSessions: 0, marks: 2 },
      days: [
        {
          date: '2026-11-03',
          firstIn: new Date('2026-11-03T13:14:00Z'),
          lastOut: new Date('2026-11-03T22:14:00Z'),
          workedMinutes: 540,
          isLate: true,
          lateMinutes: 14,
          openSession: false,
          marks: [
            { id: 'a1', type: 'IN', timestamp: new Date('2026-11-03T13:14:00Z'), isLate: true, lateMinutes: 14 },
            { id: 'a2', type: 'OUT', timestamp: new Date('2026-11-03T22:14:00Z'), isLate: false, lateMinutes: 0 },
          ],
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
    expect(daily.getRow(2).getCell(4).value).toBe('08:14'); // 13:14 UTC → 08:14 Guayaquil
    expect(daily.getRow(2).getCell(5).value).toBe('17:14');
    // Se guarda como fracción de día (9 h = 0,375) con formato [h]:mm; exceljs lo relee como fecha base 1899-12-30.
    const hours = daily.getRow(2).getCell(6);
    expect(hours.numFmt).toBe('[h]:mm');
    expect((hours.value as Date).toISOString()).toBe('1899-12-30T09:00:00.000Z');
    expect(daily.getRow(2).getCell(7).value).toBe('Sí');

    const summary = wb.getWorksheet('Resumen')!;
    expect(summary.getRow(2).getCell(7).value).toBe(9); // horas decimales
    expect(summary.getRow(3).getCell(1).value).toBe('TOTAL');

    const marks = wb.getWorksheet('Marcaciones')!;
    expect(marks.rowCount).toBe(3);
    expect(marks.getRow(2).getCell(5).value).toBe('Ingreso');
  });
});
