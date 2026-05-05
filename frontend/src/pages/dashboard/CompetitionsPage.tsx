import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Plus, MapPin, Calendar } from 'lucide-react';

interface Competition {
  id: string;
  name: string;
  date: string;
  location: string;
  status: string;
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  REGISTRATION: 'bg-blue-100 text-blue-700',
  WEIGH_IN: 'bg-amber-100 text-amber-700',
  ACTIVE: 'bg-green-100 text-green-700',
  COMPLETED: 'bg-slate-100 text-slate-700',
};

export function CompetitionsPage() {
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const queryClient = useQueryClient();

  const { data: competitions = [], isLoading } = useQuery<Competition[]>({
    queryKey: ['competitions'],
    queryFn: () => api.get('/competitions'),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; date: string; location: string }) =>
      api.post('/competitions', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['competitions'] });
      setShowForm(false);
      setFormName('');
      setFormDate('');
      setFormLocation('');
    },
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate({ name: formName, date: formDate, location: formLocation });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading competitions...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Competitions</h1>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          <Plus size={16} />
          Create Competition
        </button>
      </div>

      {showForm && (
        <div className="mb-6 p-6 bg-white rounded-lg border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">New Competition</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label htmlFor="comp-name" className="block text-sm font-medium text-gray-700 mb-1">
                Name
              </label>
              <input
                id="comp-name"
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="comp-date" className="block text-sm font-medium text-gray-700 mb-1">
                  Date
                </label>
                <input
                  id="comp-date"
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="comp-location" className="block text-sm font-medium text-gray-700 mb-1">
                  Location
                </label>
                <input
                  id="comp-location"
                  type="text"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {createMutation.isPending ? 'Creating...' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {competitions.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-500 mb-4">No competitions yet</p>
          <button
            onClick={() => setShowForm(true)}
            className="text-sm font-medium text-gray-900 hover:underline"
          >
            Create your first competition
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {competitions.map((comp) => (
            <Link
              key={comp.id}
              to={`/dashboard/competitions/${comp.id}`}
              className="block p-5 bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{comp.name}</h3>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar size={14} />
                      {new Date(comp.date).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin size={14} />
                      {comp.location}
                    </span>
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    STATUS_STYLES[comp.status] || STATUS_STYLES.DRAFT
                  }`}
                >
                  {comp.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
