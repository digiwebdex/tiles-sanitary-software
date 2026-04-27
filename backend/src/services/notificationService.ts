/**
 * Notification dispatch service for the VPS backend.
 *
 * Channels:
 *   - SMS via BulkSMSBD (HTTP API, supports Bengali Unicode)
 *   - Email via SMTP (nodemailer)
 *
 * Both channels are best-effort: if credentials are missing or the upstream
 * call fails, the function logs a warning and returns false, but never
 * throws (so a single failed channel cannot break the calling flow such
 * as self-signup).
 *
 * Used by:
 *   - authService.register() for new-signup alerts
 *   - dealersRoutes for approval / rejection notices
 */
import nodemailer from 'nodemailer';
import { env } from '../config/env';

let cachedTransport: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter | null {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return null;
  if (cachedTransport) return cachedTransport;

  cachedTransport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: (env.SMTP_PORT ?? 587) === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return cachedTransport;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<boolean> {
  const transport = getTransport();
  if (!transport) {
    console.warn('[notify] SMTP not configured — skipping email to', opts.to);
    return false;
  }
  try {
    await transport.sendMail({
      from: env.SMTP_FROM || env.SMTP_USER,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    });
    console.log('[notify] email sent to', opts.to, '—', opts.subject);
    return true;
  } catch (err) {
    console.error('[notify] email send failed to', opts.to, (err as Error).message);
    return false;
  }
}

/** Normalize a phone number to BulkSMSBD-friendly format (88 + 11 digits). */
function normalizeBdPhone(phone: string): string {
  const digits = phone.replace(/\D+/g, '');
  if (digits.startsWith('880') && digits.length === 13) return digits;
  if (digits.startsWith('0') && digits.length === 11) return `88${digits}`;
  if (digits.length === 10) return `880${digits}`;
  return digits; // best effort
}

export async function sendSms(opts: {
  to: string;
  message: string;
}): Promise<boolean> {
  if (!env.BULKSMSBD_API_KEY || !env.BULKSMSBD_SENDER_ID) {
    console.warn('[notify] BulkSMSBD not configured — skipping SMS to', opts.to);
    return false;
  }
  const url = env.BULKSMSBD_API_URL || 'http://bulksmsbd.net/api/smsapi';
  const number = normalizeBdPhone(opts.to);

  try {
    const params = new URLSearchParams({
      api_key: env.BULKSMSBD_API_KEY,
      type: 'text',
      number,
      senderid: env.BULKSMSBD_SENDER_ID,
      message: opts.message,
    });
    const res = await fetch(`${url}?${params.toString()}`, { method: 'GET' });
    const body = await res.text();
    if (!res.ok) {
      console.error('[notify] SMS send failed', res.status, body);
      return false;
    }
    console.log('[notify] SMS sent to', number);
    return true;
  } catch (err) {
    console.error('[notify] SMS send error to', opts.to, (err as Error).message);
    return false;
  }
}

/**
 * Fan-out helper: fires SMS + Email to dealer and to admin in parallel.
 * Never throws — caller can ignore the result safely.
 */
export async function dispatchSignupNotifications(input: {
  dealerName: string;
  businessName: string;
  dealerPhone: string;
  dealerEmail: string;
  adminPhone?: string;
  adminEmail?: string;
}): Promise<void> {
  const {
    dealerName,
    businessName,
    dealerPhone,
    dealerEmail,
    adminPhone,
    adminEmail,
  } = input;

  // Bengali SMS to dealer
  const dealerSms =
    `স্বাগতম ${dealerName}!\n` +
    `আপনার "${businessName}" অ্যাকাউন্ট তৈরি হয়েছে।\n` +
    `Super Admin অনুমোদনের অপেক্ষায় আছে। অনুমোদনের পর আপনাকে জানানো হবে।\n\n` +
    `Tiles & Sanitary ERP`;

  // Welcome email to dealer (pending state — sets expectation)
  const dealerEmailSubject = 'Account Received — Awaiting Approval';
  const dealerEmailText =
    `Dear ${dealerName},\n\n` +
    `Thank you for signing up for Tiles & Sanitary ERP.\n` +
    `Your business account "${businessName}" has been received and is now awaiting Super Admin approval.\n\n` +
    `What happens next:\n` +
    `  • Our team will review your registration shortly.\n` +
    `  • You will be notified by email and SMS once your account is approved.\n` +
    `  • You will then be able to log in and start a 3-day free trial.\n\n` +
    `Need it faster? Call us at +880 1674 533303.\n\n` +
    `Best regards,\nTiles & Sanitary ERP Team`;

  // Bengali SMS to admin
  const adminSms =
    `নতুন ডিলার রেজিস্ট্রেশন (অনুমোদনের অপেক্ষায়)!\n` +
    `নাম: ${dealerName}\n` +
    `ব্যবসা: ${businessName}\n` +
    `ফোন: ${dealerPhone}\n` +
    `ইমেইল: ${dealerEmail}`;

  // Email to admin
  const adminEmailSubject = `New Dealer Registration — ${businessName}`;
  const adminEmailText =
    `A new dealer has signed up and is awaiting your approval.\n\n` +
    `Owner: ${dealerName}\n` +
    `Business: ${businessName}\n` +
    `Phone: ${dealerPhone}\n` +
    `Email: ${dealerEmail}\n` +
    `Date: ${new Date().toISOString().split('T')[0]}\n\n` +
    `Approve or reject from Super Admin → Dealers.`;

  const tasks: Promise<unknown>[] = [];
  if (dealerPhone) tasks.push(sendSms({ to: dealerPhone, message: dealerSms }));
  if (dealerEmail) tasks.push(sendEmail({ to: dealerEmail, subject: dealerEmailSubject, text: dealerEmailText }));
  if (adminPhone) tasks.push(sendSms({ to: adminPhone, message: adminSms }));
  if (adminEmail) tasks.push(sendEmail({ to: adminEmail, subject: adminEmailSubject, text: adminEmailText }));

  await Promise.allSettled(tasks);
}

/** Notification when SA approves a pending dealer. */
export async function dispatchApprovalNotification(input: {
  dealerName: string;
  businessName: string;
  dealerPhone: string;
  dealerEmail: string;
}): Promise<void> {
  const { dealerName, businessName, dealerPhone, dealerEmail } = input;

  const sms =
    `অভিনন্দন ${dealerName}!\n` +
    `আপনার "${businessName}" অ্যাকাউন্ট অনুমোদিত হয়েছে।\n` +
    `এখন লগইন করুন: app.sanitileserp.com\n\n` +
    `Tiles & Sanitary ERP`;

  const subject = 'Your Account is Approved — Welcome to Tiles & Sanitary ERP';
  const text =
    `Dear ${dealerName},\n\n` +
    `Great news! Your business account "${businessName}" has been approved.\n\n` +
    `You can now log in and start your 3-day free trial:\n` +
    `  https://app.sanitileserp.com/login\n\n` +
    `If you need help getting started, reply to this email or call +880 1674 533303.\n\n` +
    `Best regards,\nTiles & Sanitary ERP Team`;

  await Promise.allSettled([
    dealerPhone ? sendSms({ to: dealerPhone, message: sms }) : Promise.resolve(),
    dealerEmail ? sendEmail({ to: dealerEmail, subject, text }) : Promise.resolve(),
  ]);
}
