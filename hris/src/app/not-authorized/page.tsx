import Link from 'next/link';
import { SignOutButton } from '@clerk/nextjs';
import { ShieldAlert, LogOut } from 'lucide-react';
import './not-authorized.css';

export const metadata = { title: 'Access denied · HRIS' };

export default function NotAuthorizedPage() {
  return (
    <div className="denied">
      <div className="denied-card">
        <div className="denied-icon"><ShieldAlert size={44} /></div>
        <h1>You're not on the invite list.</h1>
        <p>
          HRIS is an invite-only system for TRACE Consulting staff. Your account
          was authenticated but not authorized to use this application.
        </p>
        <p>
          If you believe this is a mistake, please contact your HR administrator
          at <a href="mailto:shefadib@gmail.com">shefadib@gmail.com</a>.
        </p>
        <div className="denied-actions">
          <SignOutButton>
            <button className="denied-btn denied-btn-primary">
              <LogOut size={14} /> Sign out
            </button>
          </SignOutButton>
          <Link href="/" className="denied-btn denied-btn-ghost">
            Back to homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
