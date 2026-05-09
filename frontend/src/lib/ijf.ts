// Mirror of backend/src/categories/ijf-weight-classes.ts and age-group.util.ts.
// Keep these tables in sync with the backend — they encode IJF rules used for
// category assignment.

export type Gender = 'MALE' | 'FEMALE';
export type AgeGroup = 'U13' | 'U15' | 'CADET' | 'JUNIOR' | 'SENIOR' | 'VETERAN';

interface WeightClass {
  gender: Gender;
  ageGroup: AgeGroup;
  minWeight: number;
  maxWeight: number;
  label: string;
}

function wc(gender: Gender, ageGroup: AgeGroup, limits: number[]): WeightClass[] {
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

const IJF_WEIGHT_CLASSES: WeightClass[] = [
  ...wc('MALE', 'SENIOR', [60, 66, 73, 81, 90, 100, 100]),
  ...wc('FEMALE', 'SENIOR', [48, 52, 57, 63, 70, 78, 78]),
  ...wc('MALE', 'JUNIOR', [55, 60, 66, 73, 81, 90, 100, 100]),
  ...wc('FEMALE', 'JUNIOR', [44, 48, 52, 57, 63, 70, 78, 78]),
  ...wc('MALE', 'CADET', [50, 55, 60, 66, 73, 81, 90, 90]),
  ...wc('FEMALE', 'CADET', [40, 44, 48, 52, 57, 63, 70, 70]),
  ...wc('MALE', 'U15', [38, 42, 46, 50, 55, 60, 66, 66]),
  ...wc('FEMALE', 'U15', [36, 40, 44, 48, 52, 57, 63, 63]),
  ...wc('MALE', 'U13', [30, 34, 38, 42, 46, 50, 55, 55]),
  ...wc('FEMALE', 'U13', [28, 32, 36, 40, 44, 48, 52, 52]),
  ...wc('MALE', 'VETERAN', [60, 66, 73, 81, 90, 100, 100]),
  ...wc('FEMALE', 'VETERAN', [48, 52, 57, 63, 70, 78, 78]),
];

export function getAgeOnDate(dateOfBirth: Date, referenceDate: Date): number {
  let age = referenceDate.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = referenceDate.getMonth() - dateOfBirth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < dateOfBirth.getDate())) {
    age--;
  }
  return age;
}

export function determineAgeGroup(dateOfBirth: Date, competitionDate: Date): AgeGroup {
  const age = getAgeOnDate(dateOfBirth, competitionDate);
  if (age < 13) return 'U13';
  if (age <= 14) return 'U15';
  if (age <= 17) return 'CADET';
  if (age <= 20) return 'JUNIOR';
  if (age <= 35) return 'SENIOR';
  return 'VETERAN';
}

export interface IjfProjection {
  age: number;
  ageGroup: AgeGroup;
  weightLabel: string | null;
  categoryName: string | null;
}

export function projectIjfCategory(
  dateOfBirth: Date,
  gender: Gender,
  weight: number | null,
  competitionDate: Date,
): IjfProjection {
  const age = getAgeOnDate(dateOfBirth, competitionDate);
  const ageGroup = determineAgeGroup(dateOfBirth, competitionDate);

  if (weight === null || Number.isNaN(weight) || weight <= 0) {
    return { age, ageGroup, weightLabel: null, categoryName: null };
  }

  const match = IJF_WEIGHT_CLASSES.find(
    (cls) =>
      cls.gender === gender &&
      cls.ageGroup === ageGroup &&
      weight > cls.minWeight &&
      weight <= cls.maxWeight,
  );
  if (!match) {
    return { age, ageGroup, weightLabel: null, categoryName: null };
  }

  const genderLabel = gender === 'MALE' ? 'Men' : 'Women';
  return {
    age,
    ageGroup,
    weightLabel: `${match.label}kg`,
    categoryName: `${ageGroup} ${genderLabel} ${match.label}kg`,
  };
}
