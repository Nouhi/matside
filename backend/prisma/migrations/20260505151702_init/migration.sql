-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ORGANIZER', 'ADMIN');

-- CreateEnum
CREATE TYPE "CompetitionStatus" AS ENUM ('DRAFT', 'REGISTRATION', 'WEIGH_IN', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "AgeGroup" AS ENUM ('U13', 'U15', 'CADET', 'JUNIOR', 'SENIOR', 'VETERAN');

-- CreateEnum
CREATE TYPE "BracketType" AS ENUM ('ROUND_ROBIN', 'SINGLE_REPECHAGE', 'DOUBLE_REPECHAGE');

-- CreateEnum
CREATE TYPE "Belt" AS ENUM ('WHITE', 'YELLOW', 'ORANGE', 'GREEN', 'BLUE', 'BROWN', 'BLACK_1DAN', 'BLACK_2DAN', 'BLACK_3DAN', 'BLACK_4DAN', 'BLACK_5DAN');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('REGISTERED', 'WEIGHED_IN', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "WinMethod" AS ENUM ('IPPON', 'WAZA_ARI', 'DECISION', 'HANSOKU_MAKE', 'FUSEN_GACHI', 'KIKEN_GACHI');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "role" "UserRole" NOT NULL DEFAULT 'ORGANIZER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL DEFAULT '',
    "status" "CompetitionStatus" NOT NULL DEFAULT 'DRAFT',
    "organizerId" TEXT NOT NULL,
    "matchDuration" INTEGER NOT NULL DEFAULT 240,
    "goldenScoreLimit" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "ageGroup" "AgeGroup" NOT NULL,
    "minWeight" DECIMAL(65,30) NOT NULL,
    "maxWeight" DECIMAL(65,30) NOT NULL,
    "bracketType" "BracketType" NOT NULL DEFAULT 'ROUND_ROBIN',

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "categoryId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL DEFAULT '',
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "gender" "Gender" NOT NULL,
    "weight" DECIMAL(65,30),
    "belt" "Belt" NOT NULL DEFAULT 'WHITE',
    "club" TEXT NOT NULL DEFAULT '',
    "registrationStatus" "RegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mat" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "pin" TEXT NOT NULL DEFAULT '',
    "currentMatchId" TEXT,

    CONSTRAINT "Mat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "matId" TEXT,
    "round" INTEGER NOT NULL DEFAULT 0,
    "poolPosition" INTEGER NOT NULL DEFAULT 0,
    "competitor1Id" TEXT,
    "competitor2Id" TEXT,
    "winnerId" TEXT,
    "winMethod" "WinMethod",
    "scores" JSONB,
    "status" "MatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "duration" INTEGER NOT NULL DEFAULT 240,
    "goldenScore" BOOLEAN NOT NULL DEFAULT false,
    "sequenceNum" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Competition_organizerId_idx" ON "Competition"("organizerId");

-- CreateIndex
CREATE INDEX "Category_competitionId_idx" ON "Category"("competitionId");

-- CreateIndex
CREATE INDEX "Competitor_competitionId_idx" ON "Competitor"("competitionId");

-- CreateIndex
CREATE INDEX "Competitor_categoryId_idx" ON "Competitor"("categoryId");

-- CreateIndex
CREATE INDEX "Mat_competitionId_idx" ON "Mat"("competitionId");

-- CreateIndex
CREATE UNIQUE INDEX "Mat_competitionId_number_key" ON "Mat"("competitionId", "number");

-- CreateIndex
CREATE INDEX "Match_categoryId_idx" ON "Match"("categoryId");

-- CreateIndex
CREATE INDEX "Match_matId_idx" ON "Match"("matId");

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mat" ADD CONSTRAINT "Mat_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_matId_fkey" FOREIGN KEY ("matId") REFERENCES "Mat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_competitor1Id_fkey" FOREIGN KEY ("competitor1Id") REFERENCES "Competitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_competitor2Id_fkey" FOREIGN KEY ("competitor2Id") REFERENCES "Competitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "Competitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
