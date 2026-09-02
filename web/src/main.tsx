import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { I18nProvider } from './i18n';
import HomePage from './pages/Home';
/*
 * The room page is the biggest one: only people who join a room download it.
 * The wrapper is what lets the home warm that chunk before it navigates, so
 * the way in can be one move instead of a blank frame (see room-route.tsx).
 */
import RoomRoute from './pages/room-route';
import RouteMeta from './seo/RouteMeta';
/*
 * The desktop app's window has no system title bar: this draws it. In a
 * browser it renders nothing — see components/TitleBar.tsx.
 */
import TitleBar from './components/TitleBar';
/*
 * Imported before the app renders on purpose: the browser fires its install
 * event early and only once, and the listener that catches it is installed
 * when this module is (see lib/pwa.ts).
 */
import { registerServiceWorker } from './lib/pwa';
import './styles.css';
// After styles.css: the hero names have to win any tie with the sheets they
// name, and they are the last word on how a screen change moves.
import './hero.css';

/**
 * The lazy fallback cannot use the i18n hook — it renders while the route
 * chunk is still loading, and it is a blank flash either way.
 */
function RouteFallback() {
  return <main className="centered" />;
}

// Content pages: they should not weigh on the bundle of someone creating a room.
const CommunityPage = lazy(() => import('./pages/Community'));
const HowItWorksPage = lazy(() => import('./pages/HowItWorks'));

// What makes the browser offer to install at all. It declines itself in dev
// and inside the desktop shell, so this is safe to call unconditionally.
registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <RouteMeta />
        <TitleBar />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/r/:slug" element={<RoomRoute />} />
            <Route path="/community" element={<CommunityPage />} />
            <Route path="/how-it-works" element={<HowItWorksPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </I18nProvider>
  </React.StrictMode>,
);
