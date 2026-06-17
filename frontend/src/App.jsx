import React, { useState, useEffect } from 'react';

function App() {
  // Global App States
  const [user, setUser] = useState(null); // Keeps track of logged-in user session
  const [vehicles, setVehicles] = useState([]);
  
  // Auth Form States
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  
  // Vehicle Form States
  const [name, setName] = useState('');
  const [regNumber, setRegNumber] = useState('');
  const [odometer, setOdometer] = useState('');
  const [nextServiceOdo, setNextServiceOdo] = useState('');
  const [formError, setFormError] = useState('');

  const BACKEND_URL = 'http://127.0.0.1:5000/api';

  // Fetch only this logged-in user's vehicles
  const fetchVehicles = async (userId) => {
    try {
      const response = await fetch(`${BACKEND_URL}/vehicles?user_id=${userId}`);
      const data = await response.json();
      if (response.ok) setVehicles(data);
    } catch (err) {
      console.error("Network sync broken:", err);
    }
  };

  // Handle Authentication (Login / Sign Up)
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    // Front-End Form Validation Checklist
    if (authUsername.trim().length < 3) {
      setFormError("Username entry must contain at least 3 characters.");
      return;
    }
    if (authPassword.length < 6) {
      setFormError("Security password must be at least 6 characters long.");
      return;
    }

    const endpoint = isRegisterMode ? 'register' : 'login';
    try {
      const res = await fetch(`${BACKEND_URL}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword })
      });
      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || "Authentication failed.");
      } else {
        alert(data.message);
        if (!isRegisterMode) {
          setUser(data.user); // Save logged in user details
          fetchVehicles(data.user.id);
        } else {
          setIsRegisterMode(false); // Send to login screen after sign-up
        }
        setAuthUsername('');
        setAuthPassword('');
      }
    } catch (err) {
      setFormError("Cannot establish a server connection.");
    }
  };

  // Handle Vehicle Addition with Client-side validation checks
  const handleAddVehicle = async (e) => {
    e.preventDefault();
    setFormError('');

    // Regex Validation for License Plates (Simple standard validation check)
    const plateRegex = /^[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{4}$/; 
    // Example: KL35A0211, DL03CA1234 (No spaces/hyphens allowed for neat data management)
    if (!plateRegex.test(regNumber.trim().toUpperCase())) {
      setFormError("Please enter a valid format standard plate layout without spaces (e.g., KL35A0211)");
      return;
    }

    if (parseInt(odometer) < 0) {
      setFormError("Mileage counts cannot be structured as negative quantities.");
      return;
    }
    if (parseInt(nextServiceOdo) <= parseInt(odometer)) {
      setFormError("The target maintenance inspection point must exceed current mileage markers.");
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/vehicles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          name,
          reg_number: regNumber.toUpperCase(),
          odometer: parseInt(odometer),
          next_service_odo: parseInt(nextServiceOdo)
        })
      });
      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error);
      } else {
        setName('');
        setRegNumber('');
        setOdometer('');
        setNextServiceOdo('');
        fetchVehicles(user.id);
      }
    } catch (err) {
      setFormError("Failed to store structural data records downstream.");
    }
  };

  const handleDelete = async (vehicleId) => {
    if (window.confirm("Confirm permanent deletion of database asset profile?")) {
      await fetch(`${BACKEND_URL}/vehicles/${vehicleId}?user_id=${user.id}`, { method: 'DELETE' });
      fetchVehicles(user.id);
    }
  };

  // --- RENDERING VIEWS ---

  // User Not Logged In -> Render Authentication Layout Screen
  if (!user) {
    return (
      <div style={{ maxWidth: '400px', margin: '100px auto', padding: '30px', border: '1px solid #ddd', borderRadius: '12px', fontFamily: 'sans-serif', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        <h2 style={{ textAlign: 'center', color: '#007bff' }}>🚗 FleetKeep Login</h2>
        <p style={{ textAlign: 'center', color: '#666' }}>{isRegisterMode ? 'Create your garage account' : 'Access your dashboard workspace'}</p>
        
        {formError && <div style={{ color: 'white', backgroundColor: '#dc3545', padding: '10px', borderRadius: '4px', marginBottom: '15px', fontSize: '0.9rem' }}>{formError}</div>}
        
        <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <input type="text" placeholder="Username" value={authUsername} onChange={(e) => setAuthUsername(e.target.value)} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }} required />
          <input type="password" placeholder="Password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ccc' }} required />
          <button type="submit" style={{ background: '#007bff', color: '#fff', border: 'none', padding: '12px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
            {isRegisterMode ? 'Sign Up' : 'Log In'}
          </button>
        </form>
        <p onClick={() => { setIsRegisterMode(!isRegisterMode); setFormError(''); }} style={{ marginTop: '20px', textAlign: 'center', color: '#007bff', cursor: 'pointer', fontSize: '0.9rem' }}>
          {isRegisterMode ? 'Already have an account? Sign In' : 'New user? Create a profile here'}
        </p>
      </div>
    );
  }

  // User Logged In -> Render Fleet Dashboard Layout Screen
  return (
    <div style={{ padding: '25px', fontFamily: 'Segoe UI, sans-serif', maxWidth: '1000px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'between', alignItems: 'center', borderBottom: '3px solid #007bff', paddingBottom: '15px', marginBottom: '25px' }}>
        <div>
          <h1 style={{ margin: 0, color: '#007bff' }}>⚙️ FleetKeep Secure Garage</h1>
          <p style={{ margin: 0, color: '#555' }}>Active Account Space: <strong>@{user.username}</strong></p>
        </div>
        <button onClick={() => { setUser(null); setVehicles([]); }} style={{ marginLeft: 'auto', background: '#6c757d', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Logout</button>
      </header>

      {formError && <div style={{ color: 'white', backgroundColor: '#dc3545', padding: '10px', borderRadius: '4px', marginBottom: '25px' }}>{formError}</div>}

      <section style={{ background: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '30px' }}>
        <h3 style={{ marginTop: 0 }}>Log Fresh Log Entry</h3>
        <form onSubmit={handleAddVehicle} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <input type="text" placeholder="Model Name (e.g., Sumo)" value={name} onChange={(e) => setName(e.target.value)} style={{ padding: '8px', flex: 1 }} required />
          <input type="text" placeholder="License Plate (KL35A0211)" value={regNumber} onChange={(e) => setRegNumber(e.target.value)} style={{ padding: '8px', flex: 1 }} required />
          <input type="number" placeholder="Odometer Reading (km)" value={odometer} onChange={(e) => setOdometer(e.target.value)} style={{ padding: '8px', flex: 1 }} required />
          <input type="number" placeholder="Target Service Metric (km)" value={nextServiceOdo} onChange={(e) => setNextServiceOdo(e.target.value)} style={{ padding: '8px', flex: 1 }} required />
          <button type="submit" style={{ background: '#28a745', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>Add Vehicle</button>
        </form>
      </section>

      <section>
        <h3>Registered Garage Profiles ({vehicles.length})</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {vehicles.map(v => {
            const kmLeft = v.next_service_odo - v.odometer;
            const criticalAlert = kmLeft <= 500;
            return (
              <div key={v.id} style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '8px', position: 'relative', borderLeft: criticalAlert ? '6px solid #dc3545' : '6px solid #28a745' }}>
                <h4>{v.name} <span style={{ fontSize: '0.85em', color: '#777' }}>[{v.reg_number}]</span></h4>
                <p>Odometer Metric: <strong>{v.odometer} km</strong></p>
                <p>Service Threshold: {v.next_service_odo} km</p>
                <div style={{ background: criticalAlert ? '#dc3545' : '#17a2b8', color: '#fff', padding: '6px', textAlign: 'center', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.85rem' }}>
                  {kmLeft > 0 ? `🔧 ${kmLeft} km until checkup` : `⚠️ Overdue by ${Math.abs(kmLeft)} km!`}
                </div>
                <button onClick={() => handleDelete(v.id)} style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer' }}>❌</button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default App;