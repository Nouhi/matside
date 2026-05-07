import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { MapPin, Calendar, Users, Copy, Check, Layers, Swords } from 'lucide-react';
import { useState } from 'react';
import { BracketView } from '@/components/BracketView';
import { StandingsTab } from '@/components/StandingsTab';

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
  matId?: string | null;
  mat?: { id: string; number: number } | null;
  _count?: { competitors: number };
}

interface BracketSummary {
  categoryId: string;
  categoryName: string;
  competitorCount: number;
  bracketType: string;
  matchCount: number;
}

interface MatCategoryRef {
  id: string;
  name: string;
  _count: { competitors: number };
}

interface Mat {
  id: string;
  number: number;
  pin: string;
  currentMatchId: string | null;
  categories?: MatCategoryRef[];
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
  const [activeTab, setActiveTab] = useState<'competitors' | 'categories' | 'brackets' | 'mats' | 'standings'>('competitors');

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

  const { data: mats = [] } = useQuery<Mat[]>({
    queryKey: ['mats', id],
    queryFn: () => api.get(`/competitions/${id}/mats`),
    enabled: activeTab === 'mats' || activeTab === 'categories',
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => api.patch(`/competitions/${id}`, { status }),
    onSuccess: (_data, status) => {
      queryClient.invalidateQueries({ queryKey: ['competition', id] });
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
      toast(`Status updated to ${status}`, 'success');
    },
    onError: (err: Error) => toast(err.message),
  });

  const weighInMutation = useMutation({
    mutationFn: (competitorId: string) =>
      api.patch(`/competitions/${id}/competitors/${competitorId}/status`, { status: 'WEIGHED_IN' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competitors', id] });
      toast('Weigh-in confirmed', 'success');
    },
    onError: (err: Error) => toast(err.message),
  });

  const updateWeightMutation = useMutation({
    mutationFn: ({ competitorId, weight }: { competitorId: string; weight: number }) =>
      api.patch(`/competitions/${id}/competitors/${competitorId}/weight`, { weight }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competitors', id] });
      toast('Weight updated', 'success');
    },
    onError: (err: Error) => toast(err.message),
  });

  const withdrawMutation = useMutation({
    mutationFn: (competitorId: string) =>
      api.patch(`/competitions/${id}/competitors/${competitorId}/withdraw`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competitors', id] });
      toast('Competitor withdrawn', 'success');
    },
    onError: (err: Error) => toast(err.message),
  });

  const generateCategoriesMutation = useMutation({
    mutationFn: () => api.post(`/competitions/${id}/categories/generate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', id] });
      toast('Categories generated', 'success');
    },
    onError: (err: Error) => toast(err.message),
  });

  const generateBracketsMutation = useMutation({
    mutationFn: () => api.post<BracketSummary[]>(`/competitions/${id}/brackets/generate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', id] });
      queryClient.invalidateQueries({ queryKey: ['brackets', id] });
      setActiveTab('brackets');
      toast('Brackets generated', 'success');
    },
    onError: (err: Error) => toast(err.message),
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
    return <div className="flex items-center justify-center h-64 text-gray-500">Loading competition...</div>;
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
            {(['competitors', 'categories', 'brackets', 'mats', 'standings'] as const).map((tab) => (
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
                {tab === 'mats' && `Mats (${mats.length})`}
                {tab === 'standings' && 'Standings'}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === 'competitors' && (
          <CompetitorsTab
            competitors={competitors}
            isWeighIn={isWeighIn}
            onWeighIn={(cId) => weighInMutation.mutate(cId)}
            onUpdateWeight={(cId, w) => updateWeightMutation.mutate({ competitorId: cId, weight: w })}
            onWithdraw={(cId) => withdrawMutation.mutate(cId)}
            weighInPending={weighInMutation.isPending}
          />
        )}

        {activeTab === 'categories' && (
          <CategoriesTab competitionId={id!} categories={categories} mats={mats} />
        )}

        {activeTab === 'brackets' && (
          <BracketView categories={brackets} />
        )}

        {activeTab === 'mats' && (
          <MatsTab competitionId={id!} mats={mats} />
        )}

        {activeTab === 'standings' && (
          <StandingsTab competitionId={id!} />
        )}
      </div>
    </div>
  );
}

function CompetitorsTab({
  competitors,
  isWeighIn,
  onWeighIn,
  onUpdateWeight,
  onWithdraw,
  weighInPending,
}: {
  competitors: Competitor[];
  isWeighIn: boolean;
  onWeighIn: (id: string) => void;
  onUpdateWeight: (id: string, weight: number) => void;
  onWithdraw: (id: string) => void;
  weighInPending: boolean;
}) {
  const [editingWeight, setEditingWeight] = useState<string | null>(null);
  const [weightValue, setWeightValue] = useState('');

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
            {isWeighIn && <th className="text-left px-6 py-3 font-medium text-gray-500">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {competitors.map((c) => (
            <tr key={c.id} className={`border-b border-gray-100 hover:bg-gray-50 ${c.registrationStatus === 'WITHDRAWN' ? 'opacity-50' : ''}`}>
              <td className="px-6 py-3 font-medium text-gray-900">{c.firstName} {c.lastName}</td>
              <td className="px-6 py-3 text-gray-600">{c.club}</td>
              <td className="px-6 py-3 text-gray-600">
                {isWeighIn && editingWeight === c.id ? (
                  <form
                    className="flex items-center gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const w = parseFloat(weightValue);
                      if (w > 0) {
                        onUpdateWeight(c.id, w);
                        setEditingWeight(null);
                      }
                    }}
                  >
                    <input
                      type="number"
                      step="0.1"
                      min="1"
                      max="500"
                      value={weightValue}
                      onChange={(e) => setWeightValue(e.target.value)}
                      className="w-20 px-2 py-1 text-xs border border-gray-300 rounded"
                      autoFocus
                    />
                    <button type="submit" className="px-2 py-1 text-xs bg-gray-900 text-white rounded hover:bg-gray-800">Save</button>
                    <button type="button" onClick={() => setEditingWeight(null)} className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                  </form>
                ) : (
                  <span
                    className={isWeighIn && c.registrationStatus !== 'WITHDRAWN' ? 'cursor-pointer hover:underline' : ''}
                    onClick={() => {
                      if (isWeighIn && c.registrationStatus !== 'WITHDRAWN') {
                        setEditingWeight(c.id);
                        setWeightValue(String(c.weight ?? ''));
                      }
                    }}
                  >
                    {c.weight} kg
                  </span>
                )}
              </td>
              <td className="px-6 py-3 text-gray-600">{c.gender}</td>
              <td className="px-6 py-3 text-gray-600">{c.belt.replace(/_/g, ' ')}</td>
              <td className="px-6 py-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${REG_STATUS_STYLES[c.registrationStatus] || 'bg-gray-100 text-gray-700'}`}>
                  {c.registrationStatus}
                </span>
              </td>
              {isWeighIn && (
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2">
                    {c.registrationStatus === 'REGISTERED' && (
                      <button
                        onClick={() => onWeighIn(c.id)}
                        disabled={weighInPending}
                        className="px-3 py-1 bg-amber-100 text-amber-700 rounded text-xs font-medium hover:bg-amber-200 transition-colors"
                      >
                        Confirm Weigh-in
                      </button>
                    )}
                    {c.registrationStatus !== 'WITHDRAWN' && (
                      <button
                        onClick={() => onWithdraw(c.id)}
                        className="px-3 py-1 bg-red-50 text-red-600 rounded text-xs font-medium hover:bg-red-100 transition-colors"
                      >
                        Withdraw
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CategoriesTab({
  competitionId,
  categories,
  mats,
}: {
  competitionId: string;
  categories: Category[];
  mats: Mat[];
}) {
  const queryClient = useQueryClient();

  const overrideMatMutation = useMutation({
    mutationFn: ({ categoryId, matId }: { categoryId: string; matId: string | null }) =>
      api.patch(`/categories/${categoryId}/mat`, { matId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', competitionId] });
      queryClient.invalidateQueries({ queryKey: ['mats', competitionId] });
      toast('Mat assignment updated', 'success');
    },
    onError: (err: Error) => toast(err.message),
  });

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
        <div key={cat.id} className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900">{cat.name}</p>
            <p className="text-sm text-gray-500 mt-0.5">
              {BRACKET_LABELS[cat.bracketType] || cat.bracketType} · {cat._count?.competitors ?? cat.competitors?.length ?? 0} competitors
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <select
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white"
              value={cat.matId ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                overrideMatMutation.mutate({
                  categoryId: cat.id,
                  matId: value === '' ? null : value,
                });
              }}
              disabled={mats.length === 0 || overrideMatMutation.isPending}
            >
              <option value="">Unassigned</option>
              {mats.map((m) => (
                <option key={m.id} value={m.id}>Mat {m.number}</option>
              ))}
            </select>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              cat.bracketType === 'ROUND_ROBIN' ? 'bg-purple-100 text-purple-700' :
              cat.bracketType === 'SINGLE_REPECHAGE' ? 'bg-orange-100 text-orange-700' :
              'bg-red-100 text-red-700'
            }`}>
              {BRACKET_LABELS[cat.bracketType] || cat.bracketType}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

interface AvailableMatch {
  id: string;
  round: number;
  poolPosition: number;
  status: string;
  category: { id: string; name: string };
  competitor1?: { firstName: string; lastName: string };
  competitor2?: { firstName: string; lastName: string };
}

function MatsTab({ competitionId, mats }: { competitionId: string; mats: Mat[] }) {
  const queryClient = useQueryClient();
  const [matCount, setMatCount] = useState(2);

  const { data: matchBrackets = [] } = useQuery<Category[]>({
    queryKey: ['mat-matches', competitionId],
    queryFn: () => api.get(`/competitions/${competitionId}/brackets`),
  });

  const scheduledMatches: AvailableMatch[] = matchBrackets.flatMap((cat) =>
    (cat.matches ?? [])
      .filter((m) => m.status === 'SCHEDULED' && m.competitor1 && m.competitor2)
      .map((m) => ({
        id: m.id,
        round: m.round,
        poolPosition: m.poolPosition,
        status: m.status,
        category: { id: cat.id, name: cat.name },
        competitor1: m.competitor1 ?? undefined,
        competitor2: m.competitor2 ?? undefined,
      }))
  );

  // Build a lookup of category -> mat assignment so we can filter the dropdown
  const categoryToMat = new Map<string, string | null>();
  for (const cat of matchBrackets) {
    categoryToMat.set(cat.id, cat.matId ?? null);
  }

  const createMatsMutation = useMutation({
    mutationFn: (count: number) => api.post(`/competitions/${competitionId}/mats`, { count }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mats', competitionId] });
      toast('Mats created', 'success');
    },
    onError: (err: Error) => toast(err.message),
  });

  const assignMutation = useMutation({
    mutationFn: ({ matId, matchId }: { matId: string; matchId: string }) =>
      api.patch(`/mats/${matId}/assign`, { matchId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mats', competitionId] });
      toast('Match assigned', 'success');
    },
    onError: (err: Error) => toast(err.message),
  });

  const autoAssignMutation = useMutation({
    mutationFn: () => api.post(`/competitions/${competitionId}/categories/assign-mats`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mats', competitionId] });
      queryClient.invalidateQueries({ queryKey: ['categories', competitionId] });
      queryClient.invalidateQueries({ queryKey: ['brackets', competitionId] });
      queryClient.invalidateQueries({ queryKey: ['mat-matches', competitionId] });
      toast('Categories balanced across mats', 'success');
    },
    onError: (err: Error) => toast(err.message),
  });

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          type="number"
          min={1}
          max={20}
          value={matCount}
          onChange={(e) => setMatCount(parseInt(e.target.value) || 1)}
          className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
        <button
          onClick={() => createMatsMutation.mutate(matCount)}
          disabled={createMatsMutation.isPending}
          className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
        >
          {createMatsMutation.isPending ? 'Creating...' : 'Create Mats'}
        </button>
        <button
          onClick={() => autoAssignMutation.mutate()}
          disabled={autoAssignMutation.isPending || mats.length === 0}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          title="Distribute categories across mats by competitor count"
        >
          {autoAssignMutation.isPending ? 'Balancing...' : 'Auto-assign Categories'}
        </button>
      </div>

      {mats.length === 0 && (
        <p className="text-gray-500 text-sm">No mats created yet</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {mats.map((mat) => {
          const matCategoryIds = new Set((mat.categories ?? []).map((c) => c.id));
          const eligibleMatches = scheduledMatches.filter((m) => {
            // Show matches in categories assigned to this mat. If the category
            // hasn't been assigned to any mat yet, fall back to showing it.
            const assignedMat = categoryToMat.get(m.category.id);
            if (assignedMat === null || assignedMat === undefined) return true;
            return matCategoryIds.has(m.category.id);
          });
          const totalCompetitors = (mat.categories ?? []).reduce(
            (sum, c) => sum + (c._count?.competitors ?? 0),
            0,
          );

          return (
            <div key={mat.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-900">Mat {mat.number}</h3>
                <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-600">
                  PIN: {mat.pin}
                </span>
              </div>

              {(mat.categories?.length ?? 0) > 0 && (
                <div className="mb-3 flex flex-wrap gap-1">
                  {(mat.categories ?? []).map((c) => (
                    <span
                      key={c.id}
                      className="text-[11px] font-medium bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 rounded-full"
                    >
                      {c.name} · {c._count?.competitors ?? 0}
                    </span>
                  ))}
                  <span className="text-[11px] text-gray-500 px-2 py-0.5">
                    Σ {totalCompetitors} competitors
                  </span>
                </div>
              )}

              <div className="mb-3">
                {mat.currentMatchId ? (
                  <div className="text-sm">
                    <span className="text-green-700 font-medium">Match assigned</span>
                    <span className="text-gray-400 text-xs ml-2">{mat.currentMatchId.slice(0, 8)}...</span>
                  </div>
                ) : (
                  <select
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        assignMutation.mutate({ matId: mat.id, matchId: e.target.value });
                      }
                    }}
                  >
                    <option value="">
                      {eligibleMatches.length === 0 ? 'No matches for this mat' : 'Assign a match...'}
                    </option>
                    {eligibleMatches.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.category.name} R{m.round}: {m.competitor1?.lastName ?? '?'} vs {m.competitor2?.lastName ?? '?'}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex gap-2">
                <Link
                  to={`/mat/${mat.id}/display`}
                  target="_blank"
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-xs font-medium hover:bg-gray-200 transition-colors"
                >
                  Display View
                </Link>
                <Link
                  to={`/mat/${mat.id}/control`}
                  target="_blank"
                  className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded text-xs font-medium hover:bg-blue-200 transition-colors"
                >
                  Control View
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

