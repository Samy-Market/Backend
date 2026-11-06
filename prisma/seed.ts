/* eslint-disable no-console */
import { PrismaClient, Role, AttendanceType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DateTime } from 'luxon';
import { computeLateness } from '../src/attendance/attendance.domain';

const prisma = new PrismaClient();
const ZONE = process.env.APP_TIMEZONE || 'America/Guayaquil';

const PASSWORDS = {
  admin: 'Admin123*',
  supervisor: 'Super123*',
  employee: 'Empleado123*',
};

/** El seed BORRA todos los datos: se protege contra ejecutarlo por error en una BD remota. */
function assertSafeTarget() {
  const url = process.env.DATABASE_URL ?? '';
  const host = /@([^:/?]+)/.exec(url)?.[1] ?? '';
  const isLocal = ['localhost', '127.0.0.1', '::1', 'postgres'].includes(host);
  if (!isLocal && process.env.SEED_ALLOW_REMOTE !== 'true') {
    console.error(
      `\n✋ El seed borra TODOS los datos y la base apunta a "${host}".\n` +
        '   Si de verdad quieres cargar los datos de ejemplo ahí, ejecuta con SEED_ALLOW_REMOTE=true.\n',
    );
    process.exit(1);
  }
}

async function main() {
  assertSafeTarget();
  console.log('Limpiando datos previos...');
  await prisma.auditLog.deleteMany();
  await prisma.justification.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.user.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.site.deleteMany();

  const site = await prisma.site.create({
    data: { name: 'Matriz Guayaquil', lat: -2.170998, lng: -79.922359, radiusMeters: 150 },
  });

  const morning = await prisma.shift.create({
    data: { name: 'Matutino', startTime: '08:00', endTime: '17:00', toleranceMinutes: 10 },
  });
  const afternoon = await prisma.shift.create({
    data: { name: 'Vespertino', startTime: '13:00', endTime: '21:00', toleranceMinutes: 5 },
  });

  const [adminHash, supHash, empHash] = await Promise.all([
    bcrypt.hash(PASSWORDS.admin, 10),
    bcrypt.hash(PASSWORDS.supervisor, 10),
    bcrypt.hash(PASSWORDS.employee, 10),
  ]);

  await prisma.user.create({
    data: { email: 'admin@empresa.com', passwordHash: adminHash, role: Role.ADMIN },
  });
  await prisma.user.create({
    data: { email: 'supervisor@empresa.com', passwordHash: supHash, role: Role.SUPERVISOR },
  });

  const people = [
    { email: 'ana.torres@empresa.com', fullName: 'Ana Torres', documentId: '0912345678', position: 'Cajera', shift: morning },
    { email: 'luis.mendoza@empresa.com', fullName: 'Luis Mendoza', documentId: '0923456789', position: 'Bodeguero', shift: morning },
    { email: 'maria.vera@empresa.com', fullName: 'María Vera', documentId: '0934567890', position: 'Asesora comercial', shift: morning },
    { email: 'carlos.zambrano@empresa.com', fullName: 'Carlos Zambrano', documentId: '0945678901', position: 'Repartidor', shift: afternoon },
    { email: 'sofia.ponce@empresa.com', fullName: 'Sofía Ponce', documentId: '0956789012', position: 'Asistente administrativa', shift: afternoon },
  ];

  const employees = [];
  for (const p of people) {
    const user = await prisma.user.create({
      data: { email: p.email, passwordHash: empHash, role: Role.EMPLOYEE },
    });
    const employee = await prisma.employee.create({
      data: {
        userId: user.id,
        fullName: p.fullName,
        documentId: p.documentId,
        position: p.position,
        shiftId: p.shift.id,
        siteId: site.id,
      },
    });
    employees.push({ employee, shift: p.shift });
  }

  // Historial de ejemplo: días laborables de las últimas 2 semanas (hoy queda libre para probar).
  const today = DateTime.now().setZone(ZONE).startOf('day');
  let rand = 42;
  const rnd = (min: number, max: number) => {
    rand = (rand * 9301 + 49297) % 233280;
    return min + Math.floor((rand / 233280) * (max - min + 1));
  };

  let count = 0;
  for (let d = 14; d >= 1; d--) {
    const day = today.minus({ days: d });
    if (day.weekday > 5) continue; // solo lunes a viernes
    for (const { employee, shift } of employees) {
      if (rnd(1, 10) === 1) continue; // ausencia ocasional
      const [sh, sm] = shift.startTime.split(':').map(Number);
      const [eh, em] = shift.endTime.split(':').map(Number);
      const inAt = day.set({ hour: sh, minute: sm }).plus({ minutes: rnd(-15, 25) }).toJSDate();
      const outAt = day.set({ hour: eh, minute: em }).plus({ minutes: rnd(-10, 30) }).toJSDate();
      const late = computeLateness(inAt, shift, ZONE);
      await prisma.attendance.create({
        data: { employeeId: employee.id, type: AttendanceType.IN, timestamp: inAt, ...late },
      });
      await prisma.attendance.create({
        data: { employeeId: employee.id, type: AttendanceType.OUT, timestamp: outAt },
      });
      count += 2;
    }
  }

  console.log(`Seed completado: 1 sede, 2 turnos, 7 usuarios, ${count} marcaciones de ejemplo.`);
  console.log(`  admin@empresa.com / ${PASSWORDS.admin}`);
  console.log(`  supervisor@empresa.com / ${PASSWORDS.supervisor}`);
  console.log(`  <empleado>@empresa.com / ${PASSWORDS.employee}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
