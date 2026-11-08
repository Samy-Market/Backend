-- Sedes: dirección, estado y fechas; traslados temporales entre sedes;
-- y la sede donde se registró cada marcación.

-- 1) Sedes ------------------------------------------------------------------------
ALTER TABLE "Site"
  ADD COLUMN "address"   TEXT,
  ADD COLUMN "active"    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE UNIQUE INDEX "Site_name_key" ON "Site"("name");

-- 2) Traslados temporales -----------------------------------------------------------
CREATE TABLE "SiteTransfer" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SiteTransfer_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SiteTransfer_dates_check" CHECK ("endDate" >= "startDate")
);
CREATE INDEX "SiteTransfer_employeeId_startDate_idx" ON "SiteTransfer"("employeeId", "startDate");
CREATE INDEX "SiteTransfer_siteId_startDate_idx" ON "SiteTransfer"("siteId", "startDate");
ALTER TABLE "SiteTransfer" ADD CONSTRAINT "SiteTransfer_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SiteTransfer" ADD CONSTRAINT "SiteTransfer_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SiteTransfer" ADD CONSTRAINT "SiteTransfer_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3) Sede de cada marcación -----------------------------------------------------------
ALTER TABLE "Attendance" ADD COLUMN "siteId" TEXT;
-- Las marcaciones anteriores quedan en la sede base del empleado (no había traslados).
UPDATE "Attendance" a SET "siteId" = e."siteId" FROM "Employee" e WHERE e."id" = a."employeeId";
CREATE INDEX "Attendance_siteId_timestamp_idx" ON "Attendance"("siteId", "timestamp");
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
