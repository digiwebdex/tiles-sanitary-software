import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { customerService } from "@/services/customerService";
import {
  projectService,
  type Project,
  type ProjectStatus,
} from "@/services/projectService";
import { RefreshCw } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealerId: string;
  defaultCustomerId?: string | null;
  initial?: Project | null;
  onCreated?: (p: Project) => void;
  onUpdated?: (p: Project) => void;
}

export function ProjectFormDialog({
  open, onOpenChange, dealerId, defaultCustomerId, initial, onCreated, onUpdated,
}: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const isEdit = !!initial;

  const [customerId, setCustomerId] = useState<string>("");
  const [projectName, setProjectName] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [startDate, setStartDate] = useState("");
  const [expectedEndDate, setExpectedEndDate] = useState("");
  const [notes, setNotes] = useState("");

  const customersQ = useQuery({
    queryKey: ["customers-for-projects", dealerId],
    queryFn: () => customerService.list(dealerId, "", "", 1),
    enabled: open && !!dealerId,
  });
  const customers = customersQ.data?.data ?? [];

  // Init form on open
  useEffect(() => {
    if (!open) return;
    if (initial) {
      setCustomerId(initial.customer_id);
      setProjectName(initial.project_name);
      setProjectCode(initial.project_code);
      setStatus(initial.status);
      setStartDate(initial.start_date ?? "");
      setExpectedEndDate(initial.expected_end_date ?? "");
      setNotes(initial.notes ?? "");
    } else {
      setCustomerId(defaultCustomerId ?? "");
      setProjectName("");
      setStatus("active");
      setStartDate("");
      setExpectedEndDate("");
      setNotes("");
      // Pre-fill auto code
      projectService.getNextProjectCode(dealerId).then(setProjectCode).catch(() => setProjectCode(""));
    }
  }, [open, initial, defaultCustomerId, dealerId]);

  const refreshCode = async () => {
    try {
      const code = await projectService.getNextProjectCode(dealerId);
      setProjectCode(code);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!customerId) throw new Error("Customer is required");
      if (!projectName.trim()) throw new Error("Project name is required");
      if (isEdit) {
        return await projectService.update(initial!.id, dealerId, {
          customer_id: customerId,
          project_name: projectName,
          project_code: projectCode,
          status,
          notes,
          start_date: startDate || null,
          expected_end_date: expectedEndDate || null,
        });
      }
      return await projectService.create(dealerId, user?.id ?? null, {
        customer_id: customerId,
        project_name: projectName,
        project_code: projectCode,
        status,
        notes,
        start_date: startDate || null,
        expected_end_date: expectedEndDate || null,
      });
    },
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["projects-picker"] });
      toast.success(isEdit ? "Project updated" : "Project created");
      onOpenChange(false);
      if (isEdit) onUpdated?.(p);
      else onCreated?.(p);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Project" : "New Project"}</DialogTitle>
          <DialogDescription>
            Group quotations and sales for one job under a customer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Customer</Label>
            <Select value={customerId} onValueChange={setCustomerId} disabled={isEdit}>
              <SelectTrigger>
                <SelectValue placeholder="Pick customer" />
              </SelectTrigger>
              <SelectContent>
                {customers.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}{c.phone ? ` · ${c.phone}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Project Name</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g. Dhanmondi Tower" />
            </div>
            <div>
              <Label>Project Code</Label>
              <div className="flex gap-1">
                <Input value={projectCode} onChange={(e) => setProjectCode(e.target.value)} placeholder="PRJ-0001" />
                {!isEdit && (
                  <Button type="button" variant="outline" size="icon" onClick={refreshCode} title="Regenerate code">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_hold">On hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label>Expected End</Label>
              <Input type="date" value={expectedEndDate} onChange={(e) => setExpectedEndDate(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Optional notes" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? "Saving…" : isEdit ? "Update" : "Create Project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ProjectFormDialog;
