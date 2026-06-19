import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  loginUser, registerUser,
  clearAuthError, clearRegisterSuccess,
  selectAuthError, selectAuthStatus, selectRegSuccess,
} from '../store/authSlice';
import '../assets/styles/pages.css';

export default function AuthGate({ initialMode = 'login', onBack }) {
  const dispatch = useDispatch();
  const authError     = useSelector(selectAuthError);
  const authStatus    = useSelector(selectAuthStatus);
  const regSuccess    = useSelector(selectRegSuccess);

  const [isLogin, setIsLogin]             = useState(initialMode === 'login');
  const [username, setUsername]           = useState('');
  const [password, setPassword]           = useState('');
  const [validationError, setValidation]  = useState('');

  // Switch mode clears server errors
  useEffect(() => {
    dispatch(clearAuthError());
    setValidation('');
  }, [isLogin, dispatch]);

  // Registration success → auto-switch to login
  useEffect(() => {
    if (regSuccess) {
      dispatch(clearRegisterSuccess());
      setIsLogin(true);
      setUsername('');
      setPassword('');
      alert('Account created successfully. You can now log in.');
    }
  }, [regSuccess, dispatch]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidation('');
    dispatch(clearAuthError());

    if (username.trim().length < 3) {
      setValidation('Username must be at least 3 characters.'); return;
    }
    if (password.length < 6) {
      setValidation('Password must be at least 6 characters.'); return;
    }

    if (isLogin) {
      dispatch(loginUser({ username, password }));
    } else {
      dispatch(registerUser({ username, password }));
    }
  };

  const isLoading = authStatus === 'loading';
  const displayError = validationError || authError;

  return (
    <div className="page auth">
      <form onSubmit={handleSubmit} className="auth-card">
        {onBack && (
          <button type="button" className="auth-back" onClick={onBack}>
            ← Back
          </button>
        )}
        <h2 className="auth-title">
          {isLogin ? 'Welcome back' : 'Create account'}
        </h2>
        <p className="auth-subtitle">
          {isLogin
            ? 'Sign in to manage your fleet records and vehicle data.'
            : 'Set up your account to start tracking your vehicles.'}
        </p>

        {displayError && (
          <div className="auth-error">{displayError}</div>
        )}

        <div className="auth-field">
          <label className="auth-label">Username</label>
          <input
            type="text"
            className="auth-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            disabled={isLoading}
            required
          />
        </div>

        <div className="auth-field">
          <label className="auth-label">Password</label>
          <input
            type="password"
            className="auth-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            disabled={isLoading}
            required
          />
        </div>

        <button type="submit" className="auth-submit" disabled={isLoading}>
          {isLoading ? 'Please wait…' : isLogin ? 'Log In' : 'Sign Up'}
        </button>

        <p className="auth-switcher">
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <span
            className="auth-switch-link"
            onClick={() => { setIsLogin(!isLogin); setValidation(''); }}
          >
            {isLogin ? 'Sign up' : 'Log in'}
          </span>
        </p>
      </form>
    </div>
  );
}
