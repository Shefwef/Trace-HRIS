import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, LogIn, Users2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { Field, TextInput } from '../components/ui/Field';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';
import './Login.css';

export function Login() {
  const navigate = useNavigate();
  const users = useStore((s) => s.users);
  const login = useStore((s) => s.login);
  const [email, setEmail] = useState('nazmul@company.com');
  const [password, setPassword] = useState('demo');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setTimeout(() => {
      const user = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
      if (!user) {
        setError('No account matches that email.');
        setLoading(false);
        return;
      }
      login(user.id);
      if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') navigate('/admin');
      else navigate('/');
    }, 400);
  }

  function quickPick(userId: string) {
    login(userId);
    const u = users.find((x) => x.id === userId)!;
    if (u.role === 'ADMIN' || u.role === 'SUPER_ADMIN') navigate('/admin');
    else navigate('/');
  }

  return (
    <div className="login">
      <div className="login-left">
        <div className="login-pattern" />
        <div className="login-brand">
          <svg viewBox="0 0 32 32" width="40" height="40">
            <rect width="32" height="32" rx="8" fill="url(#gg)" />
            <circle cx="16" cy="13" r="5" fill="white" />
            <path d="M6 27c0-5 4.5-9 10-9s10 4 10 9" fill="white" />
            <defs>
              <linearGradient id="gg" x1="0" x2="32" y1="0" y2="32">
                <stop stopColor="#2C5282" />
                <stop offset="1" stopColor="#3182CE" />
              </linearGradient>
            </defs>
          </svg>
          <div>
            <div className="login-brand-name">HRIS</div>
            <div className="login-brand-tag">People, simplified.</div>
          </div>
        </div>
        <div className="login-hero">
          <h1>Every leave. Every hour. Everyone.</h1>
          <p>
            A calmer way to run your people operations — with balances that always
            add up, dashboards you can actually read, and approvals that take
            seconds, not screens.
          </p>
          <div className="login-hero-facts">
            <div>
              <strong>24 days</strong>
              <span>Standard annual leave</span>
            </div>
            <div>
              <strong>2 taps</strong>
              <span>Approve or reject</span>
            </div>
            <div>
              <strong>Live</strong>
              <span>Attendance timer</span>
            </div>
          </div>
        </div>
      </div>

      <div className="login-right">
        <motion.form
          className="login-card"
          onSubmit={submit}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <h2>Sign in to HRIS</h2>
          <p className="login-sub">Welcome back — enter your work email to continue.</p>

          <Field label="Work email" required>
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              required
            />
          </Field>

          <Field label="Password" required>
            <div className="login-password">
              <TextInput
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="login-password-toggle"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>

          {error && <div className="login-error">{error}</div>}

          <div className="login-row">
            <label className="login-check">
              <input type="checkbox" defaultChecked /> Remember this device
            </label>
            <a href="#forgot" onClick={(e) => e.preventDefault()}>
              Forgot password?
            </a>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={loading}
            leadingIcon={<LogIn size={16} />}
          >
            Sign in
          </Button>

          <div className="login-divider"><span>Demo accounts</span></div>

          <div className="login-quick">
            {users.slice(0, 4).map((u) => (
              <button
                key={u.id}
                type="button"
                className="login-quick-item"
                onClick={() => quickPick(u.id)}
              >
                <Avatar initials={u.initials} color={u.avatarColor} size="sm" />
                <div>
                  <div className="login-quick-name">{u.fullName.split(' ')[0]}</div>
                  <div className="login-quick-role">
                    {u.role === 'ADMIN' ? 'Admin' : 'Employee'}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <p className="login-foot">
            <Users2 size={12} /> Accounts are created by your HR admin.
          </p>
        </motion.form>
      </div>
    </div>
  );
}
