import { Resend } from 'resend';
import { prisma } from './db';

const resend = new Resend(process.env.RESEND_API_KEY);

async function loadSettings() {
  const s = await prisma.systemSettings.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  });
  return s;
}

export interface SendEmailInput {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
  text?: string;
  referenceType?: string;
  referenceId?: string;
}

export async function sendEmail(input: SendEmailInput) {
  const s = await loadSettings();
  const fromAddress = `${s.senderName} <${s.fromEmail}>`;
  const replyTo = s.senderEmail;

  // QA mode: redirect every outgoing message to a single inbox for testing.
  // The real to/cc are preserved in the log + shown as a banner in the body,
  // so we can verify the routing logic without needing verified recipients.
  const qa = s.qaRedirectEmail?.trim();
  const effectiveTo = qa ? [qa] : input.to;
  const effectiveCc = qa ? undefined : input.cc;
  const effectiveSubject = qa ? `[QA→${input.to.join(',')}] ${input.subject}` : input.subject;
  const effectiveHtml = qa
    ? `<div style="background:#FEF3C7;border-left:4px solid #DD6B20;padding:10px 14px;margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:#78350F;border-radius:4px;">
        <strong>🧪 QA MODE</strong> — this email was redirected here.<br/>
        Original <strong>To:</strong> ${input.to.join(', ')}${input.cc?.length ? `<br/>Original <strong>Cc:</strong> ${input.cc.join(', ')}` : ''}
      </div>${input.html}`
    : input.html;

  const log = await prisma.emailLog.create({
    data: {
      toAddresses: input.to,
      ccAddresses: input.cc ?? [],
      subject: input.subject,
      bodyPreview: input.text?.slice(0, 200) ?? input.html.slice(0, 200),
      referenceType: input.referenceType,
      referenceId: input.referenceId,
    },
  });

  try {
    const result = await resend.emails.send({
      from: fromAddress,
      to: effectiveTo,
      cc: effectiveCc,
      replyTo,
      subject: effectiveSubject,
      html: effectiveHtml,
      text: input.text,
    });

    if (result.error) throw new Error(result.error.message);

    await prisma.emailLog.update({
      where: { id: log.id },
      data: {
        status: 'SENT',
        providerMessageId: result.data?.id,
        sentAt: new Date(),
      },
    });
    return { ok: true as const, messageId: result.data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await prisma.emailLog.update({
      where: { id: log.id },
      data: { status: 'FAILED', errorMessage: message },
    });
    return { ok: false as const, error: message };
  }
}
