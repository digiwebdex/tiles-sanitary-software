import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { usePortalAuth } from "@/contexts/PortalAuthContext";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export default function PortalAccountPage() {
  const { user, context } = usePortalAuth();
  const { toast } = useToast();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  const portalUserQ = useQuery({
    queryKey: ["portal", "self", context?.portal_user_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portal_users")
        .select("*")
        .eq("id", context!.portal_user_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!context?.portal_user_id,
  });

  const updatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) {
      toast({ variant: "destructive", title: "Password too short", description: "Use at least 8 characters." });
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      toast({ title: "Password updated" });
      setPw("");
    } catch (err) {
      toast({ variant: "destructive", title: "Failed", description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>My Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row k="Name" v={portalUserQ.data?.name ?? "—"} />
          <Row k="Email" v={user?.email ?? "—"} />
          <Row k="Phone" v={portalUserQ.data?.phone ?? "—"} />
          <Row k="Account type" v={portalUserQ.data?.portal_role ?? "—"} />
          <Row k="Status" v={portalUserQ.data?.status ?? "—"} />
          <Row k="Last login" v={portalUserQ.data?.last_login_at ?? "—"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={updatePassword} className="space-y-3">
            <div>
              <Label htmlFor="newpw">New password</Label>
              <Input
                id="newpw"
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Update password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-border last:border-0 pb-1.5">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
