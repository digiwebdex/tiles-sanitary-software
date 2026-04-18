import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle, ExternalLink, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  buildWaLink,
  isMessageTypeEnabled,
  isValidWaPhone,
  normalizePhoneForWa,
  whatsappService,
  type CreateLogInput,
  type WhatsAppMessageType,
} from "@/services/whatsappService";

interface SendWhatsAppDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  dealerId: string;
  messageType: WhatsAppMessageType;
  sourceType: string;
  sourceId: string | null;
  templateKey: string;
  defaultPhone: string;
  defaultName?: string | null;
  defaultMessage: string;
  payloadSnapshot?: Record<string, unknown>;
  /** Optional: override the dialog title. */
  title?: string;
}

const SendWhatsAppDialog = ({
  open,
  onOpenChange,
  dealerId,
  messageType,
  sourceType,
  sourceId,
  templateKey,
  defaultPhone,
  defaultName,
  defaultMessage,
  payloadSnapshot,
  title,
}: SendWhatsAppDialogProps) => {
  const [phone, setPhone] = useState(defaultPhone);
  const [message, setMessage] = useState(defaultMessage);
  const [submitting, setSubmitting] = useState(false);

  // Read dealer-level WhatsApp settings to enforce per-type enable flag
  const { data: settings } = useQuery({
    queryKey: ["whatsapp-settings", dealerId],
    queryFn: () => whatsappService.getSettings(dealerId),
    enabled: !!dealerId && open,
  });

  const typeEnabled = isMessageTypeEnabled(settings, messageType);

  // Reset state whenever dialog re-opens with new defaults
  useEffect(() => {
    if (open) {
      setPhone(defaultPhone);
      setMessage(defaultMessage);
    }
  }, [open, defaultPhone, defaultMessage]);

  const phoneValid = useMemo(() => isValidWaPhone(phone), [phone]);
  const normalized = useMemo(() => normalizePhoneForWa(phone), [phone]);
  const waLink = useMemo(
    () => (phoneValid ? buildWaLink(phone, message) : ""),
    [phone, message, phoneValid]
  );

  // Cooldown lookup: warn dealer if same type was sent to same phone in last 24h
  const { data: recentSend } = useQuery({
    queryKey: ["whatsapp-recent", dealerId, messageType, normalized],
    queryFn: () =>
      whatsappService.getRecentSendForRecipient({
        dealerId,
        messageType,
        recipientPhone: normalized,
        cooldownHours: 24,
      }),
    enabled: !!dealerId && open && phoneValid,
  });

  const performSend = async (autoMarkSent: boolean) => {
    if (!typeEnabled) {
      toast.error("This WhatsApp message type is disabled in Settings.");
      return;
    }
    if (!phoneValid) {
      toast.error("Please enter a valid phone number");
      return;
    }
    if (!message.trim()) {
      toast.error("Message cannot be empty");
      return;
    }

    setSubmitting(true);
    try {
      const input: CreateLogInput = {
        dealer_id: dealerId,
        message_type: messageType,
        source_type: sourceType,
        source_id: sourceId,
        recipient_phone: normalized,
        recipient_name: defaultName ?? null,
        template_key: templateKey,
        message_text: message,
        payload_snapshot: payloadSnapshot ?? {},
        status: autoMarkSent ? "sent" : "manual_handoff",
      };
      await whatsappService.createLog(input);

      window.open(waLink, "_blank", "noopener,noreferrer");

      toast.success(
        autoMarkSent
          ? "WhatsApp opened and logged as sent."
          : "WhatsApp opened. Hit Send to deliver the message."
      );
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to log WhatsApp send";
      try {
        await whatsappService.createLog({
          dealer_id: dealerId,
          message_type: messageType,
          source_type: sourceType,
          source_id: sourceId,
          recipient_phone: normalized,
          recipient_name: defaultName ?? null,
          template_key: templateKey,
          message_text: message,
          payload_snapshot: payloadSnapshot ?? {},
          status: "failed",
        });
      } catch {
        // swallow secondary failure
      }
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const preferManual = settings?.prefer_manual_send ?? true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            {title ?? "Send via WhatsApp"}
          </DialogTitle>
          <DialogDescription>
            Review the message, then open WhatsApp to send. The attempt will be logged.
          </DialogDescription>
        </DialogHeader>

        {!typeEnabled && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              This WhatsApp message type is currently disabled in <strong>Settings → WhatsApp Automation</strong>.
              Enable it to send.
            </div>
          </div>
        )}

        {recentSend && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
            <Clock className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              A <strong>{(recentSend.message_type ?? "").replace("_", " ")}</strong> was already sent
              to this number{" "}
              <strong>
                {formatDistanceToNow(new Date(recentSend.created_at), { addSuffix: true })}
              </strong>
              . Send again only if necessary.
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="wa-phone">Recipient Phone</Label>
            <Input
              id="wa-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01XXXXXXXXX or +8801XXXXXXXXX"
              autoComplete="off"
            />
            {!phoneValid && phone.trim().length > 0 && (
              <p className="text-xs text-destructive">
                Enter a valid number (8–15 digits).
              </p>
            )}
            {phoneValid && (
              <p className="text-xs text-muted-foreground">
                Will send to: <span className="font-mono">+{normalized}</span>
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="wa-msg">Message</Label>
            <Textarea
              id="wa-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={10}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              {message.length} characters
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          {!preferManual && (
            <Button
              variant="secondary"
              onClick={() => performSend(true)}
              disabled={!typeEnabled || !phoneValid || submitting || !message.trim()}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Send & Mark Sent
            </Button>
          )}
          <Button
            onClick={() => performSend(false)}
            disabled={!typeEnabled || !phoneValid || submitting || !message.trim()}
          >
            <ExternalLink className="h-4 w-4 mr-1" />
            Open WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SendWhatsAppDialog;
