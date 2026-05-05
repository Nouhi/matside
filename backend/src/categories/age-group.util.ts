import { AgeGroup } from '@prisma/client';

export function determineAgeGroup(dateOfBirth: Date, competitionDate: Date): AgeGroup {
  const age = getAgeOnDate(dateOfBirth, competitionDate);

  if (age < 13) return AgeGroup.U13;
  if (age <= 14) return AgeGroup.U15;
  if (age <= 17) return AgeGroup.CADET;
  if (age <= 20) return AgeGroup.JUNIOR;
  if (age <= 35) return AgeGroup.SENIOR;
  return AgeGroup.VETERAN;
}

function getAgeOnDate(dateOfBirth: Date, referenceDate: Date): number {
  let age = referenceDate.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = referenceDate.getMonth() - dateOfBirth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < dateOfBirth.getDate())) {
    age--;
  }
  return age;
}
