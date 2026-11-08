import ExcelJS from 'exceljs';
import { DateTime } from 'luxon';
import { AttendanceReport } from '../../domain/attendance-report';

const BRAND = 'FF0F766E';

function planLabel(p: AttendanceReport['employees'][number]['days'][number]['plan']) {
  if (p.kind === 'WORK' && p.shift) return `${p.shift.name} ${p.shift.startTime}–${p.shift.endTime}`;
  return p.kind === 'REST' ? 'Descanso' : 'Sin horario';
}

const localTime = (d: Date | null, zone: string) => (d ? DateTime.fromJSDate(d, { zone }).toFormat('HH:mm') : '');
const localDateTime = (d: Date, zone: string) => DateTime.fromJSDate(d, { zone }).toFormat('dd/MM/yyyy HH:mm:ss');
/** Minutos → fracción de día, para que Excel lo muestre con formato [h]:mm y se pueda sumar. */
const asExcelDuration = (minutes: number) => minutes / (24 * 60);
const asDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

function styleHeader(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  row.alignment = { vertical: 'middle' };
  row.height = 20;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
}

export async function buildAttendanceWorkbook(report: AttendanceReport): Promise<Buffer> {
  const zone = report.timezone;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Control de Asistencia';
  wb.created = report.generatedAt;

  // --- Resumen por empleado ---------------------------------------------------
  const summary = wb.addWorksheet('Resumen');
  summary.columns = [
    { header: 'Empleado', key: 'name', width: 28 },
    { header: 'Cédula', key: 'doc', width: 14 },
    { header: 'Cargo', key: 'position', width: 24 },
    { header: 'Sede base', key: 'site', width: 20 },
    { header: 'Horario(s)', key: 'shift', width: 26 },
    { header: 'Días programados', key: 'scheduled', width: 16 },
    { header: 'Días trabajados', key: 'days', width: 15 },
    { header: 'Ausencias', key: 'absences', width: 11 },
    { header: 'Horas trabajadas', key: 'hours', width: 16, style: { numFmt: '[h]:mm' } },
    { header: 'Horas (decimal)', key: 'hoursDec', width: 15, style: { numFmt: '0.00' } },
    { header: 'Días con atraso', key: 'lateDays', width: 15 },
    { header: 'Minutos de atraso', key: 'lateMin', width: 17 },
    { header: 'Jornadas abiertas', key: 'open', width: 17 },
  ];
  for (const e of report.employees) {
    summary.addRow({
      name: e.employee.fullName + (e.employee.active ? '' : ' (inactivo)'),
      doc: e.employee.documentId,
      position: e.employee.position,
      site: e.employee.homeSite.name,
      shift: e.employee.schedules.join(', ') || 'Sin horario',
      scheduled: e.totals.scheduledDays,
      days: e.totals.daysWorked,
      absences: e.totals.absences,
      hours: asExcelDuration(e.totals.workedMinutes),
      hoursDec: Math.round((e.totals.workedMinutes / 60) * 100) / 100,
      lateDays: e.totals.lateDays,
      lateMin: e.totals.lateMinutes,
      open: e.totals.openSessions,
    });
  }
  styleHeader(summary);
  const totalRow = summary.addRow({
    name: 'TOTAL',
    scheduled: report.totals.scheduledDays,
    days: report.totals.daysWorked,
    absences: report.totals.absences,
    hours: asExcelDuration(report.totals.workedMinutes),
    hoursDec: Math.round((report.totals.workedMinutes / 60) * 100) / 100,
    lateDays: report.totals.lateDays,
    lateMin: report.totals.lateMinutes,
    open: report.totals.openSessions,
  });
  totalRow.font = { bold: true };
  totalRow.border = { top: { style: 'thin' } };
  summary.addRow([]);
  summary.addRow([`Período: ${report.from} a ${report.to} · Sede: ${report.site?.name ?? 'Todas'} · Zona horaria: ${zone}`]).font = {
    italic: true,
    color: { argb: 'FF64748B' },
  };
  summary.addRow([`Generado: ${localDateTime(report.generatedAt, zone)}`]).font = { italic: true, color: { argb: 'FF64748B' } };

  // --- Detalle por día --------------------------------------------------------
  const daily = wb.addWorksheet('Detalle por día');
  daily.columns = [
    { header: 'Fecha', key: 'date', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Empleado', key: 'name', width: 28 },
    { header: 'Cédula', key: 'doc', width: 14 },
    { header: 'Sede', key: 'site', width: 20 },
    { header: 'Turno programado', key: 'plan', width: 24 },
    { header: 'Primer ingreso', key: 'in', width: 15 },
    { header: 'Última salida', key: 'out', width: 14 },
    { header: 'Horas trabajadas', key: 'hours', width: 16, style: { numFmt: '[h]:mm' } },
    { header: 'Atraso', key: 'late', width: 9 },
    { header: 'Minutos de atraso', key: 'lateMin', width: 17 },
    { header: 'Jornada abierta', key: 'open', width: 15 },
    { header: 'Ausente', key: 'absent', width: 9 },
    { header: 'N.º marcaciones', key: 'marks', width: 15 },
  ];
  const rows = report.employees
    .flatMap((e) => e.days.map((d) => ({ e, d })))
    .sort((a, b) => a.d.date.localeCompare(b.d.date) || a.e.employee.fullName.localeCompare(b.e.employee.fullName));
  for (const { e, d } of rows) {
    const row = daily.addRow({
      date: asDate(d.date),
      name: e.employee.fullName,
      doc: e.employee.documentId,
      site: d.site.name + (d.site.id !== e.employee.homeSite.id ? ' (traslado)' : ''),
      plan: planLabel(d.plan),
      in: localTime(d.firstIn, zone),
      out: localTime(d.lastOut, zone),
      hours: asExcelDuration(d.workedMinutes),
      late: d.isLate ? 'Sí' : 'No',
      lateMin: d.isLate ? d.lateMinutes : 0,
      open: d.openSession ? 'Sí' : 'No',
      absent: d.absent ? 'Sí' : 'No',
      marks: d.marks.length,
    });
    if (d.isLate) row.getCell('late').font = { color: { argb: 'FFB91C1C' }, bold: true };
    if (d.openSession) row.getCell('open').font = { color: { argb: 'FFB45309' }, bold: true };
    if (d.absent) row.getCell('absent').font = { color: { argb: 'FFB91C1C' }, bold: true };
  }
  styleHeader(daily);

  // --- Marcaciones (registro crudo) ------------------------------------------
  const marks = wb.addWorksheet('Marcaciones');
  marks.columns = [
    { header: 'Fecha', key: 'date', width: 12, style: { numFmt: 'dd/mm/yyyy' } },
    { header: 'Hora', key: 'time', width: 10 },
    { header: 'Empleado', key: 'name', width: 28 },
    { header: 'Cédula', key: 'doc', width: 14 },
    { header: 'Sede', key: 'site', width: 20 },
    { header: 'Tipo', key: 'type', width: 10 },
    { header: 'Atraso (min)', key: 'late', width: 13 },
    { header: 'Fecha y hora UTC', key: 'utc', width: 22 },
  ];
  const markRows = report.employees
    .flatMap((e) => e.days.flatMap((d) => d.marks.map((m) => ({ e, m, d }))))
    .sort((a, b) => a.m.timestamp.getTime() - b.m.timestamp.getTime());
  for (const { e, m, d } of markRows) {
    const local = DateTime.fromJSDate(m.timestamp, { zone });
    marks.addRow({
      date: asDate(local.toISODate()!),
      time: local.toFormat('HH:mm:ss'),
      name: e.employee.fullName,
      doc: e.employee.documentId,
      site: d.site.name,
      type: m.type === 'IN' ? 'Ingreso' : 'Salida',
      late: m.isLate ? m.lateMinutes : '',
      utc: m.timestamp.toISOString(),
    });
  }
  styleHeader(marks);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
