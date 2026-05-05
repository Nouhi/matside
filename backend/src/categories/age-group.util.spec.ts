import { AgeGroup } from '@prisma/client';
import { determineAgeGroup } from './age-group.util';

describe('determineAgeGroup', () => {
  const competitionDate = new Date('2026-06-15');

  function dobForAge(age: number): Date {
    return new Date(2026 - age, 0, 1);
  }

  it('returns U13 for a 12-year-old', () => {
    expect(determineAgeGroup(dobForAge(12), competitionDate)).toBe(AgeGroup.U13);
  });

  it('returns U15 for a 13-year-old', () => {
    expect(determineAgeGroup(dobForAge(13), competitionDate)).toBe(AgeGroup.U15);
  });

  it('returns U15 for a 14-year-old', () => {
    expect(determineAgeGroup(dobForAge(14), competitionDate)).toBe(AgeGroup.U15);
  });

  it('returns CADET for a 15-year-old', () => {
    expect(determineAgeGroup(dobForAge(15), competitionDate)).toBe(AgeGroup.CADET);
  });

  it('returns CADET for a 17-year-old', () => {
    expect(determineAgeGroup(dobForAge(17), competitionDate)).toBe(AgeGroup.CADET);
  });

  it('returns JUNIOR for an 18-year-old', () => {
    expect(determineAgeGroup(dobForAge(18), competitionDate)).toBe(AgeGroup.JUNIOR);
  });

  it('returns JUNIOR for a 20-year-old', () => {
    expect(determineAgeGroup(dobForAge(20), competitionDate)).toBe(AgeGroup.JUNIOR);
  });

  it('returns SENIOR for a 21-year-old', () => {
    expect(determineAgeGroup(dobForAge(21), competitionDate)).toBe(AgeGroup.SENIOR);
  });

  it('returns SENIOR for a 35-year-old', () => {
    expect(determineAgeGroup(dobForAge(35), competitionDate)).toBe(AgeGroup.SENIOR);
  });

  it('returns VETERAN for a 36-year-old', () => {
    expect(determineAgeGroup(dobForAge(36), competitionDate)).toBe(AgeGroup.VETERAN);
  });

  it('handles birthday exactly on competition day', () => {
    const dob = new Date('2008-06-15');
    expect(determineAgeGroup(dob, competitionDate)).toBe(AgeGroup.JUNIOR);
  });

  it('handles birthday day after competition (has not turned yet)', () => {
    const dob = new Date('2008-06-16');
    expect(determineAgeGroup(dob, competitionDate)).toBe(AgeGroup.CADET);
  });
});
