import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { X } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';

interface OpenCompetition {
  id: string;
  name: string;
  date: string;
  location: string;
}

/**
 * Coach registers an athlete into an open competition. Reuses the same field
 * set as public/organizer registration; the backend dedups against the global
 * Athlete record (email/license) so re-entering a known athlete just links.
 * No athlete-search typeahead in PR2 (tracked as COACH-P3).
 */
export function RegisterAthleteModal({
  onClose,
  onRegistered,
}: {
  onClose: () => void;
  onRegistered: () => void;
}) {
  const { data: open = [], isLoading } = useQuery<OpenCompetition[]>({
    queryKey: ['open-competitions'],
    queryFn: () => api.get('/public/competitions/open'),
  });

  const [competitionId, setCompetitionId] = useState('');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    dateOfBirth: '',
    gender: 'MALE',
    weight: '',
    club: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post(`/coach/competitions/${competitionId}/competitors`, {
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email || undefined,
        dateOfBirth: new Date(form.dateOfBirth).toISOString(),
        gender: form.gender,
        weight: form.weight ? Number(form.weight) : undefined,
        club: form.club || undefined,
      });
      toast('Athlete registered', 'success');
      onRegistered();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  }

  const input =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#0a3a7a]';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Register an athlete"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Register an athlete</h2>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-gray-500">Loading open competitions…</p>
        ) : open.length === 0 ? (
          <EmptyState
            title="No open competitions"
            context="There are no competitions accepting registrations right now. Check back when an organizer opens one."
          />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="comp" className="mb-1 block text-sm font-medium text-gray-700">
                Competition
              </label>
              <select
                id="comp"
                required
                value={competitionId}
                onChange={(e) => setCompetitionId(e.target.value)}
                className={input}
              >
                <option value="">Choose a competition…</option>
                {open.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {new Date(c.date).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="fn" className="mb-1 block text-sm font-medium text-gray-700">First name</label>
                <input id="fn" required value={form.firstName} onChange={set('firstName')} className={input} />
              </div>
              <div>
                <label htmlFor="ln" className="mb-1 block text-sm font-medium text-gray-700">Last name</label>
                <input id="ln" required value={form.lastName} onChange={set('lastName')} className={input} />
              </div>
            </div>

            <div>
              <label htmlFor="em" className="mb-1 block text-sm font-medium text-gray-700">Email (optional)</label>
              <input id="em" type="email" value={form.email} onChange={set('email')} className={input} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="dob" className="mb-1 block text-sm font-medium text-gray-700">Born</label>
                <input id="dob" type="date" required value={form.dateOfBirth} onChange={set('dateOfBirth')} className={input} />
              </div>
              <div>
                <label htmlFor="g" className="mb-1 block text-sm font-medium text-gray-700">Gender</label>
                <select id="g" value={form.gender} onChange={set('gender')} className={input}>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
              </div>
              <div>
                <label htmlFor="w" className="mb-1 block text-sm font-medium text-gray-700">Weight kg</label>
                <input id="w" type="number" step="0.1" min="1" value={form.weight} onChange={set('weight')} className={input} />
              </div>
            </div>

            <div>
              <label htmlFor="club" className="mb-1 block text-sm font-medium text-gray-700">Club (optional)</label>
              <input id="club" value={form.club} onChange={set('club')} className={input} />
            </div>

            <button
              type="submit"
              disabled={submitting || !competitionId}
              className="w-full rounded-md bg-[#0a3a7a] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0c4690] disabled:opacity-50"
            >
              {submitting ? 'Registering…' : 'Register athlete'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
