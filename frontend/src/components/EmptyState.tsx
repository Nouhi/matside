import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  /** One sentence of context — what this area is for, what to do next. */
  context?: string;
  /** Optional primary action. Renders an IJF-blue button. */
  action?: { label: string; onClick: () => void };
}

/**
 * Warm empty state: a title, a sentence of context, and an optional primary
 * action — never a bare "No items found." A coach's day-one screen is empty,
 * so this is the first impression; it must point at the obvious next step
 * rather than read as broken. Also retrofitted onto the organizer empties that
 * previously used bare gray text.
 */
export function EmptyState({ icon: Icon, title, context, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {Icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
          <Icon size={24} />
        </div>
      )}
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {context && (
        <p className="mt-1 max-w-sm text-sm text-gray-500">{context}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-5 inline-flex items-center rounded-md bg-[#0a3a7a] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0c4690]"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
