-- AlterTable
ALTER TABLE "Athlete" ADD COLUMN "licenseNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Athlete_licenseNumber_key" ON "Athlete"("licenseNumber");
