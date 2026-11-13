import ExcelJS from 'exceljs';
import { buildAttendanceWorkbook, periodLabel, sheetName } from './attendance-workbook';
import { AttendanceReport, ReportTotals } from '../../domain/attendance-report';

const morning = { id: 's1', name: 'Mañana', startTime: '08:00', endTime: '18:00', toleranceMinutes: 10 };
const afternoon = { id: 's2', name: 'Tarde', startTime: '11:00', endTime: '21:00', toleranceMinutes: 10 };
const totals: ReportTotals = {
  workedMinutes: 586,
  overtimeMinutes: 14,
  daysWorked: 1,
  lateDays: 1,
  lateMinutes: 14,
  justifiedLateDays: 0,
  justifiedLateMinutes: 0,
  preEntryDays: 0,
  preEntryMinutes: 0,
  openSessions: 0,
  marks: 2,
  scheduledDays: 2,
  absences: 1,
  justifiedAbsences: 0,
  holidays: 0,
  leaveDays: 0,
};

const report: AttendanceReport = {
  from: '2026-11-02',
  to: '2026-11-04',
  timezone: 'America/Guayaquil',
  generatedAt: new Date('2026-11-05T12:00:00Z'),
  site: null,
  totals: { employees: 1, ...totals },
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
      totals,
      calendar: [
        { date: '2026-11-02', kind: 'REST', shift: null, scheduleName: 'Rotación A' },
        { date: '2026-11-03', kind: 'WORK', shift: morning, scheduleName: 'Rotación A' },
        { date: '2026-11-04', kind: 'WORK', shift: afternoon, scheduleName: 'Rotación A' },
      ],
      days: [
        {
          date: '2026-11-03',
          firstIn: new Date('2026-11-03T13:14:00Z'),
          preEntryMinutes: 0,
          lastOut: new Date('2026-11-03T23:14:00Z'),
          workedMinutes: 600,
          overtimeMinutes: 14,
          isLate: true,
          lateMinutes: 14,
          lateJustified: false,
          openSession: false,
          plan: { date: '2026-11-03', kind: 'WORK', scheduleName: 'Rotación A', shift: morning },
          absent: false,
          absenceJustified: false,
          dayOff: null,
          site: { id: 'm', name: 'Matriz' },
          marks: [
            {
              id: 'a1',
              type: 'IN',
              timestamp: new Date('2026-11-03T13:14:00Z'),
              isLate: true,
              lateMinutes: 14,
              preEntryMinutes: 0,
              justified: false,
              manual: false,
              creditedFrom: null,
            },
            {
              id: 'a2',
              type: 'OUT',
              timestamp: new Date('2026-11-03T23:14:00Z'),
              isLate: false,
              lateMinutes: 0,
              preEntryMinutes: 0,
              justified: false,
              manual: false,
              creditedFrom: null,
            },
          ],
        },
        {
          date: '2026-11-04',
          firstIn: null,
          preEntryMinutes: 0,
          lastOut: null,
          workedMinutes: 0,
          overtimeMinutes: 0,
          isLate: false,
          lateMinutes: 0,
          lateJustified: false,
          openSession: false,
          plan: { date: '2026-11-04', kind: 'WORK', scheduleName: 'Rotación A', shift: afternoon },
          absent: true,
          absenceJustified: false,
          dayOff: null,
          site: { id: 'n', name: 'Norte' },
          marks: [],
        },
      ],
    },
  ],
};

const asHHmm = (v: ExcelJS.CellValue) => {
  const raw = v && typeof v === 'object' && 'result' in v ? v.result : v;
  if (typeof raw === 'number') {
    const m = Math.round(raw * 24 * 60);
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  }
  return (raw as Date).toISOString().slice(11, 16).replace(/^0/, '');
};

describe('Exportación a Excel', () => {
  it('tiene la hoja Resumen y una hoja por colaborador', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildAttendanceWorkbook(report));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Resumen', 'Ana Torres']);

    const summary = wb.getWorksheet('Resumen')!;
    const scol = (name: string) => (summary.getRow(1).values as string[]).indexOf(name);
    expect(summary.getRow(2).getCell(scol('Colaborador')).text).toBe('Ana Torres');
    expect(summary.getRow(2).getCell(scol('Horas (decimal)')).value).toBe(9.77);
    expect(summary.getRow(2).getCell(scol('Días programados')).value).toBe(2);
    expect(summary.getRow(2).getCell(scol('Ausencias')).value).toBe(1);
    expect(asHHmm(summary.getRow(2).getCell(scol('Atraso (h:mm)')).value)).toBe('0:14');
    expect(asHHmm(summary.getRow(2).getCell(scol('Horas suplementarias (h:mm)')).value)).toBe('0:14');
    expect(summary.getRow(3).getCell(1).value).toBe('TOTAL');
  });

  it('la hoja del colaborador lista todos los días, con 0 cuando no marcó', async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildAttendanceWorkbook(report));
    const ws = wb.getWorksheet('Ana Torres')!;
    expect(ws.getRow(1).getCell(1).value).toBe('Ana Torres · 02/11/2026 al 04/11/2026');

    const headerRow = 4;
    const col = (name: string) => (ws.getRow(headerRow).values as string[]).indexOf(name);
    const cell = (day: number, name: string) => ws.getRow(headerRow + day).getCell(col(name));

    expect(cell(1, 'Día').value).toBe('Lunes');
    expect(cell(1, 'Observación').value).toBe('Descanso');
    expect(asHHmm(cell(1, 'Horas trabajadas').value)).toBe('0:00');

    expect(cell(2, 'Turno').value).toBe('Mañana 08:00–18:00');
    expect(cell(2, 'Ingreso').value).toBe('08:14');
    expect(cell(2, 'Salida').value).toBe('18:14');
    expect(cell(2, 'Horas trabajadas').numFmt).toBe('[h]:mm');
    expect(asHHmm(cell(2, 'Horas trabajadas').value)).toBe('10:00');
    expect(asHHmm(cell(2, 'Atraso (h:mm)').value)).toBe('0:14');
    expect(asHHmm(cell(2, 'Horas suplementarias (h:mm)').value)).toBe('0:14');
    expect(cell(2, 'Observación').value).toBe('Atraso 14 min');

    expect(cell(3, 'Ingreso').value).toBe('—');
    expect(asHHmm(cell(3, 'Horas trabajadas').value)).toBe('0:00');
    expect(asHHmm(cell(3, 'Atraso (h:mm)').value)).toBe('0:00');
    expect(cell(3, 'Observación').value).toBe('No marcó');

    const total = ws.getRow(headerRow + 4);
    expect(total.getCell(1).value).toBe('TOTAL');
    expect(total.getCell(col('Horas trabajadas')).value).toMatchObject({ formula: 'SUM(G5:G7)' });
  });
});

describe('Nombres y período', () => {
  it('nombres de hoja válidos y sin repetir', () => {
    const used = new Set<string>(['resumen']);
    expect(sheetName('Ana Torres', used)).toBe('Ana Torres');
    expect(sheetName('ana torres', used)).toBe('ana torres (2)');
    expect(sheetName('María José Fernández de la Cruz Montesdeoca', used)).toHaveLength(31);
    expect(sheetName('Pérez / López [temp]', used)).toBe('Pérez López temp');
    expect(sheetName('Resumen', used)).toBe('Resumen (2)');
  });

  it('el período de un mes completo se muestra como mes', () => {
    expect(periodLabel('2026-11-01', '2026-11-30')).toBe('Noviembre 2026');
    expect(periodLabel('2026-02-01', '2026-02-28')).toBe('Febrero 2026');
    expect(periodLabel('2026-11-01', '2026-11-07')).toBe('01/11/2026 al 07/11/2026');
  });
});
