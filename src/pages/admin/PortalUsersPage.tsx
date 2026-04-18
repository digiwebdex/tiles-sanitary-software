import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  invitePortalUser,
  listPortalUsers,
  setPortalUserStatus,
  type PortalRole,
  type PortalStatus,
  type PortalUser,
} from "@/services/portalService";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Copy, Loader2, UserPlus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const statusVariant = (s: PortalStatus): "default" | "secondary" | "destructive" | "outline" => {
  switch (s) {
    case "active": return "default";
    case "invited": return "secondary";
    case "inactive": return "outline";
    case "revoked": return "destructive";
  }
};

export default function PortalUsersPage() {
  const { profile, isSuperAdmin } = useAuth();
  const dealerId = profile?.dealer_id ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [openInvite, setOpenInvite] = useState(false);
  const [magicLink, setMagicLink] = useState<string | null>(null);

  const usersQ = useQuery({
    queryKey: ["admin", "portal_users", dealerId],
    queryFn: () => listPortalUsers(dealerId),
    enabled: !!dealerId,
  });

  const customersQ = useQuery({
    queryKey: ["admin", "customers-for-portal", dealerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, type, phone")
        .eq("dealer_id", dealerId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!dealerId,
  });

  const setStatusM = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PortalStatus }) =>
      setPortalUserStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "portal_users", dealerId] });
      toast({ title: "Status updated" });
    },
    onError: (e) => toast({ variant: "destructive", title: "Failed", description: (e as Error).message }),
  });

  if (!isSuperAdmin && !profile) {
    return <div className="p-6">Loading…</div>;
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Portal Users</h1>
          <p className="text-sm text-muted-foreground">
            Manage external customers, contractors, and architects who can access the portal.
          </p>
        </div>
        <Button onClick={() => setOpenInvite(true)}>
          <UserPlus className="h-4 w-4 mr-1.5" /> Invite portal user
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All portal users</CardTitle>
        </CardHeader>
        <CardContent>
          {usersQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (usersQ.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No portal users yet. Invite your first one above.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last login</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersQ.data!.map((u: PortalUser) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell><Badge variant="outline">{u.portal_role}</Badge></TableCell>
                      <TableCell><Badge variant={statusVariant(u.status)}>{u.status}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "Never"}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost">Actions</Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {u.status !== "active" && (
                              <DropdownMenuItem
                                onClick={() => setStatusM.mutate({ id: u.id, status: "active" })}
                              >
                                Activate
                              </DropdownMenuItem>
                            )}
                            {u.status !== "inactive" && (
                              <DropdownMenuItem
                                onClick={() => setStatusM.mutate({ id: u.id, status: "inactive" })}
                              >
                                Deactivate
                              </DropdownMenuItem>
                            )}
                            {u.status !== "revoked" && (
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setStatusM.mutate({ id: u.id, status: "revoked" })}
                              >
                                Revoke access
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <InviteDialog
        open={openInvite}
        onOpenChange={(o) => { setOpenInvite(o); if (!o) setMagicLink(null); }}
        customers={customersQ.data ?? []}
        magicLink={magicLink}
        onInvited={(link) => {
          setMagicLink(link);
          qc.invalidateQueries({ queryKey: ["admin", "portal_users", dealerId] });
        }}
      />
    </div>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  customers,
  magicLink,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customers: { id: string; name: string; phone: string | null }[];
  magicLink: string | null;
  onInvited: (link: string | null) => void;
}) {
  const { toast } = useToast();
  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<PortalRole>("contractor");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || !name.trim() || !email.trim()) return;
    setBusy(true);
    try {
      const res = await invitePortalUser({
        customer_id: customerId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        portal_role: role,
        send_magic_link: true,
      });
      onInvited(res.magic_link);
      toast({ title: "Portal user invited", description: `Magic link generated for ${email}.` });
      setName(""); setEmail(""); setPhone(""); setCustomerId(""); setRole("contractor");
    } catch (err) {
      toast({ variant: "destructive", title: "Invite failed", description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite portal user</DialogTitle>
        </DialogHeader>

        {magicLink ? (
          <div className="space-y-3">
            <p className="text-sm">
              Invite created. Share this magic link with the user (also sent via email if delivery is configured):
            </p>
            <div className="flex gap-2">
              <Input value={magicLink} readOnly className="font-mono text-xs" />
              <Button
                size="icon"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(magicLink);
                  toast({ title: "Copied" });
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label>Customer</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                <SelectContent>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Full name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label>Account type</Label>
              <Select value={role} onValueChange={(v) => setRole(v as PortalRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contractor">Contractor</SelectItem>
                  <SelectItem value="architect">Architect</SelectItem>
                  <SelectItem value="project_customer">Project customer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={busy || !customerId}>
                {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                Send invite
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
