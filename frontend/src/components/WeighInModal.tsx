import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import { projectIjfCategory, type Gender, type IjfProjection } from '@/lib/ijf';

// Loose shape — accepts the dashboard's Competitor type plus anything
// similar (only fields used by the modal are required).
interface CompetitorLite {
  id: string;
  firstName: string;
  lastName: string;
  club: string;
  dateOfBirth: string;
  gender: string;
  weight: number | string | null;
  registrationStatus: string;
  projection?: IjfProjection;
}

interface Props {
  competitor: CompetitorLite;
  competitionDate: string;
  onClose: () => void;
  onWeighIn: (weight: number) => void;
  onDisqualify: () => void;
  isPending: boolean;
}

// Weigh-in interaction is a single decision point that drives one of three
// outcomes (record + same class, record + bump, disqualify). The modal makes
// each outcome visible BEFORE confirming so the organizer doesn't accidentally
// move someone into the wrong category.
export function WeighInModal({
  competitor,
  competitionDate,
  onClose,
  onWeighIn,
  onDisqualify,
  isPending,
}: Props) {
  const [weightInput, setWeightInput] = useState(
    competitor.weight ? String(competitor.weight) : '',
  );

  // Re-seed the input whenever the modal opens for a different competitor.
  useEffect(() => {
    setWeightInput(competitor.weight ? String(competitor.weight) : '');
  }, [competitor.id, competitor.weight]);

  const previewProjection = useMemo(() => {
    const w = parseFloat(weightInput);
    if (!Number.isFinite(w) || w <= 0) return null;
    const dob = new Date(competitor.dateOfBirth);
    if (Number.isNaN(dob.getTime())) return null;
    return projectIjfCategory(
      dob,
      competitor.gender as Gender,
      w,
      new Date(competitionDate),
    );
  }, [weightInput, competitor.dateOfBirth, competitor.gender, competitionDate]);

  const currentProjection = competitor.projection ?? null;
  const isBump =
    previewProjection &&
    currentProjection &&
    previewProjection.weightLabel !== null &&
    currentProjection.weightLabel !== null &&
    previewProjection.weightLabel !== currentProjection.weightLabel;

  const validWeight = previewProjection !== null;
  const fullName = `${competitor.lastName.toUpperCase()} ${competitor.firstName}`;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const w = parseFloat(weightInput);
    if (!Number.isFinite(w) || w <= 0) return;
    onWeighIn(w);
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 pt-5 pb-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-400">Weigh-in</p>
            <h2 className="text-xl font-bold text-gray-900 mt-0.5">{fullName}</h2>
            {competitor.club && (
              <p className="text-sm text-gray-500 mt-0.5">{competitor.club}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-4">
          <div>
            <label htmlFor="weight" className="block text-sm font-medium text-gray-700 mb-1">
              Actual weight (kg)
            </label>
            <input
              id="weight"
              type="number"
              step="0.1"
              min="1"
              max="500"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              autoFocus
              required
              className="w-full px-4 py-3 text-2xl font-bold tabular-nums border-2 border-gray-300 rounded-lg focus:outline-none focus:border-gray-900 transition-colors"
            />
            {currentProjection?.weightLabel && (
              <p className="text-xs text-gray-500 mt-1">
                Registered weight: {competitor.weight}kg
                {' · '}
                Original class: {currentProjection.weightLabel}
              </p>
            )}
          </div>

          {previewProjection && (
            <div
              className={`p-3 rounded-lg border ${
                isBump
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-blue-50 border-blue-200'
              }`}
            >
              {isBump ? (
                <div>
                  <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
                    <AlertTriangle size={16} />
                    Bump required
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm font-mono">
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 line-through">
                      {currentProjection?.weightLabel}
                    </span>
                    <ArrowRight size={14} className="text-amber-700" />
                    <span className="px-2 py-0.5 rounded bg-amber-200 text-amber-900 font-bold">
                      {previewProjection.weightLabel}
                    </span>
                  </div>
                  <p className="text-xs text-amber-800 mt-2">
                    Will be assigned to{' '}
                    <span className="font-mono">{previewProjection.categoryName}</span>
                  </p>
                </div>
              ) : (
                <div className="text-sm text-blue-900">
                  Class:{' '}
                  <span className="font-mono font-semibold">
                    {previewProjection.categoryName ?? 'no matching IJF class'}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2 pt-2">
            <button
              type="submit"
              disabled={!validWeight || isPending}
              className="w-full py-3 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isPending
                ? 'Recording...'
                : isBump
                  ? 'Confirm bump and weigh-in'
                  : 'Confirm weigh-in'}
            </button>
            <button
              type="button"
              onClick={onDisqualify}
              disabled={isPending}
              className="w-full py-2.5 bg-white border border-red-300 text-red-700 font-medium rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors text-sm"
            >
              Disqualify (refused weigh-in / over all classes)
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
