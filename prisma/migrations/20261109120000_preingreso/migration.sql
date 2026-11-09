-- Minutos de preingreso: el empleado marcó antes de su hora de entrada. No suman a las horas trabajadas.
ALTER TABLE "Attendance" ADD COLUMN "preEntryMinutes" INTEGER NOT NULL DEFAULT 0;
