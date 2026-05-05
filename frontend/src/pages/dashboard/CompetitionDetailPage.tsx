import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { MapPin, Calendar, Users, Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface Competition {
  id: string;
  name: string;
  date: string;
  location: string;
  status: string;
}

interface Competitor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth: string;
  gender: string;
  weight: number;
  belt: string;
  club: string;
  status: string;
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  REGISTRATION: 'bg-blue-100 text-blue-700',
  WEIGH_IN: 'bg-amber-100 text-amber-700',
  ACTIVE: 'bg-green-100 text-green-700',
  COMPLETED: 'bg-slate-100 text-slate-700',
};

const STATUS_FLOW = ['DRAFT', 'REGISTRATION', 'WEIGH_IN', 'ACTIVE', 'COMPLETED'];

export function CompetitionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  const { data: competition, isLoading: loadingComp } = useQuery<Competition>({
    queryKey: ['competition', id],
    queryFn: () => api.get(`/competitions/${id}`),
  });

  const { data: competitors = [], isLoading: loadingCompetitors } = useQuery<Competitor[]>({
    queryKey: ['competitors', id],
    queryFn: () => api.get(`/competitions/${id}/competitors`),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => api.patch(`/competitions/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competition', id] });
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
    },
  });

  function getNextStatus(current: string): string | null {
    const idx = STATUS_FLOW.indexOf(current);
    if (idx === -1 || idx === STATUS_FLOW.length - 1) return null;
    return STATUS_FLOW[idx + 1];
  }

  function copyRegistrationLink() {
    const url = `${window.location.origin}/dashboard/competitions/${id}/register`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loadingComp) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!competition) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Competition not found</div>
      </div>
    );
  }

  const nextStatus = getNextStatus(competition.status);

  return (
    <div>
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{competition.name}</h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Calendar size={14} />
                {new Date(competition.date).toLocaleDateString()}
              </span>
              <span className="flex items-center gap-1">
                <MapPin size={14} />
                {competition.location}
              </span>
              <span className="flex items-center gap-1">
                <Users size={14} />
                {competitors.length} competitors
              </span>
            </div>
          </div>
          <span
            className={`self-start px-3 py-1.5 rounded-full text-xs font-medium ${
              STATUS_STYLES[competition.status] || STATUS_STYLES.DRAFT
            }`}
          >
            {competition.status}
          </span>
        </div>

        <div className="flex flex-wrap gap-3 mt-6">
          {nextStatus && (
            <button
              onClick={() => statusMutation.mutate(nextStatus)}
              disabled={statusMutation.isPending}
              className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {statusMutation.isPending ? 'Updating...' : `Advance to ${nextStatus}`}
            </button>
          )}
          <button
            onClick={copyRegistrationLink}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Share Registration Link'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Registered Competitors ({competitors.length})
          </h2>
        </div>

        {loadingCompetitors ? (
          <div className="p-6 text-center text-gray-500">Loading competitors...</div>
        ) : competitors.length === 0 ? (
          <div className="p-6 text-center text-gray-500">No competitors registered yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Name</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Email</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Club</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Weight</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Belt</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Gender</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {competitors.map((c) => (
                  <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900">
                      {c.firstName} {c.lastName}
                    </td>
                    <td className="px-6 py-3 text-gray-600">{c.email}</td>
                    <td className="px-6 py-3 text-gray-600">{c.club}</td>
                    <td className="px-6 py-3 text-gray-600">{c.weight} kg</td>
                    <td className="px-6 py-3 text-gray-600">{c.belt}</td>
                    <td className="px-6 py-3 text-gray-600">{c.gender}</td>
                    <td className="px-6 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        {c.status || 'REGISTERED'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
