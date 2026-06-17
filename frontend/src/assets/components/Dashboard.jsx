import { useEffect, useState } from 'react';
import { useGarage } from '../context/GarageContext';

const emptyVehicleForm = {
  brand: '',
  name: '',
  reg_number: '',
  model_year: '',
  fuel_type: 'ICE',
  odometer: '',
  next_service_odo: '',
  rc_expiry: '',
  insurance_expiry: '',
  fitness_expiry: '',
  pollution_expiry: ''
};

/** Convert YYYY-MM-DD → DD-MM-YYYY for display */
const formatDate = (dateStr) => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || 'Not set';
  const [y, m, d] = dateStr.split('-');
  return `${d}-${m}-${y}`;
};

/** Compute a 0–100 Vehicle Health Score */
const computeHealthScore = (vehicle) => {
  let score = 0;
  let maxScore = 0;

  // Service health (40 points) — based on km remaining until next service
  maxScore += 40;
  const remaining = vehicle.next_service_odo - vehicle.odometer;
  if (remaining <= 0) {
    score += 0;
  } else {
    const ratio = Math.min(remaining / 2000, 1);
    score += Math.round(ratio * 40);
  }

  // Document health — each document contributes points based on expiry status
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const checkDoc = (dateStr, points) => {
    maxScore += points;
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      score += Math.round(points * 0.5); // No date set → neutral
      return;
    }
    const expiry = new Date(dateStr);
    expiry.setHours(0, 0, 0, 0);
    const days = Math.floor((expiry - today) / 86400000);
    if (days < 0) score += 0;           // Expired → 0
    else if (days <= 30) score += Math.round(points * 0.5); // Expiring soon → half
    else score += points;               // Valid → full
  };

  checkDoc(vehicle.rc_expiry, 20);
  checkDoc(vehicle.insurance_expiry, 20);
  checkDoc(vehicle.fitness_expiry, 10);
  if (vehicle.fuel_type === 'ICE') {
    checkDoc(vehicle.pollution_expiry, 10);
  }

  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

  if (pct >= 80) return { score: pct, label: 'Excellent', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.25)' };
  if (pct >= 60) return { score: pct, label: 'Good', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.12)', border: 'rgba(56, 189, 248, 0.25)' };
  if (pct >= 40) return { score: pct, label: 'Fair', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.25)' };
  return { score: pct, label: 'Needs Attention', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.25)' };
};

export default function Dashboard() {
  const { user, vehicles, error, loading, logoutUser, addVehicle, updateUserProfile, updateVehicle, decommissionVehicle } = useGarage();

  const [profileUsername, setProfileUsername] = useState(user?.username || '');
  const [profilePassword, setProfilePassword] = useState('');
  const [profileNotice, setProfileNotice] = useState('');
  const [profileError, setProfileError] = useState('');

  const [vehicleForm, setVehicleForm] = useState(emptyVehicleForm);
  const [editingVehicleId, setEditingVehicleId] = useState(null);
  const [localError, setLocalError] = useState('');
  const [showPersonalDetailsPanel, setShowPersonalDetailsPanel] = useState(false);

  useEffect(() => {
    setProfileUsername(user?.username || '');
    setProfilePassword('');
    setProfileNotice('');
    setProfileError('');
  }, [user]);

  useEffect(() => {
    if (!editingVehicleId) {
      setVehicleForm(emptyVehicleForm);
      return;
    }
    const v = vehicles.find((vehicle) => vehicle.id === editingVehicleId);
    if (v) {
      setVehicleForm({
        name: v.name || '',
        brand: v.brand || '',
        reg_number: v.reg_number || '',
        model_year: v.model_year ? String(v.model_year) : '',
        fuel_type: v.fuel_type || 'ICE',
        odometer: v.odometer !== undefined ? String(v.odometer) : '',
        next_service_odo: v.next_service_odo !== undefined ? String(v.next_service_odo) : '',
        rc_expiry: v.rc_expiry || '',
        insurance_expiry: v.insurance_expiry || '',
        fitness_expiry: v.fitness_expiry || '',
        pollution_expiry: v.pollution_expiry || ''
      });
    }
  }, [editingVehicleId, vehicles]);

  // ─── Date / Expiry helpers ───

  const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

  const getDaysUntilExpiry = (expiryDate) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    return Math.floor((expiry - today) / 86400000);
  };

  const getExpiryStatus = (expiryDate) => {
    const days = getDaysUntilExpiry(expiryDate);
    if (days < 0) return 'expired';
    if (days <= 30) return 'expiring';
    return 'valid';
  };

  const getExpiringDocuments = () => {
    const docs = [];
    vehicles.forEach((vehicle) => {
      const fields = [
        { label: 'RC', value: vehicle.rc_expiry, vehicleName: `${vehicle.brand} ${vehicle.name}` },
        { label: 'Insurance', value: vehicle.insurance_expiry, vehicleName: `${vehicle.brand} ${vehicle.name}` },
        { label: 'Fitness', value: vehicle.fitness_expiry, vehicleName: `${vehicle.brand} ${vehicle.name}` },
        vehicle.fuel_type === 'ICE' && { label: 'Pollution', value: vehicle.pollution_expiry, vehicleName: `${vehicle.brand} ${vehicle.name}` }
      ].filter(Boolean);

      fields.forEach((doc) => {
        if (doc.value && isIsoDate(doc.value)) {
          const status = getExpiryStatus(doc.value);
          if (status !== 'valid') {
            docs.push({ ...doc, days: getDaysUntilExpiry(doc.value), status });
          }
        }
      });
    });
    return docs;
  };

  // ─── User label ───

  const operatorLabel = user?.username ? user.username.split(/[\s._@-]+/)[0] || user.username : 'Operator';
  const operatorAvatar = operatorLabel.slice(0, 1).toUpperCase();

  // ─── Profile submit ───

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileError('');
    setProfileNotice('');

    if (profileUsername.trim().length < 3) {
      setProfileError('User ID must be at least 3 characters.');
      return;
    }
    if (profilePassword && profilePassword.length < 6) {
      setProfileError('Password must be at least 6 characters.');
      return;
    }

    const success = await updateUserProfile({
      username: profileUsername.trim(),
      password: profilePassword
    });

    if (success) {
      setProfilePassword('');
      setProfileNotice('Profile updated successfully.');
    } else {
      setProfileError('Failed to update profile. Please try again.');
    }
  };

  // ─── Vehicle form ───

  const handleVehicleChange = (field, value) => {
    setVehicleForm((prev) => ({ ...prev, [field]: value }));
  };

  const clearVehicleForm = () => {
    setVehicleForm(emptyVehicleForm);
    setEditingVehicleId(null);
  };

  const handleAddOrUpdateVehicle = async (e) => {
    e.preventDefault();
    setLocalError('');

    const plateRegex = /^[A-Z]{2}-\d{2}-[A-Z]{1,2}-\d{4}$/;
    if (!plateRegex.test(vehicleForm.reg_number.trim().toUpperCase())) {
      setLocalError('Invalid plate format. Use: KL-35-B-5678');
      return;
    }
    if (!vehicleForm.brand.trim()) {
      setLocalError('Vehicle brand is required.');
      return;
    }
    if (!vehicleForm.model_year || Number(vehicleForm.model_year) < 1900) {
      setLocalError('Model year must be a valid year.');
      return;
    }
    if (parseInt(vehicleForm.odometer, 10) < 0) {
      setLocalError('Odometer reading cannot be negative.');
      return;
    }
    if (parseInt(vehicleForm.next_service_odo, 10) <= parseInt(vehicleForm.odometer, 10)) {
      setLocalError('Next service milestone must exceed current odometer.');
      return;
    }

    for (const field of ['rc_expiry', 'insurance_expiry', 'fitness_expiry']) {
      if (!isIsoDate(vehicleForm[field])) {
        setLocalError('Document expiry dates are required (YYYY-MM-DD).');
        return;
      }
    }

    if (vehicleForm.fuel_type === 'ICE' && !vehicleForm.pollution_expiry) {
      setLocalError('Pollution certificate expiry is required for ICE vehicles.');
      return;
    }
    if (vehicleForm.fuel_type === 'ICE' && !isIsoDate(vehicleForm.pollution_expiry)) {
      setLocalError('Pollution expiry must be a valid date.');
      return;
    }

    const payload = {
      name: vehicleForm.name.trim(),
      brand: vehicleForm.brand.trim(),
      reg_number: vehicleForm.reg_number.trim().toUpperCase(),
      model_year: parseInt(vehicleForm.model_year, 10),
      fuel_type: vehicleForm.fuel_type,
      odometer: parseInt(vehicleForm.odometer, 10),
      next_service_odo: parseInt(vehicleForm.next_service_odo, 10),
      rc_expiry: vehicleForm.rc_expiry,
      insurance_expiry: vehicleForm.insurance_expiry,
      fitness_expiry: vehicleForm.fitness_expiry,
      pollution_expiry: vehicleForm.fuel_type === 'EV' ? '' : vehicleForm.pollution_expiry
    };

    const success = editingVehicleId
      ? await updateVehicle(editingVehicleId, payload)
      : await addVehicle(payload);

    if (success) clearVehicleForm();
  };

  // ─── Shared input style ───
  const inputStyle = { width: '100%', padding: '12px 14px', backgroundColor: '#020617', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '14px', color: '#f8fafc', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: '14px' };
  const labelStyle = { fontSize: '12px', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' };

  // ═══════════════════════════ RENDER ═══════════════════════════

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at top left, rgba(59, 130, 246, 0.14), transparent 30%), radial-gradient(circle at top right, rgba(14, 165, 233, 0.12), transparent 24%), linear-gradient(180deg, #06101d 0%, #0d1727 100%)', color: '#f8fafc', fontFamily: 'Inter, "Segoe UI", sans-serif' }}>

      {/* ─── Navbar ─── */}
      <nav style={{ backgroundColor: 'rgba(15, 23, 42, 0.82)', backdropFilter: 'blur(14px)', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(148, 163, 184, 0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ width: '42px', height: '42px', borderRadius: '14px', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)', color: '#eff6ff', fontWeight: 800 }}>FK</span>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.03em' }}>FleetKeep</div>
            <div style={{ color: '#94a3b8', fontSize: '13px' }}>Vehicle records, expiry tracking, and operator access</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Combined Welcome + Profile — single clickable element */}
          <button
            onClick={() => { setShowPersonalDetailsPanel(true); setProfileNotice(''); setProfileError(''); }}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px 8px 8px', borderRadius: '999px', backgroundColor: 'rgba(51, 65, 85, 0.75)', border: '1px solid rgba(148, 163, 184, 0.18)', cursor: 'pointer', transition: 'all 180ms ease', fontFamily: 'inherit', fontSize: '14px', color: '#cbd5e1' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(125, 211, 252, 0.4)'; e.currentTarget.style.boxShadow = '0 0 16px rgba(93, 211, 252, 0.15)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(148, 163, 184, 0.18)'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <span style={{ width: '32px', height: '32px', borderRadius: '999px', display: 'grid', placeItems: 'center', backgroundColor: '#0f172a', border: '1px solid rgba(148, 163, 184, 0.2)', color: '#93c5fd', fontWeight: 800, fontSize: '14px' }}>{operatorAvatar}</span>
            <strong style={{ color: '#f8fafc' }}>{operatorLabel}</strong>
          </button>
          <button onClick={logoutUser} style={{ backgroundColor: 'transparent', border: '1px solid rgba(248, 113, 113, 0.35)', color: '#fca5a5', fontWeight: 800, cursor: 'pointer', fontSize: '14px', padding: '10px 16px', borderRadius: '999px', fontFamily: 'inherit' }}>Logout</button>
        </div>
      </nav>

      <div style={{ maxWidth: '1320px', margin: '0 auto', padding: '32px 20px 48px' }}>

        {/* ─── Document Expiry Alerts ─── */}
        {getExpiringDocuments().length > 0 && (
          <div style={{ backgroundColor: 'rgba(127, 29, 29, 0.4)', border: '1px solid rgba(248, 113, 113, 0.35)', borderRadius: '22px', padding: '20px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
              <span style={{ fontSize: '20px', marginTop: '2px' }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: '0 0 12px 0', color: '#fecaca', fontSize: '16px' }}>Document Expiry Alert</h4>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {getExpiringDocuments().map((doc, idx) => (
                    <div key={idx} style={{ fontSize: '13px', color: '#f5d8d6' }}>
                      <strong>{doc.vehicleName}</strong> — {doc.label}{' '}
                      {doc.status === 'expired' ? `expired on ${formatDate(doc.value)}` : `expires in ${doc.days} day${doc.days !== 1 ? 's' : ''}`}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '28px' }}>

          {/* ─── LEFT: Vehicle Registration Form ─── */}
          <div style={{ display: 'grid', gap: '20px' }}>
            <form onSubmit={handleAddOrUpdateVehicle} style={{ backgroundColor: 'rgba(15, 23, 42, 0.82)', padding: '24px', borderRadius: '22px', border: '1px solid rgba(148, 163, 184, 0.16)', boxShadow: '0 24px 60px rgba(0, 0, 0, 0.22)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '12px', marginBottom: '8px' }}>
                <div>
                  <h3 style={{ margin: 0, color: '#f8fafc' }}>{editingVehicleId ? 'Update Vehicle Details' : 'Register Vehicle'}</h3>
                  <p style={{ margin: '6px 0 0 0', color: '#94a3b8', fontSize: '14px', lineHeight: 1.5 }}>Track registration, model data, and document expiries.</p>
                </div>
                {editingVehicleId && (
                  <button type="button" onClick={clearVehicleForm} style={{ background: 'transparent', border: '1px solid rgba(148, 163, 184, 0.2)', color: '#cbd5e1', borderRadius: '999px', padding: '8px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                )}
              </div>

              {(localError || error) && (
                <div style={{ padding: '12px 14px', borderRadius: '14px', marginBottom: '16px', backgroundColor: 'rgba(127, 29, 29, 0.5)', border: '1px solid rgba(248, 113, 113, 0.45)', color: '#fecaca', fontSize: '14px' }}>
                  {localError || error}
                </div>
              )}

              <div style={{ display: 'grid', gap: '14px' }}>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <label style={labelStyle}>Brand</label>
                  <input type="text" placeholder="e.g., Honda" value={vehicleForm.brand} onChange={(e) => handleVehicleChange('brand', e.target.value)} style={inputStyle} required />
                </div>

                <div style={{ display: 'grid', gap: '8px' }}>
                  <label style={labelStyle}>Vehicle Name / Model</label>
                  <input type="text" placeholder="e.g., Unicorn 160" value={vehicleForm.name} onChange={(e) => handleVehicleChange('name', e.target.value)} style={inputStyle} required />
                </div>

                <div style={{ display: 'grid', gap: '8px' }}>
                  <label style={labelStyle}>Registration Plate No.</label>
                  <input type="text" placeholder="e.g., KL-35-B-5678" value={vehicleForm.reg_number} onChange={(e) => handleVehicleChange('reg_number', e.target.value)} style={inputStyle} required />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    <label style={labelStyle}>Model Year</label>
                    <input type="number" placeholder="2024" value={vehicleForm.model_year} onChange={(e) => handleVehicleChange('model_year', e.target.value)} style={inputStyle} required />
                  </div>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    <label style={labelStyle}>Fuel Type</label>
                    <select value={vehicleForm.fuel_type} onChange={(e) => handleVehicleChange('fuel_type', e.target.value)} style={inputStyle}>
                      <option value="ICE">ICE</option>
                      <option value="EV">EV</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    <label style={labelStyle}>Current Odometer (km)</label>
                    <input type="number" placeholder="256" value={vehicleForm.odometer} onChange={(e) => handleVehicleChange('odometer', e.target.value)} style={inputStyle} required />
                  </div>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    <label style={labelStyle}>Next Service Milestone (km)</label>
                    <input type="number" placeholder="1000" value={vehicleForm.next_service_odo} onChange={(e) => handleVehicleChange('next_service_odo', e.target.value)} style={inputStyle} required />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    <label style={labelStyle}>RC Expiry</label>
                    <input type="date" value={vehicleForm.rc_expiry} onChange={(e) => handleVehicleChange('rc_expiry', e.target.value)} style={inputStyle} required />
                  </div>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    <label style={labelStyle}>Insurance Expiry</label>
                    <input type="date" value={vehicleForm.insurance_expiry} onChange={(e) => handleVehicleChange('insurance_expiry', e.target.value)} style={inputStyle} required />
                  </div>
                </div>

                <div style={{ display: 'grid', gap: '8px' }}>
                  <label style={labelStyle}>Fitness Expiry</label>
                  <input type="date" value={vehicleForm.fitness_expiry} onChange={(e) => handleVehicleChange('fitness_expiry', e.target.value)} style={inputStyle} required />
                </div>

                <div style={{ display: 'grid', gap: '8px' }}>
                  <label style={labelStyle}>Pollution Expiry {vehicleForm.fuel_type === 'EV' ? '(N/A for EV)' : ''}</label>
                  <input type="date" value={vehicleForm.pollution_expiry} onChange={(e) => handleVehicleChange('pollution_expiry', e.target.value)} disabled={vehicleForm.fuel_type === 'EV'} style={{ ...inputStyle, backgroundColor: vehicleForm.fuel_type === 'EV' ? '#0f172a' : '#020617', opacity: vehicleForm.fuel_type === 'EV' ? 0.55 : 1 }} />
                </div>
              </div>

              <button type="submit" style={{ width: '100%', marginTop: '20px', padding: '13px 16px', background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', color: 'white', border: 'none', borderRadius: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: '15px' }}>
                {editingVehicleId ? 'Update Vehicle Record' : 'Register Vehicle'}
              </button>
            </form>
          </div>

          {/* ─── RIGHT: Vehicle Cards ─── */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: '18px', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: '0 0 8px 0', color: '#f8fafc', fontSize: '24px' }}>Your Fleet</h3>
                <p style={{ margin: 0, color: '#94a3b8' }}>Vehicles registered under your account.</p>
              </div>
            </div>

            {loading ? (
              <p style={{ color: '#94a3b8' }}>Loading vehicles...</p>
            ) : vehicles.length === 0 ? (
              <div style={{ padding: '48px', textAlign: 'center', backgroundColor: 'rgba(15, 23, 42, 0.82)', borderRadius: '22px', border: '1px dashed rgba(148, 163, 184, 0.28)', color: '#94a3b8' }}>
                No vehicles registered yet. Use the form to add your first vehicle.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px' }}>
                {vehicles.map((vehicle) => {
                  const kmLeft = vehicle.next_service_odo - vehicle.odometer;
                  const health = computeHealthScore(vehicle);
                  const documentRows = [
                    ['RC', vehicle.rc_expiry],
                    ['Insurance', vehicle.insurance_expiry],
                    ['Fitness', vehicle.fitness_expiry],
                    ['Pollution', vehicle.fuel_type === 'EV' ? 'N/A for EV' : (vehicle.pollution_expiry || 'Not set')]
                  ];

                  return (
                    <div key={vehicle.id} style={{ backgroundColor: 'rgba(15, 23, 42, 0.82)', padding: '20px', borderRadius: '22px', border: '1px solid rgba(148, 163, 184, 0.16)', boxShadow: '0 24px 60px rgba(0, 0, 0, 0.22)' }}>

                      {/* Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
                        <div>
                          <h4 style={{ margin: '0 0 6px 0', fontSize: '18px', color: '#f8fafc' }}>{vehicle.brand} {vehicle.name}</h4>
                          <p style={{ margin: '0 0 8px 0', fontFamily: 'monospace', color: '#38bdf8', fontSize: '14px', letterSpacing: '1px' }}>{vehicle.reg_number}</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '999px', backgroundColor: 'rgba(51, 65, 85, 0.9)', color: '#cbd5e1' }}>Model year {vehicle.model_year}</span>
                            <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '999px', backgroundColor: vehicle.fuel_type === 'EV' ? 'rgba(14, 116, 144, 0.35)' : 'rgba(22, 163, 74, 0.32)', color: '#e2e8f0' }}>{vehicle.fuel_type}</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 'bold', padding: '4px 10px', borderRadius: '999px', backgroundColor: kmLeft < 500 ? '#7f1d1d' : '#064e3b', color: kmLeft < 500 ? '#fca5a5' : '#a7f3d0' }}>
                            {kmLeft.toLocaleString()} KM TO SERVICE
                          </span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => setEditingVehicleId(vehicle.id)} style={{ backgroundColor: 'transparent', border: '1px solid rgba(125, 211, 252, 0.3)', color: '#7dd3fc', cursor: 'pointer', fontSize: '13px', padding: '8px 12px', borderRadius: '999px', fontFamily: 'inherit' }}>Edit</button>
                            <button onClick={() => decommissionVehicle(vehicle.id)} style={{ backgroundColor: 'transparent', border: '1px solid rgba(248, 113, 113, 0.28)', color: '#fca5a5', cursor: 'pointer', fontSize: '13px', padding: '8px 12px', borderRadius: '999px', fontFamily: 'inherit' }}>Remove</button>
                          </div>
                        </div>
                      </div>

                      {/* ★ Vehicle Health Score */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', borderRadius: '16px', backgroundColor: health.bg, border: `1px solid ${health.border}`, marginBottom: '14px' }}>
                        <div style={{ width: '46px', height: '46px', borderRadius: '999px', border: `3px solid ${health.color}`, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '16px', color: health.color, flexShrink: 0 }}>
                          {health.score}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '15px', color: health.color }}>{health.label}</div>
                          <div style={{ fontSize: '12px', color: '#94a3b8' }}>Vehicle Health Score</div>
                        </div>
                      </div>

                      {/* Odometer Stats */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px', marginBottom: '14px' }}>
                        <div style={{ padding: '12px', borderRadius: '16px', backgroundColor: 'rgba(2, 6, 23, 0.65)' }}>
                          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Current Run</div>
                          <div style={{ fontWeight: 700 }}>{vehicle.odometer.toLocaleString()} km</div>
                        </div>
                        <div style={{ padding: '12px', borderRadius: '16px', backgroundColor: 'rgba(2, 6, 23, 0.65)' }}>
                          <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '4px' }}>Service Target</div>
                          <div style={{ fontWeight: 700 }}>{vehicle.next_service_odo.toLocaleString()} km</div>
                        </div>
                      </div>

                      {/* Document Rows — dates displayed as DD-MM-YYYY */}
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {documentRows.map(([label, value]) => {
                          const isDate = value && value !== 'N/A for EV' && value !== 'Not set' && isIsoDate(value);
                          const status = isDate ? getExpiryStatus(value) : 'valid';
                          const days = isDate ? getDaysUntilExpiry(value) : null;
                          const bg = status === 'expired' ? 'rgba(127, 29, 29, 0.4)' : status === 'expiring' ? 'rgba(120, 53, 15, 0.4)' : 'rgba(2, 6, 23, 0.45)';
                          const txt = status === 'expired' ? '#fecaca' : status === 'expiring' ? '#fed7aa' : '#f8fafc';

                          return (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '10px 12px', borderRadius: '14px', backgroundColor: bg, border: status === 'expired' ? '1px solid rgba(248, 113, 113, 0.3)' : status === 'expiring' ? '1px solid rgba(251, 146, 60, 0.3)' : 'none' }}>
                              <span style={{ color: '#94a3b8' }}>{label}</span>
                              <div style={{ textAlign: 'right' }}>
                                <strong style={{ color: txt, display: 'block' }}>{isDate ? formatDate(value) : (value || 'Not set')}</strong>
                                {days !== null && status !== 'valid' && (
                                  <span style={{ fontSize: '11px', color: txt, opacity: 0.85 }}>
                                    {status === 'expired' ? `Expired ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''} ago` : `${days} day${days !== 1 ? 's' : ''} left`}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Profile Slide-out Panel ─── */}
      {showPersonalDetailsPanel && (
        <>
          <div onClick={() => setShowPersonalDetailsPanel(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)', zIndex: 40, animation: 'fadeIn 200ms ease' }} />
          <div style={{ position: 'fixed', right: 0, top: 0, height: '100vh', width: '420px', backgroundColor: 'rgba(15, 23, 42, 0.95)', backdropFilter: 'blur(14px)', boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.4)', zIndex: 50, overflowY: 'auto', animation: 'slideInRight 300ms ease', paddingBottom: '48px' }}>
            <style>{`
              @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
              @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
            `}</style>

            <div style={{ padding: '24px', borderBottom: '1px solid rgba(148, 163, 184, 0.16)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '20px' }}>Personal Details</h3>
              <button onClick={() => setShowPersonalDetailsPanel(false)} style={{ backgroundColor: 'transparent', border: 'none', color: '#94a3b8', fontSize: '24px', cursor: 'pointer', padding: '4px 8px' }}>✕</button>
            </div>

            <form onSubmit={handleProfileSubmit} style={{ padding: '24px' }}>
              <p style={{ margin: '0 0 18px 0', color: '#94a3b8', fontSize: '14px', lineHeight: 1.5 }}>Update the operator identity and password tied to this session.</p>

              {(profileError || profileNotice) && (
                <div style={{ padding: '12px 14px', borderRadius: '14px', marginBottom: '16px', backgroundColor: profileError ? 'rgba(127, 29, 29, 0.5)' : 'rgba(6, 95, 70, 0.5)', border: `1px solid ${profileError ? 'rgba(248, 113, 113, 0.45)' : 'rgba(52, 211, 153, 0.35)'}`, color: profileError ? '#fecaca' : '#bbf7d0', fontSize: '14px' }}>
                  {profileError || profileNotice}
                </div>
              )}

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>User ID</label>
                <input type="text" value={profileUsername} onChange={(e) => setProfileUsername(e.target.value)} style={inputStyle} required />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>New Password</label>
                <input type="password" value={profilePassword} onChange={(e) => setProfilePassword(e.target.value)} placeholder="Leave blank to keep existing" style={inputStyle} />
              </div>

              <button type="submit" style={{ width: '100%', padding: '12px 16px', background: 'linear-gradient(135deg, #14b8a6 0%, #0891b2 100%)', color: 'white', border: 'none', borderRadius: '14px', fontWeight: 800, cursor: 'pointer', marginBottom: '12px', fontFamily: 'inherit', fontSize: '15px' }}>Save Changes</button>
              <button type="button" onClick={() => setShowPersonalDetailsPanel(false)} style={{ width: '100%', padding: '12px 16px', background: 'transparent', color: '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}