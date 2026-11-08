-- Horarios rotativos: plantillas semanales (Schedule + ScheduleDay) asignadas a cada
-- empleado por periodos (ScheduleAssignment). Reemplaza el turno único Employee.shiftId.

-- 1) Tablas nuevas -------------------------------------------------------------
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduleDay" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "shiftId" TEXT,
    CONSTRAINT "ScheduleDay_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ScheduleDay_weekday_check" CHECK ("weekday" BETWEEN 1 AND 7)
);

CREATE TABLE "ScheduleAssignment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduleAssignment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ScheduleAssignment_dates_check" CHECK ("endDate" IS NULL OR "endDate" >= "startDate")
);

CREATE UNIQUE INDEX "ScheduleDay_scheduleId_weekday_key" ON "ScheduleDay"("scheduleId", "weekday");
CREATE INDEX "ScheduleAssignment_employeeId_startDate_idx" ON "ScheduleAssignment"("employeeId", "startDate");
CREATE INDEX "ScheduleAssignment_scheduleId_idx" ON "ScheduleAssignment"("scheduleId");

ALTER TABLE "ScheduleDay" ADD CONSTRAINT "ScheduleDay_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleDay" ADD CONSTRAINT "ScheduleDay_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleAssignment" ADD CONSTRAINT "ScheduleAssignment_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2) Migración de datos ----------------------------------------------------------
-- Antes, el turno del empleado aplicaba TODOS los días. Para no cambiar ese
-- comportamiento, cada turno en uso se convierte en una plantilla con los 7 días
-- iguales y se asigna a sus empleados desde su primera marcación (o desde hoy).
CREATE TEMP TABLE "_shift_to_schedule" ON COMMIT DROP AS
SELECT s."id" AS shift_id, gen_random_uuid()::text AS schedule_id, s."name" AS name
FROM "Shift" s
WHERE EXISTS (SELECT 1 FROM "Employee" e WHERE e."shiftId" = s."id");

INSERT INTO "Schedule" ("id", "name", "description", "active", "createdAt", "updatedAt")
SELECT schedule_id, name || ' (todos los días)',
       'Creado automáticamente desde el turno único que tenía cada empleado.', true, now(), now()
FROM "_shift_to_schedule";

INSERT INTO "ScheduleDay" ("id", "scheduleId", "weekday", "shiftId")
SELECT gen_random_uuid()::text, m.schedule_id, d, m.shift_id
FROM "_shift_to_schedule" m CROSS JOIN generate_series(1, 7) AS d;

INSERT INTO "ScheduleAssignment" ("id", "employeeId", "scheduleId", "startDate", "endDate", "createdAt")
SELECT gen_random_uuid()::text, e."id", m.schedule_id,
       COALESCE(
         (SELECT min((a."timestamp" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Guayaquil')::date
            FROM "Attendance" a WHERE a."employeeId" = e."id"),
         (now() AT TIME ZONE 'America/Guayaquil')::date
       ),
       NULL, now()
FROM "Employee" e
JOIN "_shift_to_schedule" m ON m.shift_id = e."shiftId";

-- 3) Se retira el turno único ---------------------------------------------------------
ALTER TABLE "Employee" DROP CONSTRAINT "Employee_shiftId_fkey";
ALTER TABLE "Employee" DROP COLUMN "shiftId";
