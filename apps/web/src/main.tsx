import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthGate } from './components/AuthGate';
import { SetupGate } from './components/SetupGate';
import { ThemePreferenceProvider } from './components/ThemePreferenceProvider';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemePreferenceProvider>
        <BrowserRouter>
          <AuthGate>
            <SetupGate>
              <App />
            </SetupGate>
          </AuthGate>
        </BrowserRouter>
      </ThemePreferenceProvider>
    </QueryClientProvider>
  </StrictMode>,
);
