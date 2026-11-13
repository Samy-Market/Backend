-- creditedFrom: hora desde la que cuentan las horas de un ingreso, si el jefe la ajustó al aprobar (la marca original no cambia).
-- justificationId: qué aprobación creó o ajustó esta marca, para poder deshacerla.
ALTER TABLE "Attendance" ADD COLUMN "creditedFrom" TIMESTAMP(3);
ALTER TABLE "Attendance" ADD COLUMN "justificationId" TEXT;
CREATE INDEX "Attendance_justificationId_idx" ON "Attendance"("justificationId");
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_justificationId_fkey" FOREIGN KEY ("justificationId") REFERENCES "Justification"("id") ON DELETE SET NULL ON UPDATE CASCADE;
