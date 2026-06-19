// host_shell/src/components/LandingPage.jsx
import '../assets/styles/pages.css';

export default function LandingPage({ onNavigateToAuth, onNavigateToSignup }) {
  const features = [
    { icon: '🚗', title: 'Fleet Registry', description: 'Register and manage all your vehicles with detailed records in one secure dashboard.' },
    { icon: '🔧', title: 'Service Tracking', description: 'Dual-trigger service: whichever KM milestone or time interval arrives first fires the alert.' },
    { icon: '📋', title: 'Document Expiry', description: 'Track RC, Insurance, Fitness, and Pollution certificates with smart expiry alerts.' },
    { icon: '⚡', title: 'RTK Powered', description: 'Memoized selectors, optimistic UI, and Redux DevTools — enterprise-grade state management.' },
  ];

  return (
    <div className="page">
      <nav className="landing-nav">
        <div className="landing-logo">
          <div className="landing-logo-icon">FK</div>
          <span className="landing-logo-text">FleetKeep</span>
        </div>
        <div className="landing-nav-links">
          <button className="landing-nav-link landing-nav-link--ghost" onClick={onNavigateToAuth}>Log in</button>
          <button className="landing-nav-link landing-nav-link--primary" onClick={onNavigateToSignup}>Sign up</button>
        </div>
      </nav>

      <section className="landing-hero">
        <div className="landing-badge">✨ Vehicle management, simplified</div>
        <h1 className="landing-title">Your Fleet, Always in Check</h1>
        <p className="landing-subtitle">
          Track vehicles, service schedules, and document expiries — all in one
          clean dashboard built for fleet operators.
        </p>
        <div className="landing-cta">
          <button className="landing-cta-btn landing-cta-btn--primary" onClick={onNavigateToAuth}>Get Started →</button>
          <button className="landing-cta-btn landing-cta-btn--secondary" onClick={onNavigateToSignup}>Create Account</button>
        </div>
      </section>

      <section className="landing-features">
        {features.map((f, i) => (
          <div className="landing-feature" key={i}>
            <div className="landing-feature-icon">{f.icon}</div>
            <h3 className="landing-feature-title">{f.title}</h3>
            <p className="landing-feature-desc">{f.description}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
