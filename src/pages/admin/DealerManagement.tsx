import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Ban, CheckCircle, UserPlus } from "lucide-react";

interface DealerForm {
  name: string;
  phone: string;
  address: string;
}

interface AdminUserForm {
  name: string;
  email: string;
  password: string;
}

const emptyDealerForm: DealerForm = { name: "", phone: "", address: "" };
const emptyAdminForm: AdminUserForm = { name: "", email: "", password: "" };

const DealerManagement = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<DealerForm>(emptyDealerForm);
  const [createAdmin, setCreateAdmin] = useState(true);
  const [adminForm, setAdminForm] = useState<AdminUserForm>(emptyAdminForm);

  // Separate dialog for adding user to existing dealer
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addUserDealerId, setAddUserDealerId] = useState<string>("");
  const [addUserForm, setAddUserForm] = useState<AdminUserForm>(emptyAdminForm);

  const { data: dealers = [], isLoading } = useQuery({
    queryKey: ["admin-dealers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dealers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const createDealerMutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Dealer name is required");

      if (editId) {
        // Edit mode — just update dealer
        const { error } = await supabase
          .from("dealers")
          .update({ name: form.name, phone: form.phone || null, address: form.address || null })
          .eq("id", editId);
        if (error) throw new Error(error.message);
        return;
      }

      // Create dealer
      const { data: newDealer, error: dealerErr } = await supabase
        .from("dealers")
        .insert({ name: form.name, phone: form.phone || null, address: form.address || null })
        .select("id")
        .single();
      if (dealerErr) throw new Error(dealerErr.message);

      // Create dealer_admin user if checked
      if (createAdmin) {
        if (!adminForm.name.trim()) throw new Error("Admin name is required");
        if (!adminForm.email.trim()) throw new Error("Admin email is required");
        if (adminForm.password.length < 6) throw new Error("Password must be at least 6 characters");

        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;

        const res = await supabase.functions.invoke("create-dealer-user", {
          body: {
            name: adminForm.name.trim(),
            email: adminForm.email.trim().toLowerCase(),
            password: adminForm.password,
            dealer_id: newDealer.id,
            role: "dealer_admin",
          },
        });

        if (res.error) throw new Error(res.error.message || "Failed to create admin user");
        if (res.data?.error) throw new Error(res.data.error);
      }
    },
    onSuccess: () => {
      toast({ title: editId ? "Dealer updated" : createAdmin ? "Dealer & admin user created" : "Dealer created" });
      qc.invalidateQueries({ queryKey: ["admin-dealers"] });
      qc.invalidateQueries({ queryKey: ["admin-dealer-users"] });
      closeDialog();
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Error", description: e.message });
    },
  });

  const addUserMutation = useMutation({
    mutationFn: async () => {
      if (!addUserForm.name.trim()) throw new Error("Name is required");
      if (!addUserForm.email.trim()) throw new Error("Email is required");
      if (addUserForm.password.length < 6) throw new Error("Password must be at least 6 characters");

      const res = await supabase.functions.invoke("create-dealer-user", {
        body: {
          name: addUserForm.name.trim(),
          email: addUserForm.email.trim().toLowerCase(),
          password: addUserForm.password,
          dealer_id: addUserDealerId,
          role: "dealer_admin",
        },
      });

      if (res.error) throw new Error(res.error.message || "Failed to create user");
      if (res.data?.error) throw new Error(res.data.error);
    },
    onSuccess: () => {
      toast({ title: "Dealer admin user created" });
      qc.invalidateQueries({ queryKey: ["admin-dealer-users"] });
      setAddUserOpen(false);
      setAddUserForm(emptyAdminForm);
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Error", description: e.message });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: string }) => {
      const { error } = await supabase
        .from("dealers")
        .update({ status: newStatus } as any)
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast({ title: "Dealer status updated" });
      qc.invalidateQueries({ queryKey: ["admin-dealers"] });
    },
    onError: (e: Error) => {
      toast({ variant: "destructive", title: "Error", description: e.message });
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditId(null);
    setForm(emptyDealerForm);
    setCreateAdmin(true);
    setAdminForm(emptyAdminForm);
  };

  const openCreate = () => {
    setEditId(null);
    setForm(emptyDealerForm);
    setCreateAdmin(true);
    setAdminForm(emptyAdminForm);
    setDialogOpen(true);
  };

  const openEdit = (dealer: any) => {
    setEditId(dealer.id);
    setForm({ name: dealer.name, phone: dealer.phone ?? "", address: dealer.address ?? "" });
    setCreateAdmin(false);
    setDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Dealer Management</CardTitle>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> Add Dealer
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-44">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dealers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No dealers
                    </TableCell>
                  </TableRow>
                ) : (
                  dealers.map((d: any) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell>{d.phone ?? "—"}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{d.address ?? "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={d.status === "active" ? "default" : "destructive"}
                          className="capitalize text-xs"
                        >
                          {d.status ?? "active"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEdit(d)} title="Edit">
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => {
                              setAddUserDealerId(d.id);
                              setAddUserForm(emptyAdminForm);
                              setAddUserOpen(true);
                            }}
                            title="Add user"
                          >
                            <UserPlus className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant={d.status === "active" ? "destructive" : "default"}
                            className="h-7 text-xs"
                            onClick={() =>
                              toggleStatusMutation.mutate({
                                id: d.id,
                                newStatus: d.status === "active" ? "suspended" : "active",
                              })
                            }
                            title={d.status === "active" ? "Suspend" : "Activate"}
                          >
                            {d.status === "active" ? (
                              <Ban className="h-3 w-3" />
                            ) : (
                              <CheckCircle className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Create / Edit Dealer Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Dealer" : "Create Dealer"}</DialogTitle>
            {!editId && <DialogDescription>Create a new dealer and optionally set up an admin user.</DialogDescription>}
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Dealer Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Enter dealer name" />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone number" />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address" />
            </div>

            {/* Admin user section — only on create */}
            {!editId && (
              <>
                <div className="flex items-center gap-2 pt-2 border-t">
                  <Checkbox
                    id="create-admin"
                    checked={createAdmin}
                    onCheckedChange={(v) => setCreateAdmin(v === true)}
                  />
                  <Label htmlFor="create-admin" className="cursor-pointer font-medium">
                    Create Dealer Admin User
                  </Label>
                </div>
                {createAdmin && (
                  <div className="space-y-3 pl-1 border-l-2 border-primary/20 ml-2 pt-1">
                    <div className="space-y-2">
                      <Label>Admin Name *</Label>
                      <Input
                        value={adminForm.name}
                        onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
                        placeholder="Full name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email *</Label>
                      <Input
                        type="email"
                        value={adminForm.email}
                        onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                        placeholder="admin@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Password *</Label>
                      <Input
                        type="password"
                        value={adminForm.password}
                        onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                        placeholder="Min 6 characters"
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Role: <Badge variant="secondary" className="text-xs ml-1">dealer_admin</Badge>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={() => createDealerMutation.mutate()} disabled={createDealerMutation.isPending}>
              {createDealerMutation.isPending ? "Saving…" : editId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add User to Existing Dealer Dialog */}
      <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Dealer Admin User</DialogTitle>
            <DialogDescription>Create a new dealer_admin user for this dealer.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                value={addUserForm.name}
                onChange={(e) => setAddUserForm({ ...addUserForm, name: e.target.value })}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={addUserForm.email}
                onChange={(e) => setAddUserForm({ ...addUserForm, email: e.target.value })}
                placeholder="admin@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Password *</Label>
              <Input
                type="password"
                value={addUserForm.password}
                onChange={(e) => setAddUserForm({ ...addUserForm, password: e.target.value })}
                placeholder="Min 6 characters"
              />
            </div>
            <div className="text-xs text-muted-foreground">
              Role: <Badge variant="secondary" className="text-xs ml-1">dealer_admin</Badge>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddUserOpen(false)}>Cancel</Button>
            <Button onClick={() => addUserMutation.mutate()} disabled={addUserMutation.isPending}>
              {addUserMutation.isPending ? "Creating…" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default DealerManagement;
