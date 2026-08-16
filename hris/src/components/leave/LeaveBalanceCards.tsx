import { motion } from 'framer-motion';
import { ArcRing } from '../ui/ArcRing';
import type { LeaveBalance } from '../../lib/types';
import './LeaveBalanceCards.css';

interface Props {
  balance: LeaveBalance;
}

export function LeaveBalanceCards({ balance }: Props) {
  const casualLeft = Math.max(0, balance.casualTotal - balance.casualUsed - balance.casualPending);
  const sickLeft = Math.max(0, balance.sickTotal - balance.sickUsed - balance.sickPending);

  const cards = [
    {
      title: 'Casual Leave',
      code: 'CL',
      value: casualLeft,
      total: balance.casualTotal,
      used: balance.casualUsed,
      pending: balance.casualPending,
      color: 'var(--color-leave-casual)',
      bg: 'var(--color-leave-casual-light)',
    },
    {
      title: 'Sick Leave',
      code: 'SL',
      value: sickLeft,
      total: balance.sickTotal,
      used: balance.sickUsed,
      pending: balance.sickPending,
      color: 'var(--color-leave-sick)',
      bg: 'var(--color-leave-sick-light)',
    },
    {
      title: 'Replacement',
      code: 'RL',
      value: balance.replacementBalance,
      total: Math.max(balance.replacementBalance, 3),
      used: 0,
      pending: 0,
      color: 'var(--color-leave-replacement)',
      bg: 'var(--color-leave-replacement-light)',
    },
  ];

  return (
    <div className="lbc">
      {cards.map((c, i) => (
        <motion.div
          key={c.code}
          className="lbc-card"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: i * 0.05 }}
        >
          <div className="lbc-header">
            <span className="lbc-code" style={{ background: c.bg, color: c.color }}>
              {c.code}
            </span>
            <span className="lbc-title">{c.title}</span>
          </div>
          <div className="lbc-arc">
            <ArcRing
              value={c.value}
              total={c.total || 1}
              color={c.color}
              centerLabel={c.value.toString()}
              centerSublabel={c.value === 1 ? 'day left' : 'days left'}
              delay={i * 0.15}
              size={128}
            />
          </div>
          <dl className="lbc-meta">
            <div>
              <dt>Used</dt>
              <dd>{c.used}</dd>
            </div>
            {c.code !== 'RL' && (
              <div>
                <dt>Pending</dt>
                <dd>{c.pending}</dd>
              </div>
            )}
            <div>
              <dt>Total</dt>
              <dd>{c.total}</dd>
            </div>
          </dl>
        </motion.div>
      ))}
    </div>
  );
}
