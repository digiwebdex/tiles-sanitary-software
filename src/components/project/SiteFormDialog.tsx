import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { projectService, type ProjectSite, type SiteStatus } from "@/services/projectService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealerId: string;
  projectId: string;
  customerId: string;
  initial?: ProjectSite | null;
  onCreated?: (s: ProjectSite) => void;
  onUpdated?: (s: ProjectSite) => void;
}

export function SiteFormDialog({
  open, onOpenChange, dealerId, projectId, customerId, initial, onCreated, onUpdated,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isEdit = !!initial;

  const [siteName, setSiteName] = useState("");
  const [address, setAddress] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [status, setStatus] = useState<SiteStatus>("active");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setSiteName(initial.site_name);
      setAddress(initial.address ?? "");
      setContactPerson(initial.contact_person ?? "");
      setContactPhone(initial.contact_phone ?? "");
      setStatus(initial.status);
      setNotes(initial.notes ?? "");
    } else {
      setSiteName("");
      setAddress("");
      setContactPerson("");
      setContactPhone("");
      setStatus("active");
      setNotes("");
    }
  }, [open, initial]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!siteName.trim()) throw new Error("Site name is required");
      if (isEdit) {
        return await projectService.updateSite(initial!.id, dealerId, {
          site_name: siteName,
          address,
          contact_person: contactPerson,
          contact_phone: contactPhone,
          status,
          notes,
        });
      }
      return await projectService.createSite(dealerId, user?.id ?? null, {
        project_id: projectId,
        customer_id: customerId,
        site_name: siteName,
        address,
        contact_person: contactPerson,
        contact_phone: contactPhone,
        status,
        notes,
      });
    },
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ["sites"] });
      qc.invalidateQueries({ queryKey: ["sites-picker"] });
      toast.success(isEdit ? "Site updated" : "Site added");
      onOpenChange(false);
      if (isEdit) onUpdated?.(s);
      else onCreated?.(s);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Site" : "New Delivery Site"}</DialogTitle>
          <DialogDescription>
            A specific delivery location under this project.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Site Name</Label>
            <Input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="e.g. Block A — Floor 3" />
          </div>
          <div>
            <Label>Site Address</Label>
            <Textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="Delivery address" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Contact Person</Label>
              <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="Site engineer / supervisor" />
            </div>
            <div>
              <Label>Contact Phone</Label>
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="01XXXXXXXXX" />
            </div>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as SiteStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional notes" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? "Saving…" : isEdit ? "Update" : "Add Site"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SiteFormDialog;
