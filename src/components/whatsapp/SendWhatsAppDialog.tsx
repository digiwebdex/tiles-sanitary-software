import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageCircle, ExternalLink, AlertTriangle } from "lucide-react";

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

  const handleSend = async () => {
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
      // 1. Log the attempt (manual_handoff: dealer will hit Send in WhatsApp)
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
        status: "manual_handoff",
      };
      await whatsappService.createLog(input);

      // 2. Open WhatsApp in a new tab
      window.open(waLink, "_blank", "noopener,noreferrer");

      toast.success("WhatsApp opened. Hit Send to deliver the message.");
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to log WhatsApp send";
      // Best-effort: also create a 'failed' log row so the dealer sees it in the log
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

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
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
