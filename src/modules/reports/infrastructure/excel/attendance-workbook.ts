import ExcelJS from 'exceljs';
import { DateTime } from 'luxon';
import { AttendanceReport, EmployeeReport, ReportDay } from '../../domain/attendance-report';
import { DayPlanView } from '../../../schedules/domain/schedule-plan';

const BRAND = 'FF0F766E';
const GREEN = 'FF15803D';
const MUTED = 'FF64748B';
const RED = 'FFB91C1C';
const DURATION = '[h]:mm';

const localTime = (d: Date | null, zone: string) => (d ? DateTime.fromJSDate(d, { zone }).toFormat('HH:mm') : '');
const localDateTime = (d: Date, zone: string) => DateTime.fromJSDate(d, { zone }).toFormat('dd/MM/yyyy HH:mm:ss');
const asExcelDuration = (minutes: number) => minutes / (24 * 60);
const asDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const hoursDecimal = (minutes: number) => Math.round((minutes / 60) * 100) / 100;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function planLabel(p: DayPlanView) {
  if (p.kind === 'WORK' && p.shift) return `${p.shift.name} ${p.shift.startTime}–${p.shift.endTime}`;
  return p.kind === 'REST' ? 'Descanso' : 'Sin horario';
}

export function periodLabel(from: string, to: string): string {
  const f = DateTime.fromISO(from).setLocale('es');
  const t = DateTime.fromISO(to);
  if (f.day === 1 && t.hasSame(f, 'month') && t.day === f.daysInMonth) return capitalize(f.toFormat('LLLL yyyy'));
  return `${f.toFormat('dd/MM/yyyy')} al ${t.toFormat('dd/MM/yyyy')}`;
}

export function sheetName(name: string, used: Set<string>): string {
  const base =
    name
      .replace(/[:\\/?*[\]']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 31) || 'Colaborador';
  let candidate = base;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) {
    const suffix = ` (${n})`;
    candidate = base.slice(0, 31 - suffix.length).trim() + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function styleHeaderRow(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 32;
}

export async function buildAttendanceWorkbook(report: AttendanceReport): Promise<Buffer> {
  const period = periodLabel(report.from, report.to);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Control de Asistencia';
  wb.created = report.generatedAt;

  const used = new Set<string>(['resumen']);
  const sheets = report.employees.map((e) => ({ e, name: sheetName(e.employee.fullName, used) }));

  buildSummary(wb, report, period, sheets);
  for (const { e, name } of sheets) buildEmployeeSheet(wb, name, e, report, period);

  return Buffer.from(await wb.xlsx.writeBuffer());
}

function buildSummary(wb: ExcelJS.Workbook, report: AttendanceReport, period: string, sheets: { e: EmployeeReport; name: string }[]) {
  const zone = report.timezone;
  const ws = wb.addWorksheet('Resumen');
  ws.columns = [
    { header: 'Colaborador', key: 'name', width: 28 },
    { header: 'Cédula', key: 'doc', width: 14 },
    { header: 'Cargo', key: 'position', width: 24 },
    { header: 'Sede base', key: 'site', width: 20 },
    { header: 'Horario(s)', key: 'shift', width: 26 },
    { header: 'Días programados', key: 'scheduled', width: 12 },
    { header: 'Días trabajados', key: 'days', width: 12 },
    { header: 'Ausencias', key: 'absences', width: 11 },
    { header: 'Ausencias justificadas', key: 'justAbs', width: 12 },
    { header: 'Feriados', key: 'holidays', width: 10 },
    { header: 'Vacaciones / permisos (días)', key: 'leave', width: 13 },
    { header: 'Horas trabajadas', key: 'hours', width: 12, style: { numFmt: DURATION } },
    { header: 'Horas (decimal)', key: 'hoursDec', width: 12, style: { numFmt: '0.00' } },
    { header: 'Días con atraso', key: 'lateDays', width: 11 },
    { header: 'Atraso (h:mm)', key: 'late', width: 12, style: { numFmt: DURATION } },
    { header: 'Atrasos justificados', key: 'justDays', width: 12 },
    { header: 'Horas suplementarias (h:mm)', key: 'overtime', width: 15, style: { numFmt: DURATION } },
    { header: 'Días con preingreso', key: 'preDays', width: 12 },
    { header: 'Minutos de preingreso', key: 'preMin', width: 12 },
    { header: 'Jornadas abiertas', key: 'open', width: 11 },
  ];
  styleHeaderRow(ws.getRow(1));

  const totalsRow = (t: AttendanceReport['totals'] | EmployeeReport['totals']) => ({
    scheduled: t.scheduledDays,
    days: t.daysWorked,
    absences: t.absences,
    justAbs: t.justifiedAbsences,
    holidays: t.holidays,
    leave: t.leaveDays,
    hours: asExcelDuration(t.workedMinutes),
    hoursDec: hoursDecimal(t.workedMinutes),
    lateDays: t.lateDays,
    late: asExcelDuration(t.lateMinutes),
    justDays: t.justifiedLateDays,
    overtime: asExcelDuration(t.overtimeMinutes),
    preDays: t.preEntryDays,
    preMin: t.preEntryMinutes,
    open: t.openSessions,
  });

  for (const { e, name } of sheets) {
    const label = e.employee.fullName + (e.employee.active ? '' : ' (inactivo)');
    const row = ws.addRow({
      name: { text: label, hyperlink: `#'${name}'!A1` },
      doc: e.employee.documentId,
      position: e.employee.position,
      site: e.employee.homeSite.name,
      shift: e.employee.schedules.join(', ') || 'Sin horario',
      ...totalsRow(e.totals),
    });
    row.getCell('name').font = { color: { argb: BRAND }, underline: true };
  }

  const total = ws.addRow({ name: 'TOTAL', ...totalsRow(report.totals) });
  total.font = { bold: true };
  total.border = { top: { style: 'thin' } };

  ws.addRow([]);
  const note = (text: string) => (ws.addRow([text]).font = { italic: true, color: { argb: MUTED } });
  note(`Período: ${period} · Sede: ${report.site?.name ?? 'Todas'} · Zona horaria: ${zone}`);
  note('Días programados: días de trabajo del período que ya pasaron (el de hoy, solo si ya marcó). Los días futuros no cuentan.');
  note('Horas suplementarias: tiempo trabajado después de la hora de salida del turno, o todo lo trabajado en un día de descanso.');
  note(
    'Feriados y vacaciones/permisos: días de trabajo que no se cuentan como programados ni como ausencia. Lo trabajado en un feriado es suplementario.',
  );
  note('Ausencias justificadas: días sin marcar con una justificación aprobada; no suman a las ausencias ni a las horas.');
  note('Atrasos justificados: tienen una justificación aprobada y no suman a los días ni a las horas de atraso.');
  note('Preingreso: minutos que llegó antes de su hora de entrada; no suman a las horas trabajadas.');
  note(`Generado: ${localDateTime(report.generatedAt, zone)}`);

  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
}

const EMPLOYEE_HEADERS = [
  'Fecha',
  'Día',
  'Turno',
  'Sede',
  'Ingreso',
  'Salida',
  'Horas trabajadas',
  'Atraso (h:mm)',
  'Horas suplementarias (h:mm)',
  'Observación',
];

function buildEmployeeSheet(wb: ExcelJS.Workbook, name: string, e: EmployeeReport, report: AttendanceReport, period: string) {
  const zone = report.timezone;
  const today = DateTime.fromJSDate(report.generatedAt, { zone }).toISODate()!;
  const ws = wb.addWorksheet(name);
  ws.columns = [
    { key: 'date', width: 12 },
    { key: 'weekday', width: 11 },
    { key: 'plan', width: 22 },
    { key: 'site', width: 18 },
    { key: 'in', width: 10 },
    { key: 'out', width: 10 },
    { key: 'hours', width: 12 },
    { key: 'late', width: 11 },
    { key: 'overtime', width: 15 },
    { key: 'notes', width: 34 },
  ];
  const cols = EMPLOYEE_HEADERS.length;

  const title = ws.addRow([`${e.employee.fullName}${e.employee.active ? '' : ' (inactivo)'} · ${period}`]);
  title.font = { bold: true, size: 14 };
  ws.mergeCells(title.number, 1, title.number, cols);
  const schedules = e.employee.schedules.join(', ') || 'Sin horario';
  const info = ws.addRow([
    `Cédula: ${e.employee.documentId} · Cargo: ${e.employee.position} · Sede base: ${e.employee.homeSite.name} · Horario: ${schedules}`,
  ]);
  info.font = { color: { argb: MUTED } };
  ws.mergeCells(info.number, 1, info.number, cols);
  ws.addRow([]);

  const header = ws.addRow(EMPLOYEE_HEADERS);
  styleHeaderRow(header);
  const firstDataRow = header.number + 1;

  const byDate = new Map(e.days.map((d) => [d.date, d]));
  for (const plan of e.calendar) {
    const d = byDate.get(plan.date);
    const row = ws.addRow({
      date: asDate(plan.date),
      weekday: capitalize(DateTime.fromISO(plan.date).setLocale('es').toFormat('cccc')),
      plan: planLabel(plan),
      site: d ? d.site.name + (d.site.id !== e.employee.homeSite.id ? ' (traslado)' : '') : '',
      in: localTime(d?.firstIn ?? null, zone) || '—',
      out: localTime(d?.lastOut ?? null, zone) || '—',
      hours: asExcelDuration(d?.workedMinutes ?? 0),
      late: asExcelDuration(d?.isLate ? d.lateMinutes : 0),
      overtime: asExcelDuration(d?.overtimeMinutes ?? 0),
      notes: notesFor(plan, d, today),
    });
    row.getCell('date').numFmt = 'dd/mm/yyyy';
    for (const k of ['hours', 'late', 'overtime']) row.getCell(k).numFmt = DURATION;
    for (const k of ['in', 'out']) row.getCell(k).alignment = { horizontal: 'center' };

    if (d?.absent) row.getCell('notes').font = { color: { argb: RED }, bold: true };
    else if (d?.absenceJustified || (d?.dayOff && !d.firstIn)) row.getCell('notes').font = { color: { argb: GREEN } };
    else if (!d) row.font = { color: { argb: MUTED } };
    if (d?.isLate) row.getCell('late').font = { color: { argb: RED }, bold: true };
    if (d && d.overtimeMinutes > 0) row.getCell('overtime').font = { color: { argb: BRAND }, bold: true };
  }

  const lastDataRow = ws.lastRow!.number;
  const sum = (col: string, minutes: number): ExcelJS.CellValue =>
    lastDataRow >= firstDataRow ? { formula: `SUM(${col}${firstDataRow}:${col}${lastDataRow})`, result: asExcelDuration(minutes) } : 0;
  const t = e.totals;
  const total = ws.addRow({
    date: 'TOTAL',
    hours: sum('G', t.workedMinutes),
    late: sum('H', t.lateMinutes),
    overtime: sum('I', t.overtimeMinutes),
    notes:
      `Días trabajados: ${t.daysWorked} · Ausencias: ${t.absences}` +
      (t.justifiedAbsences ? ` · Ausencias justificadas: ${t.justifiedAbsences}` : '') +
      (t.justifiedLateDays ? ` · Atrasos justificados: ${t.justifiedLateDays}` : ''),
  });
  total.font = { bold: true };
  total.border = { top: { style: 'thin' } };
  for (const k of ['hours', 'late', 'overtime']) total.getCell(k).numFmt = DURATION;

  ws.views = [{ state: 'frozen', ySplit: header.number }];
}

function notesFor(plan: DayPlanView, d: ReportDay | undefined, today: string): string {
  if (!d) {
    if (plan.kind === 'WORK') return plan.date === today ? 'Aún no marca' : 'No marcó';
    return plan.kind === 'REST' ? 'Descanso' : 'Sin horario asignado';
  }
  if (d.absent) return 'No marcó';
  if (d.absenceJustified) return 'Ausencia justificada';
  if (d.dayOff && !d.firstIn) return d.dayOff.label;
  const notes: string[] = [];
  if (d.dayOff)
    notes.push(
      d.dayOff.kind === 'HOLIDAY'
        ? `Trabajó en feriado (${d.dayOff.label.replace('Feriado: ', '')})`
        : `Trabajó durante ${d.dayOff.label.toLowerCase()}`,
    );
  if (plan.kind === 'REST') notes.push('Trabajó en día de descanso');
  if (d.isLate) notes.push(`Atraso ${d.lateMinutes} min`);
  if (d.lateJustified) notes.push(`Atraso ${d.lateMinutes} min justificado`);
  if (d.preEntryMinutes > 0) notes.push(`Preingreso ${d.preEntryMinutes} min`);
  if (d.openSession) notes.push('Sin marca de salida');
  return notes.join(' · ');
}
