import { createContext, useContext, useState, useEffect } from 'react';

const GarageContext = createContext();

export function GarageProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('garage_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [vehicles, setVehicles] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const API_BASE = 'http://127.0.0.1:5000/api';

  useEffect(() => {
    if (user) {
      fetchVehicles();
    } else {
      setVehicles([]);
    }
  }, [user]);

  const fetchVehicles = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/vehicles?user_id=${user.id}`);
      const data = await res.json();
      if (res.ok) setVehicles(data);
    } catch (err) {
      setError('Failed to sync telemetry data.');
    } finally {
      setLoading(false);
    }
  };

  const loginUser = async (username, password) => {
    setError('');
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        localStorage.setItem('garage_user', JSON.stringify(data.user));
        return true;
      } else {
        setError(data.error || 'Authentication rejected.');
        return false;
      }
    } catch (err) {
      setError('Database link offline.');
      return false;
    }
  };

  const registerUser = async (username, password) => {
    setError('');
    try {
      const res = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        return true;
      } else {
        setError(data.error || 'Registration failed.');
        return false;
      }
    } catch (err) {
      setError('Registration server error.');
      return false;
    }
  };

  const logoutUser = () => {
    setUser(null);
    localStorage.removeItem('garage_user');
    localStorage.removeItem('fleetkeep_seen_landing');
  };

  const addVehicle = async (vehicleData) => {
    setError('');
    try {
      const res = await fetch(`${API_BASE}/vehicles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...vehicleData, user_id: user.id })
      });
      const data = await res.json();
      if (res.ok) {
        fetchVehicles();
        return true;
      } else {
        setError(data.error || 'Validation error while logging asset.');
        return false;
      }
    } catch (err) {
      setError('Failed to communicate with active ledger database.');
      return false;
    }
  };

  const updateUserProfile = async (profileData) => {
    if (!user) return false;

    setError('');
    try {
      const res = await fetch(`${API_BASE}/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData)
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data.user);
        localStorage.setItem('garage_user', JSON.stringify(data.user));
        return true;
      }

      setError(data.error || 'Profile update failed.');
      return false;
    } catch (err) {
      setError('Failed to synchronize personal details.');
      return false;
    }
  };

  const updateVehicle = async (id, vehicleData) => {
    if (!user) return false;

    setError('');
    try {
      const res = await fetch(`${API_BASE}/vehicles/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...vehicleData, user_id: user.id })
      });
      const data = await res.json();
      if (res.ok) {
        fetchVehicles();
        return true;
      }

      setError(data.error || 'Vehicle update failed.');
      return false;
    } catch (err) {
      setError('Failed to synchronize vehicle details.');
      return false;
    }
  };

  const decommissionVehicle = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/vehicles/${id}?user_id=${user.id}`, {
        method: 'DELETE'
      });
      if (res.ok) fetchVehicles();
    } catch (err) {
      setError('Decommission operation aborted by server.');
    }
  };

  return (
    <GarageContext.Provider value={{ user, vehicles, error, loading, loginUser, registerUser, logoutUser, addVehicle, updateUserProfile, updateVehicle, decommissionVehicle }}>
      {children}
    </GarageContext.Provider>
  );
}

export const useGarage = () => useContext(GarageContext);