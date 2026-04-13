import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, MessageSquareText, Clock } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "no_answer", label: "No Answer" },
  { value: "promised_payment", label: "Promised Payment" },
  { value: "partial_paid", label: "Partial Paid" },
  { value: "disputed", label: "Disputed" },
  { value: "follow_up_later", label: "Follow Up Later" },
  { value: "resolved", label: "Resolved" },
] as const;

const STATUS_COLORS: Record<string, string> = {
  no_answer: "secondary",
  promised_payment: "outline",
  partial_paid: "default",
  disputed: "destructive",
  follow_up_later: "outline",
  resolved: "default",
};

interface FollowUpPanelProps {
  open: boolean;
  onClose: () => void;
  customerId: string;
  customerName: string;
  dealerId: string;
}

export default function FollowUpPanel({ open, onClose, customerId, customerName, dealerId }: FollowUpPanelProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("no_answer");
  const [showForm, setShowForm] = useState(false);

  const { data: followups = [], isLoading } = useQuery({
    queryKey: ["customer-followups", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_followups")
        .select("*")
        .eq("customer_id", customerId)
        .eq("dealer_id", dealerId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: open && !!customerId,
  });

  const addFollowup = useMutation({
    mutationFn: async () => {
      if (!note.trim()) throw new Error("Note is required");
      const { error } = await supabase.from("customer_followups").insert({
        dealer_id: dealerId,
        customer_id: customerId,
        note: note.trim(),
        status,
        created_by: user?.id ?? null,
        followup_date: new Date().toISOString().split("T")[0],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Follow-up added");
      setNote("");
      setStatus("no_answer");
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["customer-followups", customerId] });
      queryClient.invalidateQueries({ queryKey: ["collection-followups"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <MessageSquareText className="h-5 w-5" />
            Follow-ups — {customerName}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {!showForm ? (
            <Button size="sm" onClick={() => setShowForm(true)} className="w-full">
              <Plus className="h-4 w-4 mr-1" /> Add Follow-up
            </Button>
          ) : (
            <div className="space-y-3 rounded-md border p-3 bg-muted/30">
              <Textarea
                placeholder="Follow-up note..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
              />
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => addFollowup.mutate()} disabled={addFollowup.isPending}>
                  {addFollowup.isPending ? "Saving..." : "Save"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : followups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No follow-up yet</p>
          ) : (
            <div className="space-y-3">
              {followups.map((f: any) => (
                <div key={f.id} className="rounded-md border p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Badge variant={STATUS_COLORS[f.status] as any} className="text-xs capitalize">
                      {f.status?.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(f.created_at), "dd MMM yyyy, hh:mm a")}
                    </span>
                  </div>
                  <p className="text-sm text-foreground">{f.note}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
