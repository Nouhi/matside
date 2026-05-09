import { useOutletContext, Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Check, Share2, Swords, ListOrdered, Calendar } from 'lucide-react';
import { api } from '@/lib/api';

interface Competition {
  id: string;
  name: string;
  status: string;
  competitorCount: number;
  categoryCount: number;
  matCount: number;
}

interface MatSchedule {
  id: string;
  number: number;
  currentMatch: { id: string; category: { name: string }; competitor1: { lastName: string } | null; competitor2: { lastName: string } | null } | null;
  nextMatches: { id: string }[];
}

export function PublicOverview() {
  const { id } = useParams<{ id: string }>();
  const { competition } = useOutletContext<{ competition: Competition }>();
  const [copied, setCopied] = useState(false);

  // Show a summary of what's happening live (only when ACTIVE).
  const { data: mats = [] } = useQuery<MatSchedule[]>({
    queryKey: ['public-schedule', id],
    queryFn: () => api.get(`/public/competitions/${id}/schedule`),
    refetchInterval: 15_000,
    enabled: competition.status === 'ACTIVE',
  });

  const liveMats = mats.filter((m) => m.currentMatch);

  function copyLink() {
    void navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Share this page</h2>
            <p className="text-sm text-gray-500 mt-1">
              Anyone with the link can follow brackets, the schedule, and live results.
            </p>
          </div>
          <button
            onClick={copyLink}
            className="inline-flex items-center gap-2 px-3 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 transition-colors shrink-0"
          >
            {copied ? <Check size={16} /> : <Share2 size={16} />}
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      </section>

      {competition.status === 'ACTIVE' && liveMats.length > 0 && (
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="text-base font-semibold text-gray-900">Live now</h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {liveMats.map((mat) => (
              <div key={mat.id} className="border border-gray-200 rounded-md p-3">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                  Mat {mat.number} · {mat.currentMatch?.category.name}
                </p>
                <p className="mt-1 text-sm font-semibold text-gray-900 truncate">
                  {mat.currentMatch?.competitor1?.lastName ?? 'TBD'}
                  <span className="text-gray-400 mx-2">vs</span>
                  {mat.currentMatch?.competitor2?.lastName ?? 'TBD'}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid sm:grid-cols-3 gap-3">
        <SummaryCard
          to={`/c/${id}/brackets`}
          icon={<Swords size={18} />}
          label="Brackets"
          value={competition.categoryCount}
          sub="categories"
        />
        <SummaryCard
          to={`/c/${id}/schedule`}
          icon={<Calendar size={18} />}
          label="Schedule"
          value={competition.matCount}
          sub="mats running"
        />
        <SummaryCard
          to={`/c/${id}/results`}
          icon={<ListOrdered size={18} />}
          label="Results"
          value={competition.competitorCount}
          sub="competitors"
        />
      </section>
    </div>
  );
}

function SummaryCard({
  to,
  icon,
  label,
  value,
  sub,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
}) {
  return (
    <Link
      to={to}
      className="group bg-white border border-gray-200 rounded-lg p-5 hover:border-gray-400 hover:shadow-sm transition-all"
    >
      <div className="flex items-center gap-2 text-gray-400 group-hover:text-gray-600">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-3 text-3xl font-bold text-gray-900 tabular-nums">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{sub}</p>
    </Link>
  );
}

