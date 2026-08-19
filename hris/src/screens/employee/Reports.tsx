import { Download, FileText, TrendingUp, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { useCurrentUser, useStore } from '../../lib/store';
import { Button } from '../../components/ui/Button';
import './Reports.css';

const REPORTS = [
  {
    id: 'attendance',
    title: 'Monthly attendance report',
    body: 'Every clock-in, break and overtime minute — grouped by day, ready to file.',
    icon: <FileText size={20} />,
    accent: 'var(--color-brand-primary)',
    bg: 'var(--color-info-light)',
  },
  {
    id: 'leaves',
    title: 'Leave history',
    body: 'A signed record of every leave request in your current cycle with decisions and notes.',
    icon: <FileText size={20} />,
    accent: 'var(--color-leave-casual)',
    bg: 'var(--color-leave-casual-light)',
  },
  {
    id: 'summary',
    title: 'Performance summary',
    body: 'Attendance rate, leave utilization and overtime rolled into a one-page snapshot.',
    icon: <TrendingUp size={20} />,
    accent: 'var(--color-leave-replacement)',
    bg: 'var(--color-leave-replacement-light)',
  },
];

const ADMIN_REPORTS = [
  {
    id: 'all-employees',
    title: 'All employees — cycle report',
    body: 'Company-wide leave and attendance summary. Great for board packs and audits.',
    icon: <Users size={20} />,
    accent: 'var(--color-warning)',
    bg: 'var(--color-warning-light)',
  },
];

export function ReportsPage() {
  const user = useCurrentUser();
  const addToast = useStore((s) => s.addToast);
  if (!user) return null;

  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

  function download(title: string) {
    addToast({
      kind: 'info',
      title: 'Preparing your PDF',
      body: `${title} — in a full deployment this would render server-side and download automatically.`,
    });
  }

  const list = [...REPORTS, ...(isAdmin ? ADMIN_REPORTS : [])];

  return (
    <div className="rpts">
      <div className="rpts-head">
        <h1>Reports</h1>
        <p className="muted">Downloadable, signed PDFs — perfect for records, audits and reimbursements.</p>
      </div>

      <div className="rpts-grid">
        {list.map((r, i) => (
          <motion.div
            key={r.id}
            className="rpts-card card"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <div className="rpts-icon" style={{ background: r.bg, color: r.accent }}>
              {r.icon}
            </div>
            <div className="rpts-body">
              <h4>{r.title}</h4>
              <p>{r.body}</p>
            </div>
            <Button variant="secondary" leadingIcon={<Download size={14} />} onClick={() => download(r.title)}>
              Download PDF
            </Button>
          </motion.div>
        ))}
      </div>

      <div className="rpts-note card">
        <strong>How PDFs work in HRIS</strong>
        <p>
          The system uses server-side rendering (Puppeteer/WeasyPrint) to produce fully-branded, print-quality PDFs. For this prototype, downloads are simulated so you can experience the flow.
        </p>
      </div>
    </div>
  );
}
