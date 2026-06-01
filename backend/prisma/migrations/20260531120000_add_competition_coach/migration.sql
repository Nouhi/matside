-- CreateTable
CREATE TABLE "CompetitionCoach" (
    "id"            TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "coachUserId"   TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionCoach_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionCoach_competitionId_coachUserId_key"
  ON "CompetitionCoach"("competitionId", "coachUserId");

-- CreateIndex
CREATE INDEX "CompetitionCoach_coachUserId_idx" ON "CompetitionCoach"("coachUserId");

-- AddForeignKey
ALTER TABLE "CompetitionCoach"
  ADD CONSTRAINT "CompetitionCoach_competitionId_fkey"
  FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionCoach"
  ADD CONSTRAINT "CompetitionCoach_coachUserId_fkey"
  FOREIGN KEY ("coachUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
