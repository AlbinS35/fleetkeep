import { useState } from 'react';
import { useGarage } from '../context/GarageContext';
import '../styles/pages.css';

export default function AuthGate({ initialMode = 'login', onBack }) {
  const { loginUser, registerUser, error } = useGarage();
  const [isLogin, setIsLogin] = useState(initialMode === 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');

    if (username.trim().length < 3) {
      setValidationError('Username must be at least 3 characters.');
      return;
    }
    if (password.length < 6) {
      setValidationError('Password must be at least 6 characters.');
      return;
    }

    if (isLogin) {
      await loginUser(username, password);
    } else {
      const success = await registerUser(username, password);
      if (success) {
        setIsLogin(true);
        setUsername('');
        setPassword('');
        alert('Account created successfully. You can now log in.');
      }
    }
  };

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

        {(validationError || error) && (
          <div className="auth-error">{validationError || error}</div>
        )}

        <div className="auth-field">
          <label className="auth-label">Username</label>
          <input
            type="text"
            className="auth-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
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
            required
          />
        </div>

        <button type="submit" className="auth-submit">
          {isLogin ? 'Log In' : 'Sign Up'}
        </button>

        <p className="auth-switcher">
          {isLogin ? "Don't have an account? " : 'Already have an account? '}
          <span
            className="auth-switch-link"
            onClick={() => {
              setIsLogin(!isLogin);
              setValidationError('');
            }}
          >
            {isLogin ? 'Sign up' : 'Log in'}
          </span>
        </p>
      </form>
    </div>
  );
}