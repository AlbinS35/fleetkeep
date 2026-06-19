// host_shell/src/App.jsx
// Root application: routing between Landing → Auth → Fleet (federated)
import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { logoutUser, selectUser } from './store/authSlice';
import { resetVehicles } from './store/vehicleSlice';
import LandingPage from './components/LandingPage';
import AuthGate    from './components/AuthGate';
import FleetShell  from './containers/FleetShell';

export default function App() {
  const dispatch = useDispatch();
  const user     = useSelector(selectUser);

  const [hasSeenLanding, setHasSeenLanding] = useState(
    () => localStorage.getItem('fleetkeep_seen_landing') === 'true'
  );
  const [authMode, setAuthMode] = useState('login');

  // On logout: reset vehicle state + go back to landing
  useEffect(() => {
    if (!user) {
      dispatch(resetVehicles());
      setHasSeenLanding(false);
    }
  }, [user, dispatch]);

  const handleLogout = () => dispatch(logoutUser());

  // Authenticated: show federated fleet panel
  if (user) return <FleetShell />;

  // Pre-auth: landing page
  if (!hasSeenLanding) {
    return (
      <LandingPage
        onNavigateToAuth={() => { setHasSeenLanding(true); setAuthMode('login'); localStorage.setItem('fleetkeep_seen_landing', 'true'); }}
        onNavigateToSignup={() => { setHasSeenLanding(true); setAuthMode('signup'); localStorage.setItem('fleetkeep_seen_landing', 'true'); }}
      />
    );
  }

  return (
    <AuthGate
      initialMode={authMode}
      onBack={() => { setHasSeenLanding(false); localStorage.removeItem('fleetkeep_seen_landing'); }}
    />
  );
}
