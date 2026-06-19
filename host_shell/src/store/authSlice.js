// host_shell/src/store/authSlice.js
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

const API_BASE = 'http://127.0.0.1:5000/api';

// Hydrate from localStorage on bootstrap
const loadStoredUser = () => {
  try {
    const raw = localStorage.getItem('garage_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

// ═══════════════════════════════════════════════
// ASYNC THUNKS
// ═══════════════════════════════════════════════

export const loginUser = createAsyncThunk(
  'auth/login',
  async ({ username, password }, { rejectWithValue }) => {
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) return rejectWithValue(data.error ?? 'Authentication rejected.');
      localStorage.setItem('garage_user', JSON.stringify(data.user));
      return data.user;
    } catch {
      return rejectWithValue('Database link offline.');
    }
  }
);

export const registerUser = createAsyncThunk(
  'auth/register',
  async ({ username, password }, { rejectWithValue }) => {
    try {
      const res = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) return rejectWithValue(data.error ?? 'Registration failed.');
      return true;
    } catch {
      return rejectWithValue('Registration server error.');
    }
  }
);

export const updateUserProfile = createAsyncThunk(
  'auth/updateProfile',
  async ({ userId, profileData }, { rejectWithValue }) => {
    try {
      const res = await fetch(`${API_BASE}/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileData),
      });
      const data = await res.json();
      if (!res.ok) return rejectWithValue(data.error ?? 'Profile update failed.');
      localStorage.setItem('garage_user', JSON.stringify(data.user));
      return data.user;
    } catch {
      return rejectWithValue('Failed to synchronize personal details.');
    }
  }
);

// ═══════════════════════════════════════════════
// SLICE
// ═══════════════════════════════════════════════

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: loadStoredUser(),
    status: 'idle',   // 'idle'|'loading'|'succeeded'|'failed'
    error: null,
    registerSuccess: false,
  },

  reducers: {
    logoutUser(state) {
      state.user = null;
      state.status = 'idle';
      state.error = null;
      localStorage.removeItem('garage_user');
      localStorage.removeItem('fleetkeep_seen_landing');
    },
    clearAuthError(state) {
      state.error = null;
    },
    clearRegisterSuccess(state) {
      state.registerSuccess = false;
    },
  },

  extraReducers: (builder) => {
    // loginUser
    builder
      .addCase(loginUser.pending, (state) => {
        state.status = 'loading'; state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.status = 'succeeded'; state.user = action.payload;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.status = 'failed'; state.error = action.payload;
      });

    // registerUser
    builder
      .addCase(registerUser.pending, (state) => {
        state.status = 'loading'; state.error = null; state.registerSuccess = false;
      })
      .addCase(registerUser.fulfilled, (state) => {
        state.status = 'succeeded'; state.registerSuccess = true;
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.status = 'failed'; state.error = action.payload;
      });

    // updateUserProfile
    builder
      .addCase(updateUserProfile.pending, (state) => {
        state.status = 'loading'; state.error = null;
      })
      .addCase(updateUserProfile.fulfilled, (state, action) => {
        state.status = 'succeeded'; state.user = action.payload;
      })
      .addCase(updateUserProfile.rejected, (state, action) => {
        state.status = 'failed'; state.error = action.payload;
      });
  },
});

export const { logoutUser, clearAuthError, clearRegisterSuccess } = authSlice.actions;
export default authSlice.reducer;

// Selectors
export const selectUser        = (state) => state.auth.user;
export const selectAuthStatus  = (state) => state.auth.status;
export const selectAuthError   = (state) => state.auth.error;
export const selectRegSuccess  = (state) => state.auth.registerSuccess;
