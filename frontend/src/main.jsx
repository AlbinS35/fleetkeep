import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { GarageProvider, useGarage } from './assets/context/GarageContext.jsx';
import AuthGate from './assets/components/AuthGate.jsx';
import Dashboard from './assets/components/Dashboard.jsx';
import LandingPage from './assets/components/LandingPage.jsx';
import './index.css';

function MainLayoutContainer() {
  const { user } = useGarage();
  const [hasSeenLanding, setHasSeenLanding] = useState(() => {
    return localStorage.getItem('fleetkeep_seen_landing') === 'true';
  });
  const [authMode, setAuthMode] = useState('login');

  useEffect(() => {
    if (!user && !hasSeenLanding) {
      localStorage.setItem('fleetkeep_seen_landing', 'true');
    }
  }, [user, hasSeenLanding]);

  if (user) {
    return <Dashboard />;
  }

  if (!hasSeenLanding) {
    return (
      <LandingPage
        onNavigateToAuth={() => {
          setHasSeenLanding(true);
          setAuthMode('login');
        }}
        onNavigateToSignup={() => {
          setHasSeenLanding(true);
          setAuthMode('signup');
        }}
      />
    );
  }

  return <AuthGate initialMode={authMode} />;
}

export default function App() {
  return (
    <GarageProvider>
      <MainLayoutContainer />
    </GarageProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);