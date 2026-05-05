import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { MapPin, Calendar, Users, Copy, Check, Layers, Swords } from 'lucide-react';
import { useState } from 'react';
import { BracketView } from '@/components/BracketView';

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
  registrationStatus: string;
}

interface Match {
  id: string;
  round: number;
  poolPosition: number;
  status: string;
  competitor1?: { firstName: string; lastName: string };
  competitor2?: { firstName: string; lastName: string };
  winner?: { firstName: string; lastName: string };
  winMethod?: string;
}

interface Category {
  id: string;
  name: string;
  gender: string;
  ageGroup: string;
  bracketType: string;
  competitors: Competitor[];
  matches: Match[];
  _count?: { competitors: number };
}

interface BracketSummary {
  categoryId: string;
  categoryName: string;
  competitorCount: number;
  bracketType: string;
  matchCount: number;
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  REGISTRATION: 'bg-blue-100 text-blue-700',
  WEIGH_IN: 'bg-amber-100 text-amber-700',
  ACTIVE: 'bg-green-100 text-green-700',
  COMPLETED: 'bg-slate-100 text-slate-700',
};

const BRACKET_LABELS: Record<string, string> = {
  ROUND_ROBIN: 'Round Robin',
  SINGLE_REPECHAGE: 'Single Repechage',
  DOUBLE_REPECHAGE: 'Double Repechage',
};

const STATUS_FLOW = ['DRAFT', 'REGISTRATION', 'WEIGH_IN', 'ACTIVE', 'COMPLETED'];

const REG_STATUS_STYLES: Record<string, string> = {
  REGISTERED: 'bg-blue-100 text-blue-700',
  WEIGHED_IN: 'bg-green-100 text-green-700',
  WITHDRAWN: 'bg-red-100 text-red-700',
};

export function CompetitionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'competitors' | 'categories' | 'brackets'>('competitors');

  const { data: competition, isLoading: loadingComp } = useQuery<Competition>({
    queryKey: ['competition', id],
    queryFn: () => api.get(`/competitions/${id}`),
  });

  const { data: competitors = [] } = useQuery<Competitor[]>({
    queryKey: ['competitors', id],
    queryFn: () => api.get(`/competitions/${id}/competitors`),
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories', id],
    queryFn: () => api.get(`/competitions/${id}/categories`),
  });

  const { data: brackets = [] } = useQuery<Category[]>({
    queryKey: ['brackets', id],
    queryFn: () => api.get(`/competitions/${id}/brackets`),
    enabled: activeTab === 'brackets',
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => api.patch(`/competitions/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competition', id] });
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
    },
  });

  const weighInMutation = useMutation({
    mutationFn: (competitorId: string) =>
      api.patch(`/competitions/${id}/competitors/${competitorId}/status`, { status: 'WEIGHED_IN' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['competitors', id] }),
  });

  const generateCategoriesMutation = useMutation({
    mutationFn: () => api.post(`/competitions/${id}/categories/generate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['categories', id] }),
  });

  const generateBracketsMutation = useMutation({
    mutationFn: () => api.post<BracketSummary[]>(`/competitions/${id}/brackets/generate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', id] });
      queryClient.invalidateQueries({ queryKey: ['brackets', id] });
      setActiveTab('brackets');
    },
  });

  function getNextStatus(current: string): string | null {
    const idx = STATUS_FLOW.indexOf(current);
    if (idx === -1 || idx === STATUS_FLOW.length - 1) return null;
    return STATUS_FLOW[idx + 1];
  }

  function copyRegistrationLink() {
    const url = `${window.location.origin}/competitions/${id}/register`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loadingComp) {
    return <div className="flex items-center justify-center h-64 text-gray-500">Loading...</div>;
  }

  if (!competition) {
    return <div className="flex items-center justify-center h-64 text-gray-500">Competition not found</div>;
  }

  const nextStatus = getNextStatus(competition.status);
  const isWeighIn = competition.status === 'WEIGH_IN';
  const canGenerateCategories = isWeighIn;
  const canGenerateBrackets = isWeighIn && categories.length > 0;
  const weighedInCount = competitors.filter(c => c.registrationStatus === 'WEIGHED_IN').length;

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
          <span className={`self-start px-3 py-1.5 rounded-full text-xs font-medium ${STATUS_STYLES[competition.status] || STATUS_STYLES.DRAFT}`}>
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
          {competition.status === 'REGISTRATION' && (
            <button
              onClick={copyRegistrationLink}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copied!' : 'Share Registration Link'}
            </button>
          )}
          {canGenerateCategories && (
            <button
              onClick={() => generateCategoriesMutation.mutate()}
              disabled={generateCategoriesMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Layers size={16} />
              {generateCategoriesMutation.isPending ? 'Generating...' : `Generate Categories (${weighedInCount} weighed in)`}
            </button>
          )}
          {canGenerateBrackets && (
            <button
              onClick={() => generateBracketsMutation.mutate()}
              disabled={generateBracketsMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-md text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              <Swords size={16} />
              {generateBracketsMutation.isPending ? 'Generating...' : 'Generate Brackets'}
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex">
            {(['competitors', 'categories', 'brackets'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'competitors' && `Competitors (${competitors.length})`}
                {tab === 'categories' && `Categories (${categories.length})`}
                {tab === 'brackets' && 'Brackets'}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === 'competitors' && (
          <CompetitorsTab
            competitors={competitors}
            isWeighIn={isWeighIn}
            onWeighIn={(cId) => weighInMutation.mutate(cId)}
            weighInPending={weighInMutation.isPending}
          />
        )}

        {activeTab === 'categories' && (
          <CategoriesTab categories={categories} />
        )}

        {activeTab === 'brackets' && (
          <BracketView categories={brackets} />
        )}
      </div>
    </div>
  );
}

function CompetitorsTab({
  competitors,
  isWeighIn,
  onWeighIn,
  weighInPending,
}: {
  competitors: Competitor[];
  isWeighIn: boolean;
  onWeighIn: (id: string) => void;
  weighInPending: boolean;
}) {
  if (competitors.length === 0) {
    return <div className="p-6 text-center text-gray-500">No competitors registered yet</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="text-left px-6 py-3 font-medium text-gray-500">Name</th>
            <th className="text-left px-6 py-3 font-medium text-gray-500">Club</th>
            <th className="text-left px-6 py-3 font-medium text-gray-500">Weight</th>
            <th className="text-left px-6 py-3 font-medium text-gray-500">Gender</th>
            <th className="text-left px-6 py-3 font-medium text-gray-500">Belt</th>
            <th className="text-left px-6 py-3 font-medium text-gray-500">Status</th>
            {isWeighIn && <th className="text-left px-6 py-3 font-medium text-gray-500">Action</th>}
          </tr>
        </thead>
        <tbody>
          {competitors.map((c) => (
            <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="px-6 py-3 font-medium text-gray-900">{c.firstName} {c.lastName}</td>
              <td className="px-6 py-3 text-gray-600">{c.club}</td>
              <td className="px-6 py-3 text-gray-600">{c.weight} kg</td>
              <td className="px-6 py-3 text-gray-600">{c.gender}</td>
              <td className="px-6 py-3 text-gray-600">{c.belt.replace(/_/g, ' ')}</td>
              <td className="px-6 py-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${REG_STATUS_STYLES[c.registrationStatus] || 'bg-gray-100 text-gray-700'}`}>
                  {c.registrationStatus}
                </span>
              </td>
              {isWeighIn && (
                <td className="px-6 py-3">
                  {c.registrationStatus === 'REGISTERED' && (
                    <button
                      onClick={() => onWeighIn(c.id)}
                      disabled={weighInPending}
                      className="px-3 py-1 bg-amber-100 text-amber-700 rounded text-xs font-medium hover:bg-amber-200 transition-colors"
                    >
                      Confirm Weigh-in
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CategoriesTab({ categories }: { categories: Category[] }) {
  if (categories.length === 0) {
    return (
      <div className="p-6 text-center text-gray-500">
        No categories generated yet. Advance to WEIGH_IN status and generate categories.
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {categories.map((cat) => (
        <div key={cat.id} className="px-6 py-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900">{cat.name}</p>
            <p className="text-sm text-gray-500 mt-0.5">
              {BRACKET_LABELS[cat.bracketType] || cat.bracketType} · {cat._count?.competitors ?? cat.competitors?.length ?? 0} competitors
            </p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
            cat.bracketType === 'ROUND_ROBIN' ? 'bg-purple-100 text-purple-700' :
            cat.bracketType === 'SINGLE_REPECHAGE' ? 'bg-orange-100 text-orange-700' :
            'bg-red-100 text-red-700'
          }`}>
            {BRACKET_LABELS[cat.bracketType] || cat.bracketType}
          </span>
        </div>
      ))}
    </div>
  );
}

