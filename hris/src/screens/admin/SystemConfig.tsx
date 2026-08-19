'use client';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Database, Server, ShieldCheck, Mail, Cog } from 'lucide-react';
import { useSystemStatus } from '@/lib/hooks';
import { fmtDate } from '../../lib/utils';
import './SystemConfig.css';

export function SystemConfig() {
  const { data, isLoading, refetch, isFetching } = useSystemStatus();

  return (
    <div className="sysc">
      <div className="sysc-head">
        <div>
          <h1>System configuration</h1>
          <p className="muted">
            Real-time health snapshot. Super Admin only.
            {data && (
              <> Last checked <strong>{fmtDate(data.checkedAt, 'd MMM · HH:mm:ss')}</strong>.</>
            )}
          </p>
        </div>
        <button className="sysc-refresh" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? 'Checking…' : 'Refresh'}
        </button>
      </div>

      {isLoading || !data ? (
        <div className="muted">Loading system status…</div>
      ) : (
        <>
          <motion.div
            className={`sysc-banner ${data.ok ? 'sysc-banner-ok' : 'sysc-banner-bad'}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {data.ok ? <CheckCircle2 size={28} /> : <XCircle size={28} />}
            <div>
              <div className="sysc-banner-title">
                {data.ok ? 'All systems operational' : 'One or more checks failed'}
              </div>
              <div className="sysc-banner-body">
                {data.ok
                  ? 'Database, auth and email integrations are healthy.'
                  : 'See the details below and check the corresponding service.'}
              </div>
            </div>
          </motion.div>

          <div className="sysc-grid">
            <section className="card sysc-card">
              <div className="sysc-card-head">
                <Database size={18} />
                <h3>Database (Neon Postgres)</h3>
                <span className={`sysc-status ${data.db.ok ? 'sysc-ok' : 'sysc-bad'}`}>
                  {data.db.ok ? 'Online' : 'Down'}
                </span>
              </div>
              <div className="sysc-row"><span>Host</span><strong className="mono">{data.env.databaseUrlHost ?? '—'}</strong></div>
              <div className="sysc-row"><span>Round-trip latency</span><strong>{data.db.latencyMs} ms</strong></div>
              {data.db.error && (
                <div className="sysc-error">Error: {data.db.error}</div>
              )}
              {data.db.counts && (
                <>
                  <div className="sysc-subhead">Row counts</div>
                  <div className="sysc-counts">
                    {Object.entries(data.db.counts).map(([k, v]) => (
                      <div key={k} className="sysc-count">
                        <span>{k}</span>
                        <strong>{v}</strong>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>

            <section className="card sysc-card">
              <div className="sysc-card-head">
                <ShieldCheck size={18} />
                <h3>Auth (Clerk)</h3>
                <span className={`sysc-status ${data.env.clerkConfigured ? 'sysc-ok' : 'sysc-bad'}`}>
                  {data.env.clerkConfigured ? 'Configured' : 'Missing key'}
                </span>
              </div>
              <div className="sysc-row"><span>CLERK_SECRET_KEY</span><strong>{data.env.clerkConfigured ? 'Set' : 'MISSING'}</strong></div>
              <div className="sysc-row"><span>Allowlist enforcement</span><strong>Server-side (users must exist in DB)</strong></div>
              <div className="sysc-row"><span>Sign-up route</span><strong>Removed (invite-only)</strong></div>
            </section>

            <section className="card sysc-card">
              <div className="sysc-card-head">
                <Mail size={18} />
                <h3>Email (Resend)</h3>
                <span className={`sysc-status ${data.env.resendConfigured ? 'sysc-ok' : 'sysc-bad'}`}>
                  {data.env.resendConfigured ? 'Configured' : 'Missing key'}
                </span>
              </div>
              <div className="sysc-row"><span>RESEND_API_KEY</span><strong>{data.env.resendConfigured ? 'Set' : 'MISSING'}</strong></div>
              <div className="sysc-row"><span>Send-time sender</span><strong>Reads from SystemSettings</strong></div>
              <div className="sysc-row"><span>Every send logged</span><strong>email_log table</strong></div>
            </section>

            <section className="card sysc-card">
              <div className="sysc-card-head">
                <Server size={18} />
                <h3>Runtime</h3>
                <span className="sysc-status sysc-ok">Live</span>
              </div>
              <div className="sysc-row"><span>Node version</span><strong className="mono">{data.env.node}</strong></div>
              <div className="sysc-row"><span>Environment</span><strong>{data.env.nodeEnv ?? 'unknown'}</strong></div>
              <div className="sysc-row"><span>App URL</span><strong className="mono">{data.env.nextPublicAppUrl ?? 'not set'}</strong></div>
            </section>

            <section className="card sysc-card sysc-card-wide">
              <div className="sysc-card-head">
                <Cog size={18} />
                <h3>Security posture</h3>
                <span className="sysc-status sysc-ok">Baseline in place</span>
              </div>
              <div className="sysc-security">
                <div className="sysc-security-item">
                  <CheckCircle2 size={14} color="var(--color-success)" />
                  <div>
                    <strong>HTTP security headers</strong>
                    <p>X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, HSTS.</p>
                  </div>
                </div>
                <div className="sysc-security-item">
                  <CheckCircle2 size={14} color="var(--color-success)" />
                  <div>
                    <strong>Server-side role guards</strong>
                    <p>Every API route checks authenticated user + role via <span className="mono">requireAuth</span> / <span className="mono">canApprove</span>.</p>
                  </div>
                </div>
                <div className="sysc-security-item">
                  <CheckCircle2 size={14} color="var(--color-success)" />
                  <div>
                    <strong>Input validation (Zod)</strong>
                    <p>All POST/PATCH bodies validated at the boundary. SQL injection blocked by Prisma&apos;s parameterised queries.</p>
                  </div>
                </div>
                <div className="sysc-security-item">
                  <CheckCircle2 size={14} color="var(--color-success)" />
                  <div>
                    <strong>Audit trail</strong>
                    <p>Every state-changing action writes to <span className="mono">audit_log</span> with actor, IP and user-agent.</p>
                  </div>
                </div>
                <div className="sysc-security-item">
                  <CheckCircle2 size={14} color="var(--color-success)" />
                  <div>
                    <strong>Transactional consistency</strong>
                    <p>Approve / reject / cancel run inside <span className="mono">prisma.$transaction</span> so balance + audit either both commit or both roll back.</p>
                  </div>
                </div>
                <div className="sysc-security-item">
                  <CheckCircle2 size={14} color="var(--color-success)" />
                  <div>
                    <strong>Rate limiting</strong>
                    <p>Per-user cap of 30 write requests/minute enforced server-side. Backed by a Postgres <span className="mono">rate_limit_buckets</span> table; requests over the limit return HTTP 429.</p>
                  </div>
                </div>
                <div className="sysc-security-item">
                  <CheckCircle2 size={14} color="var(--color-success)" />
                  <div>
                    <strong>Clerk webhook sync</strong>
                    <p>User deletions and metadata updates in the Clerk dashboard auto-sync to our DB via <span className="mono">POST /api/webhooks/clerk</span> (Svix signature-verified).</p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
