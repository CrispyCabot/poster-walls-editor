import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router';
import './styles.css';
import { applyTheme } from './theme/config.js';
import { AuthProvider } from './auth/AuthProvider.js';
import { Masthead } from './components/Masthead.js';
import { RequireAuth } from './components/RequireAuth.js';
import { Callback } from './routes/Callback.js';
import { Home } from './routes/Home.js';
import { Project } from './routes/Project.js';
import { Projects } from './routes/Projects.js';

// Sets data-theme on <html>. Change ACTIVE_THEME in theme/config.ts to swap.
applyTheme();

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The token refreshes in the background; a failed request is far more
      // likely to be a real error than something a retry will fix.
      retry: 1,
      staleTime: 30_000,
    },
  },
});

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <Masthead />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/callback" element={<Callback />} />
            <Route
              path="/projects"
              element={
                <RequireAuth>
                  <Projects />
                </RequireAuth>
              }
            />
            {/* Not gated: public projects open for signed-out visitors. The
                page reads isOwner from the API and offers editing only then. */}
            <Route path="/projects/:id" element={<Project />} />
          </Routes>
        </QueryClientProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
