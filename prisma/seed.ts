import { PrismaClient, Role, AttendanceType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DateTime } from 'luxon';
import { computeLateness, computePreEntry } from '../src/modules/attendance/domain/attendance-rules';

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
  await prisma.siteTransfer.deleteMany();
  await prisma.scheduleAssignment.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.user.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.site.deleteMany();

  const centro = await prisma.site.create({
    data: { name: 'Sede Centro', address: 'Av. 9 de Octubre y Boyacá, Guayaquil', lat: -2.189412, lng: -79.889066, radiusMeters: 150 },
  });
  const norte = await prisma.site.create({
    data: { name: 'Sede Norte', address: 'Av. Francisco de Orellana, Guayaquil', lat: -2.152345, lng: -79.893456, radiusMeters: 150 },
  });

  const manana = await prisma.shift.create({
    data: { name: 'Mañana', startTime: '08:00', endTime: '18:00', toleranceMinutes: 10 },
  });
  const tarde = await prisma.shift.create({
    data: { name: 'Tarde', startTime: '11:00', endTime: '21:00', toleranceMinutes: 10 },
  });

  const pattern = (days: (typeof manana | null)[]) => days.map((shift, i) => ({ weekday: i + 1, shiftId: shift?.id ?? null }));
  const rotA = await prisma.schedule.create({
    data: {
      name: 'Rotación A',
      description: 'Alterna mañana y tarde; descansa el domingo.',
      days: { create: pattern([manana, tarde, manana, tarde, manana, tarde, null]) },
    },
    include: { days: { include: { shift: true } } },
  });
  const rotB = await prisma.schedule.create({
    data: {
      name: 'Rotación B',
      description: 'Inversa de la A; descansa el lunes y trabaja el domingo.',
      days: { create: pattern([null, manana, tarde, manana, tarde, manana, tarde]) },
    },
    include: { days: { include: { shift: true } } },
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
    {
      email: 'ana.torres@empresa.com',
      fullName: 'Ana Torres',
      documentId: '0912345675',
      position: 'Cajera / perchera',
      schedule: rotA,
      site: centro,
    },
    {
      email: 'luis.mendoza@empresa.com',
      fullName: 'Luis Mendoza',
      documentId: '0923456784',
      position: 'Bodeguero',
      schedule: rotA,
      site: centro,
    },
    {
      email: 'maria.vera@empresa.com',
      fullName: 'María Vera',
      documentId: '0934567892',
      position: 'Asesora comercial',
      schedule: rotB,
      site: norte,
    },
    {
      email: 'carlos.zambrano@empresa.com',
      fullName: 'Carlos Zambrano',
      documentId: '0945678902',
      position: 'Cajero',
      schedule: rotB,
      site: norte,
    },
    {
      email: 'sofia.ponce@empresa.com',
      fullName: 'Sofía Ponce',
      documentId: '0956789010',
      position: 'Asistente administrativa',
      schedule: rotA,
      site: centro,
    },
  ];

  const today = DateTime.now().setZone(ZONE).startOf('day');
  const rotationStart = today.minus({ weeks: 3 });
  const rotationEnd = rotationStart.plus({ months: 3 }).minus({ days: 1 });
  const dbDate = (d: DateTime) => new Date(`${d.toISODate()}T00:00:00.000Z`);

  const employees = [];
  for (const p of people) {
    const user = await prisma.user.create({
      data: { email: p.email, passwordHash: empHash, role: Role.EMPLOYEE },
    });
    const employee = await prisma.employee.create({
      data: { userId: user.id, fullName: p.fullName, documentId: p.documentId, position: p.position, siteId: p.site.id },
    });
    await prisma.scheduleAssignment.create({
      data: { employeeId: employee.id, scheduleId: p.schedule.id, startDate: dbDate(rotationStart), endDate: dbDate(rotationEnd) },
    });
    employees.push({ employee, schedule: p.schedule, site: p.site });
  }

  let rand = 42;
  const rnd = (min: number, max: number) => {
    rand = (rand * 9301 + 49297) % 233280;
    return min + Math.floor((rand / 233280) * (max - min + 1));
  };

  let count = 0;
  for (let d = 14; d >= 1; d--) {
    const day = today.minus({ days: d });
    for (const { employee, schedule, site } of employees) {
      const shift = schedule.days.find((x) => x.weekday === day.weekday)?.shift;
      if (!shift) continue;
      if (rnd(1, 12) === 1) continue;
      const [sh, sm] = shift.startTime.split(':').map(Number);
      const [eh, em] = shift.endTime.split(':').map(Number);
      const inAt = day
        .set({ hour: sh, minute: sm })
        .plus({ minutes: rnd(-15, 25) })
        .toJSDate();
      const outAt = day
        .set({ hour: eh, minute: em })
        .plus({ minutes: rnd(-10, 30) })
        .toJSDate();
      const late = { ...computeLateness(inAt, shift, ZONE), ...computePreEntry(inAt, shift, ZONE) };
      await prisma.attendance.create({
        data: { employeeId: employee.id, type: AttendanceType.IN, timestamp: inAt, ...late, siteId: site.id },
      });
      await prisma.attendance.create({
        data: { employeeId: employee.id, type: AttendanceType.OUT, timestamp: outAt, siteId: site.id },
      });
      count += 2;
    }
  }

  const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@empresa.com' } });
  const luis = employees.find((x) => x.employee.fullName === 'Luis Mendoza')!.employee;
  await prisma.siteTransfer.create({
    data: {
      employeeId: luis.id,
      siteId: norte.id,
      startDate: dbDate(today),
      endDate: dbDate(today.plus({ days: 2 })),
      reason: 'Apoyo por inventario en Sede Norte',
      createdBy: admin.id,
    },
  });

  console.log(
    `Seed completado: 2 sedes, 1 traslado, 2 turnos, 2 horarios rotativos (${rotationStart.toISODate()} a ${rotationEnd.toISODate()}), 7 usuarios, ${count} marcaciones de ejemplo.`,
  );
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
