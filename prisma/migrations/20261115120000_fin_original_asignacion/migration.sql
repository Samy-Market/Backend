-- Al asignar un horario nuevo, el anterior se recorta: se guarda hasta cuándo iba para poder restaurarlo si se quita el nuevo.
ALTER TABLE "ScheduleAssignment" ADD COLUMN "trimmed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ScheduleAssignment" ADD COLUMN "originalEndDate" DATE;
