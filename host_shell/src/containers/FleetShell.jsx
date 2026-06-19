// host_shell/src/containers/FleetShell.jsx
// Federation Consumer — lazy-loads Dashboard from remote_garage micro-app
import React, { lazy, Suspense } from 'react';
import { Provider } from 'react-redux';
import { store } from '../store';

// ─── Federated Import ─────────────────────────────────────────────────────────
// Maps to: host_shell/vite.config.js → remotes.remote_garage
// → http://localhost:5174/assets/remoteEntry.js → exposes['./Dashboard']
const RemoteDashboard = lazy(() => import('remote_garage/Dashboard'));

// ─── Shimmer Skeleton ─────────────────────────────────────────────────────────
function FleetSkeletonLoader() {
  const shimmer = {
    background: 'linear-gradient(90deg,rgba(30,41,59,0.8) 25%,rgba(51,65,85,0.5) 50%,rgba(30,41,59,0.8) 75%)',
    backgroundSize: '200% 100%',
    animation: 'fk-shimmer 1.5s infinite',
    borderRadius: '16px',
  };

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '400px 1fr',
      gap: '28px',
      padding: '32px 20px',
      maxWidth: '1360px',
      margin: '0 auto',
    }}>
      <style>{`
        @keyframes fk-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      <div style={{ display: 'grid', gap: '16px' }}>
        <div style={{ ...shimmer, height: '620px' }} />
      </div>
      <div style={{ display: 'grid', gap: '16px' }}>
        <div style={{ ...shimmer, height: '40px', width: '300px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: '18px' }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ ...shimmer, height: '420px' }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Federation Error Boundary ────────────────────────────────────────────────
class FederationErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error) {
    const isNetwork = error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError');
    const isChunk   = error.message?.includes('Loading chunk') || error.message?.includes('ChunkLoadError');
    return {
      hasError: true,
      errorMessage: isNetwork
        ? 'Fleet panel offline — remote_garage service unreachable on port 5174. Run: npm run dev inside remote_garage/'
        : isChunk
        ? 'Asset chunk failed to load — check remote_garage build output.'
        : `Federation error: ${error.message}`,
    };
  }

  componentDidCatch(error, info) {
    console.error('[FEDERATION ERROR BOUNDARY]', { remote: 'remote_garage', error: error.message, stack: info.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '48px', textAlign: 'center',
          backgroundColor: 'rgba(127,29,29,0.3)',
          border: '1px solid rgba(248,113,113,0.35)',
          borderRadius: '22px', margin: '32px', color: '#fecaca',
        }}>
          <div style={{ fontSize: '36px', marginBottom: '16px' }}>⚡</div>
          <h3 style={{ margin: '0 0 12px', fontSize: '18px' }}>Fleet Panel Unavailable</h3>
          <p style={{ color: '#fca5a5', fontSize: '14px', margin: '0 0 20px' }}>{this.state.errorMessage}</p>
          <button
            onClick={() => this.setState({ hasError: false, errorMessage: null })}
            style={{ padding: '10px 24px', background: 'linear-gradient(135deg,#38bdf8,#2563eb)', border: 'none', borderRadius: '12px', color: 'white', cursor: 'pointer', fontWeight: 700 }}
          >
            Retry Connection
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Fleet Shell Container ─────────────────────────────────────────────────────
// Provider passes the host's Redux store into the remote component tree.
// Since react-redux is a shared singleton dep, the remote's useSelector/
// useDispatch hooks connect to THIS store — not an isolated remote store.
export default function FleetShell() {
  return (
    <Provider store={store}>
      <FederationErrorBoundary>
        <Suspense fallback={<FleetSkeletonLoader />}>
          <RemoteDashboard />
        </Suspense>
      </FederationErrorBoundary>
    </Provider>
  );
}
