-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'COACH';

-- AlterTable
ALTER TABLE "Competitor"
  ADD COLUMN "registeredById"  TEXT,
  ADD COLUMN "paymentIntentId" TEXT,
  ADD COLUMN "paidAt"          TIMESTAMP(3),
  ADD COLUMN "paidAmount"      DECIMAL(10,2),
  ADD COLUMN "refundedAt"      TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Competitor_paymentIntentId_key" ON "Competitor"("paymentIntentId");

-- CreateIndex
CREATE INDEX "Competitor_registeredById_idx" ON "Competitor"("registeredById");

-- AddForeignKey
ALTER TABLE "Competitor"
  ADD CONSTRAINT "Competitor_registeredById_fkey"
  FOREIGN KEY ("registeredById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
