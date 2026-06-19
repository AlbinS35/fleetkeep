// host_shell/src/store/vehicleSlice.js
import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit';

const API_BASE = 'http://127.0.0.1:5000/api';

// ─── Normalizers ───────────────────────────────────────────────────────────────
const normalizeFuelType = (ft) => {
  if (!ft) return 'PETROL';
  return ft.toUpperCase() === 'ICE' ? 'PETROL' : ft.toUpperCase();
};
const normalizeVehicle = (v) => ({
  ...v,
  fuel_type: normalizeFuelType(v.fuel_type),
  vehicle_type: v.vehicle_type?.toUpperCase() ?? 'CAR',
  service_method: v.service_method ?? 'both',
});

// ═══════════════════════════════════════════════
// ASYNC THUNKS
// ═══════════════════════════════════════════════

export const fetchVehicleAssets = createAsyncThunk(
  'vehicles/fetchAll',
  async (userId, { rejectWithValue }) => {
    try {
      const res = await fetch(`${API_BASE}/vehicles?user_id=${userId}`);
      if (!res.ok) {
        const err = await res.json();
        return rejectWithValue(err.error ?? 'Failed to fetch fleet assets.');
      }
      const data = await res.json();
      return data.map(normalizeVehicle);
    } catch {
      return rejectWithValue('Fleet ledger offline — network unreachable.');
    }
  }
);

export const commitAssetToLedger = createAsyncThunk(
  'vehicles/commitAsset',
  async ({ userId, vehicleData }, { rejectWithValue }) => {
    try {
      const res = await fetch(`${API_BASE}/vehicles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...vehicleData, user_id: userId }),
      });
      const data = await res.json();
      if (!res.ok) return rejectWithValue(data.error ?? 'Asset commit rejected by ledger.');
      return data;
    } catch {
      return rejectWithValue('Ledger write failed — transport error.');
    }
  }
);

export const patchAssetRecord = createAsyncThunk(
  'vehicles/patchAsset',
  async ({ userId, vehicleId, vehicleData }, { rejectWithValue }) => {
    try {
      const res = await fetch(`${API_BASE}/vehicles/${vehicleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...vehicleData, user_id: userId }),
      });
      const data = await res.json();
      if (!res.ok) return rejectWithValue(data.error ?? 'Ledger patch rejected.');
      return normalizeVehicle(data.vehicle);
    } catch {
      return rejectWithValue('Asset patch failed — transport error.');
    }
  }
);

export const decommissionAsset = createAsyncThunk(
  'vehicles/decommission',
  async ({ userId, vehicleId }, { rejectWithValue }) => {
    try {
      const res = await fetch(`${API_BASE}/vehicles/${vehicleId}?user_id=${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json();
        return rejectWithValue(err.error ?? 'Decommission rejected by ledger.');
      }
      return vehicleId;
    } catch {
      return rejectWithValue('Decommission transport failure.');
    }
  }
);

// ═══════════════════════════════════════════════
// SLICE
// ═══════════════════════════════════════════════

const vehicleSlice = createSlice({
  name: 'vehicles',
  initialState: {
    assets: [],
    status: 'idle',           // 'idle'|'loading'|'succeeded'|'failed'
    operationStatus: 'idle',  // tracks write ops
    error: null,
    operationError: null,
    activeEditId: null,
    fleetFilter: 'All',
  },

  reducers: {
    setActiveEditId(state, action) { state.activeEditId = action.payload; },
    clearActiveEdit(state) { state.activeEditId = null; },
    setFleetFilter(state, action) { state.fleetFilter = action.payload; },
    clearOperationError(state) { state.operationError = null; },
    resetVehicles(state) {
      state.assets = [];
      state.status = 'idle';
      state.operationStatus = 'idle';
      state.error = null;
      state.operationError = null;
      state.activeEditId = null;
      state.fleetFilter = 'All';
    },
  },

  extraReducers: (builder) => {
    // fetchVehicleAssets
    builder
      .addCase(fetchVehicleAssets.pending, (state) => {
        state.status = 'loading'; state.error = null;
      })
      .addCase(fetchVehicleAssets.fulfilled, (state, action) => {
        state.status = 'succeeded'; state.assets = action.payload;
      })
      .addCase(fetchVehicleAssets.rejected, (state, action) => {
        state.status = 'failed'; state.error = action.payload;
      });

    // commitAssetToLedger
    builder
      .addCase(commitAssetToLedger.pending, (state) => {
        state.operationStatus = 'loading'; state.operationError = null;
      })
      .addCase(commitAssetToLedger.fulfilled, (state) => {
        state.operationStatus = 'succeeded';
      })
      .addCase(commitAssetToLedger.rejected, (state, action) => {
        state.operationStatus = 'failed'; state.operationError = action.payload;
      });

    // patchAssetRecord
    builder
      .addCase(patchAssetRecord.pending, (state) => {
        state.operationStatus = 'loading'; state.operationError = null;
      })
      .addCase(patchAssetRecord.fulfilled, (state, action) => {
        state.operationStatus = 'succeeded';
        const idx = state.assets.findIndex((v) => v.id === action.payload.id);
        if (idx !== -1) state.assets[idx] = action.payload;
        state.activeEditId = null;
      })
      .addCase(patchAssetRecord.rejected, (state, action) => {
        state.operationStatus = 'failed'; state.operationError = action.payload;
      });

    // decommissionAsset — optimistic
    builder
      .addCase(decommissionAsset.pending, (state, action) => {
        const vehicleId = action.meta.arg.vehicleId;
        state.assets = state.assets.filter((v) => v.id !== vehicleId);
        state.operationStatus = 'loading';
      })
      .addCase(decommissionAsset.fulfilled, (state) => {
        state.operationStatus = 'succeeded';
      })
      .addCase(decommissionAsset.rejected, (state, action) => {
        state.operationStatus = 'failed';
        state.operationError = action.payload;
        state.status = 'idle'; // triggers re-fetch to restore asset
      });
  },
});

export const {
  setActiveEditId, clearActiveEdit,
  setFleetFilter, clearOperationError, resetVehicles,
} = vehicleSlice.actions;

export default vehicleSlice.reducer;

// ═══════════════════════════════════════════════
// MEMOIZED SELECTORS
// ═══════════════════════════════════════════════

const selectAllAssets   = (state) => state.vehicles.assets;
const selectFleetFilter = (state) => state.vehicles.fleetFilter;

export const selectFilteredAssets = createSelector(
  [selectAllAssets, selectFleetFilter],
  (assets, filter) =>
    filter === 'All' ? assets : assets.filter(
      (v) => v.vehicle_type === filter.toUpperCase()
    )
);

export const selectActiveEditVehicle = createSelector(
  [selectAllAssets, (state) => state.vehicles.activeEditId],
  (assets, id) => assets.find((v) => v.id === id) ?? null
);

export const selectServiceOverdueCount = createSelector(
  [selectAllAssets],
  (assets) => {
    const today = new Date();
    return assets.filter((v) => {
      const kmOverdue = v.next_service_odo > 0 && (v.next_service_odo - v.odometer) <= 0;
      let timeOverdue = false;
      if (v.last_service_date && v.service_period_months) {
        const d = new Date(v.last_service_date);
        d.setMonth(d.getMonth() + Number(v.service_period_months));
        timeOverdue = d < today;
      }
      return kmOverdue || timeOverdue;
    }).length;
  }
);
