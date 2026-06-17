export default function LandingPage({ onNavigateToAuth, onNavigateToSignup }) {
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
      fontFamily: 'Inter, "Segoe UI", sans-serif',
      overflow: 'hidden'
    },
    container: {
      width: '100%',
      maxWidth: '900px'
    },
    hero: {
      textAlign: 'center',
      marginBottom: '48px',
      animation: 'fadeIn 0.6s ease-in'
    },
    logo: {
      fontSize: '48px',
      marginBottom: '16px',
      fontWeight: 800
    },
    title: {
      fontSize: '52px',
      fontWeight: 800,
      lineHeight: 1.1,
      letterSpacing: '-0.04em',
      marginBottom: '16px',
      background: 'linear-gradient(135deg, #38bdf8 0%, #7c3aed 100%)',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text'
    },
    subtitle: {
      fontSize: '18px',
      color: '#94a3b8',
      lineHeight: 1.6,
      marginBottom: '36px',
      maxWidth: '600px',
      margin: '0 auto 36px'
    },
    featuresGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
      gap: '20px',
      marginBottom: '48px'
    },
    featureCard: {
      padding: '28px 24px',
      borderRadius: '20px',
      border: '1px solid rgba(148, 163, 184, 0.2)',
      background: 'rgba(15, 23, 42, 0.5)',
      backdropFilter: 'blur(10px)',
      transition: 'all 200ms ease',
      cursor: 'default'
    },
    featureIcon: {
      fontSize: '32px',
      marginBottom: '12px'
    },
    featureTitle: {
      fontSize: '18px',
      fontWeight: 700,
      marginBottom: '8px',
      color: '#f8fafc'
    },
    featureDesc: {
      fontSize: '14px',
      color: '#94a3b8',
      lineHeight: 1.6
    },
    ctaButtons: {
      display: 'flex',
      gap: '16px',
      justifyContent: 'center',
      flexWrap: 'wrap',
      marginTop: '32px'
    },
    primaryButton: {
      padding: '16px 40px',
      fontSize: '16px',
      fontWeight: 800,
      borderRadius: '16px',
      border: 'none',
      cursor: 'pointer',
      background: 'linear-gradient(135deg, #38bdf8 0%, #2563eb 55%, #1d4ed8 100%)',
      color: '#eff6ff',
      boxShadow: '0 18px 38px rgba(37, 99, 235, 0.35)',
      transition: 'all 180ms ease'
    },
    secondaryButton: {
      padding: '16px 40px',
      fontSize: '16px',
      fontWeight: 800,
      borderRadius: '16px',
      border: '2px solid rgba(148, 163, 184, 0.3)',
      cursor: 'pointer',
      background: 'transparent',
      color: '#7dd3fc',
      transition: 'all 180ms ease'
    }
  };

  const features = [
    {
      icon: '🚗',
      title: 'Fleet Management',
      description: 'Track all your vehicles in one secure location with easy registration and access.'
    },
    {
      icon: '🔧',
      title: 'Service Reminders',
      description: 'Never miss a maintenance deadline with automatic service milestone tracking.'
    },
    {
      icon: '📋',
      title: 'Document Tracking',
      description: 'Keep track of RC, Tax, Insurance, Fitness, and Pollution certificates all in one place.'
    },
    {
      icon: '⏰',
      title: 'Expiry Alerts',
      description: 'Get notified before your vehicle documents expire so you can renew them on time.'
    }
  ];

  return (
    <div style={pageStyles.shell}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        button:hover {
          transform: translateY(-2px) !important;
          box-shadow: 0 20px 40px rgba(37, 99, 235, 0.4) !important;
        }
      `}</style>

      <div style={pageStyles.container}>
        <div style={pageStyles.hero}>
          <div style={pageStyles.logo}>🛡️</div>
          <h1 style={pageStyles.title}>FleetKeep</h1>
          <p style={pageStyles.subtitle}>
            Your complete vehicle management and maintenance tracking system. Keep your fleet organized,
            compliant, and ready to roll.
          </p>
        </div>

        <div style={pageStyles.featuresGrid}>
          {features.map((feature, idx) => (
            <div key={idx} style={pageStyles.featureCard}>
              <div style={pageStyles.featureIcon}>{feature.icon}</div>
              <h3 style={pageStyles.featureTitle}>{feature.title}</h3>
              <p style={pageStyles.featureDesc}>{feature.description}</p>
            </div>
          ))}
        </div>

        <div style={pageStyles.ctaButtons}>
          <button
            onClick={onNavigateToAuth}
            style={pageStyles.primaryButton}
            onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
            onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
          >
            Login to Your Account
          </button>
          <button
            onClick={onNavigateToSignup}
            style={pageStyles.secondaryButton}
            onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
            onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
          >
            Create New Account
          </button>
        </div>
      </div>
    </div>
  );
}
