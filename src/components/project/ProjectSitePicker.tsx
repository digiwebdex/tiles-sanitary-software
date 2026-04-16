import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { projectService } from "@/services/projectService";
import { ProjectFormDialog } from "@/components/project/ProjectFormDialog";
import { SiteFormDialog } from "@/components/project/SiteFormDialog";

interface Props {
  dealerId: string;
  customerId: string | null | undefined;
  projectId: string | null | undefined;
  siteId: string | null | undefined;
  onChange: (next: { projectId: string | null; siteId: string | null }) => void;
  disabled?: boolean;
  /** Compact rendering (single row, no labels) */
  compact?: boolean;
}

const NONE = "__none";

/**
 * Reusable Project + Site picker.
 * - Both are optional.
 * - Project list filtered to active projects of the selected customer.
 * - Site list filtered to active sites of the selected project.
 * - Quick-add dialogs for both.
 */
export function ProjectSitePicker({
  dealerId,
  customerId,
  projectId,
  siteId,
  onChange,
  disabled,
  compact,
}: Props) {
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [siteDialogOpen, setSiteDialogOpen] = useState(false);

  const projectsQ = useQuery({
    queryKey: ["projects-picker", dealerId, customerId ?? null],
    queryFn: () => projectService.listForPicker(dealerId, customerId ?? null),
    enabled: !!dealerId && !!customerId,
  });
  const sitesQ = useQuery({
    queryKey: ["sites-picker", dealerId, projectId ?? null],
    queryFn: () => projectService.listSitesForPicker(dealerId, projectId!),
    enabled: !!dealerId && !!projectId,
  });

  const projects = projectsQ.data ?? [];
  const sites = sitesQ.data ?? [];

  // Auto-clear stale project/site when customer changes and selection no longer valid
  useEffect(() => {
    if (!customerId && (projectId || siteId)) {
      onChange({ projectId: null, siteId: null });
    }
  }, [customerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear site if project changes and site no longer belongs
  useEffect(() => {
    if (siteId && projectId && sites.length && !sites.some((s) => s.id === siteId)) {
      onChange({ projectId: projectId ?? null, siteId: null });
    }
  }, [projectId, sites]); // eslint-disable-line react-hooks/exhaustive-deps

  const noCustomer = !customerId;

  return (
    <>
      <div className={compact ? "grid grid-cols-2 gap-2" : "grid md:grid-cols-2 gap-4"}>
        <div>
          {!compact && <Label>Project (optional)</Label>}
          <div className="flex gap-1">
            <Select
              value={projectId ?? NONE}
              onValueChange={(v) => onChange({ projectId: v === NONE ? null : v, siteId: null })}
              disabled={disabled || noCustomer}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={noCustomer ? "Pick customer first" : "No project"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No project</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.project_code} · {p.project_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={disabled || noCustomer}
              onClick={() => setProjectDialogOpen(true)}
              title="New project"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div>
          {!compact && <Label>Site (optional)</Label>}
          <div className="flex gap-1">
            <Select
              value={siteId ?? NONE}
              onValueChange={(v) => onChange({ projectId: projectId ?? null, siteId: v === NONE ? null : v })}
              disabled={disabled || !projectId}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder={!projectId ? "Pick project first" : "No site"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No site</SelectItem>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.site_name}
                    {s.address ? ` · ${s.address.slice(0, 30)}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={disabled || !projectId}
              onClick={() => setSiteDialogOpen(true)}
              title="New site"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {customerId && (
        <ProjectFormDialog
          open={projectDialogOpen}
          onOpenChange={setProjectDialogOpen}
          dealerId={dealerId}
          defaultCustomerId={customerId}
          onCreated={(p) => {
            projectsQ.refetch();
            onChange({ projectId: p.id, siteId: null });
          }}
        />
      )}
      {customerId && projectId && (
        <SiteFormDialog
          open={siteDialogOpen}
          onOpenChange={setSiteDialogOpen}
          dealerId={dealerId}
          projectId={projectId}
          customerId={customerId}
          onCreated={(s) => {
            sitesQ.refetch();
            onChange({ projectId: projectId ?? null, siteId: s.id });
          }}
        />
      )}
    </>
  );
}

export default ProjectSitePicker;
