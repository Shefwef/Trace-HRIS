/**
 * Simple HTML email templates. Rendered as strings; no React Email needed for now
 * (we can migrate to @react-email/components in a later phase for richer styling).
 * All templates share the same header/footer skin.
 */

interface Skin {
  senderName: string;
  appName?: string;
}

const BRAND_PRIMARY = '#2C5282';
const BRAND_SECONDARY = '#3182CE';

function shell({
  title,
  senderName,
  content,
  ctaLabel,
  ctaHref,
}: {
  title: string;
  senderName: string;
  content: string;
  ctaLabel?: string;
  ctaHref?: string;
}): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escape(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f7f9fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a202c;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f7f9fc;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg,${BRAND_PRIMARY},${BRAND_SECONDARY});padding:24px 32px;color:white;">
              <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">Trace HRIS</div>
              <div style="font-size:20px;font-weight:700;margin-top:4px;">${escape(title)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;font-size:15px;line-height:1.6;color:#1a202c;">
              ${content}
              ${ctaLabel && ctaHref
                ? `<div style="margin-top:28px;"><a href="${escape(ctaHref)}" style="display:inline-block;background:${BRAND_PRIMARY};color:white;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px;">${escape(ctaLabel)}</a></div>`
                : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#f7f9fc;border-top:1px solid #e2e8f0;color:#718096;font-size:12px;">
              Sent by ${escape(senderName)} · Trace Consulting · This is an automated notification.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function p(text: string): string {
  return `<p style="margin:0 0 12px;">${escape(text).replace(/\n/g, '<br/>')}</p>`;
}

function kv(label: string, value: string): string {
  return `<div style="margin:6px 0;font-size:14px;"><strong style="color:#4a5568;">${escape(label)}:</strong> <span style="color:#1a202c;">${escape(value)}</span></div>`;
}

// ─── Templates ─────────────────────────────────────────────

export function leaveSubmittedEmail(input: {
  senderName: string;
  employeeName: string;
  reviewerName: string;
  leaveType: string;
  period: string;
  duration: string;
  reason: string;
  description?: string;
  reviewUrl: string;
}, s: Skin) {
  const details = `
    ${kv('Employee', input.employeeName)}
    ${kv('Leave type', input.leaveType)}
    ${kv('Period', input.period)}
    ${kv('Duration', input.duration)}
    ${kv('Reason', input.reason)}
    ${input.description ? `<div style="margin-top:14px;padding:12px 14px;background:#f7f9fc;border-radius:8px;color:#4a5568;font-size:14px;line-height:1.55;">${escape(input.description)}</div>` : ''}
  `;
  const content = `
    ${p(`Hi ${input.reviewerName},`)}
    ${p(`${input.employeeName} has submitted a new leave request for your review.`)}
    ${details}
    ${p(`Please review and approve or reject at your earliest convenience.`)}
  `;
  return {
    subject: `Leave request — ${input.employeeName} · ${input.leaveType} · ${input.period}`,
    html: shell({
      title: 'New leave request',
      senderName: s.senderName,
      content,
      ctaLabel: 'Review request',
      ctaHref: input.reviewUrl,
    }),
  };
}

export function leaveDecisionEmail(input: {
  employeeName: string;
  leaveType: string;
  period: string;
  duration: string;
  decision: 'APPROVED' | 'REJECTED';
  reviewerName: string;
  note?: string;
  remainingBalance?: string;
  historyUrl: string;
}, s: Skin) {
  const approved = input.decision === 'APPROVED';
  const details = `
    ${kv('Leave type', input.leaveType)}
    ${kv('Period', input.period)}
    ${kv('Duration', input.duration)}
    ${input.remainingBalance ? kv('Remaining balance', input.remainingBalance) : ''}
    ${input.note ? `<div style="margin-top:14px;padding:12px 14px;background:${approved ? '#f0fff4' : '#fff5f5'};border-radius:8px;border-left:3px solid ${approved ? '#38a169' : '#e53e3e'};color:#4a5568;font-size:14px;line-height:1.55;"><strong style="color:#1a202c;">Note from ${escape(input.reviewerName)}:</strong><br/>${escape(input.note)}</div>` : ''}
  `;
  const content = `
    ${p(`Hi ${input.employeeName},`)}
    ${p(
      approved
        ? `Your leave request has been approved by ${input.reviewerName}.`
        : `Your leave request has been declined by ${input.reviewerName}.`
    )}
    ${details}
  `;
  return {
    subject: `Leave ${approved ? 'approved' : 'rejected'} — ${input.leaveType} · ${input.period}`,
    html: shell({
      title: approved ? 'Your leave was approved' : 'Your leave was rejected',
      senderName: s.senderName,
      content,
      ctaLabel: 'View my leaves',
      ctaHref: input.historyUrl,
    }),
  };
}

export function extraWorkSubmittedEmail(input: {
  employeeName: string;
  reviewerName: string;
  workDate: string;
  workType: string;
  reason: string;
  reviewUrl: string;
}, s: Skin) {
  const content = `
    ${p(`Hi ${input.reviewerName},`)}
    ${p(`${input.employeeName} has logged an extra work day and is requesting replacement leave credit.`)}
    ${kv('Employee', input.employeeName)}
    ${kv('Work date', input.workDate)}
    ${kv('Work type', input.workType)}
    ${kv('Reason', input.reason)}
  `;
  return {
    subject: `Extra work log — ${input.employeeName} · ${input.workDate}`,
    html: shell({
      title: 'New extra work log',
      senderName: s.senderName,
      content,
      ctaLabel: 'Review request',
      ctaHref: input.reviewUrl,
    }),
  };
}

export function holidayNoticeEmail(input: {
  holidayName: string;
  holidayDate: string;
  description?: string;
  ctaUrl: string;
}, s: Skin) {
  const content = `
    ${p(`Dear Team,`)}
    ${p(`We would like to inform you that <strong>${escape(input.holidayDate)}</strong> is a public holiday in observance of <strong>${escape(input.holidayName)}</strong>.`)}
    ${p(`The office will remain closed on this day. Please plan your work accordingly.`)}
    ${input.description ? `<div style="margin-top:14px;padding:12px 14px;background:#f7f9fc;border-radius:8px;color:#4a5568;font-size:14px;line-height:1.55;">${escape(input.description)}</div>` : ''}
    ${p(`We wish you a wonderful ${input.holidayName}! 🎉`)}
  `;
  return {
    subject: `Holiday notice — ${input.holidayName} · ${input.holidayDate}`,
    html: shell({
      title: `Holiday notice — ${input.holidayName}`,
      senderName: s.senderName,
      content,
      ctaLabel: 'Open HRIS calendar',
      ctaHref: input.ctaUrl,
    }),
  };
}

export function extraWorkDecisionEmail(input: {
  employeeName: string;
  workDate: string;
  workType: string;
  decision: 'APPROVED' | 'REJECTED';
  reviewerName: string;
  note?: string;
  creditDays?: number;
  historyUrl: string;
}, s: Skin) {
  const approved = input.decision === 'APPROVED';
  const content = `
    ${p(`Hi ${input.employeeName},`)}
    ${p(
      approved
        ? `Your extra work log for ${input.workDate} has been approved by ${input.reviewerName}. ${input.creditDays ? `You've earned ${input.creditDays} replacement leave day${input.creditDays === 1 ? '' : 's'}.` : ''}`
        : `Your extra work log for ${input.workDate} was declined by ${input.reviewerName}.`
    )}
    ${kv('Work date', input.workDate)}
    ${kv('Work type', input.workType)}
    ${input.note ? `<div style="margin-top:14px;padding:12px 14px;background:${approved ? '#f0fff4' : '#fff5f5'};border-radius:8px;border-left:3px solid ${approved ? '#38a169' : '#e53e3e'};color:#4a5568;font-size:14px;line-height:1.55;"><strong style="color:#1a202c;">Note from ${escape(input.reviewerName)}:</strong><br/>${escape(input.note)}</div>` : ''}
  `;
  return {
    subject: `Extra work ${approved ? 'approved' : 'rejected'} — ${input.workDate}`,
    html: shell({
      title: approved ? 'Extra work approved' : 'Extra work rejected',
      senderName: s.senderName,
      content,
      ctaLabel: 'View attendance',
      ctaHref: input.historyUrl,
    }),
  };
}
