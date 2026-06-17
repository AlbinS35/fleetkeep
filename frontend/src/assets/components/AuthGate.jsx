import { useState } from 'react';
import { useGarage } from '../context/GarageContext';

export default function AuthGate({ initialMode = 'login' }) {
  const { loginUser, registerUser, error } = useGarage();
  const [isLogin, setIsLogin] = useState(initialMode === 'login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [validationError, setValidationError] = useState('');

  const pageStyles = {
    shell: {
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      background:
        'radial-gradient(circle at top left, rgba(56, 189, 248, 0.18), transparent 36%), radial-gradient(circle at bottom right, rgba(99, 102, 241, 0.18), transparent 32%), linear-gradient(135deg, #050816 0%, #0b1120 45%, #121b31 100%)',
      color: '#e2e8f0',
      fontFamily: 'Inter, "Segoe UI", sans-serif'
    },
    card: {
      width: '100%',
      maxWidth: '460px',
      position: 'relative',
      overflow: 'hidden',
      borderRadius: '28px',
      padding: '34px',
      border: '1px solid rgba(148, 163, 184, 0.2)',
      background: 'rgba(15, 23, 42, 0.76)',
      boxShadow: '0 28px 80px rgba(0, 0, 0, 0.45)',
      backdropFilter: 'blur(18px)',
      WebkitBackdropFilter: 'blur(18px)'
    },
    glow: {
      position: 'absolute',
      inset: '-120px auto auto -110px',
      width: '220px',
      height: '220px',
      borderRadius: '999px',
      background: 'radial-gradient(circle, rgba(56, 189, 248, 0.26), transparent 68%)',
      pointerEvents: 'none'
    },
    eyebrow: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      borderRadius: '999px',
      background: 'rgba(148, 163, 184, 0.1)',
      border: '1px solid rgba(148, 163, 184, 0.16)',
      color: '#93c5fd',
      fontSize: '12px',
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      marginBottom: '18px'
    },
    title: {
      margin: '0 0 10px',
      fontSize: '34px',
      lineHeight: 1.05,
      letterSpacing: '-0.04em',
      color: '#f8fafc'
    },
    subtitle: {
      margin: '0 0 28px',
      color: '#94a3b8',
      lineHeight: 1.6,
      fontSize: '15px'
    },
    error: {
      padding: '12px 14px',
      marginBottom: '18px',
      borderRadius: '14px',
      border: '1px solid rgba(248, 113, 113, 0.45)',
      background: 'rgba(127, 29, 29, 0.45)',
      color: '#fecaca',
      fontSize: '14px',
      lineHeight: 1.5
    },
    field: {
      display: 'grid',
      gap: '8px',
      marginBottom: '18px'
    },
    label: {
      fontSize: '12px',
      fontWeight: 700,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color: '#cbd5e1'
    },
    input: {
      width: '100%',
      boxSizing: 'border-box',
      padding: '14px 16px',
      borderRadius: '16px',
      border: '1px solid rgba(148, 163, 184, 0.2)',
      background: 'rgba(15, 23, 42, 0.95)',
      color: '#f8fafc',
      outline: 'none',
      fontSize: '15px',
      transition: 'border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease'
    },
    button: {
      width: '100%',
      padding: '14px 16px',
      border: 'none',
      borderRadius: '16px',
      fontWeight: 800,
      fontSize: '15px',
      letterSpacing: '0.02em',
      color: '#eff6ff',
      cursor: 'pointer',
      background: 'linear-gradient(135deg, #38bdf8 0%, #2563eb 55%, #1d4ed8 100%)',
      boxShadow: '0 18px 38px rgba(37, 99, 235, 0.35)',
      transition: 'transform 180ms ease, box-shadow 180ms ease, filter 180ms ease'
    },
    switcher: {
      marginTop: '20px',
      textAlign: 'center',
      color: '#94a3b8',
      fontSize: '14px',
      lineHeight: 1.6
    },
    switchLink: {
      color: '#7dd3fc',
      cursor: 'pointer',
      fontWeight: 700,
      textDecoration: 'none',
      borderBottom: '1px solid rgba(125, 211, 252, 0.45)'
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');

    // Strict Client-Side Input Validations
    if (username.trim().length < 3) {
      setValidationError('Operator ID identity code must be at least 3 characters.');
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
        alert('Terminal registration logged in local database cache. You can now login.');
      }
    }
  };

  return (
    <div style={pageStyles.shell}>
      <form onSubmit={handleAuthSubmit} style={pageStyles.card}>
        <div style={pageStyles.glow} />
        <div style={pageStyles.eyebrow}>{isLogin ? 'Secure Access' : 'Create Account'}</div>
        <h2 style={pageStyles.title}>{isLogin ? 'Welcome back' : 'Create your profile'}</h2>
        <p style={pageStyles.subtitle}>
          {isLogin
            ? 'Sign in to continue managing your fleet records, service reminders, and vehicle registry.'
            : 'Set up a new account to start tracking vehicles, maintenance, and operational history.'}
        </p>
        
        {(validationError || error) && (
          <div style={pageStyles.error}>
            {validationError || error}
          </div>
        )}

        <div style={pageStyles.field}>
          <label style={pageStyles.label}>User ID</label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Enter your user ID"
            style={pageStyles.input}
            required
          />
        </div>

        <div style={pageStyles.field}>
          <label style={pageStyles.label}>Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter your password"
            style={pageStyles.input}
            required
          />
        </div>

        <button type="submit" style={pageStyles.button}>
          {isLogin ? 'Login' : 'Sign Up'}
        </button>

        <p style={pageStyles.switcher}>
          {isLogin ? 'New user?' : 'Already have an account?'}{' '}
          <span
            onClick={() => {
              setIsLogin(!isLogin);
              setValidationError('');
            }}
            style={pageStyles.switchLink}
          >
            {isLogin ? 'Sign up here' : 'Back to login'}
          </span>
        </p>
      </form>
    </div>
  );
}