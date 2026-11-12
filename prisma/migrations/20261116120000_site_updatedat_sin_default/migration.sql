-- Alinea la base con el esquema: Prisma llena updatedAt solo, el valor por defecto sobraba.
ALTER TABLE "Site" ALTER COLUMN "updatedAt" DROP DEFAULT;
