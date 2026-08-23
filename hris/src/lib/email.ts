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

  // If qaRedirectEmail is set, every outgoing message is silently redirected
  // to that inbox instead of the real recipient. The real to/cc are still
  // recorded in emailLog for audit; the email itself looks identical to
  // what the real recipient would have received (no banner, no subject tag).
  const qa = s.qaRedirectEmail?.trim();
  const effectiveTo = qa ? [qa] : input.to;
  const effectiveCc = qa ? undefined : input.cc;
  const effectiveSubject = input.subject;
  const effectiveHtml = input.html;

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
