import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CoachesTab } from '@/components/CoachesTab';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/lib/toast', () => ({ toast: vi.fn() }));

function renderTab() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <CoachesTab competitionId="comp-1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue([]);
});

describe('CoachesTab', () => {
  it('shows the empty state when no coaches are approved', async () => {
    renderTab();
    expect(await screen.findByText('No coaches added yet')).toBeInTheDocument();
  });

  // The enumeration-safety the backend was designed for must survive in the UI:
  // when the server says added:false (unknown OR wrong-role email) the organizer
  // must see the neutral copy, never a definitive "added" / "no such user".
  it('shows the neutral enumeration-safe toast when the server returns added:false', async () => {
    vi.mocked(api.post).mockResolvedValue({ added: false });
    renderTab();
    fireEvent.change(screen.getByLabelText('Coach email'), {
      target: { value: 'nobody@x.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add coach/i }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        "If that email belongs to a coach, they've been added.",
        'success',
      ),
    );
  });

  it('shows the definitive "Coach added" toast when the server returns added:true', async () => {
    vi.mocked(api.post).mockResolvedValue({ added: true });
    renderTab();
    fireEvent.change(screen.getByLabelText('Coach email'), {
      target: { value: 'real-coach@club.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /add coach/i }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('Coach added', 'success'),
    );
  });

  it('renders approved coaches and revokes one', async () => {
    vi.mocked(api.get).mockResolvedValue([
      { coachUserId: 'c1', name: 'Jane Coach', email: 'jane@club.com', addedAt: '2026-06-01' },
    ]);
    vi.mocked(api.delete).mockResolvedValue({ removed: true });
    renderTab();
    expect(await screen.findByText('Jane Coach')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /remove jane@club.com/i }));
    await waitFor(() =>
      expect(api.delete).toHaveBeenCalledWith('/competitions/comp-1/coaches/c1'),
    );
  });

  // Revoke must be recoverable: the success toast carries an Undo action that
  // re-approves the same coach by email (re-POSTs to the add endpoint).
  it('offers an Undo on revoke that re-approves the coach by email', async () => {
    vi.mocked(api.get).mockResolvedValue([
      { coachUserId: 'c1', name: 'Jane Coach', email: 'jane@club.com', addedAt: '2026-06-01' },
    ]);
    vi.mocked(api.delete).mockResolvedValue({ removed: true });
    vi.mocked(api.post).mockResolvedValue({ added: true });
    renderTab();
    await screen.findByText('Jane Coach');
    fireEvent.click(screen.getByRole('button', { name: /remove jane@club.com/i }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        'Coach removed',
        'success',
        expect.objectContaining({
          action: expect.objectContaining({ label: 'Undo' }),
        }),
      ),
    );

    // Invoke the Undo action and assert it re-approves jane@club.com.
    const call = vi.mocked(toast).mock.calls.find((c) => c[0] === 'Coach removed');
    const action = (call?.[2] as { action: { onClick: () => void } }).action;
    action.onClick();
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/competitions/comp-1/coaches', {
        email: 'jane@club.com',
      }),
    );
  });
});
