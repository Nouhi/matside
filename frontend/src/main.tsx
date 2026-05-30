import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
} from '@tanstack/react-query';
import './index.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { toast } from './lib/toast';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
  // Surface query failures that would otherwise be silent — but only on the
  // initial load (no cached data yet). Background refetches under the app's
  // 5s polling stay quiet so a flaky connection can't spam toasts while
  // stale data is still on screen.
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.state.data !== undefined) return;
      toast(
        error instanceof Error ? error.message : 'Something went wrong',
        'error',
      );
    },
  }),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
