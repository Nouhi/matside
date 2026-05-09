import { AgeGroup, Gender } from '@prisma/client';
import { determineAgeGroup, getAgeOnDate } from './age-group.util';
import { findIjfWeightClass } from './ijf-weight-classes';

export interface IjfProjection {
  age: number;
  ageGroup: AgeGroup;
  weightLabel: string | null;
  categoryName: string | null;
}

export function projectIjfCategory(
  competitor: { dateOfBirth: Date; gender: Gender; weight: unknown },
  competitionDate: Date,
): IjfProjection {
  const age = getAgeOnDate(competitor.dateOfBirth, competitionDate);
  const ageGroup = determineAgeGroup(competitor.dateOfBirth, competitionDate);

  const weightNum =
    competitor.weight === null || competitor.weight === undefined
      ? null
      : Number(competitor.weight);

  if (weightNum === null || Number.isNaN(weightNum) || weightNum <= 0) {
    return { age, ageGroup, weightLabel: null, categoryName: null };
  }

  const weightClass = findIjfWeightClass(competitor.gender, ageGroup, weightNum);
  if (!weightClass) {
    return { age, ageGroup, weightLabel: null, categoryName: null };
  }

  const genderLabel = competitor.gender === 'MALE' ? 'Men' : 'Women';
  return {
    age,
    ageGroup,
    weightLabel: `${weightClass.label}kg`,
    categoryName: `${ageGroup} ${genderLabel} ${weightClass.label}kg`,
  };
}
