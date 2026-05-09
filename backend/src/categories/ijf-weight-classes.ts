import { AgeGroup, Gender } from '@prisma/client';

export interface WeightClass {
  gender: Gender;
  ageGroup: AgeGroup;
  minWeight: number;
  maxWeight: number;
  label: string;
}

function wc(
  gender: Gender,
  ageGroup: AgeGroup,
  limits: number[],
): WeightClass[] {
  return limits.map((limit, index) => {
    if (index === limits.length - 1) {
      return {
        gender,
        ageGroup,
        minWeight: Math.abs(limit),
        maxWeight: 999,
        label: `+${Math.abs(limit)}`,
      };
    }
    const prevLimit = index === 0 ? 0 : Math.abs(limits[index - 1]);
    return {
      gender,
      ageGroup,
      minWeight: prevLimit,
      maxWeight: Math.abs(limit),
      label: `-${Math.abs(limit)}`,
    };
  });
}

export const IJF_WEIGHT_CLASSES: WeightClass[] = [
  ...wc(Gender.MALE, AgeGroup.SENIOR, [60, 66, 73, 81, 90, 100, 100]),
  ...wc(Gender.FEMALE, AgeGroup.SENIOR, [48, 52, 57, 63, 70, 78, 78]),
  ...wc(Gender.MALE, AgeGroup.JUNIOR, [55, 60, 66, 73, 81, 90, 100, 100]),
  ...wc(Gender.FEMALE, AgeGroup.JUNIOR, [44, 48, 52, 57, 63, 70, 78, 78]),
  ...wc(Gender.MALE, AgeGroup.CADET, [50, 55, 60, 66, 73, 81, 90, 90]),
  ...wc(Gender.FEMALE, AgeGroup.CADET, [40, 44, 48, 52, 57, 63, 70, 70]),
  ...wc(Gender.MALE, AgeGroup.U15, [38, 42, 46, 50, 55, 60, 66, 66]),
  ...wc(Gender.FEMALE, AgeGroup.U15, [36, 40, 44, 48, 52, 57, 63, 63]),
  ...wc(Gender.MALE, AgeGroup.U13, [30, 34, 38, 42, 46, 50, 55, 55]),
  ...wc(Gender.FEMALE, AgeGroup.U13, [28, 32, 36, 40, 44, 48, 52, 52]),
  ...wc(Gender.MALE, AgeGroup.VETERAN, [60, 66, 73, 81, 90, 100, 100]),
  ...wc(Gender.FEMALE, AgeGroup.VETERAN, [48, 52, 57, 63, 70, 78, 78]),
];

export function findIjfWeightClass(
  gender: Gender,
  ageGroup: AgeGroup,
  weight: number,
): WeightClass | undefined {
  return IJF_WEIGHT_CLASSES.find(
    (wc) =>
      wc.gender === gender &&
      wc.ageGroup === ageGroup &&
      weight > wc.minWeight &&
      weight <= wc.maxWeight,
  );
}
