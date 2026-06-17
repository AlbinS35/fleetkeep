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
  tax_expiry: '',
  insurance_expiry: '',
  fitness_expiry: '',
  pollution_expiry: ''
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

    const selectedVehicle = vehicles.find((vehicle) => vehicle.id === editingVehicleId);
    if (selectedVehicle) {
      setVehicleForm({
        name: selectedVehicle.name || '',
        brand: selectedVehicle.brand || '',
        reg_number: selectedVehicle.reg_number || '',
        model_year: selectedVehicle.model_year ? String(selectedVehicle.model_year) : '',
        fuel_type: selectedVehicle.fuel_type || 'ICE',
        odometer: selectedVehicle.odometer !== undefined ? String(selectedVehicle.odometer) : '',
        next_service_odo: selectedVehicle.next_service_odo !== undefined ? String(selectedVehicle.next_service_odo) : '',
        rc_expiry: selectedVehicle.rc_expiry || '',
        tax_expiry: selectedVehicle.tax_expiry || '',
        insurance_expiry: selectedVehicle.insurance_expiry || '',
        fitness_expiry: selectedVehicle.fitness_expiry || '',
        pollution_expiry: selectedVehicle.pollution_expiry || ''
      });
    }
  }, [editingVehicleId, vehicles]);

  const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

  const getDaysUntilExpiry = (expiryDate) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    const timeDiff = expiry.getTime() - today.getTime();
    return Math.floor(timeDiff / (1000 * 60 * 60 * 24));
  };

  const getExpiryStatus = (expiryDate) => {
    const days = getDaysUntilExpiry(expiryDate);
    if (days < 0) return 'expired';
    if (days <= 30) return 'expiring';
    return 'valid';
  };

  const getExpiringDocuments = () => {
    const expiringDocs = [];
    vehicles.forEach(vehicle => {
      const docFields = [
        { label: 'RC', value: vehicle.rc_expiry, vehicleId: vehicle.id, vehicleName: `${vehicle.brand} ${vehicle.name}` },
        { label: 'Tax', value: vehicle.tax_expiry, vehicleId: vehicle.id, vehicleName: `${vehicle.brand} ${vehicle.name}` },
        { label: 'Insurance', value: vehicle.insurance_expiry, vehicleId: vehicle.id, vehicleName: `${vehicle.brand} ${vehicle.name}` },
        { label: 'Fitness', value: vehicle.fitness_expiry, vehicleId: vehicle.id, vehicleName: `${vehicle.brand} ${vehicle.name}` },
        vehicle.fuel_type === 'ICE' && { label: 'Pollution', value: vehicle.pollution_expiry, vehicleId: vehicle.id, vehicleName: `${vehicle.brand} ${vehicle.name}` }
      ].filter(Boolean);

      docFields.forEach(doc => {
        if (doc.value && isIsoDate(doc.value)) {
          const status = getExpiryStatus(doc.value);
          if (status !== 'valid') {
            const days = getDaysUntilExpiry(doc.value);
            expiringDocs.push({
              ...doc,
              days,
              status
            });
          }
        }
      });
    });
    return expiringDocs;
  };

  const operatorLabel = user?.username ? user.username.split(/[\s._@-]+/)[0] || user.username : 'Operator';
  const operatorAvatar = operatorLabel.slice(0, 1).toUpperCase();

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
      setProfileNotice('Personal details updated successfully.');
    }
  };

  const handleVehicleChange = (field, value) => {
    setVehicleForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const clearVehicleForm = () => {
    setVehicleForm(emptyVehicleForm);
    setEditingVehicleId(null);
  };

  const handleAddOrUpdateVehicle = async (e) => {
    e.preventDefault();
    setLocalError('');

    const indianPlateRegex = /^[A-Z]{2}-\d{2}-[A-Z]{1,2}-\d{4}$/;
    if (!indianPlateRegex.test(vehicleForm.reg_number.trim().toUpperCase())) {
      setLocalError('Invalid Plate Format. Standard input required: KL-35-B-5678');
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
      setLocalError('Telemetry Error: Odometer mileage cannot be negative values.');
      return;
    }

    if (parseInt(vehicleForm.next_service_odo, 10) <= parseInt(vehicleForm.odometer, 10)) {
      setLocalError('Next Service mileage target milestone must exceed current mileage.');
      return;
    }

    const requiredDateFields = ['rc_expiry', 'tax_expiry', 'insurance_expiry', 'fitness_expiry'];
    for (const field of requiredDateFields) {
      if (!isIsoDate(vehicleForm[field])) {
        setLocalError('Document expiry dates must use YYYY-MM-DD format.');
        return;
      }
    }

    if (vehicleForm.fuel_type === 'ICE' && !vehicleForm.pollution_expiry) {
      setLocalError('Pollution certificate expiry is required for ICE vehicles.');
      return;
    }

    if (vehicleForm.fuel_type === 'ICE' && !isIsoDate(vehicleForm.pollution_expiry)) {
      setLocalError('Document expiry dates must use YYYY-MM-DD format.');
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
      tax_expiry: vehicleForm.tax_expiry,
      insurance_expiry: vehicleForm.insurance_expiry,
      fitness_expiry: vehicleForm.fitness_expiry,
      pollution_expiry: vehicleForm.fuel_type === 'EV' ? '' : vehicleForm.pollution_expiry
    };

    const success = editingVehicleId
      ? await updateVehicle(editingVehicleId, payload)
      : await addVehicle(payload);

    if (success) {
      clearVehicleForm();
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at top left, rgba(59, 130, 246, 0.14), transparent 30%), radial-gradient(circle at top right, rgba(14, 165, 233, 0.12), transparent 24%), linear-gradient(180deg, #06101d 0%, #0d1727 100%)', color: '#f8fafc', fontFamily: 'Inter, "Segoe UI", sans-serif' }}>
      <nav style={{ backgroundColor: 'rgba(15, 23, 42, 0.82)', backdropFilter: 'blur(14px)', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(148, 163, 184, 0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ width: '42px', height: '42px', borderRadius: '14px', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)', color: '#eff6ff', fontWeight: 800 }}>FK</span>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.03em' }}>FleetKeep</div>
            <div style={{ color: '#94a3b8', fontSize: '13px' }}>Vehicle records, expiry tracking, and operator access</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '999px', backgroundColor: 'rgba(51, 65, 85, 0.75)', border: '1px solid rgba(148, 163, 184, 0.18)' }}>
            <span style={{ width: '32px', height: '32px', borderRadius: '999px', display: 'grid', placeItems: 'center', backgroundColor: '#0f172a', border: '1px solid rgba(148, 163, 184, 0.2)', color: '#93c5fd', fontWeight: 800 }}>{operatorAvatar}</span>
            <span style={{ fontSize: '14px', color: '#cbd5e1' }}>Welcome, <strong style={{ color: '#f8fafc' }}>{operatorLabel}</strong></span>
          </div>
          <button onClick={() => setShowPersonalDetailsPanel(true)} style={{ backgroundColor: 'transparent', border: '1px solid rgba(93, 211, 252, 0.35)', color: '#7dd3fc', fontWeight: 800, cursor: 'pointer', fontSize: '14px', padding: '10px 16px', borderRadius: '999px', transition: 'all 180ms ease' }} onMouseEnter={(e) => e.target.style.boxShadow = '0 0 16px rgba(93, 211, 252, 0.25)'} onMouseLeave={(e) => e.target.style.boxShadow = 'none'}>👤 Profile</button>
          <button onClick={logoutUser} style={{ backgroundColor: 'transparent', border: '1px solid rgba(248, 113, 113, 0.35)', color: '#fca5a5', fontWeight: 800, cursor: 'pointer', fontSize: '14px', padding: '10px 16px', borderRadius: '999px' }}>Logout</button>
        </div>
      </nav>

      <div style={{ maxWidth: '1320px', margin: '0 auto', padding: '32px 20px 48px' }}>
        {getExpiringDocuments().length > 0 && (
          <div style={{ backgroundColor: 'rgba(127, 29, 29, 0.4)', border: '1px solid rgba(248, 113, 113, 0.35)', borderRadius: '22px', padding: '20px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
              <span style={{ fontSize: '20px', marginTop: '2px' }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: '0 0 12px 0', color: '#fecaca', fontSize: '16px' }}>Document Expiry Alert</h4>
                <div style={{ display: 'grid', gap: '8px' }}>
                  {getExpiringDocuments().map((doc, idx) => (
                    <div key={idx} style={{ fontSize: '13px', color: '#f5d8d6' }}>
                      <strong>{doc.vehicleName}</strong> - {doc.label} {doc.status === 'expired' ? `expired on ${doc.value}` : `expires in ${doc.days} day${doc.days !== 1 ? 's' : ''}`}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '28px' }}>
          <div style={{ display: 'grid', gap: '20px' }}>
          <form onSubmit={handleAddOrUpdateVehicle} style={{ backgroundColor: 'rgba(15, 23, 42, 0.82)', padding: '24px', borderRadius: '22px', border: '1px solid rgba(148, 163, 184, 0.16)', boxShadow: '0 24px 60px rgba(0, 0, 0, 0.22)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '12px', marginBottom: '8px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#f8fafc' }}>{editingVehicleId ? 'Update Vehicle Details' : 'Register Vehicle'}</h3>
                <p style={{ margin: '6px 0 0 0', color: '#94a3b8', fontSize: '14px', lineHeight: 1.5 }}>Track registration, model data, and document expiries in one place.</p>
              </div>
              {editingVehicleId && (
                <button type="button" onClick={clearVehicleForm} style={{ background: 'transparent', border: '1px solid rgba(148, 163, 184, 0.2)', color: '#cbd5e1', borderRadius: '999px', padding: '8px 12px', cursor: 'pointer' }}>Cancel</button>
              )}
            </div>

            {(localError || error) && (
              <div style={{ padding: '12px 14px', borderRadius: '14px', marginBottom: '16px', backgroundColor: 'rgba(127, 29, 29, 0.5)', border: '1px solid rgba(248, 113, 113, 0.45)', color: '#fecaca', fontSize: '14px' }}>
                {localError || error}
              </div>
            )}

            <div style={{ display: 'grid', gap: '14px' }}>
              <div style={{ display: 'grid', gap: '8px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Brand</label>
                <input type="text" placeholder="e.g., Honda" value={vehicleForm.brand} onChange={(e) => handleVehicleChange('brand', e.target.value)} style={{ width: '100%', padding: '12px 14px', backgroundColor: '#020617', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '14px', color: '#f8fafc', boxSizing: 'border-box' }} required />
              </div>

              <div style={{ display: 'grid', gap: '8px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Vehicle Name / Model</label>
                <input type="text" placeholder="e.g., Honda Unicorn 160" value={vehicleForm.name} onChange={(e) => handleVehicleChange('name', e.target.value)} style={{ width: '100%', padding: '12px 14px', backgroundColor: '#020617', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '14px', color: '#f8fafc', boxSizing: 'border-box' }} required />
              </div>

              <div style={{ display: 'grid', gap: '8px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Registration Sequence No.</label>
                <input type="text" placeholder="e.g., KL-35-B-5678" value={vehicleForm.reg_number} onChange={(e) => handleVehicleChange('reg_number', e.target.value)} style={{ width: '100%', padding: '12px 14px', backgroundColor: '#020617', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '14px', color: '#f8fafc', boxSizing: 'border-box' }} required />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <label style={{ fontSize: '12px', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Model Year</label>
                  <input type="number" placeholder="2024" value={vehicleForm.model_year} onChange={(e) => handleVehicleChange('model_year', e.target.value)} style={{ width: '100%', padding: '12px 14px', backgroundColor: '#020617', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '14px', color: '#f8fafc', boxSizing: 'border-box' }} required />
                </div>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <label style={{ fontSize: '12px', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Fuel Type</label>
                  <select value={vehicleForm.fuel_type} onChange={(e) => handleVehicleChange('fuel_type', e.target.value)} style={{ width: '100%', padding: '12px 14px', backgroundColor: '#020617', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '14px', color: '#f8fafc', boxSizing: 'border-box' }}>
                    <option value="ICE">ICE</option>
                    <option value="EV">EV</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <label style={{ fontSize: '12px', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Current Odometer (km)</label>
                  <input type="number" placeholder="256" value={vehicleForm.odometer} onChange={(e) => handleVehicleChange('odometer', e.target.value)} style={{ width: '100%', padding: '12px 14px', backgroundColor: '#020617', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '14px', color: '#f8fafc', boxSizing: 'border-box' }} required />
                </div>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <label style={{ fontSize: '12px', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Next Service Milestone (km)</label>
                  <input type="number" placeholder="1000" value={vehicleForm.next_service_odo} onChange={(e) => handleVehicleChange('next_service_odo', e.target.value)} style={{ width: '100%', padding: '12px 14px', backgroundColor: '#020617', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '14px', color: '#f8fafc', boxSizing: 'border-box' }} required />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <label style={{ fontSize: '12px', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>RC Expiry</label>
                  <input type="date" value={vehicleForm.rc_expiry} onChange={(e) => handleVehicleChange('rc_expiry', e.target.value)} style={{ width: '100%', padding: '12px 14px', backgroundColor: '#020617', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '14px', color: '#f8fafc', boxSizing: 'border-box' }} required />
                </div>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <label style={{ fontSize: '12px', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Tax Expiry</label>
                  <input type="date" value={vehicleForm.tax_expiry} onChange={(e) => handleVehicleChange('tax_expiry', e.target.value)} style={{ width: '100%', padding: '12px 14px', backgroundColor: '#020617', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '14px', color: '#f8fafc', boxSizing: 'border-box' }} required />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <label style={{ fontSize: '12px', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Insurance Expiry</label>
                  <input type="date" value={vehicleForm.insurance_expiry} onChange={(e) => handleVehicleChange('insurance_expiry', e.target.value)} style={{ width: '100%', padding: '12px 14px', backgroundColor: '#020617', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '14px', color: '#f8fafc', boxSizing: 'border-box' }} required />
                </div>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <label style={{ fontSize: '12px', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Fitness Expiry</label>
                  <input type="date" value={vehicleForm.fitness_expiry} onChange={(e) => handleVehicleChange('fitness_expiry', e.target.value)} style={{ width: '100%', padding: '12px 14px', backgroundColor: '#020617', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '14px', color: '#f8fafc', boxSizing: 'border-box' }} required />
                </div>
              </div>

              <div style={{ display: 'grid', gap: '8px' }}>
                <label style={{ fontSize: '12px', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Pollution Expiry {vehicleForm.fuel_type === 'EV' ? '(Not applicable for EV)' : ''}</label>
                <input type="date" value={vehicleForm.pollution_expiry} onChange={(e) => handleVehicleChange('pollution_expiry', e.target.value)} disabled={vehicleForm.fuel_type === 'EV'} style={{ width: '100%', padding: '12px 14px', backgroundColor: vehicleForm.fuel_type === 'EV' ? '#0f172a' : '#020617', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '14px', color: '#f8fafc', boxSizing: 'border-box', opacity: vehicleForm.fuel_type === 'EV' ? 0.55 : 1 }} />
              </div>
            </div>

            <button type="submit" style={{ width: '100%', marginTop: '20px', padding: '13px 16px', background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', color: 'white', border: 'none', borderRadius: '14px', fontWeight: 800, cursor: 'pointer' }}>
              {editingVehicleId ? 'Update Vehicle Record' : 'Commit Asset to Ledger'}
            </button>
          </form>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: '18px', marginBottom: '20px' }}>
            <div>
              <h3 style={{ margin: '0 0 8px 0', color: '#f8fafc', fontSize: '24px' }}>Active System Asset Logs</h3>
              <p style={{ margin: 0, color: '#94a3b8' }}>Current records for the signed-in operator.</p>
            </div>
          </div>

          {loading ? (
            <p style={{ color: '#94a3b8' }}>Syncing with cloud telemetry service infrastructure...</p>
          ) : vehicles.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', backgroundColor: 'rgba(15, 23, 42, 0.82)', borderRadius: '22px', border: '1px dashed rgba(148, 163, 184, 0.28)', color: '#94a3b8' }}>
              No fleet operations initialized. Use the capture engine to record your garage vehicle data.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px' }}>
              {vehicles.map((vehicle) => {
                const operationalRemaining = vehicle.next_service_odo - vehicle.odometer;
                const documentRows = [
                  ['RC', vehicle.rc_expiry],
                  ['Tax', vehicle.tax_expiry],
                  ['Insurance', vehicle.insurance_expiry],
                  ['Fitness', vehicle.fitness_expiry],
                  ['Pollution', vehicle.fuel_type === 'EV' ? 'N/A for EV' : vehicle.pollution_expiry || 'Not set']
                ];

                return (
                  <div key={vehicle.id} style={{ backgroundColor: 'rgba(15, 23, 42, 0.82)', padding: '20px', borderRadius: '22px', border: '1px solid rgba(148, 163, 184, 0.16)', boxShadow: '0 24px 60px rgba(0, 0, 0, 0.22)' }}>
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
                        <span style={{ fontSize: '12px', fontWeight: 'bold', padding: '4px 10px', borderRadius: '999px', backgroundColor: operationalRemaining < 500 ? '#7f1d1d' : '#064e3b', color: operationalRemaining < 500 ? '#fca5a5' : '#a7f3d0' }}>
                          {operationalRemaining.toLocaleString()} KM TO SERVICE
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => setEditingVehicleId(vehicle.id)} style={{ backgroundColor: 'transparent', border: '1px solid rgba(125, 211, 252, 0.3)', color: '#7dd3fc', cursor: 'pointer', fontSize: '13px', padding: '8px 12px', borderRadius: '999px' }}>Edit</button>
                          <button onClick={() => decommissionVehicle(vehicle.id)} style={{ backgroundColor: 'transparent', border: '1px solid rgba(248, 113, 113, 0.28)', color: '#fca5a5', cursor: 'pointer', fontSize: '13px', padding: '8px 12px', borderRadius: '999px' }}>Remove</button>
                        </div>
                      </div>
                    </div>

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

                    <div style={{ display: 'grid', gap: '8px' }}>
                      {documentRows.map(([label, value]) => {
                        const docStatus = value && value !== 'N/A for EV' && value !== 'Not set' ? getExpiryStatus(value) : 'valid';
                        const docDays = value && value !== 'N/A for EV' && value !== 'Not set' ? getDaysUntilExpiry(value) : null;
                        const bgColor = docStatus === 'expired' ? 'rgba(127, 29, 29, 0.4)' : docStatus === 'expiring' ? 'rgba(120, 53, 15, 0.4)' : 'rgba(2, 6, 23, 0.45)';
                        const textColor = docStatus === 'expired' ? '#fecaca' : docStatus === 'expiring' ? '#fed7aa' : '#f8fafc';

                        return (
                          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '10px 12px', borderRadius: '14px', backgroundColor: bgColor, border: docStatus === 'expired' ? '1px solid rgba(248, 113, 113, 0.3)' : docStatus === 'expiring' ? '1px solid rgba(251, 146, 60, 0.3)' : 'none' }}>
                            <span style={{ color: '#94a3b8' }}>{label}</span>
                            <div style={{ textAlign: 'right' }}>
                              <strong style={{ color: textColor, display: 'block' }}>{value || 'Not set'}</strong>
                              {docDays !== null && docStatus !== 'valid' && (
                                <span style={{ fontSize: '11px', color: textColor, opacity: 0.85 }}>
                                  {docStatus === 'expired' ? `Expired ${Math.abs(docDays)} day${Math.abs(docDays) !== 1 ? 's' : ''} ago` : `${docDays} day${docDays !== 1 ? 's' : ''} left`}
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

      {showPersonalDetailsPanel && (
        <>
          <div
            onClick={() => setShowPersonalDetailsPanel(false)}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(4px)',
              zIndex: 40,
              animation: 'fadeIn 200ms ease'
            }}
          />
          <div
            style={{
              position: 'fixed',
              right: 0,
              top: 0,
              height: '100vh',
              width: '420px',
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              backdropFilter: 'blur(14px)',
              boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.4)',
              zIndex: 50,
              overflowY: 'auto',
              animation: 'slideInRight 300ms ease',
              paddingBottom: '48px'
            }}
          >
            <style>{`
              @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes slideInRight {
                from { transform: translateX(100%); }
                to { transform: translateX(0); }
              }
            `}</style>

            <div style={{ padding: '24px', borderBottom: '1px solid rgba(148, 163, 184, 0.16)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '20px' }}>Personal Details</h3>
              <button
                onClick={() => setShowPersonalDetailsPanel(false)}
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '24px',
                  cursor: 'pointer',
                  padding: '4px 8px'
                }}
              >
                ✕
              </button>
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
                <input type="text" value={profileUsername} onChange={(e) => setProfileUsername(e.target.value)} style={{ width: '100%', padding: '12px 14px', backgroundColor: '#020617', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '14px', color: '#f8fafc', boxSizing: 'border-box' }} required />
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>New Password</label>
                <input type="password" value={profilePassword} onChange={(e) => setProfilePassword(e.target.value)} placeholder="Leave blank to keep the existing password" style={{ width: '100%', padding: '12px 14px', backgroundColor: '#020617', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: '14px', color: '#f8fafc', boxSizing: 'border-box' }} />
              </div>

              <button type="submit" style={{ width: '100%', padding: '12px 16px', background: 'linear-gradient(135deg, #14b8a6 0%, #0891b2 100%)', color: 'white', border: 'none', borderRadius: '14px', fontWeight: 800, cursor: 'pointer', marginBottom: '12px' }}>Save Personal Details</button>
              <button type="button" onClick={() => setShowPersonalDetailsPanel(false)} style={{ width: '100%', padding: '12px 16px', background: 'transparent', color: '#94a3b8', border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '14px', fontWeight: 800, cursor: 'pointer' }}>Cancel</button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}