// host_shell/src/store/index.js
import { configureStore } from '@reduxjs/toolkit';
import vehicleReducer from './vehicleSlice';
import authReducer from './authSlice';

export const store = configureStore({
  reducer: {
    vehicles: vehicleReducer,
    auth: authReducer,
  },
  devTools: import.meta.env.DEV,
});
