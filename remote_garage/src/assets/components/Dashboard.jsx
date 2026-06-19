import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchVehicleAssets,
  commitAssetToLedger,
  patchAssetRecord,
  decommissionAsset,
  setFleetFilter as setReduxFleetFilter,
  setActiveEditId,
  clearActiveEdit,
  selectFilteredAssets,
} from '../../store/vehicleSlice';
import {
  logoutUser as logoutReduxUser,
  updateUserProfile as updateReduxUserProfile,
  selectUser,
  selectAuthStatus,
  selectAuthError,
} from '../../store/authSlice';

// ─── Constants ───────────────────────────────────────────────────────────────

const VEHICLE_TYPES = ['Car', 'Motorbike', 'Scooter', 'Truck', 'Bus', 'Rickshaw'];
const FUEL_TYPES = ['Petrol', 'Diesel', 'EV'];

// Recommended service intervals per vehicle type (months)
const SERVICE_INTERVALS = {
  Car:      { min: 6,  max: 12, label: '6–12 months' },
  Motorbike:{ min: 4,  max: 6,  label: '4–6 months' },
  Scooter:  { min: 3,  max: 4,  label: '3–4 months' },
  Truck:    { min: 3,  max: 6,  label: '3–6 months' },
  Bus:      { min: 3,  max: 6,  label: '3–6 months' },
  Rickshaw: { min: 1,  max: 2,  label: '1–2 months' },
};

const emptyVehicleForm = {
  brand: '',
  name: '',
  reg_number: '',
  model_year: '',
  fuel_type: 'Petrol',
  vehicle_type: 'Car',
  odometer: '',
  next_service_odo: '',
  service_method: 'both',     // always track both
  service_period_months: '',
  last_service_date: '',
  rc_expiry: '',
  insurance_expiry: '',
  fitness_expiry: '',
  pollution_expiry: ''
};

const emptyCostForm = {
  calcFuelType: 'Petrol',
  fuelPrice: '103',
  dieselPrice: '90',
  evUnitPrice: '8',
  tripKm: '',
  mileage: '',
  evBatteryKwh: '',
  evRangeKm: '',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatDate = (dateStr) => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr || 'Not set';
  const [y, m, d] = dateStr.split('-');
  return `${d}-${m}-${y}`;
};

const addMonths = (dateStr, months) => {
  if (!dateStr || !months) return null;
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + parseInt(months, 10));
  return d.toISOString().split('T')[0];
};

const normalizeVehicleType = (vt) => {
  if (!vt) return 'Car';
  const map = { CAR: 'Car', MOTORBIKE: 'Motorbike', SCOOTER: 'Scooter', TRUCK: 'Truck', BUS: 'Bus', RICKSHAW: 'Rickshaw' };
  return map[vt.toUpperCase()] || vt;
};

const normalizeFuelType = (ft) => {
  if (!ft) return 'Petrol';
  const map = { PETROL: 'Petrol', DIESEL: 'Diesel', EV: 'EV', ICE: 'Petrol' };
  return map[ft.toUpperCase()] || ft;
};

// ─── Urgency levels: 0=OK, 1=Warning, 2=Urgent, 3=Overdue ───────────────────
const kmUrgency = (kmLeft) => {
  if (kmLeft <= 0)    return 3;
  if (kmLeft <= 500)  return 2;
  if (kmLeft <= 1500) return 1;
  return 0;
};
const timeUrgency = (days) => {
  if (days <= 0)  return 3;
  if (days <= 14) return 2;
  if (days <= 30) return 1;
  return 0;
};

// Returns { winner: 'km'|'time'|'both'|null, kmU, timeU, kmLeft, timeDays, nextServiceDate }
const resolveServiceTrigger = (vehicle) => {
  const today = new Date(); today.setHours(0,0,0,0);
  const hasKm   = vehicle.next_service_odo > 0 && vehicle.odometer >= 0;
  const hasTime = vehicle.last_service_date && vehicle.service_period_months;

  const kmLeft = hasKm ? vehicle.next_service_odo - vehicle.odometer : null;
  const nextServiceDate = hasTime ? addMonths(vehicle.last_service_date, vehicle.service_period_months) : null;
  const timeDays = nextServiceDate ? Math.floor((new Date(nextServiceDate) - today) / 86400000) : null;

  const kU = kmLeft   !== null ? kmUrgency(kmLeft)    : -1;
  const tU = timeDays !== null ? timeUrgency(timeDays) : -1;

  let winner = null;
  if (kU >= 0 && tU >= 0) {
    winner = kU >= tU ? 'km' : 'time'; // higher urgency wins; km wins ties
  } else if (kU >= 0) winner = 'km';
  else if (tU >= 0)   winner = 'time';

  return { winner, kmU: kU, timeU: tU, kmLeft, timeDays, nextServiceDate };
};

const computeHealthScore = (vehicle) => {
  let score = 0;
  let maxScore = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Service health (40 points) — use the WORST of km / time (whichever came first is most urgent)
  maxScore += 40;
  const { kmU, timeU, kmLeft, timeDays } = resolveServiceTrigger(vehicle);
  const worstU = Math.max(kmU >= 0 ? kmU : 0, timeU >= 0 ? timeU : 0);
  if (worstU === 3) score += 0;
  else if (worstU === 2) score += Math.round(40 * 0.2);
  else if (worstU === 1) score += Math.round(40 * 0.6);
  else {
    // Both OK — use the closer one as the ratio base
    const kmRatio  = kmLeft   !== null ? Math.min(kmLeft / 2000, 1)   : 1;
    const timeRatio = timeDays !== null ? Math.min(timeDays / 60, 1)  : 1;
    score += Math.round(Math.min(kmRatio, timeRatio) * 40);
  }

  const checkDoc = (dateStr, points) => {
    maxScore += points;
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) { score += Math.round(points * 0.5); return; }
    const expiry = new Date(dateStr); expiry.setHours(0, 0, 0, 0);
    const days = Math.floor((expiry - today) / 86400000);
    if (days < 0) score += 0;
    else if (days <= 30) score += Math.round(points * 0.5);
    else score += points;
  };

  checkDoc(vehicle.rc_expiry, 20);
  checkDoc(vehicle.insurance_expiry, 20);
  checkDoc(vehicle.fitness_expiry, 10);
  const ft = normalizeFuelType(vehicle.fuel_type);
  if (ft !== 'EV') checkDoc(vehicle.pollution_expiry, 10);

  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  if (pct >= 80) return { score: pct, label: 'Excellent',       color: '#22c55e', bg: 'rgba(34,197,94,0.12)',    border: 'rgba(34,197,94,0.25)' };
  if (pct >= 60) return { score: pct, label: 'Good',            color: '#38bdf8', bg: 'rgba(56,189,248,0.12)',   border: 'rgba(56,189,248,0.25)' };
  if (pct >= 40) return { score: pct, label: 'Fair',            color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',   border: 'rgba(245,158,11,0.25)' };
  return         { score: pct, label: 'Needs Attention', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',    border: 'rgba(239,68,68,0.25)' };
};

const vehicleTypeIcon = (vt) => {
  const icons = { Car: '🚗', Motorbike: '🏍️', Scooter: '🛵', Truck: '🚛', Bus: '🚌', Rickshaw: '🛺' };
  return icons[normalizeVehicleType(vt)] || '🚗';
};

const fuelBadgeColor = (ft) => {
  const f = normalizeFuelType(ft);
  if (f === 'EV') return { bg: 'rgba(14,116,144,0.35)', color: '#67e8f9' };
  if (f === 'Diesel') return { bg: 'rgba(180,83,9,0.35)', color: '#fcd34d' };
  return { bg: 'rgba(22,163,74,0.32)', color: '#86efac' };
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const vehicles = useSelector((state) => state.vehicles.assets);
  const filteredVehicles = useSelector(selectFilteredAssets);
  const loading = useSelector((state) => state.vehicles.status === 'loading');
  const error = useSelector((state) => state.vehicles.error || state.vehicles.operationError);

  const fleetFilter = useSelector((state) => state.vehicles.fleetFilter);
  const setFleetFilter = (val) => dispatch(setReduxFleetFilter(val));

  const editingVehicleId = useSelector((state) => state.vehicles.activeEditId);
  const setEditingVehicleId = (id) => dispatch(setActiveEditId(id));

  const [profileUsername, setProfileUsername] = useState(user?.username || '');
  const [profilePassword, setProfilePassword] = useState('');
  const [profileNotice, setProfileNotice] = useState('');
  const [profileError, setProfileError] = useState('');

  const [vehicleForm, setVehicleForm] = useState(emptyVehicleForm);
  const [localError, setLocalError] = useState('');
  const [showPersonalDetailsPanel, setShowPersonalDetailsPanel] = useState(false);

  // Mileage Calculator
  const [showCalculator, setShowCalculator] = useState(false);
  const [calc, setCalc] = useState(emptyCostForm);

  useEffect(() => {
    if (user?.id) {
      dispatch(fetchVehicleAssets(user.id));
    }
  }, [user, dispatch]);

  useEffect(() => {
    setProfileUsername(user?.username || '');
    setProfilePassword('');
    setProfileNotice('');
    setProfileError('');
  }, [user]);

  useEffect(() => {
    if (!editingVehicleId) { setVehicleForm(emptyVehicleForm); return; }
    const v = vehicles.find((vehicle) => vehicle.id === editingVehicleId);
    if (v) {
      setVehicleForm({
        name: v.name || '',
        brand: v.brand || '',
        reg_number: v.reg_number || '',
        model_year: v.model_year ? String(v.model_year) : '',
        fuel_type: normalizeFuelType(v.fuel_type),
        vehicle_type: normalizeVehicleType(v.vehicle_type),
        odometer: v.odometer !== undefined ? String(v.odometer) : '',
        next_service_odo: v.next_service_odo !== undefined ? String(v.next_service_odo) : '',
        service_method: 'both',
        service_period_months: v.service_period_months ? String(v.service_period_months) : '',
        last_service_date: v.last_service_date || '',
        rc_expiry: v.rc_expiry || '',
        insurance_expiry: v.insurance_expiry || '',
        fitness_expiry: v.fitness_expiry || '',
        pollution_expiry: v.pollution_expiry || ''
      });
    }
  }, [editingVehicleId, vehicles]);

  // ─── Date / Expiry helpers ─────────────────────────────────────────────────

  const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

  const getDaysUntilExpiry = (expiryDate) => {
    const today = new Date(); today.setHours(0,0,0,0);
    const expiry = new Date(expiryDate); expiry.setHours(0,0,0,0);
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
      const ft = normalizeFuelType(vehicle.fuel_type);
      const fields = [
        { label: 'RC', value: vehicle.rc_expiry, vehicleName: `${vehicle.brand} ${vehicle.name}` },
        { label: 'Insurance', value: vehicle.insurance_expiry, vehicleName: `${vehicle.brand} ${vehicle.name}` },
        { label: 'Fitness', value: vehicle.fitness_expiry, vehicleName: `${vehicle.brand} ${vehicle.name}` },
        ft !== 'EV' && { label: 'Pollution', value: vehicle.pollution_expiry, vehicleName: `${vehicle.brand} ${vehicle.name}` }
      ].filter(Boolean);
      fields.forEach((doc) => {
        if (doc.value && isIsoDate(doc.value)) {
          const status = getExpiryStatus(doc.value);
          if (status !== 'valid') docs.push({ ...doc, days: getDaysUntilExpiry(doc.value), status });
        }
      });
    });
    return docs;
  };

  // ─── Mileage Calculator Logic ──────────────────────────────────────────────

  const calcResults = (() => {
    const ft = calc.calcFuelType;
    const km = parseFloat(calc.tripKm);
    if (!km || km <= 0) return null;

    if (ft === 'EV') {
      const unitPrice = parseFloat(calc.evUnitPrice);
      const battKwh = parseFloat(calc.evBatteryKwh);
      const rangeKm = parseFloat(calc.evRangeKm);
      if (!unitPrice || !battKwh || !rangeKm) return null;
      const kwhPerKm = battKwh / rangeKm;
      const costPerKm = kwhPerKm * unitPrice;
      const totalCost = costPerKm * km;
      const kwhNeeded = kwhPerKm * km;
      return { costPerKm: costPerKm.toFixed(2), totalCost: totalCost.toFixed(2), extraA: `${kwhNeeded.toFixed(2)} kWh needed`, extraB: `₹${unitPrice}/unit`, type: 'EV' };
    } else {
      const price = ft === 'Diesel' ? parseFloat(calc.dieselPrice) : parseFloat(calc.fuelPrice);
      const mileage = parseFloat(calc.mileage);
      if (!price || !mileage) return null;
      const costPerKm = price / mileage;
      const totalCost = costPerKm * km;
      const litersNeeded = km / mileage;
      return { costPerKm: costPerKm.toFixed(2), totalCost: totalCost.toFixed(2), extraA: `${litersNeeded.toFixed(2)} L needed`, extraB: `${mileage} km/L mileage`, type: 'ICE' };
    }
  })();

  // ─── User label ───────────────────────────────────────────────────────────

  const operatorLabel = user?.username ? user.username.split(/[\s._@-]+/)[0] || user.username : 'Operator';
  const operatorAvatar = operatorLabel.slice(0, 1).toUpperCase();

  // ─── Profile submit ────────────────────────────────────────────────────────

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileError(''); setProfileNotice('');
    if (profileUsername.trim().length < 3) { setProfileError('User ID must be at least 3 characters.'); return; }
    if (profilePassword && profilePassword.length < 6) { setProfileError('Password must be at least 6 characters.'); return; }
    
    const resultAction = await dispatch(updateReduxUserProfile({
      userId: user.id,
      profileData: { username: profileUsername.trim(), password: profilePassword }
    }));
    
    if (updateReduxUserProfile.fulfilled.match(resultAction)) {
      setProfilePassword('');
      setProfileNotice('Profile updated successfully.');
    } else {
      setProfileError(resultAction.payload || 'Failed to update profile. Please try again.');
    }
  };

  // ─── Vehicle form ──────────────────────────────────────────────────────────

  const handleVehicleChange = (field, value) => setVehicleForm((prev) => ({ ...prev, [field]: value }));

  const clearVehicleForm = () => {
    setVehicleForm(emptyVehicleForm);
    dispatch(clearActiveEdit());
  };

  const handleAddOrUpdateVehicle = async (e) => {
    e.preventDefault(); setLocalError('');
    const plateRegex = /^[A-Z]{2}-\d{2}-[A-Z]{1,2}-\d{4}$/;
    if (!plateRegex.test(vehicleForm.reg_number.trim().toUpperCase())) { setLocalError('Invalid plate format. Use: KL-35-B-5678'); return; }
    if (!vehicleForm.brand.trim()) { setLocalError('Vehicle brand is required.'); return; }
    if (!vehicleForm.model_year || Number(vehicleForm.model_year) < 1900) { setLocalError('Model year must be a valid year.'); return; }

    // KM section — always required
    if (parseInt(vehicleForm.odometer, 10) < 0) { setLocalError('Odometer reading cannot be negative.'); return; }
    if (!vehicleForm.next_service_odo || parseInt(vehicleForm.next_service_odo, 10) <= parseInt(vehicleForm.odometer, 10)) {
      setLocalError('Next service milestone (km) must exceed current odometer.'); return;
    }

    // Time section — both fields required together if either is filled, else optional
    const hasPeriod = vehicleForm.service_period_months && parseInt(vehicleForm.service_period_months, 10) >= 1;
    const hasDate   = isIsoDate(vehicleForm.last_service_date);
    if (hasPeriod && !hasDate) { setLocalError('Please also enter the last service date for time-based tracking.'); return; }
    if (hasDate && !hasPeriod) { setLocalError('Please also enter the service interval (months) for time-based tracking.'); return; }

    for (const field of ['rc_expiry', 'insurance_expiry', 'fitness_expiry']) {
      if (!isIsoDate(vehicleForm[field])) { setLocalError('Document expiry dates are required (YYYY-MM-DD).'); return; }
    }
    if (vehicleForm.fuel_type !== 'EV' && !vehicleForm.pollution_expiry) { setLocalError('Pollution certificate expiry is required for Petrol/Diesel vehicles.'); return; }
    if (vehicleForm.fuel_type !== 'EV' && !isIsoDate(vehicleForm.pollution_expiry)) { setLocalError('Pollution expiry must be a valid date.'); return; }

    const payload = {
      name: vehicleForm.name.trim(),
      brand: vehicleForm.brand.trim(),
      reg_number: vehicleForm.reg_number.trim().toUpperCase(),
      model_year: parseInt(vehicleForm.model_year, 10),
      fuel_type: vehicleForm.fuel_type.toUpperCase(),
      vehicle_type: vehicleForm.vehicle_type.toUpperCase(),
      odometer: parseInt(vehicleForm.odometer, 10) || 0,
      next_service_odo: parseInt(vehicleForm.next_service_odo, 10) || 0,
      service_method: 'both',
      service_period_months: hasPeriod ? parseInt(vehicleForm.service_period_months, 10) : null,
      last_service_date: hasDate ? vehicleForm.last_service_date : null,
      rc_expiry: vehicleForm.rc_expiry,
      insurance_expiry: vehicleForm.insurance_expiry,
      fitness_expiry: vehicleForm.fitness_expiry,
      pollution_expiry: vehicleForm.fuel_type === 'EV' ? '' : vehicleForm.pollution_expiry
    };

    const action = editingVehicleId
      ? patchAssetRecord({ userId: user.id, vehicleId: editingVehicleId, vehicleData: payload })
      : commitAssetToLedger({ userId: user.id, vehicleData: payload });

    const resultAction = await dispatch(action);
    if (commitAssetToLedger.fulfilled.match(resultAction) || patchAssetRecord.fulfilled.match(resultAction)) {
      clearVehicleForm();
      dispatch(fetchVehicleAssets(user.id));
    } else {
      setLocalError(resultAction.payload || 'Operation failed.');
    }
  };

  // ─── Styles ────────────────────────────────────────────────────────────────
  const inputStyle = { width: '100%', padding: '12px 14px', backgroundColor: '#020617', border: '1px solid rgba(148,163,184,0.18)', borderRadius: '14px', color: '#f8fafc', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: '14px' };
  const labelStyle = { fontSize: '12px', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' };
  const sectionCard = { backgroundColor: 'rgba(15,23,42,0.82)', padding: '24px', borderRadius: '22px', border: '1px solid rgba(148,163,184,0.16)', boxShadow: '0 24px 60px rgba(0,0,0,0.22)' };

  // ─── Recommended interval for current form vehicle type ───────────────────
  const recommendedInterval = SERVICE_INTERVALS[vehicleForm.vehicle_type] || SERVICE_INTERVALS['Car'];

  // ─── Urgency styling helpers ───────────────────────────────────────────────
  const urgencyStyle = (level) => {
    if (level >= 3) return { bg: 'rgba(127,29,29,0.55)',  border: 'rgba(248,113,113,0.4)', color: '#fca5a5',  label: 'OVERDUE'  };
    if (level === 2) return { bg: 'rgba(120,53,15,0.55)',  border: 'rgba(251,146,60,0.4)',  color: '#fdba74',  label: 'URGENT'   };
    if (level === 1) return { bg: 'rgba(113,63,18,0.35)',  border: 'rgba(245,158,11,0.3)',  color: '#fcd34d',  label: 'DUE SOON' };
    return           { bg: 'rgba(6,78,59,0.4)',            border: 'rgba(52,211,153,0.25)', color: '#6ee7b7',  label: 'OK'       };
  };

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at top left,rgba(59,130,246,0.14),transparent 30%),radial-gradient(circle at top right,rgba(14,165,233,0.12),transparent 24%),linear-gradient(180deg,#06101d 0%,#0d1727 100%)', color: '#f8fafc', fontFamily: 'Inter,"Segoe UI",sans-serif' }}>

      <style>{`
        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes slideInRight { from { transform:translateX(100%) } to { transform:translateX(0) } }
        @keyframes calcSlideDown { from { opacity:0; transform:translateY(-12px) } to { opacity:1; transform:translateY(0) } }
        .toggle-btn { cursor:pointer; padding:8px 18px; border-radius:999px; font-family:inherit; font-size:13px; font-weight:700; transition:all 180ms; border:1px solid transparent; }
        .toggle-btn.active { background:linear-gradient(135deg,#38bdf8,#2563eb); color:#fff; border-color:transparent; box-shadow:0 4px 14px rgba(37,99,235,0.35); }
        .toggle-btn.inactive { background:rgba(30,41,59,0.6); color:#94a3b8; border-color:rgba(148,163,184,0.18); }
        .toggle-btn.inactive:hover { color:#cbd5e1; border-color:rgba(148,163,184,0.32); }
        .calc-input:focus { border-color:rgba(56,189,248,0.45)!important; box-shadow:0 0 0 3px rgba(56,189,248,0.08)!important; }
        select option { background:#0f172a; }
      `}</style>

      {/* ─── Navbar ─── */}
      <nav style={{ backgroundColor: 'rgba(15,23,42,0.82)', backdropFilter: 'blur(14px)', padding: '16px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(148,163,184,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ width: '42px', height: '42px', borderRadius: '14px', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#38bdf8 0%,#2563eb 100%)', color: '#eff6ff', fontWeight: 800 }}>FK</span>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.03em' }}>FleetKeep</div>
            <div style={{ color: '#94a3b8', fontSize: '13px' }}>Vehicle records, expiry tracking &amp; multi-fleet management</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            onClick={() => { setShowPersonalDetailsPanel(true); setProfileNotice(''); setProfileError(''); }}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 16px 8px 8px', borderRadius: '999px', backgroundColor: 'rgba(51,65,85,0.75)', border: '1px solid rgba(148,163,184,0.18)', cursor: 'pointer', transition: 'all 180ms ease', fontFamily: 'inherit', fontSize: '14px', color: '#cbd5e1' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(125,211,252,0.4)'; e.currentTarget.style.boxShadow = '0 0 16px rgba(93,211,252,0.15)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(148,163,184,0.18)'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <span style={{ width: '32px', height: '32px', borderRadius: '999px', display: 'grid', placeItems: 'center', backgroundColor: '#0f172a', border: '1px solid rgba(148,163,184,0.2)', color: '#93c5fd', fontWeight: 800, fontSize: '14px' }}>{operatorAvatar}</span>
            <strong style={{ color: '#f8fafc' }}>{operatorLabel}</strong>
          </button>
          <button onClick={() => dispatch(logoutReduxUser())} style={{ backgroundColor: 'transparent', border: '1px solid rgba(248,113,113,0.35)', color: '#fca5a5', fontWeight: 800, cursor: 'pointer', fontSize: '14px', padding: '10px 16px', borderRadius: '999px', fontFamily: 'inherit' }}>Logout</button>
        </div>
      </nav>

      <div style={{ maxWidth: '1360px', margin: '0 auto', padding: '32px 20px 64px' }}>

        {/* ─── Document Expiry Alerts ─── */}
        {getExpiringDocuments().length > 0 && (
          <div style={{ backgroundColor: 'rgba(127,29,29,0.4)', border: '1px solid rgba(248,113,113,0.35)', borderRadius: '22px', padding: '20px', marginBottom: '24px' }}>
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

        <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '28px', alignItems: 'start' }}>

          {/* ─── LEFT: Vehicle Registration Form ─── */}
          <div style={{ display: 'grid', gap: '20px', position: 'sticky', top: '24px' }}>
            <form onSubmit={handleAddOrUpdateVehicle} style={sectionCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '12px', marginBottom: '8px' }}>
                <div>
                  <h3 style={{ margin: 0, color: '#f8fafc' }}>{editingVehicleId ? 'Update Vehicle Details' : 'Register Vehicle'}</h3>
                  <p style={{ margin: '6px 0 0 0', color: '#94a3b8', fontSize: '14px', lineHeight: 1.5 }}>Track registration, model data, service schedule and document expiries.</p>
                </div>
                {editingVehicleId && (
                  <button type="button" onClick={clearVehicleForm} style={{ background: 'transparent', border: '1px solid rgba(148,163,184,0.2)', color: '#cbd5e1', borderRadius: '999px', padding: '8px 12px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Cancel</button>
                )}
              </div>

              {(localError || error) && (
                <div style={{ padding: '12px 14px', borderRadius: '14px', marginBottom: '16px', backgroundColor: 'rgba(127,29,29,0.5)', border: '1px solid rgba(248,113,113,0.45)', color: '#fecaca', fontSize: '14px' }}>
                  {localError || error}
                </div>
              )}

              <div style={{ display: 'grid', gap: '14px' }}>

                {/* Brand */}
                <div style={{ display: 'grid', gap: '8px' }}>
                  <label style={labelStyle}>Brand</label>
                  <input type="text" placeholder="e.g., Honda" value={vehicleForm.brand} onChange={(e) => handleVehicleChange('brand', e.target.value)} style={inputStyle} required />
                </div>

                {/* Vehicle Name / Model */}
                <div style={{ display: 'grid', gap: '8px' }}>
                  <label style={labelStyle}>Vehicle Name / Model</label>
                  <input type="text" placeholder="e.g., Unicorn 160" value={vehicleForm.name} onChange={(e) => handleVehicleChange('name', e.target.value)} style={inputStyle} required />
                </div>

                {/* Reg Number */}
                <div style={{ display: 'grid', gap: '8px' }}>
                  <label style={labelStyle}>Registration Plate No.</label>
                  <input type="text" placeholder="e.g., KL-35-B-5678" value={vehicleForm.reg_number} onChange={(e) => handleVehicleChange('reg_number', e.target.value)} style={inputStyle} required />
                </div>

                {/* Model Year + Vehicle Type */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    <label style={labelStyle}>Model Year</label>
                    <input type="number" placeholder="2024" value={vehicleForm.model_year} onChange={(e) => handleVehicleChange('model_year', e.target.value)} style={inputStyle} required />
                  </div>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    <label style={labelStyle}>Vehicle Type</label>
                    <select value={vehicleForm.vehicle_type} onChange={(e) => handleVehicleChange('vehicle_type', e.target.value)} style={inputStyle}>
                      {VEHICLE_TYPES.map(vt => <option key={vt} value={vt}>{vehicleTypeIcon(vt)} {vt}</option>)}
                    </select>
                  </div>
                </div>

                {/* Fuel Type */}
                <div style={{ display: 'grid', gap: '8px' }}>
                  <label style={labelStyle}>Fuel Type</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {FUEL_TYPES.map(ft => (
                      <button
                        key={ft} type="button"
                        className={`toggle-btn ${vehicleForm.fuel_type === ft ? 'active' : 'inactive'}`}
                        onClick={() => handleVehicleChange('fuel_type', ft)}
                      >
                        {ft === 'Petrol' ? '⛽ Petrol' : ft === 'Diesel' ? '🛢️ Diesel' : '⚡ EV'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ─── Dual-Trigger Service Scheduling ─── */}
                <div style={{ display: 'grid', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={labelStyle}>Service Schedule</label>
                    <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', backgroundColor: 'rgba(99,102,241,0.2)', color: '#a5b4fc', fontWeight: 700 }}>⚡ Whichever comes first wins</span>
                  </div>

                  {/* KM Section — always required */}
                  <div style={{ padding: '14px', borderRadius: '16px', backgroundColor: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.16)' }}>
                    <div style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 700, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>📏 KM-Based <span style={{ color: '#475569', fontWeight: 400 }}>(required)</span></div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div style={{ display: 'grid', gap: '6px' }}>
                        <label style={labelStyle}>Current Odometer (km)</label>
                        <input type="number" placeholder="12000" value={vehicleForm.odometer} onChange={(e) => handleVehicleChange('odometer', e.target.value)} style={inputStyle} />
                      </div>
                      <div style={{ display: 'grid', gap: '6px' }}>
                        <label style={labelStyle}>Next Service at (km)</label>
                        <input type="number" placeholder="13000" value={vehicleForm.next_service_odo} onChange={(e) => handleVehicleChange('next_service_odo', e.target.value)} style={inputStyle} />
                      </div>
                    </div>
                  </div>

                  {/* Time Section — optional but paired */}
                  <div style={{ padding: '14px', borderRadius: '16px', backgroundColor: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.16)' }}>
                    <div style={{ fontSize: '12px', color: '#c084fc', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>📅 Time-Based <span style={{ color: '#475569', fontWeight: 400 }}>(optional — fill both or neither)</span></span>
                    </div>
                    <div style={{ padding: '8px 10px', borderRadius: '10px', backgroundColor: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.14)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px' }}>💡</span>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>Recommended for <strong style={{ color: '#c084fc' }}>{vehicleForm.vehicle_type}</strong>: every <strong style={{ color: '#c084fc' }}>{recommendedInterval.label}</strong></span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div style={{ display: 'grid', gap: '6px' }}>
                        <label style={labelStyle}>Last Service Date</label>
                        <input type="date" value={vehicleForm.last_service_date} onChange={(e) => handleVehicleChange('last_service_date', e.target.value)} style={inputStyle} />
                      </div>
                      <div style={{ display: 'grid', gap: '6px' }}>
                        <label style={labelStyle}>Service Every (months)</label>
                        <input type="number" placeholder={`e.g. ${recommendedInterval.min}`} min="1" max="24" value={vehicleForm.service_period_months} onChange={(e) => handleVehicleChange('service_period_months', e.target.value)} style={inputStyle} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Document Expiries */}
                <div style={{ borderTop: '1px solid rgba(148,163,184,0.1)', paddingTop: '14px' }}>
                  <label style={{ ...labelStyle, marginBottom: '12px', display: 'block' }}>Document Expiries</label>
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '14px' }}>
                    <div style={{ display: 'grid', gap: '8px' }}>
                      <label style={labelStyle}>Fitness Expiry</label>
                      <input type="date" value={vehicleForm.fitness_expiry} onChange={(e) => handleVehicleChange('fitness_expiry', e.target.value)} style={inputStyle} required />
                    </div>
                    <div style={{ display: 'grid', gap: '8px' }}>
                      <label style={labelStyle}>Pollution Expiry {vehicleForm.fuel_type === 'EV' ? '(N/A)' : ''}</label>
                      <input type="date" value={vehicleForm.pollution_expiry} onChange={(e) => handleVehicleChange('pollution_expiry', e.target.value)} disabled={vehicleForm.fuel_type === 'EV'} style={{ ...inputStyle, opacity: vehicleForm.fuel_type === 'EV' ? 0.45 : 1 }} />
                    </div>
                  </div>
                </div>

              </div>

              <button type="submit" style={{ width: '100%', marginTop: '20px', padding: '13px 16px', background: 'linear-gradient(135deg,#22c55e 0%,#16a34a 100%)', color: 'white', border: 'none', borderRadius: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', fontSize: '15px' }}>
                {editingVehicleId ? 'Update Vehicle Record' : '+ Register Vehicle'}
              </button>
            </form>
          </div>

          {/* ─── RIGHT: Fleet + Calculator ─── */}
          <div style={{ display: 'grid', gap: '28px' }}>

            {/* Fleet header + filter */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
              <div>
                <h3 style={{ margin: '0 0 6px 0', color: '#f8fafc', fontSize: '24px' }}>Your Fleet</h3>
                <p style={{ margin: 0, color: '#94a3b8' }}>{vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} registered • Filter by type</p>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['All', ...VEHICLE_TYPES].map(f => (
                  <button
                    key={f} type="button"
                    onClick={() => setFleetFilter(f)}
                    style={{
                      padding: '7px 14px', borderRadius: '999px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 600, transition: 'all 160ms',
                      backgroundColor: fleetFilter === f ? 'rgba(56,189,248,0.18)' : 'transparent',
                      borderColor: fleetFilter === f ? 'rgba(56,189,248,0.55)' : 'rgba(148,163,184,0.2)',
                      color: fleetFilter === f ? '#7dd3fc' : '#94a3b8'
                    }}
                  >
                    {f === 'All' ? '🚘 All' : `${vehicleTypeIcon(f)} ${f}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Vehicle Cards */}
            {loading ? (
              <p style={{ color: '#94a3b8' }}>Loading vehicles...</p>
            ) : filteredVehicles.length === 0 ? (
              <div style={{ padding: '48px', textAlign: 'center', backgroundColor: 'rgba(15,23,42,0.82)', borderRadius: '22px', border: '1px dashed rgba(148,163,184,0.28)', color: '#94a3b8' }}>
                {vehicles.length === 0 ? 'No vehicles registered yet. Use the form to add your first vehicle.' : `No ${fleetFilter}s found in your fleet.`}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '18px' }}>
                {filteredVehicles.map((vehicle) => {
                  const ft = normalizeFuelType(vehicle.fuel_type);
                  const vt = normalizeVehicleType(vehicle.vehicle_type);
                  const health = computeHealthScore(vehicle);
                  const fuelColor = fuelBadgeColor(ft);

                  // Dual-trigger resolution
                  const { winner, kmU, timeU, kmLeft, timeDays, nextServiceDate } = resolveServiceTrigger(vehicle);

                  const kmStyle   = urgencyStyle(kmU   >= 0 ? kmU   : 0);
                  const timeStyle = urgencyStyle(timeU >= 0 ? timeU : 0);
                  const hasTime   = vehicle.last_service_date && vehicle.service_period_months;

                  const documentRows = [
                    ['RC', vehicle.rc_expiry],
                    ['Insurance', vehicle.insurance_expiry],
                    ['Fitness', vehicle.fitness_expiry],
                    ['Pollution', ft === 'EV' ? 'N/A for EV' : (vehicle.pollution_expiry || 'Not set')]
                  ];

                  return (
                    <div key={vehicle.id} style={{ backgroundColor: 'rgba(15,23,42,0.82)', padding: '20px', borderRadius: '22px', border: '1px solid rgba(148,163,184,0.16)', boxShadow: '0 24px 60px rgba(0,0,0,0.22)', transition: 'transform 200ms', display: 'flex', flexDirection: 'column', gap: '0' }}>

                      {/* Card Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
                        <div>
                          <h4 style={{ margin: '0 0 6px 0', fontSize: '18px', color: '#f8fafc' }}>{vehicleTypeIcon(vt)} {vehicle.brand} {vehicle.name}</h4>
                          <p style={{ margin: '0 0 8px 0', fontFamily: 'monospace', color: '#38bdf8', fontSize: '14px', letterSpacing: '1px' }}>{vehicle.reg_number}</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '999px', backgroundColor: 'rgba(51,65,85,0.9)', color: '#cbd5e1' }}>Model {vehicle.model_year}</span>
                            <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '999px', backgroundColor: fuelColor.bg, color: fuelColor.color, fontWeight: 700 }}>{ft}</span>
                            <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '999px', backgroundColor: 'rgba(99,102,241,0.2)', color: '#a5b4fc' }}>{vt}</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', flexShrink: 0 }}>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => setEditingVehicleId(vehicle.id)} style={{ backgroundColor: 'transparent', border: '1px solid rgba(125,211,252,0.3)', color: '#7dd3fc', cursor: 'pointer', fontSize: '13px', padding: '7px 12px', borderRadius: '999px', fontFamily: 'inherit' }}>Edit</button>
                            <button onClick={() => dispatch(decommissionAsset({ userId: user.id, vehicleId: vehicle.id }))} style={{ backgroundColor: 'transparent', border: '1px solid rgba(248,113,113,0.28)', color: '#fca5a5', cursor: 'pointer', fontSize: '13px', padding: '7px 12px', borderRadius: '999px', fontFamily: 'inherit' }}>Remove</button>
                          </div>
                        </div>
                      </div>

                      {/* ⚡ Dual-Trigger Service Panel */}
                      <div style={{ marginBottom: '14px', display: 'grid', gap: '8px' }}>

                        {/* Winner banner */}
                        {winner && (
                          <div style={{ padding: '8px 12px', borderRadius: '10px', backgroundColor: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)', fontSize: '11px', color: '#a5b4fc', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            ⚡ <span style={{ color: '#c7d2fe' }}>Triggered by <strong>{winner === 'km' ? '📏 KM milestone' : '📅 Time interval'}</strong> — serviced first</span>
                          </div>
                        )}

                        {/* KM trigger row */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '12px', backgroundColor: kmStyle.bg, border: `1px solid ${kmStyle.border}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '14px' }}>📏</span>
                            <div>
                              <div style={{ fontSize: '12px', color: kmStyle.color, fontWeight: 700 }}>KM-Based {winner === 'km' && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '999px', backgroundColor: 'rgba(99,102,241,0.35)', color: '#c7d2fe', marginLeft: '4px' }}>TRIGGERED</span>}</div>
                              <div style={{ fontSize: '11px', color: '#64748b' }}>{(vehicle.odometer || 0).toLocaleString()} km now → {(vehicle.next_service_odo || 0).toLocaleString()} km target</div>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: kmStyle.color }}>
                              {kmLeft !== null ? `${kmLeft.toLocaleString()} km` : '—'}
                            </div>
                            <div style={{ fontSize: '10px', color: kmStyle.color, opacity: 0.8 }}>{kmStyle.label}</div>
                          </div>
                        </div>

                        {/* Time trigger row — only if time data exists */}
                        {hasTime ? (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '12px', backgroundColor: timeStyle.bg, border: `1px solid ${timeStyle.border}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '14px' }}>📅</span>
                              <div>
                                <div style={{ fontSize: '12px', color: timeStyle.color, fontWeight: 700 }}>Time-Based {winner === 'time' && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '999px', backgroundColor: 'rgba(99,102,241,0.35)', color: '#c7d2fe', marginLeft: '4px' }}>TRIGGERED</span>}</div>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>Every {vehicle.service_period_months}mo · Next: {nextServiceDate ? formatDate(nextServiceDate) : '—'}</div>
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '13px', fontWeight: 800, color: timeStyle.color }}>
                                {timeDays !== null ? (timeDays >= 0 ? `${timeDays}d left` : `${Math.abs(timeDays)}d over`) : '—'}
                              </div>
                              <div style={{ fontSize: '10px', color: timeStyle.color, opacity: 0.8 }}>{timeStyle.label}</div>
                            </div>
                          </div>
                        ) : (
                          <div style={{ padding: '8px 12px', borderRadius: '12px', backgroundColor: 'rgba(2,6,23,0.4)', border: '1px dashed rgba(148,163,184,0.15)', fontSize: '12px', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            📅 <span>No time-based tracking set — edit to enable</span>
                          </div>
                        )}
                      </div>

                      {/* Health Score */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', borderRadius: '16px', backgroundColor: health.bg, border: `1px solid ${health.border}`, marginBottom: '14px' }}>
                        <div style={{ width: '46px', height: '46px', borderRadius: '999px', border: `3px solid ${health.color}`, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '16px', color: health.color, flexShrink: 0 }}>{health.score}</div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '15px', color: health.color }}>{health.label}</div>
                          <div style={{ fontSize: '12px', color: '#94a3b8' }}>Vehicle Health Score — worst-of-two service check</div>
                        </div>
                      </div>

                      {/* Documents */}
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {documentRows.map(([label, value]) => {
                          const isDate = value && value !== 'N/A for EV' && value !== 'Not set' && isIsoDate(value);
                          const status = isDate ? getExpiryStatus(value) : 'valid';
                          const days = isDate ? getDaysUntilExpiry(value) : null;
                          const bg = status === 'expired' ? 'rgba(127,29,29,0.4)' : status === 'expiring' ? 'rgba(120,53,15,0.4)' : 'rgba(2,6,23,0.45)';
                          const txt = status === 'expired' ? '#fecaca' : status === 'expiring' ? '#fed7aa' : '#f8fafc';
                          return (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '10px 12px', borderRadius: '14px', backgroundColor: bg, border: status === 'expired' ? '1px solid rgba(248,113,113,0.3)' : status === 'expiring' ? '1px solid rgba(251,146,60,0.3)' : 'none' }}>
                              <span style={{ color: '#94a3b8', fontSize: '13px' }}>{label}</span>
                              <div style={{ textAlign: 'right' }}>
                                <strong style={{ color: txt, display: 'block', fontSize: '13px' }}>{isDate ? formatDate(value) : (value || 'Not set')}</strong>
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

            {/* ─── Mileage & Cost Calculator ─── */}
            <div style={sectionCard}>
              <button
                type="button"
                onClick={() => setShowCalculator(!showCalculator)}
                style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 0, fontFamily: 'inherit', color: '#f8fafc' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg,#f59e0b,#d97706)', display: 'grid', placeItems: 'center', fontSize: '20px', flexShrink: 0 }}>⛽</span>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 800, fontSize: '17px' }}>Mileage &amp; Cost Calculator</div>
                    <div style={{ color: '#94a3b8', fontSize: '13px' }}>Calculate running cost per km and total trip fuel expense</div>
                  </div>
                </div>
                <span style={{ color: '#94a3b8', fontSize: '20px', transform: showCalculator ? 'rotate(180deg)' : 'none', transition: 'transform 250ms' }}>▾</span>
              </button>

              {showCalculator && (
                <div style={{ marginTop: '24px', animation: 'calcSlideDown 250ms ease' }}>

                  {/* Fuel Type Selector */}
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                    {FUEL_TYPES.map(ft => (
                      <button key={ft} type="button" className={`toggle-btn ${calc.calcFuelType === ft ? 'active' : 'inactive'}`} onClick={() => setCalc(p => ({ ...p, calcFuelType: ft }))}>
                        {ft === 'Petrol' ? '⛽ Petrol' : ft === 'Diesel' ? '🛢️ Diesel' : '⚡ EV'}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>

                    {/* Petrol / Diesel inputs */}
                    {calc.calcFuelType !== 'EV' && (
                      <>
                        <div style={{ display: 'grid', gap: '8px' }}>
                          <label style={labelStyle}>
                            {calc.calcFuelType === 'Diesel' ? 'Diesel Price (₹/L)' : 'Petrol Price (₹/L)'}
                          </label>
                          <input
                            type="number" step="0.5" min="0"
                            className="calc-input"
                            value={calc.calcFuelType === 'Diesel' ? calc.dieselPrice : calc.fuelPrice}
                            onChange={(e) => setCalc(p => calc.calcFuelType === 'Diesel' ? { ...p, dieselPrice: e.target.value } : { ...p, fuelPrice: e.target.value })}
                            style={{ ...inputStyle, outline: 'none', transition: 'border-color 200ms, box-shadow 200ms' }}
                            placeholder="103"
                          />
                          <span style={{ fontSize: '11px', color: '#475569' }}>Edit to match current local price</span>
                        </div>
                        <div style={{ display: 'grid', gap: '8px' }}>
                          <label style={labelStyle}>Vehicle Mileage (km/L)</label>
                          <input type="number" step="0.5" min="0" className="calc-input" value={calc.mileage} onChange={(e) => setCalc(p => ({ ...p, mileage: e.target.value }))} style={{ ...inputStyle, outline: 'none', transition: 'border-color 200ms, box-shadow 200ms' }} placeholder="e.g. 20" />
                        </div>
                        <div style={{ display: 'grid', gap: '8px' }}>
                          <label style={labelStyle}>Trip Distance (km)</label>
                          <input type="number" step="1" min="0" className="calc-input" value={calc.tripKm} onChange={(e) => setCalc(p => ({ ...p, tripKm: e.target.value }))} style={{ ...inputStyle, outline: 'none', transition: 'border-color 200ms, box-shadow 200ms' }} placeholder="e.g. 150" />
                        </div>
                      </>
                    )}

                    {/* EV Inputs */}
                    {calc.calcFuelType === 'EV' && (
                      <>
                        <div style={{ display: 'grid', gap: '8px' }}>
                          <label style={labelStyle}>Electricity Price (₹/unit)</label>
                          <input type="number" step="0.5" min="0" className="calc-input" value={calc.evUnitPrice} onChange={(e) => setCalc(p => ({ ...p, evUnitPrice: e.target.value }))} style={{ ...inputStyle, outline: 'none', transition: 'border-color 200ms, box-shadow 200ms' }} placeholder="e.g. 8" />
                          <span style={{ fontSize: '11px', color: '#475569' }}>Edit to match your electricity tariff</span>
                        </div>
                        <div style={{ display: 'grid', gap: '8px' }}>
                          <label style={labelStyle}>Battery Capacity (kWh)</label>
                          <input type="number" step="0.1" min="0" className="calc-input" value={calc.evBatteryKwh} onChange={(e) => setCalc(p => ({ ...p, evBatteryKwh: e.target.value }))} style={{ ...inputStyle, outline: 'none', transition: 'border-color 200ms, box-shadow 200ms' }} placeholder="e.g. 30.2" />
                        </div>
                        <div style={{ display: 'grid', gap: '8px' }}>
                          <label style={labelStyle}>Certified / Actual Range (km)</label>
                          <input type="number" step="1" min="0" className="calc-input" value={calc.evRangeKm} onChange={(e) => setCalc(p => ({ ...p, evRangeKm: e.target.value }))} style={{ ...inputStyle, outline: 'none', transition: 'border-color 200ms, box-shadow 200ms' }} placeholder="e.g. 250" />
                        </div>
                        <div style={{ display: 'grid', gap: '8px' }}>
                          <label style={labelStyle}>Trip Distance (km)</label>
                          <input type="number" step="1" min="0" className="calc-input" value={calc.tripKm} onChange={(e) => setCalc(p => ({ ...p, tripKm: e.target.value }))} style={{ ...inputStyle, outline: 'none', transition: 'border-color 200ms, box-shadow 200ms' }} placeholder="e.g. 150" />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Results */}
                  {calcResults ? (
                    <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '14px' }}>
                      {[
                        { icon: '💸', label: 'Cost per km', value: `₹${calcResults.costPerKm}`, color: '#fbbf24' },
                        { icon: '🧾', label: 'Total Trip Cost', value: `₹${calcResults.totalCost}`, color: '#34d399' },
                        { icon: calcResults.type === 'EV' ? '⚡' : '⛽', label: calcResults.type === 'EV' ? 'Energy needed' : 'Fuel needed', value: calcResults.extraA, color: '#a78bfa' },
                        { icon: calcResults.type === 'EV' ? '🔋' : '📊', label: calcResults.type === 'EV' ? 'Unit price' : 'Efficiency', value: calcResults.extraB, color: '#7dd3fc' },
                      ].map(item => (
                        <div key={item.label} style={{ padding: '16px', borderRadius: '16px', backgroundColor: 'rgba(2,6,23,0.7)', border: '1px solid rgba(148,163,184,0.12)', textAlign: 'center' }}>
                          <div style={{ fontSize: '24px', marginBottom: '6px' }}>{item.icon}</div>
                          <div style={{ fontSize: '20px', fontWeight: 800, color: item.color, marginBottom: '4px' }}>{item.value}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>{item.label}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ marginTop: '20px', padding: '20px', borderRadius: '16px', backgroundColor: 'rgba(2,6,23,0.4)', border: '1px dashed rgba(148,163,184,0.2)', textAlign: 'center', color: '#475569', fontSize: '14px' }}>
                      Fill in the fields above to see cost calculations
                    </div>
                  )}

                  {/* Service Interval Reference Table */}
                  <div style={{ marginTop: '24px', borderTop: '1px solid rgba(148,163,184,0.12)', paddingTop: '20px' }}>
                    <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>📅 Time-Based Service Reference</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
                      {Object.entries(SERVICE_INTERVALS).map(([vt, info]) => (
                        <div key={vt} style={{ padding: '10px 14px', borderRadius: '12px', backgroundColor: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '14px', color: '#cbd5e1' }}>{vehicleTypeIcon(vt)} {vt}</span>
                          <span style={{ fontSize: '13px', color: '#38bdf8', fontWeight: 700 }}>{info.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* ─── Profile Slide-out Panel ─── */}
      {showPersonalDetailsPanel && (
        <>
          <div onClick={() => setShowPersonalDetailsPanel(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 40, animation: 'fadeIn 200ms ease' }} />
          <div style={{ position: 'fixed', right: 0, top: 0, height: '100vh', width: '420px', backgroundColor: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(14px)', boxShadow: '-4px 0 24px rgba(0,0,0,0.4)', zIndex: 50, overflowY: 'auto', animation: 'slideInRight 300ms ease', paddingBottom: '48px' }}>
            <div style={{ padding: '24px', borderBottom: '1px solid rgba(148,163,184,0.16)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '20px' }}>Personal Details</h3>
              <button onClick={() => setShowPersonalDetailsPanel(false)} style={{ backgroundColor: 'transparent', border: 'none', color: '#94a3b8', fontSize: '24px', cursor: 'pointer', padding: '4px 8px' }}>✕</button>
            </div>
            <form onSubmit={handleProfileSubmit} style={{ padding: '24px' }}>
              <p style={{ margin: '0 0 18px 0', color: '#94a3b8', fontSize: '14px', lineHeight: 1.5 }}>Update the operator identity and password tied to this session.</p>
              {(profileError || profileNotice) && (
                <div style={{ padding: '12px 14px', borderRadius: '14px', marginBottom: '16px', backgroundColor: profileError ? 'rgba(127,29,29,0.5)' : 'rgba(6,95,70,0.5)', border: `1px solid ${profileError ? 'rgba(248,113,113,0.45)' : 'rgba(52,211,153,0.35)'}`, color: profileError ? '#fecaca' : '#bbf7d0', fontSize: '14px' }}>
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
              <button type="submit" style={{ width: '100%', padding: '12px 16px', background: 'linear-gradient(135deg,#14b8a6 0%,#0891b2 100%)', color: 'white', border: 'none', borderRadius: '14px', fontWeight: 800, cursor: 'pointer', marginBottom: '12px', fontFamily: 'inherit', fontSize: '15px' }}>Save Changes</button>
              <button type="button" onClick={() => setShowPersonalDetailsPanel(false)} style={{ width: '100%', padding: '12px 16px', background: 'transparent', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '14px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
