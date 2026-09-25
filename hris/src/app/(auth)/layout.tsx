import './auth.css';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <div className="auth-left">
        <div className="auth-pattern" aria-hidden />
        <div className="auth-brand">
          <img
            src="/Trace%20HRIS%20Transparent%20White.png"
            alt="TRACE HRMS"
            className="auth-brand-logo"
          />
        </div>
        <div className="auth-hero">
          <h1>Every leave. Every hour. Everyone.</h1>
          <p>
            A calmer way to run your people operations — with balances that always add up,
            dashboards you can actually read, and approvals that take seconds, not screens.
          </p>
        </div>
      </div>
      <div className="auth-right">
        <div className="auth-mobile-brand">
          <img src="/Trace%20HRIS%20Transparent.png" alt="TRACE HRMS" />
        </div>
        {children}
      </div>
    </div>
  );
}
