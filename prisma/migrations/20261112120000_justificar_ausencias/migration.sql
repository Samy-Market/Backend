-- Una justificación es de una marcación (atraso, salida) o de un día sin marcas (ausencia).
ALTER TABLE "Justification" ALTER COLUMN "attendanceId" DROP NOT NULL;
ALTER TABLE "Justification" ADD COLUMN "date" DATE;
ALTER TABLE "Justification" ADD CONSTRAINT "Justification_mark_or_day"
  CHECK (("attendanceId" IS NULL) <> ("date" IS NULL));
CREATE INDEX "Justification_employeeId_date_idx" ON "Justification"("employeeId", "date");
