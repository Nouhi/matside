-- CreateEnum
CREATE TYPE "MatchPhase" AS ENUM ('POOL', 'KNOCKOUT_SF', 'KNOCKOUT_FINAL', 'KNOCKOUT_BRONZE');

-- AlterEnum
ALTER TYPE "BracketType" ADD VALUE 'POOLS';

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "phase" "MatchPhase",
ADD COLUMN     "poolGroup" TEXT;
