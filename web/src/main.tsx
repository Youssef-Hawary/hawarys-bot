import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import { api, connectLive, disconnectLive } from './api.ts';
import { Background } from './components/Background.tsx';
import { Shell, type Me } from './components/Shell.tsx';
import { ToastProvider } from './components/ui.tsx';
import { Login } from './pages/Login.tsx';
import { Overview } from './pages/Overview.tsx';
import { Board } from './pages/Board.tsx';
import { Offers } from './pages/Offers.tsx';
import { Pricing } from './pages/Pricing.tsx';
import { AutoChat } from './pages/AutoChat.tsx';
import { Earnings } from './pages/Earnings.tsx';
import { Analytics } from './pages/Analytics.tsx';
import { Team } from './pages/Team.tsx';
import { Buyers } from './pages/Buyers.tsx';
import { Activity } from './pages/Activity.tsx';
import { SettingsPage } from './pages/Settings.tsx';

function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  useEffect(() => {
    api<Me>('/auth/me').then(setMe).catch(() => setMe(null));
    const out = () => { setMe(null); disconnectLive(); };
    window.addEventListener('hb:logout', out);
    return () => window.removeEventListener('hb:logout', out);
  }, []);
  useEffect(() => { if (me) connectLive(); }, [me]);

  if (me === undefined) return <div className="grid min-h-screen place-items-center"><div className="h-10 w-10 animate-spin rounded-full border-2 border-neon border-t-transparent" /></div>;
  if (!me) return <Login onDone={() => api<Me>('/auth/me').then(setMe)} />;

  const owner = me.role === 'owner';
  return (
    <Shell me={me}>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/board" element={<Board />} />
        <Route path="/offers" element={<Offers />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/chat" element={<AutoChat />} />
        <Route path="/earnings" element={<Earnings />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/buyers" element={<Buyers />} />
        <Route path="/activity" element={<Activity />} />
        {owner && <Route path="/team" element={<Team />} />}
        {owner && <Route path="/settings" element={<SettingsPage />} />}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Shell>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <Background />
        <App />
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
