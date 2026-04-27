/**
 * /api/notifications — idempotent SMS / WhatsApp send endpoints.
 *
 * P1 fix: double-clicking "Send SMS" or retrying after a network blip
 * used to fire the upstream send twice (and bill the dealer twice).
 * Clients now MUST supply an idempotency_key (UUID per logical action).
 * The unique index on (dealer_id, idempotency_key) guarantees that a
 * second call with the same key returns the original log row instead
 * of dispatching again.
 *
 * Endpoints:
 *   POST /api/notifications/sms       body: { to, message, idempotency_key, source_type?, source_id? }
 *   POST /api/notifications/whatsapp  body: { to, message, message_type, idempotency_key, source_type?, source_id? }
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db/connection';
import { authenticate } from '../middleware/auth';
import { tenantGuard, requireDealer } from '../middleware/tenant';
import { requireRole } from '../middleware/roles';
import { sendSms } from '../services/notificationService';

const router = Router();
router.use(authenticate, tenantGuard);

const smsSchema = z.object({
  to: z.string().trim().min(8).max(32),
  message: z.string().trim().min(1).max(2000),
  idempotency_key: z.string().trim().min(8).max(80),
  source_type: z.string().trim().max(40).optional(),
  source_id: z.string().uuid().optional(),
});

router.post(
  '/sms',
  requireDealer,
  requireRole('dealer_admin', 'salesman'),
  async (req: Request, res: Response) => {
    try {
      const parsed = smsSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid payload', issues: parsed.error.flatten() });
        return;
      }
      const dealerId = req.dealerId!;
      const body = parsed.data;

      // Idempotency check: if a log with the same (dealer, key) exists,
      // return it instead of dispatching again.
      const existing = await db('sms_message_logs')
        .where({ dealer_id: dealerId, idempotency_key: body.idempotency_key })
        .first();
      if (existing) {
        res.json({
          deduped: true,
          status: existing.status,
          id: existing.id,
          sent_at: existing.sent_at,
        });
        return;
      }

      // Insert the log first so the unique index protects us against
      // a parallel duplicate request firing right now.
      let logRow: any;
      try {
        [logRow] = await db('sms_message_logs')
          .insert({
            dealer_id: dealerId,
            idempotency_key: body.idempotency_key,
            to_phone: body.to,
            message: body.message,
            status: 'queued',
            source_type: body.source_type ?? null,
            source_id: body.source_id ?? null,
          })
          .returning('*');
      } catch (err: any) {
        // Unique violation = parallel request beat us to it
        if (err?.code === '23505') {
          const winner = await db('sms_message_logs')
            .where({ dealer_id: dealerId, idempotency_key: body.idempotency_key })
            .first();
          res.json({ deduped: true, status: winner?.status, id: winner?.id });
          return;
        }
        throw err;
      }

      const ok = await sendSms({ to: body.to, message: body.message });
      const finalStatus = ok ? 'sent' : 'failed';
      await db('sms_message_logs')
        .where({ id: logRow.id })
        .update({ status: finalStatus, sent_at: ok ? new Date() : null });

      res.json({ deduped: false, status: finalStatus, id: logRow.id });
    } catch (err: any) {
      console.error('[notify/sms]', err.message);
      res.status(500).json({ error: 'Failed to send SMS' });
    }
  },
);

const waSchema = z.object({
  to: z.string().trim().min(8).max(32),
  message: z.string().trim().min(1).max(4000),
  message_type: z.enum(['quotation', 'invoice', 'delivery', 'payment', 'reminder', 'general']),
  idempotency_key: z.string().trim().min(8).max(80),
  source_type: z.string().trim().max(40).optional(),
  source_id: z.string().uuid().optional(),
});

router.post(
  '/whatsapp',
  requireDealer,
  requireRole('dealer_admin', 'salesman'),
  async (req: Request, res: Response) => {
    try {
      const parsed = waSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid payload', issues: parsed.error.flatten() });
        return;
      }
      const dealerId = req.dealerId!;
      const body = parsed.data;

      // Pre-check
      const existing = await db('whatsapp_message_logs')
        .where({ dealer_id: dealerId, idempotency_key: body.idempotency_key })
        .first();
      if (existing) {
        res.json({ deduped: true, status: existing.status, id: existing.id });
        return;
      }

      // The actual upstream WhatsApp send is delegated to the dealer's
      // configured provider (Cloud API or wa.me link). For now we record
      // the intent atomically — the existing whatsappService finalises
      // the send. The unique index still prevents double-sends.
      let logRow: any;
      try {
        [logRow] = await db('whatsapp_message_logs')
          .insert({
            dealer_id: dealerId,
            idempotency_key: body.idempotency_key,
            to_phone: body.to,
            message_type: body.message_type,
            message_body: body.message,
            status: 'queued',
            source_type: body.source_type ?? null,
            source_id: body.source_id ?? null,
          })
          .returning('*');
      } catch (err: any) {
        if (err?.code === '23505') {
          const winner = await db('whatsapp_message_logs')
            .where({ dealer_id: dealerId, idempotency_key: body.idempotency_key })
            .first();
          res.json({ deduped: true, status: winner?.status, id: winner?.id });
          return;
        }
        // Some columns above (message_body, to_phone) might not exist on
        // every install — fall back to a minimal insert so the endpoint
        // never breaks the calling flow.
        if (err?.code === '42703') {
          [logRow] = await db('whatsapp_message_logs')
            .insert({
              dealer_id: dealerId,
              idempotency_key: body.idempotency_key,
              message_type: body.message_type,
              status: 'queued',
              source_type: body.source_type ?? null,
              source_id: body.source_id ?? null,
            })
            .returning('*');
        } else {
          throw err;
        }
      }

      res.json({ deduped: false, status: 'queued', id: logRow.id });
    } catch (err: any) {
      console.error('[notify/whatsapp]', err.message);
      res.status(500).json({ error: 'Failed to log WhatsApp send' });
    }
  },
);

export default router;
