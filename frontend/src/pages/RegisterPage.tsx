import { useState, FormEvent, useMemo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { projectIjfCategory, type Gender } from '@/lib/ijf';

const BELTS = [
  'WHITE',
  'YELLOW',
  'ORANGE',
  'GREEN',
  'BLUE',
  'BROWN',
  'BLACK',
];

interface PublicCompetition {
  id: string;
  name: string;
  date: string;
  location: string;
  status: string;
}

export function RegisterPage() {
  const { id } = useParams<{ id: string }>();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<Gender>('MALE');
  const [weight, setWeight] = useState('');
  const [belt, setBelt] = useState('WHITE');
  const [club, setClub] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [competition, setCompetition] = useState<PublicCompetition | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .get<PublicCompetition>(`/public/competitions/${id}`)
      .then(setCompetition)
      .catch(() => {
        // Public competition fetch is best-effort; preview just won't render.
      });
  }, [id]);

  const projection = useMemo(() => {
    if (!competition || !dateOfBirth) return null;
    const dob = new Date(dateOfBirth);
    if (Number.isNaN(dob.getTime())) return null;
    const w = weight ? parseFloat(weight) : null;
    return projectIjfCategory(dob, gender, w, new Date(competition.date));
  }, [competition, dateOfBirth, gender, weight]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post(`/competitions/${id}/competitors`, {
        firstName,
        lastName,
        email,
        dateOfBirth,
        gender,
        weight: parseFloat(weight),
        belt,
        club,
        licenseNumber: licenseNumber.trim() || undefined,
      });
      setSubmitted(true);
      toast('Registration complete!', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
      toast(message);
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-sm border border-gray-200 text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Registration Complete</h2>
          <p className="text-gray-500">
            You have been registered for the competition. Good luck!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">matside</h1>
          <p className="text-gray-500 mt-1">Competitor Registration</p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Register for Competition</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                  First Name
                </label>
                <input
                  id="firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name
                </label>
                <input
                  id="lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label htmlFor="reg-email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="dob" className="block text-sm font-medium text-gray-700 mb-1">
                Date of Birth
              </label>
              <input
                id="dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="gender" className="block text-sm font-medium text-gray-700 mb-1">
                  Gender
                </label>
                <select
                  id="gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value as Gender)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                >
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
              </div>
              <div>
                <label htmlFor="weight" className="block text-sm font-medium text-gray-700 mb-1">
                  Weight (kg)
                </label>
                <input
                  id="weight"
                  type="number"
                  step="0.1"
                  min="20"
                  max="200"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="belt" className="block text-sm font-medium text-gray-700 mb-1">
                  Belt
                </label>
                <select
                  id="belt"
                  value={belt}
                  onChange={(e) => setBelt(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                >
                  {BELTS.map((b) => (
                    <option key={b} value={b}>
                      {b.charAt(0) + b.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="club" className="block text-sm font-medium text-gray-700 mb-1">
                  Club
                </label>
                <input
                  id="club"
                  type="text"
                  value={club}
                  onChange={(e) => setClub(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label htmlFor="licenseNumber" className="block text-sm font-medium text-gray-700 mb-1">
                License number{' '}
                <span className="text-xs font-normal text-gray-400">(optional)</span>
              </label>
              <input
                id="licenseNumber"
                type="text"
                inputMode="text"
                autoComplete="off"
                maxLength={50}
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                placeholder="e.g., USAJ-12345"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Federation/national ID. Used to recognize you across tournaments.
              </p>
            </div>

            {projection && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm">
                <div className="flex items-center gap-2 text-blue-900 font-medium">
                  <span>IJF category preview</span>
                </div>
                <div className="mt-1 text-blue-800">
                  Age <span className="font-semibold">{projection.age}</span>
                  {' · '}
                  Group <span className="font-semibold">{projection.ageGroup}</span>
                  {projection.weightLabel && (
                    <>
                      {' · '}
                      Weight class{' '}
                      <span className="font-semibold">{projection.weightLabel}</span>
                    </>
                  )}
                </div>
                {projection.categoryName ? (
                  <div className="mt-1 text-xs text-blue-700">
                    Will be assigned to: <span className="font-mono">{projection.categoryName}</span>
                  </div>
                ) : (
                  <div className="mt-1 text-xs text-blue-700">
                    {weight
                      ? 'No matching IJF weight class for this age group and weight.'
                      : 'Enter weight to see the matching IJF weight class.'}
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-gray-900 text-white rounded-md font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Registering...' : 'Register'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
