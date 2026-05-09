-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "matId" TEXT;

-- CreateIndex
CREATE INDEX "Category_matId_idx" ON "Category"("matId");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_matId_fkey" FOREIGN KEY ("matId") REFERENCES "Mat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
