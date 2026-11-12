-- Ubicación que envió el celular al marcar y su distancia a la sede (para revisión posterior).
ALTER TABLE "Attendance" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Attendance" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "Attendance" ADD COLUMN "accuracyMeters" INTEGER;
ALTER TABLE "Attendance" ADD COLUMN "distanceMeters" INTEGER;
