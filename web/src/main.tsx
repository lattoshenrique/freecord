import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from './i18n';
import HomePage from './pages/Home';
import './styles.css';

/**
 * The lazy fallback cannot use the i18n hook — it renders while the route
 * chunk is still loading, and it is a blank flash either way.
 */
function RouteFallback() {
  return <main className="centered" />;
}

// The room page is the biggest one: only people who join a room download it.
const RoomPage = lazy(() => import('./pages/RoomPage'));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/r/:slug" element={<RoomPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </I18nProvider>
  </React.StrictMode>,
);
