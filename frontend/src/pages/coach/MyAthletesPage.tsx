import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Users, Loader } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { RegisterAthleteModal } from './RegisterAthleteModal';

interface MyAthlete {
  id: string;
  firstName: string;
  lastName: string;
  club: string;
  registrationStatus: 'REGISTERED' | 'WEIGHED_IN' | 'WITHDRAWN';
  competition: { id: string; name: string; date: string; status: string };
  category: { id: string; name: string } | null;
  projection: { ageGroup: string; weightLabel: string | null } | null;
}

const STATUS_PILL: Record<MyAthlete['registrationStatus'], { label: string; cls: string }> = {
  REGISTERED: { label: 'Registered', cls: 'bg-blue-100 text-blue-700' },
  WEIGHED_IN: { label: 'Weighed in', cls: 'bg-green-100 text-green-700' },
  WITHDRAWN: { label: 'Withdrawn', cls: 'bg-red-100 text-red-700' },
};

// One line of context per athlete: their division when known, plus the
// competition's phase. Answers a coach's "where is my kid?" at a glance.
function contextLine(a: MyAthlete): string {
  const division =
    a.category?.name ??
    (a.projection?.weightLabel
      ? `${a.projection.ageGroup} ${a.projection.weightLabel}`
      : 'No division yet');
  const phase =
    a.competition.status === 'ACTIVE'
      ? 'In progress'
      : a.competition.status === 'COMPLETED'
        ? 'Finished'
        : a.competition.status === 'WEIGH_IN'
          ? 'Weigh-in'
          : 'Registration';
  return `${division} · ${phase}`;
}

export function MyAthletesPage() {
  const queryClient = useQueryClient();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [eventFilter, setEventFilter] = useState<string>('ALL');

  const { data, isLoading, error } = useQuery<MyAthlete[]>({
    queryKey: ['my-athletes'],
    queryFn: () => api.get('/coach/athletes'),
    refetchInterval: 10000,
  });

  const withdraw = useMutation({
    mutationFn: (id: string) => api.patch(`/coach/competitors/${id}/withdraw`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-athletes'] });
      toast('Athlete withdrawn', 'success');
    },
    onError: (err: Error) => toast(err.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-gray-500">
        <Loader size={16} className="mr-2 animate-spin" /> Loading your athletes…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-sm text-red-600">
        Couldn't load your athletes — {(error as Error).message}
      </div>
    );
  }

  const athletes = data ?? [];

  // Event filter chips, built from the events the coach actually has athletes in.
  const events = Array.from(
    new Map(athletes.map((a) => [a.competition.id, a.competition.name])).entries(),
  );
  const shown =
    eventFilter === 'ALL'
      ? athletes
      : athletes.filter((a) => a.competition.id === eventFilter);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Athletes</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {athletes.length} registered across {events.length} event
            {events.length === 1 ? '' : 's'}
          </p>
        </div>
        {athletes.length > 0 && (
          <button
            onClick={() => setRegisterOpen(true)}
            className="inline-flex items-center rounded-md bg-[#0a3a7a] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0c4690]"
          >
            + Register athletes
          </button>
        )}
      </div>

      {athletes.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white">
          <EmptyState
            icon={Users}
            title="No athletes registered yet"
            context="Register your club's athletes into an open competition to track their weigh-in, bracket, and results here."
            action={{ label: '+ Register athletes', onClick: () => setRegisterOpen(true) }}
          />
        </div>
      ) : (
        <>
          {events.length > 1 && (
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter by event">
              {[['ALL', 'All events'] as const, ...events].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setEventFilter(id)}
                  className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    eventFilter === id
                      ? 'bg-[#0a3a7a] text-white'
                      : 'border border-gray-200 bg-white text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          <ul className="space-y-2" role="list">
            {shown.map((a) => {
              const pill = STATUS_PILL[a.registrationStatus];
              const dim = a.registrationStatus === 'WITHDRAWN';
              return (
                <li
                  key={a.id}
                  aria-label={`${a.lastName} ${a.firstName}, ${a.competition.name}, ${pill.label}`}
                  className={`rounded-lg border border-gray-200 bg-white p-4 ${dim ? 'opacity-60' : ''}`}
                >
                  {/* Desktop: row. Mobile (<sm): stacks into a card. */}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-base font-bold uppercase tracking-wide text-gray-900">
                        {a.lastName} {a.firstName}
                      </p>
                      <p className="mt-0.5 text-sm text-gray-500">
                        {a.competition.name} · {new Date(a.competition.date).toLocaleDateString()}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-400">{contextLine(a)}</p>
                      {a.club && <p className="mt-0.5 text-xs text-gray-400">{a.club}</p>}
                    </div>
                    <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${pill.cls}`}
                      >
                        {pill.label}
                      </span>
                      {a.registrationStatus !== 'WITHDRAWN' &&
                        a.competition.status === 'REGISTRATION' && (
                          <button
                            onClick={() => withdraw.mutate(a.id)}
                            disabled={withdraw.isPending}
                            className="rounded px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            Withdraw
                          </button>
                        )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {registerOpen && (
        <RegisterAthleteModal
          onClose={() => setRegisterOpen(false)}
          onRegistered={() => {
            queryClient.invalidateQueries({ queryKey: ['my-athletes'] });
            setRegisterOpen(false);
          }}
        />
      )}
    </div>
  );
}
