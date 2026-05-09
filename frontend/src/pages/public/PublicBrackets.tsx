import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { BracketView } from '@/components/BracketView';

interface PublicCategory {
  id: string;
  name: string;
  gender: string;
  ageGroup: string;
  bracketType: string;
  minWeight?: number;
  maxWeight?: number;
  competitors: { id: string; firstName: string; lastName: string }[];
  matches: {
    id: string;
    round: number;
    poolPosition: number;
    status: string;
    competitor1?: { id: string; firstName: string; lastName: string } | null;
    competitor2?: { id: string; firstName: string; lastName: string } | null;
    winner?: { id: string; firstName: string; lastName: string } | null;
    winMethod?: string | null;
    phase?: string | null;
    poolGroup?: string | null;
  }[];
}

export function PublicBrackets() {
  const { id } = useParams<{ id: string }>();
  const { data: categories = [], isLoading } = useQuery<PublicCategory[]>({
    queryKey: ['public-brackets', id],
    queryFn: () => api.get(`/public/competitions/${id}/brackets`),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center text-gray-500">
        Loading brackets…
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
        <p className="text-gray-500">Brackets haven&rsquo;t been generated yet.</p>
        <p className="text-xs text-gray-400 mt-2">Check back once weigh-in is complete.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <BracketView categories={categories} />
    </div>
  );
}
