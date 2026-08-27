import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { ArrowRight, LogIn, ShieldCheck, Users, Calendar, Timer } from 'lucide-react';
import './landing.css';

export default async function LandingPage() {
  const { userId } = await auth();
  if (userId) redirect('/dashboard');

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-brand">
          <img
            src="/Trace%20Consulting%20Logo%20Dark.png"
            alt="Trace Consulting"
            width={40}
            height={40}
            className="landing-brand-logo"
          />
          <div>
            <div className="landing-brand-name">HRIS</div>
            <div className="landing-brand-tag">People, simplified.</div>
          </div>
        </div>
        <Link href="/sign-in" className="landing-nav-cta">
          <LogIn size={16} />
          Sign in
        </Link>
      </header>

      <main className="landing-hero">
        <div className="landing-hero-inner">
          <div className="landing-hero-text">
            <div className="landing-eyebrow">Trace Consulting · Internal</div>
            <h1>Every leave. Every hour. Everyone.</h1>
            <p>
              A calmer way to run your people operations — with balances that always
              add up, dashboards you can actually read, and approvals that take
              seconds, not screens.
            </p>
            <div className="landing-actions">
              <Link href="/sign-in" className="landing-btn landing-btn-primary">
                Sign in to your account <ArrowRight size={16} />
              </Link>
              <a href="mailto:shefadib@gmail.com" className="landing-btn landing-btn-ghost">
                Need access?
              </a>
            </div>
            <div className="landing-note">
              <ShieldCheck size={14} />
              This is an invite-only system for Trace Consulting staff.
            </div>
          </div>
          <div className="landing-hero-cards">
            <div className="landing-card">
              <div className="landing-card-icon" style={{ background: 'var(--color-info-light)', color: 'var(--color-brand-primary)' }}>
                <Calendar size={20} />
              </div>
              <h3>Leave management</h3>
              <p>Apply, approve, and track casual, sick and replacement leaves — with time-range partial leave support.</p>
            </div>
            <div className="landing-card">
              <div className="landing-card-icon" style={{ background: 'var(--color-leave-replacement-light)', color: 'var(--color-leave-replacement)' }}>
                <Timer size={20} />
              </div>
              <h3>Attendance tracking</h3>
              <p>Live clock-in / clock-out with break tracking. Extra work on weekends earns replacement leave days.</p>
            </div>
            <div className="landing-card">
              <div className="landing-card-icon" style={{ background: 'var(--color-leave-holiday-light)', color: 'var(--color-brand-primary)' }}>
                <Users size={20} />
              </div>
              <h3>Team overview</h3>
              <p>HR and leadership see the whole team at a glance — who's in, who's out, what's coming up.</p>
            </div>
          </div>
        </div>
      </main>

      <footer className="landing-footer">
        <span>© {new Date().getFullYear()} Trace Consulting Ltd</span>
        <span>Powered by HRIS</span>
      </footer>
    </div>
  );
}
