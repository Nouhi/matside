import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { UserPlus, X } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';

interface ApprovedCoach {
  coachUserId: string;
  name: string;
  email: string;
  addedAt: string;
}

/**
 * Organizer panel: approve coaches (by email) to register athletes into this
 * competition, and revoke access. Add is enumeration-safe server-side — the
 * response is identical whether the email is a registered coach or not, so the
 * UI shows a neutral confirmation either way rather than "no such user".
 */
export function CoachesTab({ competitionId }: { competitionId: string }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');

  const { data: coaches = [], isLoading } = useQuery<ApprovedCoach[]>({
    queryKey: ['coaches', competitionId],
    queryFn: () => api.get(`/competitions/${competitionId}/coaches`),
  });

  const add = useMutation({
    mutationFn: (e: string) =>
      api.post<{ added: boolean }>(`/competitions/${competitionId}/coaches`, { email: e }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['coaches', competitionId] });
      setEmail('');
      // Enumeration-safe: don't reveal whether the email had an account.
      toast(
        res.added
          ? 'Coach added'
          : "If that email belongs to a coach, they've been added.",
        'success',
      );
    },
    onError: (err: Error) => toast(err.message),
  });

  const remove = useMutation({
    mutationFn: ({ coachUserId }: { coachUserId: string; email: string }) =>
      api.delete(`/competitions/${competitionId}/coaches/${coachUserId}`),
    onSuccess: (_res, { email }) => {
      queryClient.invalidateQueries({ queryKey: ['coaches', competitionId] });
      // Revoke is recoverable: Undo re-approves the same coach by email.
      toast('Coach removed', 'success', {
        action: { label: 'Undo', onClick: () => add.mutate(email) },
      });
    },
    onError: (err: Error) => toast(err.message),
  });

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (email.trim()) add.mutate(email.trim());
  }

  return (
    <div className="p-6">
      <form onSubmit={handleAdd} className="mb-6 flex flex-wrap gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="coach@club.com"
          aria-label="Coach email"
          className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#0a3a7a]"
        />
        <button
          type="submit"
          disabled={add.isPending}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#0a3a7a] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0c4690] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a3a7a] focus-visible:ring-offset-2 disabled:opacity-50"
        >
          <UserPlus size={16} />
          Add coach
        </button>
      </form>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading coaches…</p>
      ) : coaches.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No coaches added yet"
          context="Add a coach by email to let them register their club's athletes into this competition."
        />
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200" role="list">
          {coaches.map((c) => (
            <li key={c.coachUserId} className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-900">{c.name || c.email}</p>
                {c.name && <p className="truncate text-sm text-gray-500">{c.email}</p>}
              </div>
              <button
                onClick={() => remove.mutate({ coachUserId: c.coachUserId, email: c.email })}
                disabled={remove.isPending}
                aria-label={`Remove ${c.email}`}
                className="inline-flex min-h-[44px] items-center gap-1 rounded px-3 text-xs font-medium text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"
              >
                <X size={14} />
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
